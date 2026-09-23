/*
 * Gas origin tracing (proportional sharing / perfect mixing at nodes).
 *
 * Every injection (producer, LNG supply, storage discharge) is a source. At each node the gas that
 * arrives through pipelines mixes with local injections; everything leaving the node (pipelines,
 * demands, storage charge) carries the node's mix. Solved for every block / scenario / period
 * (topological order of the flow graph, Gauss–Seidel iterations if the flows contain loops),
 * then aggregated like any other result (hours-weighted volumes).
 *
 * Results are available per node (mix), per arc (composition of the flow), per demand asset,
 * at the level of individual sources and of source groups (config: sourceGroups).
 */
(function () {
  'use strict';
  var C = GV.config;
  var O = GV.origin = {};

  O.groups = function () { return C.sourceGroups; };
  O.groupOf = function (asset) {
    var gs = C.sourceGroups;
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i];
      if (g.types && g.types.indexOf(asset.type) < 0) continue;
      if (g.match && !g.match.test(asset.name)) continue;
      return i;
    }
    return gs.length - 1;
  };
  O.colorOf = function (gi) { return (C.sourceGroups[gi] || {}).color || '#94a3b8'; };

  var Case = GV.Case;

  /** Sources of the case: producers, LNG supply and storage. */
  Case.prototype.sources = function () {
    if (this._sources) return this._sources;
    var self = this, out = [];
    this.assets.forEach(function (a, x) {
      if (a.type === 'producer' || a.type === 'lng_supply' || a.type === 'storage') out.push({ x: x, id: a.id, name: a.name, node: self.nodeIx[a.node], group: O.groupOf(a) });
    });
    return (this._sources = out);
  };

  /** Per-t tracing (computed once per case). */
  Case.prototype._traceAll = function () {
    if (this._trace) return this._trace;
    var self = this, T = this.T, N = this.nodes.length, src = this.sources(), S = src.length, A = this.arcs.length;
    var mix = new Float64Array(T * N * S);        // volume (rate) of source s in the mix of node n
    var total = new Float64Array(T * N);
    var srcAt = this.nodes.map(function () { return []; });
    src.forEach(function (s, k) { srcAt[s.node].push(k); });
    var inArcs = this.nodes.map(function () { return []; });
    for (var t = 0; t < T; t++) {
      var base = t * N * S;
      // incoming edges for this t
      inArcs.forEach(function (l) { l.length = 0; });
      var indeg = new Int32Array(N), outs = this.nodes.map(function () { return []; });
      for (var a = 0; a < A; a++) {
        var f = this.arcFlow[a][t]; if (Math.abs(f) < 1e-6) continue;
        var arc = this.arcs[a], u = this.nodeIx[f > 0 ? arc.from : arc.to], v = this.nodeIx[f > 0 ? arc.to : arc.from];
        var arr = Math.abs(f) * (1 - (f > 0 ? arc.lossFT : arc.lossTF));
        inArcs[v].push([u, arr]); outs[u].push(v); indeg[v]++;
      }
      // topological order (Kahn); nodes left in cycles are appended
      var order = [], q = [], deg = indeg.slice(), seen = new Uint8Array(N);
      for (var n = 0; n < N; n++) if (!deg[n]) q.push(n);
      while (q.length) { var x = q.shift(); order.push(x); seen[x] = 1; outs[x].forEach(function (w) { if (--deg[w] === 0) q.push(w); }); }
      for (var r = 0; r < N; r++) if (!seen[r]) order.push(r);
      var cyclic = order.length > 0 && Array.prototype.some.call(seen, function (z) { return !z; });
      for (var pass = 0; pass < (cyclic ? 60 : 1); pass++) {
        var change = 0;
        for (var oi = 0; oi < order.length; oi++) {
          var nn = order[oi], o = base + nn * S, tot = 0;
          var vec = new Float64Array(S);
          srcAt[nn].forEach(function (k) { var val = self.assetVal[src[k].x][t]; if (val > 0) vec[k] += val; });
          inArcs[nn].forEach(function (e) {
            var uo = base + e[0] * S, ut = total[t * N + e[0]];
            if (ut <= 0) return;
            for (var s2 = 0; s2 < S; s2++) { var m = mix[uo + s2]; if (m) vec[s2] += e[1] * m / ut; }
          });
          for (var s3 = 0; s3 < S; s3++) { tot += vec[s3]; change = Math.max(change, Math.abs(vec[s3] - mix[o + s3])); mix[o + s3] = vec[s3]; }
          total[t * N + nn] = tot;
        }
        if (change < 1e-7) break;
      }
    }
    this._trace = { mix: mix, total: total, S: S };
    return this._trace;
  };

  /**
   * Origin for a selection: shares by source group for nodes, arcs and assets, and the
   * individual-source mix of each node. Cached per selection.
   */
  Case.prototype.originFrame = function (sel) {
    var key = sel.stage + '|' + sel.seq + '|' + sel.block;
    this._ofr = this._ofr || {};
    if (this._ofr[key]) return this._ofr[key];
    var self = this, tr = this._traceAll(), src = this.sources(), S = tr.S, N = this.nodes.length, G = C.sourceGroups.length;
    var T = this.T, tmp = new Float64Array(T);
    function aggSeries(fill) { for (var t = 0; t < T; t++) tmp[t] = fill(t); return self.agg(tmp, sel, 'avg'); }
    // node mix by individual source
    var nodeSrc = [], nodeGrp = [], nodeTot = new Float64Array(N);
    for (var n = 0; n < N; n++) {
      var vs = new Float64Array(S), vg = new Float64Array(G), tot = 0;
      if (tr.total[n] !== undefined) {
        for (var s = 0; s < S; s++) {
          var v = aggSeries(function (t) { return tr.mix[(t * N + n) * S + s]; });
          vs[s] = v; vg[src[s].group] += v; tot += v;
        }
      }
      nodeSrc.push(vs); nodeGrp.push(vg); nodeTot[n] = tot;
    }
    // arcs: flow volume by group, taking the upstream node mix of each t
    var arcGrp = this.arcs.map(function (a, ai) {
      var vg = new Float64Array(G);
      var fi = self.nodeIx[a.from], ti = self.nodeIx[a.to], f = self.arcFlow[ai];
      for (var g = 0; g < G; g++) {
        vg[g] = aggSeries(function (t) {
          var ft = f[t]; if (Math.abs(ft) < 1e-6) return 0;
          var u = ft > 0 ? fi : ti, ut = tr.total[t * N + u]; if (ut <= 0) return 0;
          var sum = 0;
          for (var s = 0; s < S; s++) if (src[s].group === g) sum += tr.mix[(t * N + u) * S + s];
          return Math.abs(ft) * sum / ut;
        });
      }
      return vg;
    });
    // withdrawal assets (demands, storage charge): their consumption times the node mix
    var assetGrp = this.assets.map(function (x, xi) {
      var vg = new Float64Array(G), ni = self.nodeIx[x.node], val = self.assetVal[xi];
      if (x.type === 'producer' || x.type === 'lng_supply') { vg[O.groupOf(x)] = self.agg(val, sel, 'avg'); return vg; }
      for (var g = 0; g < G; g++) {
        vg[g] = aggSeries(function (t) {
          var c = x.type === 'storage' ? Math.max(0, -val[t]) : val[t];
          if (x.type === 'storage' && val[t] > 0) return O.groupOf(x) === g ? val[t] : 0;
          var ut = tr.total[t * N + ni]; if (!c || ut <= 0) return 0;
          var sum = 0;
          for (var s = 0; s < S; s++) if (src[s].group === g) sum += tr.mix[(t * N + ni) * S + s];
          return c * sum / ut;
        });
      }
      return vg;
    });
    var out = { sources: src, nodeSrc: nodeSrc, nodeGrp: nodeGrp, nodeTot: nodeTot, arcGrp: arcGrp, assetGrp: assetGrp };
    this._ofr[key] = out;
    return out;
  };

  /** Share vector (0..1 per group) from a volume vector. */
  O.shares = function (vg) {
    var tot = 0, i; for (i = 0; i < vg.length; i++) tot += vg[i];
    var out = new Float64Array(vg.length); if (tot <= 0) return out;
    for (i = 0; i < vg.length; i++) out[i] = vg[i] / tot;
    return out;
  };
  O.dominant = function (vg) {
    var best = -1, bv = 0; for (var i = 0; i < vg.length; i++) if (vg[i] > bv) { bv = vg[i]; best = i; }
    return best;
  };
  /** Origin → destination flows (source group → region · use) for the Sankey chart. */
  O.destinations = function (c, sel) {
    var of = c.originFrame(sel), out = {};
    c.assets.forEach(function (x, xi) {
      if (x.type !== 'citygate' && x.type !== 'thermal') return;
      var region = c.node(x.node).region, key = region + ' · ' + (x.type === 'thermal' ? 'thermal' : 'city-gates');
      var vg = of.assetGrp[xi];
      for (var g = 0; g < vg.length; g++) if (vg[g] > 1e-6) { var k = g + '|' + key; out[k] = (out[k] || 0) + vg[g]; }
    });
    return Object.keys(out).map(function (k) { var p = k.split('|'); return { group: +p[0], dest: p[1], value: out[k] }; });
  };
})();
