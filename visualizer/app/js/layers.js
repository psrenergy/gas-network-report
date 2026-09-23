/*
 * Layer engine. A layer shows one element type (arcs, nodes, assets at nodes, or a reference dataset)
 * with its own filter rules and visual encodings. The same element type can appear in several layers,
 * e.g. nodes coloured by marginal cost plus diamonds sized by thermal consumption plus squares sized
 * by city-gate demand, each at a different position around the node.
 *
 * Layer spec (all optional except type):
 *   { id, name, type: 'arc' | 'node' | 'asset' | 'ref', visible, opacity, minzoom,
 *     kinds: ['pipeline','maritime','regas']            (arc)
 *     assetTypes: ['thermal', ...], aggregate: 'node' | 'each'   (asset)
 *     ref: 'epe:transport'                               (ref)
 *     filter: [{ field, op, value, value2 }]             (base units: utilization 0.95 = 95%)
 *     color: { value: '#hex' } | { field, palette: 'auto'|'flow'|'cost'|'seq'|'diverging'|'utilization' }
 *     size:  { value } | { field, min, max }             (line width px / symbol diameter px)
 *     arrows: { show, value } | { show, field, min, max } (arcs; icon scale)
 *     dash: 'solid' | 'dashed' | 'dotted', animate: bool  (arcs)
 *     shape, stroke, position: 'C'|'N'|..., distance      (points)
 *     labels: { show, fields: [...], size, minzoom } }
 */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, C = GV.config;
  var LY = GV.layers = {};
  var uid = 1, itemCache = {}, domCache = {};

  LY.SHAPES = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'star'];   // plus 'pie' (gas origin) for nodes / assets
  LY.POSITIONS = { C: [0, 0], N: [0, -1], NE: [0.72, -0.72], E: [1, 0], SE: [0.72, 0.72], S: [0, 1], SW: [-0.72, 0.72], W: [-1, 0], NW: [-0.72, -0.72] };
  LY.TYPES = { arc: 'Arcs (pipelines, sea routes, regas)', node: 'Nodes (buses)', asset: 'Assets at nodes', ref: 'Reference data (EPE)' };
  LY.OPS = ['>', '>=', '<', '<=', '=', '!=', 'between'];
  var SHAPE_PX = 20;   // logical size of the symbol images at icon-size 1

  // ---------------------------------------------------------------- references
  var refs = {};
  LY.refs = refs;
  GV.registerReference = function (ref) {
    refs[ref.id] = ref;
    itemCache = {}; domCache = {};
    ref.layers.forEach(function (l) { l.fullId = ref.id + ':' + l.id; });
    if (A.onReference) A.onReference(ref);
  };
  LY.refLayer = function (full) {
    var p = (full || '').split(':'), r = refs[p[0]];
    return r ? r.layers.filter(function (l) { return l.id === p[1]; })[0] : null;
  };
  LY.refList = function () {
    var out = [];
    Object.keys(refs).forEach(function (k) { refs[k].layers.forEach(function (l) { out.push({ id: l.fullId, label: l.label, geom: l.geom }); }); });
    return out;
  };

  // ---------------------------------------------------------------- construction
  function deepMerge(a, b) {
    Object.keys(b || {}).forEach(function (k) {
      var v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], v);
      else a[k] = Array.isArray(v) ? v.slice() : v;
    });
    return a;
  }
  LY.make = function (spec) {
    var t = spec.type || 'node';
    var base = {
      id: 'L' + Date.now().toString(36) + (uid++), name: LY.TYPES[t], type: t, visible: true, opacity: 1, minzoom: 0, legend: true,
      filter: [],
      color: { value: t === 'arc' ? '#5b6b7f' : t === 'ref' ? '#64748b' : '#334155', palette: 'auto' },
      size: { value: t === 'arc' ? 2.5 : t === 'ref' ? 1.3 : 10, min: t === 'arc' || t === 'ref' ? 1.4 : 6, max: t === 'arc' || t === 'ref' ? 11 : 28 },
      labels: { show: false, fields: ['name'], size: 11, minzoom: 0 }
    };
    if (t === 'arc') deepMerge(base, { kinds: ['pipeline', 'regas', 'maritime'], dash: 'solid', animate: true, arrows: { show: false, value: 1, min: 0.55, max: 1.7 } });
    if (t === 'node' || t === 'asset') deepMerge(base, { shape: 'circle', stroke: 'auto', position: 'C', distance: 14 });
    if (t === 'asset') deepMerge(base, { assetTypes: ['thermal'], aggregate: 'node' });
    if (t === 'ref') deepMerge(base, { ref: 'epe:transport', shape: 'circle', stroke: 'auto' });
    var l = deepMerge(base, JSON.parse(JSON.stringify(spec)));
    if (spec.color && spec.color.field) delete l.color.value;
    if (spec.color && spec.color.value) delete l.color.field;
    if (spec.size && spec.size.field) delete l.size.value;
    if (spec.size && spec.size.value !== undefined) delete l.size.field;
    if (spec.arrows && spec.arrows.field) delete l.arrows.value;
    if (spec.arrows && spec.arrows.value !== undefined) delete l.arrows.field;
    if (!spec.name) l.name = LY.TYPES[t];
    return l;
  };
  LY.fromView = function (viewId) {
    var v = C.views.filter(function (x) { return x.id === viewId; })[0];
    return v ? v.layers.map(LY.make) : [];
  };
  LY.applyView = function (viewId) {
    st.set({ layerList: LY.fromView(viewId), view: viewId });
  };
  LY.update = function (id, mut) {
    var list = st.get('layerList').map(function (l) {
      if (l.id !== id) return l;
      var c = JSON.parse(JSON.stringify(l));
      mut(c);
      return c;
    });
    st.set({ layerList: list, view: 'custom' });
  };
  LY.get = function (id) { return st.get('layerList').filter(function (l) { return l.id === id; })[0]; };

  // ---------------------------------------------------------------- fields
  function varField(v) { return { id: v.id, label: v.label, unit: v.unit, type: 'num', scale: v.scale, input: !!v.input }; }
  LY.fields = function (layer) {
    if (layer.type === 'ref') {
      var rl = LY.refLayer(layer.ref); if (!rl) return [];
      var keys = {};
      rl.data.features.slice(0, 400).forEach(function (f) { Object.keys(f.properties).forEach(function (k) {
        var v = f.properties[k], num = typeof v === 'number' || (v !== '' && !isNaN(+String(v).replace(',', '.')));
        keys[k] = keys[k] === undefined ? num : keys[k] && num;
      }); });
      return Object.keys(keys).map(function (k) { return { id: k, label: k, type: k === 'name' ? 'text' : keys[k] ? 'num' : 'cat', unit: null, ref: true }; });
    }
    var out = [{ id: 'name', label: 'Name', type: 'text' }];
    if (layer.type === 'arc') out.push({ id: 'kind', label: 'Arc type', type: 'cat' }, { id: 'status', label: 'Status', type: 'cat' }, { id: 'region', label: 'Region (origin)', type: 'cat' });
    if (layer.type === 'node') out.push({ id: 'region', label: 'Region', type: 'cat' }, { id: 'process', label: 'Process', type: 'cat' });
    if (layer.type === 'asset') out.push({ id: 'atype', label: 'Asset type', type: 'cat' }, { id: 'region', label: 'Region', type: 'cat' }, { id: 'count', label: 'Number of assets', type: 'num', unit: 'count' });
    A.varsFor(layer.type).forEach(function (v) { out.push(varField(v)); });
    // gas origin (proportional mixing) fields
    out.push({ id: 'origDom', label: 'Dominant gas origin', type: 'cat', origin: true },
      { id: 'origVol', label: layer.type === 'node' ? 'Gas mixed at node (inflow + injection)' : 'Traced volume', type: 'num', unit: 'flow', origin: true });
    C.sourceGroups.forEach(function (g) { out.push({ id: 'orig:' + g.id, label: 'Share from ' + g.label, type: 'num', unit: 'pct', origin: true }); });
    return out;
  };
  LY.field = function (layer, id) { return LY.fields(layer).filter(function (f) { return f.id === id; })[0]; };

  // ---------------------------------------------------------------- items
  LY.items = function (layer, c) {
    var key = c.id + '|' + layer.type + '|' + (layer.kinds || []).join(',') + '|' + (layer.assetTypes || []).join(',') + '|' + layer.aggregate + '|' + layer.ref;
    if (itemCache[key]) return itemCache[key];
    var items = [];
    if (layer.type === 'arc') {
      c.arcs.forEach(function (a, i) { if (layer.kinds.indexOf(a.kind) >= 0) items.push({ kind: 'arc', id: a.id, i: i }); });
    } else if (layer.type === 'node') {
      c.nodes.forEach(function (n, i) { if (n.dlat !== null) items.push({ kind: 'node', id: n.id, i: i }); });
    } else if (layer.type === 'asset') {
      if (layer.aggregate === 'each') {
        var seen = {};
        c.assets.forEach(function (x, i) {
          if (layer.assetTypes.indexOf(x.type) < 0) return;
          var ni = c.nodeIx[x.node]; if (c.nodes[ni].dlat === null) return;
          var k = seen[ni] = (seen[ni] || 0) + 1;
          items.push({ kind: 'asset', id: x.id, i: i, node: ni, slot: k - 1 });
        });
        items.forEach(function (it) { it.slots = seen[it.node]; });
      } else {
        c.nodes.forEach(function (n, i) {
          if (n.dlat === null) return;
          var as = n.assets.map(function (id) { return c.assetIx[id]; }).filter(function (j) { return layer.assetTypes.indexOf(c.assets[j].type) >= 0; });
          if (as.length) items.push({ kind: 'node', id: n.id, i: i, assets: as, agg: true });
        });
      }
    } else if (layer.type === 'ref') {
      var rl = LY.refLayer(layer.ref);
      if (rl) rl.data.features.forEach(function (f, i) { items.push({ kind: 'ref', id: layer.ref + '#' + i, i: i, f: f }); });
    }
    return (itemCache[key] = items);
  };

  // ---------------------------------------------------------------- values
  function statusOf(F, i) {
    var u = F.arc.util[i];
    if (F.arc.capFT[i] + F.arc.capTF[i] <= 1e-6 && F.arc.absFlow[i] < 1e-3) return 'Out of service';
    return u > 1.0001 ? 'Violation' : u >= 0.95 ? 'Near limit' : 'Normal';
  }
  /** Origin volumes by source group for an item (see origin.js). */
  function originVec(it, c, F) {
    var of = c.originFrame(F.sel);
    if (it.kind === 'arc') return of.arcGrp[it.i];
    if (it.agg) {
      var v = new Float64Array(C.sourceGroups.length);
      it.assets.forEach(function (j) { var a = of.assetGrp[j]; for (var g = 0; g < v.length; g++) v[g] += a[g]; });
      return v;
    }
    if (it.kind === 'asset') return of.assetGrp[it.i];
    return of.nodeGrp[it.i];
  }
  LY.originVec = originVec;
  function originValue(fieldId, it, c, F) {
    var v = originVec(it, c, F), tot = 0;
    for (var g = 0; g < v.length; g++) tot += v[g];
    if (fieldId === 'origVol') return tot;
    if (fieldId === 'origDom') { var d = GV.origin.dominant(v); return d < 0 ? '—' : C.sourceGroups[d].label; }
    var gid = fieldId.slice(5), gi = C.sourceGroups.findIndex(function (g) { return g.id === gid; });
    return tot > 1e-9 && gi >= 0 ? v[gi] / tot : NaN;
  }

  /** Raw value of a field for an item in case c / frame F. */
  LY.raw = function (layer, fieldId, it, c, F) {
    if (layer.type !== 'ref' && (fieldId === 'origDom' || fieldId === 'origVol' || fieldId.indexOf('orig:') === 0)) return originValue(fieldId, it, c, F);
    if (layer.type === 'ref') {
      var v = it.f.properties[fieldId];
      var fd = LY.field(layer, fieldId);
      if (fd && fd.type === 'num') return v === undefined || v === null || v === '' ? NaN : +String(v).replace(',', '.');
      return v === undefined ? '' : v;
    }
    if (fieldId === 'name') return it.kind === 'node' ? c.nodes[it.i].name : it.kind === 'arc' ? c.arcs[it.i].name : c.assets[it.i].name;
    if (it.kind === 'arc') {
      var a = c.arcs[it.i];
      if (fieldId === 'kind') return a.kind;
      if (fieldId === 'status') return statusOf(F, it.i);
      if (fieldId === 'region') return c.node(a.from).region;
      var arr = F.arc[fieldId]; return arr ? arr[it.i] : NaN;
    }
    if (it.agg) {
      var n = c.nodes[it.i];
      if (fieldId === 'region') return n.region;
      if (fieldId === 'atype') { var ts = {}; it.assets.forEach(function (j) { ts[c.assets[j].type] = 1; }); return Object.keys(ts).join('+'); }
      if (fieldId === 'count') return it.assets.length;
      if (fieldId === 'aUtil') {
        var sv = 0, sm = 0;
        it.assets.forEach(function (j) { sv += F.asset.aValue[j]; if (isFinite(F.asset.maxProd[j])) sm += F.asset.maxProd[j]; });
        return sm > 1e-6 ? sv / sm : NaN;
      }
      var xs = F.asset[fieldId]; if (!xs) return NaN;
      var sum = 0, any = false;
      it.assets.forEach(function (j) { if (isFinite(xs[j])) { sum += xs[j]; any = true; } });
      return any ? sum : NaN;
    }
    if (it.kind === 'asset') {
      var x = c.assets[it.i];
      if (fieldId === 'atype') return x.type;
      if (fieldId === 'region') return c.node(x.node).region;
      if (fieldId === 'count') return 1;
      var ax = F.asset[fieldId]; return ax ? ax[it.i] : NaN;
    }
    if (fieldId === 'region') return c.nodes[it.i].region;
    if (fieldId === 'process') return c.nodes[it.i].process;
    var na = F.node[fieldId]; return na ? na[it.i] : NaN;
  };

  /** Context: current case/frame and, in comparison mode, the reference case/frame. */
  LY.context = function (over) {
    var c = A.current(); if (!c) return null;
    var sel = st.sel(over), ctx = { c: c, F: c.frame(sel), sel: sel, ref: null };
    var cmp = st.get('compare');
    if (cmp && cmp.mode !== 'off') {
      var rc = cmp.mode === 'case' ? A.byId[cmp.caseId] : c;
      if (rc) {
        var rs = { stage: cmp.mode === 'stage' ? cmp.stage : Math.min(sel.stage, rc.nS - 1), seq: sel.seq >= rc.nQ ? 0 : sel.seq, block: sel.block >= rc.nB ? -1 : sel.block };
        ctx.ref = { c: rc, F: rc.frame(rs) };
      }
    }
    return ctx;
  };
  function refItem(layer, it, rc) {
    if (it.kind === 'ref') return it;
    if (it.agg) {
      var ni = rc.nodeIx[it.id]; if (ni === undefined) return null;
      var as = rc.nodes[ni].assets.map(function (id) { return rc.assetIx[id]; }).filter(function (j) { return layer.assetTypes.indexOf(rc.assets[j].type) >= 0; });
      return { kind: 'node', id: it.id, i: ni, assets: as, agg: true };
    }
    var j = rc.index(it.kind, it.id);
    return j === undefined ? null : { kind: it.kind, id: it.id, i: j };
  }
  /** Displayed value: raw, or (current − reference) for numeric fields in comparison mode. */
  LY.value = function (layer, fieldId, it, ctx, noDelta) {
    var v = LY.raw(layer, fieldId, it, ctx.c, ctx.F);
    if (noDelta || !ctx.ref || typeof v !== 'number' || layer.type === 'ref') return v;
    var ri = refItem(layer, it, ctx.ref.c);
    if (!ri) return NaN;
    var r = LY.raw(layer, fieldId, ri, ctx.ref.c, ctx.ref.F);
    return isFinite(v) && isFinite(r) ? v - r : NaN;
  };
  LY.isDelta = function (layer, fieldId, ctx) {
    var f = LY.field(layer, fieldId);
    return !!(ctx.ref && f && f.type === 'num' && layer.type !== 'ref');
  };

  // ---------------------------------------------------------------- filters
  /** Elements switched off one by one in the layer's element list (layer.hidden = [ids]). */
  var hidSets = new WeakMap();
  LY.isHidden = function (layer, id) {
    var arr = layer.hidden; if (!arr || !arr.length) return false;
    var set = hidSets.get(arr); if (!set) { set = new Set(arr); hidSets.set(arr, set); }
    return set.has(id);
  };
  LY.passes = function (layer, it, ctx) { return !LY.isHidden(layer, it.id) && LY.passesFilter(layer, it, ctx); };
  LY.passesFilter = function (layer, it, ctx) {
    for (var k = 0; k < (layer.filter || []).length; k++) {
      var r = layer.filter[k]; if (!r.field) continue;
      var v = LY.raw(layer, r.field, it, ctx.c, ctx.F);
      if (typeof v === 'number') {
        if (isNaN(v)) return false;
        var a = +r.value, b = +r.value2;
        if (r.op === '>' && !(v > a)) return false;
        if (r.op === '>=' && !(v >= a)) return false;
        if (r.op === '<' && !(v < a)) return false;
        if (r.op === '<=' && !(v <= a)) return false;
        if (r.op === '=' && Math.abs(v - a) > 1e-9) return false;
        if (r.op === '!=' && Math.abs(v - a) <= 1e-9) return false;
        if (r.op === 'between' && !(v >= a && v <= b)) return false;
      } else {
        var s = String(v).toLowerCase(), q = String(r.value === undefined ? '' : r.value).toLowerCase();
        if (r.op === '=' && s !== q) return false;
        if (r.op === '!=' && s === q) return false;
        if (r.op !== '=' && r.op !== '!=' && s.indexOf(q) < 0) return false;
      }
    }
    return true;
  };
  LY.describeRule = function (layer, r) {
    var f = LY.field(layer, r.field) || { label: r.field };
    var fmt = function (x) { return f.type === 'num' && f.unit ? U.fmt(+x, f.unit) : x; };
    return f.label.replace(/ \(input\)$/, '') + ' ' + (r.op === 'between' ? 'between ' + fmt(r.value) + ' and ' + fmt(r.value2) : r.op + ' ' + fmt(r.value));
  };

  // ---------------------------------------------------------------- scales
  LY.clearCache = function () { domCache = {}; itemCache = {}; };
  function numericDomain(layer, fieldId, ctx, items) {
    var lock = st.get('lockScale') && !ctx.ref && layer.type !== 'ref';
    var key = [layer.type, fieldId, ctx.c.id, ctx.sel.seq, ctx.sel.block, lock ? 'L' : ctx.sel.stage, (layer.kinds || []).join(), (layer.assetTypes || []).join(), layer.aggregate, layer.ref, !!ctx.ref, ctx.ref ? st.get('compare').mode + st.get('compare').stage + st.get('compare').caseId : ''].join('|');
    if (domCache[key]) return domCache[key];
    var mn = Infinity, mx = -Infinity;
    var stages = lock ? Array.from({ length: ctx.c.nS }, function (_, i) { return i; }) : [ctx.sel.stage];
    stages.forEach(function (s) {
      var cx = s === ctx.sel.stage ? ctx : { c: ctx.c, F: ctx.c.frame({ stage: s, seq: ctx.sel.seq, block: ctx.sel.block }), ref: null, sel: ctx.sel };
      items.forEach(function (it) { var v = LY.value(layer, fieldId, it, cx); if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } });
    });
    if (mn === Infinity) { mn = 0; mx = 1; }
    return (domCache[key] = [mn, mx]);
  }
  LY.colorScale = function (layer, ctx, items) {
    var ch = layer.color || {};
    var fixedCol = ch.value || '#64748b';
    if (!ch.field) return { type: 'fixed', value: fixedCol, color: function () { return fixedCol; } };
    var f = LY.field(layer, ch.field);
    if (!f) return { type: 'fixed', value: fixedCol, color: function () { return fixedCol; } };
    items = items || LY.items(layer, ctx.c);
    if (f.type === 'cat' || f.type === 'text') {
      var preset = C.categoryColors[ch.field] || (ch.field === 'region' ? C.regionColors : null) || {};
      if (ch.field === 'origDom') { preset = { '—': '#cbd5e1' }; C.sourceGroups.forEach(function (g) { preset[g.label] = g.color; }); }
      var vals = {}, order = [];
      items.forEach(function (it) { var v = String(LY.raw(layer, ch.field, it, ctx.c, ctx.F)); if (!vals[v]) { vals[v] = 1; order.push(v); } });
      order.sort();
      var pal = C.categoricalPalette, map = {};
      order.forEach(function (v, i) { map[v] = preset[v] || pal[i % pal.length]; });
      return { type: 'cat', field: f, color: function (v) { return map[String(v)] || '#94a3b8'; },
        entries: order.map(function (v) { return { value: v, label: labelOfCat(ch.field, v), color: map[v] }; }) };
    }
    var delta = LY.isDelta(layer, ch.field, ctx);
    var pal2 = ch.palette && ch.palette !== 'auto' ? ch.palette : delta ? 'diverging' : f.scale === 'utilization' ? 'utilization' : f.scale === 'diverging' ? 'diverging' : f.unit === 'price' || f.unit === 'money' ? 'cost' : f.unit === 'flow' ? 'flow' : 'seq';
    if (pal2 === 'utilization') return { type: 'utilization', field: f, color: function (v) { return A.utilColor(v) || '#b4bcc8'; }, bins: A.bins() };
    var dom = ch.domain && ch.domain.length === 2 ? ch.domain : numericDomain(layer, ch.field, ctx, items);
    if (pal2 === 'diverging') {
      var m = Math.max(Math.abs(dom[0]), Math.abs(dom[1])) || 1, stops = U.divergingStops(), rd = U.ramp(stops);
      return { type: 'continuous', field: f, delta: delta, domain: [-m, m], stops: stops, color: function (v) { return isFinite(v) ? rd((v + m) / (2 * m)) : '#b4bcc8'; } };
    }
    var st2 = U.palettes[pal2] || U.palettes.seq, r = U.ramp(st2);
    var lo = f.unit === 'price' ? dom[0] : Math.min(0, dom[0]), hi = dom[1] > lo ? dom[1] : lo + 1;
    return { type: 'continuous', field: f, delta: delta, domain: [lo, hi], stops: st2, color: function (v) { return isFinite(v) ? r((v - lo) / (hi - lo)) : '#b4bcc8'; } };
  };
  function labelOfCat(field, v) {
    if (field === 'kind' || field === 'atype') return (C.elementTypes[v] || {}).plural || v;
    if (field === 'region') { var c = A.current(), r = c && c.ds.regions.filter(function (x) { return x.id === v; })[0]; return r ? r.name : v; }
    return v;
  }
  /** Size scale for 'size' (line width / symbol diameter) or 'arrows' (icon scale). */
  LY.sizeScale = function (layer, ctx, channel, items) {
    var ch = layer[channel] || {};
    if (!ch.field) return { type: 'fixed', size: function () { return +ch.value || 1; }, value: +ch.value || 1 };
    var f = LY.field(layer, ch.field); if (!f) return { type: 'fixed', size: function () { return 1; } };
    var dom = numericDomain(layer, ch.field, ctx, items || LY.items(layer, ctx.c));
    var mx = Math.max(Math.abs(dom[0]), Math.abs(dom[1])) || 1, lo = +ch.min, hi = +ch.max;
    return { type: 'scaled', field: f, max: mx, min: lo, maxSize: hi,
      size: function (v) { return isFinite(v) ? lo + (hi - lo) * Math.sqrt(Math.min(Math.abs(v), mx) / mx) : lo; } };
  };

  // ---------------------------------------------------------------- labels
  LY.labelText = function (layer, it, ctx) {
    return (layer.labels.fields || []).map(function (fid) {
      var f = LY.field(layer, fid); if (!f) return null;
      var v = LY.value(layer, fid, it, ctx);
      if (f.type !== 'num') return v === '' ? null : GV.t(String(v));
      if (!isFinite(v)) return null;
      return (f.unit ? U.fmt(v, f.unit, { sign: LY.isDelta(layer, fid, ctx) }) : U.fmtNum(v));
    }).filter(Boolean).join('\n');
  };

  // ---------------------------------------------------------------- build (map data)
  /**
   * Returns { main, dir, labels } FeatureCollections for the map, plus per-element halo sizes.
   * globalPass: result of the global filters (elements failing them are faded).
   */
  LY.build = function (layer, ctx, geom, globalPass) {
    var c = ctx.c, items = LY.items(layer, c), dark = A.isDark();
    var cs = LY.colorScale(layer, ctx, items), ss = LY.sizeScale(layer, ctx, 'size', items);
    var out = { main: [], labels: [], arcLines: [], haloArc: {}, haloNode: {}, pies: [] }, arcRecs = [];
    var showLabels = layer.labels && layer.labels.show && (layer.labels.fields || []).length;
    if (layer.type === 'ref') return buildRef(layer, ctx, items, cs, ss, out);
    var as = layer.type === 'arc' && layer.arrows && layer.arrows.show ? LY.sizeScale(layer, ctx, 'arrows', items) : null;
    var pos = LY.POSITIONS[layer.position] || [0, 0];
    var stroke = layer.stroke && layer.stroke !== 'auto' ? layer.stroke : dark ? '#0f172a' : '#ffffff';
    items.forEach(function (it, k) {
      if (!LY.passes(layer, it, ctx)) return;
      var colorV = layer.color.field ? LY.value(layer, layer.color.field, it, ctx) : null;
      var sizeV = layer.size.field ? LY.value(layer, layer.size.field, it, ctx) : null;
      var col = cs.color(colorV), px = ss.size(sizeV);
      var dimmed = globalPass && ((it.kind === 'arc' && !globalPass.arc[it.i]) || (it.kind === 'node' && !globalPass.node[it.i]) || (it.kind === 'asset' && !globalPass.asset[it.i]));
      var o = dimmed ? 0.14 : 1;
      var text = showLabels ? LY.labelText(layer, it, ctx) : '';
      if (layer.type === 'arc') {
        var g = geom[it.i]; if (!g) return;
        var F = ctx.F, inSvc = F.arc.capFT[it.i] + F.arc.capTF[it.i] > 1e-6 || F.arc.absFlow[it.i] > 1e-3;
        if (!inSvc) { col = dark ? '#5b6472' : '#b4bcc8'; px = Math.min(px, 1.6); }
        var feat = { type: 'Feature', id: k, properties: { eid: it.id, ek: 'arc', c: col, w: px, o: o, po: 0 }, geometry: { type: 'LineString', coordinates: g } };
        out.main.push(feat);
        out.haloArc[it.i] = Math.max(out.haloArc[it.i] || 0, px);
        var d = F.arc.dir[it.i];
        var av = as && layer.arrows.field ? LY.value(layer, layer.arrows.field, it, ctx, true) : null;
        arcRecs.push({ feat: feat, i: it.i, g: g, px: px, col: col, o: o, dir: inSvc ? d : 0, as: as ? as.size(av) : 0, text: text });
      } else {
        // Offsets: the layer position is applied as a constant translate on the map layer;
        // several assets of one node ('each') are spread with the slot key (see map.js).
        var ni = it.kind === 'asset' ? it.node : it.i, n = c.nodes[ni];
        var sc = px / SHAPE_PX, sk = it.kind === 'asset' ? it.slot + '/' + it.slots : '0/1';
        var ic = 'gv-shape-' + (layer.shape || 'circle');
        if (layer.shape === 'pie') {
          ic = 'gvpie-' + layer.id + '-' + k;
          var vec = originVec(it, c, ctx.F), sh = GV.origin.shares(vec);
          out.pies.push({ id: ic, parts: Array.prototype.map.call(sh, function (v, g) { return { share: v, color: C.sourceGroups[g].color }; }), stroke: stroke });
        }
        out.main.push({ type: 'Feature', id: k, properties: { eid: it.id, ek: it.kind, c: col, s: sc, ic: ic, sk: sk, o: o, hc: stroke }, geometry: { type: 'Point', coordinates: [n.dlon, n.dlat] } });
        if (!pos[0] && !pos[1]) out.haloNode[ni] = Math.max(out.haloNode[ni] || 0, px / 2);
        if (text) {
          var fs = layer.labels.size || 11;
          out.labels.push({ type: 'Feature', properties: { t: text, o: o, ro: (px / 2 + 2) / fs }, geometry: { type: 'Point', coordinates: [n.dlon, n.dlat] } });
        }
      }
    });
    // overlapping arcs (same pair of nodes, or routed along the same physical pipeline) are drawn side by
    // side where they overlap. Each arc stays one continuous line; its sideways offset (in screen pixels)
    // is given per stretch ("lanes") and blended smoothly by map.js, converging to zero at the nodes.
    if (arcRecs.length) {
      var gap = st.get('parallelGap'), pieces = c.pieces(st.get('geomMode') || 'real'), maxW = {};
      if (gap === undefined || gap === null) gap = 4;
      arcRecs.forEach(function (r) { (pieces[r.i] || []).forEach(function (p) { if (p.n > 1) maxW[p.sig] = Math.max(maxW[p.sig] || 0, r.px); }); });
      arcRecs.forEach(function (r) {
        var ps = pieces[r.i] || [];
        var lanes = ps.map(function (p) { return { from: p.from, to: p.to, weak: p.weak, off: p.n > 1 ? p.sign * (p.slot - (p.n - 1) / 2) * ((maxW[p.sig] || r.px) + gap) : 0 }; });
        out.arcLines.push({ feat: r.feat, coords: r.g, lanes: lanes.some(function (x) { return x.off; }) ? lanes : null,
 dir: r.dir, as: r.as, c: r.col, o: r.o, t: r.text ? r.text.split(String.fromCharCode(10)).join(' · ') : '' });
      });
      out.arcCount = arcRecs.length;
    }
    out.colorScale = cs; out.sizeScale = ss; out.arrowScale = as; out.count = out.arcCount !== undefined ? out.arcCount : out.main.length; out.total = items.length;
    return out;
  };
  function arrowColor(lineColor, width, dark) {
    if (width < 4.5) return dark ? '#f1f5f9' : '#1e293b';
    var rgb = U.hex2rgb(lineColor.length === 7 ? lineColor : '#888888');
    return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) > 150 ? '#1e293b' : '#ffffff';
  }
  function buildRef(layer, ctx, items, cs, ss, out) {
    var rl = LY.refLayer(layer.ref); if (!rl) return out;
    var dark = A.isDark(), stroke = layer.stroke && layer.stroke !== 'auto' ? layer.stroke : dark ? '#0f172a' : '#ffffff';
    items.forEach(function (it, k) {
      if (!LY.passes(layer, it, ctx)) return;
      var col = cs.color(layer.color.field ? LY.raw(layer, layer.color.field, it) : null);
      var px = ss.size(layer.size.field ? LY.raw(layer, layer.size.field, it) : null);
      var props = { eid: it.id, ek: 'ref', c: col, w: px, s: px / SHAPE_PX, ic: 'gv-shape-' + (layer.shape || 'circle'), sk: '0/1', o: 1, hc: stroke };
      out.main.push({ type: 'Feature', id: k, properties: props, geometry: it.f.geometry });
      if (layer.labels.show) {
        var t = LY.labelText(layer, it, ctx);
        if (t) {
          var g = it.f.geometry, pt = g.type === 'Point' ? g.coordinates : U.midpoint(g.type === 'LineString' ? g.coordinates : g.coordinates[0]);
          out.labels.push({ type: 'Feature', properties: { t: t, o: 1, ro: 0.9 }, geometry: { type: 'Point', coordinates: pt } });
        }
      }
    });
    out.colorScale = cs; out.sizeScale = ss; out.count = out.main.length; out.total = items.length;
    return out;
  }
  LY.geomKind = function (layer) {
    if (layer.type === 'arc') return 'line';
    if (layer.type === 'ref') { var rl = LY.refLayer(layer.ref); return rl && rl.geom === 'line' ? 'line' : 'point'; }
    return 'point';
  };
  LY.SHAPE_PX = SHAPE_PX;
})();
