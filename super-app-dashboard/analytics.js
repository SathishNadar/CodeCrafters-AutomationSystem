/**
 * ContextBridge Analytics Engine
 * Processes incoming VS Code signals into actionable cognitive insights.
 */

const STATE_LABELS = {
    deep_focus: { label: 'Deep Focus', icon: 'psychology', color: 'text-blue-400', border: 'border-blue-500', bg: 'bg-blue-500/10', desc: "You're in the zone. Protect this time." },
    bug_hunt:   { label: 'Bug Hunt',   icon: 'bug_report', color: 'text-red-400',  border: 'border-red-500',  bg: 'bg-red-500/10',  desc: 'High cognitive load. Take it one error at a time.' },
    exploring:  { label: 'Exploring',  icon: 'travel_explore', color: 'text-yellow-400', border: 'border-yellow-500', bg: 'bg-yellow-500/10', desc: 'Context switching detected. Mapping the codebase?' },
    idle:       { label: 'Idle',       icon: 'pause_circle', color: 'text-gray-400', border: 'border-gray-500', bg: 'bg-gray-500/10', desc: 'No activity for 3+ minutes. Taking a break?' },
    shipping:   { label: 'Shipping',   icon: 'rocket_launch', color: 'text-green-400', border: 'border-green-500', bg: 'bg-green-500/10', desc: 'Clean code, clean saves. Shipping mode.' },
};

// Internal state store
const store = {
    currentState: 'idle',
    stateStartTime: Date.now(),
    cognitiveLoad: 0,
    session: {
        focusMinutes: 0,
        saves: 0,
        commits: 0,
        primaryLanguage: '—',
        sessionStart: Date.now(),
        langCounts: {},
    },
    lastErrorCount: 0,
    lastSwitchVelocity: 0,
    recommendations: [],
    eventLog: [],
};

/**
 * Main entry — called by renderer.js on every vscode-event.
 * Returns a full snapshot of the current cognitive state for UI rendering.
 */
function processEvent(payload) {
    store.eventLog.push(payload);
    if (store.eventLog.length > 200) store.eventLog.shift();

    const { event, duration_seconds, switch_count, error_count, from_state, to_state, language, saves, commits } = payload;

    // Update session stats
    if (event === 'file_saved') store.session.saves++;
    if (event === 'git_commit_detected') store.session.commits++;
    if (language && language !== 'plaintext') {
        store.session.langCounts[language] = (store.session.langCounts[language] || 0) + 1;
        store.session.primaryLanguage = Object.entries(store.session.langCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    }
    if (event === 'typing_burst' && duration_seconds) {
        store.session.focusMinutes += Math.floor(duration_seconds / 60);
    }

    // Update raw metrics
    if (event === 'diagnostics_snapshot' && error_count !== undefined) {
        store.lastErrorCount = error_count;
    }
    if (event === 'editor_switch_velocity' && switch_count !== undefined) {
        store.lastSwitchVelocity = switch_count;
    }

    // Update cognitive load (0-100)
    store.cognitiveLoad = Math.min(100, Math.round(
        (store.lastErrorCount * 3.5) + (store.lastSwitchVelocity * 2.5)
    ));

    // Update state from engine
    if (event === 'focus_state_changed' && to_state) {
        store.currentState = to_state;
        store.stateStartTime = Date.now();
    }

    // Generate recommendations
    store.recommendations = generateRecommendations();

    return snapshot();
}

function generateRecommendations() {
    const recs = [];
    const focusMinSinceStart = (Date.now() - store.stateStartTime) / 60000;

    if (store.currentState === 'deep_focus' && focusMinSinceStart > 90) {
        recs.push({
            icon: 'self_improvement',
            color: 'text-blue-400',
            title: 'Flow State Detected',
            text: `You've been deep focused for ${Math.round(focusMinSinceStart)} minutes. A 5-min break will boost retention.`,
            action: 'Take a Break'
        });
    }
    if (store.lastErrorCount > 10) {
        recs.push({
            icon: 'crisis_alert',
            color: 'text-red-400',
            title: 'High Error Count',
            text: `${store.lastErrorCount} errors detected. Consider reviewing core logic before writing more code.`,
            action: 'View Errors'
        });
    }
    if (store.lastSwitchVelocity > 8) {
        recs.push({
            icon: 'warning',
            color: 'text-yellow-400',
            title: 'Context Switching',
            text: `${store.lastSwitchVelocity} file switches/min. High context switching raises cognitive load.`,
            action: 'Focus on One File'
        });
    }
    if (store.cognitiveLoad > 70) {
        recs.push({
            icon: 'monitor_heart',
            color: 'text-orange-400',
            title: 'Cognitive Load Alert',
            text: 'Your cognitive load score is high. Consider closing unused tabs and breaking the problem down.',
            action: 'Simplify'
        });
    }

    return recs;
}

function snapshot() {
    const stateInfo = STATE_LABELS[store.currentState] || STATE_LABELS.idle;
    const timeInState = Math.round((Date.now() - store.stateStartTime) / 60000);
    const sessionMinutes = Math.round((Date.now() - store.session.sessionStart) / 60000);

    return {
        state: store.currentState,
        stateInfo,
        timeInState,
        cognitiveLoad: store.cognitiveLoad,
        session: {
            ...store.session,
            sessionMinutes,
        },
        recommendations: store.recommendations,
    };
}

function getSnapshot() {
    return snapshot();
}

module.exports = { processEvent, getSnapshot };
