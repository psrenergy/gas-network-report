/*
 * SDDP gas-network case parser.
 *
 * Input : a map { lowercaseFileName: fileText } with the files of an SDDP case folder.
 * Output: a plain, JSON-serializable "gv-case" dataset (see README, "Dataset format").
 *
 * All result values are normalised at parse time:
 *   - volumes per block (kUE / UE)  -> average rate in mil m3/d  (v * factor * 24 / blockHours)
 *   - rates per hour   (kUE/h)      -> mil m3/d                  (v * factor * 24)
 *   - marginal costs   (k$/unit)    -> $/mil m3                  (v * 1000)
 *
 * Works both in the browser (window.GVParser) and in Node (module.exports), so the same code
 * is used by the app and by tools/pack-case.js.
 */
(function (root) {
  'use strict';

  var REGION_BY_SUFFIX = { se: 'SE', ne: 'NE', no: 'N', su: 'S', co: 'CO' };
  var REGION_NAMES = { SE: 'Sudeste', NE: 'Nordeste', N: 'Norte', S: 'Sul', CO: 'Centro-Oeste' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Some SDDP outputs carry a wrong unit label in their header. Known overrides (multiplier to "UE").
  var UNIT_OVERRIDES = { etranflw: 1000 };

  function unitFactor(unit) {
    var u = (unit || '').trim();
    if (/^M/.test(u)) return 1e6;
    if (/^k/.test(u)) return 1000;
    return 1;
  }

  function splitCsvLine(line) { return line.split(',').map(function (s) { return s.trim(); }); }

  // ---------- .dat (CSV-like, "$version" + "!header" lines) ----------
  function parseDat(text) {
    var rows = [], header = null;
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      if (line[0] === '$') return;
      if (line[0] === '!') { header = splitCsvLine(line.slice(1)); return; }
      rows.push(splitCsvLine(line));
    });
    return { header: header, rows: rows };
  }

  // ---------- SDDP result CSV ----------
  function parseResultCsv(text) {
    var lines = text.split(/\r?\n/);
    var h0 = splitCsvLine(lines[0]);
    var meta = {
      blockFlag: parseInt(h0[1], 10),
      unit: h0[3],
      stageType: parseInt(h0[4], 10),
      firstStage: parseInt(h0[5], 10),
      firstYear: parseInt(h0[6], 10)
    };
    var headerIdx = -1;
    for (var i = 0; i < Math.min(lines.length, 10); i++) {
      if (/^\s*Stag\s*,/i.test(lines[i])) { headerIdx = i; break; }
    }
    if (headerIdx < 0) return null;
    var names = splitCsvLine(lines[headerIdx]).slice(3);
    while (names.length && names[names.length - 1] === '') names.pop();
    var rows = [];
    for (var j = headerIdx + 1; j < lines.length; j++) {
      var l = lines[j];
      if (!l.trim()) continue;
      var c = l.split(',');
      var st = parseInt(c[0], 10), sq = parseInt(c[1], 10), bl = parseInt(c[2], 10);
      if (isNaN(st)) continue;
      var vals = new Array(names.length);
      for (var k = 0; k < names.length; k++) {
        var v = parseFloat(c[k + 3]);
        vals[k] = isNaN(v) ? 0 : v;
      }
      rows.push({ st: st, sq: sq, bl: bl, v: vals });
    }
    return { meta: meta, names: names, rows: rows };
  }

  function num(x, d) { var v = parseFloat(x); return isNaN(v) ? (d === undefined ? 0 : d) : v; }

  function parseDate(ddmmyyyy) {
    var p = (ddmmyyyy || '').split('/');
    if (p.length !== 3) return null;
    return { y: parseInt(p[2], 10), m: parseInt(p[1], 10), d: parseInt(p[0], 10) };
  }

  function normName(s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  // Build name -> [indices] lookup that tolerates duplicates (matched in order of appearance).
  function nameMatcher(list) {
    var map = {};
    list.forEach(function (el, i) {
      var k = normName(el.name);
      (map[k] = map[k] || []).push(i);
    });
    var used = {};
    return function (name) {
      var k = normName(name);
      var arr = map[k];
      if (!arr) return -1;
      var u = used[k] || 0;
      used[k] = u + 1;
      return arr[Math.min(u, arr.length - 1)];
    };
  }

  function filesMatching(files, re) {
    return Object.keys(files).filter(function (f) { return re.test(f); }).sort();
  }

  function regionFromFile(fname, prefix) {
    var m = fname.replace(/\.dat$/, '').slice(prefix.length);
    return REGION_BY_SUFFIX[m] || (m ? m.toUpperCase() : '');
  }

  /**
   * Parse an SDDP case.
   * @param {Object<string,string>} files  lowercase file name -> text
   * @param {Object} opts { name, classifyLoad(name) -> 'citygate'|'thermal' }
   */
  function parseCase(files, opts) {
    opts = opts || {};
    var warnings = [];
    var classifyLoad = opts.classifyLoad || function (name) {
      return /n[ií]vel\s*\d|inel[aá]stic|el[aá]stic/i.test(name) ? 'citygate' : 'thermal';
    };

    if (!filesMatching(files, /^celecnode.*\.dat$/).length || !files['celectransport.dat']) {
      throw new Error('This folder does not look like an SDDP gas-network case (celecnode*.dat / celectransport.dat not found).');
    }

    // ---------- processes (commodities) ----------
    var processes = {};
    if (files['celecproc.dat']) {
      parseDat(files['celecproc.dat']).rows.forEach(function (r) {
        processes[r[0]] = { code: r[0], name: r[1], unit: r[2], deficitCost: num(r[3]) };
      });
    }
    function procName(code) { return (processes[code] && processes[code].name) || ('P' + code); }

    // ---------- coordinates ----------
    var coords = {};
    filesMatching(files, /^gcnode.*\.dat$/).forEach(function (f) {
      parseDat(files[f]).rows.forEach(function (r) {
        var lat = parseFloat(r[1]), lon = parseFloat(r[2]);
        if (!coords[r[0]] && !isNaN(lat) && !isNaN(lon)) coords[r[0]] = [lat, lon];
      });
    });

    // ---------- nodes ----------
    var nodes = [], nodeByCode = {};
    filesMatching(files, /^celecnode.*\.dat$/).forEach(function (f) {
      var region = regionFromFile(f, 'celecnode');
      parseDat(files[f]).rows.forEach(function (r) {
        var code = r[0];
        if (nodeByCode[code]) return;
        var c = coords[code];
        if (!c) warnings.push('Node ' + code + ' (' + r[1] + ') has no coordinates.');
        var n = {
          id: 'N' + code, code: +code, name: r[1], region: region,
          process: procName(r[2]),
          lat: c ? c[0] : null, lon: c ? c[1] : null,
          assets: [], attrs: { Process: procName(r[2]), Region: REGION_NAMES[region] || region }
        };
        nodeByCode[code] = n;
        nodes.push(n);
      });
    });

    // ---------- time ----------
    var anyResult = null;
    ['etranflw.csv', 'endcmg.csv', 'duraci.csv'].some(function (f) {
      if (files[f]) { anyResult = parseResultCsv(files[f]); return true; }
      return false;
    });
    var dur = files['duraci.csv'] ? parseResultCsv(files['duraci.csv']) : null;
    var tmeta = anyResult ? anyResult.meta : { stageType: 2, firstStage: 1, firstYear: 2000 };
    var nStages = 0, nSeq = 1, nBlocks = 1;
    [anyResult, dur].forEach(function (r) {
      if (!r) return;
      r.rows.forEach(function (x) {
        nStages = Math.max(nStages, x.st); nBlocks = Math.max(nBlocks, x.bl);
      });
    });
    if (anyResult) anyResult.rows.forEach(function (x) { nSeq = Math.max(nSeq, x.sq); });
    // scan all main results for max sequence
    ['endcmg.csv', 'epdger.csv', 'edemmet.csv'].forEach(function (f) {
      if (!files[f]) return;
      var r = parseResultCsv(files[f]);
      r.rows.forEach(function (x) { nSeq = Math.max(nSeq, x.sq); nStages = Math.max(nStages, x.st); });
    });
    if (!nStages) { nStages = 1; warnings.push('No results found: showing network inputs only.'); }

    var hours = new Array(nStages * nBlocks).fill(0);
    if (dur) {
      dur.rows.forEach(function (x) {
        if (x.st <= nStages && x.bl <= nBlocks) hours[(x.st - 1) * nBlocks + (x.bl - 1)] = x.v[0];
      });
    }
    for (var hi = 0; hi < hours.length; hi++) if (!hours[hi]) hours[hi] = (tmeta.stageType === 1 ? 168 : 730) / nBlocks;

    var periods = [];
    for (var s = 0; s < nStages; s++) {
      if (tmeta.stageType === 2) {
        var mIdx = (tmeta.firstStage - 1 + s);
        var y = tmeta.firstYear + Math.floor(mIdx / 12), m = mIdx % 12;
        periods.push({ index: s, year: y, month: m + 1, label: MONTHS[m] + ' ' + y, short: MONTHS[m], key: y + '-' + String(m + 1).padStart(2, '0') });
      } else {
        var wIdx = (tmeta.firstStage - 1 + s);
        var yy = tmeta.firstYear + Math.floor(wIdx / 52), w = wIdx % 52 + 1;
        periods.push({ index: s, year: yy, week: w, label: 'W' + w + ' ' + yy, short: 'W' + w, key: yy + '-W' + w });
      }
    }
    function stageStart(s) {
      var p = periods[s];
      if (p.month) return { y: p.year, m: p.month, d: 1 };
      var dayOfYear = (p.week - 1) * 7 + 1;
      var dt = new Date(Date.UTC(p.year, 0, dayOfYear));
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
    }
    function dateLE(a, b) { return a.y < b.y || (a.y === b.y && (a.m < b.m || (a.m === b.m && a.d <= b.d))); }

    // Apply dated modifications: returns per-stage values of a field.
    function perStage(baseValue, mods, field) {
      var out = new Array(nStages);
      for (var s2 = 0; s2 < nStages; s2++) {
        var v = baseValue, st = stageStart(s2);
        mods.forEach(function (md) { if (dateLE(md.date, st) && md[field] !== undefined) v = md[field]; });
        out[s2] = v;
      }
      return out;
    }

    // ---------- arcs: transport ----------
    var arcs = [], arcByCode = {};
    var tmods = {};
    if (files['melectransport.dat']) {
      parseDat(files['melectransport.dat']).rows.forEach(function (r) {
        var d = parseDate(r[0]); if (!d) return;
        var md = { date: d, existing: parseInt(r[4], 10) };
        if (r[7] !== undefined && r[7] !== '') md.capFT = num(r[7]);
        if (r[8] !== undefined && r[8] !== '') md.capTF = num(r[8]);
        if (r[9] !== undefined && r[9] !== '') md.costFT = num(r[9]);
        (tmods[r[1]] = tmods[r[1]] || []).push(md);
      });
    }
    parseDat(files['celectransport.dat']).rows.forEach(function (r) {
      var code = r[0];
      var from = nodeByCode[r[4]], to = nodeByCode[r[5]];
      if (!from || !to) { warnings.push('Transport ' + code + ' (' + r[1] + ') references unknown nodes.'); return; }
      var existing = parseInt(r[3], 10);           // SDDP: 0 = existing, 1 = future
      var mods = tmods[code] || [];
      var baseFT = existing === 0 ? num(r[6]) : 0, baseTF = existing === 0 ? num(r[7]) : 0;
      // A modification with Existing=0 activates the element; Existing=1 deactivates it.
      var capFT = new Array(nStages), capTF = new Array(nStages);
      for (var s3 = 0; s3 < nStages; s3++) {
        var st = stageStart(s3), ft = baseFT, tf = baseTF, ex = existing;
        mods.forEach(function (md) {
          if (!dateLE(md.date, st)) return;
          ex = md.existing;
          if (md.capFT !== undefined) ft = md.capFT;
          if (md.capTF !== undefined) tf = md.capTF;
        });
        if (ex !== 0) { ft = 0; tf = 0; }
        capFT[s3] = ft; capTF[s3] = tf;
      }
      var proc = procName(r[2]);
      var a = {
        id: 'P' + code, code: +code, name: r[1],
        kind: proc === 'GNL' || /mar[ií]tim/i.test(r[1]) ? 'maritime' : 'pipeline',
        process: proc, from: from.id, to: to.id,
        bidirectional: num(r[7]) > 0 || mods.some(function (m) { return m.capTF > 0; }),
        capFT: capFT, capTF: capTF,
        costFT: num(r[8]), costTF: num(r[9]), lossFT: num(r[10]), lossTF: num(r[11]), eff: 1,
        existing: existing === 0, geometry: null,
        attrs: {
          'Cost from→to': num(r[8]) + ' $/mil m³', 'Cost to→from': num(r[9]) + ' $/mil m³',
          'Loss from→to': num(r[10]) + ' p.u.', 'Loss to→from': num(r[11]) + ' p.u.',
          'Initial status': existing === 0 ? 'Existing' : 'Future',
          'Modifications': mods.length
        }
      };
      arcByCode[code] = a;
      arcs.push(a);
    });

    // ---------- arcs: fixed converters (regasification) ----------
    var convByName = {};
    if (files['fixedconv.dat'] && files['comfixconv.dat']) {
      var cmods = {};
      if (files['mfixedconv.dat']) {
        parseDat(files['mfixedconv.dat']).rows.forEach(function (r) {
          var d = parseDate(r[0]); if (!d) return;
          (cmods[r[1]] = cmods[r[1]] || []).push({ date: d, existing: parseInt(r[3], 10) });
        });
      }
      var comps = {};
      parseDat(files['comfixconv.dat']).rows.forEach(function (r) {
        (comps[r[0]] = comps[r[0]] || []).push({ node: r[1], type: parseInt(r[3], 10), qty: num(r[4], 1), hasCap: r[5] === '1', cap: num(r[6]) });
      });
      parseDat(files['fixedconv.dat']).rows.forEach(function (r) {
        var code = r[0], cs = comps[code] || [];
        var inp = cs.filter(function (c) { return c.type === 1; })[0];
        var out = cs.filter(function (c) { return c.type === 0; })[0];
        if (!inp || !out || !nodeByCode[inp.node] || !nodeByCode[out.node]) {
          warnings.push('Converter ' + code + ' (' + r[1] + ') has incomplete composition.');
          return;
        }
        var existing = parseInt(r[2], 10);
        var exStage = perStage(existing, cmods[code] || [], 'existing');
        var cf = num(r[3], 1);
        var capArr = exStage.map(function (ex) { return ex === 0 ? inp.cap * cf : 0; });
        var a = {
          id: 'C' + code, code: +code, name: r[1], kind: 'regas', process: 'GNL→GN',
          from: nodeByCode[inp.node].id, to: nodeByCode[out.node].id, bidirectional: false,
          capFT: capArr, capTF: capArr.map(function () { return 0; }),
          costFT: 0, costTF: 0, lossFT: 1 - out.qty / (inp.qty || 1), lossTF: 0, eff: out.qty / (inp.qty || 1),
          existing: existing === 0, geometry: null,
          attrs: { 'Input capacity': inp.cap + ' mil m³/d', 'Efficiency': out.qty, 'Capacity factor': cf, 'Initial status': existing === 0 ? 'Existing' : 'Future' }
        };
        convByName[normName(r[1])] = a;
        arcs.push(a);
      });
    }

    // ---------- assets ----------
    var assets = [];
    function addAsset(a) {
      var n = nodeByCode[a.nodeCode];
      if (!n) { warnings.push(a.type + ' "' + a.name + '" references unknown node ' + a.nodeCode + '.'); return null; }
      a.node = n.id; delete a.nodeCode;
      n.assets.push(a.id);
      assets.push(a);
      return a;
    }
    // producers
    var gmods = {};
    filesMatching(files, /^melecgen.*\.dat$/).forEach(function (f) {
      parseDat(files[f]).rows.forEach(function (r) {
        var d = parseDate(r[0]); if (!d) return;
        (gmods[r[1]] = gmods[r[1]] || []).push({ date: d, existing: parseInt(r[5], 10), maxProd: num(r[7]), cost: num(r[8]) });
      });
    });
    filesMatching(files, /^celecgen.*\.dat$/).forEach(function (f) {
      parseDat(files[f]).rows.forEach(function (r) {
        var proc = procName(r[2]);
        var mods = gmods[r[0]] || [];
        var ex = parseInt(r[4], 10);
        var maxP = new Array(nStages);
        for (var s4 = 0; s4 < nStages; s4++) {
          var st = stageStart(s4), e = ex, mp = num(r[6]);
          mods.forEach(function (md) { if (dateLE(md.date, st)) { e = md.existing; mp = md.maxProd; } });
          maxP[s4] = e === 0 ? mp : 0;
        }
        addAsset({
          id: 'G' + r[0], code: +r[0], name: r[1], nodeCode: r[3],
          type: proc === 'GNL' ? 'lng_supply' : 'producer', process: proc,
          maxProd: maxP,
          attrs: { 'Min production': num(r[5]) + ' mil m³/d', 'Max production': num(r[6]) + ' mil m³/d', 'Production cost': num(r[7]) + ' $/mil m³', 'Initial status': ex === 0 ? 'Existing' : 'Future', 'Modifications': mods.length }
        });
      });
    });
    // loads (city-gates / thermal plants)
    filesMatching(files, /^celecload.*\.dat$/).forEach(function (f) {
      parseDat(files[f]).rows.forEach(function (r) {
        addAsset({
          id: 'D' + r[0], code: +r[0], name: r[1], nodeCode: r[3],
          type: classifyLoad(r[1]), process: procName(r[2]),
          attrs: { Segment: r[4], Elastic: r[5] === '1' ? 'Yes' : 'No', 'Source type': r[6] }
        });
      });
    });
    // storage
    filesMatching(files, /^celecstorage.*\.dat$/).forEach(function (f) {
      parseDat(files[f]).rows.forEach(function (r) {
        addAsset({
          id: 'S' + r[0], code: +r[0], name: r[1], nodeCode: r[3], type: 'storage', process: procName(r[2]), maxStorage: num(r[6]),
          attrs: { 'Min storage': num(r[5]) + ' mil m³', 'Max storage': num(r[6]) + ' mil m³', 'Initial storage': num(r[7]) + ' p.u.', 'Capacity': num(r[8]) + ' mil m³/d', 'Charge eff.': num(r[9]), 'Discharge eff.': num(r[10]) }
        });
      });
    });

    // ---------- results ----------
    var T = nStages * nSeq * nBlocks;
    function tIndex(st, sq, bl) { return ((st - 1) * nSeq + (sq - 1)) * nBlocks + (bl - 1); }
    function blockHours(st, bl) { return hours[(st - 1) * nBlocks + (bl - 1)]; }

    /**
     * Read a result file into { elementId: Float64Array(T) }.
     * mode: 'volume' (per-block volume -> rate), 'rateh' (per hour -> per day), 'price' (k$/unit -> $/unit), 'raw'
     */
    function readResult(fname, list, mode, matchName) {
      var txt = files[fname];
      if (!txt) return null;
      var r = parseResultCsv(txt);
      if (!r) return null;
      var base = fname.replace(/\.csv$/, '');
      var f = UNIT_OVERRIDES[base] !== undefined ? UNIT_OVERRIDES[base] : unitFactor(r.meta.unit);
      var match = matchName || nameMatcher(list);
      var colEl = r.names.map(function (n) { return match(n); });
      var out = {};
      colEl.forEach(function (ei, c) {
        if (ei < 0) { if (r.names[c]) warnings.push(fname + ': column "' + r.names[c] + '" not matched to any element.'); return; }
        out[list[ei].id] = new Float64Array(T);
      });
      var perStageOnly = r.rows.every(function (x) { return x.bl === 1; }) && nBlocks > 1;
      r.rows.forEach(function (x) {
        if (x.st > nStages || x.sq > nSeq) return;
        var blocks = perStageOnly ? range(nBlocks) : [x.bl];
        blocks.forEach(function (bl) {
          var t = tIndex(x.st, x.sq, bl);
          var h = blockHours(x.st, bl);
          colEl.forEach(function (ei, c) {
            if (ei < 0) return;
            var v = x.v[c];
            if (mode === 'volume') v = v * f * 24 / h;
            else if (mode === 'rateh') v = v * f * 24;
            else if (mode === 'price') v = v * 1000;
            else if (mode === 'level') v = v * f;
            out[list[ei].id][t] = v;
          });
        });
      });
      return out;
    }
    function range(n) { var a = []; for (var i = 1; i <= n; i++) a.push(i); return a; }

    var transportArcs = arcs.filter(function (a) { return a.kind !== 'regas'; });
    var regasArcs = arcs.filter(function (a) { return a.kind === 'regas'; });
    var producers = assets.filter(function (a) { return a.type === 'producer' || a.type === 'lng_supply'; });
    var loads = assets.filter(function (a) { return a.type === 'citygate' || a.type === 'thermal'; });
    var storages = assets.filter(function (a) { return a.type === 'storage'; });

    var results = { arc: {}, node: {}, asset: {} };
    results.arc.flow = readResult('etranflw.csv', transportArcs, 'volume') || {};
    results.arc.cost = readResult('etrancos.csv', transportArcs, 'raw') || {};
    // regasification flows: fxcnod has columns "Converter:Node", input side positive = consumption
    if (files['fxcnod.csv'] && regasArcs.length) {
      var fx = parseResultCsv(files['fxcnod.csv']);
      var fxf = unitFactor(fx.meta.unit);
      var nodeNameById = {}; nodes.forEach(function (n) { nodeNameById[n.id] = normName(n.name); });
      fx.names.forEach(function (colName, c) {
        var parts = colName.split(':');
        var conv = convByName[normName(parts[0])];
        if (!conv) return;
        var isInput = normName(parts.slice(1).join(':')) === nodeNameById[conv.from];
        if (!isInput) return;
        var arr = new Float64Array(T);
        fx.rows.forEach(function (x) {
          if (x.st > nStages || x.sq > nSeq) return;
          arr[tIndex(x.st, x.sq, x.bl)] = x.v[c] * fxf * 24 / blockHours(x.st, x.bl);
        });
        results.arc.flow[conv.id] = arr;
      });
    }
    var cconv = readResult('fxccos.csv', regasArcs, 'raw');
    if (cconv) Object.keys(cconv).forEach(function (k) { results.arc.cost[k] = cconv[k]; });

    results.node.cmg = readResult('endcmg.csv', nodes, 'price') || {};
    results.asset.production = readResult('epdger.csv', producers, 'volume') || {};
    results.asset.prodCost = readResult('epdcos.csv', producers, 'raw') || {};
    results.asset.met = readResult('edemmet.csv', loads, 'volume') || {};
    results.asset.deficit = readResult('edemdef.csv', loads, 'volume') || {};
    results.asset.discharge = readResult('estinj.csv', storages, 'rateh') || {};
    results.asset.level = readResult('estbal.csv', storages, 'level') || {};

    // storage level is reported per stage; charge/discharge sign: positive = gas delivered to the node.

    // ---------- display positions: spread co-located nodes ----------
    var byPos = {};
    nodes.forEach(function (n) {
      if (n.lat === null) return;
      var k = n.lat.toFixed(3) + ',' + n.lon.toFixed(3);
      (byPos[k] = byPos[k] || []).push(n);
    });
    Object.keys(byPos).forEach(function (k) {
      var g = byPos[k];
      g.forEach(function (n, i) {
        n.dlat = n.lat; n.dlon = n.lon;
        if (i > 0) {
          var ang = (i - 1) * 2.1 + 0.8;
          n.dlat = n.lat + 0.09 * Math.sin(ang);
          n.dlon = n.lon + 0.09 * Math.cos(ang);
          n.attrs['Display'] = 'Offset from co-located node ' + g[0].name;
        }
      });
    });
    nodes.forEach(function (n) { if (n.lat === null) { n.dlat = null; n.dlon = null; } });

    // serialise typed arrays to plain arrays
    function plain(obj) {
      Object.keys(obj).forEach(function (v) {
        Object.keys(obj[v]).forEach(function (id) {
          obj[v][id] = Array.prototype.map.call(obj[v][id], function (x) { return Math.round(x * 1e4) / 1e4; });
        });
      });
    }
    plain(results.arc); plain(results.node); plain(results.asset);

    var regionsUsed = {};
    nodes.forEach(function (n) { regionsUsed[n.region] = true; });

    return {
      format: 'gv-case', version: 1,
      name: opts.name || 'SDDP case',
      source: 'SDDP',
      createdAt: new Date().toISOString(),
      time: {
        stageType: tmeta.stageType, firstYear: tmeta.firstYear, firstStage: tmeta.firstStage,
        nStages: nStages, nSeq: nSeq, nBlocks: nBlocks, periods: periods, hours: hours
      },
      regions: Object.keys(regionsUsed).map(function (k) { return { id: k, name: REGION_NAMES[k] || k }; }),
      nodes: nodes, arcs: arcs, assets: assets,
      results: results,
      warnings: warnings
    };
  }

  /** Attach optional pipeline geometry from a GeoJSON FeatureCollection (matched by id, code or name). */
  function applyGeometry(ds, geojson) {
    var byKey = {};
    ds.arcs.forEach(function (a) {
      byKey[a.id.toLowerCase()] = a; byKey[String(a.code)] = byKey[String(a.code)] || a; byKey[normName(a.name)] = a;
    });
    var n = 0;
    (geojson.features || []).forEach(function (f) {
      var p = f.properties || {};
      var key = [p.id, p.ID, p.code, p.Code, p.name, p.Name].filter(function (x) { return x !== undefined && x !== null; });
      var a = null;
      key.some(function (k) { a = byKey[String(k).toLowerCase()] || byKey[normName(String(k))]; return !!a; });
      if (!a || !f.geometry) return;
      var g = f.geometry;
      var coords = g.type === 'LineString' ? g.coordinates : g.type === 'MultiLineString' ? [].concat.apply([], g.coordinates) : null;
      if (!coords || coords.length < 2) return;
      a.geometry = coords.map(function (c) { return [c[0], c[1]]; });
      n++;
    });
    return n;
  }

  var api = { parseCase: parseCase, applyGeometry: applyGeometry, parseResultCsv: parseResultCsv, parseDat: parseDat };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GVParser = api;
})(typeof window !== 'undefined' ? window : this);
