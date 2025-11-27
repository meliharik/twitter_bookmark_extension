// sync-auth.js
// This script runs on the website (localhost:5173) to sync auth state to the extension

console.log('[Twitter Bookmark Sync] Content script loaded');

// Helper to safely execute Chrome API calls
function safeChromeCall(callback) {
  try {
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      throw new Error('Extension context invalidated');
    }
    callback();
  } catch (e) {
    if (e.message.includes('Extension context invalidated')) {
      console.warn('[Twitter Bookmark Sync] Extension was reloaded. Please refresh this page to reconnect.');
    } else {
      console.error('[Twitter Bookmark Sync] Chrome API Error:', e);
    }
  }
}

// Listen for messages from the web page
window.addEventListener('message', (event) => {
  // Only accept messages from same origin
  if (event.origin !== window.location.origin) {
    return;
  }

  const { type, data } = event.data;

  if (type === 'TWITTER_BOOKMARK_AUTH') {
    console.log('[Twitter Bookmark Sync] Received auth data from website');

    safeChromeCall(() => {
      chrome.storage.local.set({
        token: data.token,
        userEmail: data.userEmail,
        profilePictureUrl: data.profilePictureUrl || null
      }, () => {
        if (chrome.runtime.lastError) {
            console.warn('[Twitter Bookmark Sync] Storage set error:', chrome.runtime.lastError);
            return;
        }
        console.log('[Twitter Bookmark Sync] Auth synced to extension storage');
        // Trigger custom event for same-page listeners
        window.dispatchEvent(new Event('TWITTER_BOOKMARK_AUTH_CHANGE'));
      });
    });
  } else if (type === 'TWITTER_BOOKMARK_LOGOUT') {
    console.log('[Twitter Bookmark Sync] Received logout from website');

    safeChromeCall(() => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
            console.warn('[Twitter Bookmark Sync] Storage clear error:', chrome.runtime.lastError);
            return;
        }
        console.log('[Twitter Bookmark Sync] Extension storage cleared');
        // Trigger custom event for same-page listeners
        window.dispatchEvent(new Event('TWITTER_BOOKMARK_AUTH_CHANGE'));
      });
    });
  }
});

// Also check localStorage on page load and sync if token exists
function syncOnLoad() {
  try {
    // 1. Website -> Extension
    const localToken = localStorage.getItem('token');
    const localEmail = localStorage.getItem('userEmail');
    const localProfilePicture = localStorage.getItem('profilePictureUrl');
    
    if (localToken) {
      safeChromeCall(() => {
          console.log('[Twitter Bookmark Sync] Found token in localStorage, syncing to extension');
          chrome.storage.local.set({ 
            token: localToken, 
            userEmail: localEmail,
            profilePictureUrl: localProfilePicture || null
          });
      });
    }

    // 2. Extension -> Website
    safeChromeCall(() => {
      chrome.storage.local.get(['token', 'userEmail', 'profilePictureUrl'], (result) => {
        if (chrome.runtime.lastError) return; // Handle potential error accessing storage
        
        if (result.token && result.token !== localToken) {
          console.log('[Twitter Bookmark Sync] Found token in extension, syncing to website');
          localStorage.setItem('token', result.token);
          if (result.userEmail) {
            localStorage.setItem('userEmail', result.userEmail);
          }
          if (result.profilePictureUrl) {
            localStorage.setItem('profilePictureUrl', result.profilePictureUrl);
          }
          // Dispatch custom event so React app notices
          window.dispatchEvent(new Event('TWITTER_BOOKMARK_AUTH_CHANGE'));
        }
      });
    });
  } catch (e) {
    console.error('[Twitter Bookmark Sync] Error during initial sync:', e);
  }
}

// Sync on load
syncOnLoad();

// Listen for storage changes in localStorage (Website -> Extension)
window.addEventListener('storage', (e) => {
  if (e.key === 'token') {
    if (e.newValue) {
      // Token added/updated
      const userEmail = localStorage.getItem('userEmail');
      const profilePictureUrl = localStorage.getItem('profilePictureUrl');
      
      safeChromeCall(() => {
        chrome.storage.local.set({ 
          token: e.newValue, 
          userEmail,
          profilePictureUrl: profilePictureUrl || null
        });
      });
    } else {
      // Token removed (logout)
      safeChromeCall(() => {
        chrome.storage.local.clear();
      });
    }
  }
});

// Listen for messages from extension (Popup/Background)
if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'REFETCH_BOOKMARKS') {
            console.log('[Twitter Bookmark Sync] Received refetch request from extension');
            window.dispatchEvent(new Event('TWITTER_BOOKMARK_REFETCH'));
        } else if (request.type === 'EXTENSION_LOGOUT') {
            console.log('[Twitter Bookmark Sync] Received logout from extension');
            localStorage.removeItem('token');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('profilePictureUrl');
            window.dispatchEvent(new Event('TWITTER_BOOKMARK_AUTH_CHANGE'));
        }
    });
}

// Listen for changes in chrome.storage (Extension -> Website)
try {
    if (chrome && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.token) {
          const newToken = changes.token.newValue;
          const oldToken = changes.token.oldValue;
          
          if (newToken && newToken !== localStorage.getItem('token')) {
            console.log('[Twitter Bookmark Sync] Extension auth changed, syncing to website');
            localStorage.setItem('token', newToken);
            
            // Also get email and profile picture if available
            safeChromeCall(() => {
                chrome.storage.local.get(['userEmail', 'profilePictureUrl'], (result) => {
                  if (result.userEmail) {
                    localStorage.setItem('userEmail', result.userEmail);
                  }
                  if (result.profilePictureUrl) {
                    localStorage.setItem('profilePictureUrl', result.profilePictureUrl);
                  }
                });
            });

            // Trigger custom event instead of reload for better UX
            window.dispatchEvent(new Event('TWITTER_BOOKMARK_AUTH_CHANGE'));
          } else if (!newToken && oldToken) {
            // Logout
            console.log('[Twitter Bookmark Sync] Extension logout, syncing to website');
            localStorage.removeItem('token');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('profilePictureUrl');
            // Trigger custom event instead of reload for better UX
            window.dispatchEvent(new Event('TWITTER_BOOKMARK_AUTH_CHANGE'));
          }
        }
      });
    }
} catch (e) {
    // Ignore listener registration errors if context is invalid
}
