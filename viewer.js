document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('tweetsGrid');
    const categoriesList = document.getElementById('categoriesList');
    const searchInput = document.getElementById('searchInput');
    const exportBtn = document.getElementById('exportBtn');

    let allTweets = [];
    let currentCategory = 'All';

    // Load data
    chrome.storage.local.get(['tweets'], (result) => {
        allTweets = result.tweets || [];
        renderCategories();
        renderTweets(allTweets);
    });

    function renderCategories() {
        const categories = new Set(allTweets.map(t => t.category || 'Uncategorized'));
        categories.add('Uncategorized');
        
        // Clear existing except 'All'
        while (categoriesList.children.length > 1) {
            categoriesList.removeChild(categoriesList.lastChild);
        }

        categories.forEach(cat => {
            if (!cat) return;
            const tag = document.createElement('div');
            tag.className = 'category-tag';
            tag.textContent = cat;
            tag.dataset.category = cat;
            tag.addEventListener('click', () => {
                document.querySelectorAll('.category-tag').forEach(t => t.classList.remove('active'));
                tag.classList.add('active');
                currentCategory = cat;
                filterTweets();
            });
            categoriesList.appendChild(tag);
        });

        // Re-attach listener to 'All'
        const allTag = categoriesList.firstElementChild;
        allTag.addEventListener('click', () => {
            document.querySelectorAll('.category-tag').forEach(t => t.classList.remove('active'));
            allTag.classList.add('active');
            currentCategory = 'All';
            filterTweets();
        });
    }

    function filterTweets() {
        const query = searchInput.value.toLowerCase();
        const filtered = allTweets.filter(t => {
            const matchesCategory = currentCategory === 'All' || (t.category || 'Uncategorized') === currentCategory;
            const matchesSearch = t.text.toLowerCase().includes(query) || 
                                  t.authorName.toLowerCase().includes(query) || 
                                  t.authorHandle.toLowerCase().includes(query);
            return matchesCategory && matchesSearch;
        });
        renderTweets(filtered);
    }

    searchInput.addEventListener('input', filterTweets);

    exportBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allTweets, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "twitter_bookmarks.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    function renderTweets(tweets) {
        grid.innerHTML = '';
        if (tweets.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #71767b;">No tweets found.</div>';
            return;
        }

        tweets.forEach(tweet => {
            const card = document.createElement('div');
            card.className = 'tweet-card';
            
            let mediaHtml = '';
            if (tweet.mediaUrl) {
                mediaHtml = `<div class="tweet-media"><img src="${tweet.mediaUrl}" loading="lazy"></div>`;
            }

            card.innerHTML = `
                <div class="tweet-author">
                    <div class="tweet-avatar"></div>
                    <div class="tweet-names">
                        <span class="tweet-name">${escapeHtml(tweet.authorName)}</span>
                        <span class="tweet-handle">${escapeHtml(tweet.authorHandle)}</span>
                    </div>
                </div>
                <div class="tweet-text">${escapeHtml(tweet.text)}</div>
                ${mediaHtml}
                <div class="tweet-date">${new Date(tweet.timestamp).toLocaleDateString()}</div>
                <div class="tweet-category">${tweet.category || 'Uncategorized'}</div>
            `;
            
            // Make card clickable to go to tweet
            card.style.cursor = 'pointer';
            card.addEventListener('click', (e) => {
                // Don't trigger if clicking a link inside (if we parsed links)
                window.open(tweet.url, '_blank');
            });

            grid.appendChild(card);
        });
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
