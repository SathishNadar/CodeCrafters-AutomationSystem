"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdleDetector = void 0;
const vscode = require("vscode");
const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
class IdleDetector {
    constructor(sender, context) {
        this.sender = sender;
        this.context = context;
        this.idleTimer = null;
        this.idleStartTime = null;
        this.isIdle = false;
        this.resetTimer();
        // Reset on any VS Code activity
        const reset = () => this.resetTimer();
        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(reset), vscode.window.onDidChangeActiveTextEditor(reset), vscode.workspace.onDidSaveTextDocument(reset), vscode.debug.onDidStartDebugSession(reset), vscode.window.onDidOpenTerminal(reset));
    }
    resetTimer() {
        // If returning from idle, emit user_returned
        if (this.isIdle && this.idleStartTime !== null) {
            const idleDuration = Math.round((Date.now() - this.idleStartTime) / 1000);
            const event = {
                source: 'vscode',
                event: 'user_returned',
                timestamp: new Date().toISOString(),
                duration_seconds: idleDuration
            };
            this.sender.queueEvent(event);
            this.isIdle = false;
            this.idleStartTime = null;
        }
        if (this.idleTimer)
            clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => this.onIdle(), IDLE_THRESHOLD_MS);
    }
    onIdle() {
        this.isIdle = true;
        this.idleStartTime = Date.now();
        const event = {
            source: 'vscode',
            event: 'user_idle',
            timestamp: new Date().toISOString()
        };
        this.sender.queueEvent(event);
    }
}
exports.IdleDetector = IdleDetector;
//# sourceMappingURL=IdleDetector.js.map