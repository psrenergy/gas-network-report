/*
 * Case model: wraps a "gv-case" dataset with indexes, derived results (nodal balance,
 * utilization), dimension aggregation, cached frames, topology queries and filters.
 *
 * Static network data (nodes, arcs, geometry) is prepared once; changing period / scenario /
 * block only computes a new "frame" of values (cached), never rebuilding geometry.
 */
(function () {
  'use strict';
  var U = GV.util;
  var EPS = 1e-6;

  function Case(ds) {
    var self = this;
    this.ds = ds;
    this.id = ds.id || (ds.name || 'case').replace(/[^\w]+/g, '-').toLowerCase() + '-' + Math.random().toString(36).slice(2, 6);
    ds.id = this.id;
    this.name = ds.name;
    this.time = ds.time;
    this.nodes = ds.nodes; this.arcs = ds.arcs; this.assets = ds.assets;
    this.nS = ds.time.nStages; this.nQ = ds.time.nSeq; this.nB = ds.time.nBlocks;
    this.T = this.nS * this.nQ * this.nB;

    this.nodeIx = {}; this.arcIx = {}; this.assetIx = {};
    this.nodes.forEach(function (n, i) { self.nodeIx[n.id] = i; });
    this.arcs.forEach(function (a, i) { self.arcIx[a.id] = i; });
    this.assets.forEach(function (a, i) { self.assetIx[a.id] = i; });

    // incidence
    this.nodeArcs = this.nodes.map(function () { return []; });
    this.arcs.forEach(function (a, i) {
      self.nodeArcs[self.nodeIx[a.from]].push(i);
      self.nodeArcs[self.nodeIx[a.to]].push(i);
    });

    this._buildGeometry();
    this._buildSeries();
    this._buildDuals();
    this._frames = {};
  }
  GV.Case = Case;

  // ---------- geometry ----------
  Case.prototype._buildGeometry = function () {
    var self = this;
    var pairCount = {}, pairSeen = {};
    this.arcs.forEach(function (a) {
      var k = [a.from, a.to].sort().join('|');
      pairCount[k] = (pairCount[k] || 0) + 1;
    });
    // 'straight' and 'arcs' geometries. Arcs between the same pair of nodes ("parallel" pipelines) share
    // the geometry and are drawn side by side with a screen-space offset (see this.parallel / layers.js).
    this.geomStraight = []; this.geomArcs = []; this.parallel = [];
    this.arcs.forEach(function (a) {
      var f = self.node(a.from), t = self.node(a.to);
      var k = [a.from, a.to].sort().join('|');
      var n = pairCount[k], i = pairSeen[k] = (pairSeen[k] || 0) + 1;
      self.parallel.push({ key: k, k: i - 1, n: n, sign: a.from < a.to ? 1 : -1 });
      if (f.dlat === null || t.dlat === null) { self.geomStraight.push(null); self.geomArcs.push(null); return; }
      var p = [f.dlon, f.dlat], q = [t.dlon, t.dlat];
      // parallel arcs are always drawn with the canonical orientation's geometry so their offsets line up
      var canon = a.from < a.to;
      var s = canon ? [p, q] : [q, p], cv = canon ? U.curve(p, q, 0.1, 24) : U.curve(q, p, 0.1, 24);
      self.geomStraight.push(canon ? s : s.slice().reverse());
      self.geomArcs.push(canon ? cv : cv.slice().reverse());
    });
    this.routes = {};          // arc id -> { coords, source, networkKm, accessKm }
    this._updateLengths();
  };
  /** Geometry of all arcs for a display mode: 'real' | 'straight' | 'arcs'. */
  Case.prototype.arcGeometry = function (mode) {
    var self = this;
    if (mode === 'arcs') return this.geomArcs;
    if (mode === 'straight') return this.geomStraight;
    return this.arcs.map(function (a, i) {
      if (a.geometry && a.geometry.length > 1) return a.geometry;
      var r = self.routes[a.id];
      return r ? r.coords : self.geomStraight[i];
    });
  };
  /**
   * Split every arc geometry into "pieces": runs of consecutive segments shared by the same set of arcs.
   * Arcs that overlap (same pair of nodes, or different arcs routed along the same physical pipeline)
   * are then drawn side by side, only where they overlap. Each piece: { coords, n, slot, sign }.
   */
  Case.prototype.pieces = function (mode) {
    this._pieces = this._pieces || {};
    if (this._pieces[mode]) return this._pieces[mode];
    var geom = this.arcGeometry(mode);
    function vk(c) { return (Math.round(c[0] * 1e5)) + ',' + (Math.round(c[1] * 1e5)); }
    var seg = {}, ref = {};   // segment -> arcs using it; direction in which the first arc traverses it
    geom.forEach(function (g, ai) {
      if (!g) return;
      var seen = {};
      for (var j = 1; j < g.length; j++) {
        var a = vk(g[j - 1]), b = vk(g[j]); if (a === b) continue;
        var k = a < b ? a + '|' + b : b + '|' + a;
        if (seen[k]) continue; seen[k] = 1;
        if (!seg[k]) { seg[k] = []; ref[k] = a < b; }
        seg[k].push(ai);
      }
    });
    var out = geom.map(function (g, ai) {
      if (!g) return null;
      // per segment: sharing set and side (+1 = same direction as the reference arc of that segment)
      var segs = [];
      for (var j = 1; j < g.length; j++) {
        var a = vk(g[j - 1]), b = vk(g[j]);
        if (a === b) { if (segs.length) segs[segs.length - 1].to = j; continue; }
        var k = a < b ? a + '|' + b : b + '|' + a, members = seg[k] || [ai];
        segs.push({ from: j - 1, to: j, sig: members.length > 1 ? members.join(',') : '', n: members.length, slot: members.indexOf(ai), sign: (a < b) === ref[k] ? 1 : -1, km: U.haversine(g[j - 1], g[j]) });
      }
      // ignore tiny overlaps (e.g. one short segment at a junction): they would only make the line jitter
      var runs = [], cur = null;
      segs.forEach(function (sg) {
        var key = sg.sig + '/' + sg.sign;
        if (cur && cur.key === key) { cur.to = sg.to; cur.km += sg.km; cur.nseg++; }
        else { cur = { key: key, from: sg.from, to: sg.to, km: sg.km, nseg: 1, n: sg.n, slot: sg.slot, sign: sg.sign, sig: sg.sig }; runs.push(cur); }
      });
      // tiny stretches (a short shared or unshared bit at a junction) are 'weak': the drawing blends the offset across them
      runs.forEach(function (r, k) { if (r.n === 1) { r.sign = 1; r.key = '/1'; } if (runs.length > 1 && r.km < 8 && r.nseg < 3) { r.weak = true; r.key += '/w' + k; } });
      var pieces = [];
      runs.forEach(function (r) {
        var last = pieces[pieces.length - 1];
        if (last && last.key === r.key) { last.to = r.to; return; }
        pieces.push({ key: r.key, from: r.from, to: r.to, n: r.n, slot: r.slot, sign: r.sign, sig: r.sig, weak: !!r.weak });
      });
      return pieces.map(function (p) { return { from: p.from, to: p.to, coords: g.slice(p.from, p.to + 1), n: p.n, slot: p.slot, sign: p.sign, sig: p.sig, weak: p.weak }; });
    });
    return (this._pieces[mode] = out);
  };
  Case.prototype.isRouted = function (i) { var a = this.arcs[i]; return !!((a.geometry && a.geometry.length > 1) || this.routes[a.id]); };
  /** Route arcs along a reference network (see routing.js). */
  Case.prototype.setRoutes = function (graph, label) {
    var self = this, n = 0;
    this.routes = {};
    this.arcs.forEach(function (a) {
      if (a.kind !== 'pipeline') return;
      var f = self.node(a.from), t = self.node(a.to);
      if (f.lat === null || t.lat === null) return;
      var r = GVRouting.route(graph, [f.dlon, f.dlat], [t.dlon, t.dlat]);
      if (r) { r.source = label; self.routes[a.id] = r; n++; }
    });
    this._updateLengths();
    return n;
  };
  Case.prototype._updateLengths = function () {
    var self = this, real = this.arcGeometry('real');
    this.arcGeom = real;
    this._frames = {}; this._dom = {}; this._pieces = {};
    this.arcLength = real.map(function (g) { return g ? U.lineLength(g) : 0; });
    this.arcs.forEach(function (a, i) {
      a.attrs = a.attrs || {};
      var r = self.routes[a.id];
      a.attrs['Length (km)'] = Math.round(self.arcLength[i]) + (a.geometry ? ' (geometry file)' : r ? ' (along ' + r.source + ' route)' : ' (straight line)');
      if (r) a.attrs['Route match'] = Math.round(r.networkKm) + ' km on network, ' + Math.round(r.accessKm) + ' km access';
      else delete a.attrs['Route match'];
    });
  };

  // ---------- per-t primitive series ----------
  Case.prototype._buildSeries = function () {
    var self = this, T = this.T, R = this.ds.results || { arc: {}, node: {}, asset: {} };
    R.arc = R.arc || {}; R.node = R.node || {}; R.asset = R.asset || {};
    function arr(src) { return src ? Float64Array.from(src) : new Float64Array(T); }
    var nN = this.nodes.length;

    this.arcFlow = this.arcs.map(function (a) { return arr((R.arc.flow || {})[a.id]); });
    this.arcCost = this.arcs.map(function (a) { return arr((R.arc.cost || {})[a.id]); });
    this.hasResults = Object.keys(R.arc.flow || {}).length > 0;

    var keys = ['pipeIn', 'pipeOut', 'regasIn', 'regasOut', 'production', 'lng', 'stDis', 'stChg', 'citygate', 'thermal', 'deficit', 'cmg'];
    this.ns = {};
    keys.forEach(function (k) { self.ns[k] = []; for (var i = 0; i < nN; i++) self.ns[k].push(new Float64Array(T)); });
    this.nodes.forEach(function (n, i) { if ((R.node.cmg || {})[n.id]) self.ns.cmg[i] = arr(R.node.cmg[n.id]); });

    this.arcs.forEach(function (a, ai) {
      var fi = self.nodeIx[a.from], ti = self.nodeIx[a.to], f = self.arcFlow[ai];
      var inK = a.kind === 'regas' ? 'regasIn' : 'pipeIn', outK = a.kind === 'regas' ? 'regasOut' : 'pipeOut';
      for (var t = 0; t < T; t++) {
        var v = f[t];
        if (v >= 0) { self.ns[outK][fi][t] += v; self.ns[inK][ti][t] += v * (1 - a.lossFT); }
        else { self.ns[outK][ti][t] += -v; self.ns[inK][fi][t] += -v * (1 - a.lossTF); }
      }
    });

    this.assetVal = []; this.assetDef = []; this.assetLevel = [];
    this.assets.forEach(function (as) {
      var ni = self.nodeIx[as.node];
      var val = arr(as.type === 'producer' || as.type === 'lng_supply' ? (R.asset.production || {})[as.id]
        : as.type === 'storage' ? (R.asset.discharge || {})[as.id] : (R.asset.met || {})[as.id]);
      var def = arr((R.asset.deficit || {})[as.id]);
      self.assetVal.push(val); self.assetDef.push(def); self.assetLevel.push(arr((R.asset.level || {})[as.id]));
      for (var t = 0; t < T; t++) {
        var v = val[t];
        if (as.type === 'producer') self.ns.production[ni][t] += v;
        else if (as.type === 'lng_supply') self.ns.lng[ni][t] += v;
        else if (as.type === 'storage') { if (v >= 0) self.ns.stDis[ni][t] += v; else self.ns.stChg[ni][t] += -v; }
        else if (as.type === 'thermal') self.ns.thermal[ni][t] += v;
        else self.ns.citygate[ni][t] += v;
        self.ns.deficit[ni][t] += def[t];
      }
    });
  };

  /**
   * Implied capacity duals (KKT of the transport LP): for flow from i to j,
   * mu = (1 - loss) * CMg_j - CMg_i - tariff, positive only when the arc limits the flow.
   * For arcs without flow the best direction is taken: the value of adding capacity there.
   * Units: $/mil m3 (same as marginal costs). Congestion rent = mu * |flow| in k$/d.
   */
  Case.prototype._buildDuals = function () {
    var self = this, T = this.T;
    this.arcMu = []; this.arcRent = [];
    this.arcs.forEach(function (a, ai) {
      var fi = self.nodeIx[a.from], ti = self.nodeIx[a.to], f = self.arcFlow[ai];
      var mu = new Float64Array(T), rent = new Float64Array(T);
      var cf = self.ns.cmg[fi], ct = self.ns.cmg[ti];
      var effFT = 1 - a.lossFT, effTF = 1 - a.lossTF;
      for (var t = 0; t < T; t++) {
        var ft = effFT * ct[t] - cf[t] - (a.costFT || 0), tf = effTF * cf[t] - ct[t] - (a.costTF || 0);
        var v = f[t] > 1e-3 ? ft : f[t] < -1e-3 ? tf : Math.max(ft, a.capTF && a.capTF.some(function (x) { return x > 0; }) ? tf : -Infinity);
        mu[t] = v > 0.01 ? v : 0;
        rent[t] = mu[t] * Math.abs(f[t]) / 1000;
      }
      self.arcMu.push(mu); self.arcRent.push(rent);
    });
    this.assets.forEach(function (x) {
      if (x.type === 'storage' && x.maxStorage === undefined) {
        var m = parseFloat(String((x.attrs || {})['Max storage'] || '').replace(',', '.'));
        x.maxStorage = isNaN(m) ? null : m;
      }
    });
  };

  // ---------- lookup ----------
  Case.prototype.node = function (id) { return this.nodes[this.nodeIx[id]]; };
  Case.prototype.arc = function (id) { return this.arcs[this.arcIx[id]]; };
  Case.prototype.asset = function (id) { return this.assets[this.assetIx[id]]; };
  Case.prototype.element = function (kind, id) {
    return kind === 'node' ? this.node(id) : kind === 'arc' ? this.arc(id) : this.asset(id);
  };
  Case.prototype.index = function (kind, id) {
    return kind === 'node' ? this.nodeIx[id] : kind === 'arc' ? this.arcIx[id] : this.assetIx[id];
  };
  Case.prototype.typeOf = function (kind, el) {
    if (kind === 'node') return 'node';
    if (kind === 'arc') return el.kind;
    return el.type;
  };
  Case.prototype.typeLabel = function (kind, el) {
    var t = GV.config.elementTypes[this.typeOf(kind, el)];
    return t ? t.label : kind;
  };
  Case.prototype.periodLabel = function (s) { return (this.time.periods[s] || {}).label || ('Stage ' + (s + 1)); };
  Case.prototype.hours = function (s, b) { return this.time.hours[s * this.nB + b]; };

  // ---------- aggregation over dimensions ----------
  Case.prototype.tIx = function (s, q, b) { return (s * this.nQ + q) * this.nB + b; };
  /** Aggregate a per-t series for selector sel. how: 'avg' (hours-weighted) | 'sum' | 'max' */
  Case.prototype.agg = function (series, sel, how) {
    var s = Math.min(sel.stage, this.nS - 1);
    var qs = sel.seq < 0 ? range(this.nQ) : [Math.min(sel.seq, this.nQ - 1)];
    var bs = sel.block < 0 ? range(this.nB) : [Math.min(sel.block, this.nB - 1)];
    var self = this, vals = [];
    qs.forEach(function (q) {
      var acc = 0, hw = 0, mx = -Infinity;
      bs.forEach(function (b) {
        var v = series[self.tIx(s, q, b)], h = self.hours(s, b);
        if (how === 'sum') acc += v;
        else if (how === 'max') mx = Math.max(mx, v);
        else { acc += v * h; hw += h; }
      });
      vals.push(how === 'sum' ? acc : how === 'max' ? mx : (hw ? acc / hw : 0));
    });
    return combine(vals, sel.seq);
  };
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  /**
   * Combine per-scenario values. Scenario selector codes: >= 0 one scenario, -1 mean,
   * -2 median (P50), -3 P10, -4 P90.
   */
  function combine(vals, code) {
    var fin = vals.filter(function (v) { return !isNaN(v); });
    if (!fin.length) return NaN;
    if (fin.length === 1 || code >= 0) return fin[0];
    if (code === -1 || code === undefined) { var sum = 0; fin.forEach(function (v) { sum += v; }); return sum / fin.length; }
    var p = code === -3 ? 0.1 : code === -4 ? 0.9 : 0.5;
    var sorted = fin.slice().sort(function (a, b) { return a - b; });
    var x = p * (sorted.length - 1), i = Math.floor(x), f = x - i;
    return i + 1 < sorted.length ? sorted[i] + (sorted[i + 1] - sorted[i]) * f : sorted[i];
  }
  Case.combine = combine;
  GV.SEQ_CODES = [{ code: -1, label: 'Mean of scenarios' }, { code: -2, label: 'Median (P50)' }, { code: -3, label: 'P10' }, { code: -4, label: 'P90' }];

  Case.prototype.capacityAt = function (ai, stage) {
    var a = this.arcs[ai];
    return { ft: a.capFT[Math.min(stage, a.capFT.length - 1)] || 0, tf: a.capTF[Math.min(stage, a.capTF.length - 1)] || 0 };
  };

  /** Utilization of an arc for a single t. NaN = out of service with no flow; Infinity = flow without capacity. */
  Case.prototype.utilT = function (ai, t) {
    var s = Math.floor(t / (this.nQ * this.nB));
    var c = this.capacityAt(ai, s), f = this.arcFlow[ai][t];
    var cap = f >= 0 ? c.ft : c.tf;
    if (cap <= EPS) return Math.abs(f) > 1e-3 ? Infinity : (c.ft + c.tf > EPS ? 0 : NaN);
    return Math.abs(f) / cap;
  };

  // ---------- frames ----------
  Case.prototype.frame = function (sel) {
    var key = sel.stage + '|' + sel.seq + '|' + sel.block;
    if (this._frames[key]) return this._frames[key];
    var self = this, nA = this.arcs.length, nN = this.nodes.length, nX = this.assets.length;
    var F = { sel: sel, arc: {}, node: {}, asset: {} };
    ['flow', 'absFlow', 'util', 'utilPeak', 'capacity', 'capFT', 'capTF', 'headroom', 'dcmg', 'transportCost', 'dir', 'tariff', 'length', 'lossPct', 'capDual', 'congRent', 'congProb'].forEach(function (k) { F.arc[k] = new Float64Array(nA); });
    ['cmg', 'injection', 'withdrawal', 'citygate', 'thermal', 'net', 'throughput', 'deficit', 'residual', 'pipeIn', 'pipeOut', 'regasIn', 'regasOut', 'production', 'lng', 'stDis', 'stChg', 'nAssets'].forEach(function (k) { F.node[k] = new Float64Array(nN); });
    ['aValue', 'aDeficit', 'aLevel', 'aUtil', 'maxProd', 'aFill', 'maxStorage'].forEach(function (k) { F.asset[k] = new Float64Array(nX); });

    // nodes
    for (var i = 0; i < nN; i++) {
      ['pipeIn', 'pipeOut', 'regasIn', 'regasOut', 'production', 'lng', 'stDis', 'stChg', 'citygate', 'thermal', 'deficit', 'cmg'].forEach(function (k) {
        F.node[k][i] = self.agg(self.ns[k][i], sel, 'avg');
      });
      var n = F.node;
      n.injection[i] = n.production[i] + n.lng[i] + n.stDis[i];
      n.withdrawal[i] = n.citygate[i] + n.thermal[i] + n.stChg[i];
      n.net[i] = n.injection[i] - n.withdrawal[i];
      n.throughput[i] = n.pipeIn[i] + n.regasIn[i];
      n.residual[i] = n.pipeIn[i] + n.regasIn[i] - n.pipeOut[i] - n.regasOut[i] + n.net[i];
      n.nAssets[i] = self.nodes[i].assets.length;
    }
    // arcs
    var blocks = sel.block < 0 ? range(this.nB) : [sel.block];
    var seqs = sel.seq < 0 ? range(this.nQ) : [sel.seq];
    for (var a = 0; a < nA; a++) {
      var fl = this.agg(this.arcFlow[a], sel, 'avg');
      var c = this.capacityAt(a, sel.stage);
      var capDir = fl >= 0 ? c.ft : c.tf;
      // utilization: hours-weighted average of per-block utilization (per scenario, then combined);
      // peak = max over blocks and scenarios; congProb = share of hours (and scenarios) at >= 95 %
      var uMax = 0, anyNaN = true, perQ = [], hC = 0, hAll = 0;
      for (var qi = 0; qi < seqs.length; qi++) {
        var uAcc = 0, hAcc = 0;
        for (var bi = 0; bi < blocks.length; bi++) {
          var t = this.tIx(sel.stage, seqs[qi], blocks[bi]), h = this.hours(sel.stage, blocks[bi]);
          var u = this.utilT(a, t);
          if (isNaN(u)) continue;
          anyNaN = false;
          uAcc += (isFinite(u) ? u : 10) * h; hAcc += h; uMax = Math.max(uMax, u);
          hAll += h; if (u >= 0.95) hC += h;
        }
        perQ.push(hAcc ? uAcc / hAcc : NaN);
      }
      F.arc.flow[a] = fl;
      F.arc.absFlow[a] = Math.abs(fl);
      F.arc.dir[a] = Math.abs(fl) < 1e-3 ? 0 : fl > 0 ? 1 : -1;
      F.arc.capFT[a] = c.ft; F.arc.capTF[a] = c.tf;
      F.arc.capacity[a] = capDir;
      F.arc.util[a] = anyNaN ? NaN : (uMax === Infinity ? Infinity : combine(perQ, sel.seq));
      F.arc.congProb[a] = hAll ? hC / hAll : NaN;
      F.arc.capDual[a] = this.agg(this.arcMu[a], sel, 'avg');
      F.arc.congRent[a] = this.agg(this.arcRent[a], sel, 'avg');
      F.arc.utilPeak[a] = anyNaN ? NaN : uMax;
      F.arc.headroom[a] = Math.max(0, capDir - Math.abs(fl));
      F.arc.transportCost[a] = this.agg(this.arcCost[a], sel, 'sum');
      var arcDef = this.arcs[a];
      F.arc.dcmg[a] = F.node.cmg[this.nodeIx[arcDef.to]] - F.node.cmg[this.nodeIx[arcDef.from]];
      F.arc.tariff[a] = fl >= 0 ? arcDef.costFT : arcDef.costTF;
      F.arc.length[a] = this.arcLength[a];
      F.arc.lossPct[a] = fl >= 0 ? arcDef.lossFT : arcDef.lossTF;
    }
    // assets
    for (var x = 0; x < nX; x++) {
      var as = this.assets[x];
      F.asset.aValue[x] = this.agg(this.assetVal[x], sel, 'avg');
      F.asset.aDeficit[x] = this.agg(this.assetDef[x], sel, 'avg');
      F.asset.aLevel[x] = this.agg(this.assetLevel[x], sel, 'avg');
      var mp = as.maxProd ? as.maxProd[Math.min(sel.stage, as.maxProd.length - 1)] : 0;
      F.asset.aUtil[x] = mp > EPS ? F.asset.aValue[x] / mp : NaN;
      F.asset.maxProd[x] = as.maxProd ? mp : NaN;
      F.asset.maxStorage[x] = as.maxStorage ? as.maxStorage : NaN;
      F.asset.aFill[x] = as.maxStorage ? F.asset.aLevel[x] / as.maxStorage : NaN;
    }
    this._frames[key] = F;
    return F;
  };

  /** Value of a variable for one element at sel. */
  Case.prototype.value = function (kind, varId, id, sel) {
    var F = this.frame(sel), arr = F[kind] && F[kind][varId];
    if (!arr) return NaN;
    return arr[this.index(kind, id)];
  };

  /** Time series (per period) of a variable for one element. */
  Case.prototype.series = function (kind, varId, id, seq, block) {
    var out = [];
    for (var s = 0; s < this.nS; s++) out.push(this.value(kind, varId, id, { stage: s, seq: seq, block: block }));
    return out;
  };
  /** P10 / P50 / P90 across scenarios for each period (null when there is a single scenario). */
  Case.prototype.band = function (kind, varId, id, block) {
    if (this.nQ < 2) return null;
    return { p10: this.series(kind, varId, id, -3, block), p50: this.series(kind, varId, id, -2, block), p90: this.series(kind, varId, id, -4, block) };
  };
  /** Series with block resolution: [{stage, block, value, hours}] */
  Case.prototype.blockSeries = function (kind, varId, id, seq) {
    var out = [];
    for (var s = 0; s < this.nS; s++) for (var b = 0; b < this.nB; b++) {
      out.push({ stage: s, block: b, hours: this.hours(s, b), value: this.value(kind, varId, id, { stage: s, seq: seq, block: b }) });
    }
    return out;
  };

  /** [min, max] of a variable across periods (locked) or only current period. */
  Case.prototype.domain = function (kind, varId, sel, lock) {
    var key = kind + ':' + varId + ':' + sel.seq + ':' + sel.block + ':' + (lock ? 'L' : sel.stage);
    this._dom = this._dom || {};
    if (this._dom[key]) return this._dom[key];
    var mn = Infinity, mx = -Infinity;
    var stages = lock ? range(this.nS) : [sel.stage];
    for (var i = 0; i < stages.length; i++) {
      var arr = this.frame({ stage: stages[i], seq: sel.seq, block: sel.block })[kind][varId];
      if (!arr) continue;
      for (var j = 0; j < arr.length; j++) { var v = arr[j]; if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }
    }
    if (mn === Infinity) { mn = 0; mx = 1; }
    return (this._dom[key] = [mn, mx]);
  };

  // ---------- topology ----------
  /** Arcs actually carrying flow in direction a->b under frame F: returns [{arc, from, to}] */
  Case.prototype._flowEdges = function (F) {
    var self = this;
    return this.arcs.map(function (a, i) {
      var d = F.arc.dir[i];
      if (!d) return null;
      return { arc: i, from: self.nodeIx[d > 0 ? a.from : a.to], to: self.nodeIx[d > 0 ? a.to : a.from] };
    });
  };
  /** Follow flow upstream (dir = -1) or downstream (dir = +1) from node(s). */
  Case.prototype.trace = function (startNodes, direction, F, startArcs) {
    var self = this, edges = this._flowEdges(F);
    var nodes = {}, arcs = {}, queue = startNodes.slice();
    startNodes.forEach(function (n) { nodes[self.nodes[n].id] = true; });
    (startArcs || []).forEach(function (a) { arcs[self.arcs[a].id] = true; });
    while (queue.length) {
      var n = queue.shift();
      self.nodeArcs[n].forEach(function (ai) {
        var e = edges[ai];
        if (!e) return;
        var next = direction > 0 ? (e.from === n ? e.to : -1) : (e.to === n ? e.from : -1);
        if (next < 0) return;
        arcs[self.arcs[ai].id] = true;
        var nid = self.nodes[next].id;
        if (!nodes[nid]) { nodes[nid] = true; queue.push(next); }
      });
    }
    return { nodes: nodes, arcs: arcs };
  };
  /** Undirected neighbourhood within `hops` (Infinity = connected component). */
  Case.prototype.neighbourhood = function (startNode, hops, stage) {
    var self = this, nodes = {}, arcs = {}, frontier = [startNode], depth = 0;
    nodes[this.nodes[startNode].id] = true;
    while (frontier.length && depth < hops) {
      var next = [];
      frontier.forEach(function (n) {
        self.nodeArcs[n].forEach(function (ai) {
          if (stage !== undefined) { var c = self.capacityAt(ai, stage); if (c.ft + c.tf <= EPS) return; }
          var a = self.arcs[ai];
          arcs[a.id] = true;
          var o = self.nodeIx[a.from] === n ? self.nodeIx[a.to] : self.nodeIx[a.from];
          var oid = self.nodes[o].id;
          if (!nodes[oid]) { nodes[oid] = true; next.push(o); }
        });
      });
      frontier = next; depth++;
    }
    return { nodes: nodes, arcs: arcs };
  };
  /** Shortest path by length (km), undirected, in-service arcs only. */
  Case.prototype.path = function (a, b, stage) {
    var self = this, n = this.nodes.length;
    var dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), prevArc = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    dist[a] = 0;
    for (var it = 0; it < n; it++) {
      var u = -1, best = Infinity;
      for (var i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === b) break;
      done[u] = 1;
      self.nodeArcs[u].forEach(function (ai) {
        var c = self.capacityAt(ai, stage);
        if (c.ft + c.tf <= EPS) return;
        var ar = self.arcs[ai], v = self.nodeIx[ar.from] === u ? self.nodeIx[ar.to] : self.nodeIx[ar.from];
        var d = dist[u] + Math.max(self.arcLength[ai], 0.1);
        if (d < dist[v]) { dist[v] = d; prev[v] = u; prevArc[v] = ai; }
      });
    }
    if (!isFinite(dist[b])) return null;
    var nodes = {}, arcs = {}, seq = [], cur = b;
    while (cur >= 0) { nodes[this.nodes[cur].id] = true; seq.unshift(this.nodes[cur].id); if (prevArc[cur] >= 0) arcs[this.arcs[prevArc[cur]].id] = true; cur = prev[cur]; }
    return { nodes: nodes, arcs: arcs, length: dist[b], sequence: seq };
  };

  // ---------- filters ----------
  /** Returns { node: Uint8Array, arc: Uint8Array, asset: Uint8Array } (1 = passes all filters). */
  Case.prototype.applyFilters = function (filters, F) {
    var self = this, bins = GV.state.get('bins');
    var P = { node: new Uint8Array(this.nodes.length).fill(1), arc: new Uint8Array(this.arcs.length).fill(1), asset: new Uint8Array(this.assets.length).fill(1) };
    filters.forEach(function (f) {
      if (f.type === 'region') {
        self.nodes.forEach(function (n, i) { if (f.values.indexOf(n.region) < 0) P.node[i] = 0; });
        self.arcs.forEach(function (a, i) {
          if (f.values.indexOf(self.node(a.from).region) < 0 && f.values.indexOf(self.node(a.to).region) < 0) P.arc[i] = 0;
        });
      } else if (f.type === 'arcKind') {
        self.arcs.forEach(function (a, i) { if (f.values.indexOf(a.kind) < 0) P.arc[i] = 0; });
      } else if (f.type === 'assetType') {
        self.assets.forEach(function (x, i) { if (f.values.indexOf(x.type) < 0) P.asset[i] = 0; });
        self.nodes.forEach(function (n, i) {
          if (!n.assets.some(function (id) { return f.values.indexOf(self.asset(id).type) >= 0; })) P.node[i] = 0;
        });
      } else if (f.type === 'range') {
        var arr = F[f.kind][f.var];
        if (!arr) return;
        for (var i = 0; i < arr.length; i++) {
          var v = arr[i];
          if (f.abs) v = Math.abs(v);
          if (isNaN(v) || (f.min !== null && f.min !== undefined && v < f.min) || (f.max !== null && f.max !== undefined && v > f.max)) P[f.kind][i] = 0;
        }
      } else if (f.type === 'utilBin') {
        var lo = f.bin > 0 ? bins[f.bin - 1].max : -Infinity, hi = bins[f.bin].max;
        for (var j = 0; j < self.arcs.length; j++) {
          var u = F.arc.util[j];
          if (isNaN(u) || !(u >= lo && u < hi) && !(hi === Infinity && u === Infinity)) P.arc[j] = 0;
        }
      } else if (f.type === 'violation') {
        self.arcs.forEach(function (a, i) { if (!(F.arc.util[i] > 1.0001)) P.arc[i] = 0; });
        self.nodes.forEach(function (n, i) { if (!(F.node.deficit[i] > 1e-3)) P.node[i] = 0; });
      } else if (f.type === 'text') {
        var q = f.q.toLowerCase();
        var m = function (el) { return (el.name + ' ' + el.id + ' ' + el.code).toLowerCase().indexOf(q) >= 0; };
        self.nodes.forEach(function (n, i) { if (!m(n) && !n.assets.some(function (id) { return m(self.asset(id)); })) P.node[i] = 0; });
        self.arcs.forEach(function (a, i) { if (!m(a)) P.arc[i] = 0; });
        self.assets.forEach(function (x, i) { if (!m(x)) P.asset[i] = 0; });
      } else if (f.type === 'subset') {
        self.nodes.forEach(function (n, i) { if (!f.nodes[n.id]) P.node[i] = 0; });
        self.arcs.forEach(function (a, i) { if (!f.arcs[a.id]) P.arc[i] = 0; });
      } else if (f.type === 'inService') {
        self.arcs.forEach(function (a, i) { if (F.arc.capFT[i] + F.arc.capTF[i] <= EPS) P.arc[i] = 0; });
      }
    });
    this.assets.forEach(function (x, i) { if (!P.node[self.nodeIx[x.node]]) P.asset[i] = 0; });
    return P;
  };

  /** Recurring bottlenecks: share of hours (in range) where utilization >= threshold. */
  Case.prototype.congestionShare = function (ai, seq, range2, threshold) {
    var s0 = range2 ? range2[0] : 0, s1 = range2 ? range2[1] : this.nS - 1, hh = 0, hc = 0;
    var qs = seq < 0 ? range(this.nQ) : [seq];
    for (var s = s0; s <= s1; s++) for (var qi = 0; qi < qs.length; qi++) for (var b = 0; b < this.nB; b++) {
      var h = this.hours(s, b), u = this.utilT(ai, this.tIx(s, qs[qi], b));
      if (isNaN(u)) continue;
      hh += h; if (u >= threshold) hc += h;
    }
    return hh ? hc / hh : NaN;
  };
})();
