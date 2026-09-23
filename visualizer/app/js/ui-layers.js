/* Layers panel (list + per-layer editor) and Legend panel. */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, C = GV.config, LY = GV.layers, h = U.h;
  var UI = GV.ui = GV.ui || {};
  var dragId = null;

  // ================================================================ helpers
  function svgShape(shape, px, fill, stroke) {
    var s = px, c = s / 2, r = s / 2 - 1.5, pts = [];
    function poly(p) { return p.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); }
    var el;
    if (shape === 'square') el = '<rect x="' + (c - r * 0.84) + '" y="' + (c - r * 0.84) + '" width="' + r * 1.68 + '" height="' + r * 1.68 + '"/>';
    else if (shape === 'diamond') el = '<polygon points="' + poly([[c, c - r], [c + r, c], [c, c + r], [c - r, c]]) + '"/>';
    else if (shape === 'triangle') el = '<polygon points="' + poly([[c, c - r], [c + r * 0.95, c + r * 0.75], [c - r * 0.95, c + r * 0.75]]) + '"/>';
    else if (shape === 'hexagon') { for (var i = 0; i < 6; i++) { var a = Math.PI / 3 * i + Math.PI / 6; pts.push([c + r * Math.cos(a), c + r * Math.sin(a)]); } el = '<polygon points="' + poly(pts) + '"/>'; }
    else if (shape === 'pie') {
      var gs = GV.config.sourceGroups, acc = -Math.PI / 2, step = Math.PI * 2 / Math.min(gs.length, 4), parts = '';
      for (var q = 0; q < Math.min(gs.length, 4); q++) {
        var x1 = c + r * Math.cos(acc), y1 = c + r * Math.sin(acc); acc += step;
        var x2 = c + r * Math.cos(acc), y2 = c + r * Math.sin(acc);
        parts += '<path d="M' + c + ',' + c + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' A' + r + ',' + r + ' 0 0 1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' Z" fill="' + gs[q].color + '"/>';
      }
      return h('span.shape-ico', { html: '<svg width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '">' + parts + '</svg>' });
    }
    else if (shape === 'star') { for (var k = 0; k < 10; k++) { var b = -Math.PI / 2 + Math.PI / 5 * k, rr = k % 2 ? r * 0.45 : r; pts.push([c + rr * Math.cos(b), c + rr * Math.sin(b)]); } el = '<polygon points="' + poly(pts) + '"/>'; }
    else el = '<circle cx="' + c + '" cy="' + c + '" r="' + r + '"/>';
    var span = h('span.shape-ico', { html: '<svg width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '"><g fill="' + fill + '" stroke="' + (stroke || '#fff') + '" stroke-width="1.2">' + el + '</g></svg>' });
    return span;
  }
  UI.svgShape = svgShape;
  function lineSwatch(color, w, dash, arrow) {
    var d = dash === 'dashed' ? 'stroke-dasharray="6 4"' : dash === 'dotted' ? 'stroke-dasharray="1.5 3.5" stroke-linecap="round"' : 'stroke-linecap="round"';
    return h('span.shape-ico', { html: '<svg width="30" height="14" viewBox="0 0 30 14"><line x1="2" y1="7" x2="28" y2="7" stroke="' + color + '" stroke-width="' + Math.min(w, 10) + '" ' + d + '/>' +
      (arrow ? '<polygon points="12,3.5 19,7 12,10.5" fill="' + (w > 4.5 ? '#fff' : '#1e293b') + '"/>' : '') + '</svg>' });
  }
  function previewOf(l, b) {
    var col = l.color.value || (b && b.colorScale && b.colorScale.type !== 'fixed' ? (b.colorScale.stops ? b.colorScale.stops[Math.floor(b.colorScale.stops.length * 0.7)] : (b.colorScale.entries && b.colorScale.entries[0] ? b.colorScale.entries[0].color : A.bins()[2].color)) : '#64748b');
    if (LY.geomKind(l) === 'line') return lineSwatch(col, l.size.value || 3, l.dash, l.arrows && l.arrows.show);
    return svgShape(l.shape || 'circle', 16, col, A.isDark() ? '#0f172a' : '#fff');
  }
  function fieldOptions(l, filterFn, selected, allowNone) {
    var fields = LY.fields(l).filter(filterFn || function () { return true; });
    var outs = fields.filter(function (f) { return !f.input && f.type === 'num' && !f.ref; });
    var ins = fields.filter(function (f) { return f.input || f.ref || f.type !== 'num'; });
    var s = h('select');
    if (allowNone) s.appendChild(h('option', { value: '' }, allowNone));
    function grp(label, list) {
      if (!list.length) return;
      var g = h('optgroup', { label: label });
      list.forEach(function (f) { g.appendChild(h('option', { value: f.id, selected: f.id === selected }, f.label.replace(/ \(input\)$/, ''))); });
      s.appendChild(g);
    }
    if (l.type === 'ref') grp('Attributes', fields);
    else { grp('Results', outs); grp('Inputs & attributes', ins); }
    return s;
  }
  function unitOf(f) { return f && f.unit ? U.unitOpt(f.unit) : { factor: 1, label: '' }; }
  function upd(id, mut) { LY.update(id, mut); }

  // ================================================================ panel
  UI.initLayers = function () {
    st.on('layerList geomMode basemap admin lockScale caseId casesVersion units theme refsVersion viewsVersion view', U.debounce(render, 20));
    GV.map.onRender = function () { renderLegend(); updateCounts(); refreshList(); };
    st.on('selection', function () { refreshList(); });
    render();
  };

  function render() {
    var body = U.$('#layers-body'); if (!body) return;
    var scroll = body.scrollTop;
    U.clear(body);
    body.appendChild(displaySection());
    var list = st.get('layerList') || [];
    var head = h('div.sec', h('div.sec-h', 'Layers (' + list.length + ')', addMenu()));
    var ul = h('div.lyr-list');
    if (!list.length) ul.appendChild(h('div.hint', 'No layers. Add one with “+ Add layer” or pick a view.'));
    list.forEach(function (l, idx) { ul.appendChild(layerRow(l, idx, list.length)); });
    head.appendChild(ul);
    head.appendChild(h('div.hint', 'The top of the list is drawn on top. Drag ⠿ to reorder. The same element type can be added several times, each with its own filter, colours, sizes and labels.'));
    body.appendChild(head);
    body.scrollTop = scroll;
    if (fly.id) renderFlyout();
  }
  UI.renderLayers = render;

  /** Views row (layer sets). Map and display options live in Preferences (gear icon). */
  function displaySection() {
    var viewSel = h('select', { style: { flex: '1', minWidth: '0' } });
    GV.views.fillSelect(viewSel);
    return h('div.sec',
      h('div.sec-h', 'View'),
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, viewSel,
        h('button.icon-btn', { title: 'Save view…', onclick: GV.views.saveDialog }, h('i.fa-regular.fa-floppy-disk')),
        h('button.icon-btn', { title: 'Manage views', onclick: GV.views.manageDialog }, h('i.fa-solid.fa-list-ul'))),
      h('button.linkbtn', { onclick: function () { GV.settings.open('map'); } }, h('i.fa-solid.fa-gear'), ' Map & display preferences…'));
  }

  function addMenu() {
    var wrap = h('div.menu-wrap'), menu = h('div.menu.right', { hidden: true });
    var items = [['arc', 'Arcs – pipelines, sea routes, regas'], ['node', 'Nodes (buses)'], ['asset:thermal', 'Thermal plants'], ['asset:citygate', 'City-gates / distribution'],
      ['asset:producer', 'Production'], ['asset:lng_supply', 'LNG supply'], ['asset:storage', 'Storage / linepack']];
    items.forEach(function (it) {
      menu.appendChild(h('button', { onclick: function () { menu.hidden = true; addLayer(it[0]); } }, it[1]));
    });
    var refs = LY.refList();
    if (refs.length) {
      menu.appendChild(h('div.menu-sep'));
      menu.appendChild(h('div.menu-h', 'Reference data'));
      refs.forEach(function (r) { menu.appendChild(h('button', { onclick: function () { menu.hidden = true; addLayer('ref:' + r.id); } }, r.label)); });
    }
    var btn = h('button.btn.sm', { onclick: function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; } }, h('i.fa-solid.fa-plus'), 'Add layer');
    document.addEventListener('mousedown', function (e) { if (!wrap.contains(e.target)) menu.hidden = true; });
    wrap.appendChild(btn); wrap.appendChild(menu);
    return wrap;
  }
  function addLayer(what) {
    var spec;
    if (what === 'arc') spec = { type: 'arc', name: 'Arcs', color: { field: 'util' }, size: { value: 3 }, arrows: { show: true, field: 'absFlow' } };
    else if (what === 'node') spec = { type: 'node', name: 'Nodes', color: { field: 'cmg' }, size: { value: 11 } };
    else if (what.indexOf('asset:') === 0) {
      var t = what.slice(6), et = C.elementTypes[t];
      var shapes = { thermal: 'diamond', citygate: 'square', producer: 'triangle', lng_supply: 'hexagon', storage: 'star' };
      var posn = { thermal: 'NE', citygate: 'NW', producer: 'S', lng_supply: 'SE', storage: 'SW' };
      spec = { type: 'asset', name: et.plural, assetTypes: [t], shape: shapes[t] || 'square', color: { value: et.color }, size: { field: 'aValue' }, position: posn[t] || 'E', distance: 13 };
    } else if (what.indexOf('ref:') === 0) {
      var rid = what.slice(4), rl = LY.refLayer(rid);
      spec = { type: 'ref', name: rl.label, ref: rid, color: rl.geom === 'line' ? { field: 'category' } : { value: '#7c3aed' }, size: { value: rl.geom === 'line' ? 1.3 : 9 }, shape: 'square' };
    }
    var l = LY.make(spec);
    fly.id = l.id; fly.mode = 'edit';
    st.set({ layerList: [l].concat(st.get('layerList') || []), view: 'custom' });
  }

  function layerRow(l, idx, n) {
    var b = (GV.map.builds() || {})[l.id];
    var row = h('div.lyr' + (fly.id === l.id ? '.open' : '') + (l.visible ? '' : '.off'), { draggable: false, dataset: { id: l.id } });
    var handle = h('span.lyr-drag', { title: 'Drag to reorder' }, h('i.fa-solid.fa-grip-vertical'));
    handle.addEventListener('mousedown', function () { row.draggable = true; });
    row.addEventListener('dragstart', function (e) { dragId = l.id; e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
    row.addEventListener('dragend', function () { row.draggable = false; row.classList.remove('dragging'); dragId = null; });
    row.addEventListener('dragover', function (e) { if (dragId && dragId !== l.id) { e.preventDefault(); row.classList.add('dropover'); } });
    row.addEventListener('dragleave', function () { row.classList.remove('dropover'); });
    row.addEventListener('drop', function (e) {
      e.preventDefault(); row.classList.remove('dropover');
      if (!dragId || dragId === l.id) return;
      var list = (st.get('layerList') || []).slice(), from = list.findIndex(function (x) { return x.id === dragId; });
      var item = list.splice(from, 1)[0], to = list.findIndex(function (x) { return x.id === l.id; });
      list.splice(to, 0, item);
      st.set({ layerList: list, view: 'custom' });
    });
    var name = h('span.lyr-name', { title: 'Double-click to rename' }, l.name);
    name.addEventListener('dblclick', function () {
      var inp = h('input', { type: 'text', value: l.name, style: { width: '100%' } });
      name.replaceWith(inp); inp.focus(); inp.select();
      function done() { var v = inp.value.trim(); if (v && v !== l.name) upd(l.id, function (x) { x.name = v; }); else render(); }
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = l.name; inp.blur(); } });
      inp.addEventListener('blur', done);
    });
    var head = h('div.lyr-head',
      handle,
      h('input', { type: 'checkbox', checked: l.visible, title: 'Show / hide', onchange: function () { var v = this.checked; upd(l.id, function (x) { x.visible = v; }); } }),
      previewOf(l, b), name,
      h('span.lyr-count', { dataset: { count: l.id } }, b ? b.count + '/' + b.total : ''),
      h('button.icon-btn', { title: 'Labels on/off', class: 'lyr-lbl' + (l.labels.show ? ' on' : ''), onclick: function () { upd(l.id, function (x) { x.labels.show = !x.labels.show; }); } }, h('i.fa-solid.fa-font')),
      h('button.icon-btn' + (fly.id === l.id && fly.mode === 'list' ? '.on' : ''), { title: 'Elements of this layer', onclick: function () { UI.openLayerFlyout(l.id, 'list'); } }, h('i.fa-solid.fa-list-ul')),
      h('button.icon-btn' + (fly.id === l.id && fly.mode === 'edit' ? '.on' : ''), { title: 'Edit layer', onclick: function () { UI.openLayerFlyout(l.id, 'edit'); } }, h('i.fa-solid.fa-sliders')),
      h('button.icon-btn', { title: 'Layer menu', onclick: function (e) { layerMenu(e, l, idx, n); } }, h('i.fa-solid.fa-ellipsis-vertical')));
    row.appendChild(head);
    return row;
  }
  function updateCounts() {
    var B = GV.map.builds() || {};
    U.$$('[data-count]').forEach(function (el) { var b = B[el.dataset.count]; el.textContent = b ? b.count + '/' + b.total : ''; });
  }
  function layerMenu(e, l, idx, n) {
    e.stopPropagation();
    var m = U.$('#dock-menu'); U.clear(m);
    function item(label, fn) { m.appendChild(h('button', { onclick: function () { m.hidden = true; fn(); } }, label)); }
    item('Duplicate', function () {
      var list = (st.get('layerList') || []).slice(), copy = JSON.parse(JSON.stringify(l));
      copy.id = LY.make({ type: l.type }).id; copy.name = l.name + ' (copy)';
      list.splice(idx, 0, copy); fly.id = copy.id; fly.mode = 'edit';
      st.set({ layerList: list, view: 'custom' });
    });
    if (idx > 0) item('Move up', function () { move(idx, -1); });
    if (idx < n - 1) item('Move down', function () { move(idx, 1); });
    item('Zoom to layer', function () {
      var b = GV.map.builds()[l.id]; if (!b) return;
      var pts = [];
      b.main.forEach(function (f) { var g = f.geometry; if (g.type === 'Point') pts.push(g.coordinates); else if (g.type === 'LineString') pts = pts.concat(g.coordinates); else if (g.type === 'MultiLineString') g.coordinates.forEach(function (x) { pts = pts.concat(x); }); });
      if (pts.length) GV.map.map.fitBounds(U.bbox(pts), { padding: 60, maxZoom: 9 });
    });
    if (l.type !== 'ref') item('Select all shown elements', function () {
      var b = GV.map.builds()[l.id]; if (!b) return;
      st.selectMany(b.main.map(function (f) { return { kind: f.properties.ek, id: f.properties.eid }; }), false);
    });
    m.appendChild(h('div.menu-sep'));
    item('Delete layer', function () { st.set({ layerList: (st.get('layerList') || []).filter(function (x) { return x.id !== l.id; }), view: 'custom' }); });
    var r = e.currentTarget.getBoundingClientRect();
    m.hidden = false; m.style.left = Math.min(r.left, window.innerWidth - 210) + 'px'; m.style.top = (r.bottom + 4) + 'px';
  }
  function move(idx, d) {
    var list = (st.get('layerList') || []).slice(), it = list.splice(idx, 1)[0];
    list.splice(idx + d, 0, it);
    st.set({ layerList: list, view: 'custom' });
  }

  // ================================================================ editor
  function editor(l) {
    var ed = h('div.lyr-ed');
    var numField = function (f) { return f.type === 'num'; };
    // ---- elements
    if (l.type === 'arc') {
      ed.appendChild(sub('Elements', toggles(['pipeline', 'maritime', 'regas'], l.kinds, function (k) { return C.elementTypes[k].plural; }, function (v) { upd(l.id, function (x) { x.kinds = v; }); })));
    } else if (l.type === 'asset') {
      var at = Object.keys(C.elementTypes).filter(function (k) { return C.elementTypes[k].group === 'asset'; });
      ed.appendChild(sub('Elements',
        toggles(at, l.assetTypes, function (k) { return C.elementTypes[k].plural; }, function (v) { upd(l.id, function (x) { x.assetTypes = v; }); }),
        h('div.segmented', { style: { marginTop: '5px' } }, [['node', 'Sum per node'], ['each', 'One symbol per asset']].map(function (m) {
          return h('button' + (l.aggregate === m[0] ? '.on' : ''), { onclick: function () { upd(l.id, function (x) { x.aggregate = m[0]; }); } }, m[1]);
        }))));
    } else if (l.type === 'ref') {
      ed.appendChild(sub('Dataset', h('select', { onchange: function () { var v = this.value; upd(l.id, function (x) { x.ref = v; x.color = { value: '#64748b' }; x.labels.fields = ['name']; x.filter = []; }); } },
        LY.refList().map(function (r) { return h('option', { value: r.id, selected: r.id === l.ref }, r.label); }))));
    }
    // ---- filter
    var rules = h('div');
    (l.filter || []).forEach(function (r, i) { rules.appendChild(ruleRow(l, r, i)); });
    ed.appendChild(sub('Filter (inputs or results)', rules, h('div.btn-row',
      h('button.btn.sm.ghost', { onclick: function () {
        var f = LY.fields(l).filter(numField)[0] || LY.fields(l)[0];
        upd(l.id, function (x) { x.filter = (x.filter || []).concat([{ field: f.id, op: '>', value: 0 }]); });
      } }, h('i.fa-solid.fa-plus'), 'Add condition'),
      (l.filter || []).length ? h('button.btn.sm.ghost', { onclick: function () { upd(l.id, function (x) { x.filter = []; }); } }, h('i.fa-solid.fa-rotate-left'), 'Clear conditions') : null)));
    // ---- colour
    if (l.shape === 'pie') ed.appendChild(sub('Symbol colour', h('div.hint', 'Pie slices show the gas origin mix (source groups in js/config.js).')));
    else ed.appendChild(sub(LY.geomKind(l) === 'line' ? 'Line colour' : 'Symbol colour', channel(l, 'color')));
    // ---- size
    ed.appendChild(sub(LY.geomKind(l) === 'line' ? 'Line width (px)' : 'Symbol size (px)', channel(l, 'size')));
    // ---- arcs: arrows & line style
    if (l.type === 'arc') {
      ed.appendChild(sub('Flow arrows',
        h('label.check', h('input', { type: 'checkbox', checked: l.arrows.show, onchange: function () { var v = this.checked; upd(l.id, function (x) { x.arrows.show = v; }); } }), 'Show direction arrows'),
        l.arrows.show ? channel(l, 'arrows') : null,
        l.arrows.show ? h('label.check', h('input', { type: 'checkbox', checked: l.animate !== false, onchange: function () { var v = this.checked; upd(l.id, function (x) { x.animate = v; }); } }), 'Animate arrows (moving along the flow)') : null));
      ed.appendChild(sub('Line style', h('div.fgrid', frow('Stroke',
        h('select', { onchange: function () { var v = this.value; upd(l.id, function (x) { x.dash = v; }); } }, [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']].map(function (d) { return h('option', { value: d[0], selected: (l.dash || 'solid') === d[0] }, d[1]); }))))));
    }
    // ---- points: shape & position
    if (LY.geomKind(l) === 'point') {
      var shapes = h('div.shape-pick');
      LY.SHAPES.concat(l.type === 'ref' ? [] : ['pie']).forEach(function (s) {
        shapes.appendChild(h('button' + (l.shape === s ? '.on' : ''), { title: s === 'pie' ? 'Pie chart of gas origin' : s, onclick: function () { upd(l.id, function (x) { x.shape = s; }); } }, svgShape(s, 16, l.shape === s ? 'var(--accent)' : '#64748b', 'transparent')));
      });
      var parts = [frow('Shape', shapes)];
      if (l.type !== 'ref') {
        var grid = h('div.pos-grid', { title: 'Position around the node, so several symbols can share one node' });
        ['NW', 'N', 'NE', 'W', 'C', 'E', 'SW', 'S', 'SE'].forEach(function (p) {
          grid.appendChild(h('button' + ((l.position || 'C') === p ? '.on' : ''), { onclick: function () { upd(l.id, function (x) { x.position = p; }); } }, p === 'C' ? '•' : ''));
        });
        parts.push(frow('Position', h('div.inline', grid, h('span.unit', 'dist.'), num(l.distance, 0, 60, 1, function (v) { upd(l.id, function (x) { x.distance = v; }); }), h('span.unit', 'px'))));
      }
      parts.push(frow('Outline', h('div.inline',
        h('select', { onchange: function () { var v = this.value; upd(l.id, function (x) { x.stroke = v === 'custom' ? '#000000' : v; }); } },
          h('option', { value: 'auto', selected: l.stroke === 'auto' }, 'Automatic'), h('option', { value: 'custom', selected: l.stroke !== 'auto' }, 'Custom')),
        l.stroke !== 'auto' ? h('input.swatch', { type: 'color', value: l.stroke, onchange: function () { var v = this.value; upd(l.id, function (x) { x.stroke = v; }); } }) : null)));
      ed.appendChild(sub('Symbol', h('div.fgrid', parts)));
    }
    // ---- labels
    var fields = LY.fields(l), chosen = l.labels.fields || [];
    var chips = h('div.chipset');
    chosen.forEach(function (fid) {
      var f = fields.filter(function (x) { return x.id === fid; })[0]; if (!f) return;
      chips.appendChild(h('span.tog.on', f.label.replace(/ \(input\)$/, ''), h('button.x', { onclick: function () { upd(l.id, function (x) { x.labels.fields = x.labels.fields.filter(function (q) { return q !== fid; }); }); } }, h('i.fa-solid.fa-xmark'))));
    });
    var addF = fieldOptions(l, function (f) { return chosen.indexOf(f.id) < 0; }, null, '+ add field…');
    addF.onchange = function () { var v = this.value; if (v) upd(l.id, function (x) { x.labels.fields = (x.labels.fields || []).concat([v]); x.labels.show = true; }); };
    ed.appendChild(sub('Labels',
      h('label.check', h('input', { type: 'checkbox', checked: l.labels.show, onchange: function () { var v = this.checked; upd(l.id, function (x) { x.labels.show = v; }); } }), 'Show labels on the map'),
      h('div.fgrid',
        frow('Fields', chosen.length ? chips : null, addF),
        frow('Text size', h('div.inline', num(l.labels.size || 11, 8, 20, 1, function (v) { upd(l.id, function (x) { x.labels.size = v; }); }), h('span.unit', 'px'),
          h('span.unit.gap', 'from zoom'), num(l.labels.minzoom || 0, 0, 14, 0.5, function (v) { upd(l.id, function (x) { x.labels.minzoom = v; }); }))))));
    // ---- layer
    var opVal = h('span.unit', Math.round((l.opacity === undefined ? 1 : l.opacity) * 100) + '%');
    ed.appendChild(sub('Layer',
      h('div.fgrid',
        frow('Opacity', h('div.inline.grow', h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: l.opacity, oninput: function () { opVal.textContent = Math.round(this.value * 100) + '%'; }, onchange: function () { var v = +this.value; upd(l.id, function (x) { x.opacity = v; }); } }), opVal)),
        frow('Visible from', h('div.inline', h('span.unit', 'zoom'), num(l.minzoom || 0, 0, 14, 0.5, function (v) { upd(l.id, function (x) { x.minzoom = v; }); })))),
      h('label.check', h('input', { type: 'checkbox', checked: l.legend !== false, onchange: function () { var v = this.checked; upd(l.id, function (x) { x.legend = v; }); } }), 'Show in legend')));
    return ed;
  }
  function sub(title) {
    var box = h('div.lyr-sub', h('div.lyr-sub-h', title));
    Array.prototype.slice.call(arguments, 1).forEach(function (c) { if (c) box.appendChild(c); });
    return box;
  }
  function toggles(all, on, labelOf, set) {
    var box = h('div.chipset');
    all.forEach(function (v) {
      box.appendChild(h('button.tog' + (on.indexOf(v) >= 0 ? '.on' : ''), { onclick: function () {
        var nv = on.indexOf(v) >= 0 ? on.filter(function (x) { return x !== v; }) : on.concat([v]);
        if (!nv.length) { U.toast('Keep at least one type'); return; }
        set(nv);
      } }, labelOf(v)));
    });
    return box;
  }
  function ruleRow(l, r, i) {
    var f = LY.field(l, r.field) || {}, o = unitOf(f), isNum = f.type === 'num';
    var fsel = fieldOptions(l, null, r.field);
    fsel.onchange = function () { var v = this.value, nf = LY.field(l, v); upd(l.id, function (x) { x.filter[i] = { field: v, op: nf && nf.type === 'num' ? '>' : '=', value: nf && nf.type === 'num' ? 0 : '' }; }); };
    var ops = isNum ? LY.OPS : ['=', '!=', 'contains'];
    var osel = h('select', { onchange: function () { var v = this.value; upd(l.id, function (x) { x.filter[i].op = v; }); } }, ops.map(function (op) { return h('option', { value: op, selected: op === r.op }, op); }));
    function inp(key) {
      var val = r[key] === undefined || r[key] === '' ? '' : isNum ? +(r[key] * o.factor).toFixed(6) : r[key];
      return h('input.num-in', { type: isNum ? 'number' : 'text', value: val, onchange: function () {
        var v = this.value; upd(l.id, function (x) { x.filter[i][key] = isNum ? (+v) / o.factor : v; });
      } });
    }
    return h('div.rule',
      h('div.rule-top', fsel, h('button.icon-btn', { title: 'Remove condition', onclick: function () { upd(l.id, function (x) { x.filter.splice(i, 1); }); } }, h('i.fa-solid.fa-xmark'))),
      h('div.rule-val', osel, inp('value'), r.op === 'between' ? h('span.unit', 'and') : null, r.op === 'between' ? inp('value2') : null,
        isNum && o.label ? h('span.unit', f.unit === 'pct' ? '%' : o.label) : null));
  }
  /** Channel editor for 'color', 'size' or 'arrows'. */
  function channel(l, key) {
    var ch = l[key], byField = !!ch.field;
    var mode = h('div.segmented', [['fixed', key === 'color' ? 'Single colour' : 'Fixed'], ['field', 'By data']].map(function (m) {
      return h('button' + ((m[0] === 'field') === byField ? '.on' : ''), { onclick: function () {
        if ((m[0] === 'field') === byField) return;
        upd(l.id, function (x) {
          if (m[0] === 'fixed') { delete x[key].field; x[key].value = key === 'color' ? '#475569' : key === 'arrows' ? 1 : (LY.geomKind(x) === 'line' ? 2.5 : 10); }
          else { delete x[key].value; var f = LY.fields(x).filter(function (q) { return key === 'color' ? q.type !== 'text' : q.type === 'num'; })[0]; x[key].field = key === 'color' && x.type === 'arc' ? 'util' : key !== 'color' && x.type === 'arc' ? 'absFlow' : f.id; }
        });
      } }, m[1]);
    }));
    var rows = [frow('Mode', mode)];
    if (!byField) {
      if (key === 'color') rows.push(frow('Colour', h('input.swatch', { type: 'color', value: ch.value || '#475569', onchange: function () { var v = this.value; upd(l.id, function (x) { x.color.value = v; }); } })));
      else rows.push(frow('Value', h('div.inline', num(ch.value, key === 'arrows' ? 0.3 : 0.5, 40, key === 'arrows' ? 0.1 : 0.5, function (v) { upd(l.id, function (x) { x[key].value = v; }); }), h('span.unit', key === 'arrows' ? '× arrow' : 'px'))));
      return h('div.fgrid', rows);
    }
    var fsel = fieldOptions(l, function (f) { return key === 'color' ? f.type !== 'text' : f.type === 'num'; }, ch.field);
    fsel.onchange = function () { var v = this.value; upd(l.id, function (x) { x[key].field = v; delete x[key].domain; }); };
    rows.push(frow('Field', fsel));
    if (key === 'color') {
      var f = LY.field(l, ch.field);
      if (f && f.type === 'num') rows.push(frow('Palette', h('select', { onchange: function () { var v = this.value; upd(l.id, function (x) { x.color.palette = v; }); } },
        [['auto', 'Automatic'], ['utilization', 'Utilization classes'], ['flow', 'Blues'], ['cost', 'Yellow–red'], ['seq', 'Purples'], ['diverging', 'Diverging (− / +)']].map(function (p) { return h('option', { value: p[0], selected: (ch.palette || 'auto') === p[0] }, p[1]); }))));
    } else {
      var st2 = key === 'arrows' ? 0.1 : 0.5;
      rows.push(frow('Range', h('div.inline.range',
        num(ch.min, 0, 60, st2, function (v) { upd(l.id, function (x) { x[key].min = v; }); }), h('span.unit', '–'),
        num(ch.max, 0, 60, st2, function (v) { upd(l.id, function (x) { x[key].max = v; }); }),
        h('span.unit', key === 'arrows' ? '× arrow' : 'px'))));
    }
    return h('div.fgrid', rows);
  }
  /** One form row: label on the left, control(s) on the right. */
  function frow(label) {
    var c = h('div.frow-c');
    Array.prototype.slice.call(arguments, 1).forEach(function (x) { if (x) c.appendChild(x); });
    return h('div.frow', h('span.frow-l', label), c);
  }
  function num(value, min, max, step, set) {
    return h('input.num-in', { type: 'number', min: min, max: max, step: step, value: value, onchange: function () { set(+this.value); } });
  }

  // ================================================================ side sub-panel (layer editor / element list)
  // Opens next to the Layers panel (whichever side it is docked on, or next to its floating window).
  var fly = { id: null, mode: 'edit', q: '', sort: 'value', scroll: {} }, flyEl = null, flyTimer = null, colorCache = {};
  UI.openLayerFlyout = function (id, mode) {
    if (fly.id === id && fly.mode === mode) { closeFlyout(); return; }
    fly.id = id; fly.mode = mode || 'edit';
    render();
  };
  function closeFlyout() {
    fly.id = null;
    if (flyEl) flyEl.hidden = true;
    clearInterval(flyTimer); flyTimer = null;
    GV.dock.setExtra('both', 0);
    U.$$('.lyr.open').forEach(function (r) { r.classList.remove('open'); });
  }
  UI.closeLayerFlyout = closeFlyout;
  var FLY_W = 340;
  /** Where the Layers panel is: { side: 'left'|'right', dock } when docked and expanded, { win } when floating, or null. */
  function layersHost() {
    var body = U.$('#layers-body');
    if (!body || !body.offsetParent) return null;           // panel hidden, collapsed or on another tab
    var win = body.closest('.fwin');
    if (win) return { win: win };
    var dock = body.closest('.dock');
    if (dock && (dock.id === 'dock-left' || dock.id === 'dock-right')) return { side: dock.id.slice(5), dock: dock };
    return { win: dock || body };                            // bottom dock: behave like a floating window
  }
  function placeFlyout() {
    if (!flyEl || !fly.id) return;
    var host = layersHost();
    if (!host) { flyEl.hidden = true; GV.dock.setExtra('both', 0); return; }
    flyEl.hidden = false;
    if (host.side) {
      // docked: the sub-panel becomes a column of the dock and pushes the map
      if (flyEl.parentNode !== host.dock) host.dock.appendChild(flyEl);
      flyEl.className = 'lyr-flyout in-dock ' + (host.side === 'left' ? 'to-right' : 'to-left');
      flyEl.style.cssText = 'width:' + FLY_W + 'px';
      GV.dock.setExtra(host.side === 'left' ? 'right' : 'left', 0);
      GV.dock.setExtra(host.side, FLY_W);
      return;
    }
    // floating panel: attach to the window edge, over the map
    GV.dock.setExtra('both', 0);
    if (flyEl.parentNode !== document.body) document.body.appendChild(flyEl);
    var r = host.win.getBoundingClientRect(), vw = window.innerWidth, W = Math.min(FLY_W, vw - 40);
    var toRight = r.left + r.width / 2 < vw / 2, left = Math.max(0, Math.min(toRight ? r.right : r.left - W, vw - W));
    flyEl.className = 'lyr-flyout from-float ' + (toRight ? 'to-right' : 'to-left');
    flyEl.style.cssText = 'left:' + left + 'px;top:' + r.top + 'px;width:' + W + 'px;height:' + r.height + 'px';
  }
  function renderFlyout() {
    var l = fly.id && LY.get(fly.id);
    if (!l) { closeFlyout(); return; }
    if (!flyEl) {
      flyEl = h('div#lyr-flyout.lyr-flyout', { hidden: true });
      document.body.appendChild(flyEl);
      window.addEventListener('gv-panels', placeFlyout);
      window.addEventListener('resize', placeFlyout);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && fly.id && !e.target.closest('input, textarea') && !U.$('.gsel-pop')) closeFlyout(); });
    }
    var bodyOld = U.$('.fly-body', flyEl);
    if (bodyOld) fly.scroll[fly.mode] = bodyOld.scrollTop;
    U.clear(flyEl);
    var b = (GV.map.builds() || {})[l.id];
    // same chrome as a docked panel: tab strip on top, then a section header with the layer
    var n = b ? b.count : '', tabs = h('div.dock-tabs.fly-tabs');
    [['edit', 'Edit', 'fa-sliders'], ['list', 'Elements', 'fa-list-ul']].forEach(function (t) {
      tabs.appendChild(h('button.dtab' + (fly.mode === t[0] ? '.active' : ''), { onclick: function () { fly.mode = t[0]; renderFlyout(); } },
        h('i.fa-solid.' + t[2]), h('span', t[1]), t[0] === 'list' && n !== '' ? h('span.fly-n', String(n)) : null));
    });
    tabs.appendChild(h('div.dtab-tools', h('button.icon-btn', { title: 'Close', onclick: closeFlyout }, h('i.fa-solid.fa-xmark'))));
    flyEl.appendChild(tabs);
    flyEl.appendChild(h('div.fly-head',
      previewOf(l, b),
      h('div.fly-title', h('div.fly-kicker', LY.TYPES[l.type] || ''), h('div.fly-name', { title: l.name }, l.name))));
    var body = h('div.fly-body');
    body.appendChild(fly.mode === 'edit' ? editor(l) : elementList(l, b));
    flyEl.appendChild(body);
    placeFlyout();
    body.scrollTop = fly.scroll[fly.mode] || 0;
    // follow the Layers panel when it is moved, resized or collapsed
    if (!flyTimer) flyTimer = setInterval(placeFlyout, 300);
    U.$$('.lyr').forEach(function (r) { r.classList.toggle('open', r.dataset.id === fly.id); });
  }

  /** Selectable list of the elements drawn by a layer, with the value it encodes. */
  function elementList(l, b) {
    var ctx = LY.context(), wrap = h('div.fly-list');
    if (!ctx) return wrap;
    var c = ctx.c, items = LY.items(l, c);
    // last colour seen on the map (kept for elements that are switched off)
    var colorOf = colorCache[l.id] = colorCache[l.id] || {};
    (b ? b.main : []).forEach(function (f) { colorOf[f.properties.eid] = f.properties.c; });
    var fid = l.color.field || l.size.field || (l.arrows && l.arrows.show && l.arrows.field) || null;
    var f = fid && LY.field(l, fid), gp = GV.map.getFilterPass && GV.map.getFilterPass();
    var rows = [], excluded = 0;
    items.forEach(function (it) {
      if (!LY.passesFilter(l, it, ctx)) { excluded++; return; }
      var name = it.kind === 'ref' ? (it.f.properties.name || it.f.properties.nome || it.id) : LY.raw(l, 'name', it, c, ctx.F);
      var sub = '';
      if (it.kind === 'arc') { var a = c.arcs[it.i]; sub = c.node(a.from).name + ' → ' + c.node(a.to).name; }
      else if (it.kind === 'asset') sub = c.node(c.assets[it.i].node).name;
      else if (it.agg) sub = it.assets.length + ' ' + (it.assets.length > 1 ? 'assets' : 'asset');
      else if (it.kind === 'node') sub = c.nodes[it.i].region || '';
      var v = fid ? LY.value(l, fid, it, ctx) : NaN;
      rows.push({ it: it, name: String(name), sub: sub, v: v, col: colorOf[it.id] || l.color.value || '#94a3b8', off: LY.isHidden(l, it.id) });
    });
    var q = fly.q.trim().toLowerCase();
    var shown = rows.filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.sub.toLowerCase().indexOf(q) >= 0; });
    var num = f && f.type === 'num';
    shown.sort(function (p, r) {
      if (fly.sort === 'name' || !num) return p.name.localeCompare(r.name);
      var a = isFinite(p.v) ? p.v : -Infinity, d = isFinite(r.v) ? r.v : -Infinity;
      return fly.sort === 'value' ? d - a : a - d;
    });
    // toolbar
    var search = h('input', { type: 'search', placeholder: 'Search in this layer…', value: fly.q });
    search.addEventListener('input', U.debounce(function () { fly.q = search.value; var pos = search.selectionStart; renderFlyout(); var s2 = U.$('.fly-tools input[type=search]', flyEl); if (s2) { s2.focus(); s2.setSelectionRange(pos, pos); } }, 150));
    var sortSel = h('select', { title: 'Sort', onchange: function () { fly.sort = this.value; renderFlyout(); } },
      [['value', 'Value ↓'], ['asc', 'Value ↑'], ['name', 'Name A–Z']].filter(function (o) { return num || o[0] === 'name'; })
        .map(function (o) { return h('option', { value: o[0], selected: fly.sort === o[0] || (!num && o[0] === 'name') }, o[1]); }));
    wrap.appendChild(h('div.fly-tools', h('div.fly-search', h('i.fa-solid.fa-magnifying-glass'), search), sortSel));
    var selectable = l.type !== 'ref';
    var selNow = st.get('selection') || [];
    function isSel(it) { return selNow.some(function (s) { return s.kind === it.kind && s.id === it.id; }); }
    var nOff = rows.filter(function (r) { return r.off; }).length, shownOff = shown.filter(function (r) { return r.off; }).length;
    function setHidden(ids, hide) {
      upd(l.id, function (x) {
        var cur = new Set(x.hidden || []);
        ids.forEach(function (id) { if (hide) cur.add(id); else cur.delete(id); });
        x.hidden = Array.from(cur);
      });
    }
    wrap.appendChild(h('div.fly-meta',
      h('span', (rows.length - nOff) + ' / ' + rows.length + ' ' + GV.t('shown on the map') + (excluded ? ' · ' + excluded + ' ' + GV.t('hidden by the layer filter') : '')),
      f ? h('span.muted', f.label.replace(/ \(input\)$/, '') + (num && f.unit ? ' · ' + (f.unit === 'pct' ? '%' : U.unitLabel(f.unit)) : '')) : null));
    // master checkbox: all listed elements on / off (respects the search)
    var master = h('input', { type: 'checkbox', title: 'Show / hide all listed elements', checked: shown.length > 0 && shownOff === 0, onchange: function () { setHidden(shown.map(function (r) { return r.it.id; }), !this.checked); } });
    master.indeterminate = shownOff > 0 && shownOff < shown.length;
    wrap.appendChild(h('div.btn-row',
      h('label.fly-all', master, shownOff === 0 ? 'All shown' : shownOff === shown.length ? 'All hidden' : (shown.length - shownOff) + ' / ' + shown.length),
      nOff ? h('button.btn.sm.ghost', { onclick: function () { upd(l.id, function (x) { x.hidden = []; }); } }, h('i.fa-solid.fa-rotate-left'), 'Show all') : null,
      h('span', { style: { flex: '1' } }),
      h('button.icon-btn', { title: 'Zoom to the listed elements', onclick: function () { zoomTo(shown.map(function (r) { return r.it; }), c); } }, h('i.fa-solid.fa-expand'))));
    var list = h('div.fly-rows');
    var MAX = 600;
    shown.slice(0, MAX).forEach(function (r) {
      var it = r.it, on = selectable && isSel(it);
      var dim = gp && ((it.kind === 'arc' && !gp.arc[it.i]) || (it.kind === 'node' && !it.agg && !gp.node[it.i]) || (it.kind === 'asset' && !gp.asset[it.i]));
      var val = !fid ? '' : typeof r.v === 'number' ? (isFinite(r.v) ? U.fmt(r.v, f && f.unit ? f.unit : 'count', { noUnit: true, sign: LY.isDelta(l, fid, ctx) }) : '–') : GV.t(String(r.v));
      var row = h('div.fly-row' + (on ? '.on' : '') + (dim ? '.dim' : '') + (r.off ? '.off' : ''), { title: r.name + (r.sub ? '\n' + r.sub : '') + (dim ? '\n(' + GV.t('outside the global filters') + ')' : '') },
        h('input', { type: 'checkbox', checked: !r.off, title: 'Show on the map', onclick: function (e) { e.stopPropagation(); }, onchange: function () { setHidden([it.id], !this.checked); } }),
        h('span.fly-sw', { style: { background: r.col } }),
        h('span.fly-nm', h('span', r.name), r.sub ? h('small', r.sub) : null),
        h('span.fly-v', val));
      row.addEventListener('click', function (e) {
        if (!selectable || r.off) { zoomTo([it], c); return; }
        if (e.ctrlKey || e.metaKey || e.shiftKey) st.select(it.kind, it.id, true);
        else { st.select(it.kind, it.id); GV.map.flyToElement(it.kind, it.id); }
      });
      list.appendChild(row);
    });
    if (!shown.length) list.appendChild(h('div.hint', { style: { padding: '12px' } }, rows.length ? 'No element matches the search.' : 'No element in this layer.'));
    if (shown.length > MAX) list.appendChild(h('div.hint', { style: { padding: '8px 12px' } }, 'Showing the first ' + MAX + '. Refine the search to see more.'));
    wrap.appendChild(list);
    wrap.appendChild(h('div.hint.fly-foot', 'Checkbox: show or hide the element in this layer · Click: select and go to · Ctrl/Shift+click: add to the selection.'));
    return wrap;
  }
  function zoomTo(items, c) {
    var pts = [], geom = GV.map.geom ? GV.map.geom() : [];
    items.forEach(function (it) {
      if (it.kind === 'ref') {
        var g = it.f.geometry; if (!g) return;
        (function walk(x) { if (typeof x[0] === 'number') pts.push(x); else x.forEach(walk); })(g.coordinates);
      } else if (it.kind === 'arc') { if (geom[it.i]) pts = pts.concat(geom[it.i]); }
      else { var n = it.kind === 'asset' ? c.node(c.assets[it.i].node) : c.nodes[it.i]; if (n && n.dlat !== null) pts.push([n.dlon, n.dlat]); }
    });
    if (pts.length) GV.map.map.fitBounds(U.bbox(pts), { padding: 60, maxZoom: 9, duration: 600 });
  }
  var refreshList = U.debounce(function () { if (fly.id && fly.mode === 'list') renderFlyout(); }, 60);

  // ================================================================ legend
  function renderLegend() {
    var body = U.$('#legend-body'); if (!body) return;
    U.clear(body);
    var c = A.current(); if (!c) return;
    var B = GV.map.builds() || {}, list = (st.get('layerList') || []).filter(function (l) { return l.visible && l.legend !== false && B[l.id]; });
    var ctx = LY.context();
    if (A.comparing()) body.appendChild(h('div.lg-cmp', A.compareLabel() + ' (current − reference)'));
    body.appendChild(h('div.lg-when', c.periodLabel(st.get('stage')) + ' · ' + GV.tooltip.blockLabel()));
    list.forEach(function (l) {
      var b = B[l.id], sec = h('div.lg-layer');
      sec.appendChild(h('div.lg-lhead', previewOf(l, b), h('b', l.name), h('span.n', b.count)));
      var cs = b.colorScale;
      if (l.shape === 'pie') {
        var pl = h('div.lg-sec', h('div.lg-title', 'Gas origin'));
        GV.config.sourceGroups.forEach(function (g) { pl.appendChild(h('div.lg-row', h('span.lg-sw', { style: { background: g.color, height: '9px', width: '12px' } }), g.label)); });
        sec.appendChild(pl);
      } else if (cs && cs.type !== 'fixed') sec.appendChild(colorLegend(l, cs, b));
      if (b.sizeScale && b.sizeScale.type === 'scaled') sec.appendChild(sizeLegend(l, b.sizeScale, 'size'));
      if (b.arrowScale && b.arrowScale.type === 'scaled') sec.appendChild(sizeLegend(l, b.arrowScale, 'arrows'));
      if ((l.filter || []).length) sec.appendChild(h('div.lg-note', 'Filter: ' + l.filter.map(function (r) { return LY.describeRule(l, r); }).join('; ')));
      if (l.labels.show && (l.labels.fields || []).length) sec.appendChild(h('div.lg-note', 'Labels: ' + l.labels.fields.map(function (fid) { var f = LY.field(l, fid); return f ? f.label.replace(/ \(input\)$/, '') : fid; }).join(' · ')));
      body.appendChild(sec);
    });
    if (!list.length) body.appendChild(h('div.hint', 'No visible layers.'));
    body.appendChild(h('div.lg-layer', h('div.lg-title', 'States'), h('div.lg-states',
      h('div.lg-row', h('span.lg-sw', { style: { background: '#26828C', height: '6px' } }), 'Selected'),
      h('div.lg-row', h('span.lg-sw', { style: { background: '#AB9671', height: '6px' } }), 'Highlighted'),
      h('div.lg-row', h('span.lg-sw', { style: { background: '#b4bcc8' } }), 'Out of service'),
      h('div.lg-row', h('span.lg-sw', { style: { background: '#64748b', opacity: 0.2 } }), 'Filtered out'))));
  }
  UI.renderLegend = renderLegend;
  function fieldTitle(f, delta) {
    var u = f.unit ? (f.unit === 'pct' ? '%' : U.unitLabel(f.unit)) : '';
    return h('div.lg-title', (delta ? 'Δ ' : '') + f.label.replace(/ \(input\)$/, '') + ' ', u ? h('span.u', u) : null);
  }
  function colorLegend(l, cs, b) {
    var box = h('div.lg-sec');
    if (cs.type === 'cat') {
      box.appendChild(fieldTitle(cs.field));
      cs.entries.forEach(function (e) { box.appendChild(h('div.lg-row', LY.geomKind(l) === 'line' ? h('span.lg-sw', { style: { background: e.color } }) : svgShape(l.shape || 'circle', 12, e.color, 'transparent'), e.label)); });
      return box;
    }
    if (cs.type === 'utilization') {
      box.appendChild(fieldTitle(cs.field));
      var bins = cs.bins, counts = bins.map(function () { return 0; });
      var seenE = {};
      b.main.forEach(function (f) {
        if (seenE[f.properties.eid]) return; seenE[f.properties.eid] = 1;
        var it = { kind: 'arc', id: f.properties.eid, i: A.current().arcIx[f.properties.eid] };
        var v = l.type === 'arc' ? LY.raw(l, l.color.field, it, A.current(), A.frame()) : NaN;
        var k = A.utilBinIndex(v); if (k >= 0) counts[k]++;
      });
      var active = (st.get('filters').filter(function (f) { return f.type === 'utilBin'; })[0] || {}).bin;
      bins.forEach(function (bn, i) {
        var lo = i ? Math.round(bins[i - 1].max * 100) : 0;
        var rng = bn.max === Infinity ? '> ' + lo + '%' : lo + '–' + Math.round(Math.min(bn.max, 1) * 100) + '%';
        box.appendChild(h('div.lg-row.click' + (active === i ? '.on' : ''), { title: 'Click to show only this class (global filter)', onclick: function () {
          var fl = st.get('filters').filter(function (f) { return f.type !== 'utilBin'; });
          if (active !== i) fl.push({ id: 'f-bin', type: 'utilBin', bin: i, label: 'Utilization ' + rng + ' (' + bn.label + ')' });
          st.set({ filters: fl });
        } }, h('span.lg-sw', { style: { background: bn.color } }), rng + ' ' + bn.label.toLowerCase(), l.type === 'arc' ? h('span.n', counts[i]) : null));
      });
      return box;
    }
    box.appendChild(fieldTitle(cs.field, cs.delta));
    box.appendChild(h('div.lg-grad', { style: { background: 'linear-gradient(90deg,' + cs.stops.join(',') + ')' } }));
    var o = unitOf(cs.field), d = cs.domain, dg = o.digits !== undefined ? o.digits : 1;
    box.appendChild(h('div.lg-ticks', h('span', U.fmtNum(d[0] * o.factor, dg)), h('span', U.fmtNum((d[0] + d[1]) / 2 * o.factor, dg)), h('span', U.fmtNum(d[1] * o.factor, dg))));
    return box;
  }
  function sizeLegend(l, ss, key) {
    var box = h('div.lg-sec'), o = unitOf(ss.field);
    var t = fieldTitle(ss.field);
    t.insertBefore(document.createTextNode(key === 'arrows' ? 'Arrows: ' : LY.geomKind(l) === 'line' ? 'Width: ' : 'Size: '), t.firstChild);
    box.appendChild(t);
    var row = h('div.lg-widths');
    [0.1, 0.4, 1].forEach(function (f) {
      var v = ss.max * f, px = ss.size(v), lab = U.fmtNum(v * o.factor, o.digits > 1 ? 1 : 0);
      var ico;
      if (key === 'arrows') ico = h('span.shape-ico', { html: '<svg width="' + (14 * px + 4) + '" height="' + (12 * px + 2) + '"><polygon points="2,1 ' + (14 * px) + ',' + (6 * px + 1) + ' 2,' + (12 * px + 1) + '" fill="#475569"/></svg>' });
      else if (LY.geomKind(l) === 'line') ico = h('i', { style: { height: px + 'px', width: '28px' } });
      else ico = svgShape(l.shape || 'circle', Math.max(6, px), '#94a3b8', 'transparent');
      row.appendChild(h('div', ico, lab));
    });
    box.appendChild(row);
    return box;
  }
})();
