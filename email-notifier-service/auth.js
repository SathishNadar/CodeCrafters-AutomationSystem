const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const { google } = require('googleapis');
const { BrowserWindow } = require('electron');

const TOKEN_PATH = path.join(__dirname, 'token.json');

async function authorize() {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect_uri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/callback';

  if (!client_id || !client_secret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env file.");
  }

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

  // 1. Check for existing session
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // 2. If no token, trigger the UI flow
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send' 
      ],
      prompt: 'consent'
    });

    const authWindow = new BrowserWindow({ width: 500, height: 650, show: true });
    authWindow.loadURL(authUrl);

    authWindow.webContents.on('will-redirect', async (event, url) => {
      if (url.includes('code=')) {
        event.preventDefault();
        try {
          const code = new URL(url).searchParams.get('code');
          const { tokens } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
          
          authWindow.close();
          resolve(oAuth2Client);
        } catch (e) {
          reject(e);
        }
      }
    });

    authWindow.on('closed', () => reject(new Error("Authorization cancelled by user")));
  });
}

module.exports = { authorize };