import * as vscode from 'vscode';
import { ActivityEvent, EventSender } from '../extension';

export class EditorSwitchMonitor {
    private switchCount: number = 0;
    private windowTimer: NodeJS.Timeout;
    private lastFile: string | undefined;
    private currentLanguage: string | undefined;

    constructor(
        private sender: EventSender,
        private context: vscode.ExtensionContext
    ) {
        this.context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => this.onEditorChange(editor))
        );

        // Emit switch velocity every 60 seconds
        this.windowTimer = setInterval(() => this.flush(), 60000);
        this.context.subscriptions.push({ dispose: () => clearInterval(this.windowTimer) });
    }

    private onEditorChange(editor: vscode.TextEditor | undefined) {
        if (!editor) return;
        const newFile = editor.document.fileName;

        // Don't count if same file re-focused
        if (newFile === this.lastFile) return;

        this.switchCount++;
        this.lastFile = newFile;
        this.currentLanguage = editor.document.languageId;
    }

    flush() {
        if (this.switchCount === 0) return;

        const event: ActivityEvent = {
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
