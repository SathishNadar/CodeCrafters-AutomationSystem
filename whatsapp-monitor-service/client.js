const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let globalClient = null;
let globalOnMessage = null;
let isReady = false;

/**
 * Starts the WhatsApp Web client with persistent LocalAuth session.
 * On first run: prints a QR code in terminal to scan with your phone.
 * On subsequent runs: auto-reconnects from saved session (no QR needed).
 *
 * @param {Function} onMessage - Callback(msg) for every incoming message
 */
function startClient(onMessage) {
    globalOnMessage = onMessage;

    const client = new Client({
        authStrategy: new LocalAuth({
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    // First-time QR scan (only needed once per session directory)
    client.on('qr', (qr) => {
        console.log('\n[WhatsAppClient] 📱 Scan this QR code with your WhatsApp mobile app:');
        qrcode.generate(qr, { small: true });
        console.log('[WhatsAppClient] Waiting for scan...\n');
    });

    client.on('authenticated', () => {
        console.log('[WhatsAppClient] ✅ Session authenticated.');
    });

    client.on('ready', () => {
        console.log('[WhatsAppClient] ✅ WhatsApp Web is connected and ready!');
        isReady = true;
        globalClient = client;
    });

    client.on('disconnected', (reason) => {
        console.warn('[WhatsAppClient] ⚠️  Disconnected:', reason);
        isReady = false;
        // Auto-restart after a short delay
        setTimeout(() => {
            console.log('[WhatsAppClient] 🔄 Attempting reconnect...');
            client.initialize();
        }, 5000);
    });

    // Core: listen for incoming messages
    client.on('message', async (msg) => {
        // Skip outgoing messages (sent by us), group messages from self, and status broadcasts
        if (msg.fromMe) return;
        if (msg.from === 'status@broadcast') return;

        if (globalOnMessage) {
            try {
                await globalOnMessage(msg);
            } catch (err) {
                console.error('[WhatsAppClient] onMessage callback error:', err.message);
            }
        }
    });

    client.on('auth_failure', (msg) => {
        console.error('[WhatsAppClient] ❌ Authentication failure:', msg);
        console.log('[WhatsAppClient] Deleting saved session — please restart to re-scan QR.');
    });

    client.initialize();
    console.log('[WhatsAppClient] Initializing... (this may take 10-20 seconds on first run)');
}

/**
 * Sends a WhatsApp reply to a given chatId.
 * @param {string} chatId - The chat ID (msg.from, e.g. "919876543210@c.us")
 * @param {string} text - Message body to send
 */
async function sendReply(chatId, text) {
    if (!globalClient || !isReady) {
        throw new Error('WhatsApp client is not ready yet');
    }
    await globalClient.sendMessage(chatId, text);
    console.log(`[WhatsAppClient] ✉️  Reply sent to ${chatId}`);
}

module.exports = { startClient, sendReply };
