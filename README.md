# Twitter Bookmark Extension

A Chrome Extension to scrape and save Twitter bookmarks to the organizer app. It communicates with the locally running frontend and backend to sync your bookmarks.

## Features

- **Authentication**: Connects to the web app to authenticate the user.
- **Scraping**: Automatically scrolls and scrapes bookmarks from your Twitter Bookmarks page.
- **Sync**: Sends scraped data to the backend for storage and processing.

## Installation

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select this folder (`extension`).

## Usage

1. **Start the Web App**: Ensure both the frontend (`http://localhost:5173`) and backend (`http://localhost:8080`) are running.
2. **Open the Extension**: Click the extension icon in the Chrome toolbar.
3. **Login**: Click **"Login with Web App"**. This will open the web app in a new tab. If you are already logged in, it will automatically sync your session to the extension.
4. **Navigate to Twitter**: Go to your [Twitter Bookmarks](https://twitter.com/i/bookmarks) page.
5. **Start Scanning**: Click **"Start Scanning"** in the extension popup. The extension will scroll down and capture your bookmarks.

## Troubleshooting

- **"Connection Failed"**: Ensure the backend is running at `http://localhost:8080`.
- **"Not Logged In"**: Try clicking "Login with Web App" again. Ensure you are logged into the web app in the same browser profile.
