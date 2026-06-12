/**
 * streamScreens.js — Admin Stream Screens Module
 *
 * Manages the "Stream Screens" page.
 * Responsibilities:
 *   • Configure the Starting Game screen (event name, subtitle, logo, animation)
 *   • Configure the BRB screen (subtitle, logo, animation)
 *   • Configure the starting-screen countdown timer behaviour
 *   • Toggle overlay element visibility (scoreboard, teams, info panel, chat)
 *   • Configure background video/image URLs for each screen
 *
 * DEPENDS ON: BWO_STATE, BWO_UTILS, BWO_ADMIN_UI
 * EXPORTS: window.BWO_STREAM_SCREENS
 */

'use strict';

window.BWO_STREAM_SCREENS = (function () {

  var ST = window.BWO_STATE;
  var U  = window.BWO_UTILS;
  var UI = window.BWO_ADMIN_UI;

  /**
   * Visibility toggles shown on the Stream Screens page.
   * Each entry maps a state key to a human-readable label.
   */
  var VIS_TOGGLES = [
    { key: 'showTimer',      label: 'Timer Panel'    },
    { key: 'showTeams',      label: 'Team Cards'     },
    { key: 'showScoreboard', label: 'Scoreboard'     },
    { key: 'showTournInfo',  label: 'Info Panel'     },
  ];


  /* ═══════════════════════════════════════════════════════════════
   * SAVE / LOAD
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * saveStream() → void
   * Reads all stream-screen configuration fields and persists them.
   * Called on oninput / onchange events from those fields.
   */
  function saveStream() {
    function val(ids) {
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el && el.value !== undefined) return el.value;
      }
      return '';
    }

    ST.update({
      startingEventName:  val(['qa-event', 'inp-event-name']),
      startingSubtext:    val(['qa-sub',   'inp-start-sub']) || 'Starting Game',
      brbSubtext:         val(['qa-brb-sub', 'inp-brb-sub']) || 'Be Right Back',
      startingLogoUrl:    val(['inp-start-logo']),
      startingAnimation:  val(['inp-start-anim']) || 'pulse',
      brbLogoUrl:         val(['inp-brb-logo']),
      brbAnimation:       val(['inp-brb-anim']) || 'float',
    });
  }

  /**
   * loadStream(state) → void
   * Syncs all stream-screen fields from state.
   * Skips any field that currently has focus.
   *
   * @param {object} state - Current global state
   */
  function loadStream(state) {
    _set('inp-event-name', state.startingEventName || '');
    _set('inp-start-sub',  state.startingSubtext   || 'Starting Game');
    _set('inp-start-logo', state.startingLogoUrl   || '');
    _set('inp-start-anim', state.startingAnimation || 'pulse');
    _set('inp-brb-sub',    state.brbSubtext         || 'Be Right Back');
    _set('inp-brb-logo',   state.brbLogoUrl         || '');
    _set('inp-brb-anim',   state.brbAnimation       || 'float');
    _set('inp-countdown-from', state.startingCountdownFrom > 0 ? U.fmt(state.startingCountdownFrom) : '');
  }

  /**
   * saveCountdown() → void
   * Reads the countdown-from field (accepts "mm:ss" or raw seconds)
   * and persists the value in seconds.
   */
  function saveCountdown() {
    var el   = document.getElementById('inp-countdown-from');
    var secs = el ? U.parseCountdownInput(el.value) : 0;
    ST.update({ startingCountdownFrom: secs });
  }


  /* ═══════════════════════════════════════════════════════════════
   * VISIBILITY TOGGLES
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * renderVisibility(state) → void
   * Renders the toggle switches for overlay element visibility.
   * Uses inline onchange handlers (simple enough that delegation
   * adds no value here — these toggles never cause focus issues).
   *
   * @param {object} state
   */
  function renderVisibility(state) {
    var el = document.getElementById('vis-list');
    if (!el) return;

    el.innerHTML = VIS_TOGGLES.map(function (toggle) {
      var checked = state[toggle.key] ? 'checked' : '';
      return '<div class="tog">' +
        '<div class="tog-lbl">' + toggle.label + '</div>' +
        '<label class="sw">' +
          '<input type="checkbox" ' + checked + ' onchange="ST.update({' + toggle.key + ':this.checked})">' +
          '<div class="trk"></div>' +
          '<div class="thm"></div>' +
        '</label>' +
      '</div>';
    }).join('');
  }


  /* ═══════════════════════════════════════════════════════════════
   * BACKGROUND MEDIA
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * saveBgMedia() → void
   * Reads background video/image URL fields and persists them.
   */
  function saveBgMedia() {
    function g(id) {
      var el = document.getElementById(id);
      return el ? el.value : '';
    }

    ST.update({
      sharedBgVideoUrl:   g('shared-vid'),
      sharedBgImageUrl:   g('shared-img'),
      startingBgVideoUrl: g('starting-vid'),
      startingBgImageUrl: g('starting-img'),
      brbBgVideoUrl:      g('brb-vid'),
      brbBgImageUrl:      g('brb-img'),
      sumBgVideoUrl:      g('sum-vid'),
      mapBgVideoUrl:      g('map-vid'),
    });
  }

  /**
   * loadBgMedia(state) → void
   * Syncs background media fields from state.
   *
   * @param {object} state
   */
  function loadBgMedia(state) {
    _set('shared-vid',   state.sharedBgVideoUrl   || '');
    _set('shared-img',   state.sharedBgImageUrl   || '');
    _set('starting-vid', state.startingBgVideoUrl || '');
    _set('starting-img', state.startingBgImageUrl || '');
    _set('brb-vid',      state.brbBgVideoUrl      || '');
    _set('brb-img',      state.brbBgImageUrl      || '');
    _set('sum-vid',      state.sumBgVideoUrl       || '');
    _set('map-vid',      state.mapBgVideoUrl       || '');
  }


  /* ═══════════════════════════════════════════════════════════════
   * CHAT
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * saveChat() → void
   * Reads chat stream URL and show-chat toggle and persists them.
   */
  function saveChat() {
    var urlEl  = document.getElementById('inp-chat-url');
    var showEl = document.getElementById('inp-show-chat');
    ST.update({
      chatStreamUrl: urlEl  ? urlEl.value       : '',
      showChat:      showEl ? showEl.checked     : false,
    });
  }

  /**
   * loadChat(state) → void
   * Syncs chat fields from state.
   *
   * @param {object} state
   */
  function loadChat(state) {
    _set('inp-chat-url', state.chatStreamUrl || '');
    var showEl = document.getElementById('inp-show-chat');
    if (showEl) showEl.checked = !!state.showChat;
  }


  /* ═══════════════════════════════════════════════════════════════
   * HELPER
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * _set(id, value) → void
   * Sets an element's value only if it's not currently focused.
   */
  function _set(id, value) {
    var el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = value;
  }


  /* ─── Public API ──────────────────────────────────────────────── */
  return Object.freeze({
    saveStream,
    loadStream,
    saveCountdown,
    renderVisibility,
    saveBgMedia,
    loadBgMedia,
    saveChat,
    loadChat,
  });

})();
