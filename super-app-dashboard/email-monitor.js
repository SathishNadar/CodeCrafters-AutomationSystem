const axios = require('axios');
const path = require('path');
const { ipcMain } = require('electron');

const VSCODE_NOTIFY_URL = 'http://localhost:3100/notify';

let _ipcRegistered = false;

function initEmailMonitor(mainWindow, attentionPolicyManager) {
    let forceSync = null;
    let sendEmailReply = null;
    let restartEmailMonitor = null;
    let monitorReady = false;

    const emitInboxNotification = (email, analysis) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('new-email-notification', {
                email,
                analysis,
                timestamp: new Date().toISOString(),
            });
        }
    };

    const onAnalysis = async (email, analysis) => {
        const { priority, task, sender } = analysis;

        const rulesEngine = require('./rules-engine');
        const ctx = rulesEngine.getContext();

        // --- RULE 3: Focused Auto-Responder ---
        if (rulesEngine.isRuleActive('rule_focus_reply') && ctx.isFocused && priority === 'Low') {
            if (sendEmailReply) {
                try {
                    const replyContent =
                        "Automatic Reply:\nI am currently deep in a coding task and will review this email later.";
                    await sendEmailReply(
                        email.from,
                        `Re: ${email.subject}`,
                        replyContent,
                        email.threadId,
                        email.messageId
                    );
                    console.log(`[EmailMonitorBridge] Auto-replied to ${email.from}`);
                } catch (e) {
                    console.error('[EmailMonitorBridge] Failed focus reply:', e.message);
                }
            }
        }

        // --- RULE 4: Urgent Escalation Alarm ---
        if (rulesEngine.isRuleActive('rule_urgent_alarm') && ctx.isIdle && priority === 'Urgent') {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('trigger-urgent-alarm', {
                    sender: sender || email.from,
                    task,
                    source: 'Email',
                });
            }
        }

        // --- COMBINED PRIORITY LOGIC ---
        let shouldPingVscode = false;

        // Rules Engine logic
        if (rulesEngine.isRuleActive('rule_deep_work')) {
            shouldPingVscode = (priority === 'High' || priority === 'Urgent');
        } else {
            shouldPingVscode = (priority === 'High' || priority === 'Urgent' || priority === 'Medium');
        }

        // Attention Policy (final filter)
        if (shouldPingVscode && attentionPolicyManager) {
            shouldPingVscode = attentionPolicyManager.shouldAllowInterrupt(priority);
        }

        // Send notification to VS Code
        if (shouldPingVscode) {
            try {
                const message = `[${priority}] ${task} - from ${sender || email.from}`;
                await axios.post(VSCODE_NOTIFY_URL, { message });
                console.log(`[EmailMonitorBridge] VS Code Alert Sent: "${task}"`);
            } catch (err) {
                console.warn('[EmailMonitorBridge] VS Code notification skipped');
            }
        }

        // ALWAYS send to dashboard
        emitInboxNotification(email, analysis);
    };

    try {
        const emailServicePath = path.join(__dirname, '..', 'email-notifier-service', 'main.js');
        const emailService = require(emailServicePath);

        forceSync = emailService.forceSync ?? null;
        sendEmailReply = emailService.sendEmailReply ?? null;
        restartEmailMonitor = emailService.restartEmailMonitor ?? null;

        console.log('[EmailMonitorBridge] Initializing Email Monitor Service...');
        emailService.startEmailMonitor(onAnalysis);

        monitorReady = true;
    } catch (err) {
        console.error('[EmailMonitorBridge] Critical bridge error:', err.message);
    }

    // Register IPC handlers ONLY ONCE
    if (!_ipcRegistered) {
        _ipcRegistered = true;

        // Force sync
        ipcMain.handle('force-email-sync', async () => {
            if (!monitorReady || !forceSync) {
                return { success: false, error: 'Email monitor is not ready yet.' };
            }

            console.log('[EmailMonitorBridge] IPC: Force email sync requested');
            await forceSync();
            return { success: true };
        });

        // Send reply
        ipcMain.handle('send-email-reply', async (_, payload) => {
            if (!monitorReady || !sendEmailReply) {
                return {
                    success: false,
                    error: 'Email reply unavailable. Gmail not connected.',
                };
            }

            try {
                await sendEmailReply(
                    payload.to,
                    payload.subject,
                    payload.content,
                    payload.threadId,
                    payload.messageId
                );
                return { success: true };
            } catch (e) {
                console.error('[EmailMonitorBridge] Error sending reply:', e.message);
                return { success: false, error: e.message };
            }
        });

        // Unlink email
        ipcMain.handle('unlink-email', async () => {
            if (!restartEmailMonitor) {
                return {
                    success: false,
                    message: 'Reconnect flow not available.',
                };
            }

            try {
                await restartEmailMonitor(true);
                return {
                    success: true,
                    message: 'Gmail tokens cleared. Re-auth will start.',
                };
            } catch (e) {
                return {
                    success: false,
                    message: `Failed: ${e.message}`,
                };
            }
        });

        // Relink email
        ipcMain.handle('relink-email', async () => {
            if (!restartEmailMonitor) {
                return {
                    success: false,
                    message: 'Relink not available.',
                };
            }

            try {
                await restartEmailMonitor(false);
                return { success: true };
            } catch (e) {
                return {
                    success: false,
                    message: `Failed: ${e.message}`,
                };
            }
        });
    }
}

module.exports = { initEmailMonitor };