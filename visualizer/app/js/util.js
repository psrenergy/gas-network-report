/* Small shared helpers: DOM, events, formatting, colour scales, geometry. */
(function () {
  'use strict';
  var U = GV.util = {};

  // ---------- DOM ----------
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  /** h('div.cls#id', {attr}, children...) */
  U.h = function (tag, attrs) {
    var m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i) || [];
    var el = document.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, function (_, t, n) { if (t === '.') el.classList.add(n); else el.id = n; });
    var kids = Array.prototype.slice.call(arguments, 2);
    if (attrs && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    (function add(list) {
      list.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        if (Array.isArray(c)) add(c);
        else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(kids);
    return el;
  };
  U.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  U.debounce = function (fn, ms) {
    var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  };
  U.rafThrottle = function (fn) {
    var pending = false, args;
    return function () { args = arguments; if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; fn.apply(null, args); }); };
  };

  // ---------- storage (per-user preferences) ----------
  U.store = {
    get: function (k, d) { try { var v = localStorage.getItem('gv:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('gv:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  // ---------- toast ----------
  U.toast = function (msg, kind) {
    var host = U.$('#toasts');
    if (!host) return;
    var t = U.h('div.toast' + (kind ? '.' + kind : ''), msg);
    host.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 2600);
    setTimeout(function () { t.remove(); }, 3100);
  };

  U.copy = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { U.toast('Copied “' + text + '”'); }, fallback);
    } else fallback();
    function fallback() {
      var ta = U.h('textarea', { style: { position: 'fixed', opacity: 0 } }, text);
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); U.toast('Copied “' + text + '”'); } catch (e) { U.toast('Copy failed', 'warn'); }
      ta.remove();
    }
  };

  U.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/octet-stream' });
    var a = U.h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  // ---------- units & formatting ----------
  U.unitOpt = function (unitKey) {
    var u = GV.config.units[unitKey];
    if (!u) return { label: '', factor: 1, digits: 2 };
    var chosen = (GV.state && GV.state.get('units') || {})[unitKey];
    return u.options.filter(function (o) { return o.id === chosen; })[0] || u.options[0];
  };
  U.unitLabel = function (unitKey) { return U.unitOpt(unitKey).label; };
  U.conv = function (v, unitKey) { return v * U.unitOpt(unitKey).factor; };
  U.fmtNum = function (v, digits) {
    if (v === null || v === undefined || isNaN(v)) return '–';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    var a = Math.abs(v);
    var d = digits !== undefined ? digits : (a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 3);
    return v.toLocaleString(GV.i18n ? GV.i18n.locale : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/^-/, '−');
  };
  /** Format a base-unit value in the user's display unit, with unit label. */
  U.fmt = function (v, unitKey, opts) {
    opts = opts || {};
    var o = U.unitOpt(unitKey);
    if (v === null || v === undefined || isNaN(v)) return '–';
    var s = U.fmtNum(v * o.factor, opts.digits !== undefined ? opts.digits : o.digits);
    if (opts.sign && v > 0) s = '+' + s;
    return opts.noUnit ? s : s + (unitKey === 'pct' ? '%' : ' ' + o.label);
  };

  // ---------- colours ----------
  function hex2rgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function rgb2hex(c) { return '#' + c.map(function (x) { var s = Math.round(Math.max(0, Math.min(255, x))).toString(16); return s.length < 2 ? '0' + s : s; }).join(''); }
  U.hex2rgb = hex2rgb;
  U.ramp = function (stops) {
    var rgb = stops.map(hex2rgb);
    return function (t) {
      if (isNaN(t)) return '#999999';
      t = Math.max(0, Math.min(1, t));
      var x = t * (rgb.length - 1), i = Math.min(Math.floor(x), rgb.length - 2), f = x - i;
      return rgb2hex([0, 1, 2].map(function (k) { return rgb[i][k] + (rgb[i + 1][k] - rgb[i][k]) * f; }));
    };
  };
  U.palettes = {
    // perceptually ordered ramps
    flow: ['#c9dcee', '#8fb8dc', '#4f8fc7', '#2266a8', '#0b3f7a'],
    cost: ['#fde68a', '#f7b449', '#ec7c30', '#d0452b', '#96203a', '#4c1446'],
    seq: ['#e0ecf4', '#9ebcda', '#8c96c6', '#8856a7', '#810f7c'],
    // the neutral middle is a mid grey so that 'no change' stays visible on light basemaps
    diverging: ['#2166ac', '#4393c3', '#92c5de', '#b9bec6', '#f4a582', '#d6604d', '#b2182b'],
    divergingDark: ['#4b8fd6', '#5f93bf', '#5a6f86', '#5b6472', '#8a6a63', '#d8745a', '#f0506e']
  };
  /** Diverging palette with a neutral middle that stays readable on the current theme. */
  U.divergingStops = function () { return document.documentElement.dataset.theme === 'dark' ? U.palettes.divergingDark : U.palettes.diverging; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };

  // ---------- geometry ----------
  U.haversine = function (a, b) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  };
  U.lineLength = function (coords) {
    var L = 0; for (var i = 1; i < coords.length; i++) L += U.haversine(coords[i - 1], coords[i]); return L;
  };
  U.midpoint = function (coords) {
    var total = U.lineLength(coords), half = total / 2, acc = 0;
    for (var i = 1; i < coords.length; i++) {
      var seg = U.haversine(coords[i - 1], coords[i]);
      if (acc + seg >= half) {
        var f = seg ? (half - acc) / seg : 0;
        return [U.lerp(coords[i - 1][0], coords[i][0], f), U.lerp(coords[i - 1][1], coords[i][1], f)];
      }
      acc += seg;
    }
    return coords[Math.floor(coords.length / 2)];
  };
  /** Quadratic curve between a and b; offset is a fraction of the segment length (sign = side). */
  U.curve = function (a, b, offset, n) {
    n = n || 16;
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var cx = mx - dy * offset, cy = my + dx * offset;
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      pts.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
    }
    return pts;
  };
  U.bbox = function (coordsList) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    coordsList.forEach(function (c) { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); });
    return [[b[0], b[1]], [b[2], b[3]]];
  };

  U.escapeHtml = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };

  U.cssVar = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
})();
