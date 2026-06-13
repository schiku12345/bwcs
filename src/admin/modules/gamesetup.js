/**
 * gamesetup.js — Admin Game Setup Module
 *
 * Manages the "Game Setup" page.
 * Responsibilities:
 *   • Add / remove / edit colour slots for the current game
 *   • Assign named teams to colour slots
 *   • Toggle per-slot bed status and elimination status
 *   • Import game configuration from CSV (single-game or multi-game)
 *   • Multi-game queue: shows all games with maps, auto-advances on Finish
 *
 * CSV FORMATS SUPPORTED:
 *   Single-game: each row is   COLOR, TEAMNAME
 *   Multi-game:  header row    Game, Map, Red, Blue, Green, ...
 *                data rows     1, AquiLA, TeamA, TeamB, TeamC, ...
 *                (Map column is optional; will pre-fill the map picker)
 *
 * EVENT DELEGATION is used on the slot list container so the list
 * can be rebuilt without re-attaching individual listeners.
 *
 * DEPENDS ON: BWO_STATE, BWO_UTILS, BWO_CONST, BWO_ADMIN_UI
 * EXPORTS: window.BWO_GAMESETUP
 */

'use strict';

window.BWO_GAMESETUP = (function () {

  var ST = window.BWO_STATE;
  var U  = window.BWO_UTILS;
  var C  = window.BWO_CONST;
  var UI = window.BWO_ADMIN_UI;

  /** Auto-increment seed for teams created via CSV import. */
  var _idCounter = Date.now() + 1000;

  /**
   * _canonColor(name) → canonical COLOR_KEYS entry | null
   * Resolves a CSV colour header to its canonical key.
   * Matching is case-insensitive and accepts "Grey" as an alias for "Gray"
   * (CSV exports from spreadsheets commonly use British spelling).
   */
  function _canonColor(name) {
    if (!name) return null;
    var n = String(name).trim().toLowerCase();
    if (n === 'grey') n = 'gray';
    return C.COLOR_KEYS.find(function (k) { return k.toLowerCase() === n; }) || null;
  }


  /* ═══════════════════════════════════════════════════════════════
   * RENDER SLOTS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderSlots(state) → void
   * Rebuilds the colour-slot list from the current state.
   */
  function renderSlots(state) {
    var list = document.getElementById('slot-list');
    if (!list) return;

    var slots = state.slots  || [];
    var teams = state.namedTeams || [];

    if (!slots.length) {
      list.innerHTML = '<p class="help" style="padding:8px 0;">No slots yet. Add a colour above or import a CSV.</p>';
      list.onchange  = null;
      list.onclick   = null;
      return;
    }

    /* Build team <option> string once — shared by every select */
    var teamOptions = '<option value="">— No team —</option>' +
      teams.map(function (t) {
        return '<option value="' + t.id + '">' + U.escapeHtml(t.name) + '</option>';
      }).join('');

    list.innerHTML = slots.map(function (slot, si) {
      return _buildSlotRowHTML(slot, si, teamOptions);
    }).join('');

    /* ── Delegated: onchange (colour select + team select) ── */
    list.onchange = function (ev) {
      var el  = ev.target;
      var si  = parseInt(el.getAttribute('data-si'));
      var st2 = ST.get();
      var slots2 = U.deepClone(st2.slots || []);
      if (!slots2[si]) return;

      if (el.classList.contains('slot-color-sel')) {
        slots2[si].color = el.value;
      }
      if (el.classList.contains('slot-team-sel')) {
        slots2[si].teamId = el.value || null;
      }
      ST.update({ slots: slots2 });
    };

    /* ── Delegated: onclick (bed toggle, elim toggle, delete) ── */
    list.onclick = function (ev) {
      var el     = ev.target;
      var si     = parseInt(el.getAttribute('data-si'));
      var action = el.getAttribute('data-action');
      if (!action) return;

      var slots2 = U.deepClone(ST.get().slots || []);
      if (!slots2[si]) return;

      if (action === 'del') {
        slots2.splice(si, 1);
      } else if (action === 'bed') {
        slots2[si].hasBed = !slots2[si].hasBed;
      } else if (action === 'elim') {
        slots2[si].eliminated = !slots2[si].eliminated;
      }

      ST.update({ slots: slots2 });
    };
  }

  /**
   * _buildSlotRowHTML(slot, si, teamOptions) → string
   */
  function _buildSlotRowHTML(slot, si, teamOptions) {
    var hex = C.COLORS[slot.color] || '#888';

    var colorOptions = C.COLOR_KEYS.map(function (col) {
      var sel = col === slot.color ? ' selected' : '';
      return '<option value="' + col + '"' + sel + '>' + col + '</option>';
    }).join('');

    var myTeamOpts = teamOptions.replace(
      'value="' + (slot.teamId || '') + '"',
      'value="' + (slot.teamId || '') + '" selected'
    );

    var bedClass   = slot.hasBed !== false ? 'bed-ok'  : 'bed-gone';
    var bedLabel   = slot.hasBed !== false ? '🛏 Bed'  : '💔 Gone';
    var elimClass  = slot.eliminated       ? 'dead-t'  : 'alive';
    var elimLabel  = slot.eliminated       ? '☠ Elim'  : '✓ Alive';

    return '<div class="slot-row">' +
      '<div class="slot-dot" style="background:' + hex + ';flex-shrink:0;"></div>' +
      '<select class="slot-color-sel" data-si="' + si + '"' +
        ' style="width:80px;background:#fff;color:#111;border:1px solid var(--bor);' +
        'border-radius:4px;font-family:var(--fd);font-size:9px;padding:4px;outline:none;">' +
        colorOptions +
      '</select>' +
      '<select class="slot-team-sel" data-si="' + si + '">' +
        myTeamOpts +
      '</select>' +
      '<div style="display:flex;gap:4px;flex-shrink:0;">' +
        '<span class="tbadge ' + bedClass  + '" data-si="' + si + '" data-action="bed">'  + bedLabel  + '</span>' +
        '<span class="tbadge ' + elimClass + '" data-si="' + si + '" data-action="elim">' + elimLabel + '</span>' +
      '</div>' +
      '<button class="btn btn-d btn-sm btn-ic" data-si="' + si + '" data-action="del">✕</button>' +
    '</div>';
  }


  /* ═══════════════════════════════════════════════════════════════
   * SLOT MUTATIONS
   * ═══════════════════════════════════════════════════════════════ */

  function addSlot() {
    var state = ST.get();
    var slots = U.deepClone(state.slots || []);
    var used  = slots.map(function (s) { return s.color; });
    var avail = C.COLOR_KEYS.filter(function (c) { return !used.includes(c); });

    if (!avail.length) {
      UI.notify('All 8 colours are in use');
      return;
    }

    slots.push(ST.mkSlot(avail[0]));
    ST.update({ slots: slots });
  }

  function clearSlots() {
    ST.update({ slots: [] });
    UI.notify('Slots cleared');
  }


  /* ═══════════════════════════════════════════════════════════════
   * GAME QUEUE UI
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderQueue(state) → void
   * Renders the game queue panel showing all queued games.
   * The active game (current gameNumber) is highlighted.
   */
  function renderQueue(state) {
    var container = document.getElementById('game-queue-list');
    if (!container) return;

    var queue = state._multiGameCSV || [];

    if (!queue.length) {
      container.innerHTML = '<p class="help" style="padding:6px 0;font-size:10px;">No queue loaded. Import a multi-game CSV or add games manually.</p>';
      return;
    }

    var currentNum = state.gameNumber || 1;

    container.innerHTML = queue.map(function (game, idx) {
      var isActive = game.gameNumber === currentNum;
      var slotNames = game.slots.map(function (slot, si) {
        var team = ST.getTeamById(state, slot.teamId);
        var hex  = C.COLORS[slot.color] || '#888';
        var colorOpts = C.COLOR_KEYS.map(function (col) {
          return '<option value="' + col + '"' + (col === slot.color ? ' selected' : '') + '>' + col + '</option>';
        }).join('');
        return '<span style="display:inline-flex;align-items:center;gap:3px;margin:0 6px 3px 0;">' +
          '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + hex + ';flex-shrink:0;"></span>' +
          '<select class="q-color-sel" data-qi="' + idx + '" data-si="' + si + '" title="Bed colour for this game" ' +
            'style="background:#fff;color:#111;border:1px solid var(--bor);border-radius:3px;font-family:var(--fd);font-size:8px;padding:1px 3px;outline:none;cursor:pointer;">' +
            colorOpts +
          '</select>' +
          '<span style="font-size:9px;color:var(--txt);">' + U.escapeHtml(team ? team.name : slot.color) + '</span>' +
        '</span>';
      }).join('');

      var mapBadge = game.mapName
        ? '<span style="font-size:9px;color:var(--acc2);margin-left:4px;font-weight:700;">📍 ' + U.escapeHtml(game.mapName) + '</span>'
        : '';

      var activeStyle = isActive
        ? 'border-color:var(--acc);background:rgba(68,136,255,.08);'
        : '';

      return '<div class="queue-row" style="' + activeStyle + '" data-qi="' + idx + '">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
          '<span style="font-family:var(--fd);font-size:9px;font-weight:900;color:' + (isActive ? 'var(--acc)' : 'var(--mut)') + ';">' +
            'G' + game.gameNumber + (isActive ? ' ◀ CURRENT' : '') +
          '</span>' +
          mapBadge +
          '<div style="flex:1;"></div>' +
          (isActive ? '' :
            '<button class="btn btn-g btn-sm" style="font-size:8px;padding:2px 7px;" data-qi="' + idx + '" data-action="load-game">Load</button>') +
          '<button class="btn btn-d btn-sm" style="font-size:8px;padding:2px 7px;" data-qi="' + idx + '" data-action="del-game">✕</button>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:2px;">' + slotNames + '</div>' +
      '</div>';
    }).join('');

    /* Delegated click */
    container.onclick = function (ev) {
      var btn = ev.target.closest('[data-action]');
      if (!btn) return;
      var qi     = parseInt(btn.getAttribute('data-qi'));
      var action = btn.getAttribute('data-action');

      if (action === 'load-game') {
        _loadQueueGame(qi);
      } else if (action === 'del-game') {
        _deleteQueueGame(qi);
      }
    };

    /* Delegated change — per-game bed-colour edit (q-color-sel).
       Lets each queued game carry its OWN colour→team mapping so the
       scoreboard recolours when autoAdvanceQueue() loads it on Finish. */
    container.onchange = function (ev) {
      var sel = ev.target;
      if (!sel.classList || !sel.classList.contains('q-color-sel')) return;
      var qi = parseInt(sel.getAttribute('data-qi'));
      var si = parseInt(sel.getAttribute('data-si'));
      var queue = U.deepClone(ST.get()._multiGameCSV || []);
      if (!queue[qi] || !queue[qi].slots || !queue[qi].slots[si]) return;

      queue[qi].slots[si].color = sel.value;

      var patch = { _multiGameCSV: queue };
      // If this row IS the active game, mirror the colour into live slots now
      if (queue[qi].gameNumber === (ST.get().gameNumber || 1)) {
        patch.slots = U.deepClone(queue[qi].slots);
      }
      ST.update(patch);
    };
  }

  /**
   * _loadQueueGame(qi) → void
   * Loads a queued game by index into the active slots and game number.
   */
  function _loadQueueGame(qi) {
    var state = ST.get();
    var queue = U.deepClone(state._multiGameCSV || []);
    if (!queue[qi]) return;

    var game = queue[qi];
    var update = {
      slots:      game.slots,
      gameNumber: game.gameNumber,
    };
    if (game.mapName) {
      update.selectedMap = game.mapName;
      update.mapName     = game.mapName;
    }
    ST.update(update);
    UI.notify('Loaded Game ' + game.gameNumber);
  }

  /**
   * _deleteQueueGame(qi) → void
   * Removes a game from the queue.
   */
  function _deleteQueueGame(qi) {
    var state = ST.get();
    var queue = U.deepClone(state._multiGameCSV || []);
    queue.splice(qi, 1);
    ST.update({ _multiGameCSV: queue });
    UI.notify('Game removed from queue');
  }

  /**
   * addQueueGame() → void
   * Adds a new blank game to the queue based on current slots.
   */
  function addQueueGame() {
    var state = ST.get();
    var queue = U.deepClone(state._multiGameCSV || []);
    var nextNum = queue.length > 0
      ? Math.max.apply(null, queue.map(function (g) { return g.gameNumber; })) + 1
      : (state.gameNumber || 1) + 1;

    var mapInp = document.getElementById('queue-add-map');
    var mapName = mapInp ? mapInp.value.trim() : '';

    queue.push({
      gameNumber: nextNum,
      mapName:    mapName,
      slots:      U.deepClone(state.slots || []),
    });
    ST.update({ _multiGameCSV: queue });
    if (mapInp) mapInp.value = '';
    UI.notify('Game ' + nextNum + ' added to queue');
  }

  /**
   * _applyQueueGame(game) → void
   * Loads a setup game's colour→team mapping (and map) into the LIVE game.
   * Deep-clones so live edits never mutate the stored queue entry, and
   * resets per-game transient fields (score/placement/bed/elim).
   */
  function _applyQueueGame(game) {
    if (!game || !game.slots) return;
    var fresh = U.deepClone(game.slots).map(function (s) {
      s.score = 0; s.placement = 0; s.eliminated = false; s.hasBed = true;
      return s;
    });
    var update = { slots: fresh };
    if (game.mapName) {
      update.selectedMap = game.mapName;
      update.mapName     = game.mapName;
    }
    ST.update(update);
  }

  /**
   * _findQueueGame(queue, gameNumber) → game | null
   * Finds the setup game for a game number, with a positional fallback
   * when the numbers aren't a clean sequential match.
   */
  function _findQueueGame(queue, gameNumber) {
    var game = queue.find(function (g) { return g.gameNumber === gameNumber; });
    if (game) return game;
    var prevIdx = queue.findIndex(function (g) { return g.gameNumber === gameNumber - 1; });
    if (prevIdx >= 0 && prevIdx + 1 < queue.length) return queue[prevIdx + 1];
    return null;
  }

  /**
   * autoAdvanceQueue() → void
   * Explicitly loads the queued game matching the current game number.
   * Routine game starts are handled by maybeApplyQueueColors() via the
   * state subscriber; this stays for manual/legacy callers.
   */
  function autoAdvanceQueue() {
    var state = ST.get();
    var queue = state._multiGameCSV || [];
    if (!queue.length) return;
    var nextGame = _findQueueGame(queue, state.gameNumber || 1);
    if (nextGame) {
      _applyQueueGame(nextGame);
      UI.notify('Queue: loaded Game ' + nextGame.gameNumber + (nextGame.mapName ? ' — ' + nextGame.mapName : ''));
    }
  }

  /**
   * maybeApplyQueueColors(state) → boolean
   * Subscriber hook. Whenever the game NUMBER changes (a new game starts),
   * switch the live slot colours to that game's setup mapping so the
   * scoreboard, standings, and scoring tab all recolour. Returns true if it
   * applied a change (the caller can stop — the nested update re-rendered).
   *
   * A baseline is established on the first call (boot) so the current game's
   * colours are never clobbered just because the admin loaded.
   */
  var _lastGameNum = null;
  function maybeApplyQueueColors(state) {
    var gn = state.gameNumber || 1;
    if (_lastGameNum === null) { _lastGameNum = gn; return false; }  // baseline only
    if (gn === _lastGameNum) return false;
    _lastGameNum = gn;

    var queue = state._multiGameCSV || [];
    if (!queue.length) return false;
    var game = _findQueueGame(queue, gn);
    if (!game || !game.slots || !game.slots.length) return false;

    /* Skip if the live slots already carry this game's colour→team map */
    var cur  = state.slots || [];
    var same = cur.length === game.slots.length && game.slots.every(function (gs, i) {
      return cur[i] && cur[i].teamId === gs.teamId && cur[i].color === gs.color;
    });
    if (same) return false;

    _applyQueueGame(game);
    UI.notify('Game ' + gn + ' colours loaded from setup');
    return true;
  }


  /* ═══════════════════════════════════════════════════════════════
   * CSV IMPORT
   * ═══════════════════════════════════════════════════════════════ */

  function handleGameCSVFile(inputElement) {
    var file = inputElement.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) { parseGameCSV(e.target.result); };
    reader.readAsText(file);
    inputElement.value = '';
  }

  /**
   * parseGameCSV(text) → void
   * Detects format and delegates.
   *
   * SINGLE-GAME:  COLOR, TEAMNAME
   * MULTI-GAME:   Game, [Map,] Red, Blue, ...  (header)
   *               1, AquilA, TeamA, TeamB, ...  (data rows)
   */
  function parseGameCSV(text) {
    var rows = U.parseCSVText(text);
    if (!rows.length) return;

    var firstCell = rows[0][0] || '';
    var isMulti   = /^game/i.test(firstCell);

    if (isMulti) {
      _parseMultiGameCSV(rows);
    } else {
      _parseSingleGameCSV(rows);
    }
  }

  function _parseSingleGameCSV(rows) {
    var state = ST.get();
    var teams = U.deepClone(state.namedTeams || []);
    var slots = [];

    rows.forEach(function (cols) {
      var color    = _canonColor(cols[0]);
      var teamName = cols[1] || '';

      if (!color) return;

      var team = _findOrCreateTeam(teams, teamName);
      var slot = ST.mkSlot(color);
      slot.teamId = team ? team.id : null;
      slots.push(slot);
    });

    ST.update({ namedTeams: teams, slots: slots });
    UI.notify('Single-game CSV: ' + slots.length + ' slot' + (slots.length !== 1 ? 's' : '') + ' loaded');
  }

  /**
   * _parseMultiGameCSV(rows) → void
   * Header: Game, [Map,] Red, Blue, Green, ...
   * Data:   1, [Aquila,] TeamA, TeamB, TeamC, ...
   *
   * Map column is detected if the second column header is not a known color key.
   */
  function _parseMultiGameCSV(rows) {
    var header    = rows[0];           // ["Game", "Map"?, "Red", "Blue", ...]
    var col2      = (header[1] || '').trim();
    var hasMapCol = col2 && !_canonColor(col2);

    var colorStart = hasMapCol ? 2 : 1;
    var colorCols  = header.slice(colorStart);  // ["Red", "Blue", ...]

    var state    = ST.get();
    var teams    = U.deepClone(state.namedTeams || []);
    var allGames = [];

    rows.slice(1).forEach(function (cols) {
      var gameNum = parseInt(cols[0]) || allGames.length + 1;
      var mapName = hasMapCol ? (cols[1] || '').trim() : '';
      var slots   = [];

      colorCols.forEach(function (color, ci) {
        var colIdx   = colorStart + ci;
        var teamName = (cols[colIdx] || '').trim();
        var colorKey = _canonColor(color);
        if (!teamName || !colorKey) return;

        var team = _findOrCreateTeam(teams, teamName);
        var slot = ST.mkSlot(colorKey);
        slot.teamId = team ? team.id : null;
        slots.push(slot);
      });

      allGames.push({ gameNumber: gameNum, mapName: mapName, slots: slots });
    });

    if (!allGames.length) {
      UI.notify('No game data found in CSV');
      return;
    }

    /* Apply first game immediately */
    var first  = allGames[0];
    var update = {
      namedTeams:    teams,
      slots:         first.slots,
      gameNumber:    first.gameNumber,
      _multiGameCSV: allGames,
    };
    if (first.mapName) {
      update.selectedMap = first.mapName;
      update.mapName     = first.mapName;
    }
    ST.update(update);

    UI.notify('Multi-game CSV: ' + allGames.length + ' game' + (allGames.length !== 1 ? 's' : '') + ' queued. Showing game ' + first.gameNumber);
  }

  function _findOrCreateTeam(teams, name) {
    if (!name) return null;

    var existing = teams.find(function (t) {
      return t.name.toLowerCase() === name.toLowerCase();
    });

    if (existing) return existing;

    var newTeam = ST.mkTeam('nt' + (++_idCounter), name);
    teams.push(newTeam);
    return newTeam;
  }

  function clearQueue() {
    ST.update({ _multiGameCSV: [] });
    UI.notify('Queue cleared');
  }


  /* ─── Public API ──────────────────────────────────────────────── */
  return Object.freeze({
    renderSlots,
    addSlot,
    clearSlots,
    handleGameCSVFile,
    parseGameCSV,
    renderQueue,
    addQueueGame,
    autoAdvanceQueue,
    maybeApplyQueueColors,
    clearQueue,
  });

})();
