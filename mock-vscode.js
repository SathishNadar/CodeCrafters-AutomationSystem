const http = require('http');

console.log("🚀 Starting VS Code Synthetic Data Generator...");
console.log("Press Ctrl+C to stop.");

const files = [
    '/src/components/Dashboard.tsx',
    '/src/utils/api-client.ts',
    '/src/styles/globals.css',
    '/server/main.go',
    '/tests/auth.spec.js'
];

const languages = ['typescript', 'typescript', 'css', 'go', 'javascript'];

let currentFileIndex = 0;
let isFocused = true;
let totalChars = 0;

function sendEvent(type, payloadData) {
    const event = {
        type: type,
        payload: {
            timestamp: new Date().toISOString(),
            ...payloadData
        }
    };

    const data = JSON.stringify(event);

    const options = {
        hostname: '127.0.0.1',
        port: 3000,
        path: '/event',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    const req = http.request(options, (res) => {
        if (res.statusCode !== 200) {
            console.warn(`⚠️ Failed to send event. Status: ${res.statusCode}`);
        }
    });

    req.on('error', (e) => {
        console.error(`🚨 Error connecting to Dashboard: ${e.message}`);
    });

    req.write(data);
    req.end();
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Ensure first event sets focus
sendEvent('state_change', {
    event: 'focus_state_changed',
    state: 'focus',
    to_state: 'focus'
});

setInterval(() => {
    // 5% chance to change focus state
    if (Math.random() < 0.05) {
        isFocused = !isFocused;
        const stateStr = isFocused ? 'focus' : 'idle';
        console.log(`\n🔄 Changing State -> ${stateStr.toUpperCase()}`);
        sendEvent('state_change', {
            event: 'focus_state_changed',
            state: stateStr,
            to_state: stateStr
        });
        return; // Skip other telemetry while idle
    }

    if (!isFocused) return;

    // Simulate different telemetry events
    const rand = Math.random();
    
    if (rand < 0.2) {
        // File switch
        currentFileIndex = (currentFileIndex + 1) % files.length;
        const switches = randomInt(1, 4);
        console.log(`📂 Switched files to ${files[currentFileIndex]} (${switches} switches)`);
        sendEvent('event', {
            event: 'editor_switch_velocity',
            file: files[currentFileIndex],
            language: languages[currentFileIndex],
            switch_count: switches
        });
    } else if (rand < 0.6) {
        // Typing burst
        const chars = randomInt(10, 150);
        totalChars += chars;
        console.log(`⌨️  Typing burst: ${chars} chars in ${files[currentFileIndex]}`);
        sendEvent('event', {
            event: 'typing_burst',
            file: files[currentFileIndex],
            language: languages[currentFileIndex],
            char_count: chars,
            duration_seconds: randomInt(2, 10)
        });
    } else if (rand < 0.8) {
        // Diagnostics (Errors)
        const errors = randomInt(0, 8);
        console.log(`🐛 Diagnostics update: ${errors} errors in ${files[currentFileIndex]}`);
        sendEvent('event', {
            event: 'diagnostics_snapshot',
            file: files[currentFileIndex],
            language: languages[currentFileIndex],
            error_count: errors
        });
    } else {
        // File Save
        console.log(`💾 Saved ${files[currentFileIndex]}`);
        sendEvent('event', {
            event: 'file_saved',
            file: files[currentFileIndex],
            language: languages[currentFileIndex]
        });
    }

}, 2500); // Fire an event every 2.5 seconds
