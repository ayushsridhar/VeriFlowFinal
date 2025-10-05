require('dotenv').config();
const MicrosoftAuthService = require('./microsoft-auth.js');

async function testMicrosoftAuth() {
  console.log('Testing Microsoft Authentication Configuration...');
  console.log('Client ID:', process.env.MICROSOFT_CLIENT_ID ? 'SET' : 'NOT SET');
  console.log('Client Secret:', process.env.MICROSOFT_CLIENT_SECRET ? 'SET' : 'NOT SET');
  
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    console.error('❌ Microsoft credentials not configured in .env file');
    return;
  }
  
  try {
    const microsoftAuth = new MicrosoftAuthService();
    
    // Test generating auth URL
    const redirectUri = 'http://localhost:5173/auth/microsoft/callback';
    const state = Buffer.from(JSON.stringify({ visitorId: 'test123', timestamp: Date.now() })).toString('base64');
    
    const authUrl = await microsoftAuth.getAuthUrl(redirectUri, state);
    console.log('✅ Auth URL generated successfully');
    console.log('Auth URL:', authUrl);
    
    // Check if the URL contains the correct authority
    if (authUrl.includes('consumers')) {
      console.log('✅ Using consumers authority (personal accounts)');
    } else if (authUrl.includes('common')) {
      console.log('✅ Using common authority (work + personal accounts)');
    } else {
      console.log('⚠️  Unknown authority in URL');
    }
    
  } catch (error) {
    console.error('❌ Microsoft Auth test failed:', error.message);
    if (error.message.includes('unauthorized_client')) {
      console.error('💡 This suggests your Azure AD app registration needs to be configured for consumer accounts');
      console.error('💡 Make sure to select "Accounts in any organizational directory and personal Microsoft accounts"');
    }
  }
}

testMicrosoftAuth();
