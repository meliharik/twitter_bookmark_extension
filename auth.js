// auth.js - Google OAuth using chrome.identity API

/**
 * Authenticate user with Google using chrome.identity
 * @returns {Promise<{token: string, userEmail: string}>}
 */
async function authenticateWithGoogle() {
  try {
    console.log('[Auth] Starting Google OAuth flow...');
    
    // Launch OAuth flow
    const redirectURL = chrome.identity.getRedirectURL();
    console.log('[Auth] Redirect URL:', redirectURL);
    
    // Get OAuth token from Google
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError) {
          console.error('[Auth] OAuth error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (!token) {
          reject(new Error('No token received'));
          return;
        }
        
        console.log('[Auth] Google token received');
        
        try {
          // Send token to backend to get JWT
          const response = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            throw new Error(data.message || 'Backend authentication failed');
          }
          
          console.log('[Auth] Backend authentication successful');
          
          // Get user info from Google
          const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          const userInfo = await userInfoResponse.json();
          
          // Store in chrome.storage
          await chrome.storage.local.set({
            token: data.token,
            userEmail: userInfo.email,
            googleToken: token
          });
          
          console.log('[Auth] Credentials stored');
          
          resolve({
            token: data.token,
            userEmail: userInfo.email
          });
        } catch (error) {
          console.error('[Auth] Backend error:', error);
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('[Auth] Authentication failed:', error);
    throw error;
  }
}

/**
 * Try silent authentication (if user previously authorized)
 * @returns {Promise<{token: string, userEmail: string} | null>}
 */
async function trySilentAuth() {
  try {
    console.log('[Auth] Trying silent authentication...');
    
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, async (token) => {
        if (chrome.runtime.lastError || !token) {
          console.log('[Auth] Silent auth not available');
          resolve(null);
          return;
        }
        
        console.log('[Auth] Silent auth successful');
        
        try {
          // Verify token with backend
          const response = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            resolve(null);
            return;
          }
          
          // Get user info
          const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          const userInfo = await userInfoResponse.json();
          
          // Store credentials
          await chrome.storage.local.set({
            token: data.token,
            userEmail: userInfo.email,
            googleToken: token
          });
          
          resolve({
            token: data.token,
            userEmail: userInfo.email
          });
        } catch (error) {
          console.error('[Auth] Silent auth backend error:', error);
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('[Auth] Silent auth failed:', error);
    return null;
  }
}

/**
 * Logout user
 */
async function logout() {
  try {
    const { googleToken } = await chrome.storage.local.get(['googleToken']);
    
    if (googleToken) {
      // Revoke Google token
      chrome.identity.removeCachedAuthToken({ token: googleToken }, () => {
        console.log('[Auth] Google token revoked');
      });
    }
    
    // Clear storage
    await chrome.storage.local.clear();
    console.log('[Auth] Logged out');
  } catch (error) {
    console.error('[Auth] Logout error:', error);
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { authenticateWithGoogle, trySilentAuth, logout };
}
