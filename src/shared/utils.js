/**
 * utils.js — Pure utility functions shared by every module.
 *
 * Rules:
 *   • No DOM access
 *   • No state reads or writes
 *   • Every function is deterministic — same input → same output
 *   • All functions exported on window.BWO_UTILS
 *
 * Categories:
 *   TIME      — formatting durations, computing phase from elapsed time
 *   COLOUR    — hex manipulation, rgba construction, accent derivation
 *   SKIN      — building Minecraft skin API URLs
 *   STRING    — safe escaping, ordinal labels
 *   CSV       — CSV line → array parsing
 *   MISC      — deep-clone, etc.
 */

'use strict';

window.BWO_UTILS = (function () {

  var C = window.BWO_CONST; // shorthand


  /* ═══════════════════════════════════════════════════════════════
   * TIME UTILITIES
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * fmt(seconds) → "m:ss"
   * Formats a raw seconds value into a human-readable timer string.
   *
   * @param {number} s - Total seconds (may be fractional; will be floored)
   * @returns {string} e.g. "1:04" or "10:00"
   */
  function fmt(s) {
    var sec = Math.max(0, Math.floor(s));
    var m   = Math.floor(sec / 60);
    var ss  = sec % 60;
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  /**
   * getElapsed(state) → number
   * Returns the total elapsed game-timer seconds, accounting for
   * whether the timer is currently running or paused.
   *
   * @param {object} state - The global state object
   * @returns {number} Elapsed seconds
   */
  function getElapsed(state) {
    if (!state.timerRunning || !state.timerStartTime) {
      return state.timerOffset || 0;
    }
    return (state.timerOffset || 0) + (Date.now() - state.timerStartTime) / 1000;
  }

  /**
   * getStartingElapsed(state) → number
   * Returns elapsed seconds on the starting-screen countdown timer.
   *
   * @param {object} state - The global state object
   * @returns {number} Elapsed seconds since starting timer was started
   */
  function getStartingElapsed(state) {
    if (!state.startingTimerRunning || !state.startingTimerStart) {
      return state.startingTimerOffset || 0;
    }
    return (state.startingTimerOffset || 0) + (Date.now() - state.startingTimerStart) / 1000;
  }

  /**
   * getPhase(elapsedSeconds) → { phase, index, phaseElapsed }
   * Determines which game phase we're currently in based on how much
   * time has passed since the timer started.
   *
   * @param {number} elapsedSeconds - Total elapsed game time in seconds
   * @returns {{ phase: object, index: number, phaseElapsed: number }}
   *   phase        — the PHASES entry for the current phase
   *   index        — its index in PHASES
   *   phaseElapsed — seconds elapsed within this specific phase
   */
  function getPhase(elapsedSeconds) {
    var phases = C.PHASES;
    var acc    = 0;

    for (var i = 0; i < phases.length; i++) {
      acc += phases[i].duration;
      if (elapsedSeconds < acc) {
        return {
          phase:        phases[i],
          index:        i,
          phaseElapsed: elapsedSeconds - (acc - phases[i].duration),
        };
      }
    }

    // Past the last phase — stay on the final one
    var last = phases[phases.length - 1];
    return {
      phase:        last,
      index:        phases.length - 1,
      phaseElapsed: last.duration,
    };
  }


  /* ═══════════════════════════════════════════════════════════════
   * COLOUR UTILITIES
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * hexToRgba(hex, alpha) → "rgba(r, g, b, a)"
   * Converts a 6-digit hex colour + alpha into an rgba string.
   *
   * @param {string} hex   - e.g. "#4488ff"
   * @param {number} alpha - 0–1
   * @returns {string}
   */
  function hexToRgba(hex, alpha) {
    try {
      var r = parseInt(hex.slice(1, 3), 16);
      var g = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    } catch (e) {
      return 'rgba(0,0,0,' + alpha + ')';
    }
  }

  /**
   * deriveAccent2(hex) → hex string
   * Given a primary accent colour, auto-generates a harmonious
   * secondary accent by rotating hue slightly and lightening.
   *
   * @param {string} hex - Primary accent colour e.g. "#4488ff"
   * @returns {string}   - Secondary accent hex
   */
  function deriveAccent2(hex) {
    try {
      var r = parseInt(hex.slice(1, 3), 16) / 255;
      var g = parseInt(hex.slice(3, 5), 16) / 255;
      var b = parseInt(hex.slice(5, 7), 16) / 255;

      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      var h, s, l = (max + min) / 2;

      if (max === min) {
        h = s = 0;
      } else {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          default: h = ((r - g) / d + 4) / 6;
        }
      }

      h = (h + 0.08) % 1;
      l = Math.min(0.85, l + 0.15);

      function hue2rgb(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 0.5) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      }

      var q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p2  = 2 * l - q2;

      return '#' + [
        hue2rgb(p2, q2, h + 1/3),
        hue2rgb(p2, q2, h),
        hue2rgb(p2, q2, h - 1/3),
      ].map(function (v) {
        var x = Math.round(v * 255).toString(16);
        return x.length === 1 ? '0' + x : x;
      }).join('');
    } catch (e) {
      return '#00e5ff';
    }
  }

  /**
   * getThemeAccents(state) → [primaryHex, secondaryHex]
   * Returns the two accent colours for the current theme.
   *
   * @param {object} state - Global state
   * @returns {[string, string]}
   */
  function getThemeAccents(state) {
    var presets = {
      blue:   ['#4488ff', '#00e5ff'],
      red:    ['#ff4040', '#ff8080'],
      green:  ['#40ff80', '#00ffcc'],
      gold:   ['#ffcc00', '#ffaa00'],
      purple: ['#aa44ff', '#cc88ff'],
      off:    ['#ffffff', '#cccccc'],
    };

    if (state.theme === 'custom') {
      var acc = state.customAccent || '#4488ff';
      return [acc, deriveAccent2(acc)];
    }

    return presets[state.theme] || presets.blue;
  }


  /* ═══════════════════════════════════════════════════════════════
   * SKIN URL BUILDERS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * skinFullURL(username) → string
   * Full-body skin image URL for a Minecraft username.
   *
   * @param {string} username
   * @returns {string}
   */
  function skinFullURL(username) {
    return C.SKIN_API.fullBody + encodeURIComponent(username.trim());
  }

  /**
   * skinBustURL(username) → string
   * Bust (head + torso) skin image URL.
   *
   * @param {string} username
   * @returns {string}
   */
  function skinBustURL(username) {
    return C.SKIN_API.bust + encodeURIComponent(username.trim());
  }

  /**
   * skinHeadURL(username, size) → string
   * Square face/head avatar URL.
   *
   * @param {string} username
   * @param {number} [size=20] - Pixel size
   * @returns {string}
   */
  function skinHeadURL(username, size) {
    return C.SKIN_API.head + encodeURIComponent(username.trim()) + '/' + (size || 20);
  }

  /**
   * skinFallbackURL(username) → string
   * Fallback to Crafatar bust if Visage fails.
   *
   * @param {string} username
   * @returns {string}
   */
  function skinFallbackURL(username) {
    return C.SKIN_API.headFallback + encodeURIComponent(username.trim());
  }


  /* ═══════════════════════════════════════════════════════════════
   * PLAYER HELPERS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * getPlayerName(player) → string
   * Safely extracts the name string from a player value,
   * which may be a plain string or a {name, dead} object.
   *
   * @param {string|object} player
   * @returns {string}
   */
  function getPlayerName(player) {
    if (typeof player === 'string') return player;
    return (player && player.name) ? player.name : '';
  }

  /**
   * isPlayerDead(player) → boolean
   * Returns true if the player object has dead === true.
   *
   * @param {string|object} player
   * @returns {boolean}
   */
  function isPlayerDead(player) {
    return typeof player === 'object' && player !== null && player.dead === true;
  }


  /* ═══════════════════════════════════════════════════════════════
   * STRING UTILITIES
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * escapeHtml(str) → string
   * Escapes a string for safe insertion into innerHTML.
   *
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * ordinal(n) → string
   * Returns the ordinal label for a 1-based placement index.
   * e.g. ordinal(1) → "1st"
   *
   * @param {number} n - 1-based
   * @returns {string}
   */
  function ordinal(n) {
    return C.ORDINALS[n - 1] || (n + 'th');
  }

  /**
   * parseCountdownInput(value) → number (seconds)
   * Parses a user input that may be "mm:ss", "m:ss", or raw seconds.
   * Returns 0 if the value cannot be parsed.
   *
   * @param {string} value - Raw input string
   * @returns {number}
   */
  function parseCountdownInput(value) {
    var v = (value || '').trim();
    if (v.includes(':')) {
      var parts = v.split(':');
      return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
    }
    return parseInt(v) || 0;
  }


  /* ═══════════════════════════════════════════════════════════════
   * CSV UTILITIES
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * parseCSVLine(line) → string[]
   * Splits a single CSV line on commas and trims each cell.
   * Does not handle quoted fields with embedded commas (simple CSV only).
   *
   * @param {string} line
   * @returns {string[]}
   */
  function parseCSVLine(line) {
    return line.split(',').map(function (cell) { return cell.trim(); });
  }

  /**
   * parseCSVText(text) → string[][]
   * Splits a full CSV text into rows, discarding empty lines.
   *
   * @param {string} text
   * @returns {string[][]}
   */
  function parseCSVText(text) {
    return text
      .trim()
      .split('\n')
      .filter(function (l) { return l.trim().length > 0; })
      .map(parseCSVLine);
  }


  /* ═══════════════════════════════════════════════════════════════
   * MISC
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * deepClone(obj) → object
   * Returns a deep copy of an object via JSON serialisation.
   * Only use for plain data objects (no functions/dates).
   *
   * @param {object} obj
   * @returns {object}
   */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * isValidHex(str) → boolean
   * Returns true if str is a valid 6-digit CSS hex colour.
   *
   * @param {string} str
   * @returns {boolean}
   */
  function isValidHex(str) {
    return /^#[0-9a-fA-F]{6}$/.test(str);
  }

  /**
   * clamp(value, min, max) → number
   * Clamps a numeric value between min and max.
   *
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }


  /* ─── Public API ──────────────────────────────────────────────── */
  return Object.freeze({
    // Time
    fmt,
    getElapsed,
    getStartingElapsed,
    getPhase,
    // Colour
    hexToRgba,
    deriveAccent2,
    getThemeAccents,
    // Skins
    skinFullURL,
    skinBustURL,
    skinHeadURL,
    skinFallbackURL,
    // Players
    getPlayerName,
    isPlayerDead,
    // Strings
    escapeHtml,
    ordinal,
    parseCountdownInput,
    // CSV
    parseCSVLine,
    parseCSVText,
    // Misc
    deepClone,
    isValidHex,
    clamp,
  });

})();
