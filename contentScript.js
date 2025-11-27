// Listen for messages from the web page
window.addEventListener('message', async (event) => {
  // Verify the origin
  if (event.origin !== 'http://localhost:5173' && event.origin !== 'https://your-production-url.com') {
    return;
  }

  if (event.data.type === 'TWITTER_BOOKMARK_AUTH') {
    const { token, userEmail, profilePictureUrl } = event.data.data;
    
    if (token && userEmail) {
      await chrome.storage.local.set({ 
        token, 
        userEmail,
        profilePictureUrl: profilePictureUrl || null
      });
      console.log('Twitter Bookmark: Auth data synced to extension');
    }
  } else if (event.data.type === 'TWITTER_BOOKMARK_LOGOUT') {
    await chrome.storage.local.remove(['token', 'userEmail', 'profilePictureUrl']);
    console.log('Twitter Bookmark: Logged out from extension');
  }
});
