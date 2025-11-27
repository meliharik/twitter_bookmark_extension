// config.js - Shared configuration for extension
// Auto-detect environment based on extension manifest
const isDevelopment = !('update_url' in chrome.runtime.getManifest());
const API_URL = isDevelopment
  ? 'http://localhost:8080/api'
  : 'http://13.51.199.12:8080/api';

console.log(`[Extension] Running in ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);
console.log(`[Extension] API URL: ${API_URL}`);
