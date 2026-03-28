const axios = require('axios');
const path = require('path');
const { ipcMain } = require('electron');

// Port where ContextBridge VS Code extension's notify server is listening
const VSCODE_NOTIFY_URL = 'http://localhost:3100/notify';

/**
 * Initializes the email monitor and connects it to the VS Code notification system 
 * AND the dashboard's own notification feed.
 * @param {BrowserWindow} mainWindow - The main Electron window to send IPC events to.
 */
function initEmailMonitor(mainWindow) {
    try {
        const emailServicePath = path.join(__dirname, '..', 'email-notifier-service', 'main.js');
        const { startEmailMonitor, forceSync, sendEmailReply, restartEmailMonitor } = require(emailServicePath);

        console.log('[EmailMonitorBridge] Initializing Email Monitor Service...');

        /**
         * The updated callback that handles every analyzed email.
         */
        const onAnalysis = async (email, analysis) => {
            const { priority, task, sender } = analysis;

            // 1. Notify VS Code ONLY if High/Urgent
            if (priority === "High" || priority === "Urgent") {
                try {
                    const message = `📬 [${priority}] ${task} - from ${sender || email.from}`;
                    await axios.post(VSCODE_NOTIFY_URL, { message });
                    console.log(`[EmailMonitorBridge] VS Code Alert Sent: "${task}"`);
                } catch (err) {
                    console.warn(`[EmailMonitorBridge] VS Code Notification skipped (Extension might be closed)`);
                }
            }

            // 2. ALWAYS notify the Dashboard Renderer to update the UI
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('new-email-notification', {
                    email,
                    analysis,
                    timestamp: new Date().toISOString()
                });
            }
        };

        // Start the background monitoring loop
        startEmailMonitor(onAnalysis);

        // IPC Handlers for UI interactions
        ipcMain.handle('force-email-sync', async () => {
             console.log('[EmailMonitorBridge] IPC: Force email sync requested');
             if (forceSync) await forceSync();
             return { success: true };
        });

        ipcMain.handle('send-email-reply', async (event, payload) => {
             console.log('[EmailMonitorBridge] IPC: Send email reply requested');
             if (sendEmailReply) {
                 try {
                     await sendEmailReply(payload.to, payload.subject, payload.content, payload.threadId, payload.messageId);
                     return { success: true };
                 } catch (e) {
                     console.error('[EmailMonitorBridge] Error sending reply:', e.message);
                     return { success: false, error: e.message };
                 }
             }
             return { success: false, error: "sendEmailReply not available" };
        });

        ipcMain.handle('unlink-email', async () => {
             console.log('[EmailMonitorBridge] IPC: Unlink email requested');
             if (restartEmailMonitor) {
                 try {
                     await restartEmailMonitor(true);
                     return { success: true, message: 'Gmail tokens cleared. An authorization window will pop up momentarily.' };
                 } catch (e) {
                     return { success: false, message: 'Failed to restart Email auth: ' + e.message };
                 }
             }
             return { success: false, message: 'Email monitor not initialized properly.' };
        });

        ipcMain.handle('relink-email', async () => {
             console.log('[EmailMonitorBridge] IPC: Relink email requested (Soft restart)');
             if (restartEmailMonitor) {
                 try {
                     await restartEmailMonitor(false);
                     return { success: true };
                 } catch (e) {
                     return { success: false, message: 'Failed to relink Email auth: ' + e.message };
                 }
             }
             return { success: false, message: 'Email monitor not initialized properly.' };
        });

    } catch (err) {
        console.error('[EmailMonitorBridge] Critical bridge error:', err.message);
    }
}

module.exports = { initEmailMonitor };
