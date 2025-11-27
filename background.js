const API_URL = 'http://localhost:8080/api';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "saveToOrganizer",
    title: "Save to Organizer",
    contexts: ["page", "selection", "link"],
    documentUrlPatterns: ["https://twitter.com/*", "https://x.com/*"]
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SYNC_AUTH') {
    const { token, userEmail } = request.data;
    if (token) {
      chrome.storage.local.set({ token, userEmail }, () => {
        console.log('Auth synced from website');
      });
    }
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "saveToOrganizer") {
    try {
      // Check auth
      const { token } = await chrome.storage.local.get(['token']);
      if (!token) {
        // Ideally show a notification or open popup
        console.log('Not logged in');
        return;
      }

      // Execute scrape
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      
      // Send message to content script to scrape
      const response = await chrome.tabs.sendMessage(tab.id, { action: "scrape" });
      
      if (response) {
        // Save to backend
        await fetch(`${API_URL}/bookmarks/sync`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify([response])
        });
        console.log('Saved successfully');
      }
    } catch (error) {
      console.error('Save failed:', error);
    }
  }
});
