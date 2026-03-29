const axios = require('axios');
const path = require('path');
const { ipcMain } = require('electron');

// Port where ContextBridge VS Code extension's notify server is listening
const VSCODE_NOTIFY_URL = 'http://localhost:3100/notify';

/**
 * Initializes the WhatsApp monitor and connects it to the VS Code notification system
 * AND the dashboard's Unified Inbox view.
 *
 * @param {BrowserWindow} mainWindow - The main Electron window to send IPC events to.
 * @param {AttentionPolicyManager} attentionPolicyManager - Shared timed voice-command policy state.
 */
let globalRestart = null;

function initWhatsAppMonitor(mainWindow, attentionPolicyManager) {
    try {
        const servicePath = path.join(__dirname, '..', 'whatsapp-monitor-service', 'main.js');
        const { startWhatsAppMonitor, sendWhatsAppReply, restartWhatsAppMonitor } = require(servicePath);

        globalRestart = restartWhatsAppMonitor;

        console.log('[WhatsAppMonitorBridge] Initializing WhatsApp Monitor Service...');

        const onMessage = async (msg, analysis) => {
            const { priority, task, sender } = analysis;

            // Notify VS Code only when the message is high priority and the current work mode allows interruptions.
            if (priority === 'High') {
                try {
                    if (attentionPolicyManager?.shouldAllowInterrupt(priority)) {
                        const message = `[${priority}] ${task} - from ${sender}`;
                        await axios.post(VSCODE_NOTIFY_URL, { message });
                        console.log(`[WhatsAppMonitorBridge] VS Code Alert Sent: "${task}"`);
                    } else {
                        console.log(`[WhatsAppMonitorBridge] Alert delayed by attention policy: "${task}"`);
                    }
                } catch (err) {
                    console.warn('[WhatsAppMonitorBridge] VS Code notification skipped (Extension might be closed)');
                }
            }

            // Always push to the dashboard inbox so messages remain visible even during deep work.
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('new-whatsapp-message', {
                    msg: {
                        id: msg.id._serialized,
                        body: msg.body || '',
                        from: msg.from,
                        contact: sender,
                    },
                    analysis,
                    timestamp: new Date().toISOString(),
                });
            }
        };

        ipcMain.handle('unlink-whatsapp', async () => {
            console.log('[WhatsAppMonitorBridge] Soft-restarting WhatsApp client...');
            if (globalRestart) {
                try {
                    await globalRestart();
                    return { success: true, message: 'WhatsApp session cleared and client is restarting. Check the terminal for the new QR code shortly.' };
                } catch (e) {
                    return { success: false, message: `Failed to restart WhatsApp: ${e.message}` };
                }
            }
            return { success: false, message: 'WhatsApp monitor not initialized properly.' };
        });

        const onQR = (qrString) => {
            console.log('[WhatsAppMonitorBridge] Emitting QR code to UI...');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('whatsapp-qr', qrString);
            }
        };

        startWhatsAppMonitor(onMessage, onQR);

        ipcMain.handle('send-whatsapp-reply', async (_, payload) => {
            console.log('[WhatsAppMonitorBridge] IPC: Send WhatsApp reply requested to', payload.chatId);
            try {
                await sendWhatsAppReply(payload.chatId, payload.text);
                return { success: true };
            } catch (e) {
                console.error('[WhatsAppMonitorBridge] Error sending reply:', e.message);
                return { success: false, error: e.message };
            }
        });
    } catch (err) {
        console.error('[WhatsAppMonitorBridge] Critical bridge error:', err.message);
    }
}

module.exports = { initWhatsAppMonitor };
