import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
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

interface CurrentUser {
  id: string;
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

// Constants
const BASE_URL = 'https://challenge.sunvoy.com';
const CREDENTIALS = {
  email: 'demo@example.org',
  password: 'test'
};
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

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
const saveToJson = (data: ApiResponse): void => {
  try {
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'users.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`✅ Data saved to ${outputPath}`);
  } catch (error) {
    console.error('❌ Error saving to JSON:', error);
    throw error;
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
  try {
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

    console.log('✅ Login successful');

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

    // Fetch current user
    console.log('👤 Fetching current user info...');
    const currentUserResponse = await retryRequest(async () => {
      const response = await client.get(`${BASE_URL}/settings/tokens`);
      if (!response.data) {
        throw new Error('Invalid current user data format');
      }
      
      // Parse the HTML to extract user data
      const $ = cheerio.load(response.data);
      const userData: CurrentUser = {
        id: String($('#userId').val() || ''),
        accessToken: String($('#access_token').val() || ''),
        openId: String($('#openId').val() || ''),
        userId: String($('#userId').val() || ''),
        apiUser: String($('#apiuser').val() || ''),
        operateId: String($('#operateId').val() || ''),
        language: String($('#language').val() || '')
      };
      return { data: userData };
    });

    console.log('✅ Current user info fetched');

    // Save everything to JSON
    const data: ApiResponse = {
      users,
      currentUser: currentUserResponse.data
    };

    saveToJson(data);

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error occurred');
    process.exit(1);
  }
}

// Run the script
main(); 