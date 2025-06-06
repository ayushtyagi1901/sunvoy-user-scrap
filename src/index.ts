import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load environment variables
dotenv.config();

// ESM-compatible __dirname
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

// Constants
const BASE_URL = 'https://challenge.sunvoy.com';
const CREDENTIALS = {
  email: 'demo@example.org',
  password: 'test'
};
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const COOKIES_FILE = path.join(__dirname, '../.cookies.json');

// Setup axios with cookie support
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

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to save data to JSON file
const saveToJson = (users: User[]): void => {
  try {
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'users.json');
    fs.writeFileSync(outputPath, JSON.stringify(users, null, 2));
    console.log(`✅ Users saved to ${outputPath}`);
  } catch (error) {
    console.error('❌ Error saving to JSON:', error);
    throw error;
  }
};

// Helper function to save cookies
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
    console.log('🍪 Cookies saved');
  } catch (error) {
    console.error('❌ Error saving cookies:', error);
  }
};

// Helper function to load cookies
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
    console.log('🍪 Cookies loaded');
    return true;
  } catch (error) {
    console.error('❌ Error loading cookies:', error);
    return false;
  }
};

// Helper function to retry failed requests
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
      console.log(`⚠️ Attempt ${i + 1} failed: ${lastError.message}`);
      if (i < maxRetries - 1) {
        await delay(RETRY_DELAY * (i + 1));
      }
    }
  }
  
  throw lastError;
}

// Helper to extract nonce from HTML
function extractNonce(html: string): string | null {
  const match = html.match(/name=["']nonce["']\s+value=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

// Main function to handle authentication and data fetching
async function main() {
  let loginSuccess = false;

  try {
    // Try to load saved cookies first
    const cookiesLoaded = await loadCookies();
    if (cookiesLoaded) {
      try {
        const testResponse = await client.get(`${BASE_URL}/list`);
        if (testResponse.status === 200) {
          loginSuccess = true;
          console.log('✅ Reused existing session');
        }
      } catch (error) {
        console.log('⚠️ Session expired, logging in again...');
      }
    }

    if (!loginSuccess) {
      // Get login page for nonce
      console.log('🔑 Getting login page...');
      const loginPageResp = await client.get(`${BASE_URL}/login`, { 
        headers: { Accept: 'text/html' } 
      });
      
      const nonce = extractNonce(loginPageResp.data);
      if (!nonce) {
        throw new Error('Could not find nonce on login page');
      }

      // Login with credentials
      console.log('🔐 Logging in...');
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

        if (response.status !== 302 && response.status !== 200) {
          throw new Error('Login failed');
        }
        return response;
      });

      loginSuccess = true;
      console.log('✅ Login successful');
      await saveCookies();
    }

    // Fetch users
    console.log('👥 Fetching users...');
    const usersResponse = await retryRequest(async () => {
      const response = await client.post(`${BASE_URL}/api/users`);
      if (!Array.isArray(response.data)) {
        throw new Error('Invalid users data format');
      }
      return response;
    });

    const users = usersResponse.data.slice(0, 10);
    console.log(`✅ Fetched ${users.length} users`);

    // Save users to JSON
    saveToJson(users);

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error occurred');
    process.exit(1);
  }
}

// Run the script
main(); 