/**
 * overlay.js — OBS Browser Source Overlay Logic
 *
 * This is the complete JavaScript for the streaming overlay.
 * It receives state changes from the admin panel via BroadcastChannel
 * and localStorage, and updates the DOM to match.
 *
 * ARCHITECTURE:
 *   • Reads state via BWO_STATE.get() / BWO_STATE.subscribe()
 *   • Never writes to state (overlay is read-only)
 *   • All DOM work is done here — no inline scripts in overlay.html
 *
 * SECTIONS:
 *   1.  Aliases & Globals
 *   2.  Theme Application
 *   3.  Layout Application
 *   4.  Background Media
 *   5.  Scoreboard
 *   6.  Game Timer
 *   7.  Starting Screen Timer
 *   8.  Team Cards (game mode cycling)
 *   9.  Info / Tournament Panel
 *  10.  Starting Screen Team Cycling
 *  11.  Winner + Standings (summary screen)
 *  12.  Map Reveal
 *  13.  Logo Screens (starting + BRB)
 *  14.  Screen Mode Switcher
 *  15.  Main Render Loop
 *  16.  Boot
 *
 * DEPENDS ON: constants.js, utils.js, state.js (all loaded before this file)
 */

'use strict';

(function () {

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 1. ALIASES & GLOBALS
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  var ST     = window.BWO_STATE;
  var U      = window.BWO_UTILS;
  var C      = window.BWO_CONST;
  var COLORS = C.COLORS;

  /** Shorthand for document.getElementById */
  function gid(id) { return document.getElementById(id); }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 2. THEME APPLICATION
   * Updates CSS custom properties when the theme changes.
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  /**
   * applyTheme(state) → void
   * Sets --acc, --acc2, --glow, --b1, --b2 on :root based on the
   * current theme setting.
   *
   * @param {object} state
   */
  function applyTheme(state) {
    var accents = U.getThemeAccents(state);
    var acc     = accents[0];
    var acc2    = accents[1];
    var root    = document.documentElement.style;

    root.setProperty('--acc',  acc);
    root.setProperty('--acc2', acc2);
    root.setProperty('--glow', U.hexToRgba(acc,  .22));
    root.setProperty('--b1',   U.hexToRgba(acc,  .12));
    root.setProperty('--b2',   U.hexToRgba(acc2, .06));
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 3. LAYOUT APPLICATION
   * Positions and sizes overlay panels from state values.
   * State values are in overlay-space pixels (1920×1080).
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  /**
   * applyLayout(state) → void
   * Applies position, size, and scale for the main panel, scoreboard,
   * and info panel. Called on every state change.
   *
   * @param {object} state
   */
  function applyLayout(state) {
    /* Main panel (bottom-left) */
    var mp = gid('main-panel');
    if (mp) {
      mp.style.left            = (state.mainPanelLeft   || 60)  + 'px';
      mp.style.bottom          = (state.mainPanelBottom || 80)  + 'px';
      mp.style.top             = 'auto';
      mp.style.transform       = 'scale(' + (state.mainPanelScale || 1) + ')';
      mp.style.width           = (state.mainPanelW || 900) + 'px';
    }

    /* Scoreboard (top-right by default) */
    var sb = gid('scoreboard');
    if (sb) {
      if (state.sbLeft != null) {
        sb.style.left  = state.sbLeft + 'px';
        sb.style.right = 'auto';
      } else {
        sb.style.left  = '';
        sb.style.right = '1.5%';
      }
      sb.style.top             = state.sbTop != null ? state.sbTop + 'px' : '1.5%';
      sb.style.transform       = 'scale(' + (state.sbScale || 1) + ')';
      sb.style.transformOrigin = 'top right';
      if (state.sbW) sb.style.width = state.sbW + 'px';
    }

    /* Info / tournament panel (top-left by default) */
    var tp = gid('tourn-panel');
    if (tp) {
      tp.style.left = state.tpLeft != null ? state.tpLeft + 'px' : '1.5%';
      tp.style.top  = state.tpTop  != null ? state.tpTop  + 'px' : '1.5%';
      if (state.tpW) tp.style.width = state.tpW + 'px';
    }
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 4. BACKGROUND MEDIA
   * Sets video src + image CSS for each screen's background layer.
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  /**
   * _setVideoBg(screenId, videoUrl, imageUrl) → void
   * Updates the <video> src and background-image for one screen.
   * Uses a dataset.src guard to avoid reloading an already-playing video.
   *
   * @param {string} screenId  - e.g. "starting" (matches element ids "starting-video", "starting-bg-img")
   * @param {string} videoUrl  - MP4/WebM URL or empty string
   * @param {string} imageUrl  - Image URL or empty string
   */
  function _setVideoBg(screenId, videoUrl, imageUrl) {
    var vid = gid(screenId + '-video');
    var img = gid(screenId + '-bg-img');

    if (vid) {
      if (videoUrl && vid.dataset.src !== videoUrl) {
        vid.dataset.src = videoUrl;
        vid.src         = videoUrl;
        vid.load();
      } else if (!videoUrl) {
        vid.src         = '';
        vid.dataset.src = '';
      }
    }

    if (img) {
      img.style.backgroundImage = imageUrl ? 'url(' + imageUrl + ')' : 'none';
    }
  }

  /**
   * _updateAllBackgrounds(state) → void
   * Applies background media to all four screens.
   * Per-screen URLs override the shared background when set.
   *
   * @param {object} state
   */
  function _updateAllBackgrounds(state) {
    var sharedVid = state.sharedBgVideoUrl || '';
    var sharedImg = state.sharedBgImageUrl || '';

    _setVideoBg('starting', state.startingBgVideoUrl || sharedVid, state.startingBgImageUrl || sharedImg);
    _setVideoBg('brb',      state.brbBgVideoUrl      || sharedVid, state.brbBgImageUrl      || sharedImg);
    _setVideoBg('sum',      state.sumBgVideoUrl       || sharedVid, state.sumBgImageUrl      || sharedImg);
    _setVideoBg('map',      state.mapBgVideoUrl       || sharedVid, state.mapBgImageUrl      || sharedImg);
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 5. SCOREBOARD
   * Top-right panel showing tournament standings.
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  /**
   * _renderScoreboard(state) → void
   * Rebuilds the scoreboard row list from tournament standings.
   * Shows up to 10 teams. Toggles .hidden based on showScoreboard flag.
   *
   * @param {object} state
   */
  function _renderScoreboard(state) {
    var rows = gid('sb-rows');
    if (!rows) return;

    var standings = ST.getStandings(state);
    rows.innerHTML = '';

    standings.slice(0, 10).forEach(function (team, i) {
      var slot = (state.slots || []).find(function (s) { return s.teamId === team.id; });
      var hex  = slot ? (COLORS[slot.color] || '#fff') : '#888';

      var row       = document.createElement('div');
      row.className = 'sb-row' + (i === 0 ? ' first' : '');
      row.innerHTML =
        '<div class="sb-dot" style="background:' + hex + ';box-shadow:0 0 4px ' + hex + '88"></div>' +
        '<div class="sb-name" style="color:' + hex + '">' + U.escapeHtml(team.name) + '</div>' +
        '<div class="sb-score" style="color:' + hex + '">' + team.totalPoints + '</div>';
      rows.appendChild(row);
    });

    var sbEl = gid('scoreboard');
    if (sbEl) sbEl.classList.toggle('hidden', !state.showScoreboard);
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 6. GAME TIMER
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  /** Handle for the game-timer RAF loop. */
  var _timerRAF = null;

  /**
   * _updateTimerDOM(state) → void
   * Updates the timer clock, phase name, phase icon, and progress bar
   * from the current state (static — called when timer is paused).
   *
   * @param {object} state
   */
  function _updateTimerDOM(state) {
    var ck = gid('timer-clock');
    if (!ck) return;

    if (!state.timerStarted) {
      ck.textContent                         = 'PREGAME';
      gid('phase-name').textContent          = 'Pregame';
      gid('phase-icon').innerHTML            = '⏸';
      gid('pbar-fill').style.width           = '100%';
      return;
    }

    var elapsed     = U.getElapsed(state);
    var result      = U.getPhase(elapsed);
    var phase       = result.phase;
    var phaseElapsed = result.phaseElapsed;

    /* Timer display */
    ck.textContent = U.fmt(Math.max(0, phase.duration - phaseElapsed));

    /* Progress bar (depletes left to right) */
    var pct = Math.max(0, 100 - (phaseElapsed / phase.duration * 100));
    gid('pbar-fill').style.width = pct + '%';

    /* Phase name */
    gid('phase-name').textContent = phase.name;

    /* Phase icon — custom image or emoji fallback */
    var iconEl    = gid('phase-icon');
    var customUrl = (state.phaseIcons || {})[phase.icon];
    if (customUrl) {
      iconEl.innerHTML = '<img src="' + customUrl + '" style="width:1.4vw;height:1.4vw;object-fit:contain"/>';
    } else {
      iconEl.innerHTML = C.PHASE_ICON_FALLBACKS[phase.icon] || '▶';
    }
  }

  /**
   * _tickTimer() → void
   * RAF loop that updates the timer display every animation frame.
   * Only runs while the timer is active (timerRunning === true).
   */
  function _tickTimer() {
    _updateTimerDOM(ST.get());
    _timerRAF = requestAnimationFrame(_tickTimer);
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 7. STARTING SCREEN TIMER
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  /** Handle for the starting-timer RAF loop. */
  var _startingRAF = null;

  /**
   * _tickStartingTimer() → void
   * RAF loop for the starting screen countdown/countup timer.
   * Reads startingCountdownFrom — if > 0, counts down; otherwise counts up.
   */
  function _tickStartingTimer() {
    var state    = ST.get();
    var elapsed  = U.getStartingElapsed(state);
    var cf       = state.startingCountdownFrom || 0;
    var display  = cf > 0 ? Math.max(0, cf - elapsed) : elapsed;

    var el = gid('starting-timer');
    if (el) el.textContent = U.fmt(display);

    _startingRAF = requestAnimationFrame(_tickStartingTimer);
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 8. TEAM CARDS (game mode)
   * Cycles between team cards with slide/fade/flip transitions.
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  var _activeCard   = null;  // DOM element currently shown
  var _curCardIdx   = 0;     // Index in active slots array
  var _cycleTimeout = null;  // setTimeout handle for auto-advance
  var _cycleRAF     = null;  // RAF handle for progress bar
  var _cycleStart   = null;  // Date.now() when progress bar started

  /**
   * _buildTeamCard(slot, team, state) → HTMLElement
   * Constructs a team card DOM element. Adapts layout for 2 vs 4 players.
   *
   * @param {object} slot  - Colour slot object
   * @param {object} team  - Named team object
   * @param {object} state - Global state
   * @returns {HTMLElement}
   */
  function _buildTeamCard(slot, team, state) {
    var hex     = COLORS[slot.color] || '#fff';
    var sz      = state.teamSize || 4;
    var icons   = state.phaseIcons || {};
    var players = (team.players || [])
      .filter(function (p) { return U.getPlayerName(p).trim(); })
      .slice(0, sz);

    /* Bed-gone badge — uses custom icon if configured */
    var bedOK       = slot.hasBed !== false;
    var bedGoneIcon = icons.bedgone
      ? '<img src="' + icons.bedgone + '" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;"/> BED GONE'
      : '💔 BED GONE';
    var badges = bedOK ? '' : '<div class="tc-badge">' + bedGoneIcon + '</div>';

    /* Sizing adapts for 2-player vs 4-player teams */
    var bustSize = sz <= 2 ? 'clamp(80px,8vw,130px)'  : 'clamp(52px,5vw,78px)';
    var bustH    = sz <= 2 ? 'clamp(98px,9.8vw,160px)' : 'clamp(64px,6.1vw,95px)';
    var nameSize = sz <= 2 ? 'clamp(11px,.9vw,16px)'   : 'clamp(9px,.7vw,14px)';
    var gap      = sz <= 2 ? '20px' : '12px';

    var playersHTML = players.map(function (p) {
      var name = U.getPlayerName(p);
      var dead = U.isPlayerDead(p);
      return '<div class="pu' + (dead ? ' dead' : '') + '">' +
        '<div class="pu-bust" style="width:' + bustSize + ';height:' + bustH + ';">' +
          '<img src="' + U.skinBustURL(name) + '"' +
            ' onerror="this.src=\'' + U.skinFallbackURL(name) + '\'"' +
            ' loading="eager" alt="' + U.escapeHtml(name) + '"/>' +
        '</div>' +
        '<div class="pu-name" style="font-size:' + nameSize + '">' + U.escapeHtml(name) + '</div>' +
      '</div>';
    }).join('');

    var card       = document.createElement('div');
    card.className = 'team-card';
    card.innerHTML =
      '<div class="tc-bar" style="background:' + hex + ';box-shadow:0 0 12px ' + hex + '"></div>' +
      '<div class="tc-body">' +
        '<div class="tc-top">' +
          '<div class="tc-name" style="color:' + hex + '">' + U.escapeHtml(team.name) + '</div>' +
          '<div style="font-family:var(--fd);font-size:clamp(6px,.45vw,9px);opacity:.5;letter-spacing:.1vw;">' + slot.color.toUpperCase() + '</div>' +
          badges +
        '</div>' +
        '<div class="tc-players" style="gap:' + gap + ';">' + playersHTML + '</div>' +
      '</div>' +
      '<div class="tc-score" style="color:' + hex + '">' + (slot.score || 0) + '</div>';

    return card;
  }

  /**
   * _startCycleProgress(durationSecs, hex) → void
   * Animates the thin progress bar at the bottom of the team section
   * from 0% to 100% over durationSecs seconds.
   *
   * @param {number} durationSecs
   * @param {string} hex - Fill colour
   */
  function _startCycleProgress(durationSecs, hex) {
    if (_cycleRAF) cancelAnimationFrame(_cycleRAF);

    var fill = gid('cprog-fill');
    if (!fill) return;

    fill.style.background = hex || 'var(--acc)';
    fill.style.width      = '0%';
    _cycleStart           = Date.now();

    function tick() {
      var pct = Math.min(100, (Date.now() - _cycleStart) / (durationSecs * 1000) * 100);
      fill.style.width = pct + '%';
      if (pct < 100) _cycleRAF = requestAnimationFrame(tick);
    }

    _cycleRAF = requestAnimationFrame(tick);
  }

  /**
   * _cycleTo(nextIdx, state) → void
   * Transitions the team-section to show the team at nextIdx in the
   * active slots array. Animates out the old card and in the new one.
   *
   * @param {number} nextIdx - Target index in active slots
   * @param {object} state
   */
  function _cycleTo(nextIdx, state) {
    clearTimeout(_cycleTimeout);

    var activeSlots = ST.getActiveSlots(state);
    if (!activeSlots.length) return;

    /* Wrap index */
    nextIdx = ((nextIdx % activeSlots.length) + activeSlots.length) % activeSlots.length;

    var slot = activeSlots[nextIdx];
    var team = ST.getTeamById(state, slot.teamId);
    if (!team) return;

    var transition = state.transition || 'slide';
    var stage      = gid('team-stage');

    /* Animate out the current card */
    if (_activeCard) {
      var dying = _activeCard;
      dying.classList.add('exiting');
      dying.classList.remove('enter-' + transition);
      dying.classList.add('exit-' + transition);
      setTimeout(function () {
        if (dying.parentNode) dying.parentNode.removeChild(dying);
      }, 560);
      _activeCard = null;
    }

    /* Build and animate in the new card */
    var card = _buildTeamCard(slot, team, state);
    card.classList.add('enter-' + transition);
    stage.appendChild(card);

    /* Adjust stage min-height to prevent layout jump */
    requestAnimationFrame(function () {
      if (card.parentNode) stage.style.minHeight = card.offsetHeight + 'px';
    });

    _activeCard = card;
    _curCardIdx = nextIdx;

    _startCycleProgress(state.cycleInterval || 8, COLORS[slot.color] || '#fff');

    /* Schedule next auto-cycle */
    if (state.autoCycle !== false && activeSlots.length > 1) {
      var intervalMs = (state.cycleInterval || 8) * 1000;
      _cycleTimeout = setTimeout(function () {
        var s = ST.get();
        if (!s.showTeams) return;
        var as = ST.getActiveSlots(s);
        if (!as.length) return;
        _cycleTo((_curCardIdx + 1) % as.length, s);
      }, intervalMs);
    }
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 9. INFO / TOURNAMENT PANEL
   * Cycles between info cards with a fade transition.
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  var _infoCardIdx     = 0;   // Current card index
  var _infoCardTimeout = null; // setTimeout for auto-advance

  /**
   * _runInfoCardCycle(state) → void
   * Starts or restarts the info card cycling loop.
   * Hides the panel if there are no cards or showTournInfo is false.
   *
   * @param {object} state
   */
  function _runInfoCardCycle(state) {
    clearTimeout(_infoCardTimeout);

    var cards = state.tournCards || [];
    var panel = gid('tourn-panel');

    if (!state.showTournInfo || !cards.length) {
      if (panel) panel.classList.add('hidden');
      return;
    }

    if (panel) panel.classList.remove('hidden');

    var card  = cards[_infoCardIdx] || cards[0];
    var inner = gid('tp-inner');

    /* Fade out, swap content, fade in */
    inner.classList.add('fading');
    setTimeout(function () {
      var titleEl = gid('tp-title');
      var bodyEl  = gid('tp-body');
      var dotsEl  = gid('tp-dots');

      if (titleEl) titleEl.textContent = card.title || '';
      if (bodyEl)  bodyEl.textContent  = card.body  || '';

      if (dotsEl) {
        dotsEl.innerHTML = cards.map(function (_, i) {
          return '<div class="tp-dot' + (i === _infoCardIdx ? ' on' : '') + '"></div>';
        }).join('');
      }

      inner.classList.remove('fading');
    }, 360);

    /* Schedule the next card */
    if (cards.length > 1) {
      _infoCardTimeout = setTimeout(function () {
        _infoCardIdx = (_infoCardIdx + 1) % (ST.get().tournCards || []).length;
        _runInfoCardCycle(ST.get());
      }, (state.tournCardInterval || 10) * 1000);
    }
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 10. STARTING SCREEN TEAM CYCLING
   * Cycles through participating teams while waiting for the game to start.
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  var _startingActiveCard = null;  // Currently visible team card on starting screen
  var _startingCurIdx     = 0;     // Next slot index to show
  var _startingCycleTO    = null;  // setTimeout handle

  /**
   * _cycleStartingTeam(state) → void
   * Shows the next team in the starting-screen cycling area.
   * Each team is displayed for 4 seconds before fading to the next.
   *
   * @param {object} state
   */
  function _cycleStartingTeam(state) {
    clearTimeout(_startingCycleTO);

    var slots = ST.getActiveSlots(state);
    if (!slots.length) return;

    /* Wrap index */
    _startingCurIdx = _startingCurIdx % slots.length;

    var slot = slots[_startingCurIdx];
    var team = ST.getTeamById(state, slot.teamId);
    if (!team) { _startingCurIdx++; return; }

    var stage = gid('starting-team-stage');
    if (!stage) return;

    var hex     = COLORS[slot.color] || '#fff';
    var sz      = state.teamSize || 4;

    var bustSize = sz <= 2 ? 'clamp(60px,6vw,100px)'  : 'clamp(40px,4vw,68px)';
    var bustH    = sz <= 2 ? 'clamp(74px,7.4vw,122px)' : 'clamp(50px,5vw,84px)';
    var nameSize = sz <= 2 ? 'clamp(10px,.8vw,14px)'   : 'clamp(8px,.65vw,12px)';

    /* Build player thumbnails */
    var players = (team.players || [])
      .filter(function (p) { return U.getPlayerName(p).trim(); })
      .slice(0, sz);

    var playersHTML = players.map(function (p) {
      var name = U.getPlayerName(p);
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">' +
        '<div style="width:' + bustSize + ';height:' + bustH + ';border-radius:6px;overflow:hidden;border:1px solid ' + U.hexToRgba(hex, .25) + ';">' +
          '<img src="' + U.skinBustURL(name) + '"' +
            ' onerror="this.src=\'' + U.skinFallbackURL(name) + '\'"' +
            ' style="width:100%;height:100%;object-fit:cover;" loading="lazy"/>' +
        '</div>' +
        '<div style="font-size:' + nameSize + ';font-weight:700;color:rgba(255,255,255,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:' + bustSize + ';">' +
          U.escapeHtml(name) +
        '</div>' +
      '</div>';
    }).join('');

    /* Fade out old card */
    if (_startingActiveCard && _startingActiveCard.parentNode) {
      var old = _startingActiveCard;
      old.style.transition = 'opacity .4s';
      old.style.opacity    = '0';
      setTimeout(function () {
        if (old.parentNode) old.parentNode.removeChild(old);
      }, 420);
    }

    /* Create and fade in new card */
    var card = document.createElement('div');
    card.style.cssText = 'position:absolute;top:0;left:0;width:100%;display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0;transition:opacity .4s;';
    card.innerHTML =
      '<div style="font-family:var(--fd);font-size:clamp(12px,1.1vw,20px);font-weight:900;color:' + hex + ';letter-spacing:.15vw;text-transform:uppercase;text-shadow:0 0 16px ' + hex + ';">' +
        U.escapeHtml(team.name) +
      '</div>' +
      '<div style="display:flex;gap:' + (sz <= 2 ? '24px' : '14px') + ';justify-content:center;">' + playersHTML + '</div>' +
      '<div style="width:80%;height:2px;background:linear-gradient(90deg,transparent,' + hex + ',transparent);opacity:.4;"></div>';

    stage.style.position = 'relative';
    stage.appendChild(card);
    _startingActiveCard = card;

    /* Double RAF to ensure transition triggers */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { card.style.opacity = '1'; });
    });

    _startingCurIdx++;

    /* Schedule next team */
    _startingCycleTO = setTimeout(function () {
      _cycleStartingTeam(ST.get());
    }, C.DEFAULTS.startingCycleSecs * 1000);
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 11. WINNER + STANDINGS (summary screen)
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  var _summaryPhaseTimeout = null;

  /**
   * _winnerSkinUrls(state) → string[]
   * Full-body + fallback skin URLs for the winning team's players.
   *
   * @param {object} state
   * @returns {string[]}
   */
  function _winnerSkinUrls(state) {
    var team = state.lastWinnerTeamId ? ST.getTeamById(state, state.lastWinnerTeamId) : null;
    if (!team) return [];
    var sz = state.teamSize || 4;
    var urls = [];
    (team.players || [])
      .filter(function (p) { return U.getPlayerName(p).trim(); })
      .slice(0, sz)
      .forEach(function (p) {
        var name = U.getPlayerName(p);
        urls.push(U.skinFullURL(name));
        urls.push(U.skinFallbackURL(name));
      });
    return urls;
  }

  /**
   * _preloadImages(urls, done, timeoutMs) → void
   * Loads every URL into the browser cache, then calls done().
   * A timeout guards against a slow/unreachable skin host so the
   * winner screen never hangs.
   *
   * @param {string[]} urls
   * @param {function} done
   * @param {number}   [timeoutMs=3000]
   */
  function _preloadImages(urls, done, timeoutMs) {
    urls = (urls || []).filter(Boolean);
    if (!urls.length) { done(); return; }

    var remaining = urls.length;
    var finished  = false;

    function settle() {
      if (finished) return;
      remaining -= 1;
      if (remaining <= 0) { finished = true; done(); }
    }

    urls.forEach(function (u) {
      var img = new Image();
      img.onload  = settle;
      img.onerror = settle;
      img.src     = u;
    });

    setTimeout(function () {
      if (!finished) { finished = true; done(); }
    }, timeoutMs || 3000);
  }

  /**
   * _renderSummaryScreen(state) → void
   * Populates BOTH panels of the summary screen:
   *   Phase 1 — Winner Panel (shown first, winnerDisplaySecs = 10s)
   *   Phase 2 — Standings Panel (shown after)
   *
   * @param {object} state
   */
  function _renderSummaryScreen(state) {
    _renderWinnerPanel(state);
    _renderStandingsPanel(state);
  }

  /**
   * _renderWinnerPanel(state) → void
   * Populates the winner panel with the winning team's name and
   * full-body skin renders for each player.
   *
   * @param {object} state
   */
  function _renderWinnerPanel(state) {
    var winTeam = state.lastWinnerTeamId
      ? ST.getTeamById(state, state.lastWinnerTeamId)
      : null;

    var accents = U.getThemeAccents(state);
    var acc     = accents[0];
    var sz      = state.teamSize || 4;

    if (!winTeam) return;

    var nameEl = gid('winner-team-name');
    if (nameEl) {
      nameEl.textContent  = winTeam.name;
      nameEl.style.textShadow = '0 0 40px ' + acc + ',0 0 80px ' + acc;
    }

    var players = (winTeam.players || [])
      .filter(function (p) { return U.getPlayerName(p).trim(); })
      .slice(0, sz);

    var skinW = sz <= 2 ? 'clamp(110px,11vw,180px)' : 'clamp(90px,9vw,150px)';
    var ignSz = sz <= 2 ? '1.6vw' : '1.2vw';

    var playersEl = gid('winner-players');
    if (playersEl) {
      playersEl.innerHTML = players.map(function (p, i) {
        var name = U.getPlayerName(p);
        return '<div class="winner-player" style="animation-delay:' + (i * .15) + 's">' +
          '<img class="winner-skin"' +
            ' src="' + U.skinFullURL(name) + '"' +
            ' onerror="this.src=\'' + U.skinFallbackURL(name) + '\'"' +
            ' loading="eager"' +
            ' style="width:' + skinW + ';filter:drop-shadow(0 0 20px ' + acc + ')"/>' +
          '<div class="winner-ign" style="font-size:' + ignSz + '">' + U.escapeHtml(name) + '</div>' +
        '</div>';
      }).join('');
    }
  }

  /**
   * _renderStandingsPanel(state) → void
   * Populates the standings table. Font sizes and row heights scale
   * based on team count so large rosters still fit the screen.
   *
   * @param {object} state
   */
  function _renderStandingsPanel(state) {
    var standings = ST.getStandings(state);
    var n         = Math.max(1, standings.length);

    /* Scale fonts with team count (more teams = smaller text) */
    var fs       = Math.max(.9,  2.2 - n * .13) + 'vw';
    var rankFs   = Math.max(1.2, 3.0 - n * .18) + 'vw';
    var cols     = '3.5vw 1fr 10vw 10vw';

    /* Column headers */
    var headsEl = gid('std-col-heads');
    if (headsEl) {
      headsEl.style.gridTemplateColumns = cols;
      headsEl.innerHTML =
        '<div class="std-col-lbl">#</div>' +
        '<div class="std-col-lbl left">Team</div>' +
        '<div class="std-col-lbl">PTS</div>' +
        '<div class="std-col-lbl">+GAME</div>';
    }

    /* Event name as subtitle */
    var subtitleEl = gid('std-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = (state.startingEventName || 'GLOBAL CHAMPIONSHIP').toUpperCase();
    }

    /* Get last game's results for +GAME column */
    var lastGame = (state.gameHistory || []).slice(-1)[0];

    var rowsEl = gid('std-rows');
    if (!rowsEl) return;
    rowsEl.innerHTML = '';

    standings.forEach(function (team, rank) {
      var gameResult = lastGame
        ? (lastGame.results || []).find(function (r) { return r.teamId === team.id; })
        : null;
      var gamePts = gameResult ? gameResult.pts : 0;

      /* ▲▼ delta (position change from previous game) — large & glowing
         so viewers can clearly see who is climbing or dropping */
      var delta = team.prevRank != null ? team.prevRank - (rank + 1) : null;
      var deltaHTML = delta === null ? '' :
        delta  > 0 ? '<span class="std-delta up"   style="font-size:clamp(22px,1.9vw,42px);margin-left:.7vw;text-shadow:0 0 14px #44ff88;">▲' + delta       + '</span>' :
        delta  < 0 ? '<span class="std-delta down" style="font-size:clamp(22px,1.9vw,42px);margin-left:.7vw;text-shadow:0 0 14px #ff4a4a;">▼' + Math.abs(delta) + '</span>' : '';

      var rankCls    = rank === 0 ? 'top1' : rank === 1 ? 'top2' : rank === 2 ? 'top3' : '';
      var rankNumCls = rank === 0 ? 'r1'   : rank === 1 ? 'r2'   : rank === 2 ? 'r3'   : '';

      var slot = (state.slots || []).find(function (s) { return s.teamId === team.id; });
      var hex  = slot ? (COLORS[slot.color] || '#aaa') : '#aaa';

      var row = document.createElement('div');
      row.className = 'std-row ' + rankCls;
      row.style.gridTemplateColumns = cols;
      row.style.animationDelay      = (rank * .07) + 's';

      row.innerHTML =
        '<div class="std-rank ' + rankNumCls + '" style="font-size:' + rankFs + '">' + (rank + 1) + '</div>' +
        '<div style="display:flex;align-items:center;gap:.5vw;min-width:0;">' +
          '<div style="width:clamp(8px,.9vw,14px);height:clamp(8px,.9vw,14px);border-radius:50%;background:' + hex + ';flex-shrink:0;box-shadow:0 0 8px ' + hex + '88;"></div>' +
          '<span class="std-team-name" style="font-size:' + fs + ';color:' + hex + '">' + U.escapeHtml(team.name) + '</span>' +
          deltaHTML +
        '</div>' +
        '<div class="std-pts"       style="font-size:' + fs + '">' + team.totalPoints + '</div>' +
        '<div class="std-game-pts"  style="font-size:' + fs + '">+' + gamePts + '</div>';

      rowsEl.appendChild(row);
    });
  }

  /**
   * _showSummaryPhase(phase, state) → void
   * Switches the summary screen between 'winner' and 'standings' phases.
   * Winner shows for DEFAULTS.winnerDisplaySecs then auto-advances to standings.
   *
   * @param {string} phase - 'winner' | 'standings'
   * @param {object} state
   */
  function _showSummaryPhase(phase, state) {
    var wp = gid('winner-panel');
    var sp = gid('standings-panel');

    if (phase === 'winner') {
      if (sp) sp.classList.remove('show');
      setTimeout(function () { if (wp) wp.classList.add('show'); }, 100);
      clearTimeout(_summaryPhaseTimeout);
      _summaryPhaseTimeout = setTimeout(function () {
        _showSummaryPhase('standings', ST.get());
      }, C.DEFAULTS.winnerDisplaySecs * 1000);
    } else {
      if (wp) wp.classList.remove('show');
      setTimeout(function () { if (sp) sp.classList.add('show'); }, 100);
    }
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 12. MAP REVEAL
   * Animates through map "slot machine" then settles on the chosen map.
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  /**
   * _buildMapSlide(map, height) → HTMLElement
   * Creates one map slide element for use in the slot machine animation.
   *
   * @param {{ name:string, imageUrl:string }} map
   * @param {number} height - Slide height in px
   * @returns {HTMLElement}
   */
  function _buildMapSlide(map, height) {
    var slide     = document.createElement('div');
    slide.className = 'map-slide';
    slide.style.height = height + 'px';
    slide.innerHTML =
      (map.imageUrl
        ? '<img src="' + U.escapeHtml(map.imageUrl) + '" alt="' + U.escapeHtml(map.name) + '" style="width:100%;height:100%;object-fit:cover;display:block"/>'
        : '<div class="map-no-img">🗺️</div>') +
      '<div class="map-slide-name">' + U.escapeHtml(map.name) + '</div>';
    return slide;
  }

  /**
   * _showMapResult(selectedMap, state) → void
   * Shows the "SELECTED: <MAP NAME>" label after the animation finishes.
   *
   * @param {{ name:string }} selectedMap
   * @param {object} state
   */
  function _showMapResult(selectedMap, state) {
    setTimeout(function () {
      var resultEl = gid('map-result');
      if (resultEl) {
        resultEl.textContent = 'SELECTED: ' + selectedMap.name.toUpperCase();
        resultEl.classList.add('show');
      }
      var tagEl = gid('map-game-tag');
      if (tagEl) {
        tagEl.textContent = 'Game ' + (state.gameNumber || 1) +
          (state.gameStage ? ' · ' + state.gameStage : '');
      }
    }, 300);
  }

  /**
   * _runMapReveal(state) → void
   * Plays the slot-machine map reveal animation, then shows the result.
   *
   * @param {object} state
   */
  function _runMapReveal(state) {
    var pool = state.mapPool || [];
    if (!pool.length) return;

    var targetMap = pool.find(function (m) { return m.name === state.selectedMap; }) || pool[0];

    /* Reset result label */
    var resultEl = gid('map-result');
    if (resultEl) { resultEl.classList.remove('show'); resultEl.textContent = ''; }
    var tagEl = gid('map-game-tag');
    if (tagEl) tagEl.textContent = '';

    var strip  = gid('map-strip');
    var win    = gid('map-window');
    if (!strip || !win) return;

    var height = win.offsetHeight || 300;

    strip.innerHTML = '';
    strip.style.display = 'block';
    strip.style.width   = '100%';
    strip.style.transform = '';

    /* Build 22 random slides + the target */
    var slides = [];
    for (var i = 0; i < 22; i++) {
      slides.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    slides.push(targetMap);

    slides.forEach(function (map, idx) {
      var slide = _buildMapSlide(map, height);
      slide.style.top = (idx * height) + 'px';
      strip.appendChild(slide);
    });

    strip.style.height = (slides.length * height) + 'px';

    /* Ease-out animation */
    var totalDuration = 4000;
    var startTime     = null;
    var targetY       = -(slides.length - 1) * height;

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    function frame(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min(1, (timestamp - startTime) / totalDuration);
      strip.style.top = (easeOut(progress) * targetY) + 'px';
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        _showMapResult(targetMap, state);
      }
    }

    requestAnimationFrame(frame);
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 13. LOGO SCREENS (starting + BRB)
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  /**
   * _updateLogoScreens(state) → void
   * Updates text content, logo URLs, and animation classes for
   * the Starting Game and BRB screens.
   *
   * @param {object} state
   */
  function _updateLogoScreens(state) {
    _updateAllBackgrounds(state);

    /* Starting screen logo */
    var sl = gid('starting-logo');
    var sw = gid('starting-logo-wrap');
    if (sl) {
      if (state.startingLogoUrl) { sl.src = state.startingLogoUrl; sl.style.display = ''; }
      else sl.style.display = 'none';
    }
    if (sw) sw.className = 'logo-wrap anim-' + (state.startingAnimation || 'pulse');

    /* Starting screen text */
    var evEl  = gid('starting-event');
    var subEl = gid('starting-subtitle');
    if (evEl)  evEl.textContent  = state.startingEventName || '';
    if (subEl) subEl.textContent = state.startingSubtext   || 'Starting Game';

    /* BRB screen */
    var bl  = gid('brb-logo');
    var bw  = gid('brb-logo-wrap');
    var bev = gid('brb-event');
    var bsb = gid('brb-subtitle');

    if (bl) {
      if (state.brbLogoUrl) { bl.src = state.brbLogoUrl; bl.style.display = ''; }
      else bl.style.display = 'none';
    }
    if (bw)  bw.className  = 'logo-wrap anim-' + (state.brbAnimation || 'float');
    if (bev) bev.textContent = state.brbEventName || state.startingEventName || '';
    if (bsb) bsb.textContent = state.brbSubtext   || 'Be Right Back';
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 14. SCREEN MODE SWITCHER
   * Controls which fullscreen overlay is visible.
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  var _prevMode = '';

  /** Screens that are hidden when game-mode panels are shown. */
  var FULLSCREENS     = ['summary-screen', 'map-screen', 'starting-screen', 'brb-screen'];
  /** Game-mode panels hidden during fullscreen modes. */
  var GAME_PANELS     = ['scoreboard', 'main-panel', 'tourn-panel'];

  /**
   * _setMode(mode, state) → void
   * Switches the overlay to the requested mode.
   * Uses an early return if the mode hasn't changed.
   *
   * @param {string} mode  - One of C.OVERLAY_MODES
   * @param {object} state
   */
  function _setMode(mode, state) {
    if (mode === _prevMode) return;

    /* Hide all fullscreen overlays and reset game panels */
    FULLSCREENS.forEach(function (id) { var el = gid(id); if (el) el.classList.remove('show'); });
    GAME_PANELS.forEach(function (id) { var el = gid(id); if (el) el.classList.remove('hidden'); });

    /* Stop starting-screen team cycling when leaving 'starting' mode */
    clearTimeout(_startingCycleTO);

    switch (mode) {

      case 'summary':
        GAME_PANELS.forEach(function (id) { var el = gid(id); if (el) el.classList.add('hidden'); });
        _renderSummaryScreen(state);
        var ss = gid('summary-screen');
        /* Preload the winner's skins BEFORE revealing the screen so the
           full-body renders are already on-screen when it fades in
           (no late pop-in). Falls back after 3s if a skin host is slow. */
        _preloadImages(_winnerSkinUrls(state), function () {
          if (ST.get().overlayMode !== 'summary') return;  // user moved on
          if (ss) ss.classList.add('show');
          _showSummaryPhase('winner', ST.get());
        }, 3000);
        break;

      case 'map':
        GAME_PANELS.forEach(function (id) { var el = gid(id); if (el) el.classList.add('hidden'); });
        var ms = gid('map-screen');
        setTimeout(function () {
          if (ms) ms.classList.add('show');
          setTimeout(function () { _runMapReveal(ST.get()); }, 500);
        }, 50);
        break;

      case 'starting':
        GAME_PANELS.forEach(function (id) { var el = gid(id); if (el) el.classList.add('hidden'); });
        var startEl = gid('starting-screen');
        if (startEl) startEl.classList.add('show');
        if (state.startingTimerRunning && !_startingRAF) {
          _startingRAF = requestAnimationFrame(_tickStartingTimer);
        }
        /* Begin team cycling */
        _startingCurIdx     = 0;
        _startingActiveCard = null;
        var stageEl = gid('starting-team-stage');
        if (stageEl) stageEl.innerHTML = '';
        if (ST.getActiveSlots(state).length > 0) _cycleStartingTeam(state);
        break;

      case 'brb':
        GAME_PANELS.forEach(function (id) { var el = gid(id); if (el) el.classList.add('hidden'); });
        var brbEl = gid('brb-screen');
        if (brbEl) brbEl.classList.add('show');
        break;

      default: /* 'game' */
        var sb = gid('scoreboard');
        var mp = gid('main-panel');
        var tp = gid('tourn-panel');
        if (sb) sb.classList.toggle('hidden', !state.showScoreboard);
        if (mp) mp.classList.toggle('hidden', !state.showTeams && !state.showTimer);
        if (tp) tp.classList.toggle('hidden', !state.showTournInfo);
        break;
    }

    _prevMode = mode;
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 15. MAIN RENDER LOOP
   * Called on every state change. Routes updates to the relevant
   * sub-functions to keep each section current.
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  /**
   * Signature string for the slots/teams — used to detect changes that
   * require rebuilding the team card cycling loop.
   */
  var _lastSlotsSig = '';

  /**
   * Serialised tournCards — used to detect info card changes without
   * rebuilding on every unrelated state update.
   */
  var _lastTournCards = '';

  /**
   * _slotsSig(state) → string
   * Returns a compact signature string that changes whenever the
   * slot/team configuration changes.
   *
   * @param {object} state
   * @returns {string}
   */
  function _slotsSig(state) {
    return JSON.stringify((state.slots || []).map(function (s) {
      return s.teamId + '|' + s.color + '|' + s.score + '|' + s.eliminated + '|' + s.hasBed;
    })) + JSON.stringify(state.namedTeams || []) + (state.gameNumber || 1);
  }

  /**
   * render(state) → void
   * Main render function — called by the state subscriber on every update.
   *
   * @param {object} state - Current global state
   */
  function render(state) {
    /* Theme + layout (cheap — only touches CSS vars / inline styles) */
    applyTheme(state);
    applyLayout(state);

    /* Game info labels */
    var gnumEl   = gid('gnum');    if (gnumEl)   gnumEl.textContent   = state.gameNumber || 1;
    var mapTag   = gid('map-tag'); if (mapTag)   mapTag.textContent   = state.mapName ? '— ' + state.mapName : '';
    var stageEl  = gid('stage-lbl'); if (stageEl) stageEl.textContent = state.gameStage || '';

    /* Game timer RAF management */
    if (state.timerRunning) {
      if (!_timerRAF) _timerRAF = requestAnimationFrame(_tickTimer);
    } else {
      if (_timerRAF) { cancelAnimationFrame(_timerRAF); _timerRAF = null; }
      _updateTimerDOM(state);
    }

    /* Starting timer RAF management */
    if (state.startingTimerRunning) {
      if (!_startingRAF) _startingRAF = requestAnimationFrame(_tickStartingTimer);
    } else {
      if (_startingRAF) { cancelAnimationFrame(_startingRAF); _startingRAF = null; }
      var stEl = gid('starting-timer');
      if (stEl) {
        var el2  = U.getStartingElapsed(state);
        var cf2  = state.startingCountdownFrom || 0;
        stEl.textContent = U.fmt(cf2 > 0 ? Math.max(0, cf2 - el2) : el2);
      }
    }

    /* Scoreboard */
    _renderScoreboard(state);

    /* Team card cycle — only rebuild if slots/teams changed */
    var sig = _slotsSig(state);
    if (sig !== _lastSlotsSig) {
      _lastSlotsSig = sig;
      if (_activeCard && _activeCard.parentNode) _activeCard.parentNode.removeChild(_activeCard);
      _activeCard = null;
      clearTimeout(_cycleTimeout);
      var as = ST.getActiveSlots(state);
      if (_curCardIdx >= as.length) _curCardIdx = 0;
      if (state.showTeams && as.length > 0) _cycleTo(_curCardIdx, state);
    }

    /* Info card cycle — only restart if cards changed */
    var tc = JSON.stringify(state.tournCards);
    if (tc !== _lastTournCards) {
      _lastTournCards = tc;
      _infoCardIdx    = 0;
      _runInfoCardCycle(state);
    } else {
      var tp = gid('tourn-panel');
      if (tp) tp.classList.toggle('hidden', !state.showTournInfo);
    }

    /* Logo screen content (text, logos, backgrounds) */
    _updateLogoScreens(state);

    /* Screen mode (starting / game / summary / map / brb) */
    _setMode(state.overlayMode || 'starting', state);
  }


  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 16. BOOT
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  /**
   * _boot() → void
   * Runs once on page load. Performs the initial full render and
   * subscribes to future state changes.
   */
  function _boot() {
    console.info('[Overlay] Booting Bedwars Overlay v11');

    var state = ST.get();

    /* Initial render */
    applyTheme(state);
    applyLayout(state);
    _updateTimerDOM(state);
    _renderScoreboard(state);

    /* Info card cycle */
    _runInfoCardCycle(state);
    _lastTournCards = JSON.stringify(state.tournCards);

    /* Team card cycle */
    var as0 = ST.getActiveSlots(state);
    if (state.showTeams && as0.length > 0) _cycleTo(0, state);
    _lastSlotsSig = _slotsSig(state);

    /* Logo screens */
    _updateLogoScreens(state);

    /* Screen mode */
    _setMode(state.overlayMode || 'starting', state);

    /* Start RAF loops if already active */
    if (state.timerRunning)         _timerRAF    = requestAnimationFrame(_tickTimer);
    if (state.startingTimerRunning) _startingRAF = requestAnimationFrame(_tickStartingTimer);

    /* Subscribe to future state changes */
    ST.subscribe(render);

    console.info('[Overlay] Boot complete — mode:', state.overlayMode);
  }

  /* Run on DOMContentLoaded */
  document.addEventListener('DOMContentLoaded', _boot);

})();
