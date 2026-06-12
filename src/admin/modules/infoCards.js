/**
 * infoCards.js — Admin Info Cards Module
 *
 * Manages the "Info Cards" page in the admin panel.
 * Info cards are displayed in the top-left panel on the OBS overlay
 * during game mode. They cycle automatically on a configurable interval.
 *
 * Responsibilities:
 *   • Render the editable list of info cards
 *   • Add / delete / reorder cards
 *   • Edit card title, body text, and optional image URL
 *   • Configure the cycle interval
 *
 * EVENT DELEGATION is used so typing in a card's fields doesn't
 * destroy focus (the 1-char bug). silentUpdate() while typing,
 * full update() on blur.
 *
 * DEPENDS ON: BWO_STATE, BWO_UTILS, BWO_ADMIN_UI
 * EXPORTS: window.BWO_INFO_CARDS
 */

'use strict';

window.BWO_INFO_CARDS = (function () {

  var ST = window.BWO_STATE;
  var U  = window.BWO_UTILS;
  var UI = window.BWO_ADMIN_UI;

  /** Auto-increment seed for new card IDs. */
  var _idCounter = Date.now() + 2000;


  /* ═══════════════════════════════════════════════════════════════
   * RENDER
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderInfoCards(state) → void
   * Rebuilds the full info-card list from state.
   * Uses innerHTML + event delegation to avoid the 1-char typing bug.
   *
   * @param {object} state - Current global state
   */
  function renderInfoCards(state) {
    var list = document.getElementById('tc-list');
    if (!list) return;

    var cards = state.tournCards || [];

    list.innerHTML = cards.map(function (card, i) {
      return _buildCardHTML(card, i);
    }).join('');

    /* Sync the interval input */
    var intervalEl = document.getElementById('tc-interval');
    if (intervalEl && document.activeElement !== intervalEl) {
      intervalEl.value = state.tournCardInterval || 10;
    }

    /* ── Delegated: oninput (edit title / body / imageUrl) ── */
    list.oninput = function (ev) {
      var el = ev.target;
      if (!el.classList.contains('tc-inp')) return;

      var i    = parseInt(el.getAttribute('data-tc-i'));
      var key  = el.getAttribute('data-tc-key');
      var st2  = ST.get();
      var cards2 = U.deepClone(st2.tournCards || []);

      if (cards2[i]) cards2[i][key] = el.value;
      ST.silentUpdate({ tournCards: cards2 });
    };

    /* ── Delegated: onblur (broadcast after typing finishes) ── */
    list.onblur = function (ev) {
      if (ev.target.classList.contains('tc-inp')) {
        ST.update({ tournCards: ST.get().tournCards });
      }
    };

    /* ── Delegated: onclick (up / down / delete buttons) ── */
    list.onclick = function (ev) {
      var btn = ev.target.closest('button[data-tc-action]');
      if (!btn) return;

      var action = btn.getAttribute('data-tc-action');
      var i      = parseInt(btn.getAttribute('data-tc-i'));
      var st2    = ST.get();
      var cards2 = U.deepClone(st2.tournCards || []);

      if (action === 'del') {
        cards2.splice(i, 1);
      } else if (action === 'up' && i > 0) {
        var tmp = cards2[i]; cards2[i] = cards2[i - 1]; cards2[i - 1] = tmp;
      } else if (action === 'dn' && i < cards2.length - 1) {
        var tmp = cards2[i]; cards2[i] = cards2[i + 1]; cards2[i + 1] = tmp;
      } else {
        return;
      }

      ST.update({ tournCards: cards2 });
    };
  }

  /**
   * _buildCardHTML(card, i) → string
   * Returns the HTML for a single info card editor.
   *
   * @param {object} card - { id, title, body, imageUrl }
   * @param {number} i    - Index in tournCards array
   * @returns {string}
   */
  function _buildCardHTML(card, i) {
    return '<div class="tc-card">' +

      /* Header row: label + reorder + delete buttons */
      '<div class="tc-hdr">' +
        '<span style="font-family:var(--fd);font-size:8px;color:var(--mut);">Card ' + (i + 1) + '</span>' +
        '<div style="display:flex;gap:4px;margin-left:auto;">' +
          '<button class="btn btn-g btn-sm btn-ic" data-tc-action="up" data-tc-i="' + i + '" title="Move up">↑</button>' +
          '<button class="btn btn-g btn-sm btn-ic" data-tc-action="dn" data-tc-i="' + i + '" title="Move down">↓</button>' +
          '<button class="btn btn-d btn-sm"        data-tc-action="del" data-tc-i="' + i + '" title="Delete">✕</button>' +
        '</div>' +
      '</div>' +

      /* Title + Image URL side by side */
      '<div class="g2">' +
        '<div class="f"><label>Title</label>' +
          '<input type="text" class="tc-inp" data-tc-i="' + i + '" data-tc-key="title"' +
            ' value="' + U.escapeHtml(card.title || '') + '" placeholder="Title"/>' +
        '</div>' +
        '<div class="f"><label>Image URL (optional)</label>' +
          '<input type="url" class="tc-inp" data-tc-i="' + i + '" data-tc-key="imageUrl"' +
            ' value="' + U.escapeHtml(card.imageUrl || '') + '" placeholder="https://..."/>' +
        '</div>' +
      '</div>' +

      /* Body text */
      '<div class="f"><label>Body</label>' +
        '<textarea class="tc-inp" data-tc-i="' + i + '" data-tc-key="body"' +
          ' rows="2" placeholder="Card body text...">' +
          U.escapeHtml(card.body || '') +
        '</textarea>' +
      '</div>' +

    '</div>';
  }


  /* ═══════════════════════════════════════════════════════════════
   * MUTATIONS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * addCard() → void
   * Appends a new blank info card to the tournCards array.
   */
  function addCard() {
    var state  = ST.get();
    var cards  = U.deepClone(state.tournCards || []);
    cards.push({
      id:       'tc' + (++_idCounter),
      title:    '',
      body:     '',
      imageUrl: '',
    });
    ST.update({ tournCards: cards });
  }

  /**
   * saveInterval() → void
   * Reads the cycle interval input and persists it.
   * Called on oninput from the interval field.
   */
  function saveInterval() {
    var el = document.getElementById('tc-interval');
    if (!el) return;
    ST.update({ tournCardInterval: parseInt(el.value) || 10 });
  }


  /* ─── Public API ──────────────────────────────────────────────── */
  return Object.freeze({
    renderInfoCards,
    addCard,
    saveInterval,
  });

})();
