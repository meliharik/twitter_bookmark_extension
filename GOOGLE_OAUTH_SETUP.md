# Google Cloud Console - Chrome Extension OAuth Setup Guide

## Adım 1: Extension ID'yi Al

Önce extension'ı Chrome'a yükleyip ID'sini almamız gerekiyor.

1. Chrome'da `chrome://extensions` sayfasını aç
2. **Developer mode** açık olduğundan emin ol
3. **Load unpacked** tıkla
4. `extension` klasörünü seç
5. Extension yüklendikten sonra, kartın üstünde **ID** görünecek
   - Örnek: `abcdefghijklmnopqrstuvwxyz123456`
   - Bu ID'yi kopyala ve bir yere not et

## Adım 2: Google Cloud Console'da OAuth Client Oluştur

1. [Google Cloud Console](https://console.cloud.google.com/) aç
2. Mevcut projeyi seç (categoriX için kullandığın proje)
3. Sol menüden **APIs & Services** > **Credentials** seç

### OAuth Client ID Oluştur

4. **+ CREATE CREDENTIALS** tıkla
5. **OAuth client ID** seç
6. **Application type** olarak **Chrome extension** seç
7. **Name**: `categoriX Extension`
8. **Item ID**: Extension ID'yi yapıştır (Adım 1'den)
9. **CREATE** tıkla

### Client ID'yi Kaydet

10. Oluşturulan Client ID'yi kopyala
    - Örnek: `123456789-abc123def456.apps.googleusercontent.com`
11. Bu ID'yi `.env` dosyasına ekleyeceğiz

## Adım 3: OAuth Consent Screen Kontrolü

1. **OAuth consent screen** sekmesine git
2. **Scopes** bölümünde şunların olduğundan emin ol:
   - `userinfo.email`
   - `userinfo.profile`
3. Yoksa **EDIT APP** tıkla ve ekle

## Adım 4: Extension Manifest'e Ekle

Extension ID ve OAuth Client ID'yi aldıktan sonra:

1. `extension/manifest.json` dosyasını aç
2. Şu kısmı ekle:

```json
{
  "oauth2": {
    "client_id": "BURAYA_CLIENT_ID_YAPISTIR.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ]
  },
  "key": "BURAYA_PUBLIC_KEY_GELECEK"
}
```

**NOT**: `key` kısmı için Chrome Extension'ı ilk yüklediğinde otomatik oluşur. Bunu daha sonra ekleyeceğiz.

## Adım 5: Test

1. Extension'ı reload et
2. Popup'ta "Login with Google" butonuna tıkla
3. Google yetkilendirme sayfası açılmalı
4. Hesabını seç ve yetki ver
5. Extension otomatik login olmalı

## Sorun Giderme

### "Invalid OAuth client" hatası
- Extension ID doğru mu kontrol et
- Client ID doğru mu kontrol et
- OAuth consent screen'de scopes ekli mi kontrol et

### "Redirect URI mismatch" hatası
- Chrome Extension OAuth için redirect URI otomatik oluşur
- Format: `https://<extension-id>.chromiumapp.org/`
- Google Cloud Console'da bu URI'yi manuel eklemeye gerek yok

---

## Özet

İhtiyacın olan bilgiler:
1. ✅ Extension ID (chrome://extensions'dan)
2. ✅ OAuth Client ID (Google Cloud Console'dan)

Bu bilgileri aldıktan sonra kodu güncelleyeceğim.
