import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { getDeviceFingerprint } from './fingerprint.js';
import { usePlaidLink } from 'react-plaid-link';
import MicrosoftAuth from './MicrosoftAuth.jsx';
import MicrosoftCallback from './MicrosoftCallback.jsx';

export default function App() {
  // Check if this is the Microsoft callback page
  if (window.location.pathname === '/auth/microsoft/callback') {
    return <MicrosoftCallback />;
  }

  const [form, setForm] = useState({
    name: '',
    email: '',
    card: '',
    expiry: '',
    cvc: '',
    address: '',
    city: '',
    state: '',
    zip: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [deviceFingerprint, setDeviceFingerprint] = useState('');
  const [linkToken, setLinkToken] = useState(null);
  const [requirePlaid, setRequirePlaid] = useState(false);
  const [submittedFormData, setSubmittedFormData] = useState(null);
  const submittedFormDataRef = useRef(null);
  const [showMicrosoftAuth, setShowMicrosoftAuth] = useState(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
  const [randomPrice] = useState(() => Math.floor(Math.random() * 650) + 1);
  // Plaid Link hook must be declared before any useEffect that uses its values
  // ...existing code...

    const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      try {
        console.log('Plaid success - Current form data:', form);
        console.log('Plaid success - Stored form data (state):', submittedFormData);
        console.log('Plaid success - Stored form data (ref):', submittedFormDataRef.current);
        console.log('Plaid success - Device fingerprint:', deviceFingerprint);
        
        // Use the stored form data from when the form was submitted (prefer ref over state)
        const userData = submittedFormDataRef.current || submittedFormData || {
          ...form,
          devicefingerprint: deviceFingerprint
        };
        
        console.log('Sending user data to backend:', userData);
        
        const response = await fetch('http://localhost:3001/api/exchange_public_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            public_token,
            userData: userData
          })
        });
        const data = await response.json();
        console.log('Backend response:', data);
        
        if (data.access_token && data.success) {
          console.log('Plaid verification successful, checking if first-time user...');
          
          // Check if this is a first-time user
          const isFirstTime = data.isFirstTimeUser || false;
          setIsFirstTimeUser(isFirstTime);
          
          if (isFirstTime) {
            console.log('First-time user detected, prompting for Microsoft Auth');
            setShowMicrosoftAuth(true);
            alert('Plaid verification successful! For enhanced security, please link your Microsoft Authenticator account.');
          } else {
            alert('Plaid authentication successful! Your data has been saved.');
          }
          
          setRequirePlaid(false); // Reset the flag
          setSubmittedFormData(null); // Clear stored form data
          submittedFormDataRef.current = null; // Clear ref as well
        } else {
          alert('Authentication failed. Please try again.');
        }
      } catch (error) {
        console.error('Plaid exchange error:', error);
        alert('Authentication failed. Please try again.');
      }
    },
    onExit: (err, metadata) => {
      if (err) {
        console.error('Plaid Link error:', err);
        alert('Plaid Link exited with error: ' + err.error_message);
      }
      setRequirePlaid(false); // Reset the flag on exit
    },
    onEvent: (eventName, metadata) => {
      console.log('Plaid Link event:', eventName, metadata);
    }
  });

  // Automatically open Plaid Link UI when requirePlaid becomes true
  useEffect(() => {
    console.log('🔧 Plaid useEffect triggered:', { requirePlaid, ready, open: !!open });
    if (requirePlaid && ready && open) {
      console.log('🚀 PLAID MODAL TRIGGERED - Opening Plaid Link...');
      console.log('🚀 This means the user needs verification');
      open();
    } else {
      console.log('⏸️ Plaid Link not opening because:', {
        requirePlaid,
        ready,
        hasOpen: !!open
      });
    }
  }, [requirePlaid, ready, open]);

  useEffect(() => {
    getDeviceFingerprint().then(setDeviceFingerprint);
  }, []);

  useEffect(() => {
    async function fetchLinkToken() {
      try {
        console.log('Fetching link token for device fingerprint:', deviceFingerprint);
        const res = await fetch('http://localhost:3001/api/create_link_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ devicefingerprint: deviceFingerprint })
        });
        const data = await res.json();
        console.log('Link token response:', data);
        if (data.link_token) {
          setLinkToken(data.link_token);
          console.log('Link token set successfully');
        } else {
          console.error('Failed to get link token:', data);
        }
      } catch (error) {
        console.error('Error fetching link token:', error);
      }
    }
    if (deviceFingerprint) {
      console.log('Device fingerprint available, fetching link token...');
      fetchLinkToken();
    } else {
      console.log('No device fingerprint yet');
    }
  }, [deviceFingerprint]);


  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  const handleMicrosoftAuthSuccess = (userInfo) => {
    console.log('Microsoft Auth successful:', userInfo);
    setShowMicrosoftAuth(false);
    setIsFirstTimeUser(false);
    alert(`Microsoft Authenticator linked successfully! Welcome ${userInfo.displayName}. Your account is now secured with enhanced fraud prevention.`);
    
    // Retry the purchase after successful Microsoft authentication
    console.log('🔄 FRONTEND: Retrying purchase after Microsoft MFA success');
    handleSubmit(new Event('submit')); // Trigger form submission again
  };

  const handleMicrosoftAuthError = (error) => {
    console.error('Microsoft Auth error:', error);
    setShowMicrosoftAuth(false);
    setSubmitted(false); // Reset submitted state so user can try again
    alert(`Microsoft Authenticator linking failed: ${error}. You can try again later.`);
  };

  const skipMicrosoftAuth = () => {
    setShowMicrosoftAuth(false);
    setIsFirstTimeUser(false);
    setSubmitted(false); // Reset submitted state so user can try again
    alert('Microsoft Authenticator linking skipped. You can link it later for enhanced security.');
  };

  const waitForApproval = async (transactionId) => {
    console.log('📱 FRONTEND: Starting approval polling for transaction:', transactionId);
    
    // Show approval pending message
    alert(`High-value transaction requires approval via Microsoft Authenticator. Please check your Microsoft Authenticator app and approve the transaction.`);
    
    // Poll for approval status every 2 seconds for up to 5 minutes
    const maxAttempts = 150; // 5 minutes at 2 seconds per attempt
    let attempts = 0;
    
    const checkApproval = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/check-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionId })
        });
        
        const data = await response.json();
        console.log('📱 FRONTEND: Approval status check:', data);
        
        if (data.approved) {
          console.log('✅ FRONTEND: Transaction approved!');
          alert('Transaction approved! Purchase successful.');
          return true;
        } else if (data.status === 'expired') {
          console.log('❌ FRONTEND: Approval request expired');
          alert('Approval request expired. Please try again.');
          setSubmitted(false);
          return true;
        } else if (data.status === 'not_found') {
          console.log('❌ FRONTEND: Approval request not found');
          alert('Approval request not found. Please try again.');
          setSubmitted(false);
          return true;
        }
        
        return false;
      } catch (error) {
        console.error('📱 FRONTEND: Error checking approval status:', error);
        return false;
      }
    };
    
    // Start polling
    const pollInterval = setInterval(async () => {
      attempts++;
      console.log(`📱 FRONTEND: Approval check attempt ${attempts}/${maxAttempts}`);
      
      const approved = await checkApproval();
      
      if (approved || attempts >= maxAttempts) {
        clearInterval(pollInterval);
        if (attempts >= maxAttempts) {
          console.log('❌ FRONTEND: Approval timeout reached');
          alert('Approval timeout reached. Please try again.');
          setSubmitted(false);
        }
      }
    }, 2000);
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    const payload = { ...form, devicefingerprint: deviceFingerprint, price: randomPrice };
    
    // Store the form data for use in Plaid success callback
    console.log('Setting submittedFormData to:', payload);
    setSubmittedFormData(payload);
    submittedFormDataRef.current = payload; // Store in ref for immediate access
    console.log('submittedFormData set, current value:', submittedFormData);
    console.log('submittedFormDataRef.current:', submittedFormDataRef.current);
    
    console.log('Form submitted with payload:', payload);
    console.log('Device fingerprint:', deviceFingerprint);
    console.log('Link token available:', !!linkToken);
    console.log('Plaid ready:', ready);
    
    try {
      // Call backend to check if authentication is needed
      console.log('Calling /api/purchase...');
      const res = await fetch('http://localhost:3001/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      console.log('Purchase API response:', data);
      
      if (data.success) {
        console.log('🎯 Frontend received successful response from backend');
        console.log('🎯 Backend response data:', data);
        console.log('🎯 data.requirePlaid value:', data.requirePlaid);
        
        // If backend says Plaid is required, trigger Plaid Link
        if (data.requirePlaid) {
          console.log('🔄 FRONTEND: Plaid required, setting requirePlaid to true');
          console.log('🔄 FRONTEND: This will trigger the Plaid modal');
          setRequirePlaid(true);
        } else if (data.requireMicrosoftMFA) {
          console.log('🔐 FRONTEND: Microsoft MFA required for high-value transaction');
          console.log('🔐 FRONTEND: Triggering Microsoft authentication flow');
          setShowMicrosoftAuth(true);
        } else if (data.requireApproval) {
          console.log('📱 FRONTEND: Transaction requires approval via Microsoft Authenticator');
          console.log('📱 FRONTEND: Waiting for user approval...');
          await waitForApproval(data.transactionId);
        } else {
          console.log('✅ FRONTEND: No additional verification required - user is verified');
          console.log('✅ FRONTEND: Showing success message');
          alert('Purchase successful! No additional verification needed.');
        }
      } else {
        console.error('❌ FRONTEND: Purchase failed:', data);
        alert('Purchase failed: ' + (data.error || 'Unknown error'));
        setSubmitted(false);
      }
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Purchase failed. Please try again.');
      setSubmitted(false);
    }
  }

  return (
    <div className="purchase-form-bg">
      <form className="purchase-form" onSubmit={handleSubmit}>
        <div className="price-display">
          <span className="price-label">Total Amount</span>
          <span className="price-value">${randomPrice}.00</span>
        </div>
        <h2>Checkout</h2>
        <input name="name" placeholder="Full Name" value={form.name} onChange={handleChange} required />
        <input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required />
        <input name="card" placeholder="Credit Card Number" value={form.card} onChange={handleChange} required maxLength={19} />
        <div className="row">
          <input name="expiry" placeholder="MM/YY" value={form.expiry} onChange={handleChange} required maxLength={5} />
          <input name="cvc" placeholder="CVC" value={form.cvc} onChange={handleChange} required maxLength={4} />
        </div>
        <input name="address" placeholder="Billing Address" value={form.address} onChange={handleChange} required />
        <div className="row">
          <input name="city" placeholder="City" value={form.city} onChange={handleChange} required />
          <input name="state" placeholder="State" value={form.state} onChange={handleChange} required />
          <input name="zip" placeholder="ZIP" value={form.zip} onChange={handleChange} required />
        </div>
        {/* Plaid Link UI is triggered automatically as a modal when required */}
        <button type="submit">Pay Now</button>
        {submitted && <div className="success">Thank you for your purchase!</div>}
        
        {/* Microsoft Authentication - Show for MFA requirement or first-time users */}
        {showMicrosoftAuth && deviceFingerprint && (
          <div style={{ 
            marginTop: '20px',
            padding: '20px',
            backgroundColor: '#fff3cd',
            border: '2px solid #ffc107',
            borderRadius: '10px',
            textAlign: 'center'
          }}>
            <div style={{ marginBottom: '15px' }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>🔐</div>
              <h3 style={{ color: '#856404', margin: '0 0 10px 0' }}>Microsoft Authentication Required</h3>
              <p style={{ color: '#856404', margin: '0 0 15px 0', fontSize: '14px' }}>
                {randomPrice >= 500 
                  ? `High-value transaction ($${randomPrice}) requires Microsoft Authenticator verification for enhanced security.`
                  : 'Link your Microsoft Authenticator for enhanced fraud prevention on future transactions.'
                }
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <MicrosoftAuth 
                deviceFingerprint={deviceFingerprint}
                onAuthSuccess={handleMicrosoftAuthSuccess}
                onAuthError={handleMicrosoftAuthError}
                compact={true}
              />
              <button
                onClick={skipMicrosoftAuth}
                style={{
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Skip for Now
              </button>
            </div>
          </div>
        )}
        
        {/* Debug info */}
        <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
          <div>Device Fingerprint: {deviceFingerprint ? '✅' : '❌'}</div>
          <div>Link Token: {linkToken ? '✅' : '❌'}</div>
          <div>Plaid Ready: {ready ? '✅' : '❌'}</div>
          <div>Require Plaid: {requirePlaid ? '✅' : '❌'}</div>
        </div>
      </form>
    </div>
  );
}