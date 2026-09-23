#!/usr/bin/env node
/*
 * Optional helper (needs Node.js). Converts an SDDP case folder into a shareable dataset file.
 * The app can open case folders directly, so this is only needed to pre-load cases for a team.
 *
 *   node tools/pack-case.js <sddp-case-folder> "<Case name>" [out-file]
 *
 * out-file ending in .js  -> library script for app/data (listed in data/library.js)
 * out-file ending in .json -> dataset that can be opened with "Open dataset"
 * Add --check to print the nodal balance residuals.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var parser = require('../js/parser-sddp.js');

var args = process.argv.slice(2).filter(function (a) { return a !== '--check'; });
var check = process.argv.indexOf('--check') >= 0;
if (!args[0]) { console.error('usage: node tools/pack-case.js <case-folder> "<name>" [out.js|out.json] [--check]'); process.exit(1); }

var dir = args[0];
var files = {};
fs.readdirSync(dir).forEach(function (f) {
  var lf = f.toLowerCase();
  if (!/\.(dat|csv|geojson)$/.test(lf)) return;
  var full = path.join(dir, f);
  if (!fs.statSync(full).isFile()) return;
  files[lf] = fs.readFileSync(full, 'latin1');
});
var ds = parser.parseCase(files, { name: args[1] || path.basename(path.resolve(dir)) });
if (files['geometry.geojson']) parser.applyGeometry(ds, JSON.parse(files['geometry.geojson']));

console.log('nodes', ds.nodes.length, 'arcs', ds.arcs.length, 'assets', ds.assets.length,
  'stages', ds.time.nStages, 'seq', ds.time.nSeq, 'blocks', ds.time.nBlocks);
ds.warnings.forEach(function (w) { console.log('warning:', w); });

if (check) {
  var t = ds.time, T = t.nStages * t.nSeq * t.nBlocks, worst = [];
  ds.nodes.forEach(function (n) {
    var maxRes = 0, at = 0;
    for (var i = 0; i < T; i++) {
      var bal = 0;
      ds.arcs.forEach(function (a) {
        var f = (ds.results.arc.flow[a.id] || [])[i] || 0;
        if (a.to === n.id) bal += f >= 0 ? f * (1 - a.lossFT) : 0;
        if (a.from === n.id) bal -= f >= 0 ? f : 0;
        if (a.from === n.id) bal += f < 0 ? -f * (1 - a.lossTF) : 0;
        if (a.to === n.id) bal -= f < 0 ? -f : 0;
      });
      n.assets.forEach(function (id) {
        var r = ds.results.asset;
        bal += (r.production[id] || [])[i] || 0;
        bal -= (r.met[id] || [])[i] || 0;
        bal += (r.discharge[id] || [])[i] || 0;
      });
      if (Math.abs(bal) > Math.abs(maxRes)) { maxRes = bal; at = i; }
    }
    worst.push([Math.abs(maxRes), n.name, maxRes.toFixed(3), at]);
  });
  worst.sort(function (a, b) { return b[0] - a[0]; });
  console.log('largest balance residuals (mil m3/d):');
  worst.slice(0, 12).forEach(function (w) { console.log('  ', w[1], w[2], 't=' + w[3]); });
}

var out = args[2];
if (out) {
  var json = JSON.stringify(ds);
  fs.writeFileSync(out, /\.js$/i.test(out) ? 'GV.registerCase(' + json + ');\n' : json);
  console.log('written', out, (json.length / 1024).toFixed(0) + ' KB');
}
