// Background script

// Background script for Twitter Bookmark Organizer

// Listen for external messages (from Web App)
chrome.runtime.onMessageExternal.addListener(
    (request, sender, sendResponse) => {
        if (request.action === 'login') {
            chrome.storage.local.set({
                authToken: request.token,
                userEmail: request.email
            }, () => {
                console.log('User logged in via Web App');
                sendResponse({ success: true });
            });
            return true; // Keep channel open
        }
    }
);

async function getBestModel(apiKey) {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
            throw new Error(`Failed to list models: ${response.status}`);
        }
        const data = await response.json();

        // Find models that support generateContent
        const validModels = data.models.filter(m =>
            m.supportedGenerationMethods &&
            m.supportedGenerationMethods.includes("generateContent")
        );

        // Preference order
        const preferred = [
            'models/gemini-1.5-flash',
            'models/gemini-1.5-pro',
            'models/gemini-1.0-pro',
            'models/gemini-pro'
        ];

        // Try to find a preferred model first
        for (const pref of preferred) {
            const found = validModels.find(m => m.name === pref);
            if (found) return found.name.replace('models/', '');
        }

        // Fallback to the first valid model found
        if (validModels.length > 0) {
            return validModels[0].name.replace('models/', '');
        }

        throw new Error("No models found that support generateContent");
    } catch (e) {
        console.error("Error finding model:", e);
        // Fallback to a safe default if list fails
        return 'gemini-1.5-flash';
    }
}

async function callGeminiApi(text, apiKey) {
    let model;
    try {
        model = await getBestModel(apiKey);
        console.log("Selected model:", model);
    } catch (e) {
        model = 'gemini-1.5-flash';
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `
    You are a tweet classifier. Categorize the following tweet into EXACTLY ONE of these categories:
    Tech, Design, Crypto, AI, News, Humor, Finance, Sports, Politics, Other.

    Return ONLY the category name. Do not explain.

    Tweet: "${text}"
    `;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Model ${model} error: ${response.status}`, errorBody);
            throw new Error(`API Error: ${response.status} - ${errorBody}`);
        }

        const data = await response.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text.trim();
        }
        return null;
    } catch (error) {
        console.error(`Gemini API call failed for ${model}:`, error);
        throw error;
    }
}

// Listen for internal messages (from Content Script)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'sync_bookmarks') {
        syncBookmarksToBackend(message.bookmarks)
            .then(count => sendResponse({ success: true, count }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Async response
    }

    if (message.action === "validate_api_key") {
        callGeminiApi("Test tweet", message.apiKey)
            .then(category => {
                if (category) {
                    sendResponse({ valid: true });
                } else {
                    sendResponse({ valid: false, error: "API check failed" });
                }
            })
            .catch(err => {
                sendResponse({ valid: false, error: err.message });
            });
        return true;
    }

    if (message.action === "classify_tweet") {
        chrome.storage.local.get(['geminiApiKey'], async (result) => {
            const apiKey = result.geminiApiKey;

            if (!apiKey) {
                sendResponse({ category: null, error: "No API Key" });
                return;
            }

            const category = await callGeminiApi(message.text, apiKey);
            sendResponse({ category: category });
        });
        return true; 
    }
});

async function syncBookmarksToBackend(bookmarks) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['authToken'], async (result) => {
            const token = result.authToken;
            if (!token) {
                reject(new Error("User not authenticated. Please login via the Web App."));
                return;
            }

            try {
                const response = await fetch('http://localhost:8080/api/bookmarks/sync', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(bookmarks)
                });

                if (!response.ok) {
                    throw new Error(`Sync failed: ${response.status}`);
                }

                const text = await response.text();
                resolve(text);
            } catch (error) {
                console.error("Sync error:", error);
                reject(error);
            }
        });
    });
}
