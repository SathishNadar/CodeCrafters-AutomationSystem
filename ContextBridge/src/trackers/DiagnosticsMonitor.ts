import * as vscode from 'vscode';
import { ActivityEvent, EventSender } from '../extension';

export class DiagnosticsMonitor {
    private lastErrorCount: number = -1;
    private lastWarningCount: number = -1;
    private pollTimer: NodeJS.Timeout;

    constructor(
        private sender: EventSender,
        private context: vscode.ExtensionContext
    ) {
        // Poll every 30 seconds
        this.pollTimer = setInterval(() => this.poll(), 30000);
        this.context.subscriptions.push({ dispose: () => clearInterval(this.pollTimer) });
    }

    private poll() {
        const activeEditor = vscode.window.activeTextEditor;
        const allDiagnostics = vscode.languages.getDiagnostics();

        let errorCount = 0;
        let warningCount = 0;

        allDiagnostics.forEach(([, diags]) => {
            diags.forEach(d => {
                if (d.severity === vscode.DiagnosticSeverity.Error) errorCount++;
                else if (d.severity === vscode.DiagnosticSeverity.Warning) warningCount++;
            });
        });

        // Only emit if changed
        if (errorCount === this.lastErrorCount && warningCount === this.lastWarningCount) return;

        this.lastErrorCount = errorCount;
        this.lastWarningCount = warningCount;

        const event: ActivityEvent = {
            source: 'vscode',
            event: 'diagnostics_snapshot',
            timestamp: new Date().toISOString(),
            language: activeEditor?.document.languageId,
            error_count: errorCount,
            warning_count: warningCount
        };

        this.sender.queueEvent(event);
    }
}
