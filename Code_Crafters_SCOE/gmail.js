const { google } = require('googleapis');

/**
 * Fetches unread emails received today.
 * @param {google.auth.OAuth2} auth - An authorized OAuth2 client.
 */
async function getUnreadEmails(auth) {
  const gmail = google.gmail({ version: 'v1', auth });

  // 1. Calculate today's date in YYYY/MM/DD format
  const today = new Date();
  const dateQuery = today.toISOString().split('T')[0].replace(/-/g, '/');
  
  // 2. Build the query: Unread messages from today only
  const query = `is:unread after:${dateQuery}`;

  try {
    console.log(`Checking Gmail for: "${query}"`);

    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 10 // Limits initial list to the 10 most recent
    });

    if (!res.data.messages || res.data.messages.length === 0) {
      console.log("ℹ No unread emails found from today.");
      return [];
    }

    console.log(`Processing ${res.data.messages.length} messages...`);

    // 3. Parallel fetching to avoid "Getting Stuck"
    const emailPromises = res.data.messages.map(async (msg) => {
      try {
        const data = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata', // ⚡ Faster: skips the heavy HTML body
          metadataHeaders: ['Subject', 'From', 'Date']
        });

        const headers = data.data.payload.headers;
        return {
          id: msg.id,
          subject: headers.find(h => h.name === 'Subject')?.value || "No Subject",
          from: headers.find(h => h.name === 'From')?.value || "Unknown",
          snippet: data.data.snippet || ""
        };
      } catch (err) {
        console.error(`Skip: Could not fetch details for ${msg.id}`);
        return null;
      }
    });

    // Wait for all fetches to finish at once
    const results = await Promise.all(emailPromises);
    return results.filter(email => email !== null);

  } catch (error) {
    console.error("Gmail Sync Error:", error.message);
    return [];
  }
}

module.exports = { getUnreadEmails };