/**
 * stats.js — Admin Stats & Scores Module
 *
 * Manages the "Scores & Stats" page.
 * Responsibilities:
 *   • Display a live points-preview per team (stat pts + estimated placement bonus)
 *   • Track per-player kill/death/final/bedbreak stats
 *   • Import stats from a CSV file
 *   • Manage Kill/Death point rules
 *   • Manage Placement bonus point rules (1st–8th place)
 *
 * DESIGN NOTES:
 *   • The old "score editor" (raw score input per slot) is replaced with a
 *     read-only preview that shows how stats will translate to points.
 *   • Event delegation is used on the stats table so the 1-char bug is avoided.
 *   • silentUpdate() while typing, full update() on blur.
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
   * POINTS PREVIEW
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderScoresSummary(state) → void
   * Renders the live points-preview cards — one per active slot.
   * Shows:
   *   • Team name + colour
   *   • Stat points (from player kills/deaths/etc.)
   *   • Estimated placement bonus (based on slot order as a proxy)
   *   • Combined total
   *   • Per-player stat breakdown
   *
   * @param {object} state - Current global state
   */
  function renderScoresSummary(state) {
    var el = document.getElementById('sc-summary');
    if (!el) return;

    var slots = ST.getActiveSlots(state);
    if (!slots.length) {
      el.innerHTML = '<p class="help">Set up game slots in Game Setup first.</p>';
      return;
    }

    var rules        = state.pointRules      || {};
    var placementPts = state.placementRules  || [10, 7, 5, 4, 3, 2, 1, 0];

    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:6px;">' +
      slots.map(function (slot, si) {
        var hex     = C.COLORS[slot.color] || '#fff';
        var team    = ST.getTeamById(state, slot.teamId);
        var tname   = team ? team.name : slot.color;
        var statPts = team ? ST.computeTeamScore(team, state.playerStats, rules) : 0;
        var bonus   = placementPts[si] || 0;
        var total   = statPts + bonus;

        /* Per-player breakdown */
        var players = team
          ? (team.players || []).filter(function (p) { return U.getPlayerName(p).trim(); })
          : [];

        var playerBreakdown = players.map(function (p) {
          var name = U.getPlayerName(p);
          var ps   = (state.playerStats || {})[name] || {};
          return name +
            ' (K:' + (ps.kills     || 0) +
            ' D:'  + (ps.deaths    || 0) +
            ' FK:' + (ps.finals    || 0) +
            ' BB:' + (ps.bedbreaks || 0) + ')';
        }).join(' · ');

        return '<div style="background:rgba(255,255,255,.04);border:1px solid ' + hex + '28;border-radius:8px;padding:9px 12px;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            '<div style="width:8px;height:8px;border-radius:50%;background:' + hex + ';flex-shrink:0;"></div>' +
            '<span style="font-weight:700;font-size:12px;color:' + hex + ';flex:1;">' + U.escapeHtml(tname) + '</span>' +
            '<span style="font-family:var(--fd);font-size:9px;color:var(--mut);">est. place #' + (si + 1) + '</span>' +
            '<span style="font-family:var(--fd);font-size:18px;font-weight:900;color:' + hex + ';">' + total + '</span>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<span style="font-size:9px;color:var(--acc2);font-weight:700;">Stat: ' + statPts + '</span>' +
            '<span style="font-size:9px;color:var(--ylw);font-weight:700;">+ Placement: +' + bonus + '</span>' +
            (playerBreakdown ? '<span style="font-size:9px;color:var(--mut);">' + U.escapeHtml(playerBreakdown) + '</span>' : '') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }


  /* ═══════════════════════════════════════════════════════════════
   * PLAYER STATS TABLE
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderPStatTable(state) → void
   * Rebuilds the player-stats table — one row per player across all slots.
   * Uses event delegation so typing doesn't destroy focus.
   *
   * @param {object} state - Current global state
   */
  function renderPStatTable(state) {
    var el = document.getElementById('pstat-table');
    if (!el) return;

    var players = _getAllPlayers(state);
    if (!players.length) {
      el.innerHTML = '<p class="help">Assign teams to game slots to see player rows here.</p>';
      el.onchange  = null;
      return;
    }

    var rules = state.pointRules || {};
    var stats  = state.playerStats || {};

    var headerHTML =
      '<div class="pstat-hdr">' +
        '<div class="pstat-lbl">Player</div>' +
        '<div class="pstat-lbl" title="Auto-calculated from rules">PTS</div>' +
        '<div class="pstat-lbl">K</div>' +
        '<div class="pstat-lbl">D</div>' +
        '<div class="pstat-lbl">FK</div>' +
        '<div class="pstat-lbl">BB</div>' +
      '</div>';

    var rowsHTML = players.map(function (p) {
      var s   = stats[p.name] || {};
      var hex = C.COLORS[p.color] || '#aaa';
      var pts = _calcPlayerPts(s, rules);

      return '<div class="pstat-row">' +
        '<div class="pstat-name" style="color:' + hex + '" title="' + U.escapeHtml(p.name) + '">' + U.escapeHtml(p.name) + '</div>' +
        '<div class="pstat-pts-ro">' + pts + '</div>' +
        '<input class="pstat-inp" type="number" min="0" value="' + (s.kills     || 0) + '" data-player="' + U.escapeHtml(p.name) + '" data-key="kills"/>' +
        '<input class="pstat-inp" type="number" min="0" value="' + (s.deaths    || 0) + '" data-player="' + U.escapeHtml(p.name) + '" data-key="deaths"/>' +
        '<input class="pstat-inp" type="number" min="0" value="' + (s.finals    || 0) + '" data-player="' + U.escapeHtml(p.name) + '" data-key="finals"/>' +
        '<input class="pstat-inp" type="number" min="0" value="' + (s.bedbreaks || 0) + '" data-player="' + U.escapeHtml(p.name) + '" data-key="bedbreaks"/>' +
      '</div>';
    }).join('');

    el.innerHTML = headerHTML + rowsHTML;

    /* Delegated change handler — update a single stat field */
    el.onchange = function (ev) {
      var inp = ev.target;
      if (!inp.dataset.player || !inp.dataset.key) return;
      _updateSingleStat(inp.dataset.player, inp.dataset.key, parseInt(inp.value) || 0);
    };
  }

  /**
   * _getAllPlayers(state) → [{name, color}]
   * Collects all unique player names from all active slots,
   * annotated with their team's slot colour.
   *
   * @param {object} state
   * @returns {{name:string, color:string}[]}
   */
  function _getAllPlayers(state) {
    var seen    = {};
    var result  = [];

    ST.getActiveSlots(state).forEach(function (slot) {
      var team = ST.getTeamById(state, slot.teamId);
      if (!team) return;
      (team.players || []).forEach(function (p) {
        var name = U.getPlayerName(p).trim();
        if (name && !seen[name]) {
          seen[name] = true;
          result.push({ name, color: slot.color });
        }
      });
    });

    return result;
  }

  /**
   * _calcPlayerPts(stats, rules) → number
   * Computes auto-calculated points for one player given their stats.
   *
   * @param {object} stats - { kills, deaths, finals, bedbreaks }
   * @param {object} rules - { kills, deaths, finals, bedbreaks }
   * @returns {number}
   */
  function _calcPlayerPts(stats, rules) {
    return Math.max(0, Math.round(
      (stats.kills     || 0) * (rules.kills     || 0) +
      (stats.deaths    || 0) * (rules.deaths    || 0) +
      (stats.finals    || 0) * (rules.finals    || 0) +
      (stats.bedbreaks || 0) * (rules.bedbreaks || 0)
    ));
  }

  /**
   * _updateSingleStat(playerName, key, value) → void
   * Updates one stat field for one player and recalculates their points.
   *
   * @param {string} playerName
   * @param {string} key   - 'kills' | 'deaths' | 'finals' | 'bedbreaks'
   * @param {number} value
   */
  function _updateSingleStat(playerName, key, value) {
    var state  = ST.get();
    var stats  = U.deepClone(state.playerStats || {});
    var rules  = state.pointRules || {};

    if (!stats[playerName]) {
      stats[playerName] = { kills: 0, deaths: 0, finals: 0, bedbreaks: 0, points: 0 };
    }

    stats[playerName][key]    = value;
    stats[playerName].points  = _calcPlayerPts(stats[playerName], rules);

    ST.update({ playerStats: stats });
  }

  /**
   * clearStats() → void
   * Wipes all player stats for the current game.
   */
  function clearStats() {
    ST.update({ playerStats: {} });
    UI.notify('Stats cleared');
  }


  /* ═══════════════════════════════════════════════════════════════
   * CSV IMPORT
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * handleStatCSVFile(inputElement) → void
   * Reads the selected stats CSV and parses it.
   * Shows a preview and enables the Apply button.
   *
   * CSV format: IGN, KILLS, DEATHS, FINALS, BEDBREAKS
   * First row is treated as a header and skipped.
   *
   * @param {HTMLInputElement} inputElement
   */
  function handleStatCSVFile(inputElement) {
    var file = inputElement.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (e) {
      var rows  = U.parseCSVText(e.target.result);
      var data  = {};

      /* Skip header row (first row) */
      rows.slice(1).forEach(function (cols) {
        var name = cols[0];
        if (!name) return;
        data[name] = {
          kills:     parseInt(cols[1]) || 0,
          deaths:    parseInt(cols[2]) || 0,
          finals:    parseInt(cols[3]) || 0,
          bedbreaks: parseInt(cols[4]) || 0,
          points:    0,
        };
      });

      _pendingCSV = data;

      /* Show preview */
      var preview = document.getElementById('csv-stat-preview');
      if (preview) {
        preview.style.display = '';
        var names = Object.keys(data);
        preview.innerHTML = names.slice(0, 6).map(function (n) {
          var s = data[n];
          return '<div style="font-size:10px;padding:2px 0;">' +
            U.escapeHtml(n) + ': ' + s.kills + 'K ' + s.finals + 'FK ' + s.bedbreaks + 'BB' +
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
   * Applies the pending CSV data to state, recalculating points.
   * Called when user clicks "✓ Apply CSV".
   */
  function applyStatCSV() {
    if (!_pendingCSV) return;

    var state  = ST.get();
    var stats  = U.deepClone(state.playerStats || {});
    var rules  = state.pointRules || {};

    Object.keys(_pendingCSV).forEach(function (name) {
      var s = _pendingCSV[name];
      stats[name] = s;
      s.points    = _calcPlayerPts(s, rules);
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
   * POINT RULES
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * savePR() → void
   * Reads the kill/death/final/bedbreak rule inputs and persists them.
   */
  function savePR() {
    function val(id) { return parseFloat(document.getElementById(id).value) || 0; }
    ST.update({
      pointRules: {
        kills:     val('pr-kills'),
        deaths:    val('pr-deaths'),
        finals:    val('pr-finals'),
        bedbreaks: val('pr-bedbreaks'),
      },
    });
  }

  /**
   * loadPR(state) → void
   * Syncs the kill/death rule inputs from state.
   * Skips fields currently being edited.
   *
   * @param {object} state
   */
  function loadPR(state) {
    var r = state.pointRules || {};
    _setIfUnfocused('pr-kills',     r.kills     || 0);
    _setIfUnfocused('pr-deaths',    r.deaths    || 0);
    _setIfUnfocused('pr-finals',    r.finals    || 0);
    _setIfUnfocused('pr-bedbreaks', r.bedbreaks || 0);
  }


  /* ═══════════════════════════════════════════════════════════════
   * PLACEMENT RULES
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderPlacementRules(state) → void
   * Renders 8 editable placement-bonus inputs (1st through 8th place).
   *
   * @param {object} state
   */
  function renderPlacementRules(state) {
    var el = document.getElementById('placement-rules-card');
    if (!el) return;

    var rules = state.placementRules || [10, 7, 5, 4, 3, 2, 1, 0];

    el.innerHTML = rules.map(function (pts, i) {
      return '<div class="pr-row">' +
        '<div class="pr-label">' + U.ordinal(i + 1) + ' Place</div>' +
        '<input class="pr-inp" type="number" min="0" value="' + pts + '" oninput="BWO_STATS.savePlacementRule(' + i + ', +this.value)"/>' +
      '</div>';
    }).join('');
  }

  /**
   * savePlacementRule(index, value) → void
   * Updates one placement-bonus value in state.
   *
   * @param {number} index - 0-based position (0 = 1st place)
   * @param {number} value - Points to award
   */
  function savePlacementRule(index, value) {
    var state  = ST.get();
    var rules  = (state.placementRules || [10, 7, 5, 4, 3, 2, 1, 0]).slice();
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
    renderScoresSummary,
    renderPStatTable,
    clearStats,
    handleStatCSVFile,
    applyStatCSV,
    savePR,
    loadPR,
    renderPlacementRules,
    savePlacementRule,
  });

})();
