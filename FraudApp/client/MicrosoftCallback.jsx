import React, { useEffect, useState } from 'react';

export default function MicrosoftCallback() {
  const [status, setStatus] = useState('Processing...');
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const errorParam = urlParams.get('error');

        if (errorParam) {
          throw new Error(`Microsoft authentication error: ${errorParam}`);
        }

        if (!code || !state) {
          throw new Error('Missing authentication parameters');
        }

        setStatus('Completing authentication...');

        // Send the authorization code to your backend
        const response = await fetch('http://localhost:3001/api/auth/microsoft/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state })
        });

        const data = await response.json();

        if (data.success) {
          setStatus('Authentication successful!');
          
          // Send success message to parent window
          if (window.opener) {
            window.opener.postMessage({
              type: 'MICROSOFT_AUTH_SUCCESS',
              userInfo: data.userInfo
            }, window.location.origin);
          }
          
          // Close the popup after a short delay
          setTimeout(() => {
            window.close();
          }, 2000);
        } else {
          throw new Error(data.error || 'Authentication failed');
        }
      } catch (error) {
        console.error('Microsoft auth callback error:', error);
        setError(error.message);
        
        // Send error message to parent window
        if (window.opener) {
          window.opener.postMessage({
            type: 'MICROSOFT_AUTH_ERROR',
            error: error.message
          }, window.location.origin);
        }
      }
    };

    handleCallback();
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%'
      }}>
        {error ? (
          <>
            <div style={{ color: '#d32f2f', fontSize: '48px', marginBottom: '20px' }}>❌</div>
            <h2 style={{ color: '#d32f2f', marginBottom: '10px' }}>Authentication Failed</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>{error}</p>
            <button
              onClick={() => window.close()}
              style={{
                backgroundColor: '#d32f2f',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              Close Window
            </button>
          </>
        ) : (
          <>
            <div style={{ color: '#4caf50', fontSize: '48px', marginBottom: '20px' }}>✅</div>
            <h2 style={{ color: '#4caf50', marginBottom: '10px' }}>Success!</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>{status}</p>
            <div style={{ color: '#999', fontSize: '14px' }}>
              This window will close automatically...
            </div>
          </>
        )}
      </div>
    </div>
  );
}
