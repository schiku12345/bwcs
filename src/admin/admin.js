/**
 * admin.js — Admin Panel Main Orchestrator
 *
 * This is the entry point for the admin panel. It:
 *   1. Provides the shared BWO_ADMIN_UI helper (notifications, OBS URL)
 *   2. Wires all module render functions into a single state subscriber
 *   3. Handles sidebar navigation (tab switching)
 *   4. Handles the sidebar open/close toggle with animated tab positioning
 *   5. Boots the admin on DOMContentLoaded
 *
 * SUBSCRIBER STRATEGY:
 *   The subscriber only renders the ACTIVE page to avoid rebuilding the
 *   entire DOM on every state update. Lightweight field syncs (timer
 *   display, match info) run unconditionally since they only touch
 *   textContent / .value on individual elements — no innerHTML rebuilds.
 *
 * LOAD ORDER (must be respected in admin.html):
 *   1. config/config.js
 *   2. src/shared/constants.js
 *   3. src/shared/utils.js
 *   4. src/shared/state.js
 *   5. src/admin/modules/dashboard.js
 *   6. src/admin/modules/teams.js
 *   7. src/admin/modules/gamesetup.js
 *   8. src/admin/modules/stats.js
 *   9. src/admin/modules/history.js
 *   10. src/admin/modules/infoCards.js
 *   11. src/admin/modules/streamScreens.js
 *   12. src/admin/modules/layoutEditor.js
 *   13. src/admin/modules/themeConfig.js
 *   14. src/admin/admin.js   ← this file
 *
 * DEPENDS ON: All modules above
 * EXPORTS: window.BWO_ADMIN_UI (used by all modules for notifications)
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
 * BWO_ADMIN_UI — Shared UI Utilities
 * Defined first so modules can reference it during their own init.
 * ═══════════════════════════════════════════════════════════════════ */

window.BWO_ADMIN_UI = (function () {

  /**
   * notify(message, duration) → void
   * Displays a temporary toast notification in the top-right corner.
   * Auto-dismisses after `duration` ms (default 2500).
   *
   * @param {string} message
   * @param {number} [duration=2500]
   */
  function notify(message, duration) {
    duration = duration || 2500;
    var area = document.getElementById('notify-area');
    if (!area) return;

    var el       = document.createElement('div');
    el.className = 'nitem';
    el.textContent = message;
    area.appendChild(el);

    setTimeout(function () {
      el.style.transition = 'opacity .2s';
      el.style.opacity    = '0';
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 220);
    }, duration);
  }

  /**
   * copyOBSUrl() → void
   * Copies the OBS browser-source URL to the clipboard and shows a toast.
   */
  function copyOBSUrl() {
    var el = document.getElementById('obs-url');
    if (!el) return;
    navigator.clipboard.writeText(el.value).then(function () {
      notify('Copied!');
    }).catch(function () {
      notify('Copy failed — select and copy manually');
    });
  }

  return Object.freeze({ notify, copyOBSUrl });

})();


/* ═══════════════════════════════════════════════════════════════════
 * MAIN ADMIN MODULE
 * ═══════════════════════════════════════════════════════════════════ */

(function () {

  /* ── Module aliases ──────────────────────────────────────────── */
  var ST   = window.BWO_STATE;
  var U    = window.BWO_UTILS;
  var C    = window.BWO_CONST;
  var UI   = window.BWO_ADMIN_UI;
  var DASH = window.BWO_DASHBOARD;
  var TEAMS    = window.BWO_TEAMS;
  var SETUP    = window.BWO_GAMESETUP;
  var STATS    = window.BWO_STATS;
  var HIST     = window.BWO_HISTORY;
  var CARDS    = window.BWO_INFO_CARDS;
  var STREAM   = window.BWO_STREAM_SCREENS;
  var LAYOUT   = window.BWO_LAYOUT;
  var THEME    = window.BWO_THEME_CONFIG;


  /* ═══════════════════════════════════════════════════════════════
   * READINESS GUARD
   * Tracks whether the admin has fully booted. Page switches and
   * state-change renders are blocked until _ready is true, preventing
   * partial DOM renders if the user clicks a nav item before boot
   * completes or if a BroadcastChannel message arrives very early.
   * ═══════════════════════════════════════════════════════════════ */

  /** Set to true once _boot() completes all initialisation. */
  var _ready = false;

  /**
   * _requiresData(page) → string[]
   * Returns advisory warnings for the given page if data deps are unmet.
   * Returns [] when everything looks fine.
   *
   * @param {string} page
   * @returns {string[]}
   */
  function _requiresData(page) {
    var state  = ST.get();
    var issues = [];
    switch (page) {
      case 'game':
        if (!state.namedTeams || state.namedTeams.length === 0)
          issues.push('No teams yet — add teams on the Teams page first');
        break;
      case 'scores':
        if (!state.slots || state.slots.filter(function (s) { return s.teamId; }).length === 0)
          issues.push('No teams in slots — set up the game on the Game Setup page first');
        break;
    }
    return issues;
  }


  /* ═══════════════════════════════════════════════════════════════
   * SIDEBAR NAVIGATION
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * _activePage() → string
   * Returns the page key of the currently-visible page (e.g. "dash").
   */
  function _activePage() {
    var active = document.querySelector('.pg.active');
    return active ? active.id.replace('pg-', '') : 'dash';
  }

  /**
   * _switchPage(page) → void
   * Deactivates the current page/nav item and activates the new one.
   * Runs a readiness check: hard-blocks before boot, advisory warnings
   * after boot if data dependencies are not met (but still switches).
   *
   * @param {string} page - Page key e.g. "teams", "scores"
   */
  function _switchPage(page) {
    /* Hard block: never switch during boot */
    if (!_ready) {
      console.warn('[Admin] _switchPage called before boot completed — ignoring');
      return;
    }

    /* Advisory check: warn if data dependencies are not met */
    _requiresData(page).forEach(function (msg) { UI.notify('⚠ ' + msg, 4000); });

    /* Deactivate all */
    document.querySelectorAll('.ni').forEach(function (n) { n.classList.remove('active'); });
    document.querySelectorAll('.pg').forEach(function (p) { p.classList.remove('active'); });

    /* Activate the new page */
    var navItem = document.querySelector('.ni[data-page="' + page + '"]');
    if (navItem) navItem.classList.add('active');

    var pageEl = document.getElementById('pg-' + page);
    if (pageEl) pageEl.classList.add('active');

    /* Render the page's content fresh */
    _renderPage(page, ST.get());

    console.debug('[Admin] Switched to page:', page);
  }

  /**
   * _renderPage(page, state) → void
   * Calls the correct module render function for the given page.
   *
   * @param {string} page
   * @param {object} state
   */
  function _renderPage(page, state) {
    switch (page) {
      case 'dash':
        DASH.updateDashboard(state);
        DASH.loadMatchInfo(state);
        break;
      case 'teams':
        TEAMS.renderTeams(state);
        break;
      case 'game':
        SETUP.renderSlots(state);
        SETUP.renderQueue(state);
        break;
      case 'scores':
        STATS.renderGameScoring(state);
        STATS.renderTotals(state);
        STATS.renderPlacementRules(state);
        STATS.loadPR(state);
        break;
      case 'standings':
        HIST.renderStandings(state);
        break;
      case 'tourn':
        CARDS.renderInfoCards(state);
        break;
      case 'stream':
        STREAM.loadStream(state);
        STREAM.renderVisibility(state);
        STREAM.loadBgMedia(state);
        break;
      case 'layout':
        LAYOUT.initEditor();
        LAYOUT.syncFromState();
        LAYOUT.loadDisplaySettings(state);
        break;
      case 'config':
        THEME.loadTheme(state);
        THEME.renderMapPool(state);
        THEME.loadIcons(state);
        STREAM.loadBgMedia(state);  // background fields are on config page too
        break;
    }
  }

  /**
   * _initNav() → void
   * Attaches click listeners to all sidebar nav items.
   */
  function _initNav() {
    document.querySelectorAll('.ni').forEach(function (ni) {
      ni.addEventListener('click', function () {
        _switchPage(ni.getAttribute('data-page'));
      });
    });
  }


  /* ═══════════════════════════════════════════════════════════════
   * SIDEBAR TOGGLE
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * _positionSidebarTab() → void
   * Positions the sidebar collapse tab to sit flush with the sidebar's
   * right edge. Called on resize and during the animation.
   */
  function _positionSidebarTab() {
    var sb  = document.getElementById('sidebar');
    var tab = document.getElementById('sb-tab');
    if (!sb || !tab) return;
    tab.style.left = sb.getBoundingClientRect().right + 'px';
  }

  /**
   * toggleSidebar() → void
   * Collapses or expands the sidebar and updates the toggle tab arrow.
   * Animates the tab position during the CSS transition.
   */
  function toggleSidebar() {
    var app = document.getElementById('app');
    var tab = document.getElementById('sb-tab');
    if (!app || !tab) return;

    var collapsed = app.classList.toggle('sb-off');
    tab.textContent = collapsed ? '›' : '‹';

    /* Track tab position during the CSS transition (240ms) */
    var startTime = Date.now();
    (function animate() {
      _positionSidebarTab();
      if (Date.now() - startTime < 260) requestAnimationFrame(animate);
    })();
  }


  /* ═══════════════════════════════════════════════════════════════
   * STATE SUBSCRIBER
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * _onStateChange(state) → void
   * Called by BWO_STATE whenever state changes (local update or
   * incoming BroadcastChannel message from the overlay).
   *
   * Strategy:
   *   • Always run lightweight, non-destructive syncs (button states,
   *     overlay mode buttons, timer text)
   *   • Only run heavy DOM rebuilds for the CURRENTLY VISIBLE page
   *
   * @param {object} state - The updated global state
   */
  function _onStateChange(state) {
    /* Block state-change renders until boot is complete */
    if (!_ready) return;

    /* ── Per-game colour switch ──
       When the game NUMBER changes (a new game starts), load that game's
       colour→team mapping from the setup queue so the scoreboard, standings,
       and scoring tab all recolour. If it applied, the nested state update
       already re-rendered everything with fresh state — stop here. */
    if (SETUP.maybeApplyQueueColors(state)) return;

    /* ── Always safe: button/mode indicator syncs ── */
    DASH.syncOvmButtons(state.overlayMode || 'starting');
    DASH.syncQuickActions(state.overlayMode || 'starting');
    DASH.setTimerButtonState(state.timerRunning);
    DASH.setStartingButtonState(state.startingTimerRunning);
    DASH.loadMatchInfo(state);
    LAYOUT.loadDisplaySettings(state);

    /* ── Active page only ── */
    _renderPage(_activePage(), state);
  }


  /* ═══════════════════════════════════════════════════════════════
   * BOOT
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * _boot() → void
   * Runs once on DOMContentLoaded. Initialises all modules, renders
   * the initial page, starts RAF loops, and subscribes to state changes.
   */
  function _boot() {
    console.info('[Admin] Booting Bedwars Overlay Admin v11');

    /* ── Boot progress helpers ── */
    function _setBootProgress(pct, msg) {
      var bar = document.getElementById('boot-bar');
      var txt = document.getElementById('boot-status');
      if (bar) bar.style.width = pct + '%';
      if (txt && msg) txt.textContent = msg;
    }
    function _dismissBootOverlay() {
      var el = document.getElementById('boot-overlay');
      if (!el) return;
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }

    _setBootProgress(5, 'Loading state…');
    var state = ST.get();

    /* ── OBS URL ── */
    var obsEl = document.getElementById('obs-url');
    if (obsEl) {
      obsEl.value = window.location.origin +
        window.location.pathname.replace(/admin\/.*$/, '') +
        'overlay/index.html';
    }

    _setBootProgress(15, 'Initialising modules…');
    THEME.buildPresetGrid();

    _setBootProgress(25, 'Rendering dashboard…');
    DASH.updateDashboard(state);
    DASH.loadMatchInfo(state);
    DASH.syncOvmButtons(state.overlayMode || 'starting');
    DASH.syncQuickActions(state.overlayMode || 'starting');
    DASH.setTimerButtonState(state.timerRunning);
    DASH.setStartingButtonState(state.startingTimerRunning || false);

    _setBootProgress(40, 'Rendering teams…');
    TEAMS.renderTeams(state);
    SETUP.renderSlots(state);

    _setBootProgress(55, 'Rendering scores…');
    STATS.renderGameScoring(state);
    STATS.renderTotals(state);
    STATS.renderPlacementRules(state);
    STATS.loadPR(state);

    _setBootProgress(65, 'Rendering standings…');
    HIST.renderStandings(state);

    _setBootProgress(72, 'Rendering info cards…');
    CARDS.renderInfoCards(state);

    _setBootProgress(80, 'Rendering stream screens…');
    STREAM.loadStream(state);
    STREAM.renderVisibility(state);
    STREAM.loadBgMedia(state);

    _setBootProgress(88, 'Rendering theme & config…');
    LAYOUT.loadDisplaySettings(state);
    THEME.loadTheme(state);
    THEME.renderMapPool(state);
    THEME.loadIcons(state);

    _setBootProgress(94, 'Starting timers…');
    DASH.startTimerTick();
    DASH.startStartingTimerTick();

    _setBootProgress(97, 'Wiring navigation…');
    _initNav();

    window.addEventListener('resize', _positionSidebarTab);
    setTimeout(_positionSidebarTab, 50);

    /* ── Establish the game-number baseline so the first real game change
       (not this boot) is what triggers a queue colour switch ── */
    SETUP.maybeApplyQueueColors(state);

    /* ── Subscribe to state changes ── */
    ST.subscribe(_onStateChange);

    /* ── Mark boot complete — page switches and renders now allowed ── */
    _ready = true;

    _setBootProgress(100, 'Ready');
    setTimeout(_dismissBootOverlay, 120);

    console.info('[Admin] Boot complete');
  }

  /* Run on DOM ready */
  /* Run on DOMContentLoaded — auth gate first, then boot */
  document.addEventListener('DOMContentLoaded', function () {
    if (window.BWO_AUTH) {
      window.BWO_AUTH.init(function () { _boot(); });
    } else {
      _boot();
    }
  });


  /* ═══════════════════════════════════════════════════════════════
   * GLOBAL FUNCTION BINDINGS
   * HTML onclick="" attributes reference these. They must be on window.
   * ═══════════════════════════════════════════════════════════════ */

  /* Sidebar */
  window.toggleSidebar        = toggleSidebar;

  /* Dashboard */
  window.setOvMode            = DASH.setOverlayMode;
  window.toggleTimer          = DASH.toggleTimer;
  window.resetTimer           = DASH.resetTimer;
  window.toggleStartingTimer  = DASH.toggleStartingTimer;
  window.resetStartingTimer   = DASH.resetStartingTimer;
  window.saveMatchInfo        = DASH.saveMatchInfo;
  window.openMapModal         = DASH.openMapModal;
  window.closeMapModal        = DASH.closeMapModal;
  window.confirmMapPick       = DASH.confirmMapPick;
  window.skipMapReveal        = DASH.skipMapReveal;
  window.saveSelectedMap      = DASH.saveSelectedMap;
  window.saveMapTransition    = DASH.saveMapTransition;
  window.triggerMapReveal     = DASH.triggerMapReveal;
  window.saveCycleDash        = DASH.saveCycleDash;
  window.openFinishModal      = DASH.openFinishModal;
  window.closeFinishModal     = DASH.closeFinishModal;
  window.confirmFinishGame    = DASH.confirmFinishGame;
  window.copyOBS              = UI.copyOBSUrl;

  /* Teams */
  window.addTeam              = TEAMS.addTeam;
  window.clearAllTeams        = TEAMS.clearAllTeams;
  window.handleTeamCSVFile    = TEAMS.handleTeamCSVFile;
  window.setTeamSize          = function (v) { TEAMS.setTeamSize(v); };

  /* Game Setup */
  window.addSlot              = SETUP.addSlot;
  window.clearSlots           = SETUP.clearSlots;
  window.handleGameCSVFile    = SETUP.handleGameCSVFile;
  window.addQueueGame         = SETUP.addQueueGame;
  window.clearQueue           = SETUP.clearQueue;

  /* Stats */
  window.handleStatCSVFile    = STATS.handleStatCSVFile;
  window.applyStatCSV         = STATS.applyStatCSV;
  window.clearStats           = STATS.clearStats;
  window.savePR               = STATS.savePR;
  window.savePlacementRule    = STATS.savePlacementRule;

  /* History */
  window.openHistEdit         = HIST.openGameEditor;
  window.cancelHistEdit       = HIST.cancelGameEditor;
  window.saveHistEdit         = HIST.saveGameEdit;
  window.deleteHistGame       = HIST.deleteGame;
  window.resetTournament      = HIST.resetTournament;
  /* Also expose on the module for onclick in the contribution table header */
  window.BWO_HISTORY          = HIST;

  /* Info Cards */
  window.addTCard             = CARDS.addCard;
  window.saveTCInterval       = CARDS.saveInterval;
  /* Also expose for onclick in renderInfoCards */
  window.BWO_INFO_CARDS       = CARDS;

  /* Stream Screens */
  window.saveStream           = STREAM.saveStream;
  window.saveCountdown        = STREAM.saveCountdown;
  window.saveBgMedia          = STREAM.saveBgMedia;

  /* Layout Editor */
  window.resetEl              = LAYOUT.resetElement;
  window.saveDisp             = LAYOUT.saveDisplaySettings;

  /* Theme & Config */
  window.selectPreset         = THEME.selectPreset;
  window.onCustomColour       = THEME.onCustomColour;
  window.onHexInput           = THEME.onHexInput;
  window.saveIcons            = THEME.saveIcons;
  window.addMap               = THEME.addMap;
  window.loadConfigFile       = THEME.loadConfigFile;
  /* Also expose on the module for onclick in renderMapPool */
  window.BWO_THEME_CONFIG     = THEME;
  window.BWO_STATS            = STATS;

  /* Make ST accessible in inline onchange="ST.update(...)" on vis toggles */
  window.ST = ST;

})();
