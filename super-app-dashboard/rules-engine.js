const fs = require('fs');
const path = require('path');
const { ipcMain, Notification } = require('electron');
const { exec } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'rules-config.json');

// Idle time tracking (in milliseconds)
const IDLE_THRESHOLD = 15 * 60 * 1000; // 15 minutes
let idleStartTime = null;

// List of predefined "Recipes"
const RULES_DEF = [
    {
        id: 'rule_deep_work',
        title: 'Deep Work Shield',
        description: 'When VS Code logic detects HIGH FOCUS, suppress all WhatsApp and Email notifications except those marked HIGH or URGENT priority by AI.',
        active: false,
    },
    {
        id: 'rule_distraction',
        title: 'Distraction Interceptor',
        description: 'When the Web Extension detects distracted scrolling (e.g. YouTube > 5 mins) during work hours, force a desktop push notification warning.',
        active: false,
    },
    {
        id: 'rule_focus_reply',
        title: 'Focused Auto-Responder',
        description: 'When VS Code detects HIGH FOCUS, automatically reply to incoming LOW priority messages/emails saying you are busy and will review them later.',
        active: false,
    },
    {
        id: 'rule_urgent_alarm',
        title: 'Urgent Escalation Alarm',
        description: 'When system is globally IDLE (you are away) and an URGENT priority message arrives, bypass silent mode and trigger a loud, looping audio alarm on the computer.',
        active: false,
    }
];

// Current State Tracking
let activeRules = {};
let globalContext = {
    isFocused: false,       // Controlled by VS Code WsBridge
    isIdle: false,          // Controlled by VS Code WsBridge / Browser Pipeline
    isDistracted: false,    // Controlled by Browser Pipeline
    distractionStartTime: 0
};

// Internal reference for the distraction timer check
let distractionInterval = null;

function loadRules() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            RULES_DEF.forEach(r => {
                if (saved.hasOwnProperty(r.id)) r.active = saved[r.id];
                activeRules[r.id] = r.active;
            });
        } else {
            RULES_DEF.forEach(r => activeRules[r.id] = r.active);
            saveRules();
        }
    } catch (e) {
        console.error('[RulesEngine] Error loading rules:', e);
    }
}

function saveRules() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(activeRules, null, 2));
    } catch (e) {
        console.error('[RulesEngine] Error saving rules:', e);
    }
}

/**
 * Updates the global context states from telemetry inputs (VS Code, Web Ext).
 * @param {Object} updates - e.g. { isFocused: true, isIdle: false }
 */
function updateContext(updates) {
    if (updates.hasOwnProperty('isFocused')) globalContext.isFocused = updates.isFocused;
    if (updates.hasOwnProperty('isIdle')) {
        globalContext.isIdle = updates.isIdle;
        updateIdleTracking(updates.isIdle); // Track idle time
    }

    if (updates.hasOwnProperty('isDistracted')) {
        const wasDistracted = globalContext.isDistracted;
        globalContext.isDistracted = updates.isDistracted;

        if (globalContext.isDistracted && !wasDistracted) {
            // Began getting distracted
            globalContext.distractionStartTime = Date.now();
            startDistractionTimer();
        } else if (!globalContext.isDistracted) {
            // Stopped being distracted
            globalContext.distractionStartTime = 0;
            if (distractionInterval) clearInterval(distractionInterval);
        }
    }
}

/**
 * Checks if the user has been distracted for > 5 minutes (300000ms).
 * Only fires if `rule_distraction` is active.
 */
function startDistractionTimer() {
    if (distractionInterval) clearInterval(distractionInterval);
    
    // Check every minute
    distractionInterval = setInterval(() => {
        if (!isRuleActive('rule_distraction') || !globalContext.isDistracted) {
            clearInterval(distractionInterval);
            return;
        }

        const distractedForMs = Date.now() - globalContext.distractionStartTime;
        if (distractedForMs > 5 * 60 * 1000) {  // 5 Minutes
            console.log('[RulesEngine] Firing Distraction Interceptor Warning!');
            new Notification({
                title: 'Distraction Alert',
                body: "You've been distracted for over 5 minutes. Time to get back to coding in VS Code!",
                urgency: 'critical'
            }).show();
            
            // Only fire it once per distraction block
            clearInterval(distractionInterval);
        }
    }, 60000);
}

/**
 * Plays alarm beep sound (Windows compatible)
 * @param {number} frequency - Frequency in Hz (default: 800)
 * @param {number} duration - Duration in ms (default: 300)
 */
function playBeep(frequency = 800, duration = 300) {
    return new Promise((resolve) => {
        exec(`powershell -c [console]::beep(${frequency}, ${duration})`, (err) => {
            if (err) console.log('[RulesEngine] Beep unavailable, continuing with notification...');
            resolve();
        });
    });
}

function getContext() {
    return globalContext;
}

/**
 * Triggers urgent alarm with sound + notification
 * Called when:
 * 1. User is IDLE for 15+ minutes
 * 2. rule_urgent_alarm is ACTIVE
 * 3. URGENT priority notification arrives
 */
async function triggerUrgentAlarm(notificationData) {
    if (!isRuleActive('rule_urgent_alarm')) {
        console.log('[RulesEngine] Urgent alarm rule not active, skipping...');
        return;
    }

    // Check if user has been idle for 15+ minutes
    const isIdleEnough = globalContext.isIdle && 
                        (idleStartTime && (Date.now() - idleStartTime) >= IDLE_THRESHOLD);

    if (!isIdleEnough) {
        console.log('[RulesEngine] User not idle for 15+ minutes, skipping urgent alarm...');
        return;
    }

    console.log('[RulesEngine] ⚠️  URGENT ALARM TRIGGERED!');
    console.log(`[RulesEngine] Conditions met: Idle=${globalContext.isIdle}, IdleTime=${
        idleStartTime ? Math.round((Date.now() - idleStartTime) / 1000 / 60) : 0
    }min, Rule=ACTIVE`);

    // Play alarm beep sequence
    console.log('[RulesEngine] 🔊 Playing alarm beeps...');
    const alarmPattern = [
        { freq: 800, dur: 200 },
        { freq: 800, dur: 200 },
        { freq: 1000, dur: 300 }
    ];

    for (const beep of alarmPattern) {
        await playBeep(beep.freq, beep.dur);
        await new Promise(r => setTimeout(r, 150));
    }

    // Send Windows notification with urgent alert
    try {
        new Notification({
            title: '🚨 URGENT MESSAGE ALERT',
            body: `You have an URGENT ${notificationData?.source || 'notification'} from ${notificationData?.from || 'someone'}. You've been away for ${idleStartTime ? Math.round((Date.now() - idleStartTime) / 1000 / 60) : '?'} minutes.`,
            urgency: 'critical',
            timeoutType: 'never'
        }).show();
        console.log('[RulesEngine] ✅ Windows notification sent');
    } catch (e) {
        console.error('[RulesEngine] Failed to send notification:', e.message);
    }
}

/**
 * Updates idle tracking when context changes
 */
function updateIdleTracking(isIdle) {
    if (isIdle && !idleStartTime) {
        idleStartTime = Date.now();
        console.log('[RulesEngine] ⏰ User idle timer started');
    } else if (!isIdle && idleStartTime) {
        const idleMinutes = Math.round((Date.now() - idleStartTime) / 1000 / 60);
        console.log(`[RulesEngine] ⏱️ User idle timer stopped (was idle for ${idleMinutes} minutes)`);
        idleStartTime = null;
    }
}

function isRuleActive(id) {
    return activeRules[id] === true;
}

function initialize(mainWindow) {
    loadRules();

    ipcMain.handle('toggle-rule', async (event, ruleId) => {
        const rule = RULES_DEF.find(r => r.id === ruleId);
        if (rule) {
            rule.active = !rule.active;
            activeRules[ruleId] = rule.active;
            saveRules();
            console.log(`[RulesEngine] toggled ${ruleId} -> ${rule.active}`);
        }
        return RULES_DEF;
    });

    console.log('[RulesEngine] Initialized logic core.');
}

module.exports = {
    initialize,
    updateContext,
    isRuleActive,
    getContext,
    triggerUrgentAlarm,
    updateIdleTracking
};
