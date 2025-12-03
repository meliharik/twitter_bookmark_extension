// sync-auth.js
// This script runs on the website (localhost:5173) to sync auth state to the extension

console.log('[categoriX Sync] Content script loaded');

let recentlyLoggedOut = false;

// Helper to safely execute Chrome API calls
function safeChromeCall(callback) {
  try {
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      throw new Error('Extension context invalidated');
    }
    callback();
  } catch (e) {
    if (e.message.includes('Extension context invalidated')) {
      console.warn('[categoriX Sync] Extension was reloaded. Please refresh this page to reconnect.');
    } else {
      console.error('[categoriX Sync] Chrome API Error:', e);
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
    console.log('[categoriX Sync] Received auth data from website');
    recentlyLoggedOut = false;

    safeChromeCall(() => {
      chrome.storage.local.set({
        token: data.token,
        userEmail: data.userEmail,
        profilePictureUrl: data.profilePictureUrl || null,
        isTwitterConnected: data.isTwitterConnected || false
      }, () => {
        if (chrome.runtime.lastError) {
            console.warn('[categoriX Sync] Storage set error:', chrome.runtime.lastError);
            return;
        }
        console.log('[categoriX Sync] Auth synced to extension storage');
        // Trigger custom event for same-page listeners
        window.dispatchEvent(new Event('TWITTER_BOOKMARK_AUTH_CHANGE'));
      });
    });
  } else if (type === 'TWITTER_BOOKMARK_LOGOUT') {
    console.log('[categoriX Sync] Received logout from website');
    recentlyLoggedOut = true;
    setTimeout(() => recentlyLoggedOut = false, 5000); // 5s cooldown

    safeChromeCall(() => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
            console.warn('[categoriX Sync] Storage clear error:', chrome.runtime.lastError);
            return;
        }
        console.log('[categoriX Sync] Extension storage cleared');
        // Trigger custom event for same-page listeners
        window.dispatchEvent(new Event('TWITTER_BOOKMARK_AUTH_CHANGE'));
      });
    });
  }
});

// Sync function to check and update state
function performSync() {
  try {
    const localToken = localStorage.getItem('token');
    const localEmail = localStorage.getItem('userEmail');
    const localProfilePicture = localStorage.getItem('profilePictureUrl');
    const localTwitterConnected = localStorage.getItem('isTwitterConnected') === 'true';
    
    if (localToken) {
      // 1. Website -> Extension (Primary Source of Truth)
      safeChromeCall(() => {
          chrome.storage.local.get(['token', 'userEmail', 'profilePictureUrl', 'isTwitterConnected'], (result) => {
            if (chrome.runtime.lastError) return;

            // Only update if different to avoid loops
            if (result.token !== localToken || 
                result.userEmail !== localEmail || 
                result.profilePictureUrl !== localProfilePicture ||
                result.isTwitterConnected !== localTwitterConnected) {
                
                console.log('[categoriX Sync] Syncing localStorage -> Extension');
                chrome.storage.local.set({ 
                  token: localToken, 
                  userEmail: localEmail,
                  profilePictureUrl: localProfilePicture || null,
                  isTwitterConnected: localTwitterConnected
                });
            }
          });
      });
    } else {
        // 2. Extension -> Website (Only if Website is logged out AND not recently logged out)
        if (recentlyLoggedOut) {
            // Ensure extension is cleared if we think we are logged out
             safeChromeCall(() => {
                chrome.storage.local.get(['token'], (result) => {
                    if (result.token) {
                         console.log('[categoriX Sync] Enforcing logout on Extension');
                         chrome.storage.local.clear();
                    }
                });
            });
            return;
        }

        safeChromeCall(() => {
            chrome.storage.local.get(['token', 'userEmail', 'profilePictureUrl', 'isTwitterConnected'], (result) => {
                if (chrome.runtime.lastError) return;
                
                if (result.token) {
                    console.log('[categoriX Sync] Found token in extension, syncing to website');
                    localStorage.setItem('token', result.token);
                    if (result.userEmail) localStorage.setItem('userEmail', result.userEmail);
                    if (result.profilePictureUrl) localStorage.setItem('profilePictureUrl', result.profilePictureUrl);
                    if (result.isTwitterConnected) {
                        localStorage.setItem('isTwitterConnected', 'true');
                    } else {
                        localStorage.removeItem('isTwitterConnected');
                    }
                    
                    window.dispatchEvent(new Event('TWITTER_BOOKMARK_AUTH_CHANGE'));
                }
            });
        });
    }
  } catch (e) {
    // console.error('[categoriX Sync] Error during sync:', e);
  }
}

// Initial sync
performSync();

// Poll every 2 seconds (less aggressive)
setInterval(performSync, 2000);

// Listen for storage changes in localStorage (Website -> Extension)
window.addEventListener('storage', (e) => {
  if (e.key === 'token') {
      if (!e.newValue) {
          recentlyLoggedOut = true;
          setTimeout(() => recentlyLoggedOut = false, 5000);
      }
      performSync(); // Trigger immediate sync
  }
});

// Listen for messages from extension (Popup/Background)
if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'REFETCH_BOOKMARKS') {
            console.log('[categoriX Sync] Received refetch request from extension');
            window.dispatchEvent(new Event('TWITTER_BOOKMARK_REFETCH'));
        } else if (request.type === 'EXTENSION_LOGOUT') {
            console.log('[categoriX Sync] Received logout from extension');
            recentlyLoggedOut = true;
            setTimeout(() => recentlyLoggedOut = false, 5000);
            
            localStorage.removeItem('token');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('profilePictureUrl');
            localStorage.removeItem('isTwitterConnected');
            window.dispatchEvent(new Event('TWITTER_BOOKMARK_AUTH_CHANGE'));
        }
    });
}

// Listen for changes in chrome.storage (Extension -> Website)
try {
    if (chrome && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
             performSync(); // Trigger immediate sync
        }
      });
    }
} catch (e) {
    // Ignore listener registration errors if context is invalid
}
