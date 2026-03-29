const { exec } = require('child_process');
const { Notification } = require('electron');
const RulesEngineTester = require('./test-rules.js');
const tester = new RulesEngineTester();

console.log('🔴 SCENARIO: User is AWAY, URGENT message arrives\n');

// Function to play system beep (Windows compatible)
function playBeep() {
    // On Windows, use PowerShell to play a beep
    exec('powershell -c [console]::beep(800, 300)', (err) => {
        if (err) console.log('Note: Beep not available, continuing with visual alert...');
    });
}

// Simulate alarm with beeps
console.log('🔊 Playing alarm sound...\n');
for (let i = 0; i < 20; i++) {
    setTimeout(() => playBeep(), i * 400);
}

setTimeout(() => {
    tester.testUrgentAlarmRule('Real-world test');
}, 1500);
