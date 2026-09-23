/*
 * Minimal ESRI shapefile reader (.shp + .dbf) → GeoJSON FeatureCollection, plus Douglas–Peucker
 * simplification. No dependencies; used by the browser (loading geofiles) and tools/pack-reference.js.
 * Coordinates are expected in geographic WGS84 (EPSG:4326), as in the EPE geofiles.
 */
(function (root) {
  'use strict';

  function readShp(buf) {
    var dv = new DataView(buf), feats = [], off = 100, len = buf.byteLength;
    while (off + 8 <= len) {
      var contentLen = dv.getInt32(off + 4, false) * 2;
      var p = off + 8, type = dv.getInt32(p, true);
      var geom = null;
      if (type === 1 || type === 11 || type === 21) {
        geom = { type: 'Point', coordinates: [dv.getFloat64(p + 4, true), dv.getFloat64(p + 12, true)] };
      } else if (type === 8 || type === 18 || type === 28) {
        var np = dv.getInt32(p + 36, true), pts = [];
        for (var i = 0; i < np; i++) pts.push([dv.getFloat64(p + 40 + i * 16, true), dv.getFloat64(p + 48 + i * 16, true)]);
        geom = { type: 'MultiPoint', coordinates: pts };
      } else if ([3, 13, 23, 5, 15, 25].indexOf(type) >= 0) {
        var nParts = dv.getInt32(p + 36, true), nPts = dv.getInt32(p + 40, true);
        var parts = [];
        for (var k = 0; k < nParts; k++) parts.push(dv.getInt32(p + 44 + k * 4, true));
        var base = p + 44 + nParts * 4, lines = [];
        for (var j = 0; j < nParts; j++) {
          var s = parts[j], e = j + 1 < nParts ? parts[j + 1] : nPts, line = [];
          for (var q = s; q < e; q++) line.push([dv.getFloat64(base + q * 16, true), dv.getFloat64(base + q * 16 + 8, true)]);
          lines.push(line);
        }
        var poly = type === 5 || type === 15 || type === 25;
        geom = poly ? { type: 'Polygon', coordinates: lines } : lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines };
      }
      feats.push(geom);
      off += 8 + contentLen;
    }
    return feats;
  }

  function readDbf(buf, encoding) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf);
    var nRec = dv.getUint32(4, true), hdrLen = dv.getUint16(8, true), recLen = dv.getUint16(10, true);
    var dec = typeof TextDecoder !== 'undefined' ? new TextDecoder(encoding || 'utf-8') : null;
    function str(a, b) {
      var bytes = u8.subarray(a, b);
      return dec ? dec.decode(bytes) : Buffer.from(bytes).toString(/utf/i.test(encoding || 'utf-8') ? 'utf8' : 'latin1');
    }
    var fields = [], p = 32;
    while (u8[p] !== 0x0d && p < hdrLen) {
      var name = str(p, p + 11).replace(/\0.*$/, '').trim();
      fields.push({ name: name, type: String.fromCharCode(u8[p + 11]), len: u8[p + 16] });
      p += 32;
    }
    var rows = [];
    for (var r = 0; r < nRec; r++) {
      var o = hdrLen + r * recLen, rec = {};
      if (u8[o] === 0x2a) { rows.push(null); continue; }   // deleted
      var q = o + 1;
      fields.forEach(function (f) {
        var raw = str(q, q + f.len).trim();
        q += f.len;
        if (f.type === 'N' || f.type === 'F') { var v = parseFloat(raw); rec[f.name] = isNaN(v) ? null : v; }
        else rec[f.name] = raw;
      });
      rows.push(rec);
    }
    return rows;
  }

  /** shp, dbf: ArrayBuffer; returns FeatureCollection */
  function toGeoJSON(shp, dbf, encoding) {
    var geoms = readShp(shp), props = dbf ? readDbf(dbf, encoding) : [];
    var features = [];
    geoms.forEach(function (g, i) {
      if (!g) return;
      if (props[i] === null) return;
      features.push({ type: 'Feature', properties: props[i] || {}, geometry: g });
    });
    return { type: 'FeatureCollection', features: features };
  }

  // ---------- Douglas–Peucker ----------
  function simplifyLine(pts, tol) {
    if (pts.length <= 2) return pts;
    var keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    var stack = [[0, pts.length - 1]], t2 = tol * tol;
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], b = seg[1], mx = -1, idx = -1;
      var ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L = dx * dx + dy * dy;
      for (var i = a + 1; i < b; i++) {
        var px = pts[i][0] - ax, py = pts[i][1] - ay, d;
        if (!L) d = px * px + py * py;
        else { var t = Math.max(0, Math.min(1, (px * dx + py * dy) / L)); var ex = px - t * dx, ey = py - t * dy; d = ex * ex + ey * ey; }
        if (d > mx) { mx = d; idx = i; }
      }
      if (mx > t2) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return pts.filter(function (_, i) { return keep[i]; });
  }
  function round(c, dp) { var f = Math.pow(10, dp); return [Math.round(c[0] * f) / f, Math.round(c[1] * f) / f]; }
  /** Simplify a FeatureCollection in place (tolerance in degrees) and round coordinates. */
  function simplify(fc, tol, dp) {
    dp = dp === undefined ? 5 : dp;
    fc.features.forEach(function (f) {
      var g = f.geometry;
      if (g.type === 'LineString') g.coordinates = simplifyLine(g.coordinates, tol).map(function (c) { return round(c, dp); });
      else if (g.type === 'MultiLineString' || g.type === 'Polygon') g.coordinates = g.coordinates.map(function (l) { return simplifyLine(l, tol).map(function (c) { return round(c, dp); }); });
      else if (g.type === 'Point') g.coordinates = round(g.coordinates, dp);
    });
    return fc;
  }

  var api = { toGeoJSON: toGeoJSON, readShp: readShp, readDbf: readDbf, simplify: simplify, simplifyLine: simplifyLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GVShapefile = api;
})(typeof window !== 'undefined' ? window : this);
