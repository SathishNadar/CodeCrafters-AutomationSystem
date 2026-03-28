const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const http = require('http');

let mainWindow;
let firestoreModule;

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
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
};

// --- ContextBridge HTTP Server (Port 3000) ---
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

// --- Email Monitor Initialization ---
const { initEmailMonitor } = require('./email-monitor');

// --- App Lifecycle ---
app.whenReady().then(() => {
    createWindow();
    
    // Start background email monitoring
    initEmailMonitor(mainWindow);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});


app.on('window-all-closed', async () => {
    // Flush final session summary before quitting
    try {
        const fs = await getFirestore();
        await fs.onAppClose();
        console.log('[main] Final Firestore flush complete.');
    } catch (e) {
        console.error('[main] Final flush error:', e.message);
    }
    if (process.platform !== 'darwin') app.quit();
});
