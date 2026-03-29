/**
 * ws-bridge.js
 * Embeds the WebExtension WebSocket server directly inside Electron.
 * Listens on ws://localhost:8080 — the extension connects here automatically.
 *
 * Forwards all telemetry to the renderer via IPC: 'browser-telemetry'
 * Throttles PIPELINE_UPDATE to max 1/sec to avoid flooding the renderer.
 */

const { WebSocketServer } = require('ws');
const {
    writePipelineSnapshot,
    writeStateChange,
    writeNotifDecision,
    flushBrowserSummary,
} = require('./browser-firestore');

const WS_PORT = 8080;
let _mainWindow = null;
let _lastPipelineForward = 0;

function initWsBridge(mainWindow) {
    _mainWindow = mainWindow;

    let wss;
    try {
        wss = new WebSocketServer({ port: WS_PORT });
    } catch (e) {
        console.error(`[WsBridge] Failed to start WebSocket server on port ${WS_PORT}:`, e.message);
        return;
    }

    console.log(`[WsBridge] WebSocket server listening on ws://localhost:${WS_PORT}`);

    wss.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`[WsBridge] Port ${WS_PORT} already in use — another bridge may be running.`);
        } else {
            console.error('[WsBridge] Server error:', err.message);
        }
    });

    wss.on('connection', (socket) => {
        console.log('[WsBridge] Extension connected');

        // Notify renderer that extension is connected
        send({ type: 'EXTENSION_CONNECTED', ts: Date.now() });

        // Send PING so the extension responds immediately with its state
        socket.send(JSON.stringify({ type: 'PING', ts: Date.now() }));

        socket.on('message', (raw) => {
            let payload;
            try {
                payload = JSON.parse(raw.toString());
            } catch {
                return;
            }

            handleExtensionMessage(payload, socket);
        });

        socket.on('close', () => {
            console.log('[WsBridge] Extension disconnected');
            send({ type: 'EXTENSION_DISCONNECTED', ts: Date.now() });
        });

        socket.on('error', (err) => {
            console.warn('[WsBridge] Socket error:', err.message);
        });
    });
}

function handleExtensionMessage(payload, socket) {
    if (!payload || typeof payload !== 'object') return;

    switch (payload.type) {
        case 'EXTENSION_HELLO':
            console.log('[WsBridge] Extension hello received');
            send({ type: 'EXTENSION_CONNECTED', ts: Date.now() });
            // Ask for immediate state snapshot
            socket.send(JSON.stringify({ type: 'REQUEST_STATE_SNAPSHOT', ts: Date.now() }));
            break;

        case 'PONG':
            // Keep-alive acknowledged — no action needed
            break;

        case 'STATE_CHANGE':
        case 'STATE_SNAPSHOT':
            // Forward immediately — these are important state transitions
            send(payload);
            // Persist state change to Firestore
            writeStateChange(payload).catch(() => {});
            break;

        case 'PIPELINE_UPDATE': {
            // Forward context to Rules Engine
            if (payload.pipeline && Object.keys(payload.pipeline).length > 0) {
                const rulesEngine = require('./rules-engine');
                const p = payload.pipeline;
                // If it's a focus state
                if (p.toState) {
                    rulesEngine.updateContext({ isDistracted: p.toState === 'Distracted' });
                }
            }

            // Throttle renderer IPC to 1 per second
            const now = Date.now();
            if (now - _lastPipelineForward >= 1000) {
                _lastPipelineForward = now;
                send(payload);
            }
            // Always persist to Firestore (extension sends every ~10s — no flood risk)
            writePipelineSnapshot(payload).catch(() => {});
            break;
        }

        case 'NOTIFICATION_DECISION':
            send(payload);
            // Persist notification decision
            writeNotifDecision(payload).catch(() => {});
            break;

        default:
            // Forward unknown types for future extensibility
            send(payload);
    }
}

/** Send a payload to the renderer via IPC */
function send(payload) {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('browser-telemetry', payload);
    }
}

/** Call this when the Electron app is closing to flush the daily summary */
async function closeBridge() {
    try {
        await flushBrowserSummary();
    } catch {}
}

module.exports = { initWsBridge, closeBridge };
