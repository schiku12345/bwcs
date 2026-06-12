/**
 * layoutEditor.js — Admin Layout Editor Module (OBS-style rewrite)
 *
 * A full OBS-like layout editor for dynamic resolution overlay canvas.
 *
 * FEATURES:
 *   • Customizable screen resolution input (width × height)
 *   • Live preview rendering of actual overlay elements
 *   • Drag to move elements (click body)
 *   • 8-handle resize (corners + edges)
 *   • Scale (uniform) via scale handle top-right, or number input
 *   • Snap to canvas edges, canvas centre lines (25/50/75%), and other
 *     element edges — with visual snap guides that appear/disappear
 *   • Alignment toolbar: align left/centre/right/top/middle/bottom
 *     to canvas or to each other
 *   • Per-element position/size/scale numeric readout + direct input
 *   • Keyboard nudge (arrow keys, Shift = 10px) when element is selected
 *   • Reset defaults per element
 *   • Z-order buttons (bring forward / send backward)
 *
 * COORDINATE SYSTEM:
 *   Overlay space: user-defined (via resolution inputs)
 *   Editor space:  scaled div (16:9 aspect ratio)
 *   SCX() / SCY()  convert editor px → overlay px
 *
 * DEPENDS ON: BWO_STATE, BWO_UTILS, BWO_CONST
 * EXPORTS: window.BWO_LAYOUT
 */

'use strict';

window.BWO_LAYOUT = (function () {

  var ST = window.BWO_STATE;
  var U  = window.BWO_UTILS;
  var C  = window.BWO_CONST;

  /* ── Overlay resolution (customizable) ── */
  var _ovW = 1920;
  var _ovH = 1080;

  /* ── Editor canvas dimensions (set on init) ── */
  var _edW = 0;
  var _edH = 0;

  /* ── Currently selected element key ── */
  var _selKey = null;

  /* ── Snap threshold in editor pixels ── */
  var SNAP_THR = 8;

  /* ── Active snap guides (cleared after mouseup) ── */
  var _guideEls = [];

  /* ── Drag state ── */
  var _drag = null;
  /* _drag = {
       key, type ('move'|'resize'),
       handle ('nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'),
       startX, startY,          // mouse start (client)
       startElX, startElY,      // element start pos in editor px
       startElW, startElH,      // element start size in editor px
     } */

  /**
   * Element definitions.
   * Defaults are in OVERLAY SPACE (1920×1080).
   */
  var ELEMENTS = [
    {
      key:     'main',
      label:   'Main Panel',
      icon:    '⬛',
      desc:    'Timer + Teams',
      defLeft:   60,
      defTop:    900,   // 1080 - 80 - ~100 (height)
      defW:      900,
      defH:      100,
      defScale:  1,
      preview: 'main',
    },
    {
      key:     'sb',
      label:   'Scoreboard',
      icon:    '📋',
      desc:    'Standings',
      defLeft:  1632,  // 1920 - 260 - 28
      defTop:    16,
      defW:      260,
      defH:      420,
      defScale:  1,
      preview: 'scoreboard',
    },
    {
      key:     'tp',
      label:   'Info Panel',
      icon:    'ℹ️',
      desc:    'Info Cards',
      defLeft:   28,
      defTop:    16,
      defW:      340,
      defH:      180,
      defScale:  1,
      preview: 'infopanel',
    },
  ];


  /**
   * The overlay always renders in a 1920×1080 viewport (set by meta viewport).
   * _ovW/_ovH = user's actual screen resolution.
   *
   * Elements are stored in 1920×1080 overlay coords.
   * The editor canvas is _edW × _edH pixels wide (CSS pixels).
   *
   * ovToEd*  : overlay coords (1920×1080) → editor canvas px
   * edToOv*  : editor canvas px → overlay coords (1920×1080)
   *
   * When the user changes resolution, we scale the DEFAULT positions
   * proportionally so elements land in the right spot on their screen.
   * But saved positions are always in 1920×1080 space.
   */
  var OV_W = 1920;  // overlay intrinsic width  (fixed)
  var OV_H = 1080;  // overlay intrinsic height (fixed)

  function ovToEdX(ox) { return ox * (_edW / OV_W); }
  function ovToEdY(oy) { return oy * (_edH / OV_H); }
  function edToOvX(ex) { return Math.round(ex * (OV_W / _edW)); }
  function edToOvY(ey) { return Math.round(ey * (OV_H / _edH)); }

  /**
   * Scale a default position from 1920×1080 to _ovW×_ovH proportionally.
   * Used when "Reset" is pressed, so the default lands in the right
   * position for the current screen resolution.
   */
  function _scaleDefault(val, axis) {
    if (axis === 'x') return Math.round(val * (_ovW / OV_W));
    return Math.round(val * (_ovH / OV_H));
  }


  /* ═══════════════════════════════════════════════════════════════
   * STATE ACCESSORS
   * ═══════════════════════════════════════════════════════════════ */

  function _getElState(state, key) {
    var def = ELEMENTS.find(function (e) { return e.key === key; });
    if (!def) return null;

    if (key === 'main') {
      var mainBottom = state.mainPanelBottom != null ? state.mainPanelBottom : 80;
      return {
        left:  state.mainPanelLeft  != null ? state.mainPanelLeft  : def.defLeft,
        top:   OV_H - mainBottom - (state.mainPanelH || def.defH),
        w:     state.mainPanelW     != null ? state.mainPanelW     : def.defW,
        h:     state.mainPanelH     != null ? state.mainPanelH     : def.defH,
        scale: state.mainPanelScale != null ? state.mainPanelScale : def.defScale,
      };
    }
    if (key === 'sb') {
      return {
        left:  state.sbLeft  != null ? state.sbLeft  : def.defLeft,
        top:   state.sbTop   != null ? state.sbTop   : def.defTop,
        w:     state.sbW     != null ? state.sbW     : def.defW,
        h:     state.sbH     != null ? state.sbH     : def.defH,
        scale: state.sbScale != null ? state.sbScale : def.defScale,
      };
    }
    /* tp */
    return {
      left:  state.tpLeft  != null ? state.tpLeft  : def.defLeft,
      top:   state.tpTop   != null ? state.tpTop   : def.defTop,
      w:     state.tpW     != null ? state.tpW     : def.defW,
      h:     state.tpH     != null ? state.tpH     : def.defH,
      scale: state.tpScale != null ? state.tpScale : def.defScale,
    };
  }

  function _setElState(key, ovLeft, ovTop, ovW, ovH, scale) {
    var patch = {};
    if (key === 'main') {
      patch.mainPanelLeft   = ovLeft;
      patch.mainPanelBottom = OV_H - ovTop - ovH;
      patch.mainPanelW      = ovW;
      patch.mainPanelH      = ovH;
      if (scale != null) patch.mainPanelScale = scale;
    } else if (key === 'sb') {
      patch.sbLeft  = ovLeft;
      patch.sbTop   = ovTop;
      patch.sbW     = ovW;
      patch.sbH     = ovH;
      if (scale != null) patch.sbScale = scale;
    } else {
      patch.tpLeft  = ovLeft;
      patch.tpTop   = ovTop;
      patch.tpW     = ovW;
      patch.tpH     = ovH;
      if (scale != null) patch.tpScale = scale;
    }
    ST.update(patch);
  }


  /* ═══════════════════════════════════════════════════════════════
   * RESOLUTION SETTINGS
   * ═══════════════════════════════════════════════════════════════ */

  function setResolution(w, h) {
    _ovW = Math.max(320, parseInt(w) || 1920);
    _ovH = Math.max(180, parseInt(h) || 1080);

    // Update the canvas aspect ratio so the editor reflects the actual screen shape
    var canvas = document.getElementById('le-canvas');
    if (canvas) {
      canvas.style.aspectRatio = _ovW + ' / ' + _ovH;
      _edW = canvas.offsetWidth;
      // After aspect ratio change, offsetHeight may not be updated yet — compute it
      _edH = Math.round(_edW * (_ovH / _ovW));
      if (_edW && _edH) {
        _scaleIframe();
        _buildSnapLines();
        syncFromState();
      }
    }

    // Sync input fields
    var wEl = document.getElementById('le-res-w');
    var hEl = document.getElementById('le-res-h');
    if (wEl) wEl.value = _ovW;
    if (hEl) hEl.value = _ovH;

    // Update active state on preset buttons
    document.querySelectorAll('#le-resolution-controls .le-preset-btn').forEach(function (btn) {
      var text = btn.textContent.replace('×', 'x');
      var match = (_ovW + 'x' + _ovH) === text.replace('×','x');
      btn.classList.toggle('active', match);
    });

    localStorage.setItem('bwo-layout-res-w', _ovW);
    localStorage.setItem('bwo-layout-res-h', _ovH);
  }

  function loadResolution() {
    var w = localStorage.getItem('bwo-layout-res-w');
    var h = localStorage.getItem('bwo-layout-res-h');
    if (w && h) {
      _ovW = parseInt(w);
      _ovH = parseInt(h);
    }
  }


  /* ═══════════════════════════════════════════════════════════════
   * INIT
   * ═══════════════════════════════════════════════════════════════ */

  function initEditor() {
    var canvas = document.getElementById('le-canvas');
    if (!canvas) return;

    loadResolution();

    // Apply the loaded resolution's aspect ratio to the canvas immediately
    canvas.style.aspectRatio = _ovW + ' / ' + _ovH;

    _edW = canvas.offsetWidth;
    // Derive height from aspect ratio rather than offsetHeight (which may still be 16/9)
    _edH = Math.round(_edW * (_ovH / _ovW));
    if (!_edW || !_edH) return;

    _scaleIframe();
    _buildResolutionPanel();
    _buildElements();
    _buildSnapLines();
    _attachCanvasListeners();
    _attachKeyListeners();
    syncFromState();
    _buildInspector();

    if (!canvas._resizeObserver) {
      canvas._resizeObserver = new ResizeObserver(function () {
        var newW = canvas.offsetWidth;
        var newH = Math.round(newW * (_ovH / _ovW));
        if (newW === _edW && newH === _edH) return;
        _edW = newW;
        _edH = newH;
        _scaleIframe();
        _buildSnapLines();
        syncFromState();
      });
      canvas._resizeObserver.observe(canvas);
    }
  }

  /** Scale the iframe so the overlay fills the editor canvas exactly. */
  function _scaleIframe() {
    var iframe = document.getElementById('le-iframe');
    if (!iframe) return;
    // The iframe's intrinsic size is always 1920×1080 (overlay meta viewport).
    // The canvas aspect ratio is set to _ovW×_ovH by setResolution(), so _edH
    // always equals canvas.offsetWidth * (_ovH / _ovW). Scaling from 1920×1080
    // to _edW×_edH fills the canvas correctly for any chosen resolution.
    var scaleX = _edW / 1920;
    var scaleY = _edH / 1080;
    iframe.style.transform = 'scale(' + scaleX + ',' + scaleY + ')';
  }

  function _buildResolutionPanel() {
    var container = document.getElementById('le-resolution-controls');
    if (!container) return;

    var presets = [
      [1920, 1080],
      [1366, 768],
      [1336, 756],
      [2560, 1440],
      [1280, 720],
    ];

    var presetBtns = presets.map(function (p) {
      var active = (p[0] === _ovW && p[1] === _ovH) ? ' active' : '';
      return '<button class="le-preset-btn' + active + '" onclick="BWO_LAYOUT.setResolution(' + p[0] + ',' + p[1] + ')">' + p[0] + '×' + p[1] + '</button>';
    }).join('');

    container.innerHTML =
      '<div style="margin-bottom:10px;">' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">' +
          '<label style="font-family:var(--fd);font-size:10px;font-weight:700;letter-spacing:.5px;color:var(--mut);white-space:nowrap;">SCREEN RES:</label>' +
          '<input type="number" id="le-res-w" min="320" value="' + _ovW + '" style="width:75px;" onchange="BWO_LAYOUT.updateResolution()"/>' +
          '<span style="color:var(--mut);font-size:13px;">×</span>' +
          '<input type="number" id="le-res-h" min="180" value="' + _ovH + '" style="width:75px;" onchange="BWO_LAYOUT.updateResolution()"/>' +
          '<button class="btn btn-g btn-sm" style="font-size:9px;padding:4px 8px;margin-left:4px;" onclick="BWO_LAYOUT.resetResolution()">↺ Reset</button>' +
        '</div>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap;">' + presetBtns + '</div>' +
      '</div>';
  }

  function updateResolution() {
    var wEl = document.getElementById('le-res-w');
    var hEl = document.getElementById('le-res-h');
    if (!wEl || !hEl) return;
    setResolution(parseInt(wEl.value) || _ovW, parseInt(hEl.value) || _ovH);
  }

  function resetResolution() {
    setResolution(1920, 1080);
  }

  /**
   * _buildElements() → void
   * Creates transparent draggable handle divs inside #le-handles (on top of the iframe).
   */
  function _buildElements() {
    var layer = document.getElementById('le-handles');
    if (!layer) return;

    ELEMENTS.forEach(function (def) {
      var existing = layer.querySelector('[data-le-key="' + def.key + '"]');
      if (existing) return;

      var el = document.createElement('div');
      el.className = 'le2-el';
      el.setAttribute('data-le-key', def.key);
      el.setAttribute('data-label', def.icon + ' ' + def.label);

      ['nw','n','ne','e','se','s','sw','w'].forEach(function (pos) {
        var rh = document.createElement('div');
        rh.className = 'le2-rh le2-rh-' + pos;
        rh.setAttribute('data-rh', pos);
        el.appendChild(rh);
      });

      layer.appendChild(el);
    });
  }

  /**
   * _buildSnapLines() → void
   * Draws static grid lines at 25/50/75% of the canvas (both axes).
   * These stay visible at all times to aid element alignment.
   * Snap guides appear dynamically during drag on top of these.
   */
  function _buildSnapLines() {
    var layer = document.getElementById('le-handles');
    if (!layer) return;

    // Remove any previously built static guides
    layer.querySelectorAll('.le2-static-guide').forEach(function (el) {
      el.parentNode.removeChild(el);
    });

    // Draw vertical lines at 25%, 50%, 75%
    [0.25, 0.5, 0.75].forEach(function (frac) {
      var g = document.createElement('div');
      g.className = 'le2-static-guide le2-guide-v';
      g.style.left = (frac * 100) + '%';
      layer.appendChild(g);
    });

    // Draw horizontal lines at 25%, 50%, 75%
    [0.25, 0.5, 0.75].forEach(function (frac) {
      var g = document.createElement('div');
      g.className = 'le2-static-guide le2-guide-h';
      g.style.top = (frac * 100) + '%';
      layer.appendChild(g);
    });
  }


  /* ═══════════════════════════════════════════════════════════════
   * SYNC STATE → DOM
   * ═══════════════════════════════════════════════════════════════ */

  function syncFromState() {
    if (!_edW) return;
    var state = ST.get();
    var layer = document.getElementById('le-handles');
    if (!layer) return;

    ELEMENTS.forEach(function (def) {
      var el = layer.querySelector('[data-le-key="' + def.key + '"]');
      if (!el) return;

      var ovState = _getElState(state, def.key);
      if (!ovState) return;

      el.style.left   = ovToEdX(ovState.left) + 'px';
      el.style.top    = ovToEdY(ovState.top)  + 'px';
      el.style.width  = ovToEdX(ovState.w)    + 'px';
      el.style.height = ovToEdY(ovState.h)    + 'px';

      el.classList.toggle('le2-selected', def.key === _selKey);
    });

    _updateInspector();
  }


  /* ═══════════════════════════════════════════════════════════════
   * MOUSE LISTENERS
   * ═══════════════════════════════════════════════════════════════ */

  function _attachCanvasListeners() {
    var layer = document.getElementById('le-handles');
    if (!layer) return;

    layer.addEventListener('mousedown', function (e) {
      /* Click on empty layer → deselect */
      var el = e.target.closest('[data-le-key]');
      if (!el) { _selectEl(null); return; }

      var key = el.getAttribute('data-le-key');
      _selectEl(key);

      var rh = e.target.closest('[data-rh]');
      var handlePos = rh ? rh.getAttribute('data-rh') : null;

      e.preventDefault();

      _drag = {
        key:      key,
        type:     handlePos ? 'resize' : 'move',
        handle:   handlePos,
        startX:   e.clientX,
        startY:   e.clientY,
        startElX: parseFloat(el.style.left) || 0,
        startElY: parseFloat(el.style.top)  || 0,
        startElW: el.offsetWidth,
        startElH: el.offsetHeight,
      };
    });

    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mouseup',   _onMouseUp);
  }

  function _onMouseMove(e) {
    if (!_drag) return;
    e.preventDefault();

    var dx = e.clientX - _drag.startX;
    var dy = e.clientY - _drag.startY;

    var layer = document.getElementById('le-handles');
    if (!layer) return;
    var el = layer.querySelector('[data-le-key="' + _drag.key + '"]');
    if (!el) return;

    if (_drag.type === 'move') {
      var rawX = _drag.startElX + dx;
      var rawY = _drag.startElY + dy;

      rawX = Math.max(0, Math.min(rawX, _edW - el.offsetWidth));
      rawY = Math.max(0, Math.min(rawY, _edH - el.offsetHeight));

      var snapped = _snapPosition(rawX, rawY, el.offsetWidth, el.offsetHeight, _drag.key);

      el.style.left = snapped.x + 'px';
      el.style.top  = snapped.y + 'px';

      var ovState = _getElState(ST.get(), _drag.key);
      _setElState(_drag.key,
        edToOvX(snapped.x), edToOvY(snapped.y),
        edToOvX(el.offsetWidth), edToOvY(el.offsetHeight),
        ovState ? ovState.scale : 1
      );

    } else if (_drag.type === 'resize') {
      _applyResize(el, dx, dy);
    }

    _updateInspector();
  }

  function _applyResize(el, dx, dy) {
    var h   = _drag.handle;
    var sx  = _drag.startElX;
    var sy  = _drag.startElY;
    var sw  = _drag.startElW;
    var sh  = _drag.startElH;

    var newX = sx, newY = sy, newW = sw, newH = sh;

    /* Horizontal */
    if (h === 'nw' || h === 'w' || h === 'sw') {
      newX = sx + dx;
      newW = sw - dx;
    }
    if (h === 'ne' || h === 'e' || h === 'se') {
      newW = sw + dx;
    }
    /* Vertical */
    if (h === 'nw' || h === 'n' || h === 'ne') {
      newY = sy + dy;
      newH = sh - dy;
    }
    if (h === 'sw' || h === 's' || h === 'se') {
      newH = sh + dy;
    }

    /* Minimum size */
    var minW = 20, minH = 12;
    if (newW < minW) { if (h.includes('w')) newX = sx + sw - minW; newW = minW; }
    if (newH < minH) { if (h.includes('n')) newY = sy + sh - minH; newH = minH; }

    /* Clamp to canvas */
    if (newX < 0) { newW += newX; newX = 0; }
    if (newY < 0) { newH += newY; newY = 0; }
    newW = Math.min(newW, _edW - newX);
    newH = Math.min(newH, _edH - newY);

    /* Snap edges */
    var snapResult = _snapResize(newX, newY, newW, newH, h, _drag.key);
    newX = snapResult.x; newY = snapResult.y;
    newW = snapResult.w; newH = snapResult.h;

    el.style.left   = newX + 'px';
    el.style.top    = newY + 'px';
    el.style.width  = newW + 'px';
    el.style.height = newH + 'px';

    var ovState = _getElState(ST.get(), _drag.key);
    _setElState(_drag.key,
      edToOvX(newX), edToOvY(newY),
      edToOvX(newW), edToOvY(newH),
      ovState ? ovState.scale : 1
    );
  }

  function _onMouseUp() {
    _drag = null;
    _clearGuides();
  }


  /* ═══════════════════════════════════════════════════════════════
   * KEYBOARD NUDGE
   * ═══════════════════════════════════════════════════════════════ */

  var _keyListenerAttached = false;

  function _attachKeyListeners() {
    if (_keyListenerAttached) return;
    _keyListenerAttached = true;

    document.addEventListener('keydown', function (e) {
      if (!_selKey) return;
      /* Only nudge when layout editor page is visible */
      var page = document.getElementById('pg-layout');
      if (!page || !page.classList.contains('active')) return;

      /* Ignore if user is typing in an input */
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      var step = e.shiftKey ? 10 : 1;
      var state = ST.get();
      var ovState = _getElState(state, _selKey);
      if (!ovState) return;

      var ox = ovState.left, oy = ovState.top;

      if (e.key === 'ArrowLeft')  { ox -= step; e.preventDefault(); }
      if (e.key === 'ArrowRight') { ox += step; e.preventDefault(); }
      if (e.key === 'ArrowUp')    { oy -= step; e.preventDefault(); }
      if (e.key === 'ArrowDown')  { oy += step; e.preventDefault(); }

      _setElState(_selKey, ox, oy, ovState.w, ovState.h, ovState.scale);
      syncFromState();
    });
  }


  /* ═══════════════════════════════════════════════════════════════
   * SNAP
   * ═══════════════════════════════════════════════════════════════ */

  function _getSnapPoints() {
    return {
      x: [0, _edW * 0.25, _edW * 0.5, _edW * 0.75, _edW],
      y: [0, _edH * 0.25, _edH * 0.5, _edH * 0.75, _edH],
    };
  }

  function _addOtherElSnapPoints(pts, excludeKey) {
    var layer = document.getElementById('le-handles');
    if (!layer) return;
    layer.querySelectorAll('[data-le-key]').forEach(function (other) {
      if (other.getAttribute('data-le-key') === excludeKey) return;
      var ol = parseFloat(other.style.left) || 0;
      var ot = parseFloat(other.style.top)  || 0;
      var ow = other.offsetWidth;
      var oh = other.offsetHeight;
      pts.x.push(ol, ol + ow, ol + ow / 2);
      pts.y.push(ot, ot + oh, ot + oh / 2);
    });
  }

  function _snap1(value, points) {
    for (var i = 0; i < points.length; i++) {
      if (Math.abs(value - points[i]) <= SNAP_THR) return points[i];
    }
    return value;
  }

  function _snapPosition(x, y, w, h, key) {
    var pts = _getSnapPoints();
    _addOtherElSnapPoints(pts, key);
    _clearGuides();

    var sx  = _snap1(x,     pts.x);
    var sx2 = _snap1(x + w, pts.x);
    if (sx2 !== x + w) sx = sx2 - w;

    var sy  = _snap1(y,     pts.y);
    var sy2 = _snap1(y + h, pts.y);
    if (sy2 !== y + h) sy = sy2 - h;

    if (sx !== x) _showGuide(sx, true);
    if (sy !== y) _showGuide(sy, false);

    return { x: Math.max(0, sx), y: Math.max(0, sy) };
  }

  function _snapResize(x, y, w, h, handle, key) {
    var pts = _getSnapPoints();
    _addOtherElSnapPoints(pts, key);
    _clearGuides();

    var r = x + w, b = y + h;

    if (handle.includes('w')) {
      var sx = _snap1(x, pts.x);
      if (sx !== x) { w += (x - sx); x = sx; _showGuide(x, true); }
    }
    if (handle.includes('e')) {
      var sr = _snap1(r, pts.x);
      if (sr !== r) { w += (sr - r); _showGuide(sr, true); }
    }
    if (handle.includes('n')) {
      var sy = _snap1(y, pts.y);
      if (sy !== y) { h += (y - sy); y = sy; _showGuide(y, false); }
    }
    if (handle.includes('s')) {
      var sb = _snap1(b, pts.y);
      if (sb !== b) { h += (sb - b); _showGuide(sb, false); }
    }

    return { x: x, y: y, w: Math.max(20, w), h: Math.max(12, h) };
  }


  /* ═══════════════════════════════════════════════════════════════
   * SNAP GUIDES
   * ═══════════════════════════════════════════════════════════════ */

  function _showGuide(pos, isVertical) {
    var layer = document.getElementById('le-handles');
    if (!layer) return;
    var g = document.createElement('div');
    g.className = 'le2-snap-guide ' + (isVertical ? 'le2-guide-v' : 'le2-guide-h');
    if (isVertical) g.style.left = pos + 'px';
    else            g.style.top  = pos + 'px';
    layer.appendChild(g);
    _guideEls.push(g);
  }

  function _clearGuides() {
    _guideEls.forEach(function (g) { if (g.parentNode) g.parentNode.removeChild(g); });
    _guideEls = [];
  }


  /* ═══════════════════════════════════════════════════════════════
   * SELECTION
   * ═══════════════════════════════════════════════════════════════ */

  function _selectEl(key) {
    _selKey = key;
    var layer = document.getElementById('le-handles');
    if (layer) {
      layer.querySelectorAll('[data-le-key]').forEach(function (el) {
        el.classList.toggle('le2-selected', el.getAttribute('data-le-key') === key);
      });
    }
    _updateInspector();
  }


  /* ═══════════════════════════════════════════════════════════════
   * INSPECTOR PANEL
   * ═══════════════════════════════════════════════════════════════ */

  function _buildInspector() {
    var panel = document.getElementById('le-inspector');
    if (!panel) return;

    panel.innerHTML =
      '<div style="font-family:var(--fd);font-size:8px;font-weight:700;letter-spacing:1.5px;color:var(--mut);margin-bottom:8px;">SELECTED ELEMENT</div>' +
      '<div id="le-sel-name" style="font-size:11px;font-weight:700;color:var(--acc2);margin-bottom:8px;">— None —</div>' +
      '<div id="le-dimension-display" style="font-family:var(--fd);font-size:7px;color:var(--mut);margin-bottom:10px;padding:4px;background:rgba(255,255,255,.03);border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>' +

      '<div class="le-insp-grid">' +
        '<div class="le-insp-field"><label>X</label><input type="number" id="le-inp-x" class="le-inp" onchange="BWO_LAYOUT.inspInput(\'x\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"/></div>' +
        '<div class="le-insp-field"><label>Y</label><input type="number" id="le-inp-y" class="le-inp" onchange="BWO_LAYOUT.inspInput(\'y\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"/></div>' +
        '<div class="le-insp-field"><label>W</label><input type="number" id="le-inp-w" class="le-inp" onchange="BWO_LAYOUT.inspInput(\'w\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"/></div>' +
        '<div class="le-insp-field"><label>H</label><input type="number" id="le-inp-h" class="le-inp" onchange="BWO_LAYOUT.inspInput(\'h\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"/></div>' +
        '<div class="le-insp-field" style="grid-column:span 2;"><label>Scale</label><input type="number" id="le-inp-scale" class="le-inp" step="0.05" min="0.1" max="5" onchange="BWO_LAYOUT.inspInput(\'scale\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"/></div>' +
      '</div>' +

      '<div style="font-family:var(--fd);font-size:8px;font-weight:700;letter-spacing:1.5px;color:var(--mut);margin:10px 0 6px;">ALIGN TO CANVAS</div>' +
      '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
        '<button class="le-al-btn" title="Align Left"   onclick="BWO_LAYOUT.align(\'left\')">⬤◁</button>' +
        '<button class="le-al-btn" title="Centre H"     onclick="BWO_LAYOUT.align(\'centerH\')">⬤|⬤</button>' +
        '<button class="le-al-btn" title="Align Right"  onclick="BWO_LAYOUT.align(\'right\')">▷⬤</button>' +
        '<button class="le-al-btn" title="Align Top"    onclick="BWO_LAYOUT.align(\'top\')">⬤△</button>' +
        '<button class="le-al-btn" title="Centre V"     onclick="BWO_LAYOUT.align(\'centerV\')">⬤—⬤</button>' +
        '<button class="le-al-btn" title="Align Bottom" onclick="BWO_LAYOUT.align(\'bottom\')">▽⬤</button>' +
      '</div>' +

      '<div style="font-family:var(--fd);font-size:8px;font-weight:700;letter-spacing:1.5px;color:var(--mut);margin:10px 0 6px;">ELEMENT</div>' +
      '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
        '<button class="btn btn-g btn-sm" style="font-size:9px;" onclick="BWO_LAYOUT.resetSelected()">↺ Reset</button>' +
      '</div>';
  }

  function _updateInspector() {
    var nameEl = document.getElementById('le-sel-name');
    if (!nameEl) return;

    if (!_selKey) {
      nameEl.textContent = '— None —';
      ['x','y','w','h','scale'].forEach(function (f) {
        var inp = document.getElementById('le-inp-' + f);
        if (inp) { inp.value = ''; inp.disabled = true; }
      });
      _updateDimensionDisplay(null);
      return;
    }

    var def = ELEMENTS.find(function (e) { return e.key === _selKey; });
    nameEl.textContent = def ? (def.icon + ' ' + def.label) : _selKey;

    var state   = ST.get();
    var ovState = _getElState(state, _selKey);
    if (!ovState) return;

    var fields = { x: ovState.left, y: ovState.top, w: ovState.w, h: ovState.h, scale: ovState.scale };
    Object.keys(fields).forEach(function (f) {
      var inp = document.getElementById('le-inp-' + f);
      if (!inp) return;
      inp.disabled = false;
      // Never overwrite a field the user is currently typing in
      if (inp === document.activeElement) return;
      inp.value = f === 'scale' ? ovState.scale.toFixed(2) : Math.round(fields[f]);
    });
    
    _updateDimensionDisplay(ovState);
  }

  function _updateDimensionDisplay(ovState) {
    var dimEl = document.getElementById('le-dimension-display');
    if (!dimEl || !ovState) return;
    
    dimEl.textContent = 
      'Pos: ' + Math.round(ovState.left) + ',' + Math.round(ovState.top) + 
      '  ·  Size: ' + Math.round(ovState.w) + '×' + Math.round(ovState.h) +
      '  ·  Scale: ' + ovState.scale.toFixed(2) + 'x';
  }

  /**
   * inspInput(field, value) → void
   * Called from inspector input changes.
   */
  function inspInput(field, value) {
    if (!_selKey) return;
    var v = parseFloat(value);
    if (isNaN(v)) return;

    var state   = ST.get();
    var ovState = _getElState(state, _selKey);
    if (!ovState) return;

    var x = ovState.left, y = ovState.top, w = ovState.w, h = ovState.h, sc = ovState.scale;

    if (field === 'x')     x  = v;
    if (field === 'y')     y  = v;
    if (field === 'w')     w  = Math.max(10, v);
    if (field === 'h')     h  = Math.max(6,  v);
    if (field === 'scale') sc = Math.max(0.1, Math.min(5, v));

    _setElState(_selKey, x, y, w, h, sc);
    syncFromState();
  }


  /* ═══════════════════════════════════════════════════════════════
   * ALIGNMENT
   * ═══════════════════════════════════════════════════════════════ */

  function align(type) {
    if (!_selKey) return;
    var state   = ST.get();
    var ovState = _getElState(state, _selKey);
    if (!ovState) return;

    var x = ovState.left, y = ovState.top, w = ovState.w, h = ovState.h;

    // Align within the user's screen resolution, mapped to overlay coords
    var screenW = _ovW, screenH = _ovH;
    // Convert screen coords to overlay coords for storage
    var rightEdge  = Math.round(screenW * (OV_W / _ovW));
    var bottomEdge = Math.round(screenH * (OV_H / _ovH));

    if (type === 'left')    x = 0;
    if (type === 'right')   x = rightEdge - w;
    if (type === 'centerH') x = Math.round((rightEdge - w) / 2);
    if (type === 'top')     y = 0;
    if (type === 'bottom')  y = bottomEdge - h;
    if (type === 'centerV') y = Math.round((bottomEdge - h) / 2);

    _setElState(_selKey, Math.round(x), Math.round(y), w, h, ovState.scale);
    syncFromState();
  }


  /* ═══════════════════════════════════════════════════════════════
   * RESET
   * ═══════════════════════════════════════════════════════════════ */

  function resetElement(key) {
    var def = ELEMENTS.find(function (e) { return e.key === key; });
    if (!def) return;

    // Scale the defaults from 1920×1080 to the user's chosen screen resolution
    var scaleX = _ovW / OV_W;
    var scaleY = _ovH / OV_H;
    _setElState(key,
      Math.round(def.defLeft * scaleX),
      Math.round(def.defTop  * scaleY),
      Math.round(def.defW    * scaleX),
      Math.round(def.defH    * scaleY),
      def.defScale
    );
    syncFromState();
  }

  function resetSelected() {
    if (_selKey) resetElement(_selKey);
  }


  /* ═══════════════════════════════════════════════════════════════
   * DISPLAY SETTINGS
   * ═══════════════════════════════════════════════════════════════ */

  function saveDisplaySettings() {
    var cycleEl = document.getElementById('inp-cycle');
    var transEl = document.getElementById('inp-trans');
    var autoEl  = document.getElementById('inp-auto');

    ST.update({
      cycleInterval: parseInt((cycleEl || {}).value) || 8,
      transition:    (transEl || {}).value || 'slide',
      autoCycle:     autoEl ? autoEl.checked : true,
    });
  }

  function loadDisplaySettings(state) {
    var cycleEl = document.getElementById('inp-cycle');
    var transEl = document.getElementById('inp-trans');
    var autoEl  = document.getElementById('inp-auto');

    if (cycleEl && document.activeElement !== cycleEl) cycleEl.value = state.cycleInterval || 8;
    if (transEl && document.activeElement !== transEl) transEl.value = state.transition    || 'slide';
    if (autoEl) autoEl.checked = state.autoCycle !== false;
  }


  /* ─── Public API ──────────────────────────────────────────────── */
  return Object.freeze({
    initEditor,
    syncFromState,
    resetElement,
    resetSelected,
    align,
    inspInput,
    setResolution,
    updateResolution,
    resetResolution,
    saveDisplaySettings,
    loadDisplaySettings,
  });

})();
