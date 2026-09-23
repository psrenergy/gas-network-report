/*
 * Routes model arcs along a reference pipeline network (e.g. EPE transport pipelines).
 *
 * The reference lines are turned into a graph (vertices snapped at ~100 m, small gaps between
 * segments bridged). For each arc, a shortest path is searched between the reference vertices
 * nearest to its two nodes. The route is accepted only when it is plausible compared with the
 * straight-line distance; otherwise the arc keeps its straight / curved geometry.
 */
(function (root) {
  'use strict';

  function hav(a, b) {
    var R = 6371, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function Heap() { this.a = []; }
  Heap.prototype.push = function (k, v) {
    var a = this.a; a.push([k, v]); var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };

  /** Build a routable graph from GeoJSON line features. */
  function buildGraph(features, opts) {
    opts = opts || {};
    var snap = opts.snap || 0.001, bridgeKm = opts.bridgeKm || 6;
    var key = {}, pts = [], adj = [], lineOf = [];
    var lineNo = 0;
    function vid(c) {
      var k = Math.round(c[0] / snap) + ',' + Math.round(c[1] / snap);
      if (key[k] === undefined) { key[k] = pts.length; pts.push([c[0], c[1]]); adj.push([]); lineOf.push(lineNo); }
      return key[k];
    }
    function edge(a, b) {
      if (a === b) return;
      var d = hav(pts[a], pts[b]);
      adj[a].push(b, d); adj[b].push(a, d);
    }
    var ends = [];
    features.forEach(function (f) {
      var g = f.geometry; if (!g) return;
      var lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      lines.forEach(function (l) {
        var prev = -1, first = -1;
        l.forEach(function (c) { var v = vid(c); if (first < 0) first = v; if (prev >= 0) edge(prev, v); prev = v; });
        if (first >= 0) ends.push([first, lineNo], [prev, lineNo]);
        lineNo++;
      });
    });
    // spatial grid
    var cell = 0.1, grid = {};
    pts.forEach(function (p, i) { var k = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell); (grid[k] = grid[k] || []).push(i); });
    function near(p, km) {
      var r = Math.ceil(km / 111 / cell) + 1, cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), out = [];
      for (var x = cx - r; x <= cx + r; x++) for (var y = cy - r; y <= cy + r; y++) {
        (grid[x + ',' + y] || []).forEach(function (i) { var d = hav(p, pts[i]); if (d <= km) out.push([i, d]); });
      }
      return out.sort(function (a, b) { return a[1] - b[1]; });
    }
    // Bridge gaps: every line end is joined to the nearest vertex of each other line within bridgeKm
    // (segments of the same pipeline often touch without sharing a vertex).
    ends.forEach(function (e) {
      var done = {};
      done[e[1]] = true;
      near(pts[e[0]], bridgeKm).forEach(function (c) {
        var ln = lineOf[c[0]];
        if (done[ln]) return;
        done[ln] = true;
        edge(e[0], c[0]);
      });
    });
    return { pts: pts, adj: adj, near: near };
  }

  /**
   * Route from point a to point b ([lon, lat]). Returns { coords, networkKm, accessKm, directKm } or null.
   */
  function route(G, a, b, opts) {
    opts = opts || {};
    var radius = opts.radiusKm || 60, accessPenalty = opts.accessPenalty || 3;
    var direct = hav(a, b);
    var ca = G.near(a, radius).slice(0, 12), cb = G.near(b, radius).slice(0, 12);
    if (!ca.length || !cb.length) return null;
    var target = {};
    cb.forEach(function (c) { target[c[0]] = c[1]; });
    var n = G.pts.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    var h = new Heap();
    ca.forEach(function (c) { var d = c[1] * accessPenalty; if (d < dist[c[0]]) { dist[c[0]] = d; h.push(d, c[0]); } });
    var best = Infinity, bestV = -1, limit = (direct * 2.2 + 80) + radius * accessPenalty * 2;
    while (h.a.length) {
      var top = h.pop(), d = top[0], u = top[1];
      if (d > dist[u]) continue;
      if (d >= best || d > limit) break;
      if (target[u] !== undefined) { var tot = d + target[u] * accessPenalty; if (tot < best) { best = tot; bestV = u; } }
      var ad = G.adj[u];
      for (var i = 0; i < ad.length; i += 2) {
        var w = ad[i], nd = d + ad[i + 1];
        if (nd < dist[w]) { dist[w] = nd; prev[w] = u; h.push(nd, w); }
      }
    }
    if (bestV < 0) return null;
    var path = [], v = bestV;
    while (v >= 0) { path.push(G.pts[v]); v = prev[v]; }
    path.reverse();
    var net = 0; for (var k = 1; k < path.length; k++) net += hav(path[k - 1], path[k]);
    var access = hav(a, path[0]) + hav(path[path.length - 1], b);
    // plausibility: not much longer than the direct distance, and mostly on the network
    if (opts.debug) return { coords: [a].concat(path, [b]), networkKm: net, accessKm: access, directKm: direct };
    if (net + access > direct * 1.9 + 40) return null;
    if (access > Math.max(40, 0.6 * (net + access))) return null;
    return { coords: [a].concat(path, [b]), networkKm: net, accessKm: access, directKm: direct };
  }

  var api = { buildGraph: buildGraph, route: route, haversine: hav };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GVRouting = api;
})(typeof window !== 'undefined' ? window : this);
