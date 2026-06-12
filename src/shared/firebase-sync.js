/**
 * firebase-sync.js — Firebase Realtime Database sync adapter
 *
 * Replaces BroadcastChannel with Firebase RTDB so the admin panel on
 * one machine can drive the overlay on a completely different computer.
 *
 * SETUP (one-time, takes ~3 minutes):
 *   1. Go to https://console.firebase.google.com
 *   2. Create a project (free Spark plan is fine)
 *   3. Add a Web App to the project — copy the firebaseConfig object
 *   4. In the left sidebar: Build → Realtime Database → Create database
 *      Choose "Start in test mode" (we'll lock it down properly below)
 *   5. Paste your firebaseConfig values into config/config.js under
 *      the `firebase` key (see config.js for the exact fields)
 *   6. In RTDB Rules, paste:
 *      {
 *        "rules": {
 *          "bwo": {
 *            ".read":  true,
 *            ".write": "auth != null"
 *          }
 *        }
 *      }
 *      This lets the overlay READ freely but only the authenticated
 *      admin can WRITE.
 *
 * HOW IT WORKS:
 *   - BWO_STATE.update() calls firebase-sync's push(), which writes
 *     the full state to Firebase at /bwo/state
 *   - Both admin and overlay subscribe to that RTDB path — changes
 *     arrive via onValue() in under 100ms on any machine worldwide
 *   - localStorage is still used as a local cache / offline fallback
 *   - BroadcastChannel is kept as a same-tab fast-path (instant)
 *
 * EXPORTS: window.BWO_FIREBASE
 */

'use strict';

window.BWO_FIREBASE = (function () {

  var _db       = null;   // Firebase Database instance
  var _ref      = null;   // DatabaseRef at /bwo/state
  var _enabled  = false;
  var _pushing  = false;  // prevent echo-back of our own pushes
  var _onRemote = null;   // callback(state) when remote update arrives

  /**
   * init(config, onRemoteUpdate) → void
   * Loads Firebase SDK dynamically and connects to the database.
   *
   * @param {object}   config           - BWO_CONFIG.firebase object
   * @param {function} onRemoteUpdate   - Called with full state when
   *                                      a remote change arrives
   */
  function init(config, onRemoteUpdate) {
    if (!config || !config.apiKey || !config.databaseURL) {
      console.info('[BWO_FIREBASE] No Firebase config — running in local-only mode');
      return;
    }

    _onRemote = onRemoteUpdate;

    /* Dynamically inject the Firebase SDK scripts */
    var sdkBase = 'https://www.gstatic.com/firebasejs/10.12.2/';
    var scripts = [
      sdkBase + 'firebase-app-compat.js',
      sdkBase + 'firebase-database-compat.js',
      sdkBase + 'firebase-auth-compat.js',
    ];

    var loaded = 0;
    scripts.forEach(function (src) {
      var el = document.createElement('script');
      el.src = src;
      el.onload = function () {
        loaded++;
        if (loaded === scripts.length) _connect(config);
      };
      el.onerror = function () {
        console.error('[BWO_FIREBASE] Failed to load SDK script:', src);
      };
      document.head.appendChild(el);
    });
  }

  /** Internal — called once all SDK scripts have loaded. */
  function _connect(config) {
    try {
      /* Initialise app (guard against double-init on page reload) */
      var app = firebase.apps.length
        ? firebase.app()
        : firebase.initializeApp(config);

      _db  = firebase.database(app);
      _ref = _db.ref('bwo/state');

      /* Listen for remote state changes */
      _ref.on('value', function (snapshot) {
        if (_pushing) return;   // ignore echo of our own write
        var data = snapshot.val();
        if (data && _onRemote) {
          console.debug('[BWO_FIREBASE] Remote state received');
          _onRemote(data);
        }
      });

      _enabled = true;
      console.info('[BWO_FIREBASE] Connected to Firebase RTDB');

      /* Authenticate admin silently using email/password stored in config */
      if (config.adminEmail && config.adminPassword) {
        firebase.auth(app)
          .signInWithEmailAndPassword(config.adminEmail, config.adminPassword)
          .then(function () {
            console.info('[BWO_FIREBASE] Admin authenticated');
          })
          .catch(function (err) {
            console.warn('[BWO_FIREBASE] Auth failed — writes will be rejected by RTDB rules', err.message);
          });
      }

    } catch (err) {
      console.error('[BWO_FIREBASE] Connection failed', err);
    }
  }

  /**
   * push(state) → void
   * Writes the full state object to Firebase.
   * No-ops if Firebase is not configured.
   *
   * @param {object} state
   */
  function push(state) {
    if (!_enabled || !_ref) return;
    _pushing = true;
    _ref.set(state)
      .then(function () { _pushing = false; })
      .catch(function (err) {
        _pushing = false;
        console.warn('[BWO_FIREBASE] Push failed', err.message);
      });
  }

  /**
   * isEnabled() → boolean
   * Returns true once Firebase is connected.
   */
  function isEnabled() { return _enabled; }

  return Object.freeze({ init: init, push: push, isEnabled: isEnabled });

})();
