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
let globalRestart = null;
let globalStop = null;
let _ipcRegistered = false;  // guard: register IPC handlers only once

function initWhatsAppMonitor(mainWindow) {
    try {
        const servicePath = path.join(__dirname, '..', 'whatsapp-monitor-service', 'main.js');
        const { startWhatsAppMonitor, sendWhatsAppReply, restartWhatsAppMonitor, stopWhatsAppMonitor } = require(servicePath);

        globalRestart = restartWhatsAppMonitor;
        globalStop = stopWhatsAppMonitor;
        console.log('[WhatsAppMonitorBridge] Service loaded. globalRestart:', typeof globalRestart);

        /**
         * Callback fired for every new incoming WhatsApp message.
         */
        const onMessage = async (msg, analysis) => {
            const { priority, task, sender } = analysis;
            const rulesEngine = require('./rules-engine');
            const ctx = rulesEngine.getContext();

            // --- RULE 3: Focused Auto-Responder (Low Priority Only) ---
            if (rulesEngine.isRuleActive('rule_focus_reply') && ctx.isFocused && priority === 'Low') {
                try {
                    const { sendWhatsAppReply } = require(path.join(__dirname, '..', 'whatsapp-monitor-service', 'main.js'));
                    await sendWhatsAppReply(msg.from, "Automatic Reply: I am currently deep in a coding task and have paused non-urgent notifications. I will review this later.");
                    console.log(`[WhatsAppMonitorBridge] Triggered Focused Auto-Reply for ${sender}`);
                } catch (e) {
                    console.error('Failed focus reply:', e.message);
                }
            }

            // --- RULE 4: Urgent Escalation Alarm ---
            if (rulesEngine.isRuleActive('rule_urgent_alarm') && ctx.isIdle && priority === 'Urgent') {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('trigger-urgent-alarm', { sender, task, source: 'WhatsApp' });
                }
            }

            // --- RULE 1: Deep Work Shield ---
            // Shield ON = High priority only. Shield OFF = High + Medium.
            let shouldPingVscode = (priority === 'High' || priority === 'Urgent');
            if (!rulesEngine.isRuleActive('rule_deep_work')) {
                shouldPingVscode = shouldPingVscode || priority === 'Medium';
            }

            if (shouldPingVscode) {
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

        // IPC Handler: Reconnect WhatsApp Without App Restart
        // (moved outside try-catch — registered once via _ipcRegistered guard)

        // Start the WhatsApp client (shows QR on first run, auto-connects after)
        const onQR = (qrString) => {
            console.log('[WhatsAppMonitorBridge] Emitting QR code to UI...');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('whatsapp-qr', qrString);
            }
        };

        startWhatsAppMonitor(onMessage, onQR);

    } catch (err) {
        console.error('[WhatsAppMonitorBridge] Critical bridge error:', err.message);
    }

    // Register IPC handlers ONCE outside try-catch so they always exist
    if (!_ipcRegistered) {
        _ipcRegistered = true;

        // IPC: Reconnect WhatsApp
        ipcMain.handle('unlink-whatsapp', async () => {
            console.log('[WhatsAppMonitorBridge] Soft-restarting WhatsApp client...');
            if (typeof globalRestart === 'function') {
                try {
                    const result = await globalRestart();
                    return result || { success: true };
                } catch (e) {
                    console.error('[WhatsAppMonitorBridge] Restart failed:', e.message);
                    return { success: false, message: 'Failed to restart: ' + e.message };
                }
            }
            return { success: false, message: 'WhatsApp monitor not initialized. Check app logs.' };
        });

        // IPC: Stop WhatsApp completely (Disconnect)
        ipcMain.handle('stop-whatsapp', async () => {
            console.log('[WhatsAppMonitorBridge] Stopping WhatsApp client...');
            if (typeof globalStop === 'function') {
                try {
                    const result = await globalStop();
                    return result || { success: true };
                } catch (e) {
                    console.error('[WhatsAppMonitorBridge] Stop failed:', e.message);
                    return { success: false, message: 'Failed to stop: ' + e.message };
                }
            }
            return { success: false, message: 'WhatsApp monitor not initialized.' };
        });

        // IPC: Send reply from Unified Inbox
        ipcMain.handle('send-whatsapp-reply', async (event, payload) => {
            console.log('[WhatsAppMonitorBridge] IPC: Send WhatsApp reply requested to', payload.chatId);
            try {
                const { sendWhatsAppReply } = require(
                    require('path').join(__dirname, '..', 'whatsapp-monitor-service', 'main.js')
                );
                await sendWhatsAppReply(payload.chatId, payload.text);
                return { success: true };
            } catch (e) {
                console.error('[WhatsAppMonitorBridge] Error sending reply:', e.message);
                return { success: false, error: e.message };
            }
        });
    }
}

module.exports = { initWhatsAppMonitor };
