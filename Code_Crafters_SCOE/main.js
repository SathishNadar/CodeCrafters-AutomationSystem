const { app } = require('electron');
const { authorize } = require('./auth');
const { getUnreadEmails } = require('./gmail');
const { analyzeMessage } = require('./analyzer');

app.whenReady().then(async () => {
  try {
    const auth = await authorize();
    console.log("Authorization Successful. Starting Email Sync...");

    const seen = new Set(); 

    const syncEmails = async () => {
      try {
        const emails = await getUnreadEmails(auth);

        if (emails && emails.length > 0) {
          // Track if any NEW emails were actually processed in this batch
          let newMailsProcessed = 0;

          for (let email of emails) {
            if (seen.has(email.id)) continue;
            seen.add(email.id);
            newMailsProcessed++;

            console.log(`\n New Email: "${email.subject}" from ${email.from}`);
            console.log(" Analyzing for tasks...");

            const contentToAnalyze = `Subject: ${email.subject}\nContent: ${email.snippet}`;
            const result = await analyzeMessage(contentToAnalyze);

            if (result && result !== "SKIP") {
              console.log("--------------------------");
              console.log(result); 
              console.log("--------------------------");
            } else {
              console.log("No actionable task found.");
            }
          }

          // Print completion message after the loop finishes
          if (newMailsProcessed > 0) {
            console.log("\nDone: Read all new mails.");
          }
        } else {
          // If the list was empty from the start
          console.log("No unread mails found.");
        }

      } catch (loopError) {
        console.error("Sync Loop Error:", loopError.message);
      } finally {
        // Schedule next check in 60 seconds to save API calls
        setTimeout(syncEmails, 60000);
      }
    };

    // Start first sync
    syncEmails();

  } catch (err) {
    console.error("Critical Startup Error:", err);
  }
});