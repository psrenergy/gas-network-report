/*
 * Loading cases: SDDP folders (picker or drag & drop), datasets (.json), pipeline geometry (.geojson),
 * team-library scripts (data/*.case.js), and exporting the current case for colleagues.
 * Everything is read locally by the browser; nothing is uploaded.
 */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app;
  var L = GV.loader = {};
  var WANT = /\.(dat|csv|geojson)$/i;

  // ---------- reading ----------
  function readText(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.readAsText(file, /\.geojson$|\.json$/i.test(file.name) ? 'utf-8' : 'windows-1252');
    });
  }
  function dirOf(path) { var i = path.lastIndexOf('/'); return i < 0 ? '' : path.slice(0, i); }
  function baseName(path) { var p = path.split('/').filter(Boolean); return p[p.length - 1] || 'SDDP case'; }

  /** entries: [{ path, file }] — groups by directory and loads every directory that is an SDDP case. */
  L.loadEntries = function (entries) {
    var byDir = {}, loose = [], shp = entries.filter(function (e) { return /\.(shp|dbf|cpg)$/i.test(e.file.name); });
    entries = entries.filter(function (e) { return shp.indexOf(e) < 0; });
    var shpDone = shp.some(function (e) { return /\.shp$/i.test(e.file.name); }) ? L.loadShapefiles(shp) : Promise.resolve();
    if (!entries.length) return shpDone;
    entries.forEach(function (e) {
      if (/\.(json|js)$/i.test(e.file.name) || (/\.geojson$/i.test(e.file.name) && !entries.some(function (x) { return dirOf(x.path) === dirOf(e.path) && /celectransport\.dat$/i.test(x.file.name); }))) { loose.push(e.file); return; }
      if (!WANT.test(e.file.name)) return;
      var d = dirOf(e.path);
      (byDir[d] = byDir[d] || []).push(e);
    });
    var dirs = Object.keys(byDir).filter(function (d) { return byDir[d].some(function (e) { return /^celectransport\.dat$/i.test(e.file.name); }); });
    if (!dirs.length && !loose.length) { if (!shp.length) U.toast('No SDDP gas case found (celectransport.dat is missing)', 'warn'); return shpDone; }
    var chain = Promise.resolve(), firstId = null;
    dirs.forEach(function (d) {
      chain = chain.then(function () { return loadFolder(d, byDir[d]); }).then(function (c) { if (c && !firstId) firstId = c.id; });
    });
    return chain.then(function () {
      if (firstId) A.activate(firstId);
      return loose.reduce(function (p, f) { return p.then(function () { return L.loadFile(f); }); }, Promise.resolve());
    });
  };

  function loadFolder(dir, list) {
    U.toast('Reading ' + list.length + ' files from “' + baseName(dir) + '”…');
    var files = {};
    return Promise.all(list.map(function (e) { return readText(e.file).then(function (t) { files[e.file.name.toLowerCase()] = t; }); })).then(function () {
      var name = uniqueName(baseName(dir));
      var ds = GVParser.parseCase(files, { name: name, classifyLoad: GV.config.classifyLoad });
      var geo = Object.keys(files).filter(function (f) { return /\.geojson$/.test(f); });
      geo.forEach(function (f) { try { GVParser.applyGeometry(ds, JSON.parse(files[f])); } catch (err) { ds.warnings.push('Could not read ' + f + ': ' + err.message); } });
      var c = GV.registerCase(ds, { activate: false });
      U.toast('Loaded “' + name + '”: ' + ds.nodes.length + ' nodes, ' + ds.arcs.length + ' arcs, ' + ds.assets.length + ' assets, ' + ds.time.nStages + ' periods');
      return c;
    }).catch(function (err) { console.error(err); U.toast('Could not load “' + baseName(dir) + '”: ' + err.message, 'warn'); });
  }
  function uniqueName(n) {
    var base = n, k = 2;
    while (A.cases.some(function (c) { return c.name === n; })) n = base + ' (' + k++ + ')';
    return n;
  }

  /** A single file: dataset (.json), library script (.case.js) or geometry (.geojson). */
  L.loadFile = function (file) {
    return readText(file).then(function (txt) {
      var obj;
      if (/\.js$/i.test(file.name) && /GV\.registerView\(/.test(txt)) {
        var mv = txt.match(/GV\.registerView\(([\s\S]*)\);?\s*$/);
        obj = JSON.parse(mv[1]);
      } else if (/\.js$/i.test(file.name)) {
        var m = txt.match(/GV\.registerCase\(([\s\S]*)\);?\s*$/);
        obj = m ? JSON.parse(m[1].replace(/,\s*\{[^{}]*\}\s*\)?$/, '')) : null;
      } else obj = JSON.parse(txt);
      if (!obj) throw new Error('unrecognised file');
      if (obj.format === 'gv-view') {
        GV.views.saveMine(obj); GV.views.apply(obj);
        U.toast('View “' + obj.name + '” added to My views');
      } else if (obj.format === 'gv-case') {
        obj.name = uniqueName(obj.name || file.name.replace(/\.[^.]+$/, ''));
        var c = GV.registerCase(obj, { activate: true });
        U.toast('Loaded dataset “' + c.name + '”');
      } else if (obj.type === 'FeatureCollection') {
        var cur = A.current();
        if (!cur) { U.toast('Open a case first, then load its pipeline geometry', 'warn'); return; }
        var n = GVParser.applyGeometry(cur.ds, obj);
        if (!n) { U.toast('No feature matched a pipeline (use properties id, code or name)', 'warn'); return; }
        A.replaceCase(cur.id, cur.ds);
        U.toast('Geometry applied to ' + n + ' of ' + cur.arcs.length + ' arcs');
      } else throw new Error('not a dataset or GeoJSON FeatureCollection');
    }).catch(function (err) { U.toast('Could not open ' + file.name + ': ' + err.message, 'warn'); });
  };

  // ---------- shapefiles (e.g. EPE geofiles) -> reference layers ----------
  function readBuf(file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(file); });
  }
  var EPE_IDS = [[/transporte/i, 'transport', 'EPE – Transport pipelines'], [/escoamento/i, 'gathering', 'EPE – Gathering / offshore pipelines'], [/distribui/i, 'distribution', 'EPE – Distribution networks'],
    [/compress/i, 'compression', 'EPE – Compression stations'], [/gnl|lng/i, 'lng', 'EPE – LNG terminals'], [/processamento/i, 'processing', 'EPE – Gas processing plants'], [/entrega/i, 'delivery', 'EPE – Delivery points']];
  L.loadShapefiles = function (list) {
    var groups = {};
    list.forEach(function (e) { var base = e.file.name.replace(/\.[^.]+$/, ''); (groups[base] = groups[base] || {})[e.file.name.split('.').pop().toLowerCase()] = e.file; });
    var names = Object.keys(groups).filter(function (b) { return groups[b].shp; });
    U.toast('Reading ' + names.length + ' shapefile(s)…');
    var isEpe = names.some(function (n) { return /gasodutos_transporte/i.test(n); });
    var refId = isEpe ? 'epe' : 'user' + Date.now().toString(36);
    return Promise.all(names.map(function (b) {
      var g = groups[b];
      return Promise.all([readBuf(g.shp), g.dbf ? readBuf(g.dbf) : null, g.cpg ? readText(g.cpg) : 'utf-8']).then(function (r) {
        var fc = GVShapefile.toGeoJSON(r[0], r[1], String(r[2]).trim() || 'utf-8');
        var line = fc.features.some(function (f) { return /Line/.test(f.geometry.type); });
        GVShapefile.simplify(fc, line ? 0.0004 : 0, 5);
        fc.features.forEach(function (f) {
          var p = f.properties;
          if (!p.name) p.name = p.Nome_Dut_1 || p.Nome || p.NOME || p.DUTO_ID || p.Distrib || p.name || '';
          if (p.Categoria && !p.category) p.category = p.Categoria;
          if (p.Classifica && !p.category) p.category = p.Classifica;
        });
        var m = EPE_IDS.filter(function (x) { return x[0].test(b); })[0];
        return { id: isEpe && m ? m[1] : b.toLowerCase().replace(/[^\w]+/g, '-'), label: isEpe && m ? m[2] : b, geom: line ? 'line' : 'point', data: fc };
      });
    })).then(function (layers) {
      layers = layers.filter(function (l) { return l.data.features.length; });
      GV.registerReference({ id: refId, label: isEpe ? 'EPE gas infrastructure' : 'Loaded shapefiles', source: 'local files', layers: layers });
      var routed = A.current() ? Object.keys(A.current().routes).length : 0;
      U.toast('Loaded ' + layers.length + ' reference layer(s)' + (isEpe ? '; ' + routed + ' pipelines routed along the real traces' : '') + '. Add them with Layers → + Add layer.');
    }).catch(function (err) { U.toast('Could not read shapefiles: ' + err.message, 'warn'); });
  };

  // ---------- pickers ----------
  L.init = function () {
    var fin = U.$('#folder-input'), fil = U.$('#file-input');
    fin.onchange = function () {
      var entries = Array.prototype.map.call(fin.files, function (f) { return { path: f.webkitRelativePath || f.name, file: f }; });
      fin.value = '';
      L.loadEntries(entries);
    };
    fil.onchange = function () {
      var files = Array.prototype.slice.call(fil.files); fil.value = '';
      var shp = files.filter(function (f) { return /\.(shp|dbf|cpg|prj)$/i.test(f.name); });
      if (shp.length) { L.loadShapefiles(shp.map(function (f) { return { path: f.name, file: f }; })); files = files.filter(function (f) { return shp.indexOf(f) < 0; }); }
      files.reduce(function (p, f) { return p.then(function () { return L.loadFile(f); }); }, Promise.resolve());
    };
    U.$('#empty-folder').onclick = function () { fin.click(); };
    U.$('#empty-file').onclick = function () { fil.click(); };

    // drag & drop (folders included)
    var dz = U.$('#dropzone'), depth = 0;
    window.addEventListener('dragenter', function (e) { if (hasFiles(e)) { depth++; dz.hidden = false; e.preventDefault(); } });
    window.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) dz.hidden = true; });
    window.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; dz.hidden = true;
      var items = Array.prototype.slice.call(e.dataTransfer.items || []);
      var roots = items.map(function (it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; }).filter(Boolean);
      if (!roots.length) {
        L.loadEntries(Array.prototype.map.call(e.dataTransfer.files, function (f) { return { path: f.name, file: f }; }));
        return;
      }
      Promise.all(roots.map(function (r) { return walk(r, '', 0); })).then(function (lists) {
        L.loadEntries([].concat.apply([], lists));
      });
    });
  };
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
  function walk(entry, prefix, depth) {
    if (entry.isFile) {
      return new Promise(function (res) { entry.file(function (f) { res([{ path: prefix + entry.name, file: f }]); }, function () { res([]); }); });
    }
    if (!entry.isDirectory || depth > 3) return Promise.resolve([]);
    var reader = entry.createReader(), all = [];
    return new Promise(function (res) {
      (function next() {
        reader.readEntries(function (batch) {
          if (!batch.length) {
            Promise.all(all.map(function (x) { return walk(x, prefix + entry.name + '/', depth + 1); })).then(function (l) { res([].concat.apply([], l)); });
            return;
          }
          all = all.concat(batch); next();
        }, function () { res([]); });
      })();
    });
  }

  // ---------- menu actions ----------
  L.menu = function (action) {
    var c = A.current();
    if (action === 'folder') U.$('#folder-input').click();
    else if (action === 'file') U.$('#file-input').click();
    else if (!c) U.toast('No case is open', 'warn');
    else if (action === 'export') {
      U.download(slug(c.name) + '.json', JSON.stringify(stripRuntime(c.ds)), 'application/json');
      U.toast('Saved. Colleagues can open it with “Open case → Dataset”.');
    } else if (action === 'exportLib') {
      U.download(slug(c.name) + '.case.js', 'GV.registerCase(' + JSON.stringify(stripRuntime(c.ds)) + ');\n', 'text/javascript');
      GV.ui.modal(GV.util.h('div', GV.util.h('h2', 'Add this case to the team library'),
        GV.util.h('ol',
          GV.util.h('li', 'Copy the downloaded file ', GV.util.h('code', slug(c.name) + '.case.js'), ' into the app’s ', GV.util.h('code', 'data'), ' folder.'),
          GV.util.h('li', 'Add its name to the list in ', GV.util.h('code', 'data/library.js'), ':'),
          GV.util.h('pre', { style: { background: 'var(--panel-2)', padding: '8px', borderRadius: '5px', overflow: 'auto' } }, "GV.loadLibrary([\n  'data/" + slug(c.name) + ".case.js'\n]);")),
        GV.util.h('p.muted', 'Everyone who opens this copy of the app (shared drive or web server) will then see the case pre-loaded.')));
    } else if (action === 'remove') A.removeCase(c.id);
  };
  function slug(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'case'; }
  function stripRuntime(ds) { var o = Object.assign({}, ds); delete o.id; return o; }

  // ---------- team library ----------
  /** Called from data/library.js with a list of script paths; each script calls GV.registerCase(...). */
  GV.loadLibrary = function (paths) {
    var p = Promise.resolve();
    (paths || []).forEach(function (src) {
      p = p.then(function () {
        return new Promise(function (res) {
          var s = document.createElement('script');
          s.src = src; s.onload = res;
          s.onerror = function () { U.toast('Library file not found: ' + src, 'warn'); res(); };
          document.body.appendChild(s);
        });
      });
    });
    return p.then(function () { if (GV.onLibraryLoaded) GV.onLibraryLoaded(); });
  };
})();
