const fs = require('fs');
const path = require('path');
const { startClient, sendReply, restartClient, stopClient } = require('./client');
const { analyzeWhatsAppMessage } = require('./analyzer');

const SEEN_FILE = path.join(__dirname, 'seen_messages.json');

let globalSeen = new Set();
let globalSendReply = sendReply;

/**
 * Starts the WhatsApp monitoring service.
 * Connects the whatsapp-web.js client to the Qwen AI classifier
 * and fires onMessage(msg, analysis) for each new incoming message.
 *
 * @param {Function} onMessage - Callback(msg, analysis) invoked for every classified message
 */
async function startWhatsAppMonitor(onMessage, onQR) {
    // Load previously seen message IDs from disk
    if (fs.existsSync(SEEN_FILE)) {
        try {
            const seenArray = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
            globalSeen = new Set(seenArray);
            console.log(`[WhatsAppMonitor] Loaded ${globalSeen.size} seen message IDs.`);
        } catch (e) {
            console.error('[WhatsAppMonitor] Error loading seen_messages.json, starting fresh.');
        }
    }

    startClient(async (msg) => {
        const msgId = msg.id._serialized;

        // Deduplication guard
        if (globalSeen.has(msgId)) return;
        globalSeen.add(msgId);
        persistSeen();

        // Get contact name (falls back to phone number)
        let contactName = msg.from;
        try {
            const contact = await msg.getContact();
            contactName = contact.pushname || contact.name || msg.from.replace('@c.us', '');
        } catch (_) {
            contactName = msg.from.replace('@c.us', '');
        }

        const messageBody = msg.body || '';
        console.log(`[WhatsAppMonitor] New message from ${contactName}: "${messageBody.substring(0, 50)}"`);

        // Run AI classification
        const analysis = await analyzeWhatsAppMessage(messageBody, contactName);
        const finalAnalysis = analysis || {
            task: messageBody.substring(0, 80),
            priority: 'Medium',
            sender: contactName
        };

        console.log(`[WhatsAppMonitor] Classified: ${finalAnalysis.priority} — ${finalAnalysis.task}`);

        // Fire the callback with the raw msg object AND the analysis
        onMessage(msg, finalAnalysis);
    }, onQR);  // ← pass the QR callback into client.js
}
/**
 * Restarts the WhatsApp client — destroys current session and re-initialises.
 * Called when user clicks "Reconnect WhatsApp" in the profile view.
 */
async function restartWhatsAppMonitor() {
    return await restartClient();
}

/**
 * Sends a WhatsApp reply to a specific chat.
 * @param {string} chatId - The chat ID (msg.from, e.g. "919876543210@c.us")
 * @param {string} text   - The message text to send
 */
async function sendWhatsAppReply(chatId, text) {
    return await globalSendReply(chatId, text);
}

async function stopWhatsAppMonitor() {
    return await stopClient();
}

/**
 * Persists the seen message ID set to disk.
 */
function persistSeen() {
    try {
        // Keep only last 1000 IDs to prevent the file from growing forever
        const seenArray = [...globalSeen];
        const trimmed = seenArray.slice(-1000);
        globalSeen = new Set(trimmed);
        fs.writeFileSync(SEEN_FILE, JSON.stringify(trimmed));
    } catch (e) {
        console.error('[WhatsAppMonitor] Failed to persist seen IDs:', e.message);
    }
}

module.exports = { startWhatsAppMonitor, sendWhatsAppReply, restartWhatsAppMonitor, stopWhatsAppMonitor };
