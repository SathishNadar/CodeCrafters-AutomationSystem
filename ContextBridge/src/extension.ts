import * as vscode from 'vscode';
import fetch from 'node-fetch';
import * as http from 'http';

import { TypingBurstTracker } from './trackers/TypingBurstTracker';
import { EditorSwitchMonitor } from './trackers/EditorSwitchMonitor';
import { IdleDetector } from './trackers/IdleDetector';
import { DiagnosticsMonitor } from './trackers/DiagnosticsMonitor';
import { FocusStateEngine } from './trackers/FocusStateEngine';

const EVENT_ENDPOINT = 'http://localhost:3000/event';
const NOTIFY_PORT = 3100;

// Exported so tracker files can import the type
export interface ActivityEvent {
    source: 'vscode';
    event: string;
    file?: string;
    language?: string;
    workspace?: string;
    timestamp: string;
    // Smart signal fields
    duration_seconds?: number;
    char_count?: number;
    switch_count?: number;
    error_count?: number;
    warning_count?: number;
    from_state?: string;
    to_state?: string;
    focus_minutes?: number;
    saves?: number;
    commits?: number;
}

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('ContextBridge');
    outputChannel.appendLine('ContextBridge v2 activated — Smart Signal Mode.');

    const eventSender = new EventSender(outputChannel);
    const focusEngine = new FocusStateEngine(eventSender, outputChannel);

    // Intercept all outgoing events so FocusStateEngine can observe them
    const wrappedSender: EventSender = {
        queueEvent: (event: ActivityEvent) => {
            focusEngine.ingestEvent(event);
            eventSender.queueEvent(event);
        }
    } as any;

    // --- Smart Tracker Initialization ---
    new TypingBurstTracker(wrappedSender, context);
    new EditorSwitchMonitor(wrappedSender, context);
    new IdleDetector(wrappedSender, context);
    new DiagnosticsMonitor(wrappedSender, context);

    // --- Session Started ---
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? 'Unknown';
    eventSender.queueEvent({
        source: 'vscode',
        event: 'session_started',
        workspace: workspaceName,
        timestamp: new Date().toISOString()
    });

    // --- File Saved (kept — high value) ---
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            const event: ActivityEvent = {
                source: 'vscode',
                event: 'file_saved',
                file: doc.fileName,
                language: doc.languageId,
                workspace: vscode.workspace.getWorkspaceFolder(doc.uri)?.name,
                timestamp: new Date().toISOString()
            };
            wrappedSender.queueEvent(event);
        })
    );

    // --- Debugging (kept — high value) ---
    context.subscriptions.push(
        vscode.debug.onDidStartDebugSession(() => {
            wrappedSender.queueEvent({ source: 'vscode', event: 'debugging_started', timestamp: new Date().toISOString() });
        }),
        vscode.debug.onDidTerminateDebugSession(() => {
            wrappedSender.queueEvent({ source: 'vscode', event: 'debugging_stopped', timestamp: new Date().toISOString() });
        })
    );

    // --- Git Commits (kept — best signal) ---
    const gitExtension = vscode.extensions.getExtension<any>('vscode.git');
    if (gitExtension) {
        gitExtension.activate().then(api => {
            const gitApi = api.getAPI(1);
            if (!gitApi) return;

            const setupRepo = (repo: any) => {
                context.subscriptions.push(
                    repo.repository.onDidCommit(() => {
                        wrappedSender.queueEvent({ source: 'vscode', event: 'git_commit_detected', timestamp: new Date().toISOString() });
                    })
                );
            };

            gitApi.repositories.forEach(setupRepo);
            context.subscriptions.push(gitApi.onDidOpenRepository(setupRepo));
        }, (err: any) => {
            outputChannel.appendLine(`Git tracking error: ${err.message}`);
        });
    }

    // --- Ping Command ---
    context.subscriptions.push(
        vscode.commands.registerCommand('contextBridge.ping', () => {
            wrappedSender.queueEvent({ source: 'vscode', event: 'ping', timestamp: new Date().toISOString() });
            vscode.window.showInformationMessage('ContextBridge: Ping sent to dashboard.');
        })
    );

    // --- Local Notify Server (Port 3100) ---
    const server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/notify') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    const payload = JSON.parse(body);
                    if (payload.message) {
                        vscode.window.showInformationMessage(`ContextBridge: ${payload.message}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    } else {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Missing message field' }));
                    }
                } catch {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    server.listen(NOTIFY_PORT, '127.0.0.1', () => {
        outputChannel.appendLine(`Notify listener ready on http://localhost:${NOTIFY_PORT}/notify`);
    });

    context.subscriptions.push({ dispose: () => server.close() });
}

export function deactivate() {}

// --- EventSender with retry queue ---
export class EventSender {
    private queue: ActivityEvent[] = [];
    private sending = false;

    constructor(private outputChannel: vscode.OutputChannel) {}

    queueEvent(event: ActivityEvent) {
        this.queue.push(event);
        this.processQueue();
    }

    private async processQueue() {
        if (this.sending || this.queue.length === 0) return;
        this.sending = true;

        const event = this.queue[0];

        try {
            const res = await fetch(EVENT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
                timeout: 5000
            });

            if (res.ok) {
                this.queue.shift();
                this.outputChannel.appendLine(`[SENT] ${event.event} at ${event.timestamp}`);
                this.sending = false;
                if (this.queue.length > 0) setImmediate(() => this.processQueue());
                return;
            } else {
                throw new Error(`HTTP ${res.status}`);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`[FAILED] ${event.event}: ${error.message}. Retrying in 5s...`);
            setTimeout(() => {
                this.sending = false;
                this.processQueue();
            }, 5000);
        }
    }
}
