/* Toolbar, filters panel, timeline, chips, KPIs, panel toggles, shortcuts, view links. */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, C = GV.config, h = U.h;
  var UI = GV.ui = GV.ui || {};

  // =============== toolbar ===============
  UI.initToolbar = function () {
    var sCase = U.$('#dim-case'), sSeq = U.$('#dim-seq'), sStage = U.$('#dim-stage'), sBlock = U.$('#dim-block'), sPreset = U.$('#dim-preset'), sCmp = U.$('#dim-compare');
    sCase.onchange = function () { A.activate(sCase.value); };
    sSeq.onchange = function () { st.set({ seq: +sSeq.value }); };
    sStage.onchange = function () { st.set({ stage: +sStage.value }); };
    sBlock.onchange = function () { st.set({ block: +sBlock.value }); };
    sPreset.onchange = function () { if (sPreset.value !== 'custom') GV.layers.applyView(sPreset.value); };
    sCmp.onchange = function () {
      var v = sCmp.value;
      if (v === 'off') st.set({ compare: { mode: 'off' } });
      else if (v === 'prev') st.set({ compare: { mode: 'stage', stage: Math.max(0, st.get('stage') - 1), follow: -1 } });
      else if (v.indexOf('s:') === 0) st.set({ compare: { mode: 'stage', stage: +v.slice(2) } });
      else if (v.indexOf('c:') === 0) st.set({ compare: { mode: 'case', caseId: v.slice(2) } });
    };

    function fill() {
      var c = A.current();
      U.clear(sCase);
      A.cases.forEach(function (x) { sCase.appendChild(h('option', { value: x.id, selected: c && x.id === c.id }, x.name)); });
      sCase.disabled = !A.cases.length;
      U.clear(sSeq); U.clear(sStage); U.clear(sBlock); U.clear(sCmp);
      if (!c) return;
      for (var q = 0; q < c.nQ; q++) sSeq.appendChild(h('option', { value: q }, 'Scenario ' + (q + 1)));
      if (c.nQ > 1) GV.SEQ_CODES.forEach(function (o) { sSeq.appendChild(h('option', { value: o.code }, o.label)); });
      U.$('#dim-seq-wrap').hidden = c.nQ <= 1;
      c.time.periods.forEach(function (p, i) { sStage.appendChild(h('option', { value: i }, p.label)); });
      sBlock.appendChild(h('option', { value: -1 }, c.nB > 1 ? 'All (hours-weighted)' : 'Single block'));
      for (var b = 0; b < c.nB; b++) sBlock.appendChild(h('option', { value: b }, 'Block ' + (b + 1)));
      sCmp.appendChild(h('option', { value: 'off' }, 'Off'));
      sCmp.appendChild(h('option', { value: 'prev' }, 'vs previous period'));
      var g1 = h('optgroup', { label: 'vs period' });
      c.time.periods.forEach(function (p, i) { g1.appendChild(h('option', { value: 's:' + i }, 'vs ' + p.label)); });
      sCmp.appendChild(g1);
      if (A.cases.length > 1) {
        var g2 = h('optgroup', { label: 'vs case' });
        A.cases.forEach(function (x) { if (x.id !== c.id) g2.appendChild(h('option', { value: 'c:' + x.id }, 'vs ' + x.name)); });
        sCmp.appendChild(g2);
      }
      sync();
    }
    function sync() {
      var c = A.current(); if (!c) return;
      sSeq.value = st.get('seq'); sStage.value = st.get('stage'); sBlock.value = st.get('block');
      var cmp = st.get('compare');
      sCmp.value = cmp.mode === 'off' ? 'off' : cmp.follow ? 'prev' : cmp.mode === 'stage' ? 's:' + cmp.stage : 'c:' + cmp.caseId;
      U.clear(sPreset);
      GV.views.fillSelect(sPreset);
    }
    st.on('casesVersion caseId', fill);
    st.on('stage seq block compare view viewsVersion', sync);
    // "vs previous period" follows the current period
    st.on('stage', function () {
      var cmp = st.get('compare');
      if (cmp.follow) st.set({ compare: { mode: 'stage', stage: Math.max(0, st.get('stage') + cmp.follow), follow: cmp.follow } });
    });
    fill();

    var mo = U.$('#menu-open');
    U.$('#btn-open').onclick = function (e) { e.stopPropagation(); mo.hidden = !mo.hidden; };
    mo.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      mo.hidden = true;
      GV.loader.menu(b.dataset.open);
    });
    document.addEventListener('click', function (e) { if (!mo.contains(e.target)) mo.hidden = true; });

    U.$('#btn-theme').onclick = function () {
      var cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      UI.setTheme(cur, true);
    };
    U.$('#btn-share').onclick = function () {
      var url = location.href.split('#')[0] + '#' + UI.viewHash();
      U.copy(url);
    };
    U.$('#btn-help').onclick = UI.help;

    // panels menu
    var mp = U.$('#menu-panels');
    U.$('#btn-panels').onclick = function (e) {
      e.stopPropagation();
      U.clear(mp);
      mp.appendChild(h('div.menu-h', 'Panels'));
      GV.dock.list().forEach(function (p) {
        mp.appendChild(h('button' + (p.open ? '.checked' : ''), { onclick: function () { mp.hidden = true; GV.dock.toggle(p.id); } }, p.title));
      });
      mp.appendChild(h('div.menu-sep'));
      mp.appendChild(h('button', { onclick: function () { mp.hidden = true; GV.dock.reset(); } }, h('i.fa-solid.fa-rotate-left'), 'Reset panel layout'));
      mp.appendChild(h('button', { onclick: function () { mp.hidden = true; GV.settings.open(); } }, h('i.fa-solid.fa-gear'), 'Preferences…'));
      mp.hidden = !mp.hidden;
    };
    document.addEventListener('click', function (e) { if (!mp.contains(e.target)) mp.hidden = true; });
    U.$('#btn-left').onclick = function () { GV.dock.toggleDock('left'); };
    U.$('#btn-right').onclick = function () { GV.dock.toggleDock('right'); };
    U.$('#btn-bottom').onclick = function () { GV.dock.toggleDock('bottom'); };
    U.$('#btn-maponly').onclick = function () { GV.dock.mapOnly(); };
    U.$('#btn-note').onclick = function () { GV.views.addNoteMode(); };
    U.$('#btn-export').onclick = function () { GV.exporter.dialog(); };
    U.$('#btn-settings').onclick = function () { GV.settings.open(); };
  };

  UI.step = function (d) {
    var c = A.current(); if (!c) return;
    var s = Math.max(0, Math.min(c.nS - 1, st.get('stage') + d));
    st.set({ stage: s });
  };

  UI.setTheme = function (theme, explicit) {
    document.documentElement.dataset.theme = theme;
    if (explicit) U.store.set('theme', theme);
    // follow the theme with the basemap unless the user picked satellite / terrain / none
    var b = st.get('basemap');
    if (b === 'light' || b === 'dark') st.set({ basemap: theme === 'dark' ? 'dark' : 'light' });
    st.set({ theme: theme });
  };

  // =============== search ===============
  UI.initSearch = function () {
    var inp = U.$('#search'), box = U.$('#search-results'), items = [], active = 0;
    function render() {
      U.clear(box);
      items = GV.search.query(inp.value, 14);
      if (!inp.value.trim()) { box.hidden = true; return; }
      if (!items.length) { box.appendChild(h('div.sr-item', h('span.sr-sub', 'No matches'))); box.hidden = false; return; }
      items.forEach(function (it, i) {
        box.appendChild(h('div.sr-item' + (i === active ? '.active' : ''), { onmousedown: function (e) { e.preventDefault(); choose(i); } },
          h('span.sr-name', it.name), h('span.sr-type', it.type), h('span.sr-sub', it.id + ' · ' + it.sub)));
      });
      box.hidden = false;
    }
    function choose(i) { var it = items[i]; if (!it) return; GV.search.go(it); inp.blur(); box.hidden = true; }
    inp.addEventListener('input', function () { active = 0; render(); });
    inp.addEventListener('focus', render);
    inp.addEventListener('blur', function () { setTimeout(function () { box.hidden = true; }, 120); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') choose(active);
      else if (e.key === 'Escape') { inp.value = ''; box.hidden = true; inp.blur(); }
    });
  };

  // =============== filters panel (global filters: fade elements on the map, remove rows from tables) ===============
  UI.initFilters = function () {
    st.on('filters caseId casesVersion stage seq block units', function (ch) {
      // do not rebuild while the user is typing in a value / name box of this panel
      var ae = document.activeElement;
      if (ae && ae.closest && ae.closest('#filters-body') && ae.tagName === 'INPUT' && /^(text|number)$/.test(ae.type) && ch.length === 1 && ch[0] === 'filters') return;
      render();
    });
    function render() { var body = U.$('#filters-body'); if (!body) return; var sc = body.scrollTop; U.clear(body); renderFilters(body); body.scrollTop = sc; }
    UI.renderFilters = render;
    render();
  };

  function renderFilters(body) {
    var c = A.current(); if (!c) return;
    var filters = st.get('filters');
    // always read the current filters at click time (the panel is not rebuilt while a control has focus)
    function cur() { return st.get('filters') || []; }
    function get(id) { return cur().filter(function (f) { return f.id === id; })[0]; }
    function put(f) { GV.actions.addFilter(f); }
    function drop(ids) { ids = [].concat(ids); st.set({ filters: cur().filter(function (f) { return ids.indexOf(f.id) < 0; }) }); }
    function resetBtn(ids) {
      var has = cur().some(function (f) { return [].concat(ids).indexOf(f.id) >= 0; });
      return has ? h('button.reset-link', { title: 'Reset this filter', onclick: function () { drop(ids); } }, h('i.fa-solid.fa-rotate-left'), 'Reset') : null;
    }

    // header: always-visible reset
    body.appendChild(h('div.flt-head',
      h('div', h('b', filters.length ? filters.length + ' active filter(s)' : 'No active filters'), h('div.hint', { style: { margin: 0 } }, 'Filtered-out elements stay faintly visible on the map and are removed from tables.')),
      h('button.btn.sm' + (filters.length ? '.primary' : ''), { disabled: !filters.length, onclick: function () { st.set({ filters: [] }); } }, h('i.fa-solid.fa-rotate-left'), 'Reset all')));
    if (filters.length) {
      var act = h('div.sec');
      filters.forEach(function (f) { act.appendChild(h('div.chip.filter', { style: { margin: '2px 0', boxShadow: 'none' } }, h('span.t', f.label), h('button', { title: 'Remove', onclick: function () { drop(f.id); } }, h('i.fa-solid.fa-xmark')))); });
      body.appendChild(act);
    }

    // toggles
    function togSet(id, label, all, labelOf, type) {
      var f = get(id), on = f ? f.values : all.slice();
      var box = h('div.chipset');
      all.forEach(function (v) {
        box.appendChild(h('button.tog' + (on.indexOf(v) >= 0 ? '.on' : ''), { onclick: function () {
          var cf = get(id), now = cf ? cf.values : all.slice();
          var nv = now.indexOf(v) >= 0 ? now.filter(function (x) { return x !== v; }) : now.concat([v]);
          if (nv.length === all.length || !nv.length) drop(id);
          else put({ id: id, type: type, values: nv, label: label + ': ' + nv.map(labelOf).join(', ') });
        } }, labelOf(v)));
      });
      return h('div.sec', h('div.sec-h', label, resetBtn(id)), box);
    }
    body.appendChild(togSet('f-region', 'Region', c.ds.regions.map(function (r) { return r.id; }), function (v) { var r = c.ds.regions.filter(function (x) { return x.id === v; })[0]; return r ? r.name : v; }, 'region'));
    var kinds = ['pipeline', 'maritime', 'regas'].filter(function (k) { return c.arcs.some(function (a) { return a.kind === k; }); });
    body.appendChild(togSet('f-kind', 'Arc type', kinds, function (k) { return C.elementTypes[k].plural; }, 'arcKind'));
    var atypes = Object.keys(C.elementTypes).filter(function (k) { return C.elementTypes[k].group === 'asset' && c.assets.some(function (a) { return a.type === k; }); });
    body.appendChild(togSet('f-atype', 'Nodes with asset type', atypes, function (k) { return C.elementTypes[k].plural; }, 'assetType'));

    // numeric ranges
    function rangeSec(id, label, kind, v, unit, opts) {
      opts = opts || {};
      var f = get(id), o = U.unitOpt(unit);
      var lo = h('input', { type: 'number', placeholder: 'min', value: f && f.min !== null && f.min !== undefined ? +(f.min * o.factor).toFixed(4) : '' });
      var hi = h('input', { type: 'number', placeholder: 'max', value: f && f.max !== null && f.max !== undefined ? +(f.max * o.factor).toFixed(4) : '' });
      function apply() {
        var a = lo.value === '' ? null : +lo.value / o.factor, b = hi.value === '' ? null : +hi.value / o.factor;
        if (a === null && b === null) { drop(id); return; }
        put({ id: id, type: 'range', kind: kind, var: v, abs: opts.abs, min: a, max: b,
          label: label + ' ' + (a !== null && b !== null ? U.fmtNum(a * o.factor) + '–' + U.fmtNum(b * o.factor) : a !== null ? '≥ ' + U.fmtNum(a * o.factor) : '≤ ' + U.fmtNum(b * o.factor)) + (unit === 'pct' ? '%' : ' ' + o.label) });
      }
      lo.onchange = apply; hi.onchange = apply;
      return h('div', h('div.field', h('span', label + (unit === 'pct' ? ' (%)' : ' (' + o.label + ')')), h('div.range-row', lo, hi)));
    }
    body.appendChild(h('div.sec', h('div.sec-h', 'Values (current period)', resetBtn(['f-util', 'f-flow', 'f-cap', 'f-cmg', 'f-dem'])),
      rangeSec('f-util', 'Utilization', 'arc', 'util', 'pct'),
      rangeSec('f-flow', 'Flow', 'arc', 'absFlow', 'flow'),
      rangeSec('f-cap', 'Capacity', 'arc', 'capacity', 'flow'),
      rangeSec('f-cmg', 'Marginal cost', 'node', 'cmg', 'price'),
      rangeSec('f-dem', 'Withdrawal', 'node', 'withdrawal', 'flow')
    ));
    var fv = get('f-viol'), fs = get('f-svc');
    body.appendChild(h('div.sec', h('div.sec-h', 'Status', resetBtn(['f-viol', 'f-svc'])),
      h('label.check', h('input', { type: 'checkbox', checked: !!fv, onchange: function () { if (this.checked) put({ id: 'f-viol', type: 'violation', label: 'Violations / deficits only' }); else drop('f-viol'); } }), 'Only capacity violations and deficits'),
      h('label.check', h('input', { type: 'checkbox', checked: !!fs, onchange: function () { if (this.checked) put({ id: 'f-svc', type: 'inService', label: 'In service only' }); else drop('f-svc'); } }), 'Only arcs in service in this period')
    ));
    var ft = get('f-text');
    var ti = h('input', { type: 'text', placeholder: 'e.g. GASBOL, N13, UTE', value: ft ? ft.q : '', style: { width: '100%' } });
    ti.addEventListener('input', U.debounce(function () {
      if (!ti.value.trim()) drop('f-text'); else put({ id: 'f-text', type: 'text', q: ti.value.trim(), label: 'Name/ID contains “' + ti.value.trim() + '”' });
    }, 250));
    body.appendChild(h('div.sec', h('div.sec-h', 'Name or ID', resetBtn('f-text')), ti));
  }

  // =============== chips (active filters, highlight, picking, comparison) ===============
  UI.initChips = function () {
    function render() {
      var box = U.clear(U.$('#chips'));
      var pick = st.get('pick');
      if (pick) box.appendChild(h('div.chip.pick', h('span.t', pick.action === 'path' ? 'Pick destination node…' : pick.action === 'note' ? 'Click on the map to place the note…' : 'Pick element to compare…'), h('button', { style: { color: '#fff' }, onclick: function () { st.set({ pick: null }); } }, h('i.fa-solid.fa-xmark'))));
      if (A.comparing()) box.appendChild(h('div.chip.cmp', h('span.t', h('b', 'Comparison '), A.compareLabel().replace('Δ ', '')), h('button', { onclick: function () { st.set({ compare: { mode: 'off' } }); } }, h('i.fa-solid.fa-xmark'))));
      var hl = st.get('highlight');
      if (hl) box.appendChild(h('div.chip.hl', h('span.t', h('b', 'Highlight '), hl.label), h('button', { onclick: function () { st.set({ highlight: null }); } }, h('i.fa-solid.fa-xmark'))));
      st.get('filters').forEach(function (f) {
        box.appendChild(h('div.chip.filter', h('span.t', f.label), h('button', { title: 'Remove filter', onclick: function () { st.set({ filters: st.get('filters').filter(function (x) { return x !== f; }) }); } }, h('i.fa-solid.fa-xmark'))));
      });
      if (st.get('filters').length > 1) box.appendChild(h('div.chip.filter.chip-reset', h('button.reset-all', { title: 'Remove every filter', onclick: function () { st.set({ filters: [] }); } }, h('i.fa-solid.fa-rotate-left'), ' Reset filters')));
      var sel = st.get('selection');
      if (sel.length > 1) box.appendChild(h('div.chip', h('span.t', h('b', sel.length + ' selected')), h('button', { onclick: function () { st.set({ selection: [] }); } }, h('i.fa-solid.fa-xmark'))));
    }
    st.on('filters highlight pick compare selection caseId', render);
  };

  // =============== KPIs ===============
  UI.initKpis = function () {
    function render() {
      var box = U.clear(U.$('#kpis')), c = A.current();
      box.hidden = !c || !c.hasResults;
      if (!c || !c.hasResults) return;
      var F = A.frame(), sup = 0, dem = 0, def = 0, cong = 0, viol = 0, cm = [];
      c.nodes.forEach(function (n, i) { sup += F.node.production[i] + F.node.lng[i]; dem += F.node.citygate[i] + F.node.thermal[i]; def += F.node.deficit[i]; if (F.node.cmg[i] > 0) cm.push(F.node.cmg[i]); });
      c.arcs.forEach(function (a, i) { var u = F.arc.util[i]; if (u >= 0.95) cong++; if (u > 1.0001) viol++; });
      function k(label, val, cls, onclick, title) { box.appendChild(h('div.k' + (cls ? '.' + cls : ''), { onclick: onclick, title: title, style: { cursor: onclick ? 'pointer' : 'default' } }, h('b', val), h('span', label))); }
      k('Supply', U.fmt(sup, 'flow'), null, null, 'Production + LNG supply');
      k('Demand', U.fmt(dem, 'flow'), null, null, 'City-gates + thermal plants');
      k('Arcs ≥ 95%', cong, cong ? 'warn' : null, function () { GV.actions.addFilter({ id: 'f-util', type: 'range', kind: 'arc', var: 'util', min: 0.95, max: null, label: 'Utilization ≥ 95%' }); }, 'Click to filter');
      k('Violations', viol, viol ? 'bad' : null, viol ? function () { GV.actions.addFilter({ id: 'f-viol', type: 'violation', label: 'Violations / deficits only' }); } : null);
      if (def > 1e-3) k('Deficit', U.fmt(def, 'flow'), 'bad');
      if (cm.length) k('Marginal cost', U.fmt(Math.min.apply(null, cm), 'price', { noUnit: true }) + '–' + U.fmt(Math.max.apply(null, cm), 'price'), null, null, 'Min–max over nodes with positive marginal cost');
    }
    st.on('caseId stage seq block units casesVersion', render);
    render();
  };

  // =============== timeline ===============
  var playTimer = null;
  UI.initTimeline = function () {
    var el = U.$('#timeline');
    var speed = U.store.get('speed', 900);
    var drag = { on: false, idxAt: null };
    window.addEventListener('mousemove', function (e) { if (drag.on && drag.idxAt) st.set({ stage: drag.idxAt(e) }); });
    window.addEventListener('mouseup', function () { drag.on = false; });
    function render() {
      // the period and block selectors live in this bar (persistent elements, re-attached on each render)
      var period = U.$('#tl-period'), block = U.$('#tl-block');
      U.clear(el);
      var c = A.current(); el.hidden = !c; if (!c) return;
      var s = st.get('stage'), n = c.nS, rng = st.get('range'), multi = n > 1;
      el.classList.toggle('single', !multi);
      if (multi) {
        el.appendChild(h('div.tl-play',
          h('button.icon-btn', { title: 'Previous period (←)', disabled: s <= 0, onclick: function () { UI.step(-1); } }, h('i.fa-solid.fa-backward-step')),
          h('button.icon-btn.tl-pp', { title: playTimer ? 'Pause (Space)' : 'Play (Space)', onclick: UI.togglePlay }, h(playTimer ? 'i.fa-solid.fa-pause' : 'i.fa-solid.fa-play')),
          h('button.icon-btn', { title: 'Next period (→)', disabled: s >= n - 1, onclick: function () { UI.step(1); } }, h('i.fa-solid.fa-forward-step'))));
      }
      if (!multi) { el.appendChild(block); return; }
      el.appendChild(period);
      var track = h('div.tl-track', { title: 'Click: go to period · Shift+click: set analysis range' });
      function x(i) { return 'calc(6px + (100% - 12px) * ' + (n > 1 ? i / (n - 1) : 0) + ')'; }
      track.appendChild(h('div.tl-axis'));
      // sparkline: arcs at >= 95% per period
      var spark = h('div.tl-spark'), counts = [], mx = 1;
      for (var i = 0; i < n; i++) {
        var F = c.frame(st.sel({ stage: i })), k = 0;
        for (var j = 0; j < F.arc.util.length; j++) if (F.arc.util[j] >= 0.95) k++;
        counts.push(k); mx = Math.max(mx, k);
      }
      counts.forEach(function (k, i) {
        if (!k) return;
        spark.appendChild(h('div', { title: k + ' arcs ≥ 95% in ' + c.periodLabel(i), style: { position: 'absolute', left: x(i), bottom: '0', width: '5px', marginLeft: '-2.5px', height: Math.max(2, 11 * k / mx) + 'px', background: '#e3642f', opacity: 0.7, borderRadius: '1px' } }));
      });
      track.appendChild(spark);
      if (rng) track.appendChild(h('div.tl-range', { style: { left: x(rng[0]), width: 'calc((100% - 12px) * ' + (rng[1] - rng[0]) / Math.max(1, n - 1) + ')' } }));
      var every = Math.ceil(n / 14);
      c.time.periods.forEach(function (p, i) {
        track.appendChild(h('div.tl-tick', { style: { left: x(i) } }));
        var isYear = p.month === 1 || i === 0;
        if (i % every === 0 || (isYear && n <= 60)) track.appendChild(h('div.tl-lab' + (isYear ? '.year' : ''), { style: { left: x(i) } }, isYear && n > 12 ? String(p.year) : p.short));
      });
      track.appendChild(h('div.tl-knob', { style: { left: x(s) } }));
      drag.idxAt = function (e) { var r = track.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - 6) / (r.width - 12) * (n - 1)))); };
      track.addEventListener('mousedown', function (e) {
        var i = drag.idxAt(e);
        if (e.shiftKey) { st.set({ range: [Math.min(s, i), Math.max(s, i)] }); return; }
        drag.on = true; st.set({ stage: i });
      });
      el.appendChild(track);
      if (rng) el.appendChild(h('button.btn.sm', { title: 'Clear analysis range', onclick: function () { st.set({ range: null }); } }, c.time.periods[rng[0]].short + '–' + c.time.periods[rng[1]].short + ' ×'));
      el.appendChild(h('span.tl-sep'));
      el.appendChild(block);
      el.appendChild(h('label.tl-dim.tl-speed', h('span', 'Speed'), h('select', { title: 'Animation speed', onchange: function () { speed = +this.value; U.store.set('speed', speed); if (playTimer) { UI.togglePlay(); UI.togglePlay(); } } },
        [[1600, '0.5×'], [900, '1×'], [450, '2×'], [220, '4×']].map(function (p) { return h('option', { value: p[0], selected: p[0] === speed }, p[1]); }))));
    }
    UI.togglePlay = function () {
      if (playTimer) { clearInterval(playTimer); playTimer = null; render(); return; }
      var c = A.current(); if (!c) return;
      playTimer = setInterval(function () {
        var rng = st.get('range') || [0, c.nS - 1], s = st.get('stage') + 1;
        if (s > rng[1] || s < rng[0]) s = rng[0];
        st.set({ stage: s });
      }, speed);
      render();
    };
    st.on('stage range caseId casesVersion seq block bins', render);
    render();
  };

  // =============== keyboard ===============
  UI.initKeys = function () {
    document.addEventListener('keydown', function (e) {
      var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); U.$('#search').focus(); return; }
      if (typing) return;
      if (e.key === 'ArrowLeft') { UI.step(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { UI.step(1); e.preventDefault(); }
      else if (e.key === '[') GV.dock.toggleDock('left');
      else if (e.key === ']') GV.dock.toggleDock('right');
      else if (e.key === '\\') GV.dock.toggleDock('bottom');
      else if (e.key === 'l' || e.key === 'L') GV.dock.toggle('legend');
      else if (e.key === 'm' || e.key === 'M') GV.dock.mapOnly();
      else if (e.key === 'n' || e.key === 'N') GV.views.addNoteMode();
      else if (e.key === 'f' || e.key === 'F') GV.map.fitNetwork();
      else if (e.key === ' ') { e.preventDefault(); UI.togglePlay(); }
      else if (e.key === '?') UI.help();
      else if (e.key === '/') { e.preventDefault(); U.$('#search').focus(); }
    });
  };

  // =============== modal / help ===============
  UI.modal = function (content, opts) {
    var m = U.$('#modal'), card = U.clear(U.$('#modal-card'));
    card.classList.toggle('wide', !!(opts && opts.wide));
    card.appendChild(content);
    card.appendChild(h('div.modal-actions', h('button.btn', { onclick: UI.closeModal }, 'Close')));
    m.hidden = false;
    m.onclick = function (e) { if (e.target === m) UI.closeModal(); };
  };
  UI.closeModal = function () { U.$('#modal').hidden = true; };
  UI.help = function () {
    var rows = [
      ['Hover', 'Quick summary of a node, pipeline or asset'],
      ['Click', 'Select (opens properties)'], ['Ctrl / ⌘ + click', 'Add or remove from selection'],
      ['Shift + drag', 'Rectangle selection'], ['Double-click', 'Zoom in and open detailed analysis'],
      ['Right-click', 'Context menu: upstream/downstream, paths, compare, filter…'],
      ['← / →', 'Previous / next period'], ['Space', 'Play / pause timeline'], ['Shift + click timeline', 'Set analysis range'],
      ['Ctrl + K or /', 'Search'], ['[  ]  \\', 'Toggle left / right / bottom panels'], ['M', 'Map only'], ['F', 'Fit network'], ['Esc', 'Cancel picking, clear highlight, then clear selection']
    ];
    UI.modal(h('div', h('h2', 'Using the explorer'),
      h('table', rows.map(function (r) { return h('tr', h('td', h('kbd', r[0])), h('td', r[1])); })),
      h('p.muted.small', 'Flows are shown as average rates over the selected block (or hours-weighted over all blocks). Utilization = |flow| / capacity in the flow direction. Marginal costs come from the SDDP node marginal cost output (endcmg). Selections, highlights and filters are shown in distinct colours: selected = blue, analysis highlight = amber, violation = red, filtered = faded.')));
  };

  // =============== view link (hash) ===============
  UI.viewHash = function () {
    var c = A.current(), p = [];
    if (c) p.push('case=' + encodeURIComponent(c.name));
    p.push('s=' + st.get('stage'), 'q=' + st.get('seq'), 'b=' + st.get('block'), 'g=' + st.get('geomMode'));
    if (st.get('view') !== 'custom') p.push('p=' + st.get('view'));
    var sel = st.get('selection');
    if (sel.length) p.push('sel=' + sel.map(function (x) { return x.kind + ':' + x.id; }).join(','));
    var v = GV.map.view(); if (v) p.push('v=' + v.join(','));
    return p.join('&');
  };
  UI.applyHash = function () {
    var hs = location.hash.slice(1); if (!hs) return false;
    var o = {};
    hs.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (o['case']) { var c = A.cases.filter(function (x) { return x.name === o['case']; })[0]; if (c) A.activate(c.id); }
    var patch = {};
    if (o.s !== undefined) patch.stage = +o.s; if (o.q !== undefined) patch.seq = +o.q; if (o.b !== undefined) patch.block = +o.b;
    st.set(patch);
    if (o.p) GV.layers.applyView(o.p);
    if (o.g) st.set({ geomMode: o.g });
    if (o.sel) st.set({ selection: o.sel.split(',').map(function (s) { var i = s.indexOf(':'); return { kind: s.slice(0, i), id: s.slice(i + 1) }; }) });
    if (o.v) { var v = o.v.split(',').map(Number); setTimeout(function () { GV.map.setView(v); }, 50); }
    return true;
  };
})();
