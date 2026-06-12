/**
 * themeConfig.js — Admin Theme & Config Module
 *
 * Manages the "Theme & Config" page.
 * Responsibilities:
 *   • Colour preset selection (Blue, Red, Green, Gold, Purple, White)
 *   • Custom hex colour input with auto-derived secondary accent
 *   • Phase icon URL configuration (diamond, emerald, bed, bedgone, skull)
 *   • Map pool management (add / edit / delete / reorder)
 *   • Load physical config from window.BWO_CONFIG (config/config.js)
 *
 * MAP POOL NOTE:
 *   Event delegation + silentUpdate() is used for the map pool inputs
 *   to avoid the 1-char bug. Full update() fires only on blur.
 *
 * DEPENDS ON: BWO_STATE, BWO_UTILS, BWO_ADMIN_UI
 * EXPORTS: window.BWO_THEME_CONFIG
 */

'use strict';

window.BWO_THEME_CONFIG = (function () {

  var ST = window.BWO_STATE;
  var U  = window.BWO_UTILS;
  var UI = window.BWO_ADMIN_UI;

  /** Colour preset definitions. */
  var PRESETS = [
    { label: 'Blue',   hex: '#4488ff', theme: 'blue'   },
    { label: 'Red',    hex: '#ff4040', theme: 'red'    },
    { label: 'Green',  hex: '#40ff80', theme: 'green'  },
    { label: 'Gold',   hex: '#ffcc00', theme: 'gold'   },
    { label: 'Purple', hex: '#aa44ff', theme: 'purple' },
    { label: 'White',  hex: '#ffffff', theme: 'off'    },
  ];


  /* ═══════════════════════════════════════════════════════════════
   * THEME / COLOUR PRESETS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * buildPresetGrid() → void
   * Renders the row of colour-dot preset selectors.
   * Called once on boot; thereafter _syncPresetActive() updates styling.
   */
  function buildPresetGrid() {
    var grid = document.getElementById('preset-grid');
    if (!grid) return;

    grid.innerHTML = PRESETS.map(function (p) {
      return '<div class="cp"' +
        ' style="background:' + p.hex + '"' +
        ' title="' + p.label + '"' +
        ' data-theme="' + p.theme + '"' +
        ' onclick="BWO_THEME_CONFIG.selectPreset(\'' + p.theme + '\')">' +
        '</div>';
    }).join('');

    _syncPresetActive(ST.get().theme || 'blue');
  }

  /**
   * _syncPresetActive(theme) → void
   * Adds the "active" class to the matching preset dot.
   *
   * @param {string} theme - Theme key e.g. "blue"
   */
  function _syncPresetActive(theme) {
    document.querySelectorAll('.cp').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-theme') === theme);
    });
  }

  /**
   * selectPreset(theme) → void
   * Applies a named colour preset and updates the hex input to match.
   *
   * @param {string} theme - Theme key
   */
  function selectPreset(theme) {
    var preset = PRESETS.find(function (p) { return p.theme === theme; });
    ST.update({ theme });
    _syncPresetActive(theme);

    if (preset) {
      var cpEl  = document.getElementById('custom-cp');
      var hexEl = document.getElementById('custom-hex');
      if (cpEl)  cpEl.value  = preset.hex;
      if (hexEl) hexEl.value = preset.hex;
    }
  }

  /**
   * onCustomColour(hex) → void
   * Called when the colour picker input changes.
   * Validates the hex, derives the secondary accent, and persists.
   *
   * @param {string} hex - e.g. "#4488ff"
   */
  function onCustomColour(hex) {
    if (!U.isValidHex(hex)) return;
    var acc2 = U.deriveAccent2(hex);
    ST.update({ theme: 'custom', customAccent: hex, customAccent2: acc2 });
    var hexEl = document.getElementById('custom-hex');
    if (hexEl) hexEl.value = hex;
    _syncPresetActive('custom');
  }

  /**
   * onHexInput(value) → void
   * Called as the user types in the text hex input.
   * Only commits once the value is a valid 6-digit hex.
   *
   * @param {string} value
   */
  function onHexInput(value) {
    if (!U.isValidHex(value)) return;
    var cpEl = document.getElementById('custom-cp');
    if (cpEl) cpEl.value = value;
    onCustomColour(value);
  }

  /**
   * loadTheme(state) → void
   * Syncs the colour picker and hex input from the current state.
   *
   * @param {object} state
   */
  function loadTheme(state) {
    _syncPresetActive(state.theme || 'blue');

    var preset = PRESETS.find(function (p) { return p.theme === state.theme; });
    var hex    = state.theme === 'custom' ? (state.customAccent || '#4488ff')
                                          : (preset ? preset.hex : '#4488ff');

    var cpEl  = document.getElementById('custom-cp');
    var hexEl = document.getElementById('custom-hex');
    if (cpEl)  cpEl.value  = hex;
    if (hexEl) hexEl.value = hex;
  }


  /* ═══════════════════════════════════════════════════════════════
   * PHASE ICONS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * saveIcons() → void
   * Reads the icon URL fields and persists them.
   */
  function saveIcons() {
    function g(id) {
      var el = document.getElementById(id);
      return el ? el.value : '';
    }
    ST.update({
      phaseIcons: {
        diamond: g('ico-diamond'),
        emerald: g('ico-emerald'),
        bed:     g('ico-bed'),
        bedgone: g('ico-bedgone'),
        skull:   g('ico-skull'),
      },
    });
  }

  /**
   * loadIcons(state) → void
   * Syncs the icon URL inputs from state.
   *
   * @param {object} state
   */
  function loadIcons(state) {
    var ic = state.phaseIcons || {};
    _set('ico-diamond', ic.diamond || '');
    _set('ico-emerald', ic.emerald || '');
    _set('ico-bed',     ic.bed     || '');
    _set('ico-bedgone', ic.bedgone || '');
    _set('ico-skull',   ic.skull   || '');
  }


  /* ═══════════════════════════════════════════════════════════════
   * MAP POOL
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderMapPool(state) → void
   * Rebuilds the map pool list using event delegation + silentUpdate
   * to avoid the 1-char bug on name / URL fields.
   *
   * @param {object} state
   */
  function renderMapPool(state) {
    var list = document.getElementById('map-pool-list');
    if (!list) return;

    var pool = state.mapPool || [];

    if (!pool.length) {
      list.innerHTML = '<p class="help">No maps yet. Click "Add Map" above.</p>';
      list.oninput   = null;
      list.onblur    = null;
      list.onclick   = null;
      return;
    }

    list.innerHTML = pool.map(function (map, mi) {
      return _buildMapCardHTML(map, mi);
    }).join('');

    /* ── Delegated: oninput (name or URL fields) ── */
    list.oninput = function (ev) {
      var el   = ev.target;
      var mi   = parseInt(el.getAttribute('data-mi'));
      var pool2 = U.deepClone(ST.get().mapPool || []);
      if (!pool2[mi]) return;

      if (el.classList.contains('mp-name-inp')) pool2[mi].name     = el.value;
      if (el.classList.contains('mp-url-inp'))  pool2[mi].imageUrl = el.value;

      ST.silentUpdate({ mapPool: pool2 });
    };

    /* ── Delegated: onblur (broadcast after typing finishes) ── */
    list.onblur = function (ev) {
      var el = ev.target;
      if (el.classList.contains('mp-name-inp') || el.classList.contains('mp-url-inp')) {
        ST.update({ mapPool: ST.get().mapPool });
      }
    };

    /* ── Delegated: onclick (reorder / delete buttons) ── */
    list.onclick = function (ev) {
      var btn = ev.target.closest('button');
      if (!btn) return;
      var mi    = parseInt(btn.getAttribute('data-mi'));
      var pool2 = U.deepClone(ST.get().mapPool || []);

      if (btn.classList.contains('mp-del')) {
        pool2.splice(mi, 1);
      } else if (btn.classList.contains('mp-up') && mi > 0) {
        var tmp = pool2[mi]; pool2[mi] = pool2[mi - 1]; pool2[mi - 1] = tmp;
      } else if (btn.classList.contains('mp-dn') && mi < pool2.length - 1) {
        var tmp = pool2[mi]; pool2[mi] = pool2[mi + 1]; pool2[mi + 1] = tmp;
      } else {
        return;
      }

      ST.update({ mapPool: pool2 });
    };
  }

  /**
   * _buildMapCardHTML(map, mi) → string
   * Returns the HTML for one map card in the pool list.
   *
   * @param {{ name:string, imageUrl:string }} map
   * @param {number} mi - Index in mapPool
   * @returns {string}
   */
  function _buildMapCardHTML(map, mi) {
    var thumbHTML = map.imageUrl
      ? '<img class="mp-thumb" src="' + U.escapeHtml(map.imageUrl) + '" onerror="this.style.display=\'none\'"/>'
      : '<div class="mp-thumb" style="display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--mut);">🗺️</div>';

    return '<div class="mp-card" data-mi="' + mi + '">' +
      thumbHTML +
      '<div class="mp-fields">' +
        '<input type="text" class="mp-name-inp" data-mi="' + mi + '"' +
          ' placeholder="Map name"' +
          ' value="' + U.escapeHtml(map.name || '') + '"/>' +
        '<input type="text" class="mp-url-inp" data-mi="' + mi + '"' +
          ' placeholder="Image URL (optional)"' +
          ' value="' + U.escapeHtml(map.imageUrl || '') + '"/>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:3px;">' +
        '<button class="btn btn-g btn-sm btn-ic mp-up" data-mi="' + mi + '" title="Move up">↑</button>' +
        '<button class="btn btn-g btn-sm btn-ic mp-dn" data-mi="' + mi + '" title="Move down">↓</button>' +
        '<button class="btn btn-d btn-sm btn-ic mp-del" data-mi="' + mi + '" title="Remove">✕</button>' +
      '</div>' +
    '</div>';
  }

  /**
   * addMap() → void
   * Appends a new blank map entry to the map pool.
   */
  function addMap() {
    var state = ST.get();
    var pool  = U.deepClone(state.mapPool || []);
    pool.push({ name: '', imageUrl: '' });
    ST.update({ mapPool: pool });
  }


  /* ═══════════════════════════════════════════════════════════════
   * PHYSICAL CONFIG FILE
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * loadConfigFile() → void
   * Reads window.BWO_CONFIG (populated by /config/config.js) and
   * applies its settings to state in one update call.
   *
   * Shows a status message in the admin UI after loading.
   */
  function loadConfigFile() {
    var cfg = window.BWO_CONFIG;

    if (!cfg) {
      UI.notify('config.js not found — ensure it is loaded before the admin');
      console.warn('[ThemeConfig] window.BWO_CONFIG is undefined');
      return;
    }

    var patch = {};

    /* Event / screen text — apply even when empty so config can clear values */
    if (typeof cfg.eventName      === 'string') patch.startingEventName = cfg.eventName;
    if (typeof cfg.startingSubtext === 'string') patch.startingSubtext  = cfg.startingSubtext;
    if (typeof cfg.brbSubtext      === 'string') patch.brbSubtext       = cfg.brbSubtext;

    /* Team size */
    if (cfg.teamSize) patch.teamSize = cfg.teamSize;

    /* Map pool — always apply when present (even empty array clears the pool) */
    if (Array.isArray(cfg.maps)) {
      patch.mapPool = cfg.maps.map(function (m) {
        return { name: m.name || '', imageUrl: m.imageUrl || '' };
      });
    }

    /* Phase icons */
    if (cfg.icons) {
      patch.phaseIcons = {
        diamond: cfg.icons.diamond || '',
        emerald: cfg.icons.emerald || '',
        bed:     cfg.icons.bed     || '',
        bedgone: cfg.icons.bedgone || '',
        skull:   cfg.icons.skull   || '',
      };
    }

    /* Background media */
    var bgKeys = [
      'sharedBgVideoUrl', 'sharedBgImageUrl',
      'startingBgVideoUrl', 'startingBgImageUrl',
      'brbBgVideoUrl', 'brbBgImageUrl',
      'sumBgVideoUrl', 'mapBgVideoUrl',
    ];
    bgKeys.forEach(function (k) {
      if (cfg[k] !== undefined) patch[k] = cfg[k];
    });

    /* Logo URLs */
    if (cfg.startingLogoUrl !== undefined) patch.startingLogoUrl = cfg.startingLogoUrl;
    if (cfg.brbLogoUrl      !== undefined) patch.brbLogoUrl      = cfg.brbLogoUrl;

    /* Point rules */
    if (cfg.pointRules)                    patch.pointRules      = cfg.pointRules;
    if (Array.isArray(cfg.placementRules)) patch.placementRules  = cfg.placementRules;

    ST.update(patch);

    /* Show feedback */
    var statusEl = document.getElementById('config-load-status');
    if (statusEl) {
      statusEl.style.display = '';
      var mapCount = Array.isArray(cfg.maps) ? cfg.maps.length : 0;
      statusEl.textContent = '✓ Loaded: ' + mapCount + ' maps, icons, backgrounds, rules';
    }

    UI.notify('Config loaded! ✓');
    console.info('[ThemeConfig] BWO_CONFIG applied', patch);
  }


  /* ═══════════════════════════════════════════════════════════════
   * HELPER
   * ═══════════════════════════════════════════════════════════════ */

  function _set(id, value) {
    var el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = value;
  }


  /* ─── Public API ──────────────────────────────────────────────── */
  return Object.freeze({
    // Theme
    buildPresetGrid,
    selectPreset,
    onCustomColour,
    onHexInput,
    loadTheme,
    // Icons
    saveIcons,
    loadIcons,
    // Map pool
    renderMapPool,
    addMap,
    // Config
    loadConfigFile,
  });

})();
