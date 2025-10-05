require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Client } = require('./index.js');
const axios = require('axios');
const MicrosoftAuthService = require('./microsoft-auth.js');

const app = express();
const PORT = process.env.PORT || 3002;

// Initialize Microsoft Auth Service
const microsoftAuth = new MicrosoftAuthService();

app.use(cors());
app.use(bodyParser.json());

// Example endpoint for purchase form submission
app.post('/api/purchase', async (req, res) => {
  console.log('🔥🔥🔥 PURCHASE API CALLED! 🔥🔥🔥');
  console.log('Purchase API called with:', req.body);
  const { card, devicefingerprint, name, email, address, city, state, zip, price } = req.body;
  console.log('Card:', card, 'Device fingerprint:', devicefingerprint);
  try {
    console.log('🚀 About to call authenticate method...');
    const result = await new Client(process.env.DB_API_KEY).authenticate(devicefingerprint, card, price);
    console.log('✅ Authenticate method completed');
    console.log('Result from authenticate:', result);
    console.log('Result:', result);
    return res.json(result);
  } catch (err) {
    console.error('❌ Authentication error:', err);
    return res.status(500).json({ success: false, error: 'Authentication error', details: err.message });
  }
});

// Endpoint to create a Plaid Link token
app.post('/api/create_link_token', async (req, res) => {
  try {
    console.log('Creating link token for device fingerprint:', req.body.devicefingerprint);
    console.log('Plaid credentials:', {
      client_id: process.env.PLAID_CLIENT_ID ? 'SET' : 'NOT SET',
      secret: process.env.PLAID_SECRET ? 'SET' : 'NOT SET'
    });
    
    const response = await axios.post('https://sandbox.plaid.com/link/token/create', {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      client_name: 'VeriFlow',
      user: { client_user_id: req.body.devicefingerprint || 'test_user' },
      products: ['auth', 'identity'],
      country_codes: ['US'],
      language: 'en',
    });
    console.log('Plaid link token created successfully');
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('Failed to create Plaid link token:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create Plaid link token', details: err.response?.data || err.message });
  }
});

// Endpoint to exchange public_token for access_token
app.post('/api/exchange_public_token', async (req, res) => {
  try {
    const { public_token, userData } = req.body;
    console.log('=== EXCHANGE PUBLIC TOKEN DEBUG ===');
    console.log('Full request body:', req.body);
    console.log('Public token:', public_token);
    console.log('User data received:', userData);
    console.log('User data type:', typeof userData);
    console.log('User data keys:', userData ? Object.keys(userData) : 'No userData');
    
    const response = await axios.post('https://sandbox.plaid.com/item/public_token/exchange', {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      public_token,
    });
    
    // Store user data in MongoDB after successful Plaid verification
    let isFirstTimeUser = false;
    if (userData) {
      const client = new Client(process.env.DB_API_KEY);
      try {
        await client.connect();
        console.log('Connected to database for user storage');
        
        // Check if this is a first-time user (no previous records with this device fingerprint AND credit card)
        const existingUser = await client.users_data.findOne({ 
          visitorId: userData.devicefingerprint,
          creditcardnumber: userData.card
        });
        
        isFirstTimeUser = !existingUser;
        console.log('Is first-time user:', isFirstTimeUser);
        
        const userRecord = {
          visitorId: userData.devicefingerprint,
          creditcardnumber: userData.card,
          name: userData.name,
          email: userData.email,
          address: userData.address,
          city: userData.city,
          state: userData.state,
          zip: userData.zip,
          plaidAccessToken: response.data.access_token,
          verifiedAt: new Date(),
          status: 'verified',
          isFirstTimeUser: isFirstTimeUser
        };
        
        await client.users_data.insertOne(userRecord);
        console.log('User data stored successfully:', userRecord);
      } catch (dbErr) {
        console.error('Database storage error:', dbErr);
        // Don't fail the request if DB storage fails
      }
    }
    
    res.json({ 
      access_token: response.data.access_token, 
      success: true,
      isFirstTimeUser: isFirstTimeUser
    });
  } catch (err) {
    console.error('Failed to exchange public token:', err);
    res.status(500).json({ error: 'Failed to exchange public token', details: err.message });
  }
});

// Microsoft Authentication Endpoints

// Initiate Microsoft authentication
app.post('/api/auth/microsoft/initiate', async (req, res) => {
  try {
    const { visitorId } = req.body;
    console.log('Initiating Microsoft auth for visitor:', visitorId);
    
    // Check if user is already linked
    const isLinked = await microsoftAuth.isUserLinked(visitorId);
    if (isLinked) {
      return res.json({ 
        success: true, 
        alreadyLinked: true, 
        message: 'User already linked to Microsoft account' 
      });
    }
    
    // Generate state parameter for security
    const state = Buffer.from(JSON.stringify({ visitorId, timestamp: Date.now() })).toString('base64');
    
    // Generate authorization URL
    const redirectUri = 'http://localhost:5173/auth/microsoft/callback';
    const authUrl = await microsoftAuth.getAuthUrl(redirectUri, state);
    
    res.json({ 
      success: true, 
      authUrl: authUrl,
      state: state
    });
  } catch (error) {
    console.error('Microsoft auth initiation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to initiate Microsoft authentication',
      details: error.message 
    });
  }
});

// Handle Microsoft authentication callback
app.post('/api/auth/microsoft/callback', async (req, res) => {
  try {
    const { code, state } = req.body;
    console.log('Microsoft auth callback received');
    
    // Verify state parameter
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { visitorId } = stateData;
    
    // Exchange code for tokens and get user info
    const redirectUri = 'http://localhost:5173/auth/microsoft/callback';
    const authResult = await microsoftAuth.exchangeCodeForTokens(code, redirectUri);
    
    // Link user to Microsoft account with tokens for push notifications
    await microsoftAuth.linkUserToMicrosoft(
      visitorId, 
      authResult.userInfo, 
      authResult.accessToken, 
      authResult.refreshToken
    );
    
    res.json({
      success: true,
      message: 'Successfully linked to Microsoft account',
      userInfo: authResult.userInfo
    });
  } catch (error) {
    console.error('Microsoft auth callback error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to complete Microsoft authentication',
      details: error.message 
    });
  }
});

// Check if user is linked to Microsoft
app.post('/api/auth/microsoft/status', async (req, res) => {
  try {
    const { visitorId } = req.body;
    const isLinked = await microsoftAuth.isUserLinked(visitorId);
    
    res.json({
      success: true,
      isLinked: isLinked
    });
  } catch (error) {
    console.error('Microsoft auth status error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check Microsoft auth status',
      details: error.message 
    });
  }
});

// Check approval status for a transaction
app.post('/api/check-approval', async (req, res) => {
  try {
    const { transactionId } = req.body;
    const status = await microsoftAuth.checkApprovalStatus(transactionId);
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('Check approval error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check approval status',
      details: error.message 
    });
  }
});

// Approve transaction (simulated endpoint - in production this would be called by Microsoft Authenticator)
app.post('/api/approve-transaction', async (req, res) => {
  try {
    const { transactionId } = req.body;
    const result = await microsoftAuth.approveTransaction(transactionId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Approve transaction error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to approve transaction',
      details: error.message 
    });
  }
});

// Test endpoint to simulate approval (for testing purposes)
app.post('/api/test-approve', async (req, res) => {
  try {
    const { transactionId } = req.body;
    console.log('🧪 TEST: Simulating approval for transaction:', transactionId);
    
    // Wait 3 seconds to simulate user approval delay
    setTimeout(async () => {
      try {
        const result = await microsoftAuth.approveTransaction(transactionId);
        console.log('🧪 TEST: Transaction approved:', result);
      } catch (error) {
        console.error('🧪 TEST: Error approving transaction:', error);
      }
    }, 3000);
    
    res.json({ 
      success: true, 
      message: 'Test approval initiated - transaction will be approved in 3 seconds',
      transactionId 
    });
  } catch (error) {
    console.error('Test approve error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to initiate test approval',
      details: error.message 
    });
  }
});

// Cleanup endpoint to remove old Microsoft linking data
app.post('/api/cleanup-microsoft', async (req, res) => {
  try {
    const { Client } = require('./index.js');
    const client = new Client(process.env.DB_API_KEY);
    await client.connect();
    
    // Remove all Microsoft linking data
    const result = await client.users_data.updateMany(
      { microsoftLinked: { $exists: true } },
      { 
        $unset: { 
          microsoftLinked: "",
          microsoftUserId: "",
          microsoftDisplayName: "",
          microsoftEmail: "",
          microsoftLinkedAt: "",
          microsoftAccessToken: "",
          microsoftRefreshToken: ""
        }
      }
    );
    
    console.log('🧹 CLEANUP: Removed Microsoft linking data from', result.modifiedCount, 'users');
    
    res.json({ 
      success: true, 
      message: `Cleaned up Microsoft linking data from ${result.modifiedCount} users`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to cleanup Microsoft data',
      details: error.message 
    });
  }
});

app.get('/', (req, res) => {
  res.send('Backend server is running.');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
