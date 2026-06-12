/**
 * teams.js — Admin Teams Module
 *
 * Manages the "Teams" page in the admin panel.
 * Responsibilities:
 *   • Render the list of named teams with editable name + player fields
 *   • Add / delete / reorder teams
 *   • Import teams from a CSV file
 *   • Update player avatar previews from Minecraft skin APIs
 *   • Respect the teamSize setting (2 or 4 players per team)
 *
 * KEY DESIGN DECISIONS:
 *   • Event delegation on the team list container avoids re-attaching
 *     listeners every render, which is what caused the "1-char bug".
 *   • silentUpdate() is used while the user is typing; a full update()
 *     is only sent on blur so the overlay doesn't re-render on every key.
 *
 * DEPENDS ON: BWO_STATE, BWO_UTILS, BWO_CONST, BWO_ADMIN_UI
 * EXPORTS: window.BWO_TEAMS
 */

'use strict';

window.BWO_TEAMS = (function () {

  var ST = window.BWO_STATE;
  var U  = window.BWO_UTILS;
  var C  = window.BWO_CONST;
  var UI = window.BWO_ADMIN_UI;

  /** Auto-increment ID seed for new teams (uses timestamp to avoid collisions). */
  var _idCounter = Date.now();


  /* ═══════════════════════════════════════════════════════════════
   * RENDER
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderTeams(state) → void
   * Rebuilds the entire team list from scratch using the current state.
   * Uses innerHTML for the list body, then attaches a single set of
   * delegated event listeners (oninput, onblur, onclick).
   *
   * @param {object} state - Current global state
   */
  function renderTeams(state) {
    var list = document.getElementById('team-list');
    if (!list) return;

    var teams    = state.namedTeams || [];
    var teamSize = state.teamSize   || 4;

    /* Sync the team size selector */
    var sizeSel = document.getElementById('team-size-sel');
    if (sizeSel && document.activeElement !== sizeSel) {
      sizeSel.value = String(teamSize);
    }

    if (!teams.length) {
      list.innerHTML = '<p class="help">No teams yet. Add one above or import a CSV.</p>';
      list.oninput   = null;
      list.onblur    = null;
      list.onclick   = null;
      return;
    }

    /* Build one card per team */
    list.innerHTML = teams.map(function (team, ti) {
      return _buildTeamCardHTML(team, ti, teamSize);
    }).join('');

    /* ── Delegated: oninput ── */
    list.oninput = function (ev) {
      var el = ev.target;

      /* Team name field */
      if (el.classList.contains('nt-name-inp')) {
        var ti      = parseInt(el.getAttribute('data-ti'));
        var teams2  = U.deepClone(ST.get().namedTeams || []);
        if (teams2[ti]) teams2[ti].name = el.value;
        ST.silentUpdate({ namedTeams: teams2 });
      }

      /* Player name field */
      if (el.classList.contains('nt-pl-inp')) {
        var ti  = parseInt(el.getAttribute('data-ti'));
        var pi  = parseInt(el.getAttribute('data-pi'));
        var st2 = ST.get();
        var teams2 = U.deepClone(st2.namedTeams || []);
        if (!teams2[ti]) return;

        var p = teams2[ti].players[pi] || { name: '', dead: false };
        if (typeof p === 'string') p = { name: p, dead: false };
        p.name = el.value;
        teams2[ti].players[pi] = p;
        ST.silentUpdate({ namedTeams: teams2 });

        /* Update avatar preview inline without re-render */
        _updateAvatar('ntav-' + ti + '-' + pi, el.value.trim());
      }
    };

    /* ── Delegated: onblur (fires update so overlay syncs) ── */
    list.onblur = function (ev) {
      var el = ev.target;
      if (el.classList.contains('nt-name-inp') || el.classList.contains('nt-pl-inp')) {
        ST.update({ namedTeams: ST.get().namedTeams });
      }
    };

    /* ── Delegated: onclick (buttons) ── */
    list.onclick = function (ev) {
      var btn = ev.target.closest('button');
      if (!btn) return;
      var ti     = parseInt(btn.getAttribute('data-ti'));
      var teams2 = U.deepClone(ST.get().namedTeams || []);

      if (btn.classList.contains('nt-del')) {
        teams2.splice(ti, 1);
      } else if (btn.classList.contains('nt-up') && ti > 0) {
        var tmp = teams2[ti]; teams2[ti] = teams2[ti - 1]; teams2[ti - 1] = tmp;
      } else if (btn.classList.contains('nt-dn') && ti < teams2.length - 1) {
        var tmp = teams2[ti]; teams2[ti] = teams2[ti + 1]; teams2[ti + 1] = tmp;
      } else {
        return; // unknown button
      }

      ST.update({ namedTeams: teams2 });
    };
  }

  /**
   * _buildTeamCardHTML(team, ti, teamSize) → string
   * Returns the HTML string for a single team card.
   *
   * @param {object} team     - Named team object
   * @param {number} ti       - Index in namedTeams array
   * @param {number} teamSize - 2 or 4
   * @returns {string}
   */
  function _buildTeamCardHTML(team, ti, teamSize) {
    /* Build player input rows, limited to teamSize */
    var playerRows = (team.players || []).slice(0, teamSize).map(function (p, pi) {
      var name = U.getPlayerName(p);
      var avatarSrc = name ? U.skinHeadURL(name, 28) : '';
      return '<div class="pi-wrap">' +
        '<img class="pi-av" id="ntav-' + ti + '-' + pi + '"' +
          ' src="' + avatarSrc + '"' +
          ' style="opacity:' + (name ? 1 : 0) + '"' +
          ' onerror="this.style.opacity=0"/>' +
        '<input class="nt-pl-inp"' +
          ' data-ti="' + ti + '" data-pi="' + pi + '"' +
          ' type="text" placeholder="Player ' + (pi + 1) + '"' +
          ' value="' + U.escapeHtml(name) + '"/>' +
        '</div>';
    }).join('');

    return '<div class="team-card-adm">' +
      '<div class="ntc-hdr">' +
        '<input class="nt-name-inp" data-ti="' + ti + '"' +
          ' style="flex:1;background:rgba(255,255,255,.06);border:1px solid var(--bor);border-radius:4px;' +
          'color:var(--txt);font-family:var(--fd);font-size:11px;font-weight:700;padding:4px 7px;outline:none;letter-spacing:1px;"' +
          ' value="' + U.escapeHtml(team.name || '') + '"' +
          ' placeholder="Team name"/>' +
        '<span style="font-family:var(--fd);font-size:8px;color:var(--mut);padding:0 6px;">' + (team.totalPoints || 0) + ' pts</span>' +
        '<button class="btn btn-g btn-sm btn-ic nt-up" data-ti="' + ti + '">↑</button>' +
        '<button class="btn btn-g btn-sm btn-ic nt-dn" data-ti="' + ti + '">↓</button>' +
        '<button class="btn btn-d btn-sm btn-ic nt-del" data-ti="' + ti + '">✕</button>' +
      '</div>' +
      '<div class="pgrid">' + playerRows + '</div>' +
    '</div>';
  }

  /**
   * _updateAvatar(imgId, username) → void
   * Updates a player avatar img element's src without re-rendering the list.
   *
   * @param {string} imgId    - DOM element id
   * @param {string} username - Minecraft username (may be empty)
   */
  function _updateAvatar(imgId, username) {
    var img = document.getElementById(imgId);
    if (!img) return;
    if (username) {
      img.src           = U.skinHeadURL(username, 28);
      img.style.opacity = 1;
      img.onerror       = function () { img.style.opacity = 0; };
    } else {
      img.src           = '';
      img.style.opacity = 0;
    }
  }


  /* ═══════════════════════════════════════════════════════════════
   * MUTATIONS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * addTeam() → void
   * Appends a new blank team to the namedTeams array.
   */
  function addTeam() {
    var state  = ST.get();
    var teams  = U.deepClone(state.namedTeams || []);
    var newId  = 'nt' + (++_idCounter);
    teams.push(ST.mkTeam(newId, 'Team ' + (teams.length + 1)));
    ST.update({ namedTeams: teams });
  }

  /**
   * clearAllTeams() → void
   * Removes all teams and clears all game slots.
   * Called after user confirmation.
   */
  function clearAllTeams() {
    ST.update({ namedTeams: [], slots: [] });
    UI.notify('All teams cleared');
  }

  /**
   * setTeamSize(size) → void
   * Updates the teamSize setting and re-renders the team list.
   *
   * @param {number} size - 2 or 4
   */
  function setTeamSize(size) {
    ST.update({ teamSize: parseInt(size) || 4 });
  }


  /* ═══════════════════════════════════════════════════════════════
   * CSV IMPORT
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * handleTeamCSVFile(inputElement) → void
   * Reads the selected CSV file and calls parseTeamCSV on its contents.
   *
   * @param {HTMLInputElement} inputElement - File input that triggered the event
   */
  function handleTeamCSVFile(inputElement) {
    var file = inputElement.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) { parseTeamCSV(e.target.result); };
    reader.readAsText(file);
    inputElement.value = ''; // allow re-selecting same file
  }

  /**
   * parseTeamCSV(text) → void
   * Parses a CSV where each row is:
   *   TEAMNAME, PLAYER1, PLAYER2, PLAYER3, PLAYER4
   *
   * If the team already exists (case-insensitive name match), its
   * players list is updated.  Otherwise a new team is created.
   *
   * @param {string} text - Raw CSV text
   */
  function parseTeamCSV(text) {
    var rows   = U.parseCSVText(text);
    var state  = ST.get();
    var teams  = U.deepClone(state.namedTeams || []);
    var count  = 0;

    rows.forEach(function (cols) {
      if (!cols[0]) return;
      var teamName = cols[0];
      var players  = cols.slice(1, 5).filter(Boolean).map(function (n) {
        return { name: n, dead: false };
      });
      /* Pad to 4 players */
      while (players.length < 4) players.push({ name: '', dead: false });

      /* Find existing team by name (case-insensitive) */
      var existing = teams.find(function (t) {
        return t.name.toLowerCase() === teamName.toLowerCase();
      });

      if (existing) {
        existing.players = players;
      } else {
        var newTeam = ST.mkTeam('nt' + (++_idCounter), teamName);
        newTeam.players = players;
        teams.push(newTeam);
      }
      count++;
    });

    ST.update({ namedTeams: teams });
    UI.notify('Imported ' + count + ' team' + (count !== 1 ? 's' : '') + '!');
  }


  /* ─── Public API ──────────────────────────────────────────────── */
  return Object.freeze({
    renderTeams,
    addTeam,
    clearAllTeams,
    setTeamSize,
    handleTeamCSVFile,
    parseTeamCSV,
  });

})();
