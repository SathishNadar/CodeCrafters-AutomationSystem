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
 */
function initWhatsAppMonitor(mainWindow) {
    try {
        const servicePath = path.join(__dirname, '..', 'whatsapp-monitor-service', 'main.js');
        const { startWhatsAppMonitor, sendWhatsAppReply } = require(servicePath);

        console.log('[WhatsAppMonitorBridge] Initializing WhatsApp Monitor Service...');

        /**
         * Callback fired for every new incoming WhatsApp message.
         */
        const onMessage = async (msg, analysis) => {
            const { priority, task, sender } = analysis;

            // 1. Notify VS Code ONLY if High priority
            if (priority === 'High') {
                try {
                    const message = `📱 [${priority}] ${task} — from ${sender}`;
                    await axios.post(VSCODE_NOTIFY_URL, { message });
                    console.log(`[WhatsAppMonitorBridge] VS Code Alert Sent: "${task}"`);
                } catch (err) {
                    console.warn('[WhatsAppMonitorBridge] VS Code notification skipped (Extension might be closed)');
                }
            }

            // 2. ALWAYS push to Dashboard Unified Inbox
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('new-whatsapp-message', {
                    msg: {
                        id: msg.id._serialized,
                        body: msg.body || '',
                        from: msg.from,              // chatId for replies e.g. "919876543210@c.us"
                        contact: sender              // Display name
                    },
                    analysis,
                    timestamp: new Date().toISOString()
                });
            }
        };

        // Start the WhatsApp client (shows QR on first run, auto-connects after)
        startWhatsAppMonitor(onMessage);

        // IPC Handler: Send reply from Unified Inbox UI
        ipcMain.handle('send-whatsapp-reply', async (event, payload) => {
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
