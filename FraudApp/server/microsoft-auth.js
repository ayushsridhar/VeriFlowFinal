const { ConfidentialClientApplication } = require('@azure/msal-node');

class MicrosoftAuthService {
    constructor() {
        this.msalConfig = {
            auth: {
                clientId: process.env.MICROSOFT_CLIENT_ID,
                clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
                authority: 'https://login.microsoftonline.com/consumers' // This specifically allows personal Microsoft accounts
            },
            system: {
                loggerOptions: {
                    loggerCallback: (level, message, containsPii) => {
                        if (containsPii) return;
                        console.log(`[MSAL] ${level}: ${message}`);
                    },
                    piiLoggingEnabled: false,
                    logLevel: 'Info'
                }
            }
        };
        
        this.msalInstance = new ConfidentialClientApplication(this.msalConfig);
    }

    // Generate authorization URL for user to sign in
    async getAuthUrl(redirectUri, state) {
        const authCodeUrlParameters = {
            scopes: ['user.read', 'profile', 'email'],
            redirectUri: redirectUri,
            state: state
        };

        try {
            const response = await this.msalInstance.getAuthCodeUrl(authCodeUrlParameters);
            return response;
        } catch (error) {
            console.error('Error generating auth URL:', error);
            throw error;
        }
    }

    // Exchange authorization code for tokens and get user info
    async exchangeCodeForTokens(authCode, redirectUri) {
        const tokenRequest = {
            code: authCode,
            scopes: ['user.read', 'profile', 'email'],
            redirectUri: redirectUri
        };

        try {
            const response = await this.msalInstance.acquireTokenByCode(tokenRequest);
            
            // Get user profile information
            const userInfo = await this.getUserProfile(response.accessToken);
            
            return {
                accessToken: response.accessToken,
                refreshToken: response.refreshToken,
                userInfo: userInfo
            };
        } catch (error) {
            console.error('Error exchanging code for tokens:', error);
            throw error;
        }
    }

    // Get user profile information from Microsoft Graph
    async getUserProfile(accessToken) {
        try {
            const response = await fetch('https://graph.microsoft.com/v1.0/me', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Graph API error: ${response.status}`);
            }

            const userInfo = await response.json();
            return {
                id: userInfo.id,
                displayName: userInfo.displayName,
                email: userInfo.mail || userInfo.userPrincipalName,
                givenName: userInfo.givenName,
                surname: userInfo.surname,
                jobTitle: userInfo.jobTitle,
                companyName: userInfo.companyName
            };
        } catch (error) {
            console.error('Error getting user profile:', error);
            throw error;
        }
    }

    // Verify if a user is already linked to a Microsoft account
    async isUserLinked(visitorId) {
        try {
            const { Client } = require('./index.js');
            const client = new Client(process.env.DB_API_KEY);
            await client.connect();
            
            const user = await client.users_data.findOne({ 
                visitorId: visitorId,
                microsoftLinked: { $exists: true, $ne: null }
            });
            
            return !!user;
        } catch (error) {
            console.error('Error checking Microsoft link status:', error);
            return false;
        }
    }

    // Link a user to their Microsoft account
    async linkUserToMicrosoft(visitorId, microsoftUserInfo, accessToken = null, refreshToken = null) {
        try {
            const { Client } = require('./index.js');
            const client = new Client(process.env.DB_API_KEY);
            await client.connect();
            
            const microsoftLinkData = {
                microsoftLinked: true,
                microsoftUserId: microsoftUserInfo.id,
                microsoftDisplayName: microsoftUserInfo.displayName,
                microsoftEmail: microsoftUserInfo.email,
                microsoftLinkedAt: new Date()
            };

            // Store tokens for push notifications if provided
            if (accessToken) {
                microsoftLinkData.microsoftAccessToken = accessToken;
            }
            if (refreshToken) {
                microsoftLinkData.microsoftRefreshToken = refreshToken;
            }
            
            const result = await client.users_data.updateOne(
                { visitorId: visitorId },
                { $set: microsoftLinkData }
            );
            
            console.log('Microsoft account linked successfully:', { visitorId, microsoftUserInfo, result });
            return true;
        } catch (error) {
            console.error('Error linking Microsoft account:', error);
            throw error;
        }
    }

    // Send push notification for transaction approval
    async sendTransactionApprovalPush(visitorId, transactionDetails) {
        try {
            const { Client } = require('./index.js');
            const client = new Client(process.env.DB_API_KEY);
            await client.connect();
            
            // Get user's Microsoft auth info (specific user with this visitorId and card that has Microsoft linked)
            const user = await client.users_data.findOne({ 
                visitorId: visitorId,
                creditcardnumber: transactionDetails.card,
                microsoftLinked: { $exists: true, $ne: null }
            });
            
            console.log('🔍 DEBUG: Looking for user with visitorId:', visitorId, 'and card:', transactionDetails.card);
            console.log('🔍 DEBUG: Found user:', user ? 'YES' : 'NO');
            if (user) {
                console.log('🔍 DEBUG: User has microsoftLinked:', !!user.microsoftLinked);
                console.log('🔍 DEBUG: User has microsoftAccessToken:', !!user.microsoftAccessToken);
                console.log('🔍 DEBUG: User creditcardnumber:', user.creditcardnumber);
            }
            
            if (!user || !user.microsoftAccessToken) {
                throw new Error('User not linked to Microsoft or no access token available');
            }

            // Create approval request in database
            const approvalRequest = {
                visitorId: visitorId,
                transactionId: Date.now().toString(), // Simple transaction ID
                amount: transactionDetails.price,
                merchant: transactionDetails.merchant || 'VeriFlow',
                timestamp: new Date(),
                status: 'pending',
                expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
            };

            // Store approval request
            await client.db.collection('approval_requests').insertOne(approvalRequest);

            // For now, simulate push notification
            // In production, you would integrate with Microsoft Graph API or Azure Notification Hubs
            console.log('📱 Push notification sent for transaction approval:', {
                user: user.microsoftDisplayName,
                amount: transactionDetails.price,
                transactionId: approvalRequest.transactionId
            });

            return {
                success: true,
                transactionId: approvalRequest.transactionId,
                message: 'Push notification sent for approval'
            };

        } catch (error) {
            console.error('Error sending push notification:', error);
            throw error;
        }
    }

    // Check approval status
    async checkApprovalStatus(transactionId) {
        try {
            const { Client } = require('./index.js');
            const client = new Client(process.env.DB_API_KEY);
            await client.connect();
            
            const approvalRequest = await client.db.collection('approval_requests').findOne({
                transactionId: transactionId
            });

            if (!approvalRequest) {
                return { status: 'not_found' };
            }

            if (approvalRequest.expiresAt < new Date()) {
                return { status: 'expired' };
            }

            return {
                status: approvalRequest.status,
                approved: approvalRequest.status === 'approved',
                timestamp: approvalRequest.timestamp
            };

        } catch (error) {
            console.error('Error checking approval status:', error);
            throw error;
        }
    }

    // Approve transaction (called by user via Microsoft Authenticator)
    async approveTransaction(transactionId) {
        try {
            const { Client } = require('./index.js');
            const client = new Client(process.env.DB_API_KEY);
            await client.connect();
            
            const result = await client.db.collection('approval_requests').updateOne(
                { transactionId: transactionId },
                { 
                    $set: { 
                        status: 'approved',
                        approvedAt: new Date()
                    }
                }
            );

            console.log('Transaction approved:', { transactionId, result });
            return { success: true, approved: true };

        } catch (error) {
            console.error('Error approving transaction:', error);
            throw error;
        }
    }
}

module.exports = MicrosoftAuthService;
