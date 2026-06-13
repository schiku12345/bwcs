/**
 * dashboard.js — Admin Dashboard Module
 *
 * The dashboard is the central control hub for a live stream.
 * It exposes:
 *   • Overlay screen switcher (Starting / Game / Winner / Map / BRB)
 *   • Context-sensitive Quick Actions per screen
 *   • Timer display and controls
 *   • Map picker modal (used after Finish Game and on Starting screen)
 *   • Finish Game modal (placement ordering + saves game)
 *   • Match info editor (game number, stage, map name)
 *   • Live slot summary chips
 *
 * DEPENDS ON:
 *   BWO_STATE, BWO_UTILS, BWO_CONST, BWO_ADMIN_UI (notification helper)
 *
 * EXPORTS: window.BWO_DASHBOARD
 */

'use strict';

window.BWO_DASHBOARD = (function () {

  /* ── Aliases ───────────────────────────────────────────────── */
  var ST  = window.BWO_STATE;
  var U   = window.BWO_UTILS;
  var C   = window.BWO_CONST;
  var UI  = window.BWO_ADMIN_UI;   // shared admin UI helpers (notify, etc.)


  /* ═══════════════════════════════════════════════════════════════
   * INTERNAL STATE
   * Module-level variables (not persisted — UI-only).
   * ═══════════════════════════════════════════════════════════════ */

  /** Current placement ordering in the Finish Game modal. */
  var _placementOrder = [];

  /** RAF handle for the admin timer display. */
  var _timerRAF = null;

  /** RAF handle for the starting-screen countdown display. */
  var _startingRAF = null;


  /* ═══════════════════════════════════════════════════════════════
   * OVERLAY MODE
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * setOverlayMode(mode) → void
   * Switches the overlay to the given screen mode and updates the
   * quick-action panel to show the relevant controls.
   *
   * @param {string} mode - One of BWO_CONST.OVERLAY_MODES
   */
  function setOverlayMode(mode) {
    ST.update({ overlayMode: mode });
    _syncOvmButtons(mode);
    _syncQuickActions(mode);
    console.info('[Dashboard] Overlay mode → ' + mode);
  }

  /**
   * _syncOvmButtons(mode) → void
   * Highlights the active overlay-mode button in the grid.
   */
  function _syncOvmButtons(mode) {
    C.OVERLAY_MODES.forEach(function (m) {
      var btn = document.getElementById('ovm-' + m);
      if (btn) btn.classList.toggle('active', m === mode);
    });
  }

  /**
   * _syncQuickActions(mode) → void
   * Shows the correct quick-action panel section for the given mode.
   */
  function _syncQuickActions(mode) {
    document.querySelectorAll('.qa-section').forEach(function (s) {
      s.classList.remove('active');
    });
    var section = document.getElementById('qa-' + mode);
    if (section) section.classList.add('active');
  }


  /* ═══════════════════════════════════════════════════════════════
   * GAME TIMER
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * toggleTimer() → void
   * Starts or pauses the game timer.
   */
  function toggleTimer() {
    var st = ST.get();
    if (st.timerRunning) {
      // Pause — capture elapsed offset
      ST.update({
        timerRunning:   false,
        timerOffset:    U.getElapsed(st),
        timerStartTime: null,
      });
      _setTimerButtonState(false);
    } else {
      // Start
      ST.update({
        timerRunning:   true,
        timerStartTime: Date.now(),
        timerStarted:   true,
      });
      _setTimerButtonState(true);
    }
  }

  /**
   * resetTimer() → void
   * Stops and resets the game timer to PREGAME state.
   */
  function resetTimer() {
    ST.update({
      timerRunning:   false,
      timerOffset:    0,
      timerStartTime: null,
      timerStarted:   false,
    });
    _setTimerButtonState(false);
    var dTimer = document.getElementById('d-timer');
    if (dTimer) dTimer.textContent = 'PREGAME';
  }

  /**
   * _setTimerButtonState(running) → void
   * Updates the Start/Pause button appearance.
   *
   * @param {boolean} running
   */
  function _setTimerButtonState(running) {
    var btn = document.getElementById('dash-ss');
    if (!btn) return;
    btn.textContent = running ? '⏸ Pause' : '▶ Start';
    btn.className   = running ? 'btn btn-d' : 'btn btn-gr';
  }

  /**
   * _tickTimer() → void
   * RAF loop that updates the admin timer display every frame.
   * Only touches textContent — safe to run continuously.
   */
  function _tickTimer() {
    var st = ST.get();
    var display;

    if (!st.timerStarted) {
      display = 'PREGAME';
    } else {
      var elapsed = U.getElapsed(st);
      var result  = U.getPhase(elapsed);
      var ph      = result.phase;
      var pe      = result.phaseElapsed;
      display = U.fmt(Math.max(0, ph.duration - pe));
    }

    var dTimer = document.getElementById('d-timer');
    if (dTimer) dTimer.textContent = display;

    _timerRAF = requestAnimationFrame(_tickTimer);
  }

  /** startTimerTick() — begin the RAF loop for the admin timer display. */
  function startTimerTick() {
    if (_timerRAF) cancelAnimationFrame(_timerRAF);
    _timerRAF = requestAnimationFrame(_tickTimer);
  }


  /* ═══════════════════════════════════════════════════════════════
   * STARTING SCREEN TIMER
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * toggleStartingTimer() → void
   * Starts or pauses the starting-screen countdown/countup timer.
   */
  function toggleStartingTimer() {
    var st = ST.get();
    if (st.startingTimerRunning) {
      ST.update({
        startingTimerRunning: false,
        startingTimerOffset:  U.getStartingElapsed(st),
        startingTimerStart:   null,
      });
      _setStartingButtonState(false);
    } else {
      ST.update({
        startingTimerRunning: true,
        startingTimerStart:   Date.now(),
      });
      _setStartingButtonState(true);
    }
  }

  /**
   * resetStartingTimer() → void
   * Resets the starting-screen timer to 0.
   */
  function resetStartingTimer() {
    ST.update({
      startingTimerRunning: false,
      startingTimerOffset:  0,
      startingTimerStart:   null,
    });
    _setStartingButtonState(false);
    ['st-timer-disp', 'st-pg-timer'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = '0:00';
    });
  }

  /**
   * _setStartingButtonState(running) → void
   * Updates start/pause buttons for the starting timer.
   */
  function _setStartingButtonState(running) {
    ['st-btn-ss', 'st-pg-btn'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.textContent = running ? '⏸' : '▶';
      btn.className   = running ? 'btn btn-d btn-sm' : 'btn btn-gr btn-sm';
    });
  }

  /**
   * _tickStartingTimer() → void
   * RAF loop for the starting screen timer display.
   */
  function _tickStartingTimer() {
    var st       = ST.get();
    var elapsed  = U.getStartingElapsed(st);
    var cf       = st.startingCountdownFrom || 0;
    var display  = cf > 0 ? Math.max(0, cf - elapsed) : elapsed;
    var text     = U.fmt(display);

    ['st-timer-disp', 'st-pg-timer'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = text;
    });

    _startingRAF = requestAnimationFrame(_tickStartingTimer);
  }

  /** startStartingTimerTick() — begin the RAF loop for the starting timer. */
  function startStartingTimerTick() {
    if (_startingRAF) cancelAnimationFrame(_startingRAF);
    _startingRAF = requestAnimationFrame(_tickStartingTimer);
  }


  /* ═══════════════════════════════════════════════════════════════
   * MATCH INFO
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * saveMatchInfo() → void
   * Reads the Match Info form fields and persists them to state.
   * Called on oninput events from those fields.
   */
  function saveMatchInfo() {
    var gameNum = parseInt(document.getElementById('inp-gnum').value) || 1;
    var stage   = document.getElementById('inp-stage').value || '';
    var mapName = document.getElementById('inp-mapname').value || '';

    ST.update({ gameNumber: gameNum, gameStage: stage, mapName: mapName });
  }

  /**
   * loadMatchInfo(state) → void
   * Syncs the Match Info form fields from the given state.
   * Skips fields that currently have focus (user is typing).
   *
   * @param {object} state
   */
  function loadMatchInfo(state) {
    _setIfUnfocused('inp-gnum',   state.gameNumber || 1);
    _setIfUnfocused('inp-stage',  state.gameStage  || '');
    _setIfUnfocused('inp-mapname', state.mapName   || '');

    var mapNameDisp = document.getElementById('d-mapname');
    if (mapNameDisp) mapNameDisp.textContent = state.mapName || '—';
  }


  /* ═══════════════════════════════════════════════════════════════
   * DASHBOARD SLOT CHIPS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * updateDashboard(state) → void
   * Refreshes all lightweight dashboard display elements.
   * Called by the main subscriber on every state change.
   *
   * @param {object} state
   */
  function updateDashboard(state) {
    // Game number / stage labels
    var gnumEl = document.getElementById('d-gamenum');
    if (gnumEl) gnumEl.textContent = state.gameNumber || 1;

    var stageEl = document.getElementById('d-stage');
    if (stageEl) stageEl.textContent = state.gameStage || '';

    // Map name in quick actions
    var mapEl = document.getElementById('d-mapname');
    if (mapEl) mapEl.textContent = state.mapName || '—';

    // Slot chips (team name + colour + score)
    _renderSlotChips(state);

    // Map select in qa-map section
    _populateMapSelect('sel-map-dash', state);
    _setIfUnfocused('sel-map-tr', state.mapTransition || 'slot');
    _setIfUnfocused('inp-cycle-dash', state.cycleInterval || 8);

    // Quick action text fields
    _setIfUnfocused('qa-event',   state.startingEventName || '');
    _setIfUnfocused('qa-sub',     state.startingSubtext   || 'Starting Game');
    _setIfUnfocused('qa-brb-sub', state.brbSubtext        || 'Be Right Back');
  }

  /**
   * _renderSlotChips(state) → void
   * Renders the row of coloured team chips in the dashboard slots area.
   */
  function _renderSlotChips(state) {
    var container = document.getElementById('d-slots');
    if (!container) return;

    var activeSlots = ST.getActiveSlots(state);

    container.innerHTML = activeSlots.map(function (slot) {
      var team  = ST.getTeamById(state, slot.teamId);
      var name  = team ? team.name : slot.color;
      var hex   = C.COLORS[slot.color] || '#fff';
      return '<div style="display:flex;align-items:center;gap:3px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:4px;padding:2px 6px;">' +
        '<div style="width:6px;height:6px;border-radius:50%;background:' + hex + '"></div>' +
        '<span style="font-size:10px;font-weight:700;color:' + hex + '">' + U.escapeHtml(name) + '</span>' +
        '<span style="font-size:9px;color:var(--mut);"> ' + slot.color + ' </span>' +
        '<span style="font-family:var(--fd);font-size:10px;font-weight:900;color:' + hex + '">' + (slot.score || 0) + '</span>' +
        '</div>';
    }).join('');
  }

  /**
   * _populateMapSelect(elementId, state) → void
   * Fills a <select> with the map pool entries.
   */
  function _populateMapSelect(elementId, state) {
    var sel = document.getElementById(elementId);
    if (!sel || document.activeElement === sel) return;
    sel.innerHTML = '<option value="">— Choose —</option>' +
      (state.mapPool || []).map(function (m) {
        var selected = m.name === state.selectedMap ? ' selected' : '';
        return '<option value="' + U.escapeHtml(m.name) + '"' + selected + '>' + U.escapeHtml(m.name) + '</option>';
      }).join('');
  }


  /* ═══════════════════════════════════════════════════════════════
   * MAP MODAL
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * openMapModal(afterFinish) → void
   * Shows the map picker modal.
   *   afterFinish = true  → opened after Finish Game (picks next map)
   *   afterFinish = false → opened from the Starting screen "Pick Map" button
   *
   * @param {boolean} afterFinish
   */
  function openMapModal(afterFinish) {
    var state = ST.get();

    /* Pre-select the next map. autoAdvanceQueue() writes the upcoming game's
       map into state.selectedMap, so the reveal modal opens with it already
       chosen (the user just clicks Play). */
    var preMap = state.selectedMap || '';

    var sel = document.getElementById('mm-map-sel');
    if (sel) {
      var pool   = state.mapPool || [];
      var inPool = pool.some(function (m) { return m.name === preMap; });
      var opts   = '<option value="">— Choose map —</option>';
      // Surface the queued map even if it isn't in the saved map pool
      if (preMap && !inPool) {
        opts += '<option value="' + U.escapeHtml(preMap) + '" selected>' + U.escapeHtml(preMap) + '</option>';
      }
      opts += pool.map(function (m) {
        var selected = m.name === preMap ? ' selected' : '';
        return '<option value="' + U.escapeHtml(m.name) + '"' + selected + '>' + U.escapeHtml(m.name) + '</option>';
      }).join('');
      sel.innerHTML = opts;
    }

    var animSel = document.getElementById('mm-anim-sel');
    if (animSel) animSel.value = state.mapTransition || 'slot';

    var desc = document.getElementById('map-modal-desc');
    if (desc) {
      desc.textContent = afterFinish
        ? 'Pick the next map. Reveal plays, then overlay switches to game after 10 seconds.'
        : 'Select map. Reveal plays, then game overlay shows after 10 seconds.';
    }

    var title = document.querySelector('#map-modal .modal-title');
    if (title) {
      title.textContent = afterFinish ? '🗺️ PICK NEXT MAP' : '🗺️ PICK MAP';
    }

    var confirmBtn = document.querySelector('#map-modal .btn-pu');
    if (confirmBtn) {
      confirmBtn.textContent = afterFinish ? '🎲 Start Next Game' : '🎲 Play Reveal';
    }

    var modal = document.getElementById('map-modal');
    if (modal) modal.style.display = 'flex';
  }

  /**
   * closeMapModal() → void
   * Hides the map picker modal.
   */
  function closeMapModal() {
    var modal = document.getElementById('map-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * skipMapReveal() → void
   * Sets the selected map without playing the reveal animation —
   * goes straight to game mode.
   */
  function skipMapReveal() {
    var mapName = (document.getElementById('mm-map-sel') || {}).value || '';
    if (!mapName) {
      UI.notify('Pick a map first!');
      return;
    }
    closeMapModal();
    ST.update({
      selectedMap:  mapName,
      mapName:      mapName,
      overlayMode:  'game',
      timerRunning:   false,
      timerOffset:    0,
      timerStartTime: null,
      timerStarted:   false,
    });
    _setIfUnfocused('inp-mapname', mapName);
    _setIfUnfocused('d-mapname',   mapName);
    setOverlayMode('game');
    UI.notify('Map set to ' + mapName + ' — switched to Game overlay');
  }

  /**
   * confirmMapPick() → void
   * Reads the modal's selected map + animation, updates state, switches
   * the overlay to 'map' mode, and schedules a 10-second auto-switch
   * to 'game' mode.
   */
  function confirmMapPick() {
    var mapName  = (document.getElementById('mm-map-sel')  || {}).value || '';
    var animType = (document.getElementById('mm-anim-sel') || {}).value || 'slot';

    if (!mapName) {
      UI.notify('Pick a map first!');
      return;
    }

    closeMapModal();

    // Update state — this triggers the overlay to play the reveal
    ST.update({
      selectedMap:    mapName,
      mapTransition:  animType,
      mapName:        mapName,
      overlayMode:    'map',
    });

    // Sync the mapname field in Match Info
    _setIfUnfocused('inp-mapname', mapName);
    _setIfUnfocused('d-mapname',   mapName);

    setOverlayMode('map');
    UI.notify('Map reveal playing — auto-switches to game in 10s');

    // After 10 seconds, switch to game mode (if still on map screen)
    setTimeout(function () {
      if (ST.get().overlayMode === 'map') {
        ST.update({
          overlayMode:    'game',
          timerRunning:   false,
          timerOffset:    0,
          timerStartTime: null,
          timerStarted:   false,
        });
        setOverlayMode('game');
        UI.notify('Switched to Game overlay');
      }
    }, 10000);
  }

  function saveSelectedMap() {
    var sel = document.getElementById('sel-map-dash');
    if (sel) ST.update({ selectedMap: sel.value });
  }

  function saveMapTransition() {
    var sel = document.getElementById('sel-map-tr');
    if (sel) ST.update({ mapTransition: sel.value });
  }

  function triggerMapReveal() {
    if (!ST.get().selectedMap) {
      UI.notify('Select a map first!');
      return;
    }
    setOverlayMode('map');
  }

  function saveCycleDash() {
    var inp = document.getElementById('inp-cycle-dash');
    if (inp) ST.update({ cycleInterval: parseInt(inp.value) || 8 });
  }


  /* ═══════════════════════════════════════════════════════════════
   * FINISH GAME MODAL
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * openFinishModal() → void
   * Opens the Finish Game modal.
   * Populates the placement ordering from the current active slots.
   */
  function openFinishModal() {
    var state = ST.get();

    /* Build placement order from active slots, PRE-SORTED by the
       placements preselected on the Scores & Stats page (slot.placement).
       Unset teams (placement 0) fall to the bottom in their natural order. */
    _placementOrder = ST.getActiveSlots(state)
      .slice()
      .sort(function (a, b) {
        var pa = a.placement || 999;
        var pb = b.placement || 999;
        return pa - pb;
      })
      .map(function (slot) {
        var team = ST.getTeamById(state, slot.teamId);
        return {
          teamId: slot.teamId,
          name:   team ? team.name : slot.color,
          color:  slot.color,
          score:  slot.score || 0,
        };
      });

    _renderPlacementOrder();
    var modal = document.getElementById('finish-modal');
    if (modal) modal.style.display = 'flex';
  }

  /**
   * closeFinishModal() → void
   * Hides the Finish Game modal.
   */
  function closeFinishModal() {
    var modal = document.getElementById('finish-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * _renderPlacementOrder() → void
   * Builds the draggable placement list inside the Finish Game modal.
   * Supports drag-to-reorder and direct rank number input.
   */
  function _renderPlacementOrder() {
    var el = document.getElementById('fm-placements');
    if (!el) return;

    var rules = ST.get().placementRules || [10, 7, 5, 4, 3, 2, 1, 0];

    el.innerHTML = '<div id="pl-drag-list">' +
      _placementOrder.map(function (team, i) {
        var hex = C.COLORS[team.color] || '#fff';
        var pts = rules[i] || 0;
        return '<div class="place-row" draggable="true" data-pi="' + i + '" style="cursor:grab;border:1px solid rgba(255,255,255,.08);">' +
          '<span style="font-size:14px;color:var(--mut);user-select:none;padding:0 4px;">⠿</span>' +
          '<div style="width:7px;height:7px;border-radius:50%;background:' + hex + ';flex-shrink:0;"></div>' +
          '<input type="number" min="1" max="' + _placementOrder.length + '" value="' + (i + 1) + '" class="pl-rank-inp pr-inp" data-pi="' + i + '" style="width:42px;font-size:11px;padding:3px;" title="Type rank position"/>' +
          '<span style="flex:1;font-weight:700;font-size:11px;">' + U.escapeHtml(team.name) + '</span>' +
          '<span style="font-family:var(--fd);font-size:9px;color:var(--acc2);min-width:32px;text-align:right;">+' + pts + '</span>' +
          '</div>';
      }).join('') +
      '</div>';

    // Attach drag-and-drop reorder
    var dragList = document.getElementById('pl-drag-list');
    var dragSrc  = -1;

    dragList.addEventListener('dragstart', function (e) {
      var row = e.target.closest('.place-row');
      if (!row) return;
      dragSrc = parseInt(row.getAttribute('data-pi'));
      e.dataTransfer.effectAllowed = 'move';
    });

    dragList.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    dragList.addEventListener('drop', function (e) {
      e.preventDefault();
      var row = e.target.closest('.place-row');
      if (!row || dragSrc < 0) return;
      var dst = parseInt(row.getAttribute('data-pi'));
      if (dst === dragSrc) return;
      var tmp = _placementOrder[dragSrc];
      _placementOrder.splice(dragSrc, 1);
      _placementOrder.splice(dst, 0, tmp);
      dragSrc = -1;
      _renderPlacementOrder();
    });

    // Direct rank number input
    dragList.addEventListener('change', function (e) {
      var inp = e.target;
      if (!inp.classList.contains('pl-rank-inp')) return;
      var fromIdx = parseInt(inp.getAttribute('data-pi'));
      var toIdx   = U.clamp((parseInt(inp.value) || 1) - 1, 0, _placementOrder.length - 1);
      if (toIdx === fromIdx) return;
      var tmp = _placementOrder[fromIdx];
      _placementOrder.splice(fromIdx, 1);
      _placementOrder.splice(toIdx, 0, tmp);
      _renderPlacementOrder();
    });
  }

  /**
   * confirmFinishGame() → void
   * Saves the game result:
   *   1. Computes stat + placement points per slot
   *   2. Adds them to each team's totalPoints
   *   3. Appends a game history entry
   *   4. Resets slot scores for the next game
   *   5. Auto-sets winner from 1st place in _placementOrder
   *   6. Increments game number
   *   7. Switches overlay to 'summary'
   *   8. Delays 1.8s then opens map modal for next game
   */
  function confirmFinishGame() {
    var state         = ST.get();
    var placementPts  = state.placementRules || [50, 30, 20, 10, 5, 3, 2, 1];
    var rules         = state.pointRules     || {};
    var playerStats   = state.playerStats    || {};
    var winnerId      = _placementOrder.length > 0 ? _placementOrder[0].teamId : null;

    // Snapshot standings before applying points (for ▲▼ delta)
    var prevRanks = {};
    ST.getStandings(state).forEach(function (t, i) { prevRanks[t.id] = i + 1; });

    /* Per-team Finals/Beds split from this game's player stats. */
    function _teamStatSplit(team) {
      var finals = 0, beds = 0;
      (team ? team.players || [] : []).forEach(function (p) {
        var name = U.getPlayerName(p).trim();
        if (!name) return;
        var s = playerStats[name];
        if (!s) return;
        finals += (s.finals    || 0);
        beds   += (s.bedbreaks || 0);
      });
      return {
        finals:    finals,
        beds:      beds,
        finalsPts: Math.round(finals * (rules.finals    || 0)),
        bedsPts:   Math.round(beds   * (rules.bedbreaks || 0)),
      };
    }

    // Build result array — one entry per active slot
    var gameResults = [];
    (state.slots || []).forEach(function (slot) {
      if (!slot.teamId) return;
      var placeIdx = _placementOrder.findIndex(function (p) { return p.teamId === slot.teamId; });
      var placePts = placeIdx >= 0 ? (placementPts[placeIdx] || 0) : 0;
      var team     = ST.getTeamById(state, slot.teamId);
      var split    = _teamStatSplit(team);
      var statPts  = split.finalsPts + split.bedsPts;
      gameResults.push({
        teamId:    slot.teamId,
        pts:       statPts + placePts,
        statPts:   statPts,
        finalsPts: split.finalsPts,
        bedsPts:   split.bedsPts,
        finals:    split.finals,
        beds:      split.beds,
        placePts:  placePts,
        placement: placeIdx + 1,
        color:     slot.color,
      });
    });

    // Apply points to teams
    var namedTeams = U.deepClone(state.namedTeams || []);
    namedTeams.forEach(function (team) {
      var result = gameResults.find(function (r) { return r.teamId === team.id; });
      team.totalPoints  = (team.totalPoints  || 0) + (result ? result.pts : 0);
      team.gamesPlayed  = (team.gamesPlayed  || 0) + 1;
      team.prevRank     = prevRanks[team.id] || null;
    });

    // Build history entry — store a snapshot of this game's player stats
    var histEntry = {
      gameNumber:  state.gameNumber || 1,
      mapName:     state.mapName    || '',
      playerStats: U.deepClone(playerStats),
      results:     gameResults.map(function (r) {
        var team = namedTeams.find(function (t) { return t.id === r.teamId; });
        return Object.assign({}, r, { teamName: team ? team.name : '?' });
      }),
    };

    var gameHistory = U.deepClone(state.gameHistory || []);
    gameHistory.push(histEntry);

    // Reset slot scores + placements for next game
    var slots = U.deepClone(state.slots || []);
    slots.forEach(function (s) { s.score = 0; s.placement = 0; s.eliminated = false; s.hasBed = true; });

    ST.update({
      namedTeams:       namedTeams,
      gameHistory:      gameHistory,
      lastWinnerTeamId: winnerId,
      slots:            slots,
      playerStats:      {},   // clear current-game stats for the next game
      overlayMode:      'summary',
      timerRunning:     false,
      timerOffset:      0,
      timerStartTime:   null,
      timerStarted:     false,
      gameNumber:       (state.gameNumber || 1) + 1,
    });

    closeFinishModal();
    setOverlayMode('summary');
    _setTimerButtonState(false);

    var winnerName = _placementOrder[0] ? _placementOrder[0].name : '?';
    UI.notify('Game ' + histEntry.gameNumber + ' saved! Winner: ' + winnerName + ' 🏆');

    // Auto-advance queue to next game
    if (window.BWO_GAMESETUP && window.BWO_GAMESETUP.autoAdvanceQueue) {
      window.BWO_GAMESETUP.autoAdvanceQueue();
    }
    // Map is now picked from the "Play Map Reveal" button in the Summary quick actions
  }


  /* ═══════════════════════════════════════════════════════════════
   * HELPER
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * _setIfUnfocused(id, value) → void
   * Sets an element's value only if it is not currently focused.
   * Prevents clobbering a user's in-progress edits.
   *
   * @param {string} id
   * @param {*}      value
   */
  function _setIfUnfocused(id, value) {
    var el = document.getElementById(id);
    if (el && document.activeElement !== el) {
      el.value = value;
    }
  }


  /* ─── Public API ──────────────────────────────────────────────── */
  return Object.freeze({
    // Overlay mode
    setOverlayMode,
    syncOvmButtons:     _syncOvmButtons,
    syncQuickActions:   _syncQuickActions,
    // Timer
    toggleTimer,
    resetTimer,
    startTimerTick,
    toggleStartingTimer,
    resetStartingTimer,
    startStartingTimerTick,
    setTimerButtonState:    _setTimerButtonState,
    setStartingButtonState: _setStartingButtonState,
    // Match info
    saveMatchInfo,
    loadMatchInfo,
    // Dashboard refresh
    updateDashboard,
    // Map modal
    openMapModal,
    closeMapModal,
    confirmMapPick,
    skipMapReveal,
    saveSelectedMap,
    saveMapTransition,
    triggerMapReveal,
    saveCycleDash,
    // Finish game modal
    openFinishModal,
    closeFinishModal,
    confirmFinishGame,
  });

})();
