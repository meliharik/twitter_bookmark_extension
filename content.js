console.log('[Content Script] categoriX loaded');

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

// --- Custom Button Injection Logic ---

function createCustomButton(isBookmarked = false) {
    const button = document.createElement('div');
    // Use Twitter's class names for layout but add our own for specific styling
    button.className = 'css-175oi2r r-1777fci r-bt1l66 r-bztko3 r-16y2uox r-16l9doz custom-bookmark-btn-container';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('data-testid', 'custom-bookmark-button');
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.transition = 'background-color 0.2s';
    button.style.borderRadius = '9999px';
    button.style.width = '34.75px';
    button.style.height = '34.75px';
    button.style.marginRight = '8px'; // Spacing
    
    // Hover effect
    button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = 'rgba(29, 155, 240, 0.1)';
    });
    button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = 'transparent';
    });
    
    updateButtonState(button, isBookmarked);
    
    return button;
}

function updateButtonState(button, isBookmarked) {
    if (isBookmarked) {
        // Saved State (Green/Filled)
        button.innerHTML = `
            <div dir="ltr" class="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-a023e6 r-rjixqe r-16dba41 r-1awozwy r-6koalj r-1h0z5md r-o7ynqc r-clp7fh r-13qz1uu" style="color: rgb(0, 186, 124);">
                <svg viewBox="0 0 24 24" aria-hidden="true" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-1plcrui r-lrvibr r-1xvli5t r-1hdv0qi" style="width: 20px; height: 20px;">
                    <g><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path></g>
                </svg>
            </div>
        `;
        button.setAttribute('title', 'Saved to CategoriX');
    } else {
        // Unsaved State (Blue/Outline with Plus)
        button.innerHTML = `
            <div dir="ltr" class="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-a023e6 r-rjixqe r-16dba41 r-1awozwy r-6koalj r-1h0z5md r-o7ynqc r-clp7fh r-13qz1uu" style="color: rgb(29, 155, 240);">
                <svg viewBox="0 0 24 24" aria-hidden="true" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-1plcrui r-lrvibr r-1xvli5t r-1hdv0qi" style="width: 20px; height: 20px;">
                    <g>
                        <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z" fill="none" stroke="currentColor" stroke-width="2"></path>
                        <path d="M12 7v6M9 10h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                    </g>
                </svg>
            </div>
        `;
        button.setAttribute('title', 'Save to CategoriX');
    }
}

function injectButtons() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    
    articles.forEach(article => {
        // Check if we already injected the button
        if (article.querySelector('[data-testid="custom-bookmark-button"]')) return;

        // Find the native bookmark button
        const nativeBookmarkBtn = article.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"]');
        if (!nativeBookmarkBtn) return;

        // Determine initial state
        const isBookmarked = nativeBookmarkBtn.getAttribute('data-testid') === 'removeBookmark';

        // Hide native button
        nativeBookmarkBtn.style.display = 'none';

        // Create custom button
        const customBtn = createCustomButton(isBookmarked);
        
        // Insert custom button BEFORE the native button (to keep position)
        nativeBookmarkBtn.parentNode.insertBefore(customBtn, nativeBookmarkBtn);

        // Add click listener
        customBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Toggle state immediately for UI responsiveness
            const currentlyBookmarked = customBtn.querySelector('svg').innerHTML.includes('M12 1.75'); // Simple check based on path
            const newState = !currentlyBookmarked;
            updateButtonState(customBtn, newState);

            // 1. Trigger native bookmark
            nativeBookmarkBtn.click();

            // 2. If saving (not removing), scrape and save to our system
            if (newState) {
                try {
                    // Wait a brief moment for the native bookmark action to potentially update UI state (though we handled UI already)
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const tweetData = await scrapeTweet(article);
                    if (tweetData) {
                        console.log('[Content Script] Saving tweet via custom button:', tweetData);
                        chrome.runtime.sendMessage({
                            action: "saveBookmark",
                            data: tweetData
                        });
                    }
                } catch (err) {
                    console.error('[Content Script] Error saving via custom button:', err);
                    // Revert button on error? Maybe not, as native action might have succeeded.
                }
            }
        });
    });
}

// Observer to handle dynamic content loading
const observer = new MutationObserver((mutations) => {
    let shouldInject = false;
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            shouldInject = true;
            break;
        }
    }
    
    if (shouldInject) {
        injectButtons();
    }
});

// Start observing
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial injection
injectButtons();
