/*
 * Saved views and map annotations.
 *
 * A view stores the layers and their styles, trace mode, basemap, period / scenario / block,
 * comparison, global filters, map position and annotations. Views can be:
 *   - built in (js/config.js, "views"),
 *   - team views (files data/*.view.js listed in data/library.js, calling GV.registerView),
 *   - my views (saved in this browser), and exported / imported as .view.json files.
 * Annotations are text notes pinned on the map; they are part of the view.
 */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, C = GV.config, h = U.h;
  var V = GV.views = { team: [] };

  // ---------------------------------------------------------------- capture / apply
  V.capture = function (name, opts) {
    opts = opts || {};
    var c = A.current();
    var v = {
      format: 'gv-view', version: 1, name: name || 'View', createdAt: new Date().toISOString(),
      caseName: c ? c.name : null,
      layerList: JSON.parse(JSON.stringify(st.get('layerList') || [])),
      geomMode: st.get('geomMode'), basemap: st.get('basemap'), admin: st.get('admin'), lockScale: st.get('lockScale'),
      filters: JSON.parse(JSON.stringify(st.get('filters') || []))
    };
    if (opts.time !== false) { v.stage = st.get('stage'); v.seq = st.get('seq'); v.block = st.get('block'); v.compare = st.get('compare'); }
    if (opts.map !== false) v.mapView = GV.map.view();
    if (opts.notes !== false) v.notes = JSON.parse(JSON.stringify(st.get('notes') || []));
    return v;
  };
  V.apply = function (v) {
    var patch = { layerList: (v.layerList || []).map(GV.layers.make), view: 'saved:' + v.name };
    ['geomMode', 'basemap', 'admin', 'lockScale', 'filters'].forEach(function (k) { if (v[k] !== undefined) patch[k] = v[k]; });
    if (v.caseName) { var c = A.cases.filter(function (x) { return x.name === v.caseName; })[0]; if (c && c !== A.current()) A.activate(c.id); }
    var c2 = A.current();
    if (v.stage !== undefined && c2) { patch.stage = Math.min(v.stage, c2.nS - 1); patch.seq = v.seq || 0; patch.block = v.block === undefined ? -1 : v.block; patch.compare = v.compare || { mode: 'off' }; }
    if (v.notes) patch.notes = v.notes;
    st.set(patch);
    if (v.mapView) GV.map.setView(v.mapView);
    U.toast('View “' + v.name + '” applied');
  };

  // ---------------------------------------------------------------- stores
  V.mine = function () { return U.store.get('myViews', []); };
  V.saveMine = function (v) {
    var list = V.mine().filter(function (x) { return x.name !== v.name; });
    list.push(v); U.store.set('myViews', list);
    st.set({ viewsVersion: (st.get('viewsVersion') || 0) + 1 });
  };
  V.deleteMine = function (name) {
    U.store.set('myViews', V.mine().filter(function (x) { return x.name !== name; }));
    st.set({ viewsVersion: (st.get('viewsVersion') || 0) + 1 });
  };
  GV.registerView = function (v) {
    V.team = V.team.filter(function (x) { return x.name !== v.name; }).concat([v]);
    st.set({ viewsVersion: (st.get('viewsVersion') || 0) + 1 });
  };
  /** All views for menus: [{ group, id, label }] ; id prefixes: builtin:, team:, mine: */
  V.all = function () {
    var out = C.views.map(function (v) { return { group: 'Built-in', id: v.id, label: v.label }; });
    V.team.forEach(function (v) { out.push({ group: 'Team views', id: 'team:' + v.name, label: v.name }); });
    V.mine().forEach(function (v) { out.push({ group: 'My views', id: 'mine:' + v.name, label: v.name }); });
    return out;
  };
  V.applyId = function (id) {
    if (id.indexOf('team:') === 0) { var t = V.team.filter(function (x) { return 'team:' + x.name === id; })[0]; if (t) V.apply(t); return; }
    if (id.indexOf('mine:') === 0) { var m = V.mine().filter(function (x) { return 'mine:' + x.name === id; })[0]; if (m) V.apply(m); return; }
    GV.layers.applyView(id);
  };
  V.currentId = function () {
    var v = st.get('view') || '';
    return v.indexOf('saved:') === 0 ? (V.team.some(function (x) { return 'saved:' + x.name === v; }) ? 'team:' + v.slice(6) : 'mine:' + v.slice(6)) : v;
  };
  /** Fills a <select> with every view, grouped. */
  V.fillSelect = function (sel) {
    U.clear(sel);
    var cur = V.currentId(), groups = {};
    V.all().forEach(function (v) { (groups[v.group] = groups[v.group] || []).push(v); });
    var known = V.all().some(function (v) { return v.id === cur; });
    if (!known) sel.appendChild(h('option', { value: '', selected: true }, 'Custom (edited)'));
    Object.keys(groups).forEach(function (g) {
      var og = h('optgroup', { label: g });
      groups[g].forEach(function (v) { og.appendChild(h('option', { value: v.id, selected: v.id === cur }, v.label)); });
      sel.appendChild(og);
    });
    sel.onchange = function () { if (sel.value) V.applyId(sel.value); };
  };

  // ---------------------------------------------------------------- dialogs
  function slug(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'view'; }
  V.saveDialog = function () {
    var name = h('input', { type: 'text', value: '', placeholder: 'e.g. Congestion NE – Aug 2032', style: { width: '100%' } });
    var cT = h('input', { type: 'checkbox', checked: true }), cM = h('input', { type: 'checkbox', checked: true }), cN = h('input', { type: 'checkbox', checked: true });
    GV.ui.modal(h('div', h('h2', 'Save view'),
      h('p.muted.small', 'Saves the layers and their styles, trace mode, basemap and global filters. Optionally also the period, the map position and the annotations.'),
      h('label.field', { style: { gridTemplateColumns: '60px 1fr' } }, h('span', 'Name'), name),
      h('label.check', cT, 'Period, scenario, block and comparison'),
      h('label.check', cM, 'Map position'),
      h('label.check', cN, 'Annotations (' + (st.get('notes') || []).length + ')'),
      h('div.modal-actions',
        h('button.btn', { onclick: function () {
          if (!name.value.trim()) { name.focus(); return; }
          var v = V.capture(name.value.trim(), { time: cT.checked, map: cM.checked, notes: cN.checked });
          U.download(slug(v.name) + '.view.json', JSON.stringify(v, null, 1), 'application/json');
        } }, 'Download file…'),
        h('button.btn.primary', { onclick: function () {
          if (!name.value.trim()) { name.focus(); return; }
          var v = V.capture(name.value.trim(), { time: cT.checked, map: cM.checked, notes: cN.checked });
          V.saveMine(v); st.set({ view: 'saved:' + v.name }); GV.ui.closeModal(); U.toast('Saved in “My views”');
        } }, 'Save in My views'))));
    setTimeout(function () { name.focus(); }, 50);
  };
  V.manageDialog = function () {
    var box = h('div', h('h2', 'Views'));
    function list(title, items, mine) {
      box.appendChild(h('h3', { style: { fontSize: '12px', textTransform: 'uppercase', color: 'var(--muted)', margin: '12px 0 4px' } }, title));
      if (!items.length) { box.appendChild(h('div.hint', mine ? 'No saved views yet. Use “Save view…”.' : 'None. Add .view.js files to data/ and list them in data/library.js.')); return; }
      var t = h('table');
      items.forEach(function (v) {
        t.appendChild(h('tr',
          h('td', h('b', v.name), h('div.small.muted', (v.caseName || 'any case') + ' · ' + (v.layerList || []).length + ' layers' + (v.notes && v.notes.length ? ' · ' + v.notes.length + ' notes' : '') + ' · ' + (v.createdAt || '').slice(0, 10))),
          h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
            h('button.btn.sm', { onclick: function () { GV.ui.closeModal(); V.apply(v); } }, 'Apply'), ' ',
            h('button.btn.sm', { title: 'Download as file to share', onclick: function () { U.download(slug(v.name) + '.view.json', JSON.stringify(v, null, 1), 'application/json'); } }, '.json'), ' ',
            h('button.btn.sm', { title: 'Team-library file for the data folder', onclick: function () { U.download(slug(v.name) + '.view.js', 'GV.registerView(' + JSON.stringify(v) + ');\n', 'text/javascript'); } }, '.js'), ' ',
            mine ? h('button.btn.sm', { onclick: function () { V.deleteMine(v.name); GV.ui.closeModal(); V.manageDialog(); } }, 'Delete') : null)));
      });
      box.appendChild(t);
    }
    list('My views (this browser)', V.mine(), true);
    list('Team views (data folder)', V.team, false);
    box.appendChild(h('p.muted.small', { style: { marginTop: '12px' } }, 'To share a view with the team: download the .js file, copy it into the app’s data folder and add its path to data/library.js. A .json file can be opened by anyone with Open case → Dataset / file.'));
    GV.ui.modal(box);
  };

  // ---------------------------------------------------------------- annotations
  var markers = {};
  V.initNotes = function () {
    st.set({ notes: U.store.get('notes', []) });
    st.on('notes', function () { U.store.set('notes', st.get('notes')); renderNotes(); });
    st.on('theme', renderNotes);
    renderNotes();
  };
  V.addNoteMode = function () {
    st.set({ pick: { action: 'note' } });
    U.toast('Click on the map to place the note (Esc to cancel)');
  };
  V.addNoteAt = function (lngLat) {
    st.set({ pick: null });
    V.editNote({ id: 'n' + Date.now().toString(36), lng: +lngLat.lng.toFixed(5), lat: +lngLat.lat.toFixed(5), text: '', color: '#AB9671' }, true);
  };
  V.editNote = function (note, isNew) {
    var ta = h('textarea', { rows: 4, style: { width: '100%', font: 'inherit', padding: '6px', borderRadius: '5px', border: '1px solid var(--line-2)', background: 'var(--panel)', color: 'var(--text)' } }, note.text);
    var colors = ['#AB9671', '#dc2626', '#26828C', '#15803d', '#122945', '#706F6F'], chosen = note.color;
    var sw = h('div.chipset');
    colors.forEach(function (col) {
      var b = h('button', { style: { width: '22px', height: '22px', borderRadius: '50%', border: col === chosen ? '3px solid var(--text)' : '1px solid var(--line-2)', background: col, cursor: 'pointer' } });
      b.onclick = function () { chosen = col; Array.prototype.forEach.call(sw.children, function (x) { x.style.border = '1px solid var(--line-2)'; }); b.style.border = '3px solid var(--text)'; };
      sw.appendChild(b);
    });
    GV.ui.modal(h('div', h('h2', isNew ? 'New annotation' : 'Edit annotation'), ta, h('div', { style: { margin: '8px 0' } }, sw),
      h('div.modal-actions',
        !isNew ? h('button.btn', { onclick: function () { st.set({ notes: (st.get('notes') || []).filter(function (n) { return n.id !== note.id; }) }); GV.ui.closeModal(); } }, 'Delete') : null,
        h('button.btn.primary', { onclick: function () {
          var txt = ta.value.trim(); if (!txt) { ta.focus(); return; }
          var list = (st.get('notes') || []).filter(function (n) { return n.id !== note.id; });
          list.push(Object.assign({}, note, { text: txt, color: chosen }));
          st.set({ notes: list }); GV.ui.closeModal();
        } }, 'Save'))));
    setTimeout(function () { ta.focus(); }, 50);
  };
  function renderNotes() {
    var map = GV.map.map; if (!map) return;
    var notes = st.get('notes') || [], ids = {};
    notes.forEach(function (n) {
      ids[n.id] = 1;
      var m = markers[n.id];
      if (!m) {
        var el = h('div.note-pin');
        m = markers[n.id] = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom-left' }).setLngLat([n.lng, n.lat]).addTo(map);
        m.on('dragend', function () {
          var ll = m.getLngLat();
          st.set({ notes: (st.get('notes') || []).map(function (x) { return x.id === n.id ? Object.assign({}, x, { lng: +ll.lng.toFixed(5), lat: +ll.lat.toFixed(5) }) : x; }) });
        });
        el.addEventListener('dblclick', function (e) { e.stopPropagation(); var cur = (st.get('notes') || []).filter(function (x) { return x.id === n.id; })[0]; if (cur) V.editNote(cur); });
        el.addEventListener('click', function (e) { e.stopPropagation(); });
      }
      var el2 = m.getElement();
      U.clear(el2);
      el2.appendChild(h('div.note-box', { style: { borderColor: n.color }, title: 'Drag to move · double-click to edit' }, h('span.note-dot', { style: { background: n.color } }), n.text));
      el2.style.setProperty('--note', n.color);
      m.setLngLat([n.lng, n.lat]);
    });
    Object.keys(markers).forEach(function (id) { if (!ids[id]) { markers[id].remove(); delete markers[id]; } });
  }
  V.renderNotes = renderNotes;
})();
