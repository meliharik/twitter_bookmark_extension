document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');

    // Load existing key
    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            apiKeyInput.value = result.geminiApiKey;
        }
    });

    saveBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            status.textContent = "Please enter a valid API key.";
            status.style.color = "red";
            return;
        }

        chrome.storage.local.set({ geminiApiKey: key }, () => {
            status.textContent = "Settings saved successfully!";
            status.style.color = "#1d9bf0";
            setTimeout(() => {
                status.textContent = "";
            }, 3000);
        });
    });
});
