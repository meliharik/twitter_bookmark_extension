document.addEventListener('DOMContentLoaded', async () => {
    const loginBtn = document.getElementById('login-btn');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const statusBox = document.getElementById('status-box');
    const scanCountEl = document.getElementById('scan-count');
    const categoryCountEl = document.getElementById('category-count');
    const loginSection = document.getElementById('login-section');
    const scanSection = document.getElementById('scan-section');
    const authStatus = document.getElementById('auth-status');
    const authText = document.getElementById('auth-text');

    // Check Auth State
    const checkAuth = async () => {
        const data = await chrome.storage.local.get(['authToken', 'userEmail']);
        if (data.authToken) {
            loginSection.classList.add('hidden');
            scanSection.classList.remove('hidden');
            authStatus.classList.remove('disconnected');
            authStatus.classList.add('connected');
            authText.textContent = data.userEmail || 'Connected';
        } else {
            loginSection.classList.remove('hidden');
            scanSection.classList.add('hidden');
            authStatus.classList.remove('connected');
            authStatus.classList.add('disconnected');
            authText.textContent = 'Not Connected';
        }
    };

    await checkAuth();

    // Listen for storage changes (login from background)
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.authToken) {
            checkAuth();
        }
    });

    loginBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'http://localhost:5173/login' });
    });

    startBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
            statusBox.textContent = 'Please go to Twitter Bookmarks page first.';
            return;
        }

        // Send start message to content script
        try {
            await chrome.tabs.sendMessage(tab.id, { action: 'start_scraping' });
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
            statusBox.textContent = 'Scanning...';
        } catch (error) {
            statusBox.textContent = 'Error: Refresh the page and try again.';
        }
    });

    stopBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { action: 'stop_scraping' });
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        statusBox.textContent = 'Stopped.';
    });

    // Listen for updates from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'stats_update') {
            // content.js sends { count: N }
            // We accumulate or just show the count
            scanCountEl.textContent = message.count || 0;
            categoryCountEl.textContent = message.count || 0; // Assuming synced = scanned for now
        }
        if (message.action === 'scan_complete') {
            startBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            statusBox.textContent = 'Scan Complete!';
        }
    });
});
