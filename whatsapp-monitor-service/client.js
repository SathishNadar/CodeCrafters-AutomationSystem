const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let globalClient = null;
let globalOnMessage = null;
let globalOnQR = null;
let isReady = false;

/**
 * Starts the WhatsApp Web client with persistent LocalAuth session.
 * On first run: prints a QR code in terminal to scan with your phone.
 * On subsequent runs: auto-reconnects from saved session (no QR needed).
 *
 * @param {Function} onMessage - Callback(msg) for every incoming message
 */
function startClient(onMessage, onQR) {
    globalOnMessage = onMessage;
    globalOnQR = onQR || null;

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

    // Make it globally accessible immediately so we can stop/destroy it even if stuck at QR state
    globalClient = client;

    // First-time QR scan — forward to Electron UI AND print to terminal
    client.on('qr', (qr) => {
        console.log('\n[WhatsAppClient] 📱 Scan this QR code with your WhatsApp mobile app:');
        qrcode.generate(qr, { small: true });
        console.log('[WhatsAppClient] Waiting for scan...\n');
        // Forward QR string to Electron renderer (for in-app scan UI)
        if (typeof onQR === 'function') onQR(qr);
        if (typeof globalOnQR === 'function') globalOnQR(qr);
    });

    client.on('authenticated', () => {
        console.log('[WhatsAppClient] ✅ Session authenticated.');
    });

    client.on('ready', () => {
        console.log('[WhatsAppClient] ✅ WhatsApp Web is connected and ready!');
        isReady = true;
        globalClient = client;
        // Notify UI that connection is established — hides QR container
        if (typeof onQR === 'function') onQR('connected');
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

    client.initialize().catch(err => {
        console.error('[WhatsAppClient] initialize() failed:', err.message);
        // Notify the UI that something went wrong
        if (typeof globalOnQR === 'function') {
            globalOnQR('error:' + err.message);
        }
    });
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

/**
 * Stops the WhatsApp client completely and clears the session.
 */
async function stopClient() {
    console.log('[WhatsAppClient] Stopping client...');
    isReady = false;
    if (globalClient) {
        try {
            await globalClient.logout();
        } catch (_) {}
        try {
            await globalClient.destroy();
        } catch (_) {}
        globalClient = null;
    }
    
    // Give Puppeteer a moment to fully close the browser and release file locks
    await new Promise(r => setTimeout(r, 2000));
    
    // Delete auth session
    const fse = require('fs');
    const authPath = require('path').join(__dirname, '.wwebjs_auth');
    const cachePath = require('path').join(__dirname, '.wwebjs_cache');
    [authPath, cachePath].forEach(p => {
        if (fse.existsSync(p)) {
            try { fse.rmSync(p, { recursive: true, force: true }); } catch (_) {}
        }
    });
    console.log('[WhatsAppClient] Session cleared.');
    return { success: true };
}

/**
 * Restarts the WhatsApp client — destroys current session and re-initialises.
 * A new QR code will be emitted via the globalOnQR callback.
 */
async function restartClient() {
    await stopClient();

    console.log('[WhatsAppClient] Re-initializing...');
    try {
        startClient(globalOnMessage, globalOnQR);
    } catch (initErr) {
        console.error('[WhatsAppClient] Re-init error:', initErr.message);
        return { success: false, message: initErr.message };
    }
    return { success: true };
}

module.exports = { startClient, sendReply, restartClient, stopClient };
