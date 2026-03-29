const fs = require('fs');
const path = require('path');
const { ipcMain, Notification } = require('electron');

const CONFIG_PATH = path.join(__dirname, 'rules-config.json');

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
    if (updates.hasOwnProperty('isIdle')) globalContext.isIdle = updates.isIdle;

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

function isRuleActive(id) {
    return activeRules[id] === true;
}

function getContext() {
    return globalContext;
}

function initialize(mainWindow) {
    loadRules();

    ipcMain.handle('get-context-rules', async () => {
        return RULES_DEF;
    });

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
    getContext
};
