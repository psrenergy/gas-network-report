/*
 * Application core: case registry, current frame, comparison, and the styling rules
 * (variable -> colour / width / size) shared by the map, legend, tables and charts.
 */
(function () {
  'use strict';
  var U = GV.util, st = GV.state;
  var A = GV.app = { cases: [], byId: {} };

  // ---------- case registry ----------
  /** Called by data/*.case.js library files and by the loaders. */
  GV.registerCase = function (ds, opts) {
    opts = opts || {};
    var c = new GV.Case(ds);
    routeCase(c);
    A.cases.push(c); A.byId[c.id] = c;
    // default: activate only when nothing is shown yet (library files); loaders pass activate explicitly
    var activate = opts.activate === true || (opts.activate === undefined && !A.current() && !A._pendingActivate);
    if (activate) { if (A.ready) A.activate(c.id); else A._pendingActivate = c.id; }
    A.emitCases();
    return c;
  };
  /** Rebuild a case after its dataset changed (e.g. geometry added), keeping its id. */
  A.replaceCase = function (id, ds) {
    var i = A.cases.indexOf(A.byId[id]);
    if (i < 0) return;
    ds.id = id;
    var c = new GV.Case(ds);
    routeCase(c);
    A.cases[i] = c; A.byId[id] = c;
    if (GV.map.invalidate) GV.map.invalidate();
    A.emitCases();
  };
  A.emitCases = function () { st.set({ casesVersion: (st.get('casesVersion') || 0) + 1 }); };
  A.activate = function (id) {
    var c = A.byId[id];
    if (!c) return;
    var patch = { caseId: id, selection: [], highlight: null, pick: null };
    if (st.get('stage') >= c.nS) patch.stage = 0;
    if (st.get('seq') >= c.nQ) patch.seq = 0;
    if (st.get('block') >= c.nB) patch.block = -1;
    st.set(patch);
  };
  A.removeCase = function (id) {
    A.cases = A.cases.filter(function (c) { return c.id !== id; });
    delete A.byId[id];
    if (st.get('caseId') === id) { if (A.cases[0]) A.activate(A.cases[0].id); else st.set({ caseId: null }); }
    var cmp = st.get('compare');
    if (cmp.caseId === id) st.set({ compare: { mode: 'off', caseId: null, stage: 0 } });
    A.emitCases();
  };
  A.current = function () { return A.byId[st.get('caseId')] || null; };
  A.frame = function (over) { var c = A.current(); return c ? c.frame(st.sel(over)) : null; };

  // ---------- variables ----------
  var varMap = {};
  GV.config.variables.forEach(function (v) { varMap[v.id] = v; });
  A.varDef = function (id) { return varMap[id]; };
  A.varsFor = function (kind) { return GV.config.variables.filter(function (v) { return v.kind === kind; }); };

  // ---------- comparison ----------
  /** Reference frame values aligned to the current case's element order, or null. */
  A.refValues = function (kind, varId) {
    var cmp = st.get('compare'), c = A.current();
    if (!c || !cmp || cmp.mode === 'off') return null;
    var refCase = cmp.mode === 'case' ? A.byId[cmp.caseId] : c;
    if (!refCase) return null;
    var sel = st.sel(cmp.mode === 'stage' ? { stage: cmp.stage } : { stage: Math.min(st.get('stage'), refCase.nS - 1) });
    if (sel.seq >= refCase.nQ) sel.seq = 0;
    if (sel.block >= refCase.nB) sel.block = -1;
    var RF = refCase.frame(sel), arr = RF[kind][varId];
    if (!arr) return null;
    if (refCase === c) return arr;
    var list = kind === 'node' ? c.nodes : kind === 'arc' ? c.arcs : c.assets;
    var out = new Float64Array(list.length);
    list.forEach(function (el, i) { var j = refCase.index(kind, el.id); out[i] = j === undefined ? NaN : arr[j]; });
    return out;
  };
  A.compareLabel = function () {
    var cmp = st.get('compare'), c = A.current();
    if (!c || cmp.mode === 'off') return '';
    if (cmp.mode === 'stage') return 'Δ vs ' + c.periodLabel(cmp.stage);
    var rc = A.byId[cmp.caseId];
    return 'Δ vs ' + (rc ? rc.name : '?');
  };
  /** Values used for styling: current, or current − reference in comparison mode. */
  A.values = function (kind, varId, F) {
    F = F || A.frame();
    var cur = F[kind][varId];
    var ref = A.refValues(kind, varId);
    if (!ref) return cur;
    var out = new Float64Array(cur.length);
    for (var i = 0; i < cur.length; i++) {
      var a = isFinite(cur[i]) ? cur[i] : NaN, b = isFinite(ref[i]) ? ref[i] : NaN;
      out[i] = a - b;
    }
    return out;
  };
  A.comparing = function () { var c = st.get('compare'); return c && c.mode !== 'off'; };

  // ---------- scales ----------
  A.bins = function () { return st.get('bins') || GV.config.utilizationBins; };
  A.utilColor = function (u) {
    if (isNaN(u)) return null;
    var b = A.bins();
    for (var i = 0; i < b.length; i++) if (u < b[i].max || (i === b.length - 1)) return b[i].color;
    return b[b.length - 1].color;
  };
  A.utilBinIndex = function (u) {
    if (isNaN(u)) return -1;
    var b = A.bins();
    for (var i = 0; i < b.length; i++) if (u < b[i].max) return i;
    return b.length - 1;
  };

  /** Colour scale for a variable (taking comparison mode into account). */
  A.colorScale = function (kind, varId) {
    var c = A.current(), v = varMap[varId];
    if (!c || !v) return null;
    var sel = st.sel();
    if (A.comparing()) {
      var vals = A.values(kind, varId), m = 0;
      for (var i = 0; i < vals.length; i++) if (isFinite(vals[i])) m = Math.max(m, Math.abs(vals[i]));
      m = m || 1;
      var dstops = U.divergingStops(), rd = U.ramp(dstops);
      return { type: 'diverging', domain: [-m, m], unit: v.unit, label: v.label + ' ' + A.compareLabel(), color: function (x) { return isFinite(x) ? rd((x + m) / (2 * m)) : null; }, stops: dstops };
    }
    if (v.scale === 'utilization') {
      return { type: 'utilization', unit: 'pct', label: v.label, color: A.utilColor };
    }
    var dom = c.domain(kind, varId, sel, st.get('lockScale'));
    if (v.scale === 'diverging') {
      var mm = Math.max(Math.abs(dom[0]), Math.abs(dom[1])) || 1;
      var dstops2 = U.divergingStops(), r2 = U.ramp(dstops2);
      return { type: 'diverging', domain: [-mm, mm], unit: v.unit, label: v.label, color: function (x) { return isFinite(x) ? r2((x + mm) / (2 * mm)) : null; }, stops: dstops2 };
    }
    var pal = v.unit === 'price' || v.unit === 'money' ? U.palettes.cost : v.unit === 'flow' ? U.palettes.flow : U.palettes.seq;
    var r = U.ramp(pal), lo = varId === 'cmg' ? dom[0] : Math.min(0, dom[0]), hi = dom[1] > lo ? dom[1] : lo + 1;
    return { type: 'sequential', domain: [lo, hi], unit: v.unit, label: v.label, color: function (x) { return isFinite(x) ? r((x - lo) / (hi - lo)) : null; }, stops: pal };
  };

  A.widthScale = function () {
    var c = A.current(); if (!c) return null;
    var dom = c.domain('arc', 'absFlow', st.sel(), st.get('lockScale'));
    var mx = dom[1] || 1;
    return { max: mx, width: function (v) { return isFinite(v) && v > 0 ? 1.4 + 10 * Math.sqrt(Math.min(v, mx) / mx) : 1.2; } };
  };
  A.sizeScale = function (varId) {
    var c = A.current(); if (!c || !varMap[varId]) return null;
    var dom = c.domain('node', varId, st.sel(), st.get('lockScale'));
    var mx = Math.max(Math.abs(dom[0]), Math.abs(dom[1])) || 1;
    return { max: mx, varId: varId, radius: function (v) { return isFinite(v) && Math.abs(v) > 1e-6 ? 4 + 13 * Math.sqrt(Math.min(Math.abs(v), mx) / mx) : 3.5; } };
  };

  A.isDark = function () { return document.documentElement.dataset.theme === 'dark'; };

  // ---------- reference networks: route model pipelines along the real traces ----------
  A.refGraph = null;
  A.onReference = function (ref) {
    var t = ref.layers.filter(function (l) { return l.id === 'transport' || /transport/i.test(l.id); })[0];
    if (t && t.geom === 'line') {
      A.refGraph = GVRouting.buildGraph(t.data.features);
      A.refLabel = ref.id.toUpperCase();
      A.cases.forEach(routeCase);
      if (GV.map.invalidate) GV.map.invalidate();
    }
    st.set({ refsVersion: (st.get('refsVersion') || 0) + 1 });
    A.emitCases();
  };
  function routeCase(c) { if (A.refGraph) c.setRoutes(A.refGraph, A.refLabel || 'reference'); }
  A.routeCase = routeCase;

  // ---------- labels ----------
  A.elementLabel = function (kind, id) {
    var c = A.current(); if (!c) return id;
    var el = c.element(kind, id);
    return el ? el.name : id;
  };
})();
