import React, { useState, useEffect } from 'react';

export default function MicrosoftAuth({ deviceFingerprint, onAuthSuccess, onAuthError, compact = false }) {
  const [isLinked, setIsLinked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [userInfo, setUserInfo] = useState(null);

  // Check if user is already linked to Microsoft
  useEffect(() => {
    if (deviceFingerprint) {
      checkAuthStatus();
    }
  }, [deviceFingerprint]);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/auth/microsoft/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: deviceFingerprint })
      });
      
      const data = await response.json();
      if (data.success) {
        setIsLinked(data.isLinked);
      }
    } catch (error) {
      console.error('Error checking Microsoft auth status:', error);
    }
  };

  const initiateMicrosoftAuth = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/auth/microsoft/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: deviceFingerprint })
      });
      
      const data = await response.json();
      console.log(data);
      if (data.success) {
        if (data.alreadyLinked) {
          setIsLinked(true);
          alert('You are already linked to a Microsoft account!');
        } else {
          // Open Microsoft authentication in a popup window
          console.log(data.authUrl);
          const popup = window.open(
            data.authUrl,
            'microsoft-auth',
            'width=500,height=600,scrollbars=yes,resizable=yes'
          );
          
          // Listen for the popup to close or receive a message
          const checkClosed = setInterval(() => {
            if (popup.closed) {
              clearInterval(checkClosed);
              setIsLoading(false);
              // Check auth status again
              checkAuthStatus();
            }
          }, 1000);
          
          // Listen for messages from the popup
          const messageListener = (event) => {
            if (event.origin !== window.location.origin) return;
            
            if (event.data.type === 'MICROSOFT_AUTH_SUCCESS') {
              clearInterval(checkClosed);
              popup.close();
              window.removeEventListener('message', messageListener);
              setIsLoading(false);
              setIsLinked(true);
              setUserInfo(event.data.userInfo);
              onAuthSuccess && onAuthSuccess(event.data.userInfo);
            } else if (event.data.type === 'MICROSOFT_AUTH_ERROR') {
              clearInterval(checkClosed);
              popup.close();
              window.removeEventListener('message', messageListener);
              setIsLoading(false);
              onAuthError && onAuthError(event.data.error);
            }
          };
          
          window.addEventListener('message', messageListener);
        }
      } else {
        throw new Error(data.error || 'Failed to initiate Microsoft authentication');
      }
    } catch (error) {
      console.error('Microsoft auth initiation error:', error);
      setIsLoading(false);
      onAuthError && onAuthError(error.message);
    }
  };

  if (isLinked) {
    return (
      <div style={{ 
        padding: compact ? '10px' : '15px', 
        backgroundColor: '#e8f5e8', 
        border: '1px solid #4caf50', 
        borderRadius: '8px',
        margin: compact ? '0' : '10px 0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#4caf50', fontSize: compact ? '16px' : '20px' }}>✅</span>
          <div>
            <strong style={{ fontSize: compact ? '14px' : '16px' }}>Microsoft Account Linked</strong>
            {userInfo && (
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                {userInfo.displayName} ({userInfo.email})
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <button
        onClick={initiateMicrosoftAuth}
        disabled={isLoading}
        style={{
          backgroundColor: '#0078d4',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '6px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          opacity: isLoading ? 0.7 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        {isLoading ? (
          <>
            <span>⏳</span>
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <span>🔗</span>
            <span>Link Microsoft Account</span>
          </>
        )}
      </button>
    );
  }

  return (
    <div style={{ 
      padding: '15px', 
      backgroundColor: '#f0f8ff', 
      border: '1px solid #0078d4', 
      borderRadius: '8px',
      margin: '10px 0'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <span style={{ color: '#0078d4', fontSize: '20px' }}>🔐</span>
        <div>
          <strong>Enhanced Security</strong>
          <div style={{ fontSize: '14px', color: '#666' }}>
            Link your Microsoft account for additional verification
          </div>
        </div>
      </div>
      
      <button
        onClick={initiateMicrosoftAuth}
        disabled={isLoading}
        style={{
          backgroundColor: '#0078d4',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '6px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          opacity: isLoading ? 0.7 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        {isLoading ? (
          <>
            <span>⏳</span>
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <span>🔗</span>
            <span>Link Microsoft Account</span>
          </>
        )}
      </button>
    </div>
  );
}
