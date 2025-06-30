// googleAuth.ts
import fs from 'node:fs/promises';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import { google } from 'googleapis';
import open from 'open';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const TOKEN_PATH = path.join(process.cwd(), '.gcal_token.json');

/**
 * Returns an authenticated Google Calendar client.
 * First tries the cached refresh-token file; if absent, runs the OAuth
 * installed-app flow and saves the new token.
 */
export async function getCalendarClient() {
  const creds = JSON.parse(await fs.readFile('credentials.json', 'utf8'));
  const { client_secret, client_id } = creds.installed;

  // ---------- fast path: reuse cached token ----------
  try {
    const cached = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));
    const oAuth2 = new google.auth.OAuth2(client_id, client_secret);
    oAuth2.setCredentials(cached);
    return google.calendar({ version: 'v3', auth: oAuth2 });
  } catch {
    /* fall through to interactive login */
  }

  // ---------- interactive path ----------
  const tokens = await runInteractiveAuth(client_id, client_secret);
  const oAuth2 = new google.auth.OAuth2(client_id, client_secret);
  oAuth2.setCredentials(tokens);

  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens), { mode: 0o600 });
  console.log('Token stored to', TOKEN_PATH);

  return google.calendar({ version: 'v3', auth: oAuth2 });
}

/**
 * Runs an installed-app OAuth flow that captures the redirect on 127.0.0.1.
 * Returns the `tokens` object Google gives back.
 */
function runInteractiveAuth(clientId: string, clientSecret: string): Promise<any> {
  return new Promise((resolve, reject) => {
    let redirectUri = '';

    // 1️⃣  spin up a throw-away local server
    const server = http.createServer(async (req, res) => {
      try {
        const { searchParams } = new URL(req.url || '/', `http://dummy`);
        const code = searchParams.get('code');
        const error = searchParams.get('error');

        if (error) {
          reject(new Error(`OAuth error: ${error}`));
          res.end('❌ Authentication failed. You can close this tab.');
          server.close();
          return;
        }
        if (!code) {
          res.end('No code found on this request.');
          return;
        }

        // 2️⃣  exchange code → tokens
        const oAuth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        const { tokens } = await oAuth2.getToken(code);

        res.end('✅ Authentication complete! You can close this tab.');
        server.close();

        resolve(tokens);
      } catch (e) {
        reject(e);
        server.close();
      }
    });

    // 3️⃣  once server is listening, build redirect URI & open browser
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      redirectUri = `http://127.0.0.1:${port}`; // loopback redirect
      const oAuth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

      const authUrl = oAuth2.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
      });

      console.log('Opening browser for Google authorization…');
      open(authUrl).catch(() =>
        console.log('If the browser did not open, paste this URL into it:\n', authUrl),
      );
    });
  });
}
