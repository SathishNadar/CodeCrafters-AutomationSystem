const fs = require('fs');
const path = require('path');
const { startClient, sendReply, restartClient, stopClient } = require('./client');
const { analyzeWhatsAppMessage } = require('./analyzer');

const SEEN_FILE = path.join(__dirname, 'seen_messages.json');

let globalSeen = new Set();
let globalSendReply = sendReply;

// Sender-based message debouncing map
const messageBuffer = {}; // { 'ContactName': { timer, texts: [], msgs: [] } }
const CONSOLIDATION_WINDOW_MS = 10000;

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

        if (!messageBuffer[contactName]) {
            messageBuffer[contactName] = { timer: null, texts: [], msgs: [] };
        }

        const bufferData = messageBuffer[contactName];
        clearTimeout(bufferData.timer);

        bufferData.texts.push(messageBody);
        bufferData.msgs.push(msg);

        console.log(`[WhatsAppMonitor] Buffered message from ${contactName}. Waiting ${CONSOLIDATION_WINDOW_MS}ms...`);

        bufferData.timer = setTimeout(async () => {
            // Unload the buffer
            const batch = messageBuffer[contactName];
            delete messageBuffer[contactName];

            const combinedBody = batch.texts.join(' \n ');
            console.log(`[WhatsAppMonitor] Processing consolidated batch from ${contactName} (${batch.msgs.length} msgs)...`);

            // Run AI classification on the combined context
            const analysis = await analyzeWhatsAppMessage(combinedBody, contactName);
            const finalAnalysis = analysis || {
                task: combinedBody.substring(0, 80),
                priority: 'Medium',
                sender: contactName
            };

            // Use the last message object as the carrier and patch its body to the combined body
            const masterMsg = batch.msgs[batch.msgs.length - 1];
            masterMsg.body = combinedBody;

            console.log(`[WhatsAppMonitor] Classified: ${finalAnalysis.priority} — ${finalAnalysis.task}`);

            // Fire the callback with the merged message
            onMessage(masterMsg, finalAnalysis);
        }, CONSOLIDATION_WINDOW_MS);
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
