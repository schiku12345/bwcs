/**
 * constants.js — All hardcoded values for the Bedwars Overlay system.
 *
 * Purpose: Single source of truth for every magic number, string, or colour
 * used across admin, overlay, and shared modules.  If you need to change a
 * value (e.g. rename a BroadcastChannel, add a new team colour), do it HERE
 * and nowhere else.
 *
 * EXPORTS (on window.BWO_CONST):
 *   CHANNEL_NAME    — BroadcastChannel identifier
 *   STORAGE_KEY     — localStorage key for persisted state
 *   COLORS          — colour name → hex map
 *   COLOR_KEYS      — ordered list of colour names
 *   PHASES          — ordered game phase definitions
 *   SKIN_API        — Minecraft skin API base URLs
 *   CYCLE_DEFAULTS  — default team-cycling intervals
 */

'use strict';

window.BWO_CONST = (function () {

  /* ─────────────────────────────────────────────────────────────
   * SYNC IDENTIFIERS
   * Used by state.js to keep admin ↔ overlay in sync.
   * Change both together if you fork multiple instances.
   * ───────────────────────────────────────────────────────────── */
  var CHANNEL_NAME = 'bwo11';
  var STORAGE_KEY  = 'bwo11-state';

  /* ─────────────────────────────────────────────────────────────
   * TEAM COLOURS
   * Maps display name → CSS hex colour.
   * The overlay uses these to colour team cards, score panels, etc.
   * ───────────────────────────────────────────────────────────── */
  var COLORS = {
    Red:    '#ff3a3a',
    Blue:   '#3a8aff',
    Green:  '#3aff7a',
    Yellow: '#ffe033',
    Aqua:   '#00e5ff',
    White:  '#f0f0f0',
    Pink:   '#ff5ec7',
    Gray:   '#999999',
  };

  /** Ordered list so UI can iterate colours in a consistent order. */
  var COLOR_KEYS = ['Red', 'Blue', 'Green', 'Yellow', 'Aqua', 'White', 'Pink', 'Gray'];

  /* ─────────────────────────────────────────────────────────────
   * GAME PHASES
   * Each phase has:
   *   name     — display name shown on overlay
   *   icon     — key into phaseIcons (maps to a URL or emoji fallback)
   *   duration — phase length in SECONDS
   * Phases are sequential; the timer counts through them in order.
   * ───────────────────────────────────────────────────────────── */
  var PHASES = [
    { name: 'Diamond II',      icon: 'diamond', duration: 360 },
    { name: 'Emerald II',      icon: 'emerald', duration: 360 },
    { name: 'Diamond III',     icon: 'diamond', duration: 360 },
    { name: 'Emerald III',     icon: 'emerald', duration: 360 },
    { name: 'Bed Destruction', icon: 'bed',     duration: 360 },
    { name: 'Sudden Death',    icon: 'skull',   duration: 600 },
    { name: 'Game Over',       icon: 'skull',   duration: 600 },
  ];

  /** Emoji fallbacks shown when no custom icon URL is configured. */
  var PHASE_ICON_FALLBACKS = {
    diamond: '◆',
    emerald: '◈',
    bed:     '🛏',
    skull:   '☠',
    bedgone: '💔',
  };

  /* ─────────────────────────────────────────────────────────────
   * SKIN API URLS
   * Used by overlay/admin to fetch Minecraft player skins.
   * Visage: full-body renders.  mc-heads: face avatars.
   * ───────────────────────────────────────────────────────────── */
  var SKIN_API = {
    fullBody:     'https://visage.surgeplay.com/full/256/',
    bust:         'https://visage.surgeplay.com/bust/256/',
    head:         'https://mc-heads.net/avatar/',
    headFallback: 'https://crafatar.com/renders/bust/',
  };

  /* ─────────────────────────────────────────────────────────────
   * OVERLAY MODES
   * Every string the overlay understands for its display mode.
   * ───────────────────────────────────────────────────────────── */
  var OVERLAY_MODES = ['starting', 'game', 'summary', 'map', 'brb'];

  /* ─────────────────────────────────────────────────────────────
   * MAP REVEAL TRANSITIONS
   * ───────────────────────────────────────────────────────────── */
  var MAP_TRANSITIONS = ['slot', 'roulette', 'fade', 'flip', 'glitch'];

  /* ─────────────────────────────────────────────────────────────
   * DEFAULTS
   * Used when state has not been configured yet.
   * ───────────────────────────────────────────────────────────── */
  var DEFAULTS = {
    cycleInterval:     8,      // seconds between team card swaps
    tournCardInterval: 10,     // seconds between info card swaps
    teamSize:          4,      // players per team (2 or 4)
    startingSubtext:   'Starting Game',
    brbSubtext:        'Be Right Back',
    transition:        'slide',
    mapTransition:     'slot',
    winnerDisplaySecs: 6,      // seconds on winner screen before standings
    startingCycleSecs: 4,      // seconds per team on the starting screen
  };

  /* ─────────────────────────────────────────────────────────────
   * ORDINALS
   * Used for placement display (1st, 2nd, …, 8th).
   * ───────────────────────────────────────────────────────────── */
  var ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

  /* Public API */
  return Object.freeze({
    CHANNEL_NAME,
    STORAGE_KEY,
    COLORS,
    COLOR_KEYS,
    PHASES,
    PHASE_ICON_FALLBACKS,
    SKIN_API,
    OVERLAY_MODES,
    MAP_TRANSITIONS,
    DEFAULTS,
    ORDINALS,
  });

})();
