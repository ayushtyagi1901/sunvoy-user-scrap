# Legacy Web Application Reverse Engineering

This TypeScript-based Node.js script reverse engineers a legacy web application by programmatically retrieving user data and current user information through API requests.

## 🚀 Features

- Automatic authentication handling
- Session persistence
- User data retrieval
- Current user information fetching
- JSON output generation

## 📋 Prerequisites

- Node.js (LTS version)
- npm (comes with Node.js)

## 🛠️ Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

## 🏃‍♂️ Usage

Run the script using:
```bash
npm start
```

The script will:
1. Authenticate with the provided credentials
2. Fetch the list of users
3. Retrieve the current user's information
4. Save all data to `users.json`

## 📝 Output

The script generates a `users.json` file containing:
- List of users (limited to 10 items(but only 9 are coming as there are only 9 on the dashboard))
- Current user information

## 🎥 Demo Video

https://www.loom.com/share/1a510c1e03f34ce39b3e7a03767228d0?sid=39dc25cf-1126-494c-afe2-20c67c052a7b

## ⏱️ Time Spent

1. Ideation & Planning
Understood challenge scope, session flow, endpoints, and planned modular structure
Time: 1 hour
2. Code Implementation
Login with nonce, cookie/session handling, user & token scraping, data saving
Time: 3 hours
3. Debugging & Testing
Handled failures, verified scraping accuracy, ensured data integrity
Time: 2 hours

Total Time Taken Approx. 6 Hours

Used GitHub Copilot only for redundant code completion, documentation, and code comments.