"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticsMonitor = void 0;
const vscode = require("vscode");
class DiagnosticsMonitor {
    constructor(sender, context) {
        this.sender = sender;
        this.context = context;
        this.lastErrorCount = -1;
        this.lastWarningCount = -1;
        // Poll every 30 seconds
        this.pollTimer = setInterval(() => this.poll(), 30000);
        this.context.subscriptions.push({ dispose: () => clearInterval(this.pollTimer) });
    }
    poll() {
        const activeEditor = vscode.window.activeTextEditor;
        const allDiagnostics = vscode.languages.getDiagnostics();
        let errorCount = 0;
        let warningCount = 0;
        allDiagnostics.forEach(([, diags]) => {
            diags.forEach(d => {
                if (d.severity === vscode.DiagnosticSeverity.Error)
                    errorCount++;
                else if (d.severity === vscode.DiagnosticSeverity.Warning)
                    warningCount++;
            });
        });
        // Only emit if changed
        if (errorCount === this.lastErrorCount && warningCount === this.lastWarningCount)
            return;
        this.lastErrorCount = errorCount;
        this.lastWarningCount = warningCount;
        const event = {
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
exports.DiagnosticsMonitor = DiagnosticsMonitor;
//# sourceMappingURL=DiagnosticsMonitor.js.map