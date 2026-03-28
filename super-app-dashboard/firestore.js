/**
 * firestore.js
 * Firebase Firestore integration for ContextBridge session storage.
 * Stores all VS Code activity events date-wise in Firestore.
 */

const { initializeApp } = require('firebase/app');
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
    Timestamp
} = require('firebase/firestore');

const firebaseConfig = {
    apiKey: "AIzaSyBOo_2MQMu28kRXFrtcQYYc54M15_C057I",
    authDomain: "automationsystem-atrangss.firebaseapp.com",
    projectId: "automationsystem-atrangss",
    storageBucket: "automationsystem-atrangss.firebasestorage.app",
    messagingSenderId: "145891927022",
    appId: "1:145891927022:web:c1a7de76e2e19aa2b164ff",
    measurementId: "G-4WE31T1HN1"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Unique device/user ID (stored on first run, reused after)
const os = require('os');
const DEVICE_ID = `${os.hostname()}-${os.userInfo().username}`.replace(/[^a-zA-Z0-9-_]/g, '-');

// Get today's date string in YYYY-MM-DD format
function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

// In-memory accumulator for daily summary (prevents excessive Firestore writes)
const summaryAccumulator = {
    focusMinutes: 0,
    saves: 0,
    commits: 0,
    cognitiveLoadSamples: [],
    stateMinutes: { deep_focus: 0, bug_hunt: 0, exploring: 0, idle: 0, shipping: 0 },
    languages: {},
    lastFlushTime: Date.now(),
    currentState: 'idle',
    currentStateStart: Date.now(),
};

/**
 * Write a single activity event to Firestore.
 * Path: sessions/{deviceId}/{date}/events (sub-collection)
 */
async function writeEvent(event) {
    try {
        const dateKey = getTodayKey();
        const eventsRef = collection(db, 'sessions', DEVICE_ID, dateKey, 'data', 'events');
        
        await addDoc(eventsRef, {
            ...event,
            storedAt: serverTimestamp()
        });

        // Update accumulator
        updateAccumulator(event);

        // Flush summary to Firestore every 60 seconds
        if (Date.now() - summaryAccumulator.lastFlushTime > 60000) {
            await flushSummary();
        }
    } catch (err) {
        console.error('[Firestore] writeEvent error:', err.message);
    }
}

function updateAccumulator(event) {
    const { event: evType, duration_seconds, language, error_count, to_state } = event;

    if (evType === 'file_saved') summaryAccumulator.saves++;
    if (evType === 'git_commit_detected') summaryAccumulator.commits++;
    if (evType === 'typing_burst' && duration_seconds) {
        summaryAccumulator.focusMinutes += Math.floor(duration_seconds / 60);
    }
    if (language && language !== 'plaintext') {
        summaryAccumulator.languages[language] = (summaryAccumulator.languages[language] || 0) + 1;
    }
    if (evType === 'diagnostics_snapshot' && error_count !== undefined) {
        summaryAccumulator.cognitiveLoadSamples.push(error_count);
    }
    if (evType === 'focus_state_changed' && to_state) {
        // Calculate time spent in previous state
        const elapsed = Math.round((Date.now() - summaryAccumulator.currentStateStart) / 60000);
        if (summaryAccumulator.stateMinutes[summaryAccumulator.currentState] !== undefined) {
            summaryAccumulator.stateMinutes[summaryAccumulator.currentState] += elapsed;
        }
        summaryAccumulator.currentState = to_state;
        summaryAccumulator.currentStateStart = Date.now();
    }
}

/**
 * Write the daily summary document to Firestore.
 * Path: sessions/{deviceId}/{date}/summary
 */
async function flushSummary() {
    try {
        const dateKey = getTodayKey();
        const summaryRef = doc(db, 'sessions', DEVICE_ID, dateKey, 'summary');

        const primaryLanguage = Object.entries(summaryAccumulator.languages)
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

        const avgLoad = summaryAccumulator.cognitiveLoadSamples.length > 0
            ? Math.round(summaryAccumulator.cognitiveLoadSamples.reduce((a, b) => a + b, 0) / summaryAccumulator.cognitiveLoadSamples.length)
            : 0;

        await setDoc(summaryRef, {
            deviceId: DEVICE_ID,
            date: dateKey,
            focusMinutes: summaryAccumulator.focusMinutes,
            saves: summaryAccumulator.saves,
            commits: summaryAccumulator.commits,
            primaryLanguage,
            cognitiveLoadAvg: avgLoad,
            stateBreakdown: summaryAccumulator.stateMinutes,
            lastUpdated: serverTimestamp()
        }, { merge: true });

        summaryAccumulator.lastFlushTime = Date.now();
        console.log(`[Firestore] Summary flushed for ${dateKey}`);
    } catch (err) {
        console.error('[Firestore] flushSummary error:', err.message);
    }
}

/**
 * Read the summary for a specific date.
 */
async function getDaySummary(dateKey) {
    try {
        const summaryRef = doc(db, 'sessions', DEVICE_ID, dateKey, 'summary');
        const snap = await getDoc(summaryRef);
        if (snap.exists()) return snap.data();
        return null;
    } catch (err) {
        console.error('[Firestore] getDaySummary error:', err.message);
        return null;
    }
}

/**
 * Fetch all event documents for a given date (max 100).
 */
async function getDayEvents(dateKey) {
    try {
        const eventsRef = collection(db, 'sessions', DEVICE_ID, dateKey, 'data', 'events');
        const snap = await getDocs(query(eventsRef, orderBy('storedAt', 'desc'), limit(100)));
        return snap.docs.map(d => d.data());
    } catch (err) {
        console.error('[Firestore] getDayEvents error:', err.message);
        return [];
    }
}

/**
 * Flush final summary on app close.
 */
async function onAppClose() {
    await flushSummary();
}

module.exports = { writeEvent, flushSummary, getDaySummary, getDayEvents, onAppClose, DEVICE_ID };
