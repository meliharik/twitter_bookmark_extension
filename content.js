// Content script to scrape bookmarks

let isScraping = false;
let scrapedTweets = new Map(); // Use Map to avoid duplicates by ID

// Simple keyword-based classifier as fallback
function simpleCategorize(text) {
    text = text.toLowerCase();
    if (text.includes('javascript') || text.includes('python') || text.includes('code') || text.includes('dev') || text.includes('api')) return 'Tech';
    if (text.includes('design') || text.includes('ui') || text.includes('ux') || text.includes('color') || text.includes('font')) return 'Design';
    if (text.includes('crypto') || text.includes('btc') || text.includes('eth') || text.includes('bitcoin')) return 'Crypto';
    if (text.includes('ai') || text.includes('gpt') || text.includes('llm') || text.includes('model')) return 'AI';
    if (text.includes('news') || text.includes('breaking')) return 'News';
    if (text.includes('lol') || text.includes('funny') || text.includes('meme')) return 'Humor';
    return 'General';
}

// Send scraped bookmarks to background for syncing
async function syncBookmarks(bookmarks) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
            action: 'sync_bookmarks', 
            bookmarks: bookmarks 
        }, (response) => {
            resolve(response);
        });
    });
}

function parseTweetDom(article) {
    try {
        const textElement = article.querySelector('[data-testid="tweetText"]');
        const text = textElement ? textElement.innerText : "";
        
        const userElement = article.querySelector('[data-testid="User-Name"]');
        const authorName = userElement ? userElement.querySelector('span')?.innerText : "Unknown";
        const authorHandle = userElement ? userElement.querySelectorAll('span')[1]?.innerText : "@unknown"; 
        
        const timeElement = article.querySelector('time');
        const timestamp = timeElement ? timeElement.getAttribute('datetime') : new Date().toISOString();
        
        const linkElement = article.querySelector('a[href*="/status/"]');
        const url = linkElement ? linkElement.href : window.location.href;
        const id = url.split('/status/')[1]?.split('?')[0] || Math.random().toString(36);

        const imgElement = article.querySelector('img[src*="media"]');
        const mediaUrl = imgElement ? imgElement.src : null;

        return { id, text, authorName, authorHandle, timestamp, url, mediaUrl };
    } catch (e) {
        return null;
    }
}



// Helper to ask background to classify
async function categorizeTweet(text) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
            action: 'classify_tweet', 
            text: text 
        }, (response) => {
            resolve(response.category || 'Uncategorized');
        });
    });
}

async function scrollAndScrape() {
    if (!isScraping) return;

    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    let newTweets = []; // Define local batch

    for (const article of articles) {
        const partialData = parseTweetDom(article);
        if (partialData && !scrapedTweets.has(partialData.id)) {
            // Categorize
            const category = await categorizeTweet(partialData.text);
            const fullData = { ...partialData, category };
            
            scrapedTweets.set(fullData.id, fullData);
            newTweets.push(fullData);
        }
    }

    // Batch process new tweets
    if (newTweets.length > 0) {
        console.log(`Syncing ${newTweets.length} new tweets...`);
        
        // Sync to backend
        await syncBookmarks(newTweets);
        
        // Store locally just for cache/deduplication
        const storage = await chrome.storage.local.get(['bookmarks']);
        const currentBookmarks = storage.bookmarks || [];
        await chrome.storage.local.set({ 
            bookmarks: [...currentBookmarks, ...newTweets] 
        });

        // Update popup stats (optional, if popup listens)
        chrome.runtime.sendMessage({
            action: 'stats_update',
            count: newTweets.length
        });
    }
    
    // Scroll down
    window.scrollTo(0, document.body.scrollHeight);
    
    // Wait for content to load
    await new Promise(r => setTimeout(r, 2000));

    if (isScraping) {
        requestAnimationFrame(scrollAndScrape);
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "start_scraping") {
        if (isScraping) return;
        isScraping = true;
        console.log("Started scraping bookmarks...");
        
        // Load existing to avoid dupes if re-running
        chrome.storage.local.get(['tweets'], (result) => {
            if (result.tweets) {
                result.tweets.forEach(t => scrapedTweets.set(t.id, t));
            }
            scrollAndScrape();
        });
    }
    
    if (message.action === "stop_scraping") {
        isScraping = false;
    }
});
