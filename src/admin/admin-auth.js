/**
 * admin-auth.js — Password gate for the admin panel
 *
 * Shows a lock screen over the admin UI until the correct password
 * is entered. The password is set in config/config.js under
 * `adminPassword`. If no password is configured, the gate is skipped.
 *
 * HOW SESSION WORKS:
 *   Once unlocked, the session is stored in sessionStorage so that
 *   refreshing the admin page doesn't re-ask for the password during
 *   the same browser session. Closing the tab/browser clears it.
 *
 * EXPORTS: window.BWO_AUTH
 */

'use strict';

window.BWO_AUTH = (function () {

  var SESSION_KEY = 'bwo_admin_unlocked';

  /**
   * init() → void
   * Call this as early as possible in admin startup (before _boot).
   * Checks the config for a password; if set and the session isn't
   * already unlocked, shows the gate and blocks boot until correct
   * password is entered.
   *
   * @param {function} onUnlocked - Called when auth passes
   */
  function init(onUnlocked) {
    var cfg = window.BWO_CONFIG || {};
    var pw  = cfg.adminUiPassword;

    /* No password configured — skip gate entirely */
    if (!pw) {
      onUnlocked();
      return;
    }

    /* Already unlocked this session */
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      onUnlocked();
      return;
    }

    /* Show the lock screen */
    _showGate(pw, onUnlocked);
  }

  function _showGate(correctPw, onUnlocked) {
    var gate = document.getElementById('admin-gate');
    if (!gate) {
      /* Fallback: gate div wasn't in HTML (shouldn't happen) */
      var answer = prompt('Admin password:');
      if (answer === correctPw) {
        sessionStorage.setItem(SESSION_KEY, '1');
        onUnlocked();
      } else {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:monospace;color:red;">Incorrect password.</div>';
      }
      return;
    }

    gate.style.display = 'flex';

    var input = document.getElementById('gate-pw-input');
    var btn   = document.getElementById('gate-pw-btn');
    var err   = document.getElementById('gate-pw-err');
    var form  = document.getElementById('gate-form');

    function attempt() {
      if (input.value === correctPw) {
        sessionStorage.setItem(SESSION_KEY, '1');
        gate.style.opacity = '0';
        gate.style.transition = 'opacity .25s';
        setTimeout(function () { gate.style.display = 'none'; }, 260);
        onUnlocked();
      } else {
        err.style.opacity = '1';
        input.value = '';
        input.focus();
        /* Shake animation */
        form.style.animation = 'none';
        requestAnimationFrame(function () {
          form.style.animation = 'gate-shake .35s ease';
        });
      }
    }

    btn.addEventListener('click', attempt);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') attempt();
      if (err.style.opacity === '1') err.style.opacity = '0';
    });

    /* Focus the input once the gate is visible */
    setTimeout(function () { input.focus(); }, 80);
  }

  /**
   * lock() → void
   * Clears the session and reloads — re-shows the gate.
   * Wire to a "Lock" button in the admin if desired.
   */
  function lock() {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  }

  return Object.freeze({ init: init, lock: lock });

})();
