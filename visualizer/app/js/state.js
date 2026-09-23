/*
 * Application state + event bus. Every view subscribes to the keys it cares about,
 * so changing a dimension (case, scenario, period, block) updates map, charts, tables,
 * tooltips and the properties panel together.
 */
(function () {
  'use strict';
  var listeners = {};
  var S = {
    caseId: null,
    stage: 0,           // period index
    seq: 0,             // scenario index (-1 = mean of scenarios)
    block: -1,          // block index (-1 = hours-weighted average of blocks)
    preset: 'congestion',
    style: null,        // { arcColor, arcWidth, arrows, nodeColor, nodeSize }
    layers: {},         // id -> { visible, opacity }
    filters: [],        // [{ id, type, label, ... }]
    selection: [],      // [{ kind: 'node'|'arc'|'asset', id }]
    highlight: null,    // { label, nodes: {id:true}, arcs: {id:true} }
    compare: { mode: 'off', caseId: null, stage: 0 },
    units: { flow: 'kNm3d', price: 'usd_km3' },
    bins: null,
    lockScale: true,
    range: null,        // [fromStage, toStage] for time-series analyses
    theme: 'auto',
    pick: null          // { action, from: {kind,id} } while picking a second element
  };

  GV.state = {
    get: function (k) { return k ? S[k] : S; },
    /** set({ key: value, ... }) and notify listeners of the keys that changed. */
    set: function (patch, opts) {
      var changed = [];
      Object.keys(patch).forEach(function (k) {
        if (S[k] !== patch[k]) { S[k] = patch[k]; changed.push(k); }
      });
      if (!changed.length && !(opts && opts.force)) return;
      if (opts && opts.force) Object.keys(patch).forEach(function (k) { if (changed.indexOf(k) < 0) changed.push(k); });
      var called = [];
      changed.concat(['*']).forEach(function (k) {
        (listeners[k] || []).forEach(function (fn) {
          if (called.indexOf(fn) >= 0) return;
          called.push(fn);
          try { fn(changed); } catch (e) { console.error(e); }
        });
      });
    },
    /** on('stage seq block', fn) */
    on: function (keys, fn) {
      keys.split(/\s+/).forEach(function (k) { (listeners[k] = listeners[k] || []).push(fn); });
    },
    // ---- selection helpers ----
    isSelected: function (kind, id) {
      return S.selection.some(function (s) { return s.kind === kind && s.id === id; });
    },
    select: function (kind, id, additive) {
      var sel;
      if (!kind) sel = [];
      else if (additive) {
        sel = S.selection.filter(function (s) { return !(s.kind === kind && s.id === id); });
        if (sel.length === S.selection.length) sel.push({ kind: kind, id: id });
      } else sel = [{ kind: kind, id: id }];
      GV.state.set({ selection: sel });
    },
    selectMany: function (items, additive) {
      var sel = additive ? S.selection.slice() : [];
      items.forEach(function (it) {
        if (!sel.some(function (s) { return s.kind === it.kind && s.id === it.id; })) sel.push(it);
      });
      GV.state.set({ selection: sel });
    },
    /** time selector object for the model */
    sel: function (over) {
      var o = { stage: S.stage, seq: S.seq, block: S.block };
      if (over) Object.keys(over).forEach(function (k) { o[k] = over[k]; });
      return o;
    }
  };
})();
