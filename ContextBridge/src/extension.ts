import * as vscode from 'vscode';
import fetch from 'node-fetch';
import * as http from 'http';

const EVENT_ENDPOINT = 'http://localhost:3000/event';
const NOTIFY_PORT = 3100;

interface ActivityEvent {
    source: "vscode";
    event: string;
    file?: string;
    language?: string;
    workspace?: string;
    timestamp: string;
}

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel("ContextBridge");
    outputChannel.appendLine("ContextBridge extension activated.");

    const eventSender = new EventSender(outputChannel);
    const eventTracker = new EventTracker(eventSender);

    // Track workspace initialized
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || "Unknown";
    eventTracker.trackEvent("workspace_opened", undefined, undefined, workspaceName);

    // Track active editor changed
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                eventTracker.trackEvent(
                    "active_editor_changed",
                    editor.document.fileName,
                    editor.document.languageId,
                    vscode.workspace.getWorkspaceFolder(editor.document.uri)?.name
                );
            }
        })
    );

    // Track typing with simple debounce
    let typingDebounceTimer: NodeJS.Timeout | null = null;
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            if (typingDebounceTimer) {
                clearTimeout(typingDebounceTimer);
            }
            typingDebounceTimer = setTimeout(() => {
                eventTracker.trackEvent(
                    "typing_activity",
                    e.document.fileName,
                    e.document.languageId,
                    vscode.workspace.getWorkspaceFolder(e.document.uri)?.name
                );
            }, 1000); // 1 second debounce
        })
    );

    // Track file saved
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            eventTracker.trackEvent(
                "file_saved",
                doc.fileName,
                doc.languageId,
                vscode.workspace.getWorkspaceFolder(doc.uri)?.name
            );
        })
    );

    // Track debugging
    context.subscriptions.push(
        vscode.debug.onDidStartDebugSession(() => {
            eventTracker.trackEvent("debugging_started");
        }),
        vscode.debug.onDidTerminateDebugSession(() => {
            eventTracker.trackEvent("debugging_stopped");
        })
    );

    // Track terminal
    context.subscriptions.push(
        vscode.window.onDidOpenTerminal(() => {
            eventTracker.trackEvent("terminal_opened");
        })
    );

    // Heartbeat
    const heartbeatTimer = setInterval(() => {
        eventTracker.trackEvent("session_heartbeat");
    }, 60000);
    context.subscriptions.push({ dispose: () => clearInterval(heartbeatTimer) });

    // Git tracking (Optional, best effort)
    const gitExtension = vscode.extensions.getExtension<any>('vscode.git');
    if (gitExtension) {
        gitExtension.activate().then(api => {
            const gitApi = api.getAPI(1);
            if (!gitApi) return;

            const setupRepo = (repo: any) => {
                context.subscriptions.push(
                    repo.repository.onDidCommit(() => {
                        eventTracker.trackEvent("git_commit_detected");
                    })
                );
            };

            // Handle current repositories
            gitApi.repositories.forEach(setupRepo);

            // Handle future repositories
            context.subscriptions.push(
                gitApi.onDidOpenRepository(setupRepo)
            );
        }, (err: any) => {
            outputChannel.appendLine(`Git tracking error: ${err.message}`);
        });
    }

    // Ping command for manual testing
    context.subscriptions.push(
        vscode.commands.registerCommand('contextBridge.ping', () => {
             eventTracker.trackEvent("ping");
             vscode.window.showInformationMessage("Pinged ContextBridge EventServer.");
        })
    );

    // Local Http Server for notifications (`/notify`)
    const server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/notify') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const payload = JSON.parse(body);
                    if (payload.message) {
                        vscode.window.showInformationMessage(`ContextBridge: ${payload.message}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing message field' }));
                    }
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                }
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });

    server.listen(NOTIFY_PORT, '127.0.0.1', () => {
        outputChannel.appendLine(`Notification listener started on http://localhost:${NOTIFY_PORT}/notify`);
    });

    context.subscriptions.push({
        dispose: () => {
            server.close();
        }
    });
}

export function deactivate() {}

class EventTracker {
    constructor(private sender: EventSender) {}

    trackEvent(eventName: string, file?: string, language?: string, workspace?: string) {
        const payload: ActivityEvent = {
            source: "vscode",
            event: eventName,
            timestamp: new Date().toISOString()
        };
        if (file) payload.file = file;
        if (language) payload.language = language;
        if (workspace) payload.workspace = workspace;

        this.sender.queueEvent(payload);
    }
}

class EventSender {
    private queue: ActivityEvent[] = [];
    private sending: boolean = false;

    constructor(private outputChannel: vscode.OutputChannel) {}

    queueEvent(event: ActivityEvent) {
        this.queue.push(event);
        this.processQueue();
    }

    private async processQueue() {
        if (this.sending || this.queue.length === 0) return;
        this.sending = true;

        const event = this.queue[0]; // Peek at the front
        
        try {
            const res = await fetch(EVENT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
                timeout: 5000 // node-fetch v2 supports timeout in options
            });

            if (res.ok) {
                // Success, remove from queue
                this.queue.shift();
                this.outputChannel.appendLine(`[SENT] ${event.event} at ${event.timestamp}`);
                
                // If more left, process next immediately
                this.sending = false;
                if (this.queue.length > 0) {
                    setImmediate(() => this.processQueue());
                }
                return;
            } else {
                throw new Error(`Server returned ${res.status}`);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`[FAILED] Failed to send ${event.event}: ${error.message}. Retrying in 5 seconds...`);
            // Wait 5 seconds before allowing another attempt
            setTimeout(() => {
                this.sending = false;
                this.processQueue();
            }, 5000);
        } finally {
            // No-op, handled above to control timing
        }
    }
}
