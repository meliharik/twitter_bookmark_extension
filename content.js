console.log('[Content Script] Twitter Bookmark Organizer loaded');

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Content Script] Received message:', request.action);

  if (request.action === "scrape") {
    scrapeTweet().then(data => {
        console.log('[Content Script] Scraped tweet:');
        console.log('  - Tweet ID:', data?.id);
        console.log('  - Text:', data?.text?.substring(0, 50) + '...');
        console.log('  - Author:', data?.authorName, '(@' + data?.authorHandle + ')');
        console.log('  - Profile Picture:', data?.authorProfilePicture ? '✓' : '✗');
        console.log('  - Media:', data?.mediaUrl ? '✓' : '✗');
        console.log('  - Created At:', data?.tweetCreatedAt);
        console.log('  - Is Bookmarked:', data?.isBookmarked);
        sendResponse(data);
    });
    return true; // Keep channel open
  } else if (request.action === "scrapeAll") {
    // Use async function for scrolling
    scrollAndScrapeAll(sendResponse);
    return true; // Keep the message channel open for async response
  }

  return true; // Keep the message channel open for async response
});

async function scrapeTweet(articleElement = null) {
  try {
    // If no element provided, try to find the main tweet (focused or first one)
    const article = articleElement || document.querySelector('article[data-testid="tweet"]');
    if (!article) return null;

    const textElement = article.querySelector('div[data-testid="tweetText"]');

    // Check for "Show more" button and click it to reveal full text
    const showMoreButton = textElement ? textElement.querySelector('[data-testid="tweet-text-show-more-link"]') : null;
    if (showMoreButton) {
        console.log('[Content Script] Found "Show more" button, clicking...');
        showMoreButton.click();
        // Wait a bit for the text to expand
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    const text = textElement ? textElement.innerText : '';

    const userElement = article.querySelector('div[data-testid="User-Name"]');
    const authorName = userElement ? userElement.querySelector('span').innerText : '';
    // Handle parsing carefully as structure varies
    const handleParts = userElement ? userElement.innerText.split('@') : [];
    const authorHandle = handleParts.length > 1 ? handleParts[1].split('\n')[0] : '';

    // Get author profile picture - try multiple selectors
    let authorProfilePicture = null;
    const avatarSelectors = [
      `a[href="/${authorHandle}"] img`,
      `a[href="/${authorHandle}/photo"] img`,
      'div[data-testid="Tweet-User-Avatar"] img',
      'img[alt*="profile"]',
      'article img[src*="profile_images"]'
    ];

    for (const selector of avatarSelectors) {
      const img = article.querySelector(selector);
      if (img && img.src) {
        authorProfilePicture = img.src;
        break;
      }
    }

    const timeElement = article.querySelector('time');
    let tweetId = '';
    let url = window.location.href;
    let tweetCreatedAt = null;

    if (timeElement) {
        const link = timeElement.parentElement.getAttribute('href');
        if (link) {
            tweetId = link.split('/').pop();
            url = 'https://twitter.com' + link;
        }
        // Get tweet creation date from datetime attribute
        const datetime = timeElement.getAttribute('datetime');
        if (datetime) {
            tweetCreatedAt = new Date(datetime).toISOString();
        }
    }
    
    // If we are scraping a specific element from a list, we MUST rely on the time element link
    // If we are scraping the main tweet on a status page, we can fallback to window.location
    if (!tweetId && !articleElement) {
        tweetId = window.location.pathname.split('/').pop();
    }

    // Media (Image/Video)
    const imgElement = article.querySelector('img[alt="Image"]');
    const mediaUrl = imgElement ? imgElement.src : null;

    // Check if tweet is bookmarked
    // Twitter uses aria-label or data-testid for bookmark button
    const bookmarkButton = article.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"]');
    const isBookmarked = bookmarkButton?.getAttribute('data-testid') === 'removeBookmark';

    // Skip if no text and no media (likely an ad or empty container)
    if (!text && !mediaUrl) return null;

    return {
      id: tweetId,
      text: text,
      authorName: authorName,
      authorHandle: authorHandle,
      authorProfilePicture: authorProfilePicture,
      url: url,
      mediaUrl: mediaUrl,
      tweetCreatedAt: tweetCreatedAt,
      category: 'Uncategorized',
      isBookmarked: isBookmarked
    };
  } catch (e) {
    console.error('Scraping error:', e);
    return null;
  }
}

function scrapeAllTweets() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    const tweets = [];
    const seenIds = new Set();

    articles.forEach(article => {
        const tweetData = scrapeTweet(article);
        // Only include bookmarked tweets
        if (tweetData && tweetData.id && !seenIds.has(tweetData.id) && tweetData.isBookmarked) {
            tweets.push(tweetData);
            seenIds.add(tweetData.id);
        }
    });

    console.log(`[Content Script] Found ${tweets.length} bookmarked tweets out of ${articles.length} total tweets`);
    return tweets;
}

// Async function to scroll page and scrape tweets progressively
async function scrollAndScrapeAll(sendResponse) {
    console.log('[Content Script] Starting progressive scroll and scrape...');

    const allScrapedTweets = [];
    const seenIds = new Set();
    let lastHeight = document.documentElement.scrollHeight;
    let lastTweetCount = 0;
    let scrollAttempts = 0;
    let noNewContentCount = 0;
    const maxScrollAttempts = 200;
    const maxNoNewContent = 5;
    const scrollDelay = 2000;

    // Scroll and scrape progressively
    while (scrollAttempts < maxScrollAttempts && noNewContentCount < maxNoNewContent) {
        // Scrape current visible tweets
        const articles = document.querySelectorAll('article[data-testid="tweet"]');

        for (const article of articles) {
            const tweetData = await scrapeTweet(article);
            // Only include bookmarked tweets and avoid duplicates
            if (tweetData && tweetData.id && !seenIds.has(tweetData.id) && tweetData.isBookmarked) {
                allScrapedTweets.push(tweetData);
                seenIds.add(tweetData.id);
            }
        }

        const currentTweetCount = articles.length;
        console.log(`[Content Script] Scraped progress: ${allScrapedTweets.length} unique bookmarks collected (${currentTweetCount} total tweets in DOM)`);

        // Scroll to bottom
        window.scrollTo(0, document.documentElement.scrollHeight);

        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, scrollDelay));

        const newHeight = document.documentElement.scrollHeight;
        const newTweetCount = document.querySelectorAll('article[data-testid="tweet"]').length;

        // Check both height and tweet count
        if (newHeight === lastHeight && newTweetCount === lastTweetCount) {
            noNewContentCount++;
            console.log(`[Content Script] No new content (Attempt ${noNewContentCount}/${maxNoNewContent})`);
        } else {
            noNewContentCount = 0;
            const newTweets = newTweetCount - lastTweetCount;
            console.log(`[Content Script] New content loaded: +${newTweets} tweets`);
        }

        lastHeight = newHeight;
        lastTweetCount = newTweetCount;
        scrollAttempts++;

        // Log progress every 10 scrolls
        if (scrollAttempts % 10 === 0) {
            console.log(`[Content Script] ⏳ Progress: ${scrollAttempts} scrolls, ${allScrapedTweets.length} bookmarks collected`);
        }
    }

    console.log(`[Content Script] ✅ Scrolling complete!`);
    console.log(`[Content Script] 📊 Total bookmarks collected: ${allScrapedTweets.length}`);

    sendResponse(allScrapedTweets);
}
