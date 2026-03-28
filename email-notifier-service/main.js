const fs = require('fs');
const path = require('path');
const { authorize } = require('./auth');
const { getUnreadEmails, sendReply } = require('./gmail');
const { analyzeMessage } = require('./analyzer');

const SEEN_FILE = path.join(__dirname, 'seen_emails.json');

// Store global references so IPC can use them
let globalAuth = null;
let globalSeen = new Set();
let globalOnAnalysis = null;
let syncTimeout = null;

async function performSync(auth, seen, onAnalysis) {
  try {
    console.log(`[EmailMonitor] Checking Gmail @ ${new Date().toLocaleTimeString()}...`);
    const emails = await getUnreadEmails(auth);

    if (emails && emails.length > 0) {
      let newMailsProcessed = 0;
      let newlySeen = false;

      for (let email of emails) {
        if (seen.has(email.id)) continue;
        seen.add(email.id);
        newlySeen = true;
        newMailsProcessed++;

        console.log(`[EmailMonitor] Found New Email: "${email.subject}" from ${email.from}`);
        const contentToAnalyze = `Subject: ${email.subject}\nContent: ${email.snippet}`;
        const analysis = await analyzeMessage(contentToAnalyze);

        if (analysis) {
           onAnalysis(email, analysis);
        } else {
           onAnalysis(email, {
              priority: 'Low',
              task: 'No explicit action required',
              deadline: 'None',
              sender: email.from.split('<')[0].trim()
           });
        }
      }

      if (newlySeen) {
        fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen]));
      }

      if (newMailsProcessed > 0) {
        console.log(`[EmailMonitor] Done: Processed ${newMailsProcessed} unread emails.`);
      }
    }
  } catch (error) {
    console.error("[EmailMonitor] Sync Loop Error:", error.message);
  }
}

/**
 * Starts the background email monitoring loop.
 */
async function startEmailMonitor(onAnalysis) {
  try {
    globalAuth = await authorize();
    globalOnAnalysis = onAnalysis;
    console.log("[EmailMonitor] Authorization Successful. Starting background sync...");

    if (fs.existsSync(SEEN_FILE)) {
      try {
        const seenArray = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
        globalSeen = new Set(seenArray);
      } catch (e) {
        console.error("[EmailMonitor] Error loading seen_emails.json, starting fresh.");
      }
    }

    const syncLoop = async () => {
      await performSync(globalAuth, globalSeen, globalOnAnalysis);
      syncTimeout = setTimeout(syncLoop, 60000);
    };

    // Start first sync
    syncLoop();
  } catch (err) {
    console.error("[EmailMonitor] Critical Initialization Error:", err.message);
  }
}

async function forceSync() {
  if (!globalAuth || !globalOnAnalysis) return;
  console.log("[EmailMonitor] 🔄 Force Sync triggered");
  clearTimeout(syncTimeout);
  await performSync(globalAuth, globalSeen, globalOnAnalysis);
  syncTimeout = setTimeout(async () => {
    await performSync(globalAuth, globalSeen, globalOnAnalysis);
  }, 60000);
}

async function sendEmailReply(to, subject, body, threadId, messageId) {
  if (!globalAuth) throw new Error("Not authenticated");
  return await sendReply(globalAuth, to, subject, body, threadId, messageId);
}

module.exports = { startEmailMonitor, forceSync, sendEmailReply };