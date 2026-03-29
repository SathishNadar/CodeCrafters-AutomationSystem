const axios = require('axios');
const path = require('path');
const { ipcMain } = require('electron');

const VSCODE_NOTIFY_URL = 'http://localhost:3100/notify';

let globalRestart = null;
let globalStop = null;
let _ipcRegistered = false;

function initWhatsAppMonitor(mainWindow, attentionPolicyManager) {
    try {
        const servicePath = path.join(__dirname, '..', 'whatsapp-monitor-service', 'main.js');
        const {
            startWhatsAppMonitor,
            sendWhatsAppReply,
            restartWhatsAppMonitor,
            stopWhatsAppMonitor,
        } = require(servicePath);

        globalRestart = restartWhatsAppMonitor;
        globalStop = stopWhatsAppMonitor;

        console.log('[WhatsAppMonitorBridge] Initializing WhatsApp Monitor Service...');

        const onMessage = async (msg, analysis) => {
            const { priority, task, sender } = analysis;

            const rulesEngine = require('./rules-engine');
            const ctx = rulesEngine.getContext();

            // --- RULE 3: Focused Auto-Responder ---
            if (rulesEngine.isRuleActive('rule_focus_reply') && ctx.isFocused && priority === 'Low') {
                try {
                    await sendWhatsAppReply(
                        msg.from,
                        "Automatic Reply: I am currently deep in a coding task and will respond later."
                    );
                    console.log(`[WhatsAppMonitorBridge] Auto-replied to ${sender}`);
                } catch (e) {
                    console.error('[WhatsAppMonitorBridge] Failed focus reply:', e.message);
                }
            }

            // --- RULE 4: Urgent Escalation Alarm ---
            if (rulesEngine.isRuleActive('rule_urgent_alarm') && ctx.isIdle && priority === 'Urgent') {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('trigger-urgent-alarm', {
                        sender,
                        task,
                        source: 'WhatsApp',
                    });
                }
            }

            // --- COMBINED PRIORITY LOGIC ---
            let shouldPingVscode = false;

            // Rules engine logic
            if (rulesEngine.isRuleActive('rule_deep_work')) {
                shouldPingVscode = (priority === 'High' || priority === 'Urgent');
            } else {
                shouldPingVscode =
                    (priority === 'High' || priority === 'Urgent' || priority === 'Medium');
            }

            // Attention Policy (final filter)
            if (shouldPingVscode && attentionPolicyManager) {
                shouldPingVscode = attentionPolicyManager.shouldAllowInterrupt(priority);
            }

            // Send to VS Code
            if (shouldPingVscode) {
                try {
                    const message = `[${priority}] ${task} - from ${sender}`;
                    await axios.post(VSCODE_NOTIFY_URL, { message });
                    console.log(`[WhatsAppMonitorBridge] VS Code Alert Sent: "${task}"`);
                } catch (err) {
                    console.warn('[WhatsAppMonitorBridge] VS Code notification skipped');
                }
            }

            // ALWAYS push to dashboard inbox
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

        // QR handler
        const onQR = (qrString) => {
            console.log('[WhatsAppMonitorBridge] Emitting QR code to UI...');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('whatsapp-qr', qrString);
            }
        };

        // Start service
        startWhatsAppMonitor(onMessage, onQR);

    } catch (err) {
        console.error('[WhatsAppMonitorBridge] Critical bridge error:', err.message);
    }

    // Register IPC handlers ONLY ONCE
    if (!_ipcRegistered) {
        _ipcRegistered = true;

        // Restart WhatsApp
        ipcMain.handle('unlink-whatsapp', async () => {
            console.log('[WhatsAppMonitorBridge] Restart requested');

            if (typeof globalRestart === 'function') {
                try {
                    await globalRestart();
                    return {
                        success: true,
                        message: 'WhatsApp session reset. Scan QR again.',
                    };
                } catch (e) {
                    return {
                        success: false,
                        message: `Restart failed: ${e.message}`,
                    };
                }
            }

            return {
                success: false,
                message: 'WhatsApp monitor not initialized.',
            };
        });

        // Stop WhatsApp
        ipcMain.handle('stop-whatsapp', async () => {
            console.log('[WhatsAppMonitorBridge] Stop requested');

            if (typeof globalStop === 'function') {
                try {
                    await globalStop();
                    return { success: true };
                } catch (e) {
                    return {
                        success: false,
                        message: `Stop failed: ${e.message}`,
                    };
                }
            }

            return {
                success: false,
                message: 'WhatsApp monitor not initialized.',
            };
        });

        // Send reply
        ipcMain.handle('send-whatsapp-reply', async (_, payload) => {
            try {
                const servicePath = path.join(
                    __dirname,
                    '..',
                    'whatsapp-monitor-service',
                    'main.js'
                );
                const { sendWhatsAppReply } = require(servicePath);

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