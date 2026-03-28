"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventSender = void 0;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const node_fetch_1 = require("node-fetch");
const http = require("http");
const TypingBurstTracker_1 = require("./trackers/TypingBurstTracker");
const EditorSwitchMonitor_1 = require("./trackers/EditorSwitchMonitor");
const IdleDetector_1 = require("./trackers/IdleDetector");
const DiagnosticsMonitor_1 = require("./trackers/DiagnosticsMonitor");
const FocusStateEngine_1 = require("./trackers/FocusStateEngine");
const EVENT_ENDPOINT = 'http://localhost:3000/event';
const NOTIFY_PORT = 3100;
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel('ContextBridge');
    outputChannel.appendLine('ContextBridge v2 activated — Smart Signal Mode.');
    const eventSender = new EventSender(outputChannel);
    const focusEngine = new FocusStateEngine_1.FocusStateEngine(eventSender, outputChannel);
    // Intercept all outgoing events so FocusStateEngine can observe them
    const wrappedSender = {
        queueEvent: (event) => {
            focusEngine.ingestEvent(event);
            eventSender.queueEvent(event);
        }
    };
    // --- Smart Tracker Initialization ---
    new TypingBurstTracker_1.TypingBurstTracker(wrappedSender, context);
    new EditorSwitchMonitor_1.EditorSwitchMonitor(wrappedSender, context);
    new IdleDetector_1.IdleDetector(wrappedSender, context);
    new DiagnosticsMonitor_1.DiagnosticsMonitor(wrappedSender, context);
    // --- Session Started ---
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? 'Unknown';
    eventSender.queueEvent({
        source: 'vscode',
        event: 'session_started',
        workspace: workspaceName,
        timestamp: new Date().toISOString()
    });
    // --- File Saved (kept — high value) ---
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
        const event = {
            source: 'vscode',
            event: 'file_saved',
            file: doc.fileName,
            language: doc.languageId,
            workspace: vscode.workspace.getWorkspaceFolder(doc.uri)?.name,
            timestamp: new Date().toISOString()
        };
        wrappedSender.queueEvent(event);
    }));
    // --- Debugging (kept — high value) ---
    context.subscriptions.push(vscode.debug.onDidStartDebugSession(() => {
        wrappedSender.queueEvent({ source: 'vscode', event: 'debugging_started', timestamp: new Date().toISOString() });
    }), vscode.debug.onDidTerminateDebugSession(() => {
        wrappedSender.queueEvent({ source: 'vscode', event: 'debugging_stopped', timestamp: new Date().toISOString() });
    }));
    // --- Git Commits (kept — best signal) ---
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (gitExtension) {
        gitExtension.activate().then(api => {
            const gitApi = api.getAPI(1);
            if (!gitApi)
                return;
            const setupRepo = (repo) => {
                context.subscriptions.push(repo.repository.onDidCommit(() => {
                    wrappedSender.queueEvent({ source: 'vscode', event: 'git_commit_detected', timestamp: new Date().toISOString() });
                }));
            };
            gitApi.repositories.forEach(setupRepo);
            context.subscriptions.push(gitApi.onDidOpenRepository(setupRepo));
        }, (err) => {
            outputChannel.appendLine(`Git tracking error: ${err.message}`);
        });
    }
    // --- Ping Command ---
    context.subscriptions.push(vscode.commands.registerCommand('contextBridge.ping', () => {
        wrappedSender.queueEvent({ source: 'vscode', event: 'ping', timestamp: new Date().toISOString() });
        vscode.window.showInformationMessage('ContextBridge: Ping sent to dashboard.');
    }));
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
                    }
                    else {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Missing message field' }));
                    }
                }
                catch {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
        }
        else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });
    server.listen(NOTIFY_PORT, '127.0.0.1', () => {
        outputChannel.appendLine(`Notify listener ready on http://localhost:${NOTIFY_PORT}/notify`);
    });
    context.subscriptions.push({ dispose: () => server.close() });
}
function deactivate() { }
// --- EventSender with retry queue ---
class EventSender {
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
        this.queue = [];
        this.sending = false;
    }
    queueEvent(event) {
        this.queue.push(event);
        this.processQueue();
    }
    async processQueue() {
        if (this.sending || this.queue.length === 0)
            return;
        this.sending = true;
        const event = this.queue[0];
        try {
            const res = await (0, node_fetch_1.default)(EVENT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
                timeout: 5000
            });
            if (res.ok) {
                this.queue.shift();
                this.outputChannel.appendLine(`[SENT] ${event.event} at ${event.timestamp}`);
                this.sending = false;
                if (this.queue.length > 0)
                    setImmediate(() => this.processQueue());
                return;
            }
            else {
                throw new Error(`HTTP ${res.status}`);
            }
        }
        catch (error) {
            this.outputChannel.appendLine(`[FAILED] ${event.event}: ${error.message}. Retrying in 5s...`);
            setTimeout(() => {
                this.sending = false;
                this.processQueue();
            }, 5000);
        }
    }
}
exports.EventSender = EventSender;
//# sourceMappingURL=extension.js.map