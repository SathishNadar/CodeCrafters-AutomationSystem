/**
 * browser-firestore.js
 * Firebase Firestore integration for WebExtension browser telemetry storage.
 *
 * Mirrors the pattern used in firestore.js (VS Code events) but for browser data.
 *
 * Firestore paths:
 *   browser_sessions/{deviceId}/{date}/data/events   — individual pipeline snapshots
 *   browser_sessions/{deviceId}/{date}/data/stateChanges — focus state transitions
 *   browser_sessions/{deviceId}/{date}/summary        — daily aggregated metrics
 */

const { initializeApp, getApps } = require('firebase/app');
const {
    getFirestore,
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    query,
    orderBy,
    limit,
    serverTimestamp,
} = require('firebase/firestore');

const os = require('os');

// ── Firebase Config (same project as VS Code integration) ──────────────────
const firebaseConfig = {
    apiKey: "AIzaSyBOo_2MQMu28kRXFrtcQYYc54M15_C057I",
    authDomain: "automationsystem-atrangss.firebaseapp.com",
    projectId: "automationsystem-atrangss",
    storageBucket: "automationsystem-atrangss.firebasestorage.app",
    messagingSenderId: "145891927022",
    appId: "1:145891927022:web:c1a7de76e2e19aa2b164ff",
};

// Reuse existing Firebase app if already initialized (shared with firestore.js)
const firebaseApp = getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig);

const db = getFirestore(firebaseApp);

// Stable device ID — same logic as firestore.js so records are linked
const DEVICE_ID = `${os.hostname()}-${os.userInfo().username}`.replace(/[^a-zA-Z0-9-_]/g, '-');

function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

// ── Daily summary accumulator ───────────────────────────────────────────────
const acc = {
    // Focus state time buckets (minutes)
    stateMinutes: {
        active_focus: 0,
        passive_focus: 0,
        distracted: 0,
        idle: 0,
        transitioning: 0,
    },
    // Domain time (ms)
    domainTime: {},           // { 'github.com': ms }
    domainCategory: {},       // { 'github.com': 'productivity' }

    // Metrics samples for averaging
    focusScoreSamples: [],    // 0–1
    scrollDepthSamples: [],   // 0–100

    // Interaction totals
    totalTabSwitches: 0,
    peakTabSwitchRate: 0,

    // Hourly focus map for peak time calculation
    hourlyFocusMs: {},        // { '09': ms }

    // Notification decisions
    notifShown: 0,
    notifDelayed: 0,
    notifSuppressed: 0,

    // Work mode tallies
    workModes: {
        keydown: 0,
        scroll: 0,
        mousemove: 0,
        click: 0,
    },

    // State tracking for time accounting
    currentState: null,
    currentStateStartMs: null,

    lastFlushTime: Date.now(),
    eventCount: 0,            // Total pipeline events received today
};

// ── Helpers ────────────────────────────────────────────────────────────────

function accumulateStateTime(newState) {
    const now = Date.now();
    if (acc.currentState && acc.currentStateStartMs) {
        const elapsedMin = (now - acc.currentStateStartMs) / 60000;
        if (acc.stateMinutes[acc.currentState] !== undefined) {
            acc.stateMinutes[acc.currentState] += elapsedMin;
        }
    }
    acc.currentState = newState;
    acc.currentStateStartMs = now;
}

function accumulateHourlyFocus(state, ts) {
    if (state !== 'active_focus') return;
    const hour = new Date(ts || Date.now()).getHours();
    const key = String(hour).padStart(2, '0');
    acc.hourlyFocusMs[key] = (acc.hourlyFocusMs[key] || 0) + 30000; // ~30s credit per event
}

function getDominantWorkMode(mix) {
    if (!mix) return null;
    const entries = Object.entries(mix).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] || null;
}

function getPeakFocusHour() {
    const entries = Object.entries(acc.hourlyFocusMs);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0]; // e.g. '10' = 10 AM
}

// ── Core write functions ───────────────────────────────────────────────────

/**
 * Called from ws-bridge for every PIPELINE_UPDATE.
 * Writes a lightweight snapshot and updates the daily accumulator.
 */
async function writePipelineSnapshot(payload) {
    try {
        const dateKey = getTodayKey();
        const vector = payload.vector || {};
        const contextState = payload.contextState || {};
        const state = contextState.state || 'transitioning';
        const ts = payload.emittedAt || Date.now();

        // 1. Write lightweight event document
        const eventsRef = collection(
            db, 'browser_sessions', DEVICE_ID, dateKey, 'data', 'events'
        );
        await addDoc(eventsRef, {
            type: 'PIPELINE_UPDATE',
            ts,
            state,
            domain: contextState.currentDomain || vector.currentDomain || null,
            domainCategory: contextState.domainCategory || vector.domainCategory || null,
            focusScore: Math.round((vector.focusScore || 0) * 100) / 100,
            tabSwitchRate1m: vector.tabSwitchRate1m || 0,
            avgScrollDepth: vector.avgScrollDepth || 0,
            interactionDensity: vector.interactionDensity || 0,
            dominantInput: getDominantWorkMode(vector.inputModalityMix),
            timeOnDomainMs: vector.timeOnCurrentDomainMs || 0,
            queueDepth: payload.queueDepth || 0,
            storedAt: serverTimestamp(),
        });

        // 2. Update in-memory accumulator
        accumulateStateTime(state);
        accumulateHourlyFocus(state, ts);

        if (vector.focusScore !== undefined) {
            acc.focusScoreSamples.push(vector.focusScore);
        }
        if (vector.avgScrollDepth > 0) {
            acc.scrollDepthSamples.push(vector.avgScrollDepth);
        }
        if (vector.tabSwitchRate1m > 0) {
            acc.totalTabSwitches += vector.tabSwitchRate1m;
            if (vector.tabSwitchRate1m > acc.peakTabSwitchRate) {
                acc.peakTabSwitchRate = vector.tabSwitchRate1m;
            }
        }

        // Domain time accumulation
        const domain = contextState.currentDomain || vector.currentDomain;
        if (domain && vector.timeOnCurrentDomainMs > 0) {
            acc.domainTime[domain] = (acc.domainTime[domain] || 0) + 30000;
            if (!acc.domainCategory[domain]) {
                acc.domainCategory[domain] = contextState.domainCategory || vector.domainCategory || 'neutral';
            }
        }

        // Work mode tallies
        if (vector.inputModalityMix) {
            for (const [k, v] of Object.entries(vector.inputModalityMix)) {
                if (acc.workModes[k] !== undefined) {
                    acc.workModes[k] += v;
                }
            }
        }

        acc.eventCount++;

        // 3. Auto-flush summary every 60 seconds
        if (Date.now() - acc.lastFlushTime > 60000) {
            await flushBrowserSummary();
        }

    } catch (err) {
        console.error('[BrowserFirestore] writePipelineSnapshot error:', err.message);
    }
}

/**
 * Called from ws-bridge for every STATE_CHANGE event.
 * Records the transition for timeline reconstruction.
 */
async function writeStateChange(payload) {
    try {
        const dateKey = getTodayKey();
        const state = payload.state?.state || payload.state;
        const domain = payload.state?.currentDomain || payload.vector?.currentDomain || null;

        const stateChangesRef = collection(
            db, 'browser_sessions', DEVICE_ID, dateKey, 'data', 'stateChanges'
        );
        await addDoc(stateChangesRef, {
            type: 'STATE_CHANGE',
            fromState: acc.currentState,
            toState: state,
            domain,
            ts: payload.emittedAt || Date.now(),
            storedAt: serverTimestamp(),
        });

        accumulateStateTime(state);
        accumulateHourlyFocus(state, payload.emittedAt);

    } catch (err) {
        console.error('[BrowserFirestore] writeStateChange error:', err.message);
    }
}

/**
 * Called for every NOTIFICATION_DECISION.
 * Tracks how many notifications were shown vs. suppressed vs. delayed.
 */
async function writeNotifDecision(payload) {
    try {
        const action = payload.decision?.action || 'DELAY';
        if (action === 'SHOW') acc.notifShown++;
        else if (action === 'SUPPRESS') acc.notifSuppressed++;
        else acc.notifDelayed++;

        const dateKey = getTodayKey();
        const notifsRef = collection(
            db, 'browser_sessions', DEVICE_ID, dateKey, 'data', 'notifDecisions'
        );
        await addDoc(notifsRef, {
            action,
            priority: payload.decision?.priority || 'MEDIUM',
            reason: payload.decision?.reason || '',
            state: payload.contextState?.state || null,
            ts: Date.now(),
            storedAt: serverTimestamp(),
        });

    } catch (err) {
        console.error('[BrowserFirestore] writeNotifDecision error:', err.message);
    }
}

/**
 * Flush daily summary to Firestore.
 * Path: browser_sessions/{deviceId}/{date}/summary
 */
async function flushBrowserSummary() {
    try {
        const dateKey = getTodayKey();
        const summaryRef = doc(db, 'browser_sessions', DEVICE_ID, dateKey, 'summary');

        const avgFocusScore = acc.focusScoreSamples.length
            ? Math.round((acc.focusScoreSamples.reduce((s, v) => s + v, 0) / acc.focusScoreSamples.length) * 100)
            : 0;

        const avgScrollDepth = acc.scrollDepthSamples.length
            ? Math.round(acc.scrollDepthSamples.reduce((s, v) => s + v, 0) / acc.scrollDepthSamples.length)
            : 0;

        // Top domains by time (top 10)
        const topDomains = Object.entries(acc.domainTime)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([domain, ms]) => ({
                domain,
                minutes: Math.round(ms / 60000),
                category: acc.domainCategory[domain] || 'neutral',
            }));

        // Dominant work mode for the day
        const dominantWorkMode = Object.entries(acc.workModes)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        // State breakdown in minutes (rounded)
        const stateBreakdown = {};
        for (const [state, minutes] of Object.entries(acc.stateMinutes)) {
            stateBreakdown[state] = Math.round(minutes);
        }

        // Peak focus hour
        const peakFocusHour = getPeakFocusHour();

        await setDoc(summaryRef, {
            deviceId: DEVICE_ID,
            date: dateKey,
            totalPipelineEvents: acc.eventCount,
            avgFocusScore,                 // 0-100
            avgScrollDepth,                // 0-100 (%)
            stateBreakdown,                // minutes in each state
            topDomains,                    // [{ domain, minutes, category }]
            dominantWorkMode,              // 'keydown' | 'scroll' | 'mousemove' | 'click'
            peakFocusHour,                 // '09' | '14' etc.
            hourlyFocusMap: acc.hourlyFocusMs,
            notifications: {
                shown: acc.notifShown,
                delayed: acc.notifDelayed,
                suppressed: acc.notifSuppressed,
            },
            peakTabSwitchRate: acc.peakTabSwitchRate,
            lastUpdated: serverTimestamp(),
        }, { merge: true });

        acc.lastFlushTime = Date.now();
        console.log(`[BrowserFirestore] Summary flushed for ${dateKey} — ${acc.eventCount} events, avgFocus: ${avgFocusScore}%`);

    } catch (err) {
        console.error('[BrowserFirestore] flushBrowserSummary error:', err.message);
    }
}

/**
 * Fetch the daily summary for any given date.
 */
async function getBrowserDaySummary(dateKey) {
    try {
        const summaryRef = doc(db, 'browser_sessions', DEVICE_ID, dateKey, 'summary');
        const snap = await getDoc(summaryRef);
        return snap.exists() ? snap.data() : null;
    } catch (err) {
        console.error('[BrowserFirestore] getBrowserDaySummary error:', err.message);
        return null;
    }
}

/**
 * Fetch recent pipeline events for a date (max 100, newest first).
 */
async function getBrowserDayEvents(dateKey) {
    try {
        const eventsRef = collection(
            db, 'browser_sessions', DEVICE_ID, dateKey, 'data', 'events'
        );
        const snap = await getDocs(query(eventsRef, orderBy('storedAt', 'desc'), limit(100)));
        return snap.docs.map(d => d.data());
    } catch (err) {
        console.error('[BrowserFirestore] getBrowserDayEvents error:', err.message);
        return [];
    }
}

/**
 * Flush on app close.
 */
async function onBrowserAppClose() {
    await flushBrowserSummary();
}

module.exports = {
    writePipelineSnapshot,
    writeStateChange,
    writeNotifDecision,
    flushBrowserSummary,
    getBrowserDaySummary,
    getBrowserDayEvents,
    onBrowserAppClose,
    DEVICE_ID,
};
