const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { BrowserWindow } = require('electron');

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

async function authorize() {
  // Check if credentials file exists before proceeding
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error("Missing credentials.json. Please add your Google OAuth client secrets.");
  }

  const credentials = require(CREDENTIALS_PATH);
  const { client_id, client_secret, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // 1. Check for existing session
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    
    // Optional: Check if token is expired and refresh it
    return oAuth2Client;
  }

  // 2. If no token, trigger the UI flow
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
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
          resolve(oAuth2Client); // Only resolves once authorized
        } catch (e) {
          reject(e);
        }
      }
    });

    authWindow.on('closed', () => reject(new Error("Authorization cancelled by user")));
  });
}

module.exports = { authorize };