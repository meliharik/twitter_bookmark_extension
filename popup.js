document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const views = {
    login: document.getElementById('loginView'),
    main: document.getElementById('mainView')
  };
  
  const forms = {
    login: document.getElementById('loginForm')
  };

  const inputs = {
    email: document.getElementById('email'),
    password: document.getElementById('password')
  };

  const buttons = {
    login: document.getElementById('loginBtn'),
    googleLogin: document.getElementById('googleLoginBtn'),
    save: document.getElementById('saveBtn'),
    fetchAll: document.getElementById('fetchAllBtn')
  };

  const displays = {
    userEmail: document.getElementById('userEmail'),
    loginError: document.getElementById('loginError'),
    saveStatus: document.getElementById('saveStatus'),
    progressContainer: document.getElementById('progressContainer'),
    progressBar: document.getElementById('progressBar')
  };

  // Initialize
  await checkAuth();
  await checkCurrentTab();
  
  // Try silent auth on load
  if (!await isAuthenticated()) {
    await trySilentAuthOnLoad();
  }

  // Event Listeners
  forms.login.addEventListener('submit', handleLogin);
  buttons.googleLogin.addEventListener('click', handleGoogleLogin);
  buttons.save.addEventListener('click', handleSave);
  buttons.fetchAll.addEventListener('click', handleFetchAll);

  // Listen for chrome.storage changes (sync from website or other extension tabs)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.token) {
        const newToken = changes.token.newValue;
        const oldToken = changes.token.oldValue;

        if (newToken && !oldToken) {
          // User logged in from website or another source
          console.log('[Popup] Auth detected, updating UI');
          checkAuth();
        } else if (!newToken && oldToken) {
          // User logged out from website or another source
          console.log('[Popup] Logout detected, updating UI');
          switchView('login');
          displays.saveStatus.textContent = '';
        }
      }

      // Update profile picture if changed
      if (changes.profilePictureUrl) {
        const newUrl = changes.profilePictureUrl.newValue;
        updateProfilePicture(newUrl);
      }

      // Update email if changed
      if (changes.userEmail) {
        const newEmail = changes.userEmail.newValue;
        if (newEmail && displays.userEmail) {
          displays.userEmail.textContent = newEmail;
        }
      }
    }
  });

  // --- Handlers ---

  async function checkCurrentTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        const isTwitter = tab.url.includes('twitter.com') || tab.url.includes('x.com');
        const isStatusPage = isTwitter && tab.url.includes('/status/');
        const isBookmarksPage = isTwitter && tab.url.includes('/bookmarks');

        // Update Save Button State
        if (isStatusPage) {
            buttons.save.disabled = false;
            buttons.save.title = "Save this tweet";
            buttons.save.style.opacity = "1";
            buttons.save.style.cursor = "pointer";
        } else {
            buttons.save.disabled = true;
            buttons.save.title = "Open a specific tweet to save";
            buttons.save.style.opacity = "0.5";
            buttons.save.style.cursor = "not-allowed";
        }

        // Update Fetch All Button State - only active on bookmarks page
        if (isBookmarksPage) {
            buttons.fetchAll.disabled = false;
            buttons.fetchAll.title = "Fetch all bookmarked tweets on this page";
            buttons.fetchAll.style.opacity = "1";
            buttons.fetchAll.style.cursor = "pointer";
        } else {
            buttons.fetchAll.disabled = true;
            buttons.fetchAll.title = "Open categoriX bookmarks page to use this feature";
            buttons.fetchAll.style.opacity = "0.5";
            buttons.fetchAll.style.cursor = "not-allowed";
        }

    } catch (e) {
        console.error("Error checking tab:", e);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    resetErrors();
    setLoading(buttons.login, true);

    const email = inputs.email.value.trim();
    const password = inputs.password.value.trim();

    if (!email || !password) {
      showError(displays.loginError, 'Please enter both email and password');
      setLoading(buttons.login, false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        await chrome.storage.local.set({ 
          token: data.token, 
          userEmail: data.email,
          profilePictureUrl: data.profilePictureUrl || null
        });
        switchView('main');
        displays.userEmail.textContent = data.email;
        updateProfilePicture(data.profilePictureUrl);
        inputs.password.value = ''; // Clear password
      } else {
        showError(displays.loginError, data.message || 'Invalid credentials');
      }
    } catch (error) {
      console.error('Login error:', error);
      showError(displays.loginError, 'Could not connect to server. Please check your internet connection.');
    } finally {
      setLoading(buttons.login, false);
    }
  }
  
  async function handleGoogleLogin() {
    resetErrors();
    setLoading(buttons.googleLogin, true);
    
    try {
      const result = await authenticateWithGoogle();
      displays.userEmail.textContent = result.userEmail;
      switchView('main');
    } catch (error) {
      console.error('Google login error:', error);
      showError(displays.loginError, error.message || 'Google authentication failed');
    } finally {
      setLoading(buttons.googleLogin, false);
    }
  }
  
  async function trySilentAuthOnLoad() {
    try {
      const result = await trySilentAuth();
      if (result) {
        console.log('[Popup] Silent auth successful');
        displays.userEmail.textContent = result.userEmail;
        switchView('main');
      }
    } catch (error) {
      console.log('[Popup] Silent auth not available');
    }
  }
  
  async function isAuthenticated() {
    const { token } = await chrome.storage.local.get(['token']);
    return !!token;
  }

  async function handleSave() {
    // Clear any previous status
    displays.progressContainer.classList.add('hidden');
    displays.progressBar.style.width = '0%';

    setLoading(buttons.save, true);
    updateStatus('Scanning tweet...', 'normal');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Send message to content script
      let tweetData;
      try {
        tweetData = await chrome.tabs.sendMessage(tab.id, { action: "scrape" });
      } catch (error) {
        // Content script not loaded, try to inject it
        console.log('[Popup] Content script not found, injecting...');
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });

        // Wait a bit for script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Try again
        tweetData = await chrome.tabs.sendMessage(tab.id, { action: "scrape" });
      }

      if (!tweetData) {
        throw new Error('Could not find a tweet. Please refresh the page.');
      }

      // Check if tweet is bookmarked
      if (!tweetData.isBookmarked) {
        throw new Error('This tweet is not bookmarked. Please bookmark it on Twitter first.');
      }

      // Get token
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) {
        switchView('login');
        return;
      }

      // Check if already exists
      updateStatus('Checking if already saved...', 'normal');
      const checkResponse = await fetch(`${API_URL}/bookmarks/check/${tweetData.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (checkResponse.ok) {
        const { exists } = await checkResponse.json();
        if (exists) {
          updateStatus('Already saved!', 'error');
          setTimeout(() => updateStatus('', 'normal'), 3000);
          return;
        }
      }

      updateStatus('Saving...', 'normal');

      const response = await fetch(`${API_URL}/bookmarks/sync`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify([tweetData])
      });

      if (response.ok) {
        updateStatus('Saved successfully!', 'success');
        triggerDashboardSync(); // Notify dashboard
        // Don't clear the message - it stays until next action
      } else {
        throw new Error('Server rejected the bookmark.');
      }

    } catch (error) {
      console.error('Save error:', error);
      updateStatus(error.message || 'Failed to save', 'error');
      setTimeout(() => updateStatus('', 'normal'), 4000);
    } finally {
      setLoading(buttons.save, false);
    }
  }

  async function handleFetchAll() {
    setLoading(buttons.fetchAll, true);
    updateStatus('Initializing...', 'normal');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Show progress bar
        displays.progressContainer.classList.remove('hidden');
        displays.progressBar.style.width = '5%';

        // Send message to content script
        let tweets;
        try {
          updateStatus('Scrolling through bookmarks...', 'normal');
          displays.progressBar.style.width = '10%';

          tweets = await chrome.tabs.sendMessage(tab.id, { action: "scrapeAll" });
        } catch (error) {
          // Content script not loaded, try to inject it
          console.log('[Popup] Content script not found, injecting...');
          updateStatus('Loading scraper...', 'normal');

          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });

          // Wait a bit for script to initialize
          await new Promise(resolve => setTimeout(resolve, 100));

          updateStatus('Scrolling through bookmarks...', 'normal');
          displays.progressBar.style.width = '15%';

          // Try again
          tweets = await chrome.tabs.sendMessage(tab.id, { action: "scrapeAll" });
        }

        displays.progressBar.style.width = '70%';

        if (!tweets || tweets.length === 0) {
            throw new Error('No bookmarked tweets found. Make sure you are on the bookmarks page.');
        }

        updateStatus(`Found ${tweets.length} bookmarks! Saving...`, 'normal');
        
        // Send to Backend
        const { token } = await chrome.storage.local.get(['token']);
        if (!token) {
            switchView('login');
            displays.progressContainer.classList.add('hidden');
            return;
        }

        displays.progressBar.style.width = '80%';

        const response = await fetch(`${API_URL}/bookmarks/sync`, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(tweets)
        });

        displays.progressBar.style.width = '100%';

        if (response.ok) {
            updateStatus(`${tweets.length} bookmarks saved successfully!`, 'success');
            triggerDashboardSync(); // Notify dashboard
            // Keep the success message visible - don't clear it
            // Progress bar will stay at 100%
        } else {
            throw new Error('Server rejected bookmarks.');
        }

    } catch (error) {
        console.error('Fetch all error:', error);
        updateStatus(error.message || 'Failed to save bookmarks', 'error');
        setTimeout(() => {
            updateStatus('', 'normal');
            displays.progressContainer.classList.add('hidden');
            displays.progressBar.style.width = '0%';
        }, 5000);
    } finally {
        setLoading(buttons.fetchAll, false);
    }
  }

  // --- Helpers ---

  async function checkAuth() {
    const { token, userEmail, profilePictureUrl } = await chrome.storage.local.get(['token', 'userEmail', 'profilePictureUrl']);
    if (token && userEmail) {
      switchView('main');
      displays.userEmail.textContent = userEmail;
      updateProfilePicture(profilePictureUrl);
    } else {
      switchView('login');
    }
  }

  function updateProfilePicture(url) {
    const avatarElement = document.getElementById('userAvatar');
    if (!avatarElement) return;
    
    if (url) {
      avatarElement.innerHTML = `<img src="${url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
      avatarElement.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
    }
  }

  function switchView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
  }

  function setLoading(btn, isLoading) {
    const spinner = btn.querySelector('.spinner');
    
    if (isLoading) {
      btn.disabled = true;
      if (spinner) spinner.classList.remove('hidden');
    } else {
      btn.disabled = false;
      if (spinner) spinner.classList.add('hidden');
    }
  }

  function showError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
  }

  function updateStatus(message, type) {
      displays.saveStatus.textContent = message;
      displays.saveStatus.className = `status-msg ${type}`;
  }

  function resetErrors() {
    displays.loginError.classList.add('hidden');
    displays.loginError.textContent = '';
  }

  // Trigger sync on localhost tabs
  async function triggerDashboardSync() {
      try {
        const tabs = await chrome.tabs.query({
          url: [
            "http://localhost:5173/*",
            "http://localhost:5174/*",
            "http://localhost:5175/*",
            "http://127.0.0.1:5173/*",
            "http://13.51.199.12:8080/*"
          ]
        });

        if (tabs.length === 0) {
          console.log('[Popup] No dashboard tabs found to sync');
          return;
        }

        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'REFETCH_BOOKMARKS' });
            console.log('[Popup] Successfully notified dashboard tab:', tab.id);
          } catch (error) {
            // Tab might not have content script loaded yet, or page might be loading
            console.log('[Popup] Could not send message to tab', tab.id, '- This is normal if the page is still loading');
          }
        }
      } catch (e) {
          console.log("[Popup] Could not trigger dashboard sync:", e);
      }
  }
});
