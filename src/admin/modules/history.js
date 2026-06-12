/**
 * history.js — Admin History Module
 *
 * Manages the "History" page in the admin panel.
 * Responsibilities:
 *   • Render current tournament standings preview
 *   • Render the game-history contribution table
 *     (teams as rows, games as columns, points per cell)
 *   • Click a game column header to open the inline game editor
 *   • Inline game editor: edit map name, placement order (drag),
 *     stat pts, placement pts, and per-player stats
 *   • Save edits — recalculates all team totals from scratch
 *   • Delete a game from history
 *   • Reset the entire tournament
 *
 * DEPENDS ON: BWO_STATE, BWO_UTILS, BWO_CONST, BWO_ADMIN_UI
 * EXPORTS: window.BWO_HISTORY
 */

'use strict';

window.BWO_HISTORY = (function () {

  var ST = window.BWO_STATE;
  var U  = window.BWO_UTILS;
  var C  = window.BWO_CONST;
  var UI = window.BWO_ADMIN_UI;

  /** Index of the game currently being edited (-1 = none). */
  var _editIdx = -1;

  /** Sorted result order for the current edit (used for drag reorder). */
  var _editSortedResults = [];


  /* ═══════════════════════════════════════════════════════════════
   * STANDINGS PREVIEW
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderStandings(state) → void
   * Renders two sections:
   *   1. Quick standings list (rank, colour dot, name, total pts, delta)
   *   2. Per-game contribution table (teams × games grid)
   *
   * @param {object} state - Current global state
   */
  function renderStandings(state) {
    _renderStandingsList(state);
    _renderContributionTable(state);
  }

  /**
   * _renderStandingsList(state) → void
   * Renders the compact standings list at the top of the History page.
   */
  function _renderStandingsList(state) {
    var el = document.getElementById('standings-preview');
    if (!el) return;

    var standings = ST.getStandings(state);

    if (!standings.length) {
      el.innerHTML = '<p class="help">No teams yet.</p>';
      return;
    }

    el.innerHTML = standings.map(function (team, i) {
      /* Find the team's current-game slot colour, if any */
      var slot  = (state.slots || []).find(function (s) { return s.teamId === team.id; });
      var hex   = slot ? (C.COLORS[slot.color] || '#888') : '#888';
      var delta = team.prevRank != null ? team.prevRank - (i + 1) : null;

      var deltaHTML =
        delta === null          ? '<span style="color:var(--mut)">—</span>' :
        delta  >  0            ? '<span style="color:var(--grn)">▲' + delta + '</span>' :
        delta  <  0            ? '<span style="color:var(--red)">▼' + Math.abs(delta) + '</span>' :
                                 '<span style="color:var(--mut)">—</span>';

      return '<div class="std-prev-row">' +
        '<span style="font-family:var(--fd);font-size:11px;font-weight:900;min-width:22px;color:rgba(255,255,255,.4);">' + (i + 1) + '</span>' +
        '<div style="width:8px;height:8px;border-radius:50%;background:' + hex + ';flex-shrink:0;"></div>' +
        '<span style="flex:1;font-weight:700;color:' + hex + '">' + U.escapeHtml(team.name) + '</span>' +
        '<span style="font-family:var(--fd);font-size:12px;font-weight:900;">' + team.totalPoints + '</span>' +
        deltaHTML +
      '</div>';
    }).join('');
  }

  /**
   * _renderContributionTable(state) → void
   * Renders the grid table showing how many points each team earned per game.
   * Columns = games, rows = teams (sorted by standings).
   * Clicking a game column header opens the inline editor for that game.
   */
  function _renderContributionTable(state) {
    var tbl      = document.getElementById('hist-contribution-table');
    if (!tbl) return;

    var history   = state.gameHistory || [];
    var standings = ST.getStandings(state);

    if (!history.length || !standings.length) {
      tbl.innerHTML = '<p class="help">No games finished yet. Complete a game using Finish Game on the Dashboard.</p>';
      return;
    }

    /* Column header — one <th> per game, clickable to open editor */
    var headerCols = history.map(function (game, gi) {
      return '<th style="text-align:center;padding:5px 6px;font-family:var(--fd);' +
        'font-size:8px;letter-spacing:1px;color:var(--mut);white-space:nowrap;' +
        'border-bottom:1px solid var(--bor);cursor:pointer;" ' +
        'onclick="BWO_HISTORY.openGameEditor(' + gi + ')" ' +
        'title="Click to edit game ' + game.gameNumber + '">' +
        'G' + game.gameNumber +
        (game.mapName ? '<br/><span style="font-size:7px;opacity:.5;">' + U.escapeHtml(game.mapName) + '</span>' : '') +
      '</th>';
    }).join('');

    /* Data rows — one <tr> per team */
    var dataRows = standings.map(function (team) {
      var slot = (state.slots || []).find(function (s) { return s.teamId === team.id; });
      var hex  = slot ? (C.COLORS[slot.color] || '#aaa') : '#aaa';

      var gameCells = history.map(function (game) {
        var result    = (game.results || []).find(function (r) { return r.teamId === team.id; });
        var pts       = result ? result.pts : null;
        var isWinner  = result && result.placement === 1;

        return '<td style="text-align:center;padding:5px 6px;font-family:var(--fd);font-weight:900;' +
          (pts > 0 ? 'color:var(--acc2);' : 'color:rgba(255,255,255,.2);') +
          (isWinner ? 'background:rgba(255,224,51,.08);border-radius:4px;' : '') +
          'border-bottom:1px solid rgba(255,255,255,.04);">' +
          (pts != null ? (pts > 0 ? '+' + pts : '0') : '—') +
          (isWinner ? '<span style="font-size:8px;color:var(--ylw);display:block;">🏆</span>' : '') +
        '</td>';
      }).join('');

      return '<tr>' +
        '<td style="padding:5px 8px;font-weight:700;color:' + hex + ';white-space:nowrap;' +
          'border-bottom:1px solid rgba(255,255,255,.04);">' +
          '<div style="display:flex;align-items:center;gap:5px;">' +
            '<div style="width:6px;height:6px;border-radius:50%;background:' + hex + ';flex-shrink:0;"></div>' +
            U.escapeHtml(team.name) +
          '</div>' +
        '</td>' +
        gameCells +
        '<td style="text-align:center;padding:5px 8px;font-family:var(--fd);font-size:14px;' +
          'font-weight:900;color:#fff;border-bottom:1px solid rgba(255,255,255,.04);">' +
          team.totalPoints +
        '</td>' +
      '</tr>';
    }).join('');

    tbl.innerHTML =
      '<div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:5px 8px;font-family:var(--fd);font-size:8px;' +
              'letter-spacing:1px;color:var(--mut);border-bottom:1px solid var(--bor);">TEAM</th>' +
            headerCols +
            '<th style="text-align:center;padding:5px 8px;font-family:var(--fd);font-size:8px;' +
              'letter-spacing:1px;color:var(--acc2);border-bottom:1px solid var(--bor);">TOTAL</th>' +
          '</tr></thead>' +
          '<tbody>' + dataRows + '</tbody>' +
        '</table>' +
      '</div>';
  }


  /* ═══════════════════════════════════════════════════════════════
   * INLINE GAME EDITOR
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * openGameEditor(gameIndex) → void
   * Opens the inline editor for the game at gameIndex in gameHistory.
   * Populates map name, per-team stat/placement inputs, and player stats.
   *
   * @param {number} gameIndex - Index in state.gameHistory
   */
  function openGameEditor(gameIndex) {
    _editIdx = gameIndex;

    var state = ST.get();
    var game  = (state.gameHistory || [])[gameIndex];
    if (!game) return;

    /* Show editor panel */
    var editor = document.getElementById('hist-editor');
    if (!editor) return;
    editor.style.display = 'block';

    /* Game number label */
    var numEl = document.getElementById('he-num');
    if (numEl) numEl.textContent = game.gameNumber;

    /* Map name input */
    var mapInp = document.getElementById('he-map');
    if (mapInp) mapInp.value = game.mapName || '';

    /* Sort results by placement for display */
    _editSortedResults = (game.results || []).slice().sort(function (a, b) {
      return (a.placement || 99) - (b.placement || 99);
    });

    _renderEditorRows(state);

    editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * _renderEditorRows(state) → void
   * Builds the draggable result rows inside the history editor.
   * Each row shows: team name, stat pts input, place pts input, total, player stats.
   */
  function _renderEditorRows(state) {
    var rowsEl = document.getElementById('he-rows');
    if (!rowsEl) return;

    var rules = state.pointRules || {};

    rowsEl.innerHTML =
      '<div style="font-size:8px;color:var(--mut);font-weight:700;letter-spacing:1px;margin-bottom:6px;">' +
        'PLACEMENTS, STATS &amp; POINTS — drag ⠿ to reorder placement' +
      '</div>' +
      '<div id="he-drag-list">' +
        _editSortedResults.map(function (result, ri) {
          return _buildEditorRowHTML(result, ri, state, rules);
        }).join('') +
      '</div>';

    /* Attach drag-to-reorder on the drag list */
    var dragList  = document.getElementById('he-drag-list');
    var dragSrc   = -1;

    dragList.addEventListener('dragstart', function (e) {
      var row = e.target.closest('[data-ri]');
      if (!row) return;
      dragSrc = parseInt(row.getAttribute('data-ri'));
      e.dataTransfer.effectAllowed = 'move';
    });

    dragList.addEventListener('dragover', function (e) { e.preventDefault(); });

    dragList.addEventListener('drop', function (e) {
      e.preventDefault();
      var row = e.target.closest('[data-ri]');
      if (!row || dragSrc < 0) return;
      var dst = parseInt(row.getAttribute('data-ri'));
      if (dst === dragSrc) return;
      var tmp = _editSortedResults[dragSrc];
      _editSortedResults.splice(dragSrc, 1);
      _editSortedResults.splice(dst, 0, tmp);
      dragSrc = -1;
      _renderEditorRows(state);
    });

    /* Live total recalculation when stat/place pts change */
    rowsEl.oninput = function (ev) {
      var el = ev.target;
      if (el.classList.contains('he-pts-inp') || el.classList.contains('he-plc-inp')) {
        var ri    = parseInt(el.getAttribute('data-ri'));
        var stat  = parseFloat(document.getElementById('he-stat-'   + ri)    .value) || 0;
        var place = parseFloat(document.getElementById('he-plcpts-' + ri)    .value) || 0;
        var tot   = document.getElementById('he-total-' + ri);
        if (tot) tot.textContent = stat + place;
      }
    };
  }

  /**
   * _buildEditorRowHTML(result, ri, state, rules) → string
   * Builds one draggable row for the editor.
   *
   * @param {object} result - Game result object { teamId, teamName, color, pts, statPts, placePts, placement }
   * @param {number} ri     - Row index in _editSortedResults
   * @param {object} state
   * @param {object} rules  - Point rules
   * @returns {string}
   */
  function _buildEditorRowHTML(result, ri, state, rules) {
    var hex   = C.COLORS[result.color] || '#888';
    var team  = ST.getTeamById(state, result.teamId);
    var players = team
      ? (team.players || []).filter(function (p) { return U.getPlayerName(p).trim(); })
      : [];

    /* Per-player stat inputs */
    var playerInputsHTML = players.length
      ? '<div style="padding:4px 0 0 20px;display:flex;flex-wrap:wrap;gap:4px;">' +
          players.map(function (p) {
            var name = U.getPlayerName(p);
            var ps   = (state.playerStats || {})[name] || {};
            return '<div style="display:flex;gap:4px;align-items:center;background:rgba(255,255,255,.04);border-radius:4px;padding:3px 6px;">' +
              '<span style="font-size:9px;color:rgba(255,255,255,.5);min-width:50px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + U.escapeHtml(name) + '</span>' +
              '<span style="font-size:8px;color:var(--mut);">K</span>'  + '<input type="number" min="0" value="' + (ps.kills     || 0) + '" class="he-stat-inp pr-inp" style="width:38px;font-size:10px;padding:2px;" data-name="' + U.escapeHtml(name) + '" data-key="kills"/>' +
              '<span style="font-size:8px;color:var(--mut);">D</span>'  + '<input type="number" min="0" value="' + (ps.deaths    || 0) + '" class="he-stat-inp pr-inp" style="width:38px;font-size:10px;padding:2px;" data-name="' + U.escapeHtml(name) + '" data-key="deaths"/>' +
              '<span style="font-size:8px;color:var(--mut);">FK</span>' + '<input type="number" min="0" value="' + (ps.finals    || 0) + '" class="he-stat-inp pr-inp" style="width:38px;font-size:10px;padding:2px;" data-name="' + U.escapeHtml(name) + '" data-key="finals"/>' +
              '<span style="font-size:8px;color:var(--mut);">BB</span>' + '<input type="number" min="0" value="' + (ps.bedbreaks || 0) + '" class="he-stat-inp pr-inp" style="width:38px;font-size:10px;padding:2px;" data-name="' + U.escapeHtml(name) + '" data-key="bedbreaks"/>' +
            '</div>';
          }).join('') +
        '</div>'
      : '';

    return '<div class="hist-edit-row" draggable="true" data-ri="' + ri + '" data-teamid="' + result.teamId + '"' +
      ' style="flex-direction:column;align-items:stretch;gap:4px;cursor:grab;' +
      'border:1px solid rgba(255,255,255,.07);border-radius:7px;' +
      'background:rgba(255,255,255,.03);padding:7px 8px;margin-bottom:5px;">' +

      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="color:var(--mut);font-size:14px;user-select:none;">⠿</span>' +
        '<div style="width:9px;height:9px;border-radius:50%;background:' + hex + ';flex-shrink:0;"></div>' +
        '<span style="flex:1;font-weight:700;font-size:12px;color:' + hex + '">' + U.escapeHtml(result.teamName) + '</span>' +
        '<div style="display:flex;gap:4px;align-items:center;"><span style="font-size:8px;color:var(--mut);">STAT PTS</span>' +
        '<input type="number" value="' + (result.statPts  || 0) + '" class="pr-inp he-pts-inp" style="width:50px;" data-ri="' + ri + '" id="he-stat-'   + ri + '"/></div>' +
        '<div style="display:flex;gap:4px;align-items:center;"><span style="font-size:8px;color:var(--mut);">PLACE PTS</span>' +
        '<input type="number" value="' + (result.placePts || 0) + '" class="pr-inp he-plc-inp" style="width:50px;" data-ri="' + ri + '" id="he-plcpts-' + ri + '"/></div>' +
        '<div style="text-align:right;min-width:44px;border-left:1px solid rgba(255,255,255,.08);padding-left:8px;">' +
          '<div class="he-total" style="font-family:var(--fd);font-size:14px;font-weight:900;" id="he-total-' + ri + '">' + (result.pts || 0) + '</div>' +
          '<div style="font-size:8px;color:var(--mut);">total</div>' +
        '</div>' +
      '</div>' +

      playerInputsHTML +
    '</div>';
  }

  /**
   * cancelGameEditor() → void
   * Hides the inline editor and clears the edit index.
   */
  function cancelGameEditor() {
    _editIdx            = -1;
    _editSortedResults  = [];
    var editor = document.getElementById('hist-editor');
    if (editor) editor.style.display = 'none';
  }

  /**
   * saveGameEdit() → void
   * Reads the current editor values, updates the game history entry,
   * updates player stats, and recalculates all team totals from scratch.
   */
  function saveGameEdit() {
    if (_editIdx < 0) return;

    var state   = ST.get();
    var history = U.deepClone(state.gameHistory || []);
    var game    = history[_editIdx];
    if (!game) return;

    /* Update map name */
    var mapInp = document.getElementById('he-map');
    if (mapInp) game.mapName = mapInp.value;

    /* Collect new player stats from inputs */
    var newStats = U.deepClone(state.playerStats || {});
    var rules    = state.pointRules || {};

    document.querySelectorAll('.he-stat-inp').forEach(function (inp) {
      var name = inp.getAttribute('data-name');
      var key  = inp.getAttribute('data-key');
      if (!name || !key) return;
      if (!newStats[name]) newStats[name] = { kills: 0, deaths: 0, finals: 0, bedbreaks: 0, points: 0 };
      newStats[name][key] = parseInt(inp.value) || 0;
    });

    /* Recalculate player point totals */
    Object.keys(newStats).forEach(function (name) {
      var s = newStats[name];
      s.points = Math.max(0, Math.round(
        (s.kills     || 0) * (rules.kills     || 0) +
        (s.deaths    || 0) * (rules.deaths    || 0) +
        (s.finals    || 0) * (rules.finals    || 0) +
        (s.bedbreaks || 0) * (rules.bedbreaks || 0)
      ));
    });

    /* Update game results from editor rows */
    var sortedIds = _editSortedResults.map(function (r) { return r.teamId; });

    game.results = game.results.map(function (r) {
      var ri     = sortedIds.indexOf(r.teamId);
      var stat   = parseFloat((document.getElementById('he-stat-'   + ri) || { value: r.statPts  || 0 }).value) || 0;
      var place  = parseFloat((document.getElementById('he-plcpts-' + ri) || { value: r.placePts || 0 }).value) || 0;
      var placement = ri >= 0 ? ri + 1 : (r.placement || 1);
      return Object.assign({}, r, { pts: stat + place, statPts: stat, placePts: place, placement });
    });

    /* Recompute team totals from entire history */
    var teams = U.deepClone(state.namedTeams || []);
    teams.forEach(function (t) { t.totalPoints = 0; t.gamesPlayed = 0; });
    history.forEach(function (g) {
      (g.results || []).forEach(function (r) {
        var team = teams.find(function (t) { return t.id === r.teamId; });
        if (team) {
          team.totalPoints = (team.totalPoints || 0) + r.pts;
          team.gamesPlayed = (team.gamesPlayed || 0) + 1;
        }
      });
    });

    ST.update({ gameHistory: history, namedTeams: teams, playerStats: newStats });
    cancelGameEditor();
    UI.notify('Game ' + game.gameNumber + ' updated!');
  }

  /**
   * deleteGame() → void
   * Removes the currently-edited game from history and recalculates totals.
   */
  function deleteGame() {
    if (_editIdx < 0) return;
    if (!confirm('Delete this game? Team totals will be recalculated.')) return;

    var state   = ST.get();
    var history = U.deepClone(state.gameHistory || []);
    var gameNum = (history[_editIdx] || {}).gameNumber || '?';
    history.splice(_editIdx, 1);

    var teams = U.deepClone(state.namedTeams || []);
    teams.forEach(function (t) { t.totalPoints = 0; t.gamesPlayed = 0; });
    history.forEach(function (g) {
      (g.results || []).forEach(function (r) {
        var team = teams.find(function (t) { return t.id === r.teamId; });
        if (team) {
          team.totalPoints = (team.totalPoints || 0) + r.pts;
          team.gamesPlayed = (team.gamesPlayed || 0) + 1;
        }
      });
    });

    ST.update({ gameHistory: history, namedTeams: teams });
    cancelGameEditor();
    UI.notify('Game ' + gameNum + ' deleted. Totals recalculated.');
  }

  /**
   * resetTournament() → void
   * Resets all team points, game history, and winner to defaults.
   * Called after user confirmation.
   */
  function resetTournament() {
    var state = ST.get();
    var teams = U.deepClone(state.namedTeams || []);
    teams.forEach(function (t) {
      t.totalPoints = 0;
      t.gamesPlayed = 0;
      t.prevRank    = null;
    });
    ST.update({ namedTeams: teams, gameHistory: [], lastWinnerTeamId: null, gameNumber: 1 });
    UI.notify('Tournament reset');
  }


  /* ─── Public API ──────────────────────────────────────────────── */
  return Object.freeze({
    renderStandings,
    openGameEditor,
    cancelGameEditor,
    saveGameEdit,
    deleteGame,
    resetTournament,
  });

})();
