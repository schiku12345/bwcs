/**
 * config/config.js — Physical Configuration File
 * ================================================
 * Edit this file to pre-load maps, icons, backgrounds, and rules
 * without touching the admin panel. All values are applied when you
 * click "Load config.js" in Theme & Config, or automatically on boot.
 *
 * HOW TO USE:
 *   1. Open this file in any text editor
 *   2. Fill in your map names, image paths, etc.
 *   3. Save the file
 *   4. Open the admin panel → Theme & Config → click "📂 Load config.js"
 *      (Or just refresh the page — values are applied on load too)
 *
 * ALL FIELDS ARE OPTIONAL:
 *   Leave any value as "" or [] to skip it. Existing state is only
 *   overwritten for fields you provide with non-empty values.
 *
 * LOCAL IMAGE FILES:
 *   You can place image files anywhere inside the project folder and
 *   reference them using a path relative to THIS config file.
 *   Examples:
 *     imageUrl: "images/maps/aquila.png"
 *     imageUrl: "images/icons/diamond.png"
 *
 *   The helper at the bottom of this file (BWO_CONFIG._resolveUrl)
 *   automatically converts relative paths to the correct absolute URL
 *   so the overlay and admin panel can load them from disk.
 *
 *   Recommended folder layout (all inside bedwars-overlay-modified/):
 *     config/images/maps/       ← map thumbnails
 *     config/images/icons/      ← phase icons (diamond, emerald, bed, skull, bedgone)
 *     config/images/logos/      ← starting / brb screen logos
 *     config/images/bg/         ← background images
 */

window.BWO_CONFIG = {

  /* ──────────────────────────────────────────────────────────────
   * ADMIN PASSWORD
   * The admin panel will show a password gate before loading.
   * Leave as "" to disable the gate (no password required).
   *
   * This is a UI-only gate — it protects the admin panel from
   * casual access. For GitHub Pages hosting this is the right
   * level of security for a tournament control panel.
   * ────────────────────────────────────────────────────────────── */
  adminUiPassword: "bwcs",   // e.g. "myTournament2025"


  /* ──────────────────────────────────────────────────────────────
   * FIREBASE REALTIME DATABASE (cross-computer sync)
   * Fill this in to enable the admin on one machine to drive the
   * overlay on a completely different computer (e.g. stream PC).
   *
   * HOW TO GET THESE VALUES (free, ~3 minutes):
   *   1. Go to https://console.firebase.google.com
   *   2. Create a new project (Spark plan = free)
   *   3. Add a Web App  →  copy the firebaseConfig values below
   *   4. Build → Realtime Database → Create database (test mode)
   *   5. Set RTDB Rules (Build → Realtime Database → Rules):
   *      {
   *        "rules": {
   *          "bwo": {
   *            ".read":  true,
   *            ".write": "auth != null"
   *          }
   *        }
   *      }
   *   6. Build → Authentication → Sign-in method → Enable Email/Password
   *   7. Build → Authentication → Users → Add user
   *      Use any email (e.g. admin@myevent.com) + a strong password
   *      Paste those exact values into adminEmail / adminPassword below
   *
   * Leave ALL fields as "" to run in local-only mode (same machine).
   * ────────────────────────────────────────────────────────────── */
  firebase: {
    apiKey:            "",   // from firebaseConfig
    authDomain:        "",   // e.g. "myproject.firebaseapp.com"
    databaseURL:       "",   // e.g. "https://myproject-default-rtdb.firebaseio.com"
    projectId:         "",   // e.g. "myproject"
    storageBucket:     "",   // e.g. "myproject.appspot.com"
    messagingSenderId: "",
    appId:             "",

    /* Firebase Auth credentials for the admin (write access) */
    adminEmail:    "",   // e.g. "admin@myevent.com"
    adminPassword: "",   // e.g. "strongPassword123"
  },



  /* ──────────────────────────────────────────────────────────────
   * EVENT INFORMATION
   * Shown on the Starting screen and as the subtitle on the Standings
   * screen after each game.
   * ────────────────────────────────────────────────────────────── */

  /** Main event name shown on the Starting screen. Leave "" to clear. */
  eventName: "",

  /** Subtitle shown below the event name on the Starting screen. */
  startingSubtext: "",

  /** Text shown on the BRB screen. */
  brbSubtext: "",


  /* ──────────────────────────────────────────────────────────────
   * TEAM SETTINGS
   * ────────────────────────────────────────────────────────────── */

  /**
   * Number of players per team.
   * 2 = 2-player duos (larger skin renders, better spacing)
   * 4 = 4-player squads (default)
   */
  teamSize: 4,


  /* ──────────────────────────────────────────────────────────────
   * MAP POOL
   * Add every map that could appear in your event.
   * Maps are shown in this order in the map picker and reveal animation.
   *
   * name:     The map display name (shown on overlay during reveal)
   * imageUrl: Path to a local file  →  "images/maps/mymap.png"
   *           OR a full HTTPS URL   →  "https://example.com/mymap.png"
   *           Leave as "" for no image (shows a 🗺️ placeholder).
   * ────────────────────────────────────────────────────────────── */
  maps: [
    // { name: "Aquila",   imageUrl: "images/maps/aquila.png" },
    // { name: "Castaway", imageUrl: "images/maps/castaway.png" },
    // Add more maps here …
  ],


  /* ──────────────────────────────────────────────────────────────
   * PHASE ICONS
   * Custom images shown next to the game timer during each phase.
   * Leave any as "" to use the default emoji (◆ ◈ 🛏 💔 ☠).
   *
   * Use a local path like "images/icons/diamond.png"
   * or a full HTTPS URL.
   *
   * diamond:  Diamond II / Diamond III phases
   * emerald:  Emerald II / Emerald III phases
   * bed:      Bed Destruction phase
   * bedgone:  Icon shown on a team's card when their bed is destroyed
   * skull:    Sudden Death / Game Over phases
   * ────────────────────────────────────────────────────────────── */
  icons: {
    diamond:  "",   // e.g. "images/icons/diamond.png"
    emerald:  "",   // e.g. "images/icons/emerald.png"
    bed:      "",   // e.g. "images/icons/bed.png"
    bedgone:  "",   // e.g. "images/icons/bedgone.png"
    skull:    "",   // e.g. "images/icons/skull.png"
  },


  /* ──────────────────────────────────────────────────────────────
   * BACKGROUND MEDIA
   * Video loops on top of the image fallback.
   * sharedBg* applies to all screens; per-screen overrides take priority.
   *
   * Use a local path like "images/bg/background.mp4"
   * or a full HTTPS URL.
   * ────────────────────────────────────────────────────────────── */

  sharedBgVideoUrl:   "",
  sharedBgImageUrl:   "",

  startingBgVideoUrl: "",
  startingBgImageUrl: "",

  brbBgVideoUrl:      "",
  brbBgImageUrl:      "",

  sumBgVideoUrl:      "",

  mapBgVideoUrl:      "",


  /* ──────────────────────────────────────────────────────────────
   * LOGOS
   * Image URLs for logos shown on the Starting and BRB screens.
   * Leave as "" to show no logo.
   * ────────────────────────────────────────────────────────────── */
  startingLogoUrl: "",
  brbLogoUrl:      "",


  /* ──────────────────────────────────────────────────────────────
   * POINT RULES — Kill / Death Stats
   * ────────────────────────────────────────────────────────────── */
  pointRules: {
    kills:     1,
    deaths:    0,
    finals:    2,
    bedbreaks: 3,
  },


  /* ──────────────────────────────────────────────────────────────
   * PLACEMENT BONUS POINTS
   * Index 0 = 1st place, index 7 = 8th place.
   * ────────────────────────────────────────────────────────────── */
  placementRules: [10, 7, 5, 4, 3, 2, 1, 0],

};


/* ──────────────────────────────────────────────────────────────────
 * LOCAL FILE URL RESOLVER
 * Converts relative paths in this config into absolute URLs that the
 * browser can load, regardless of where the admin panel is opened from.
 *
 * HOW IT WORKS:
 *   This script tag is at  config/config.js
 *   A sibling image at     config/images/maps/aquila.png
 *   resolves to the URL    <origin>/…/config/images/maps/aquila.png
 *
 * DO NOT EDIT BELOW THIS LINE.
 * ────────────────────────────────────────────────────────────────── */
(function () {
  var cfg = window.BWO_CONFIG;

  // Derive the base URL of this config file from the <script> tag
  var scriptEl = (function () {
    var scripts = document.querySelectorAll('script[src]');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src.indexOf('config.js') !== -1) return scripts[i];
    }
    return null;
  })();

  var baseUrl = scriptEl
    ? scriptEl.src.replace(/\/[^/]+$/, '/')   // strip filename, keep trailing /
    : '';

  /**
   * _resolve(path) → string
   * If path is already an absolute URL (http/https/data/blob), return it.
   * If path is a relative path, prepend baseUrl.
   * If path is empty, return it as-is.
   */
  function _resolve(path) {
    if (!path) return path;
    if (/^(https?:|data:|blob:)/.test(path)) return path;
    return baseUrl + path;
  }

  // Resolve map imageUrls
  if (Array.isArray(cfg.maps)) {
    cfg.maps = cfg.maps.map(function (m) {
      return { name: m.name, imageUrl: _resolve(m.imageUrl) };
    });
  }

  // Resolve phase icons
  if (cfg.icons) {
    Object.keys(cfg.icons).forEach(function (k) {
      cfg.icons[k] = _resolve(cfg.icons[k]);
    });
  }

  // Resolve all URL fields
  var urlFields = [
    'sharedBgVideoUrl', 'sharedBgImageUrl',
    'startingBgVideoUrl', 'startingBgImageUrl',
    'brbBgVideoUrl', 'brbBgImageUrl',
    'sumBgVideoUrl', 'mapBgVideoUrl',
    'startingLogoUrl', 'brbLogoUrl',
  ];
  urlFields.forEach(function (f) {
    if (cfg[f]) cfg[f] = _resolve(cfg[f]);
  });

  // Expose resolver so themeConfig.js can use it if needed
  cfg._resolve = _resolve;
})();
