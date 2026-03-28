"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditorSwitchMonitor = void 0;
const vscode = require("vscode");
class EditorSwitchMonitor {
    constructor(sender, context) {
        this.sender = sender;
        this.context = context;
        this.switchCount = 0;
        this.context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => this.onEditorChange(editor)));
        // Emit switch velocity every 60 seconds
        this.windowTimer = setInterval(() => this.flush(), 60000);
        this.context.subscriptions.push({ dispose: () => clearInterval(this.windowTimer) });
    }
    onEditorChange(editor) {
        if (!editor)
            return;
        const newFile = editor.document.fileName;
        // Don't count if same file re-focused
        if (newFile === this.lastFile)
            return;
        this.switchCount++;
        this.lastFile = newFile;
        this.currentLanguage = editor.document.languageId;
    }
    flush() {
        if (this.switchCount === 0)
            return;
        const event = {
            source: 'vscode',
            event: 'editor_switch_velocity',
            timestamp: new Date().toISOString(),
            language: this.currentLanguage,
            switch_count: this.switchCount
        };
        this.sender.queueEvent(event);
        this.switchCount = 0;
    }
}
exports.EditorSwitchMonitor = EditorSwitchMonitor;
//# sourceMappingURL=EditorSwitchMonitor.js.map