// One-time script to generate a stable Gmail OAuth2 refresh token.
// The OAuth Playground auto-revokes tokens — this generates one that persists.
//
// Steps:
//   1. Add http://localhost:3000/callback to Authorized redirect URIs in Google Cloud Console
//   2. cd medassist/server && node scripts/get-gmail-token.js
//   3. Open the URL printed in terminal, sign in as siddharthbhamare01@gmail.com
//   4. Copy GMAIL_REFRESH_TOKEN printed here → add to Render env vars

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http = require('http');
const { parse } = require('url');
const { OAuth2Client } = require('google-auth-library');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT = 'http://localhost:3000/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing from .env');
  process.exit(1);
}

const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT);

const authUrl = client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://mail.google.com/'],
  prompt: 'consent',
});

console.log('\nOpen this URL in your browser and sign in as siddharthbhamare01@gmail.com:\n');
console.log(authUrl);
console.log('\nWaiting...\n');

const server = http.createServer(async (req, res) => {
  try {
    const { code } = parse(req.url, true).query;
    if (!code) { res.end('No code.'); return; }
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      res.end('No refresh_token returned. Revoke app access at myaccount.google.com/permissions and re-run.');
      console.error('No refresh_token. Revoke existing access and retry.');
      server.close();
      return;
    }
    res.end('<h2>Done — check your terminal.</h2>');
    console.log('\n✅ Add this to Render environment variables:\n');
    console.log('GMAIL_REFRESH_TOKEN=' + tokens.refresh_token + '\n');
    server.close();
  } catch (err) {
    res.end('Error: ' + err.message);
    console.error(err);
    server.close();
  }
});

server.listen(3000);
