import axios from 'axios';
import { CookieJar, Cookie } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load env vars
dotenv.config();

// ESM __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Types
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface CurrentUser {
  accessToken: string;
  openId: string;
  userId: string;
  apiUser: string;
  operateId: string;
  language: string;
}

interface ApiResponse {
  users: User[];
  currentUser: CurrentUser;
}

// Config
const BASE_URL = 'https://challenge.sunvoy.com';
const CREDENTIALS = {
  email: 'demo@example.org',
  password: 'test'
};
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1s
const COOKIES_FILE = path.join(__dirname, '../.cookies.json');

// Setup axios with cookie jar
const jar = new CookieJar();
const client = wrapper(axios.create({
  withCredentials: true,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json, text/html, */*',
    'Content-Type': 'application/x-www-form-urlencoded'
  }
}));
(client as any).defaults.jar = jar;

// Utils
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const saveToJson = (data: ApiResponse): void => {
  try {
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'users.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Data saved to ${outputPath}`);
  } catch (error) {
    console.error('Error saving to JSON:', error);
    throw error;
  }
};

const saveCookies = async (): Promise<void> => {
  try {
    const cookies = await jar.getCookies(BASE_URL);
    const cookieData = cookies.map(c => ({
      key: c.key,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires
    }));
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookieData, null, 2));
    console.log('Cookies saved to .cookies.json');
  } catch (error) {
    console.error('Error saving cookies:', error);
  }
};

const loadCookies = async (): Promise<boolean> => {
  try {
    if (!fs.existsSync(COOKIES_FILE)) {
      return false;
    }
    const cookieData = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
    for (const cookie of cookieData) {
      const cookieStr = `${cookie.key}=${cookie.value}`;
      await jar.setCookie(cookieStr, BASE_URL);
    }
    console.log('Cookies loaded from .cookies.json');
    return true;
  } catch (error) {
    console.error('Error loading cookies:', error);
    return false;
  }
};

async function retryRequest<T>(
  requestFn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error as Error;
      console.log(`Attempt ${i + 1} failed: ${lastError.message}`);
      if (i < maxRetries - 1) {
        await delay(RETRY_DELAY * (i + 1));
      }
    }
  }
  
  throw lastError;
}

function extractNonce(html: string): string | null {
  const match = html.match(/name=["']nonce["']\s+value=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

// Main
async function main() {
  let loginSuccess = false;
  let usersFetched = false;
  let currentUserFetched = false;
  let tokensFetched = false;
  let jsonCreated = false;
  let loginRedirectLocation = '';

  try {
    // Try loading saved cookies
    const cookiesLoaded = await loadCookies();
    if (cookiesLoaded) {
      try {
        const testResponse = await client.get(`${BASE_URL}/list`);
        if (testResponse.status === 200) {
          loginSuccess = true;
          console.log('Reused existing session');
        }
      } catch (error) {
        console.log('Session expired, logging in again...');
      }
    }

    if (!loginSuccess) {
      // Get login page for nonce
      console.log('Fetching login page for nonce...');
      const loginPageResp = await client.get(`${BASE_URL}/login`, { headers: { Accept: 'text/html' } });
      const nonce = extractNonce(loginPageResp.data);
      if (!nonce) {
        console.error('First 500 chars of login page HTML:', loginPageResp.data.slice(0, 500));
        throw new Error('Nonce not found on login page');
      }
      console.log('Nonce extracted:', nonce);
      
      // Debug login form
      const formMatch = loginPageResp.data.match(/<form[\s\S]*?<\/form>/i);
      if (formMatch) {
        console.log('Login form HTML:', formMatch[0]);
      }

      // Login
      console.log('Attempting to login...');
      const params = new URLSearchParams();
      params.append('username', CREDENTIALS.email);
      params.append('password', CREDENTIALS.password);
      params.append('nonce', nonce);

      const loginResponse = await retryRequest(async () => {
        const response = await client.post(`${BASE_URL}/login`, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json, text/html, */*',
            'Referer': `${BASE_URL}/login`,
            'Origin': BASE_URL
          },
          maxRedirects: 0,
          validateStatus: (status) => status === 302 || status === 200
        });

        if (response.status === 302 && response.headers['location']) {
          loginRedirectLocation = response.headers['location'];
        }
        if (response.status !== 302 && response.status !== 200) {
          throw new Error('Login failed');
        }
        return response;
      });

      loginSuccess = true;
      console.log('Login successful');
      console.log('Login redirect location:', loginRedirectLocation);
      
      // Debug cookies
      const cookies = await jar.getCookies(BASE_URL);
      console.log('Cookies after login:', cookies.map(c => `${c.key}=${c.value}`).join('; '));
      
      await saveCookies();
    }

    // Get users
    console.log('Fetching users...');
    let users: any[] = [];
    let usersFetchedEndpoint = '';
    
    try {
      const usersResponse = await retryRequest(async () => {
        const response = await client.post(`${BASE_URL}/api/users`);
        if (!Array.isArray(response.data)) {
          throw new Error('Invalid users data format');
        }
        return response;
      });
      users = usersResponse.data.slice(0, 10);
      usersFetchedEndpoint = '/api/users (POST)';
    } catch (err: any) {
      console.log('POST /api/users failed:', err.message);
    }

    if (!users.length) {
      // Debug: try getting /list page
      try {
        const listResp = await client.get(`${BASE_URL}/list`);
        console.log('First 2000 chars of /list HTML:', listResp.data.slice(0, 2000));
        
        // Look for JS file
        const jsMatch = listResp.data.match(/<script src="(\/js\/list\.[^"]+)"/);
        if (jsMatch) {
          const jsPath = jsMatch[1];
          const jsResp = await client.get(`${BASE_URL}${jsPath}`);
          console.log(`First 2000 chars of ${jsPath}:`, jsResp.data.slice(0, 2000));
        }
      } catch (e) {
        console.log('Error fetching /list or JS:', (e as Error).message);
      }
      throw new Error('Could not fetch users from any known endpoint');
    }
    usersFetched = true;
    console.log(`Fetched ${users.length} users from ${usersFetchedEndpoint}`);

    // Get current user
    console.log('Fetching current user...');
    const currentUserResponse = await retryRequest(async () => {
      const response = await client.get(`${BASE_URL}/settings/tokens`);
      if (!response.data) {
        throw new Error('Empty token settings response');
      }
      
      const $ = cheerio.load(response.data);
      const userData: CurrentUser = {
        accessToken: String($('#access_token').val() || ''),
        openId: String($('#openId').val() || ''),
        userId: String($('#userId').val() || ''),
        apiUser: String($('#apiuser').val() || ''),
        operateId: String($('#operateId').val() || ''),
        language: String($('#language').val() || '')
      };
      return { data: userData };
    });
    const currentUser = currentUserResponse.data;
    currentUserFetched = true;
    console.log('Current user fetched successfully');

    // Get tokens
    console.log('Fetching token settings...');
    const tokenResponse = await retryRequest(async () => {
      const response = await client.get(`${BASE_URL}/settings/tokens`);
      if (!response.data) {
        throw new Error('Empty token settings response');
      }
      
      const $ = cheerio.load(response.data);
      // Add token data to currentUser
      currentUser.accessToken = String($('#access_token').val() || '');
      currentUser.openId = String($('#openId').val() || '');
      currentUser.userId = String($('#userId').val() || '');
      currentUser.apiUser = String($('#apiuser').val() || '');
      currentUser.operateId = String($('#operateId').val() || '');
      currentUser.language = String($('#language').val() || '');
      
      return { data: currentUser };
    });
    tokensFetched = true;
    console.log('Tokens fetched and saved');

    // Save everything
    const data: ApiResponse = {
      users,
      currentUser
    };

    saveToJson(data);
    jsonCreated = true;

    // Print summary
    console.log('\n=== Execution Summary ===');
    console.log(`Login: ${loginSuccess ? 'Success' : 'Fail'}`);
    console.log(`User List: ${usersFetched ? 'Fetched' : 'Failed'}`);
    console.log(`Current User: ${currentUserFetched ? 'Fetched' : 'Failed'}`);
    console.log(`Token Settings: ${tokensFetched ? 'Fetched' : 'Failed'}`);
    console.log(`users.json: ${jsonCreated ? 'Created successfully' : 'Failed'} with ${users.length + 1} entries`);

  } catch (error) {
    console.error('\n=== Error Summary ===');
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error occurred');
    console.log('\n=== Execution Summary ===');
    console.log(`Login: ${loginSuccess ? 'Success' : 'Fail'}`);
    console.log(`User List: ${usersFetched ? 'Fetched' : 'Failed'}`);
    console.log(`Current User: ${currentUserFetched ? 'Fetched' : 'Failed'}`);
    console.log(`Token Settings: ${tokensFetched ? 'Fetched' : 'Failed'}`);
    console.log(`users.json: ${jsonCreated ? 'Created successfully' : 'Failed'}`);
    process.exit(1);
  }
}

// Run it
main(); 