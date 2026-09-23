/*
 * Map view (MapLibre GL / WebGL).
 *
 * Each user layer (js/layers.js) gets its own GeoJSON sources and MapLibre layers:
 *   arcs   -> line, wide invisible hit line, direction arrows (sized by a field), optional animation, labels
 *   points -> SDF symbol (shape, colour, size, offset around the node, outline), labels
 *   ref    -> reference lines or points (EPE)
 * MapLibre layers are rebuilt only when a layer's structure changes; data is refreshed on every
 * change of period, scenario, block, comparison, filters or style.
 * Two hidden base sources ('arcs', 'nodes') draw the hover / selection / highlight halos.
 */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, C = GV.config, LY = GV.layers;
  var M = GV.map = {};
  var map, hover = null, filterPass = null, builds = {}, structSig = '', baseSig = '';
  var SEL = '#26828C', HL = '#AB9671';   // PSR teal = selection, PSR gold = analysis highlight
  var EMPTY = { type: 'FeatureCollection', features: [] };
  function fc(features) { return { type: 'FeatureCollection', features: features }; }
  function fs(name, def) { return ['coalesce', ['feature-state', name], def]; }

  M.init = function (container) {
    var cfg = C.basemaps;
    function raster(b) { return { type: 'raster', tiles: b.tiles, tileSize: 256, attribution: b.attribution, maxzoom: b.maxzoom || 19 }; }
    map = M.map = new maplibregl.Map({
      container: container,
      style: {
        version: 8, glyphs: C.glyphs,
        sources: {
          'bg-light': raster(cfg.light), 'bg-dark': raster(cfg.dark), 'bg-satellite': raster(cfg.satellite), 'bg-terrain': raster(cfg.terrain),
          'labels-light': { type: 'raster', tiles: C.labelsOverlay.light, tileSize: 256, maxzoom: 16 },
          'labels-dark': { type: 'raster', tiles: C.labelsOverlay.dark, tileSize: 256, maxzoom: 16 }
        },
        layers: [
          { id: 'bg-color', type: 'background', paint: { 'background-color': '#eef1f4' } },
          { id: 'bg-light', type: 'raster', source: 'bg-light' },
          { id: 'bg-dark', type: 'raster', source: 'bg-dark', layout: { visibility: 'none' } },
          { id: 'bg-satellite', type: 'raster', source: 'bg-satellite', layout: { visibility: 'none' } },
          { id: 'bg-terrain', type: 'raster', source: 'bg-terrain', layout: { visibility: 'none' } }
        ]
      },
      center: [-47, -15], zoom: 3.6, attributionControl: { compact: true },
      boxZoom: false, doubleClickZoom: false, dragRotate: false, pitchWithRotate: false, preserveDrawingBuffer: true
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

    map.on('load', function () {
      addImages();
      addBaseLayers();
      loadAdmin();
      M.ready = true;
      M.syncCase();
      bindInteractions();
      M.applyBackground();
      M.render();
      var onZoom = U.rafThrottle(function () { placeOverlays(false); });
      map.on('zoom', onZoom);
      map.on('zoomend', function () { placeOverlays(true); });
      map.on('moveend', function () { placeOverlays(false); });
    });
    map.on('error', function (e) { if (e && e.error && !/tile|glyph|pbf|Failed to fetch/i.test(String(e.error.message))) console.warn(e.error); });

    var rerender = U.rafThrottle(function () { M.render(); });
    st.on('caseId casesVersion geomMode', function () { M.syncCase(); rerender(); });
    st.on('layerList stage seq block compare units bins lockScale theme filters', rerender);
    st.on('selection highlight', function () { M.updateSelection(); });
    st.on('basemap admin theme placeLabels', function () { M.applyBackground(); });
    st.on('animateArrows', function () { updateAnimation(); });
    st.on('parallelGap', rerender);
  };

  // ---------- symbol images: signed distance fields, so colour and outline are set per feature ----------
  function sdfImage(w, h, draw, ratio) {
    ratio = ratio || 2;
    var W = w * ratio, H = h * ratio, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d'); g.scale(ratio, ratio); g.fillStyle = '#000'; draw(g);
    var a = g.getImageData(0, 0, W, H).data, inside = new Uint8Array(W * H), bIn = [], bOut = [];
    for (var i = 0; i < W * H; i++) inside[i] = a[i * 4 + 3] > 127 ? 1 : 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var k = y * W + x, v = inside[k];
      var edge = (x > 0 && inside[k - 1] !== v) || (x < W - 1 && inside[k + 1] !== v) || (y > 0 && inside[k - W] !== v) || (y < H - 1 && inside[k + W] !== v);
      if (edge) (v ? bIn : bOut).push(x, y);
    }
    var radius = 8, out = new Uint8ClampedArray(W * H * 4);
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
      var kk = yy * W + xx, list = inside[kk] ? bOut : bIn, best = Infinity;
      for (var j = 0; j < list.length; j += 2) { var dx = list[j] - xx, dy = list[j + 1] - yy, d = dx * dx + dy * dy; if (d < best) best = d; }
      var dist = Math.sqrt(best) - 0.5; if (!isFinite(dist)) dist = radius;
      var sd = inside[kk] ? -dist : dist;
      out[kk * 4 + 3] = Math.max(0, Math.min(255, Math.round(255 - 255 * (sd / radius + 0.25))));
    }
    return { img: { width: W, height: H, data: out }, opts: { pixelRatio: ratio, sdf: true } };
  }
  function shapePath(g, shape, cx, cy, r) {
    g.beginPath();
    if (shape === 'square') g.rect(cx - r * 0.84, cy - r * 0.84, r * 1.68, r * 1.68);
    else if (shape === 'diamond') { g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); }
    else if (shape === 'triangle') { g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.95, cy + r * 0.75); g.lineTo(cx - r * 0.95, cy + r * 0.75); g.closePath(); }
    else if (shape === 'hexagon') { for (var i = 0; i < 6; i++) { var a = Math.PI / 3 * i + Math.PI / 6; g[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.closePath(); }
    else if (shape === 'star') { for (var k = 0; k < 10; k++) { var b = -Math.PI / 2 + Math.PI / 5 * k, rr = k % 2 ? r * 0.45 : r; g[k ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(b), cy + rr * Math.sin(b)); } g.closePath(); }
    else g.arc(cx, cy, r, 0, Math.PI * 2);
  }
  M.shapePath = shapePath;
  function addImages() {
    var S = LY.SHAPE_PX, pad = 5;
    LY.SHAPES.forEach(function (shape) {
      var im = sdfImage(S + pad * 2, S + pad * 2, function (g) { shapePath(g, shape, S / 2 + pad, S / 2 + pad, S / 2); g.fill(); });
      map.addImage('gv-shape-' + shape, im.img, im.opts);
    });
    var ar = sdfImage(20, 16, function (g) { g.beginPath(); g.moveTo(3, 2.5); g.lineTo(17, 8); g.lineTo(3, 13.5); g.lineTo(6.5, 8); g.closePath(); g.fill(); });
    map.addImage('gv-arrow', ar.img, ar.opts);
  }

  // ---------- base layers (halos) ----------
  function addBaseLayers() {
    ['arcs', 'nodes'].forEach(function (s) { map.addSource(s, { type: 'geojson', data: EMPTY }); });
    map.addSource('admin', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'labels-light', type: 'raster', source: 'labels-light', paint: { 'raster-opacity': 0.55 }, layout: { visibility: 'none' } });
    map.addLayer({ id: 'labels-dark', type: 'raster', source: 'labels-dark', paint: { 'raster-opacity': 0.55 }, layout: { visibility: 'none' } });
    map.addLayer({ id: 'admin-line', type: 'line', source: 'admin', paint: { 'line-color': '#7c8797', 'line-width': 0.7, 'line-opacity': 0.55, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'arc-halo', type: 'line', source: 'arcs', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': ['case', ['boolean', ['feature-state', 'sel'], false], SEL, ['boolean', ['feature-state', 'hl'], false], HL, '#94a3b8'],
      'line-width': ['+', fs('w', 2.5), ['case', ['boolean', ['feature-state', 'sel'], false], 9, ['boolean', ['feature-state', 'hl'], false], 8, ['boolean', ['feature-state', 'hover'], false], 6, 0]],
      'line-opacity': ['case', ['any', ['boolean', ['feature-state', 'sel'], false], ['boolean', ['feature-state', 'hl'], false]], 0.85, ['boolean', ['feature-state', 'hover'], false], 0.55, 0]
    } });
    map.addLayer({ id: 'node-halo', type: 'circle', source: 'nodes', paint: {
      'circle-radius': ['+', fs('r', 6), ['case', ['boolean', ['feature-state', 'sel'], false], 6, ['boolean', ['feature-state', 'hl'], false], 5, ['boolean', ['feature-state', 'hover'], false], 4, 0]],
      'circle-color': ['case', ['boolean', ['feature-state', 'sel'], false], SEL, ['boolean', ['feature-state', 'hl'], false], HL, '#94a3b8'],
      'circle-opacity': ['case', ['any', ['boolean', ['feature-state', 'sel'], false], ['boolean', ['feature-state', 'hl'], false]], 0.9, ['boolean', ['feature-state', 'hover'], false], 0.5, 0]
    } });
  }
  function loadAdmin() {
    if (!C.adminBoundariesUrl) return;
    fetch(C.adminBoundariesUrl).then(function (r) { return r.ok ? r.json() : null; }).then(function (g) {
      if (g && map.getSource('admin')) map.getSource('admin').setData(g);
    }).catch(function () { /* offline: optional */ });
  }

  // ---------- geometry of the current case ----------
  M.geom = function () {
    var c = A.current(); if (!c) return [];
    return c.arcGeometry(st.get('geomMode') || 'real');
  };
  M.invalidate = function () { baseSig = ''; };
  M.syncCase = function () {
    if (!M.ready) return;
    var c = A.current();
    var sig = c ? c.id + '|' + (st.get('geomMode') || 'real') + '|' + Object.keys(c.routes).length : '';
    if (sig === baseSig) return;
    var first = !baseSig || (c && baseSig.split('|')[0] !== c.id);
    baseSig = sig;
    if (!c) { map.getSource('arcs').setData(EMPTY); map.getSource('nodes').setData(EMPTY); return; }
    var g = M.geom();
    map.getSource('arcs').setData(fc(c.arcs.map(function (a, i) { return g[i] ? { type: 'Feature', id: i, properties: { id: a.id }, geometry: { type: 'LineString', coordinates: g[i] } } : null; }).filter(Boolean)));
    map.getSource('nodes').setData(fc(c.nodes.map(function (n, i) { return n.dlat === null ? null : { type: 'Feature', id: i, properties: { id: n.id }, geometry: { type: 'Point', coordinates: [n.dlon, n.dlat] } }; }).filter(Boolean)));
    if (first) M.fitNetwork(true);
    setTimeout(M.updateSelection, 0);
  };

  // ---------- user layers ----------
  function ids(l) { var p = 'u-' + l.id; return { src: p, arr: p + '-arr', lab: p + '-lab', line: p + '-line', hit: p + '-hit', arrow: p + '-arrow', sym: p + '-sym', label: p + '-label' }; }
  function structureOf(list) {
    return list.map(function (l) {
      return [l.id, l.type, LY.geomKind(l), l.visible, l.dash, !!(l.arrows && l.arrows.show), !!(l.labels && l.labels.show), l.labels && l.labels.size, l.labels && l.labels.minzoom, l.minzoom, l.opacity, l.position, l.distance].join(':');
    }).join('|');
  }
  function removeUserLayers() {
    map.getStyle().layers.forEach(function (x) { if (x.id.indexOf('u-') === 0) map.removeLayer(x.id); });
    Object.keys(map.getStyle().sources).forEach(function (s) { if (s.indexOf('u-') === 0) map.removeSource(s); });
  }
  var DASH = { dashed: [2.6, 1.8], dotted: [0.6, 1.6] };
  function rebuildLayers(list) {
    removeUserLayers();
    var visible = list.filter(function (l) { return l.visible; }).slice().reverse();  // bottom first
    var labelLayers = [];
    visible.forEach(function (l) {
      var I = ids(l), kind = LY.geomKind(l), mz = l.minzoom || 0;
      map.addSource(I.src, { type: 'geojson', data: EMPTY });
      map.addSource(I.lab, { type: 'geojson', data: EMPTY });
      var opac = ['*', l.opacity === undefined ? 1 : l.opacity, ['get', 'o']];
      if (kind === 'line') {
        var paint = { 'line-color': ['get', 'c'], 'line-width': ['get', 'w'], 'line-opacity': opac };
        if (DASH[l.dash]) paint['line-dasharray'] = DASH[l.dash];
        map.addLayer({ id: I.line, type: 'line', source: I.src, minzoom: mz, layout: { 'line-cap': DASH[l.dash] ? 'butt' : 'round', 'line-join': 'round' }, paint: paint });
        if (l.type === 'arc' && l.arrows && l.arrows.show) {
          // arrows are points placed along the (offset) line by placeArrows(); same colour as the line, with a contrasting outline
          map.addSource(I.arr, { type: 'geojson', data: EMPTY });
          map.addLayer({ id: I.arrow, type: 'symbol', source: I.arr, minzoom: mz, layout: {
            'icon-image': 'gv-arrow', 'icon-size': ['get', 'as'], 'icon-rotate': ['get', 'r'], 'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true, 'icon-ignore-placement': true
          }, paint: { 'icon-color': ['get', 'c'], 'icon-opacity': opac, 'icon-halo-color': arrowHalo(), 'icon-halo-width': 1.1, 'icon-halo-blur': 0.2 } });
        }
        map.addLayer({ id: I.hit, type: 'line', source: I.src, minzoom: mz, paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': ['max', 12, ['+', ['get', 'w'], 7]] } });
      } else {
        map.addLayer({ id: I.sym, type: 'symbol', source: I.src, minzoom: mz, layout: {
          'icon-image': ['get', 'ic'], 'icon-size': ['get', 's'], 'icon-offset': spreadExpr(l),
          'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['-', 0, ['get', 's']]
        }, paint: { 'icon-color': ['get', 'c'], 'icon-opacity': opac, 'icon-halo-color': ['get', 'hc'], 'icon-halo-width': 1.3, 'icon-halo-blur': 0.3, 'icon-translate': translateOf(l) } });
      }
      if (l.labels && l.labels.show) labelLayers.push(l);
    });
    // labels always above every symbol; arc labels follow the shape and orientation of the pipeline
    labelLayers.forEach(function (l) {
      var I = ids(l), kind = LY.geomKind(l), alongLine = kind === 'line';
      var layout = {
        'text-field': ['get', 't'], 'text-font': C.font, 'text-size': l.labels.size || 11,
        'text-optional': true, 'text-padding': 2
      };
      if (alongLine) Object.assign(layout, { 'symbol-placement': 'line-center', 'text-rotation-alignment': 'map', 'text-keep-upright': true, 'text-max-angle': 35, 'text-allow-overlap': false });
      else Object.assign(layout, { 'text-anchor': 'top', 'text-radial-offset': ['coalesce', ['get', 'ro'], 0], 'text-max-width': 14, 'text-justify': 'center' });
      map.addLayer({ id: I.label, type: 'symbol', source: I.lab, minzoom: Math.max(l.minzoom || 0, l.labels.minzoom || 0), layout: layout,
        paint: { 'text-color': labelColor(), 'text-halo-color': labelHalo(), 'text-halo-width': 1.5, 'text-opacity': ['get', 'o'], 'text-translate': kind === 'point' ? translateOf(l) : [0, 0] } });
    });
  }
  /** Constant pixel offset of a point layer (its position around the node). */
  function translateOf(l) {
    var p = LY.POSITIONS[l.position] || [0, 0], d = l.distance || 0;
    return [Math.round(p[0] * d * 10) / 10, Math.round(p[1] * d * 10) / 10];
  }
  /** Spread several assets of the same node side by side (icon units, scaled by icon-size). */
  function spreadExpr(l) {
    var p = LY.POSITIONS[l.position] || [0, 0], vertical = Math.abs(p[0]) > Math.abs(p[1]);
    var expr = ['match', ['get', 'sk']], step = LY.SHAPE_PX + 3;
    for (var n = 2; n <= 12; n++) for (var k = 0; k < n; k++) {
      var off = (k - (n - 1) / 2) * step;
      expr.push(k + '/' + n, ['literal', vertical ? [0, off] : [off, 0]]);
    }
    expr.push(['literal', [0, 0]]);
    return expr;
  }
  function labelColor() { return A.isDark() || darkBg() ? '#e5e7eb' : '#111827'; }
  function labelHalo() { return A.isDark() || darkBg() ? 'rgba(12,22,38,0.92)' : 'rgba(255,255,255,0.94)'; }
  function arrowHalo() { return A.isDark() || darkBg() ? '#0c1626' : '#ffffff'; }
  function darkBg() { var b = st.get('basemap'); return b === 'dark' || b === 'satellite'; }

  /** Recompute every layer's data for the current state. */
  var overlays = {};   // arc layer id -> { lines: [...], animate, phase, z }
  M.render = function () {
    if (!M.ready) return;
    var c = A.current(), list = st.get('layerList') || [];
    var sig = structureOf(list) + '|' + A.isDark() + '|' + st.get('basemap');
    if (sig !== structSig) { rebuildLayers(list); structSig = sig; }
    builds = {}; var oldOv = overlays; overlays = {};
    if (!c) { if (M.onRender) M.onRender(builds); return; }
    var ctx = LY.context();
    filterPass = c.applyFilters(st.get('filters'), ctx.F);
    var geom = M.geom(), haloArc = {}, haloNode = {};
    list.forEach(function (l) {
      if (!l.visible) return;
      var I = ids(l), b = LY.build(l, ctx, geom, filterPass);
      builds[l.id] = b;
      if (b.pies.length) updatePies(b.pies);
      if (LY.geomKind(l) === 'line' && l.type === 'arc') {
        // arc lines, arrows and labels are (re)placed in screen space by placeOverlays()
        var prev = oldOv[l.id];
        overlays[l.id] = { lines: b.arcLines.map(prepLine), animate: l.animate !== false, phase: prev ? prev.phase : 0, z: null };
      } else {
        if (map.getSource(I.src)) map.getSource(I.src).setData(fc(b.main));
        if (map.getSource(I.lab)) map.getSource(I.lab).setData(fc(b.labels));
      }
      Object.keys(b.haloArc).forEach(function (k) { haloArc[k] = Math.max(haloArc[k] || 0, b.haloArc[k]); });
      Object.keys(b.haloNode).forEach(function (k) { haloNode[k] = Math.max(haloNode[k] || 0, b.haloNode[k]); });
    });
    c.arcs.forEach(function (a, i) { if (M.geom()[i]) map.setFeatureState({ source: 'arcs', id: i }, { w: haloArc[i] || 2.5 }); });
    c.nodes.forEach(function (n, i) { if (n.dlat !== null) map.setFeatureState({ source: 'nodes', id: i }, { r: haloNode[i] || 6 }); });
    placeOverlays(true);
    updateAnimation();
    if (M.onRender) M.onRender(builds);
  };
  M.builds = function () { return builds; };

  // ---------- arrows and line labels: parallel offset in screen space, recomputed on zoom ----------
  function toWorld(c) { var s = Math.sin(c[1] * Math.PI / 180); return [(c[0] + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]; }
  function toLngLat(x, y) { var n = Math.PI - 2 * Math.PI * y; return [x * 360 - 180, 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))]; }
  function prepLine(o) { o.w = o.coords.map(toWorld); return o; }
  /**
   * Pixel polyline (at scale S) of an arc, shifted sideways where it runs parallel to other arcs.
   * Each lane (stretch of vertices) has a target offset in px (positive = right of the drawing direction);
   * the offset is blended linearly over a short ramp between lanes and goes back to zero at both nodes,
   * so parallel pipelines split and merge smoothly instead of jumping.
   */
  var RAMP = 34;
  function laneLine(a, S) {
    var P = a.w.map(function (p) { return [p[0] * S, p[1] * S]; }), n = P.length;
    if (!a.lanes || n < 2) return P;
    var d = [0];
    for (var i = 1; i < n; i++) d.push(d[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    var L = d[n - 1]; if (!L) return P;
    // control points (distance along the line, offset)
    // short or weak lanes get no control points: the offset is blended across them
    var cp = [[0, 0]], lanes = a.lanes.filter(function (ln) { return !ln.weak && d[ln.to] - d[ln.from] >= 12; });
    lanes.forEach(function (ln, k) {
      var sa = d[ln.from], sb = d[ln.to], len = sb - sa, pv = lanes[k - 1], nx = lanes[k + 1];
      var rin = pv ? Math.min(RAMP / 2, len / 2.5, (sa - d[pv.from]) / 2.5) : Math.min(RAMP, len / 2.5);
      var rout = nx ? Math.min(RAMP / 2, len / 2.5, (d[nx.to] - sb) / 2.5) : Math.min(RAMP, len / 2.5);
      cp.push([sa + rin, ln.off], [sb - rout, ln.off]);
    });
    cp.push([L, 0]);
    // resample: original vertices plus the control points, each with its interpolated offset
    var Q = [], O = [], c = 1;
    function offAt(sv) {
      while (c < cp.length - 1 && cp[c][0] < sv) c++;
      var p0 = cp[c - 1], p1 = cp[c], span = p1[0] - p0[0];
      return span > 1e-9 ? p0[1] + (p1[1] - p0[1]) * Math.min(1, Math.max(0, (sv - p0[0]) / span)) : p1[1];
    }
    var k2 = 1;
    for (var j = 0; j < n; j++) {
      if (j > 0) {
        var s0 = d[j - 1], s1 = d[j];
        while (k2 < cp.length - 1 && cp[k2][0] <= s0) k2++;
        while (k2 < cp.length - 1 && cp[k2][0] < s1) {
          var t = (cp[k2][0] - s0) / (s1 - s0);
          if (t > 1e-3 && t < 1 - 1e-3) { Q.push([P[j - 1][0] + (P[j][0] - P[j - 1][0]) * t, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * t]); O.push(offAt(cp[k2][0])); }
          k2++;
        }
      }
      var last = Q[Q.length - 1];
      if (last && Math.abs(last[0] - P[j][0]) + Math.abs(last[1] - P[j][1]) < 0.05) { if (j === n - 1) { Q[Q.length - 1] = P[j]; O[O.length - 1] = 0; } continue; }
      Q.push(P[j]); O.push(offAt(d[j]));
    }
    O[0] = 0; O[O.length - 1] = 0;
    return shiftVar(Q, O);
  }
  /** Shift each vertex sideways by its own offset, using the mitred normal of the adjacent segments. */
  function shiftVar(P, O) {
    var n = P.length, out = [];
    for (var i = 0; i < n; i++) {
      if (!O[i]) { out.push(P[i]); continue; }
      var a = P[Math.max(0, i - 1)], b = P[i], c2 = P[Math.min(n - 1, i + 1)];
      var d1x = b[0] - a[0], d1y = b[1] - a[1], d2x = c2[0] - b[0], d2y = c2[1] - b[1];
      var l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
      if (!l1) { d1x = d2x; d1y = d2y; l1 = l2; }
      if (!l2) { d2x = d1x; d2y = d1y; l2 = l1; }
      l1 = l1 || 1; l2 = l2 || 1;
      var n1x = -d1y / l1, n1y = d1x / l1, n2x = -d2y / l2, n2y = d2x / l2;
      var mx = n1x + n2x, my = n1y + n2y, ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      var k = Math.min(2.5, 1 / Math.max(0.4, mx * n1x + my * n1y));
      out.push([b[0] + mx * O[i] * k, b[1] + my * O[i] * k]);
    }
    return out;
  }
  function placeOverlays(withLabels) {
    if (!M.ready) return;
    var z = map.getZoom(), S = 512 * Math.pow(2, z), zq = Math.round(z * 40) / 40;
    var bb = map.getBounds(), w1 = toWorld([bb.getWest(), bb.getNorth()]), w2 = toWorld([bb.getEast(), bb.getSouth()]);
    var minX = w1[0] * S - 60, minY = w1[1] * S - 60, maxX = w2[0] * S + 60, maxY = w2[1] * S + 60;
    Object.keys(overlays).forEach(function (lid) {
      var ov = overlays[lid], I = { src: 'u-' + lid, arr: 'u-' + lid + '-arr', lab: 'u-' + lid + '-lab' };
      var fresh = ov.z === null;
      if (ov.z !== zq) {
        // the sideways offsets are in pixels, so the shifted geometry depends on the zoom level
        ov.z = zq;
        var Sq = 512 * Math.pow(2, zq), changed = fresh;
        ov.lines.forEach(function (a) {
          if (!a.lanes && a.Pw) return;
          a.Pw = a.lanes ? laneLine(a, Sq).map(function (p) { return [p[0] / Sq, p[1] / Sq]; }) : a.w;
          a.geo = a.lanes ? a.Pw.map(function (p) { return toLngLat(p[0], p[1]); }) : a.coords;
          changed = true;
        });
        if (changed && map.getSource(I.src)) map.getSource(I.src).setData(fc(ov.lines.map(function (a) {
          return { type: 'Feature', id: a.feat.id, properties: a.feat.properties, geometry: { type: 'LineString', coordinates: a.geo } };
        })));
      }
      if (map.getSource(I.arr)) {
        var feats = [];
        ov.lines.forEach(function (a) {
          if (!a.as || !a.dir) return;
          var P = a.Pw.map(function (p) { return [p[0] * S, p[1] * S]; });
          if (a.dir < 0) P.reverse();
          var spacing = Math.max(70, 95 * a.as), s0 = ((ov.phase || 0) % spacing + spacing) % spacing, acc = 0, next = s0 + spacing * 0.5;
          for (var i = 1; i < P.length; i++) {
            var x0 = P[i - 1][0], y0 = P[i - 1][1], dx = P[i][0] - x0, dy = P[i][1] - y0, L = Math.hypot(dx, dy);
            if (!L) continue;
            while (next <= acc + L) {
              var t = (next - acc) / L, x = x0 + dx * t, y = y0 + dy * t;
              if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                feats.push({ type: 'Feature', properties: { as: a.as, c: a.c, o: a.o, r: Math.atan2(dy, dx) * 180 / Math.PI }, geometry: { type: 'Point', coordinates: toLngLat(x / S, y / S) } });
              }
              next += spacing;
            }
            acc += L;
          }
        });
        map.getSource(I.arr).setData(fc(feats));
      }
      if ((withLabels || fresh) && map.getSource(I.lab)) {
        map.getSource(I.lab).setData(fc(ov.lines.filter(function (a) { return a.t; }).map(function (a) {
          return { type: 'Feature', properties: { t: a.t, o: a.o }, geometry: { type: 'LineString', coordinates: a.geo } };
        })));
      }
    });
  }
  M.placeOverlays = placeOverlays;

  // ---------- moving arrows ----------
  var animOn = false, lastT = 0, lastDraw = 0;
  function reducedMotion() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function updateAnimation() {
    var want = st.get('animateArrows') !== false && !reducedMotion() && Object.keys(overlays).some(function (k) { return overlays[k].animate && overlays[k].lines.length && map.getSource('u-' + k + '-arr'); });
    if (want === animOn) return;
    animOn = want;
    if (animOn) { lastT = 0; requestAnimationFrame(tick); }
  }
  function tick(ts) {
    if (!animOn) return;
    if (!lastT) lastT = ts;
    var dt = Math.min(0.1, (ts - lastT) / 1000); lastT = ts;
    var speed = 28 * (st.get('arrowSpeed') || 1);
    Object.keys(overlays).forEach(function (k) { if (overlays[k].animate) overlays[k].phase = (overlays[k].phase || 0) + speed * dt; });
    if (ts - lastDraw > 33 && !document.hidden) { lastDraw = ts; placeOverlays(false); }
    requestAnimationFrame(tick);
  }

  /** Pie-chart symbols (gas origin) drawn on a canvas and registered as map images. */
  var PIE = 26, pieCanvas = null;
  function updatePies(pies) {
    var ratio = 2, W = PIE * ratio;
    pieCanvas = pieCanvas || document.createElement('canvas');
    pieCanvas.width = W; pieCanvas.height = W;
    var g = pieCanvas.getContext('2d');
    pies.forEach(function (p) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, W); g.scale(ratio, ratio);
      var c = PIE / 2, r = LY.SHAPE_PX / 2, a0 = -Math.PI / 2, any = false;
      p.parts.forEach(function (q) {
        if (q.share <= 0) return;
        any = true;
        var a1 = a0 + q.share * Math.PI * 2;
        g.beginPath(); g.moveTo(c, c); g.arc(c, c, r, a0, a1); g.closePath(); g.fillStyle = q.color; g.fill();
        a0 = a1;
      });
      if (!any) { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fillStyle = '#cbd5e1'; g.fill(); }
      g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.lineWidth = 1.4; g.strokeStyle = p.stroke; g.stroke();
      var img = { width: W, height: W, data: new Uint8Array(g.getImageData(0, 0, W, W).data.buffer) };
      if (map.hasImage(p.id)) map.updateImage(p.id, img); else map.addImage(p.id, img, { pixelRatio: ratio });
    });
  }
  M.getFilterPass = function () { return filterPass; };

  // ---------- selection / highlight halos ----------
  var prevSel = [], prevHl = { nodes: {}, arcs: {} };
  M.updateSelection = function () {
    if (!M.ready || !A.current()) return;
    var c = A.current();
    function setS(kind, id, key, v) {
      var i = kind === 'asset' ? c.nodeIx[(c.asset(id) || {}).node] : c.index(kind, id);
      if (kind === 'asset') kind = 'node';
      if (i === undefined || kind === 'ref') return;
      var o = {}; o[key] = v;
      map.setFeatureState({ source: kind === 'node' ? 'nodes' : 'arcs', id: i }, o);
    }
    prevSel.forEach(function (s) { setS(s.kind, s.id, 'sel', false); });
    prevSel = st.get('selection').slice();
    prevSel.forEach(function (s) { setS(s.kind, s.id, 'sel', true); });
    Object.keys(prevHl.nodes).forEach(function (id) { setS('node', id, 'hl', false); });
    Object.keys(prevHl.arcs).forEach(function (id) { setS('arc', id, 'hl', false); });
    var hl = st.get('highlight') || { nodes: {}, arcs: {} };
    Object.keys(hl.nodes || {}).forEach(function (id) { setS('node', id, 'hl', true); });
    Object.keys(hl.arcs || {}).forEach(function (id) { setS('arc', id, 'hl', true); });
    prevHl = { nodes: hl.nodes || {}, arcs: hl.arcs || {} };
  };

  // ---------- background ----------
  M.applyBackground = function () {
    if (!M.ready) return;
    var b = st.get('basemap') || 'light', dark = A.isDark();
    function vis(id, on) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); }
    ['light', 'dark', 'satellite', 'terrain'].forEach(function (k) { vis('bg-' + k, b === k); });
    var pl = st.get('placeLabels') !== false;
    vis('labels-light', pl && b === 'light'); vis('labels-dark', pl && b === 'dark');
    map.setPaintProperty('bg-color', 'background-color', dark ? '#1b2029' : '#eef1f4');
    vis('admin-line', st.get('admin') !== false);
    map.setPaintProperty('admin-line', 'line-color', dark || darkBg() ? '#9aa6b8' : '#7c8797');
    structSig = ''; M.render();
  };

  // ---------- picking ----------
  function hitLayers() {
    var out = [];
    (st.get('layerList') || []).forEach(function (l) {
      if (!l.visible) return;
      var I = ids(l);
      [I.sym, I.hit].forEach(function (x) { if (map.getLayer(x)) out.push(x); });
    });
    return out;
  }
  function layerOf(mapLayerId) { var id = mapLayerId.replace(/^u-/, '').replace(/-(sym|hit)$/, ''); return LY.get(id); }
  /** Topmost element under a point: { kind, id, layer, index } */
  function pickAt(point, pad) {
    pad = pad || 3;
    var feats = map.queryRenderedFeatures([[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]], { layers: hitLayers() });
    if (!feats.length) return null;
    // prefer point symbols over lines
    feats.sort(function (a, b) { return (/-sym$/.test(a.layer.id) ? 0 : 1) - (/-sym$/.test(b.layer.id) ? 0 : 1); });
    var f = feats[0], l = layerOf(f.layer.id);
    return { kind: f.properties.ek, id: f.properties.eid, layer: l, ref: f.properties.ek === 'ref' ? f : null };
  }
  M.pickAt = pickAt;
  function srcIndex(h) {
    var c = A.current(); if (!c || !h || h.kind === 'ref') return null;
    if (h.kind === 'arc') return { source: 'arcs', id: c.arcIx[h.id] };
    var nid = h.kind === 'asset' ? c.asset(h.id).node : h.id;
    return { source: 'nodes', id: c.nodeIx[nid] };
  }
  function setHover(h) {
    var a = srcIndex(hover), b = srcIndex(h);
    if (a && (!b || a.source !== b.source || a.id !== b.id)) map.setFeatureState(a, { hover: false });
    if (b) map.setFeatureState(b, { hover: true });
    hover = h;
  }

  function bindInteractions() {
    var canvas = map.getCanvasContainer();
    var boxStart = null, boxEl = null, suppressClick = false;
    // Hover tooltip. The pointer can leave the map between a mousemove and its (throttled) handling,
    // so the handler checks that the pointer is still over the map, and several events hide it.
    var inside = false, dragging = false;
    function clearHover() { setHover(null); GV.tooltip.hide(); }
    var onMove = U.rafThrottle(function (e) {
      if (boxStart || !inside || dragging) { GV.tooltip.hide(); return; }
      var h = pickAt(e.point);
      setHover(h);
      map.getCanvas().style.cursor = h ? 'pointer' : (st.get('pick') ? 'crosshair' : '');
      if (h && st.get('tooltips') !== false) GV.tooltip.show(h, e.originalEvent); else GV.tooltip.hide();
    });
    map.on('mousemove', function (e) { inside = true; onMove(e); });
    map.on('mouseout', function () { inside = false; clearHover(); });
    canvas.addEventListener('mouseleave', function () { inside = false; clearHover(); });
    map.on('dragstart', function () { dragging = true; clearHover(); });
    map.on('dragend', function () { dragging = false; });
    map.on('zoomstart', function () { GV.tooltip.hide(); });
    map.on('click', function () { GV.tooltip.hide(); });
    document.addEventListener('mousemove', function (e) { if (!canvas.contains(e.target)) { if (inside) { inside = false; clearHover(); } else GV.tooltip.hide(); } }, true);
    window.addEventListener('blur', clearHover);
    map.on('click', function (e) {
      if (suppressClick) { suppressClick = false; return; }
      var h = pickAt(e.point);
      var additive = e.originalEvent.ctrlKey || e.originalEvent.metaKey;
      var pk = st.get('pick');
      if (pk && pk.action === 'note') { GV.views.addNoteAt(e.lngLat); return; }
      if (pk) { GV.actions.completePick(h && h.kind !== 'ref' ? h : null); return; }
      if (h && h.kind === 'ref') { GV.popup.showRef(h, e.lngLat); return; }
      if (h) {
        st.select(h.kind, h.id, additive);
        if (!additive) GV.popup.onClick(h, e.lngLat);
      } else if (!additive) { st.select(null); GV.popup.close(); if (st.get('highlight')) st.set({ highlight: null }); }
    });
    map.on('dblclick', function (e) {
      var h = pickAt(e.point);
      if (!h || h.kind === 'ref') { map.zoomIn(); return; }
      e.preventDefault();
      st.select(h.kind, h.id, false);
      GV.actions.drill(h.kind, h.id);
    });
    map.on('contextmenu', function (e) {
      e.preventDefault();
      var h = pickAt(e.point, 5);
      if (!h || h.kind === 'ref') { GV.contextMenu.showMap(e.originalEvent, e.lngLat); return; }
      if (!st.isSelected(h.kind, h.id)) st.select(h.kind, h.id, false);
      GV.contextMenu.show(h.kind, h.id, e.originalEvent);
    });
    map.on('movestart', function () { GV.contextMenu.hide(); });

    // Shift + drag: rectangle selection
    canvas.addEventListener('mousedown', function (e) {
      if (!(e.shiftKey && e.button === 0)) return;
      map.dragPan.disable();
      var r = canvas.getBoundingClientRect();
      boxStart = { x: e.clientX - r.left, y: e.clientY - r.top };
      boxEl = U.h('div.boxsel'); canvas.appendChild(boxEl);
      e.preventDefault();
    }, true);
    window.addEventListener('mousemove', function (e) {
      if (!boxStart) return;
      var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      Object.assign(boxEl.style, { left: Math.min(x, boxStart.x) + 'px', top: Math.min(y, boxStart.y) + 'px', width: Math.abs(x - boxStart.x) + 'px', height: Math.abs(y - boxStart.y) + 'px' });
    });
    window.addEventListener('mouseup', function (e) {
      if (!boxStart) return;
      var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      var bb = [[Math.min(x, boxStart.x), Math.min(y, boxStart.y)], [Math.max(x, boxStart.x), Math.max(y, boxStart.y)]];
      boxEl.remove(); boxStart = null; map.dragPan.enable();
      if (bb[1][0] - bb[0][0] < 4 && bb[1][1] - bb[0][1] < 4) return;
      suppressClick = true;
      var c = A.current(), items = [], seen = {};
      // nodes inside the box (by projected position), then arcs with both ends inside
      c.nodes.forEach(function (n) {
        if (n.dlat === null) return;
        var p = map.project([n.dlon, n.dlat]);
        if (p.x >= bb[0][0] && p.x <= bb[1][0] && p.y >= bb[0][1] && p.y <= bb[1][1]) { seen[n.id] = true; items.push({ kind: 'node', id: n.id }); }
      });
      c.arcs.forEach(function (a) { if (seen[a.from] && seen[a.to]) items.push({ kind: 'arc', id: a.id }); });
      var additive = e.ctrlKey || e.metaKey;
      st.selectMany(items, additive);
      U.toast(items.length + ' elements ' + (additive ? 'added to' : 'in') + ' selection');
    });
  }

  // ---------- navigation helpers ----------
  M.fitNetwork = function (instant) {
    var c = A.current(); if (!c || !map) return;
    var pts = c.nodes.filter(function (n) { return n.dlat !== null && n.process !== 'GNL'; }).map(function (n) { return [n.dlon, n.dlat]; });
    if (!pts.length) return;
    var cv = map.getContainer(), pw = Math.min(40, cv.clientWidth / 6), ph = Math.min(60, cv.clientHeight / 6);
    map.fitBounds(U.bbox(pts), { padding: { top: ph, bottom: ph, left: pw, right: pw }, duration: instant ? 0 : 600, maxZoom: 8 });
  };
  M.flyToElement = function (kind, id, opts) {
    var c = A.current(); if (!c || !map) return;
    opts = opts || {};
    if (kind === 'arc') {
      var g = M.geom()[c.arcIx[id]]; if (!g) return;
      map.fitBounds(U.bbox(g), { padding: 90, maxZoom: 9, duration: 700 });
      return;
    }
    var n = kind === 'node' ? c.node(id) : c.node(c.asset(id).node);
    if (!n || n.dlat === null) return;
    if (opts.zoom) map.flyTo({ center: [n.dlon, n.dlat], zoom: Math.max(map.getZoom(), opts.zoom), duration: 700 });
    else map.easeTo({ center: [n.dlon, n.dlat], duration: 500 });
  };
  M.fitElements = function (nodes, arcs) {
    var c = A.current(), pts = [], g = M.geom();
    Object.keys(nodes || {}).forEach(function (id) { var n = c.node(id); if (n && n.dlat !== null) pts.push([n.dlon, n.dlat]); });
    Object.keys(arcs || {}).forEach(function (id) { var x = g[c.arcIx[id]]; if (x) pts = pts.concat(x); });
    if (pts.length) map.fitBounds(U.bbox(pts), { padding: 80, maxZoom: 9, duration: 700 });
  };
  M.resize = function () { if (map) map.resize(); };
  M.snapshot = function () { return map.getCanvas().toDataURL('image/png'); };
  M.view = function () { if (!map) return null; var c = map.getCenter(); return [+c.lng.toFixed(3), +c.lat.toFixed(3), +map.getZoom().toFixed(2)]; };
  M.setView = function (v) { if (map && v) map.jumpTo({ center: [v[0], v[1]], zoom: v[2] }); };
})();
