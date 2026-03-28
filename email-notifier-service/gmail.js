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

    // 3. Parallel fetching
    const emailPromises = res.data.messages.map(async (msg) => {
      try {
        const data = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full' // ⚡ Need full to get body for replies
        });

        const headers = data.data.payload.headers;
        
        // Find body part
        let bodyContent = '';
        function getBody(payload) {
          if (payload.body && payload.body.data) {
             return Buffer.from(payload.body.data, 'base64').toString('utf8');
          }
          if (payload.parts) {
             for (const part of payload.parts) {
                 if (part.mimeType === 'text/plain') {
                     return Buffer.from(part.body.data, 'base64').toString('utf8');
                 }
                 if (part.parts) {
                     const nested = getBody(part);
                     if (nested) return nested;
                 }
             }
          }
          return '';
        }

        bodyContent = getBody(data.data.payload);

        return {
          id: msg.id,
          threadId: data.data.threadId,
          messageId: headers.find(h => h.name.toLowerCase() === 'message-id')?.value || '',
          subject: headers.find(h => h.name === 'Subject')?.value || "No Subject",
          from: headers.find(h => h.name === 'From')?.value || "Unknown",
          snippet: data.data.snippet || "",
          fullContent: bodyContent
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

/**
 * Sends a reply to an email thread via Gmail API.
 */
async function sendReply(auth, to, subject, body, threadId, messageId) {
  const gmail = google.gmail({ version: 'v1', auth });

  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${messageId}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body
  ];
  
  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: threadId 
      }
    });
    console.log(`[Gmail] Reply sent successfully to ${to}`);
    return res.data;
  } catch (err) {
    console.error(`[Gmail] Failed to send reply: ${err.message}`);
    throw err;
  }
}

module.exports = { getUnreadEmails, sendReply };