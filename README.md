# Bedwars Overlay System

Real-time tournament overlay for competitive Bedwars events. Built for OBS Browser Source.

## Quick Start

### Local use (same machine)
Open `src/index.html` in a browser. No server needed.

### GitHub Pages (cross-computer)

1. Fork / push this repo to GitHub
2. Go to **Settings → Pages → Source** → select `GitHub Actions`
3. Push to `main` — the site deploys automatically
4. Your URLs will be:
   - **Admin:** `https://yourusername.github.io/your-repo/src/admin/admin.html`
   - **Overlay (OBS):** `https://yourusername.github.io/your-repo/src/overlay/overlay.html`

### Cross-computer sync (Firebase)

Edit `config/config.js` and fill in:

```js
adminUiPassword: "yourPassword",  // locks the admin panel

firebase: {
  apiKey:      "...",
  authDomain:  "yourproject.firebaseapp.com",
  databaseURL: "https://yourproject-default-rtdb.firebaseio.com",
  // ... rest of firebaseConfig
  adminEmail:    "admin@yourevent.com",
  adminPassword: "yourFirebaseAuthPassword",
}
```

See `config/config.js` for full setup instructions.

### OBS Setup

Add a **Browser Source** at **1920×1080** pointing to the overlay URL above.
Check **"Refresh browser when scene becomes active"** for best results.

## Structure

```
config/
  config.js          ← your settings (maps, icons, Firebase, password)
  images/            ← local image files (maps, icons, logos, bg)
src/
  index.html         ← landing page
  admin/             ← admin panel
  overlay/           ← OBS browser source
  shared/            ← state, constants, utils, firebase-sync
```
