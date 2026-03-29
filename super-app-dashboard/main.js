const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const http = require('http');
const fs = require('node:fs');
const https = require('node:https');
const { AttentionPolicyManager } = require('./attention-policy-manager');
const { parseVoiceCommand } = require('./voice-command-parser');

let mainWindow;
let firestoreModule;
const attentionPolicyManager = new AttentionPolicyManager();

// Lazy-load Firestore (dynamic import for ESM compat)
async function getFirestore() {
    if (!firestoreModule) {
        firestoreModule = require('./firestore');
    }
    return firestoreModule;
}

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            nativeWindowOpen: true
        }
    });

    mainWindow.loadURL('http://localhost:3000/');
};

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') return 'text/html; charset=utf-8';
    if (ext === '.css') return 'text/css; charset=utf-8';
    if (ext === '.js') return 'application/javascript; charset=utf-8';
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'text/plain; charset=utf-8';
}

function serveStatic(req, res) {
    const rawPath = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const targetPath = path.resolve(__dirname, rawPath);

    if (!targetPath.startsWith(path.resolve(__dirname))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(targetPath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': getContentType(targetPath) });
        res.end(data);
    });
}

function readEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return {};
    return fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .reduce((acc, line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return acc;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) return acc;
            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
            acc[key] = value;
            return acc;
        }, {});
}

function getGoogleOAuthConfig() {
    const envPath = path.join(__dirname, '..', 'email-notifier-service', '.env');
    const env = readEnvFile(envPath);

    return {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/callback'
    };
}

function getVoiceTranscriptionApiKey() {
    const envCandidates = [
        path.join(__dirname, '..', 'email-notifier-service', '.env'),
        path.join(__dirname, '..', 'whatsapp-monitor-service', '.env'),
    ];

    for (const envPath of envCandidates) {
        const env = readEnvFile(envPath);
        if (env.HF_API_KEY) return env.HF_API_KEY;
    }

    return null;
}

async function transcribeVoiceAudio({ audioBytes, mimeType, fileName } = {}) {
    console.log('[main.js] transcribeVoiceAudio started. audioBytes type:', typeof audioBytes, 'isArray:', Array.isArray(audioBytes), 'isBuffer:', Buffer.isBuffer(audioBytes), 'isUint8Array:', audioBytes instanceof Uint8Array);
    const apiKey = getVoiceTranscriptionApiKey();
    if (!apiKey) {
        console.error('[main.js] HF_API_KEY missing');
        throw new Error('HF_API_KEY is missing. Add it to email-notifier-service/.env or whatsapp-monitor-service/.env.');
    }

    const normalizedBytes = audioBytes instanceof Uint8Array
        ? audioBytes
        : Buffer.isBuffer(audioBytes) ? new Uint8Array(audioBytes) : new Uint8Array(Array.isArray(audioBytes) ? audioBytes : []);

    console.log('[main.js] normalizedBytes length:', normalizedBytes.byteLength);

    if (!normalizedBytes.byteLength) {
        console.error('[main.js] No audio data captured');
        throw new Error('No audio data was captured.');
    }

    console.log('[main.js] Sending data to HF via official client...');
    const { HfInference } = require('@huggingface/inference');
    const hf = new HfInference(apiKey);
    
    const resolvedMimeType = typeof mimeType === 'string' && mimeType.trim()
        ? mimeType.trim()
        : 'audio/webm';

    let result;
    try {
        result = await hf.automaticSpeechRecognition({
            model: 'openai/whisper-large-v3-turbo',
            data: new Blob([normalizedBytes], { type: resolvedMimeType }),
            provider: 'hf-inference',
        });
    } catch (e) {
        console.error('[main.js] Error from HF client:', e.message);
        throw e;
    }

    const finalResult = String(result?.text || '').trim();
    console.log('[main.js] Final extracted transcript:', finalResult);
    return finalResult;
}

function httpsRequest(url, options = {}, body = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                const isJson = (res.headers['content-type'] || '').includes('application/json');
                const payload = isJson && data ? JSON.parse(data) : data;

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(payload);
                    return;
                }

                const message = typeof payload === 'object' && payload?.error_description
                    ? payload.error_description
                    : (typeof payload === 'object' && payload?.error?.message) || data || `HTTP ${res.statusCode}`;
                reject(new Error(message));
            });
        });

        req.on('error', reject);

        if (body) req.write(body);
        req.end();
    });
}

async function exchangeGoogleCodeForTokens({ code, clientId, clientSecret, redirectUri }) {
    const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
    }).toString();

    return httpsRequest('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
        }
    }, body);
}

async function fetchGoogleUserProfile(accessToken) {
    return httpsRequest('https://www.googleapis.com/oauth2/v2/userinfo', {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
}

function runGoogleLoginFlow() {
    const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();

    if (!clientId || !clientSecret) {
        throw new Error('Google OAuth credentials are missing in email-notifier-service/.env');
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const authWindow = new BrowserWindow({
            width: 520,
            height: 720,
            parent: mainWindow,
            modal: true,
            show: true,
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        const finish = (handler, value) => {
            if (settled) return;
            settled = true;
            if (!authWindow.isDestroyed()) authWindow.close();
            handler(value);
        };

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('access_type', 'offline');

        const handleNavigation = async (event, targetUrl) => {
            if (!targetUrl.startsWith(redirectUri)) return;
            event.preventDefault();

            try {
                const parsedUrl = new URL(targetUrl);
                const code = parsedUrl.searchParams.get('code');
                const authError = parsedUrl.searchParams.get('error');

                if (authError) {
                    finish(reject, new Error(`Google login was cancelled: ${authError}`));
                    return;
                }

                if (!code) {
                    finish(reject, new Error('Google login did not return an authorization code.'));
                    return;
                }

                const tokenResponse = await exchangeGoogleCodeForTokens({
                    code,
                    clientId,
                    clientSecret,
                    redirectUri
                });

                const profile = await fetchGoogleUserProfile(tokenResponse.access_token);

                // Build token.json format compatible with googleapis OAuth2 client
                const gmailTokens = {
                    access_token: tokenResponse.access_token,
                    refresh_token: tokenResponse.refresh_token,
                    scope: tokenResponse.scope,
                    token_type: tokenResponse.token_type,
                    id_token: tokenResponse.id_token,
                    expiry_date: Date.now() + ((tokenResponse.expires_in || 3599) * 1000)
                };

                // Save to email-notifier-service
                const fs = require('fs');
                const path = require('path');
                const tokenPath = path.join(__dirname, '../email-notifier-service/token.json');
                fs.writeFileSync(tokenPath, JSON.stringify(gmailTokens, null, 2));

                finish(resolve, {
                    name: profile.name || profile.email || 'Google User',
                    email: profile.email || '',
                    picture: profile.picture || '',
                    mode: 'user'
                });
            } catch (error) {
                finish(reject, error);
            }
        };

        authWindow.webContents.on('will-redirect', handleNavigation);
        authWindow.webContents.on('will-navigate', handleNavigation);
        authWindow.on('closed', () => {
            if (!settled) {
                settled = true;
                reject(new Error('Google login was closed before completion.'));
            }
        });

        authWindow.loadURL(authUrl.toString());
    });
}

// --- App + ContextBridge HTTP Server (Port 3000) ---
const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/event') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const event = JSON.parse(body);

                // 1. Forward to UI in real-time
                if (mainWindow) {
                    mainWindow.webContents.send('vscode-event', event);
                }

                // 2. Persist to Firestore asynchronously
                const fs = await getFirestore();
                fs.writeEvent(event).catch(e => console.error('[main] Firestore write error:', e.message));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
    } else if (req.method === 'GET') {
        serveStatic(req, res);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(3000, '127.0.0.1', () => {
    console.log('ContextBridge Event Server listening on http://localhost:3000/event');
});

// --- IPC: History View Requests ---
ipcMain.handle('get-day-summary', async (_, dateKey) => {
    const fs = await getFirestore();
    return fs.getDaySummary(dateKey);
});

ipcMain.handle('get-day-events', async (_, dateKey) => {
    const fs = await getFirestore();
    return fs.getDayEvents(dateKey);
});

ipcMain.handle('get-last-working-context', async () => {
    const fs = await getFirestore();
    return fs.getLastWorkingContext();
});

ipcMain.handle('google-login', async () => {
    return runGoogleLoginFlow();
});

// --- Email Monitor Initialization ---
const { initEmailMonitor } = require('./email-monitor');

// --- WhatsApp Monitor Initialization ---
const { initWhatsAppMonitor } = require('./whatsapp-monitor');

// --- WebExtension WebSocket Bridge (port 8080) ---
const { initWsBridge, closeBridge, broadcastVoicePolicy } = require('./ws-bridge');

attentionPolicyManager.subscribe((policyState) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('voice-policy-updated', policyState);
    }
    broadcastVoicePolicy(policyState);
});

// --- IPC: Browser Firestore queries from renderer ---
const browserFs = require('./browser-firestore');
ipcMain.handle('get-browser-day-summary', async (_, dateKey) => browserFs.getBrowserDaySummary(dateKey));
ipcMain.handle('get-browser-day-events', async (_, dateKey) => browserFs.getBrowserDayEvents(dateKey));

// --- IPC: Profile Integration Actions ---



ipcMain.handle('save-vips', async (_, vipsString) => {
    try {
        const vipPath = path.join(__dirname, '../whatsapp-monitor-service/vip_contacts.json');
        // Split by comma, trim whitespace, add standard suffix if missing
        const rawList = vipsString.split(',').map(s => s.trim()).filter(Boolean);
        const processed = rawList.map(num => num.includes('@c.us') ? num : `${num}@c.us`);
        
        fs.writeFileSync(vipPath, JSON.stringify({ vips: processed }, null, 2));
        return { success: true };
    } catch (e) {
        console.error('[main] save-vips error:', e);
        return { success: false, message: e.message };
    }
});

ipcMain.handle('voice-command-state', async () => {
    return attentionPolicyManager.getState();
});

ipcMain.handle('voice-command-clear', async () => {
    return attentionPolicyManager.clear('manual');
});

ipcMain.handle('voice-command-apply', async (_, transcript) => {
    const parsed = parseVoiceCommand(transcript);
    if (!parsed.ok) {
        return parsed;
    }

    if (parsed.kind === 'clear') {
        return {
            ok: true,
            kind: 'clear',
            summary: parsed.summary,
            state: attentionPolicyManager.clear('voice'),
        };
    }

    return {
        ok: true,
        kind: 'activate',
        summary: parsed.summary,
        parsed,
        state: attentionPolicyManager.activate(parsed),
    };
});

ipcMain.handle('voice-command-transcribe', async (_, payload) => {
    console.log('[main.js] Received IPC voice-command-transcribe');
    try {
        const transcript = await transcribeVoiceAudio(payload || {});
        console.log('[main.js] Transcript successful');
        return {
            ok: true,
            transcript,
        };
    } catch (error) {
        console.error('[main.js] Transcript failed:', error.message);
        return {
            ok: false,
            error: error.message || 'Voice transcription failed.',
        };
    }
});

// --- App Lifecycle ---
app.whenReady().then(() => {
    createWindow();

    // Start background email monitoring
    initEmailMonitor(mainWindow, attentionPolicyManager);
    initWhatsAppMonitor(mainWindow, attentionPolicyManager);

    // Start WebExtension WebSocket bridge
    initWsBridge(mainWindow);
    broadcastVoicePolicy(attentionPolicyManager.getState());

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});


app.on('window-all-closed', async () => {
    // Flush final session summaries before quitting
    try {
        const fs = await getFirestore();
        await fs.onAppClose();
        console.log('[main] VS Code Firestore flush complete.');
    } catch (e) {
        console.error('[main] VS Code flush error:', e.message);
    }
    try {
        await closeBridge();
        console.log('[main] Browser Firestore flush complete.');
    } catch (e) {
        console.error('[main] Browser flush error:', e.message);
    }
    if (process.platform !== 'darwin') app.quit();
});
