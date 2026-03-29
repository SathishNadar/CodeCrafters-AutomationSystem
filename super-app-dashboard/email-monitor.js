const axios = require('axios');
const path = require('path');
const { ipcMain } = require('electron');

const VSCODE_NOTIFY_URL = 'http://localhost:3100/notify';

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

        if (priority === 'High' || priority === 'Urgent') {
            try {
                if (attentionPolicyManager?.shouldAllowInterrupt(priority)) {
                    const message = `[${priority}] ${task} - from ${sender || email.from}`;
                    await axios.post(VSCODE_NOTIFY_URL, { message });
                    console.log(`[EmailMonitorBridge] VS Code Alert Sent: "${task}"`);
                } else {
                    console.log(`[EmailMonitorBridge] Alert delayed by attention policy: "${task}"`);
                }
            } catch (err) {
                console.warn('[EmailMonitorBridge] VS Code notification skipped (Extension might be closed)');
            }
        }

        emitInboxNotification(email, analysis);
    };

    ipcMain.handle('force-email-sync', async () => {
        if (!monitorReady || !forceSync) {
            return { success: false, error: 'Email monitor is not ready yet.' };
        }

        console.log('[EmailMonitorBridge] IPC: Force email sync requested');
        await forceSync();
        return { success: true };
    });

    ipcMain.handle('send-email-reply', async (_, payload) => {
        if (!monitorReady || !sendEmailReply) {
            return { success: false, error: 'Email reply is unavailable because Gmail is not connected.' };
        }

        console.log('[EmailMonitorBridge] IPC: Send email reply requested');
        try {
            await sendEmailReply(payload.to, payload.subject, payload.content, payload.threadId, payload.messageId);
            return { success: true };
        } catch (e) {
            console.error('[EmailMonitorBridge] Error sending reply:', e.message);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('unlink-email', async () => {
        console.log('[EmailMonitorBridge] IPC: Unlink email requested');
        if (!restartEmailMonitor) {
            return { success: false, message: 'Gmail reconnect flow is not available in the current email service build.' };
        }

        try {
            await restartEmailMonitor(true);
            return { success: true, message: 'Gmail tokens cleared. An authorization window will pop up momentarily.' };
        } catch (e) {
            return { success: false, message: `Failed to restart Email auth: ${e.message}` };
        }
    });

    ipcMain.handle('relink-email', async () => {
        console.log('[EmailMonitorBridge] IPC: Relink email requested (Soft restart)');
        if (!restartEmailMonitor) {
            return { success: false, message: 'Gmail relink is not available in the current email service build.' };
        }

        try {
            await restartEmailMonitor(false);
            return { success: true };
        } catch (e) {
            return { success: false, message: `Failed to relink Email auth: ${e.message}` };
        }
    });

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
}

module.exports = { initEmailMonitor };
