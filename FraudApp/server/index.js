const { MongoClient } = require('mongodb');
class Client {
    constructor(API_KEY) {
        this.uri = 'mongodb+srv://anayjo:c6WfIU7R0egT8PtY@veriflowdatabases.0pdm6b1.mongodb.net/?retryWrites=true&w=majority&appName=VeriFlowDatabases'; // Use env vars in production
        this.client = new MongoClient(this.uri, { 
            useNewUrlParser: true, 
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, // 5 second timeout
            connectTimeoutMS: 10000, // 10 second timeout
        });
        this.connected = false;
        this.API_KEY = API_KEY;
    }

    async connect() {
        await this.client.connect();
        this.db = this.client.db('veriflow');
        this.users_data = this.db.collection('TotalUser');
        this.companymetas = this.db.collection('companymetas');
    }

    async verifyAPI() {
        await this.connect();
        const collection = this.companymetas;
        const keyToSearch = 'apiKey';
        const valueToFind = this.API_KEY;
        const doc = await collection.findOne({ [keyToSearch]: valueToFind });
        if (doc) {
            console.log('Value found in document:', doc);
            const dbUri = doc.dbUri.replace('mongodb.net//', 'mongodb.net/'); // Fix double slash issue
            console.log('dbUri', dbUri);
            this.companydb = new MongoClient(dbUri, { 
                 serverSelectionTimeoutMS: 5000, // 5 second timeout
                 connectTimeoutMS: 10000, // 10 second timeout
                 tls: true,
                 tlsAllowInvalidCertificates: true
             });
             await this.companydb.connect();
        } else {
            throw new Error('Value not found in any document.');
        }
    }
    async authenticate(fingerprint, card, price) {
            console.log('🚨🚨🚨 AUTHENTICATE METHOD CALLED! 🚨🚨🚨');
            console.log('=== AUTHENTICATE METHOD START ===');
            console.log('Input params - fingerprint:', fingerprint, 'card:', card, 'price:', price);
            
            try {
                await this.verifyAPI();
                console.log('✅ verifyAPI completed successfully');
            } catch (verifyError) {
                console.log('❌ verifyAPI failed:', verifyError.message);
                console.log('🔄 Continuing with authentication anyway...');
            }
            
            console.log('🔍 Searching for user in database...');
            console.log('Search query:', { visitorId: fingerprint, creditcardnumber: card });
            
            const doc = await this.users_data.findOne({ visitorId: fingerprint, creditcardnumber: card });
            console.log('📊 Database query result:', doc);
            console.log('📊 Document found?', !!doc);
            
            if (doc) {
                console.log('✅ RETURNING USER PATH - User found in database');
                console.log('✅ RETURNING USER PATH - No Plaid required');
                
                // Check if price is >= 500 and trigger Microsoft MFA
                if (price >= 500) {
                    console.log('🔐 HIGH VALUE TRANSACTION - Price >= 500, Microsoft MFA required');
                    console.log('🔐 HIGH VALUE TRANSACTION - Checking Microsoft link status...');
                    
                    // Check if user is linked to Microsoft
                    const MicrosoftAuthService = require('./microsoft-auth.js');
                    const microsoftAuth = new MicrosoftAuthService();
                    const isMicrosoftLinked = await microsoftAuth.isUserLinked(fingerprint);
                    
                    if (!isMicrosoftLinked) {
                        console.log('🔐 HIGH VALUE TRANSACTION - User not linked to Microsoft, MFA required');
                        return { 
                            success: true, 
                            requirePlaid: false, 
                            requireMicrosoftMFA: true,
                            message: 'High-value transaction requires Microsoft Authenticator verification'
                        };
                    } else {
                        console.log('🔐 HIGH VALUE TRANSACTION - User linked to Microsoft, sending push notification for approval');
                        
                        // Send push notification for approval
                        const pushResult = await microsoftAuth.sendTransactionApprovalPush(fingerprint, {
                            price: price,
                            merchant: 'VeriFlow',
                            card: card
                        });
                        
                        console.log('🔐 HIGH VALUE TRANSACTION - Push notification sent:', pushResult);
                        
                        return {
                            success: true,
                            requirePlaid: false,
                            requireApproval: true,
                            transactionId: pushResult.transactionId,
                            message: 'High-value transaction requires approval via Microsoft Authenticator'
                        };
                    }
                }
                
                console.log('✅ RETURNING USER PATH - Adding to company database...');
                
                try {
                    
                    await this.companydb.db().collection('init').insertOne({ 
                        visitorId: fingerprint, 
                        creditcardnumber: card, 
                        price: price 
                    });
                    console.log('✅ RETURNING USER PATH - Successfully added to company database');
                } catch (companyDbError) {
                    console.log('⚠️ RETURNING USER PATH - Company database error (continuing anyway):', companyDbError.message);
                }
                
                console.log('✅ RETURNING USER PATH - Returning: { success: true, requirePlaid: false }');
                return { success: true, requirePlaid: false };
              } else {
                console.log('🆕 NEW USER PATH - User not found in database');
                console.log('🆕 NEW USER PATH - Plaid verification required');
                console.log('🆕 NEW USER PATH - Returning: { success: true, requirePlaid: true }');
                return { success: true, requirePlaid: true };
              }
            }
    }

module.exports = { Client };