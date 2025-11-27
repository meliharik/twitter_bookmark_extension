# Extension Auth Sync - Troubleshooting Guide

## Sorun: Auth sync çalışmıyor

### Adım 1: Extension'ı Yeniden Yükle

1. Chrome'da `chrome://extensions` sayfasını aç
2. "Developer mode" açık olduğundan emin ol
3. Extension'ın yanındaki **Reload** butonuna tıkla
4. Veya extension'ı kaldır ve tekrar "Load unpacked" ile yükle

### Adım 2: Console Loglarını Kontrol Et

1. Web sitesinde (`localhost:5173`) login ol
2. **F12** ile Developer Tools'u aç
3. **Console** sekmesine bak
4. Şu mesajları görmeli:
   - `[Twitter Bookmark Sync] Content script loaded`
   - `[Twitter Bookmark Sync] Received auth data from website`
   - `[Twitter Bookmark Sync] Auth synced to extension storage`

### Adım 3: Extension Storage'ı Kontrol Et

1. `chrome://extensions` sayfasını aç
2. Extension'ın altındaki **Inspect views: service worker** linkine tıkla
3. Console'da şunu yaz:
   ```javascript
   chrome.storage.local.get(['token', 'userEmail'], (result) => {
     console.log('Storage:', result);
   });
   ```
4. Token ve email görünmeli

### Adım 4: Manuel Test

Web sitesinin console'unda şunu çalıştır:
```javascript
window.postMessage({
  type: 'TWITTER_BOOKMARK_AUTH',
  data: {
    token: 'test_token_123',
    userEmail: 'test@example.com'
  }
}, window.location.origin);
```

Sonra extension storage'ı kontrol et (Adım 3).

### Yaygın Sorunlar

1. **Extension yüklü değil**: `chrome://extensions` kontrol et
2. **Content script yüklenmemiş**: Sayfayı yenile (F5)
3. **Manifest hatası**: Extension console'da hata var mı kontrol et
4. **Origin uyuşmazlığı**: `window.location.origin` doğru mu kontrol et
5. **"Extension context invalidated" hatası**
   - Extension yeniden yüklendiğinde oluşur
   - Çözüm: Web sayfasını (`localhost:5173`) yenile (F5)
6. **"Identifier 'API_URL' has already been declared" hatası**
   - `popup.js` ve `auth.js` çakışması
   - Çözüm: `popup.js` içindeki `API_URL` tanımı kaldırıldı (otomatik düzeltildi)
7. **"Invalid OAuth client" hatası**
   - Extension ID doğru mu kontrol et
   - Client ID doğru mu kontrol et
   - OAuth consent screen'de scopes ekli mi kontrol et

### Değişiklikler

- `manifest.json`'a `localhost:5173` ve `localhost:8080` için `host_permissions` eklendi
- Bu değişiklikten sonra extension'ı **mutlaka yeniden yükle**
