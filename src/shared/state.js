/**
 * state.js — Global state manager for the Bedwars Overlay system.
 *
 * This is the single source of truth for all application data.
 * Both the admin panel and the OBS overlay subscribe to this module.
 *
 * HOW IT WORKS:
 *   1. State is persisted in localStorage under STORAGE_KEY.
 *   2. BroadcastChannel propagates changes to other tabs/windows
 *      on the same origin (e.g. admin → overlay in OBS).
 *   3. A storage event listener provides a cross-tab fallback for
 *      browsers that don't support BroadcastChannel.
 *   4. Subscribers are plain functions registered via .subscribe().
 *      They are called synchronously after every state change.
 *
 * USAGE:
 *   // Read
 *   var st = BWO_STATE.get();
 *
 *   // Write (triggers sync + subscribers)
 *   BWO_STATE.update({ gameNumber: 2 });
 *
 *   // Write silently (persists but does NOT broadcast or notify)
 *   BWO_STATE.silentUpdate({ namedTeams: [...] });
 *
 *   // Subscribe to changes
 *   BWO_STATE.subscribe(function(state) { ... });
 *
 * EXPORTS: window.BWO_STATE
 *
 * DEPENDS ON: constants.js, utils.js (must be loaded first)
 */

'use strict';

window.BWO_STATE = (function () {

  /* ── Grab dependencies ─────────────────────────────────────── */
  var C = window.BWO_CONST;
  var U = window.BWO_UTILS;


  /* ═══════════════════════════════════════════════════════════════
   * DEFAULT STATE
   * mkDefaultState() returns a fresh, fully-typed state object.
   * Every key that the system ever reads must appear here so that
   * old persisted states are always safely upgraded on load.
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * mkDefaultState() → object
   * Returns a complete default state.  Called on first run or reset.
   */
  function mkDefaultState() {
    return {
      /* ── Tournament ────────────────────────────────────────── */
      namedTeams:      [],   // Array of mkTeam() objects
      nextTeamId:      1,    // Auto-increment ID counter
      gameNumber:      1,
      gameStage:       '',   // e.g. "Group Stage", "Finals"
      mapName:         '',   // Current game map name
      slots:           [],   // Array of mkSlot() objects for this game
      lastWinnerTeamId: null,
      gameHistory:     [],   // [{gameNumber, mapName, results:[...]}]

      /* ── Scoring ───────────────────────────────────────────── */
      /* Stat points: Finals = final kills, Beds = bed breaks. (No kills/deaths.) */
      pointRules: {
        finals:    4,   // points per final kill
        bedbreaks: 7,   // points per bed broken
      },
      /** Bonus points per placement position (index 0 = 1st place / "Win") */
      placementRules: [50, 30, 20, 10, 5, 3, 2, 1],
      /** Per-player stats for the CURRENT game: { "IGN": {finals, bedbreaks, points} } */
      playerStats: {},

      /* ── Timer ─────────────────────────────────────────────── */
      timerRunning:   false,
      timerStartTime: null,   // Date.now() snapshot when timer was started
      timerOffset:    0,      // Accumulated seconds before last pause
      timerStarted:   false,  // true once timer has ever been started this game

      /* ── Starting Screen Timer ─────────────────────────────── */
      startingTimerRunning: false,
      startingTimerStart:   null,
      startingTimerOffset:  0,
      startingCountdownFrom: 0, // 0 = count up; >0 = count down from N seconds

      /* ── Overlay Layout (all values are overlay-space px at 1920×1080) */
      mainPanelLeft:   60,
      mainPanelBottom: 80,
      mainPanelW:      900,
      mainPanelScale:  1.0,
      sbLeft:          null, // null = default (right-aligned)
      sbTop:           null,
      sbW:             260,
      sbH:             420,
      sbScale:         1.0,
      tpLeft:          null,
      tpTop:           null,
      tpW:             340,
      tpH:             180,
      tpScale:         1.0,
      chatLeft:        20,
      chatTop:         200,
      chatW:           320,
      chatH:           400,
      chatScale:       1.0,

      /* ── Visibility flags ──────────────────────────────────── */
      showTimer:      true,
      showTeams:      true,
      showScoreboard: true,
      showTournInfo:  true,
      showChat:       false,

      /* ── Overlay state ─────────────────────────────────────── */
      overlayMode:    'starting', // one of OVERLAY_MODES
      cycleInterval:  8,          // seconds between team card swaps
      autoCycle:      true,
      transition:     'slide',    // team card transition animation

      /* ── Tournament info cards ─────────────────────────────── */
      tournCards: [
        // Add info cards in the admin panel or via config
      ],
      tournCardInterval: 10,

      /* ── Maps ──────────────────────────────────────────────── */
      mapPool:       [],     // [{ name, imageUrl }]
      selectedMap:   '',
      mapTransition: 'slot',

      /* ── Teams ─────────────────────────────────────────────── */
      teamSize: 4,           // 2 or 4 — players per team

      /* ── Phase icons (custom image URLs) ───────────────────── */
      phaseIcons: {
        diamond: '',
        emerald: '',
        bed:     '',
        skull:   '',
        bedgone: '',
      },

      /* ── Theme ─────────────────────────────────────────────── */
      theme:         'blue',
      customAccent:  '#4488ff',
      customAccent2: '#00e5ff',

      /* ── Starting Screen ───────────────────────────────────── */
      startingLogoUrl:    '',
      startingAnimation:  'pulse',
      startingEventName:  '',
      startingSubtext:    '',
      startingTextAnim:   'shimmer',

      /* ── BRB Screen ────────────────────────────────────────── */
      brbLogoUrl:    '',
      brbAnimation:  'float',
      brbEventName:  '',
      brbSubtext:    '',
      brbTextAnim:   'fade',

      /* ── Live Chat ─────────────────────────────────────────── */
      chatStreamUrl: '',

      /* ── Background media (video loops over image fallback) ── */
      sharedBgVideoUrl:   '',
      sharedBgImageUrl:   '',
      startingBgVideoUrl: '',
      startingBgImageUrl: '',
      brbBgVideoUrl:      '',
      brbBgImageUrl:      '',
      sumBgVideoUrl:      '',
      sumBgImageUrl:      '',
      mapBgVideoUrl:      '',
      mapBgImageUrl:      '',
    };
  }


  /* ═══════════════════════════════════════════════════════════════
   * FACTORY HELPERS
   * Used to create correctly-shaped sub-objects.
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * mkTeam(id, name) → team object
   * Creates a new named team with default values.
   *
   * @param {string} id   - Unique string ID (e.g. "nt1")
   * @param {string} name - Display name
   * @returns {object}
   */
  function mkTeam(id, name) {
    return {
      id,
      name,
      players: [
        { name: '', dead: false },
        { name: '', dead: false },
        { name: '', dead: false },
        { name: '', dead: false },
      ],
      totalPoints:  0,
      gamesPlayed:  0,
      prevRank:     null,  // rank before the most recent game
      eliminated:   false,
      hasBed:       true,
    };
  }

  /**
   * mkSlot(color) → slot object
   * Creates a colour slot for a game (assigns a team to a colour).
   *
   * @param {string} color - One of COLOR_KEYS
   * @returns {object}
   */
  function mkSlot(color) {
    return {
      color,
      teamId:     null,   // ID of the assigned named team
      score:      0,      // Stat points earned this game
      placement:  0,      // Preselected finishing place (0 = unset, 1 = 1st/Win)
      eliminated: false,
      hasBed:     true,
    };
  }


  /* ═══════════════════════════════════════════════════════════════
   * QUERY HELPERS
   * Pure reads from a state object (no mutation).
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * getTeamById(state, id) → team | null
   * Looks up a named team by its ID string.
   *
   * @param {object} state
   * @param {string} id
   * @returns {object|null}
   */
  function getTeamById(state, id) {
    return (state.namedTeams || []).find(function (t) { return t.id === id; }) || null;
  }

  /**
   * getSlotTeam(state, slot) → team | null
   * Returns the named team assigned to a colour slot, or null.
   *
   * @param {object} state
   * @param {object} slot
   * @returns {object|null}
   */
  function getSlotTeam(state, slot) {
    if (!slot || !slot.teamId) return null;
    return getTeamById(state, slot.teamId);
  }

  /**
   * getActiveSlots(state) → slot[]
   * Returns only the slots that have a team assigned.
   *
   * @param {object} state
   * @returns {object[]}
   */
  function getActiveSlots(state) {
    return (state.slots || []).filter(function (s) { return !!s.teamId; });
  }

  /**
   * getStandings(state) → team[]
   * Returns all named teams sorted by totalPoints descending.
   * Alphabetical by name as a tiebreaker.
   *
   * @param {object} state
   * @returns {object[]}
   */
  function getStandings(state) {
    return (state.namedTeams || []).slice().sort(function (a, b) {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  /**
   * computeTeamScore(team, playerStats, rules) → number
   * Calculates the total stat-based score for a team this game
   * by summing each player's finals (final kills) + bedbreaks (beds).
   *
   * @param {object} team        - Named team object
   * @param {object} playerStats - { "IGN": { finals, bedbreaks } }
   * @param {object} rules       - { finals, bedbreaks } point values
   * @returns {number}
   */
  function computeTeamScore(team, playerStats, rules) {
    var total = 0;
    rules = rules || {};
    (team.players || []).forEach(function (p) {
      var name = U.getPlayerName(p).trim();
      if (!name) return;
      var s = (playerStats || {})[name];
      if (!s) return;
      total += (s.finals    || 0) * (rules.finals    || 0);
      total += (s.bedbreaks || 0) * (rules.bedbreaks || 0);
    });
    return Math.max(0, Math.round(total));
  }


  /* ═══════════════════════════════════════════════════════════════
   * STATE MANAGER (StateManager class)
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * StateManager constructor.
   * Initialises state from localStorage and sets up cross-tab sync.
   */
  function StateManager() {
    this._state       = this._loadFromStorage();
    this._subscribers = [];

    var self = this;

    /* Firebase remote sync — initialise after DOM is ready */
    var cfg = (window.BWO_CONFIG && window.BWO_CONFIG.firebase) || null;
    if (cfg && window.BWO_FIREBASE) {
      window.BWO_FIREBASE.init(cfg, function (remoteState) {
        /* Remote update arrived — merge it into local state */
        self._state = remoteState;
        self._persistToStorage();
        self._notifySubscribers();
      });
    }

    /* BroadcastChannel for same-origin cross-tab sync (admin ↔ overlay) */
    try {
      this._channel = new BroadcastChannel(C.CHANNEL_NAME);
      this._channel.onmessage = function (event) {
        if (event.data && event.data.type === 'STATE_UPDATE') {
          console.debug('[BWO_STATE] BroadcastChannel update received');
          self._state = event.data.payload;
          self._notifySubscribers();
        }
      };
    } catch (e) {
      console.warn('[BWO_STATE] BroadcastChannel not available — using storage fallback only');
      this._channel = null;
    }

    /* localStorage storage event — fires when ANOTHER tab writes */
    window.addEventListener('storage', function (event) {
      if (event.key === C.STORAGE_KEY && event.newValue) {
        try {
          self._state = JSON.parse(event.newValue);
          self._notifySubscribers();
        } catch (err) {
          console.error('[BWO_STATE] Failed to parse storage event payload', err);
        }
      }
    });
  }

  /**
   * _loadFromStorage() → object
   * Reads persisted state from localStorage and merges it over the
   * default state, so new keys are always present even on old saves.
   *
   * @returns {object}
   */
  StateManager.prototype._loadFromStorage = function () {
    try {
      var raw = localStorage.getItem(C.STORAGE_KEY);
      if (raw) {
        var saved   = JSON.parse(raw);
        var def     = mkDefaultState();
        var merged  = {};
        // Start from defaults so any new keys are present
        for (var k in def) merged[k] = def[k];
        // Overlay with saved values
        for (var k in saved) merged[k] = saved[k];
        console.debug('[BWO_STATE] Loaded state from localStorage');
        return merged;
      }
    } catch (e) {
      console.error('[BWO_STATE] Failed to load from localStorage — using defaults', e);
    }
    console.info('[BWO_STATE] Initialising with default state');
    return mkDefaultState();
  };

  /**
   * _persistToStorage()
   * Writes the current state to localStorage.
   */
  StateManager.prototype._persistToStorage = function () {
    try {
      localStorage.setItem(C.STORAGE_KEY, JSON.stringify(this._state));
    } catch (e) {
      console.error('[BWO_STATE] Failed to persist to localStorage', e);
    }
  };

  /**
   * _broadcast()
   * Sends the current state to all other tabs via BroadcastChannel.
   */
  StateManager.prototype._broadcast = function () {
    if (!this._channel) return;
    try {
      this._channel.postMessage({ type: 'STATE_UPDATE', payload: this._state });
    } catch (e) {
      console.warn('[BWO_STATE] BroadcastChannel postMessage failed', e);
    }
  };

  /**
   * _notifySubscribers()
   * Calls every registered subscriber function with the current state.
   * Errors in one subscriber are caught so others still run.
   */
  StateManager.prototype._notifySubscribers = function () {
    var state = this._state;
    this._subscribers.forEach(function (fn) {
      try {
        fn(state);
      } catch (e) {
        console.error('[BWO_STATE] Subscriber threw an error', e);
      }
    });
  };

  /**
   * get() → object
   * Returns the current state object (read-only by convention).
   * Do NOT mutate the returned object directly — use update().
   *
   * @returns {object}
   */
  StateManager.prototype.get = function () {
    return this._state;
  };

  /**
   * update(patch) → void
   * Merges patch keys into state, persists, broadcasts, and notifies.
   * This is the main way all modules write state.
   *
   * @param {object} patch - Partial state object (keys to update)
   */
  StateManager.prototype.update = function (patch) {
    for (var k in patch) {
      this._state[k] = patch[k];
    }
    this._persistToStorage();
    this._broadcast();
    /* Push to Firebase so overlay on remote machine gets the update */
    if (window.BWO_FIREBASE && window.BWO_FIREBASE.isEnabled()) {
      window.BWO_FIREBASE.push(this._state);
    }
    this._notifySubscribers();
  };

  /**
   * silentUpdate(patch) → void
   * Merges patch into state and persists WITHOUT broadcasting or
   * notifying subscribers.  Use this for in-progress edits (e.g.
   * typing in a text field) where you don't want every keystroke to
   * re-render the entire overlay.
   *
   * @param {object} patch
   */
  StateManager.prototype.silentUpdate = function (patch) {
    for (var k in patch) {
      this._state[k] = patch[k];
    }
    this._persistToStorage();
  };

  /**
   * subscribe(fn) → void
   * Registers a listener that is called with the full state object
   * whenever state changes (via update() or an incoming broadcast).
   *
   * @param {function} fn - Called with (state: object)
   */
  StateManager.prototype.subscribe = function (fn) {
    this._subscribers.push(fn);
  };

  /**
   * reset() → void
   * Resets state to defaults, persists, and broadcasts.
   * Used by the "Reset Tournament" button in the admin.
   */
  StateManager.prototype.reset = function () {
    this._state = mkDefaultState();
    this._persistToStorage();
    this._broadcast();
    this._notifySubscribers();
    console.info('[BWO_STATE] State reset to defaults');
  };


  /* ─── Create singleton and expose public API ────────────────── */
  var instance = new StateManager();

  return Object.freeze({
    /* State access */
    get:           instance.get.bind(instance),
    update:        instance.update.bind(instance),
    silentUpdate:  instance.silentUpdate.bind(instance),
    subscribe:     instance.subscribe.bind(instance),
    reset:         instance.reset.bind(instance),

    /* Factories */
    mkTeam,
    mkSlot,
    mkDefaultState,

    /* Queries */
    getTeamById,
    getSlotTeam,
    getActiveSlots,
    getStandings,
    computeTeamScore,
  });

})();

/*
 * Legacy compatibility shim.
 * The old code used window.BWO.state — keep it pointing at the same singleton.
 */
window.BWO = window.BWO || {};
window.BWO.state = {
  get:          window.BWO_STATE.get,
  update:       window.BWO_STATE.update,
  silentUpdate: window.BWO_STATE.silentUpdate,
  sub:          window.BWO_STATE.subscribe,
};
window.BWO.COLORS        = window.BWO_CONST.COLORS;
window.BWO.COLOR_KEYS    = window.BWO_CONST.COLOR_KEYS;
window.BWO.PHASES        = window.BWO_CONST.PHASES;
window.BWO.mkTeam        = window.BWO_STATE.mkTeam;
window.BWO.mkSlot        = window.BWO_STATE.mkSlot;
window.BWO.getTeamById   = window.BWO_STATE.getTeamById;
window.BWO.getSlotTeam   = window.BWO_STATE.getSlotTeam;
window.BWO.getActiveSlots = window.BWO_STATE.getActiveSlots;
window.BWO.getStandings  = window.BWO_STATE.getStandings;
window.BWO.computeTeamScore = window.BWO_STATE.computeTeamScore;
window.BWO.fmt           = window.BWO_UTILS.fmt;
window.BWO.getElapsed    = window.BWO_UTILS.getElapsed;
window.BWO.getPhase      = window.BWO_UTILS.getPhase;
window.BWO.getStartingElapsed = window.BWO_UTILS.getStartingElapsed;
window.BWO.getPlayerName = window.BWO_UTILS.getPlayerName;
window.BWO.isPlayerDead  = window.BWO_UTILS.isPlayerDead;
window.BWO.deriveAccent2 = window.BWO_UTILS.deriveAccent2;
window.overlayState      = window.BWO.state;
