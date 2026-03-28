"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypingBurstTracker = void 0;
const vscode = require("vscode");
class TypingBurstTracker {
    constructor(sender, context) {
        this.sender = sender;
        this.context = context;
        this.debounceTimer = null;
        this.burstStartTime = null;
        this.charCount = 0;
        this.context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChange(e)));
    }
    onDocumentChange(e) {
        // Ignore empty changes (like formatting markers)
        if (e.contentChanges.length === 0)
            return;
        const totalChars = e.contentChanges.reduce((sum, c) => sum + c.text.length, 0);
        if (totalChars === 0)
            return; // deletions only, skip
        if (!this.burstStartTime) {
            this.burstStartTime = Date.now();
        }
        this.charCount += totalChars;
        this.currentFile = e.document.fileName;
        this.currentLanguage = e.document.languageId;
        this.currentWorkspace = vscode.workspace.getWorkspaceFolder(e.document.uri)?.name;
        // Reset 5s stop timer
        if (this.debounceTimer)
            clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.flush(), 5000);
    }
    flush() {
        if (!this.burstStartTime || this.charCount === 0)
            return;
        const durationSeconds = Math.round((Date.now() - this.burstStartTime) / 1000);
        const event = {
            source: 'vscode',
            event: 'typing_burst',
            timestamp: new Date().toISOString(),
            file: this.currentFile,
            language: this.currentLanguage,
            workspace: this.currentWorkspace,
            duration_seconds: durationSeconds,
            char_count: this.charCount
        };
        this.sender.queueEvent(event);
        // Reset
        this.burstStartTime = null;
        this.charCount = 0;
    }
}
exports.TypingBurstTracker = TypingBurstTracker;
//# sourceMappingURL=TypingBurstTracker.js.map