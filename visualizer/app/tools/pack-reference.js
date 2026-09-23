#!/usr/bin/env node
/*
 * Converts the EPE gas-infrastructure shapefiles into a compact reference file for the app.
 *
 *   node tools/pack-reference.js "<folder with epe_shapefiles>" [data/epe-infra.js]
 *
 * The output registers reference layers (GV.registerReference) that can be shown on the map and are
 * used to route model pipelines along their real traces ("Real (EPE)" geometry mode).
 */
'use strict';
var fs = require('fs');
var path = require('path');
var S = require('../js/shapefile.js');

var src = process.argv[2];
var out = process.argv[3] || path.join(__dirname, '..', 'data', 'epe-infra.js');
if (!src) { console.error('usage: node tools/pack-reference.js <geofiles folder> [out.js]'); process.exit(1); }
var dir = fs.existsSync(path.join(src, 'epe_shapefiles')) ? path.join(src, 'epe_shapefiles') : src;

// id, file, label, geometry kind, simplification tolerance (degrees), properties to keep {newName: oldName}
var LAYERS = [
  ['transport', 'Gasodutos_Transporte', 'EPE – Transport pipelines', 'line', 0.0004, { name: 'Nome_Dut_1', category: 'Categoria', diameter_in: 'Diam_Pol_x', length_km: 'COMPRIM_KM', from: 'MUNIC_ORIG', to: 'MUNIC_DEST', operator: 'Transporta', pressure: 'P_Max_Op', source: 'Fontes' }],
  ['gathering', 'Dutos_Escoamento', 'EPE – Gathering / offshore pipelines', 'line', 0.0006, { name: 'DUTO_ID', category: 'Categoria', state: 'ESTADO', diameter_in: 'DIAM_POL', fluid: 'FLUIDO', from: 'INST_ORIG', to: 'INST_DEST', source: 'Fonte' }],
  ['distribution', 'Gasodutos_Distribuicao', 'EPE – Distribution networks', 'line', 0.006, { name: 'Distrib', state: 'UF', source: 'Fonte' }],
  ['compression', 'Estacoes_Compressao', 'EPE – Compression stations', 'point', 0, { name: 'Nome', city: 'Municipio', state: 'UF', operator: 'Transporta', category: 'Classifica', capacity_MMm3d: 'MMm3d' }],
  ['lng', 'Terminais_GNL', 'EPE – LNG terminals', 'point', 0, { name: 'Nome', city: 'Municipio', state: 'UF', owner: 'Proprietar', category: 'Classifica', capacity_MMm3d: 'MMm3d' }],
  ['processing', 'Polos_Processamento_Gas_Natural', 'EPE – Gas processing plants', 'point', 0, null],
  ['delivery', 'Pontos_Entrega_Gas_Natural', 'EPE – Delivery points', 'point', 0, null]
];

function ab(b) { return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
var layers = [];
LAYERS.forEach(function (L) {
  var shp = path.join(dir, L[1] + '.shp'), dbf = path.join(dir, L[1] + '.dbf');
  if (!fs.existsSync(shp)) { console.log('skip (missing):', L[1]); return; }
  var cpg = path.join(dir, L[1] + '.cpg');
  var enc = fs.existsSync(cpg) ? fs.readFileSync(cpg, 'latin1').trim() : 'utf-8';
  var fc = S.toGeoJSON(ab(fs.readFileSync(shp)), fs.existsSync(dbf) ? ab(fs.readFileSync(dbf)) : null, enc);
  if (L[4]) S.simplify(fc, L[4], 5); else S.simplify(fc, 0, 5);
  if (L[0] === 'distribution') {
    // distribution grids have thousands of short street segments: keep only parts longer than ~2 km
    fc.features.forEach(function (f) {
      if (f.geometry.type !== 'MultiLineString') return;
      f.geometry.coordinates = f.geometry.coordinates.filter(function (l) {
        var xs = l.map(function (c) { return c[0]; }), ys = l.map(function (c) { return c[1]; });
        return Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys)) > 0.02;
      });
    });
    fc.features = fc.features.filter(function (f) { return f.geometry.coordinates.length; });
  }
  fc.features.forEach(function (f) {
    var p = f.properties, q = {};
    if (L[5]) Object.keys(L[5]).forEach(function (k) { var v = p[L[5][k]]; if (v !== undefined && v !== null && v !== '') q[k] = v; });
    else Object.keys(p).forEach(function (k) { if (!/^(OBJECTID|Shape|created|last_)/i.test(k) && p[k] !== '' && p[k] !== null) q[k.toLowerCase()] = p[k]; });
    if (!q.name) q.name = p.Nome || p.NOME || p.name || '';
    f.properties = q;
  });
  var pts = 0;
  fc.features.forEach(function (f) { pts += JSON.stringify(f.geometry.coordinates).split('],[').length; });
  console.log(L[0], fc.features.length, 'features,', pts, 'points');
  if (!fc.features.length) return;
  layers.push({ id: L[0], label: L[2], geom: L[3], data: fc });
});

var payload = { id: 'epe', label: 'EPE gas infrastructure', source: 'EPE WebMap (gisepeprd2.epe.gov.br)', createdAt: new Date().toISOString(), layers: layers };
var json = JSON.stringify(payload);
fs.writeFileSync(out, 'GV.registerReference(' + json + ');\n');
console.log('written', out, (json.length / 1024 / 1024).toFixed(2) + ' MB');
