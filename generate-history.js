const { doc, setDoc, serverTimestamp } = require('./super-app-dashboard/node_modules/firebase/firestore');
const { db } = require('./super-app-dashboard/firebase-client');
const os = require('os');
const DEVICE_ID = `${os.hostname()}-${os.userInfo().username}`.replace(/[^a-zA-Z0-9-_]/g, '-');

console.log(`🚀 Generating 7 Day Synthetic History for DEVICE_ID: ${DEVICE_ID}`);

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const languages = ['typescript', 'javascript', 'python', 'go', 'css', 'rust'];

async function run() {
    for (let i = 1; i <= 7; i++) {
        // Calculate date key (YYYY-MM-DD) for i days ago
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];

        const summaryRef = doc(db, 'sessions', DEVICE_ID, dateKey, 'summary');

        // Randomized fake aggregates for the day
        const focusMin = randomInt(40, 360);
        const savesCount = randomInt(20, 150);
        const commitsCount = randomInt(0, 8);
        const loadAvg = randomInt(15, 65);
        const primaryLang = languages[randomInt(0, languages.length - 1)];

        const data = {
            deviceId: DEVICE_ID,
            date: dateKey,
            focusMinutes: focusMin,
            saves: savesCount,
            commits: commitsCount,
            primaryLanguage: primaryLang,
            cognitiveLoadAvg: loadAvg,
            stateBreakdown: {
                deep_focus: focusMin * 0.6,
                bug_hunt: focusMin * 0.2,
                exploring: focusMin * 0.1,
                idle: 45,
                shipping: focusMin * 0.1
            },
            lastUpdated: serverTimestamp()
        };

        try {
            await setDoc(summaryRef, data, { merge: true });
            console.log(`✅ Seeded ${dateKey} -> Focus: ${focusMin}min, Lang: ${primaryLang}, Commits: ${commitsCount}`);
        } catch (e) {
            console.error(`❌ Failed to seed ${dateKey}: ${e.message}`);
        }
    }
    
    console.log("🎉 7-Day History Generation Complete! Press Ctrl+C to exit if it hangs on DB connection.");
    process.exit(0);
}

run();
