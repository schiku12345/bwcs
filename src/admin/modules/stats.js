/**
 * stats.js — Admin Scores & Stats Module
 *
 * Manages the "Scores & Stats" page. Rebuilt around a spreadsheet-style
 * workflow that mirrors the tournament TSV:
 *
 *   1. THIS GAME — Scoring
 *      A per-team table. Enter each player's Finals (final kills) and
 *      Beds (beds broken), and pick each team's placement (Win / 2nd / …).
 *      The chosen placements carry straight into Finish Game.
 *
 *   2. TOTAL STATS — cumulative Finals/Beds per player across all
 *      finished games, plus per-team placement counts.
 *
 *   3. TOTAL POINTS — per-team points breakdown (Finals pts, Beds pts,
 *      Placement pts, TOTAL) — matches the live standings.
 *
 * Kills and deaths are NOT tracked — only final kills and bed breaks.
 *
 * DESIGN NOTES:
 *   • Event delegation on the stat inputs avoids the 1-char focus bug.
 *   • silentUpdate() is not needed here — number inputs commit on change.
 *
 * DEPENDS ON: BWO_STATE, BWO_UTILS, BWO_CONST, BWO_ADMIN_UI
 * EXPORTS: window.BWO_STATS
 */

'use strict';

window.BWO_STATS = (function () {

  var ST = window.BWO_STATE;
  var U  = window.BWO_UTILS;
  var C  = window.BWO_CONST;
  var UI = window.BWO_ADMIN_UI;

  /** Parsed CSV data waiting to be applied (set by handleStatCSVFile). */
  var _pendingCSV = null;


  /* ═══════════════════════════════════════════════════════════════
   * SHARED HELPERS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * _calcPlayerPts(stats, rules) → number
   * Points for one player = finals×rule + beds×rule.
   */
  function _calcPlayerPts(stats, rules) {
    stats = stats || {};
    rules = rules || {};
    return Math.max(0, Math.round(
      (stats.finals    || 0) * (rules.finals    || 0) +
      (stats.bedbreaks || 0) * (rules.bedbreaks || 0)
    ));
  }

  /**
   * _getAllPlayers(state) → [{name, color, teamId}]
   * Every unique player across all active slots, annotated with colour.
   */
  function _getAllPlayers(state) {
    var seen = {};
    var out  = [];
    ST.getActiveSlots(state).forEach(function (slot) {
      var team = ST.getTeamById(state, slot.teamId);
      if (!team) return;
      (team.players || []).forEach(function (p) {
        var name = U.getPlayerName(p).trim();
        if (name && !seen[name]) {
          seen[name] = true;
          out.push({ name: name, color: slot.color, teamId: team.id });
        }
      });
    });
    return out;
  }

  /**
   * _cumulativeStats(state) → { IGN: {finals, beds} }
   * Sums each player's finals/beds across every FINISHED game
   * (from the per-game snapshot stored on each history entry).
   */
  function _cumulativeStats(state) {
    var totals = {};
    (state.gameHistory || []).forEach(function (g) {
      var ps = g.playerStats || {};
      Object.keys(ps).forEach(function (n) {
        if (!totals[n]) totals[n] = { finals: 0, beds: 0 };
        totals[n].finals += (ps[n].finals    || 0);
        totals[n].beds   += (ps[n].bedbreaks || 0);
      });
    });
    return totals;
  }

  /**
   * _placementCounts(state) → { teamId: { 1:n, 2:n, … } }
   * How many times each team finished in each position.
   */
  function _placementCounts(state) {
    var counts = {};
    (state.gameHistory || []).forEach(function (g) {
      (g.results || []).forEach(function (r) {
        if (!r.teamId || !r.placement) return;
        counts[r.teamId] = counts[r.teamId] || {};
        counts[r.teamId][r.placement] = (counts[r.teamId][r.placement] || 0) + 1;
      });
    });
    return counts;
  }

  /**
   * _pointsBreakdown(state) → { teamId: {finalsPts, bedsPts, placePts, total, games} }
   * Exact per-team point split summed from finished-game results.
   */
  function _pointsBreakdown(state) {
    var bd = {};
    (state.gameHistory || []).forEach(function (g) {
      (g.results || []).forEach(function (r) {
        if (!r.teamId) return;
        if (!bd[r.teamId]) bd[r.teamId] = { finalsPts: 0, bedsPts: 0, placePts: 0, total: 0, games: 0 };
        bd[r.teamId].finalsPts += (r.finalsPts || 0);
        bd[r.teamId].bedsPts   += (r.bedsPts   || 0);
        bd[r.teamId].placePts  += (r.placePts  || 0);
        bd[r.teamId].total     += (r.pts       || 0);
        bd[r.teamId].games     += 1;
      });
    });
    return bd;
  }


  /* ═══════════════════════════════════════════════════════════════
   * 1. THIS GAME — SCORING SPREADSHEET
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderGameScoring(state) → void
   * Builds the per-team scoring table for the current game:
   * a placement selector per team + Finals/Beds inputs per player.
   *
   * @param {object} state
   */
  function renderGameScoring(state) {
    var el = document.getElementById('sc-game-table');
    if (!el) return;

    var slots = ST.getActiveSlots(state);
    if (!slots.length) {
      el.innerHTML  = '<p class="help">Set up game slots in Game Setup first.</p>';
      el.onchange   = null;
      el.oninput    = null;
      return;
    }

    var rules        = state.pointRules     || {};
    var placementPts = state.placementRules || [];
    var nSlots       = slots.length;
    var allSlots     = state.slots || [];

    el.innerHTML = slots.map(function (slot) {
      var origIdx  = allSlots.indexOf(slot);
      var hex      = C.COLORS[slot.color] || '#fff';
      var team     = ST.getTeamById(state, slot.teamId);
      var tname    = team ? team.name : slot.color;
      var statPts  = team ? ST.computeTeamScore(team, state.playerStats, rules) : 0;
      var rank     = slot.placement || 0;
      var placePts = rank > 0 ? (placementPts[rank - 1] || 0) : 0;
      var total    = statPts + placePts;

      /* Placement <select> — Win / 2nd / 3rd … up to the team count */
      var opts = '<option value="0">— place —</option>';
      for (var r = 1; r <= nSlots; r++) {
        opts += '<option value="' + r + '"' + (r === rank ? ' selected' : '') + '>' +
          (r === 1 ? 'Win (1st)' : U.ordinal(r)) + '</option>';
      }

      var players = team
        ? (team.players || []).filter(function (p) { return U.getPlayerName(p).trim(); })
        : [];

      var playerRows = players.map(function (p) {
        var name = U.getPlayerName(p);
        var ps   = (state.playerStats || {})[name] || {};
        return '<div class="sc-prow">' +
          '<div class="sc-pname" title="' + U.escapeHtml(name) + '">' + U.escapeHtml(name) + '</div>' +
          '<input class="pstat-inp sc-stat" type="number" min="0" value="' + (ps.finals    || 0) + '" data-player="' + U.escapeHtml(name) + '" data-key="finals"/>' +
          '<input class="pstat-inp sc-stat" type="number" min="0" value="' + (ps.bedbreaks || 0) + '" data-player="' + U.escapeHtml(name) + '" data-key="bedbreaks"/>' +
          '<div class="sc-ppts">' + _calcPlayerPts(ps, rules) + '</div>' +
        '</div>';
      }).join('') || '<div class="sc-prow"><div class="sc-pname" style="color:var(--mut);">No players on this team.</div></div>';

      return '<div class="sc-team" style="border-color:' + hex + '33;">' +
        '<div class="sc-team-hdr">' +
          '<div class="sc-dot" style="background:' + hex + '"></div>' +
          '<span class="sc-tname" style="color:' + hex + '">' + U.escapeHtml(tname) + '</span>' +
          '<select class="sc-place-sel" data-si="' + origIdx + '" title="Finishing place">' + opts + '</select>' +
          '<span class="sc-ttot" style="color:' + hex + '" title="Stat + placement points">' + total + '</span>' +
        '</div>' +
        '<div class="sc-col-hdr">' +
          '<div class="sc-pname">Player</div>' +
          '<div class="sc-lbl" title="Final kills">Finals</div>' +
          '<div class="sc-lbl" title="Beds broken">Beds</div>' +
          '<div class="sc-lbl">Pts</div>' +
        '</div>' +
        playerRows +
        '<div class="sc-team-foot">Stat <strong>' + statPts + '</strong> + Place <strong>' + placePts + '</strong> = <strong style="color:' + hex + '">' + total + '</strong></div>' +
      '</div>';
    }).join('');

    /* Delegated: player Finals/Beds inputs */
    el.onchange = function (ev) {
      var t = ev.target;
      if (t.classList.contains('sc-stat') && t.dataset.player && t.dataset.key) {
        _updateSingleStat(t.dataset.player, t.dataset.key, parseInt(t.value) || 0);
        return;
      }
      if (t.classList.contains('sc-place-sel')) {
        setSlotPlacement(parseInt(t.getAttribute('data-si')), parseInt(t.value) || 0);
      }
    };
  }

  /**
   * setSlotPlacement(slotIdx, rank) → void
   * Sets a team's preselected finishing place. TIES ALLOWED — multiple teams
   * may share the same place (e.g. two teams at 3rd both score 3rd-place points).
   *
   * @param {number} slotIdx - Index in state.slots
   * @param {number} rank    - 1 = 1st/Win, 0 = unset
   */
  function setSlotPlacement(slotIdx, rank) {
    var state = ST.get();
    var slots = U.deepClone(state.slots || []);
    if (!slots[slotIdx]) return;
    rank = parseInt(rank) || 0;
    slots[slotIdx].placement = rank;   // ties allowed: do NOT clear the same rank from other teams
    ST.update({ slots: slots });
  }

  /**
   * _updateSingleStat(playerName, key, value) → void
   * Updates one stat field (finals|bedbreaks) for a player + recalcs points.
   */
  function _updateSingleStat(playerName, key, value) {
    var state = ST.get();
    var stats = U.deepClone(state.playerStats || {});
    var rules = state.pointRules || {};
    if (!stats[playerName]) stats[playerName] = { finals: 0, bedbreaks: 0, points: 0 };
    stats[playerName][key]   = value;
    stats[playerName].points = _calcPlayerPts(stats[playerName], rules);
    ST.update({ playerStats: stats });
  }

  /**
   * clearStats() → void
   * Wipes the current game's player stats and clears preselected placements.
   */
  function clearStats() {
    var slots = U.deepClone(ST.get().slots || []);
    slots.forEach(function (s) { s.placement = 0; });
    ST.update({ playerStats: {}, slots: slots });
    UI.notify('This game cleared');
  }


  /* ═══════════════════════════════════════════════════════════════
   * 2. TOTAL STATS  +  3. TOTAL POINTS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderTotals(state) → void
   * Renders both the cumulative Total Stats tables and the Total Points
   * breakdown table from finished-game history.
   */
  function renderTotals(state) {
    _renderTotalStats(state);
    _renderTotalPoints(state);
  }

  function _renderTotalStats(state) {
    var el = document.getElementById('sc-total-stats');
    if (!el) return;

    var history = state.gameHistory || [];
    if (!history.length) {
      el.innerHTML = '<p class="help">No finished games yet. Stats appear here after you Finish a game.</p>';
      return;
    }

    /* ── Per-player cumulative finals/beds ── */
    var cum     = _cumulativeStats(state);
    var roster  = _getAllPlayers(state);
    /* Map name → colour from current roster (fallback grey) */
    var colourOf = {};
    roster.forEach(function (p) { colourOf[p.name] = C.COLORS[p.color] || '#aaa'; });

    var names = Object.keys(cum).sort(function (a, b) {
      return (cum[b].finals + cum[b].beds) - (cum[a].finals + cum[a].beds);
    });

    var playerRows = names.map(function (n) {
      var s   = cum[n];
      var hex = colourOf[n] || '#aaa';
      return '<div class="sc-trow">' +
        '<div class="sc-pname" style="color:' + hex + '" title="' + U.escapeHtml(n) + '">' + U.escapeHtml(n) + '</div>' +
        '<div class="sc-tcell">' + s.finals + '</div>' +
        '<div class="sc-tcell">' + s.beds   + '</div>' +
      '</div>';
    }).join('');

    /* ── Per-team placement counts ── */
    var counts    = _placementCounts(state);
    var standings = ST.getStandings(state);
    var maxPlace  = 4;
    Object.keys(counts).forEach(function (tid) {
      Object.keys(counts[tid]).forEach(function (k) { maxPlace = Math.max(maxPlace, parseInt(k)); });
    });

    var placeHead = '';
    for (var r = 1; r <= maxPlace; r++) placeHead += '<div class="sc-tcell sc-lbl">' + (r === 1 ? 'Win' : U.ordinal(r)) + '</div>';

    var teamRows = standings.map(function (team) {
      var slot = (state.slots || []).find(function (s) { return s.teamId === team.id; });
      var hex  = slot ? (C.COLORS[slot.color] || '#aaa') : '#aaa';
      var cc   = counts[team.id] || {};
      var cells = '';
      for (var r = 1; r <= maxPlace; r++) cells += '<div class="sc-tcell">' + (cc[r] || 0) + '</div>';
      return '<div class="sc-trow" style="grid-template-columns:1fr repeat(' + maxPlace + ',42px);">' +
        '<div class="sc-pname" style="color:' + hex + '">' + U.escapeHtml(team.name) + '</div>' +
        cells +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="sc-sub">Per-player — final kills &amp; beds</div>' +
      '<div class="sc-trow sc-thdr"><div class="sc-pname">Player</div><div class="sc-tcell sc-lbl">Finals</div><div class="sc-tcell sc-lbl">Beds</div></div>' +
      playerRows +
      '<div class="sc-sub" style="margin-top:10px;">Per-team — placement counts</div>' +
      '<div class="sc-trow sc-thdr" style="grid-template-columns:1fr repeat(' + maxPlace + ',42px);"><div class="sc-pname">Team</div>' + placeHead + '</div>' +
      teamRows;
  }

  function _renderTotalPoints(state) {
    var el = document.getElementById('sc-total-points');
    if (!el) return;

    var history = state.gameHistory || [];
    if (!history.length) {
      el.innerHTML = '<p class="help">No finished games yet. Point totals appear here after you Finish a game.</p>';
      return;
    }

    var bd        = _pointsBreakdown(state);
    var standings = ST.getStandings(state);

    var rows = standings.map(function (team) {
      var slot = (state.slots || []).find(function (s) { return s.teamId === team.id; });
      var hex  = slot ? (C.COLORS[slot.color] || '#aaa') : '#aaa';
      var b    = bd[team.id] || { finalsPts: 0, bedsPts: 0, placePts: 0, total: 0 };
      return '<div class="sc-trow" style="grid-template-columns:1fr 54px 54px 60px 60px;">' +
        '<div class="sc-pname" style="color:' + hex + '">' + U.escapeHtml(team.name) + '</div>' +
        '<div class="sc-tcell">' + b.finalsPts + '</div>' +
        '<div class="sc-tcell">' + b.bedsPts   + '</div>' +
        '<div class="sc-tcell">' + b.placePts  + '</div>' +
        '<div class="sc-tcell" style="color:#fff;font-weight:900;">' + (b.total || team.totalPoints || 0) + '</div>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="sc-trow sc-thdr" style="grid-template-columns:1fr 54px 54px 60px 60px;">' +
        '<div class="sc-pname">Team</div>' +
        '<div class="sc-tcell sc-lbl">Finals</div>' +
        '<div class="sc-tcell sc-lbl">Beds</div>' +
        '<div class="sc-tcell sc-lbl">Place</div>' +
        '<div class="sc-tcell sc-lbl">Total</div>' +
      '</div>' +
      rows;
  }


  /* ═══════════════════════════════════════════════════════════════
   * CSV IMPORT  (IGN, FINALS, BEDS)
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * handleStatCSVFile(inputElement) → void
   * Reads a stats CSV and shows a preview.
   * Format: IGN, FINALS, BEDS  (first row treated as a header, skipped).
   */
  function handleStatCSVFile(inputElement) {
    var file = inputElement.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (e) {
      var rows = U.parseCSVText(e.target.result);
      var data = {};

      rows.slice(1).forEach(function (cols) {
        var name = cols[0];
        if (!name) return;
        data[name] = {
          finals:    parseInt(cols[1]) || 0,
          bedbreaks: parseInt(cols[2]) || 0,
          points:    0,
        };
      });

      _pendingCSV = data;

      var preview = document.getElementById('csv-stat-preview');
      if (preview) {
        preview.style.display = '';
        var names = Object.keys(data);
        preview.innerHTML = names.slice(0, 6).map(function (n) {
          var s = data[n];
          return '<div style="font-size:10px;padding:2px 0;">' +
            U.escapeHtml(n) + ': ' + s.finals + ' Finals · ' + s.bedbreaks + ' Beds' +
          '</div>';
        }).join('') + (names.length > 6 ? '<div style="font-size:9px;color:var(--mut);">…and ' + (names.length - 6) + ' more</div>' : '');
      }

      var applyBtn = document.getElementById('stat-csv-apply');
      if (applyBtn) applyBtn.style.display = '';

      UI.notify('Parsed ' + Object.keys(data).length + ' players from CSV');
    };

    reader.readAsText(file);
    inputElement.value = '';
  }

  /**
   * applyStatCSV() → void
   * Applies the pending CSV data to the current game's player stats.
   */
  function applyStatCSV() {
    if (!_pendingCSV) return;

    var state = ST.get();
    var stats = U.deepClone(state.playerStats || {});
    var rules = state.pointRules || {};

    Object.keys(_pendingCSV).forEach(function (name) {
      var s = _pendingCSV[name];
      s.points    = _calcPlayerPts(s, rules);
      stats[name] = s;
    });

    ST.update({ playerStats: stats });
    _pendingCSV = null;

    var applyBtn = document.getElementById('stat-csv-apply');
    if (applyBtn) applyBtn.style.display = 'none';
    var preview = document.getElementById('csv-stat-preview');
    if (preview) preview.style.display = 'none';

    UI.notify('Stats applied!');
  }


  /* ═══════════════════════════════════════════════════════════════
   * POINT RULES  (Finals / Beds)
   * ═══════════════════════════════════════════════════════════════ */

  function savePR() {
    function val(id) {
      var el = document.getElementById(id);
      return el ? (parseFloat(el.value) || 0) : 0;
    }
    ST.update({
      pointRules: {
        finals:    val('pr-finals'),
        bedbreaks: val('pr-bedbreaks'),
      },
    });
  }

  function loadPR(state) {
    var r = state.pointRules || {};
    _setIfUnfocused('pr-finals',    r.finals    != null ? r.finals    : 4);
    _setIfUnfocused('pr-bedbreaks', r.bedbreaks != null ? r.bedbreaks : 7);
  }


  /* ═══════════════════════════════════════════════════════════════
   * PLACEMENT RULES
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderPlacementRules(state) → void
   * Renders editable placement-bonus inputs (Win / 2nd / 3rd …).
   */
  function renderPlacementRules(state) {
    var el = document.getElementById('placement-rules-card');
    if (!el) return;

    var rules = state.placementRules || [50, 30, 20, 10, 5, 3, 2, 1];

    el.innerHTML = rules.map(function (pts, i) {
      var label = i === 0 ? 'Win (1st)' : U.ordinal(i + 1);
      return '<div class="pr-row">' +
        '<div class="pr-label">' + label + ' Place</div>' +
        '<input class="pr-inp" type="number" min="0" value="' + pts + '" oninput="BWO_STATS.savePlacementRule(' + i + ', +this.value)"/>' +
      '</div>';
    }).join('');
  }

  function savePlacementRule(index, value) {
    var state = ST.get();
    var rules = (state.placementRules || [50, 30, 20, 10, 5, 3, 2, 1]).slice();
    rules[index] = value || 0;
    ST.update({ placementRules: rules });
  }


  /* ═══════════════════════════════════════════════════════════════
   * HELPER
   * ═══════════════════════════════════════════════════════════════ */

  function _setIfUnfocused(id, value) {
    var el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = value;
  }


  /* ─── Public API ──────────────────────────────────────────────── */
  return Object.freeze({
    renderGameScoring,
    renderTotals,
    setSlotPlacement,
    clearStats,
    handleStatCSVFile,
    applyStatCSV,
    savePR,
    loadPR,
    renderPlacementRules,
    savePlacementRule,
  });

})();
