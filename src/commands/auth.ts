import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { 
  SHOPIFY_URLS, 
  OAUTH_CONFIG, 
  SHOPIFY_SCOPES, 
  SHOPIFY_CLIENT_ID, 
  SHOPIFY_CLIENT_SECRET 
} from '../settings';

interface Credentials {
  accessToken: string;
  shop: string;
  timestamp: number;
}

interface PartnerCredentials {
  accessToken: string;
  tokenType: string;
  timestamp: number;
}


export async function authLoginCommand(): Promise<void> {
  console.log('Starting Shopify Partners OAuth authentication...');
  console.log('This will provide access to all stores you have permissions for.');

  const port = OAUTH_CONFIG.REDIRECT_PORT;
  const redirectUri = `http://localhost:${port}${OAUTH_CONFIG.REDIRECT_PATH}`;

  // Create local server to handle callback
  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url || '', true);

    if (parsedUrl.pathname === '/callback') {
      const { code, error, state } = parsedUrl.query;

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Authentication Error</h1><p>${error}</p>`);
        server.close();
        return;
      }

      if (code) {
        // Exchange code for access token
        exchangePartnerCodeForToken(code as string)
          .then((credentials) => {
            savePartnerCredentials(credentials);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <h1>Authentication Successful!</h1>
              <p>You are now authenticated with Shopify Partners.</p>
              <p>You can now close this window and return to the terminal.</p>
              <script>setTimeout(() => window.close(), 3000);</script>
            `);
            server.close();
            console.log('Authentication successful! Partner credentials saved.');
            console.log('Use "shopify-admin auth stores" to list accessible stores.');
          })
          .catch((err) => {
            console.error('Error exchanging code for token:', err);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h1>Authentication Error</h1><p>Failed to exchange code for token</p>`);
            server.close();
          });
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Authentication Error</h1><p>Missing authorization code</p>`);
        server.close();
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`<h1>Not Found</h1>`);
    }
  });

  server.listen(port, () => {
    console.log(`Local server started on http://localhost:${port}`);
    
    const authUrl = buildPartnerAuthUrl(redirectUri);
    console.log(`Opening browser to: ${authUrl}`);
    console.log('If the browser doesn\'t open automatically, copy and paste the URL above');

    // Try to open browser automatically
    const open = require('child_process').exec;
    const command = process.platform === 'darwin' ? 'open' :
      process.platform === 'win32' ? 'start' : 'xdg-open';
    open(`${command} "${authUrl}"`);
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
  });
}

function buildAuthUrl(shop: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: SHOPIFY_CLIENT_ID,
    scope: SHOPIFY_SCOPES.ADMIN,
    redirect_uri: redirectUri,
    response_type: 'code'
  });

  return `${SHOPIFY_URLS.ADMIN_OAUTH_AUTHORIZE(shop)}?${params.toString()}`;
}

async function exchangeCodeForToken(code: string, shop: string): Promise<Credentials> {
  console.log('Exchanging authorization code for access token...');

  const response = await fetch(SHOPIFY_URLS.ADMIN_OAUTH_TOKEN(shop), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      code: code
    })
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    shop: shop,
    timestamp: Date.now()
  };
}

function saveCredentials(credentials: Credentials): void {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.shopify-admin-cli');
  const credentialsPath = path.join(configDir, 'credentials.json');

  // Create config directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Save credentials
  fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
  console.log(`Credentials saved to: ${credentialsPath}`);
}

function buildPartnerAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: SHOPIFY_CLIENT_ID,
    scope: SHOPIFY_SCOPES.PARTNER,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: 'partner-auth'
  });

  return `${SHOPIFY_URLS.PARTNER_OAUTH_AUTHORIZE}?${params.toString()}`;
}

async function exchangePartnerCodeForToken(code: string): Promise<PartnerCredentials> {
  console.log('Exchanging authorization code for partner access token...');

  const response = await fetch(SHOPIFY_URLS.PARTNER_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code'
    })
  });

  if (!response.ok) {
    throw new Error(`Partner token exchange failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    tokenType: data.token_type || 'Bearer',
    timestamp: Date.now()
  };
}

function savePartnerCredentials(credentials: PartnerCredentials): void {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.shopify-admin-cli');
  const credentialsPath = path.join(configDir, 'partner-credentials.json');

  // Create config directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Save partner credentials
  fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
  console.log(`Partner credentials saved to: ${credentialsPath}`);
}

export function getStoredPartnerCredentials(): PartnerCredentials | null {
  try {
    const homeDir = os.homedir();
    const credentialsPath = path.join(homeDir, '.shopify-admin-cli', 'partner-credentials.json');

    if (fs.existsSync(credentialsPath)) {
      const data = fs.readFileSync(credentialsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading partner credentials:', error);
  }

  return null;
}

export function getStoredCredentials(): Credentials | null {
  try {
    const homeDir = os.homedir();
    const credentialsPath = path.join(homeDir, '.shopify-admin-cli', 'credentials.json');

    if (fs.existsSync(credentialsPath)) {
      const data = fs.readFileSync(credentialsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading credentials:', error);
  }

  return null;
}
