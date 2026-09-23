/* Bottom panel: analytic tables (synchronised with the map), chart workspace and comparison. */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, C = GV.config, CH = GV.charts, h = U.h;
  var UI = GV.ui = GV.ui || {};
  var tab = U.store.get('bottomTab', 'arcs');
  var tables = {}, tableCase = {}, groupBy = { arcs: '', nodes: '', assets: '' }, scope = U.store.get('tableScope', 'filtered');
  var hiddenCols = U.store.get('hiddenCols', {});
  var syncing = false;

  UI.initBottom = function () {
    U.$$('[data-btab]').forEach(function (b) { b.onclick = function () { setTab(b.dataset.btab); }; });
    st.on('stage seq block units compare filters bins range', U.debounce(function () { if (GV.dock.isVisible('data')) refresh(); }, 20));
    st.on('caseId casesVersion', function () { Object.keys(tables).forEach(function (k) { tables[k].destroy(); }); tables = {}; tableCase = {}; if (GV.dock.isVisible('data')) build(); });
    st.on('selection', function () { if (!GV.dock.isVisible('data')) return; if (tab === 'charts' || tab === 'compare') refresh(); else syncSelection(); });
    st.on('theme', function () { if (tab === 'charts' || tab === 'compare') refresh(); });
    window.addEventListener('gv-panels', function () { if (GV.dock.isVisible('data')) { if (!U.$('#bottom-body').firstChild) build(); else if (built(tables[tab])) tables[tab].redraw(); } });
    build();
  };
  function setTab(t) {
    tab = t; U.store.set('bottomTab', t);
    build();
  }
  UI.bottomTab = function (t) { GV.dock.show('data'); setTab(t); };
  UI.openCompareSelection = function () { cmpMode = 'elements'; UI.bottomTab('compare'); };

  function built(t) { return !!(t && t._gvBuilt); }
  var extraTables = [];
  function newTable(el, opts) { var t = new Tabulator(el, opts); extraTables.push(t); return t; }
  function build() {
    extraTables.forEach(function (t) { try { t.destroy(); } catch (e) { /* already gone */ } });
    extraTables = [];
    U.$$('[data-btab]').forEach(function (b) { b.classList.toggle('active', b.dataset.btab === tab); });
    var body = U.$('#bottom-body'), tools = U.clear(U.$('#bottom-tools'));
    Array.prototype.slice.call(body.children).forEach(function (ch) { if (!ch.classList.contains('tbl-host')) ch.remove(); });
    U.$$('.tbl-host', body).forEach(function (x) { x.style.display = x.dataset.t === tab ? '' : 'none'; });
    var c = A.current(); if (!c) return;
    if (tab === 'arcs' || tab === 'nodes' || tab === 'assets') buildTable(tab, tools);
    else if (tab === 'charts') buildCharts(body, tools);
    else buildCompare(body, tools);
    CH.gc();
  }
  function refresh() {
    if (tab === 'arcs' || tab === 'nodes' || tab === 'assets') { if (built(tables[tab])) { updateColumns(tab); tables[tab].replaceData(rows(tab)).then(syncSelection); } }
    else build();
  }

  // ======================= tables =======================
  function numFilter(headerValue, rowValue) {
    var s = String(headerValue).trim(); if (!s) return true;
    var v = +rowValue; if (!isFinite(v)) return false;
    var m;
    if ((m = s.match(/^(>=|<=|>|<|=)\s*(-?[\d.]+)$/))) {
      var x = +m[2];
      return m[1] === '>' ? v > x : m[1] === '<' ? v < x : m[1] === '>=' ? v >= x : m[1] === '<=' ? v <= x : Math.abs(v - x) < 1e-9;
    }
    if ((m = s.match(/^(-?[\d.]+)\s*[-–]\s*(-?[\d.]+)$/))) return v >= +m[1] && v <= +m[2];
    return String(rowValue).indexOf(s) >= 0;
  }
  function numCol(title, field, unit, opts) {
    opts = opts || {};
    var o = U.unitOpt(unit);
    return Object.assign({
      title: title + (unit ? ' (' + (unit === 'pct' ? '%' : o.label) + ')' : ''), field: field, hozAlign: 'right', sorter: 'number', headerHozAlign: 'right',
      headerFilter: 'input', headerFilterFunc: numFilter, headerFilterPlaceholder: '>, <, a-b',
      formatter: function (cell) { var v = cell.getValue(); return v === null || v === undefined || !isFinite(v) ? (v === Infinity ? '∞' : '–') : U.fmtNum(v, o.digits); },
      width: opts.width || 110
    }, opts);
  }
  function utilFormatter(cell) {
    var v = cell.getValue(); // already in %
    if (v === null || v === undefined || isNaN(v)) return '<span class="badge off">off</span>';
    var u = v / 100, col = A.utilColor(u === Infinity ? 99 : u);
    return '<div class="cell-bar"><i style="width:' + Math.min(100, isFinite(v) ? v : 100) + '%;background:' + col + '"></i><span>' + (isFinite(v) ? U.fmtNum(v, 1) : '∞') + '</span></div>';
  }
  function colorFormatter(scaleFn, digits) {
    return function (cell) {
      var v = cell.getValue(); if (v === null || v === undefined || !isFinite(v)) return '–';
      var col = scaleFn(v);
      return '<span style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;background:' + col + '"></span>' + U.fmtNum(v, digits);
    };
  }
  function deltaCol(title, field, unit) {
    var o = U.unitOpt(unit);
    return numCol(title, field, unit, { formatter: function (cell) {
      var v = cell.getValue(); if (v === null || v === undefined || !isFinite(v)) return '–';
      var col = Math.abs(v) < 1e-9 ? 'inherit' : v > 0 ? 'var(--bad)' : 'var(--good)';
      return '<span style="color:' + col + '">' + (v > 0 ? '+' : '') + U.fmtNum(v, o.digits) + '</span>';
    } });
  }

  function columns(t) {
    var c = A.current(), cmp = A.comparing(), cols;
    var flowF = U.unitOpt('flow').factor, priceF = U.unitOpt('price').factor;
    var cmgScale = A.colorScale('node', 'cmg');
    if (t === 'arcs') {
      cols = [
        { title: 'Name', field: 'name', frozen: true, width: 230, headerFilter: 'input', headerFilterPlaceholder: 'filter…' },
        { title: 'ID', field: 'id', width: 70, headerFilter: 'input' },
        { title: 'Type', field: 'type', width: 120, headerFilter: 'list', headerFilterParams: { valuesLookup: true, clearable: true } },
        { title: 'From', field: 'from', width: 150, headerFilter: 'input' },
        { title: 'To', field: 'to', width: 150, headerFilter: 'input' },
        { title: 'Dir.', field: 'dirs', width: 52, hozAlign: 'center' },
        numCol('Flow', 'absFlow', 'flow'),
        numCol('Capacity', 'capacity', 'flow'),
        numCol('Utilization', 'util', 'pct', { formatter: utilFormatter, width: 120 }),
        c.nB > 1 ? numCol('Peak block util.', 'utilPeak', 'pct', { formatter: utilFormatter, width: 130 }) : null,
        numCol('Idle capacity', 'headroom', 'flow'),
        numCol('Hours ≥95%', 'cong', 'pct', { width: 105 }),
        numCol('Δ marginal cost', 'dcmg', 'price', { width: 130 }),
        numCol('Capacity dual', 'capDual', 'price', { width: 120 }),
        numCol('Congestion rent', 'congRent', 'moneyRate', { width: 130 }),
        numCol('P(util ≥ 95%)', 'congProb', 'pct', { width: 115 }),
        { title: 'Main origin', field: 'origin', width: 150, headerFilter: 'list', headerFilterParams: { valuesLookup: true, clearable: true } },
        numCol('Transport cost', 'tcost', 'money'),
        numCol('Rev. capacity', 'capTF', 'flow', { visible: false }),
        numCol('Length', 'length', null, { title: 'Length (km)', width: 95 }),
        { title: 'Status', field: 'status', width: 110, headerFilter: 'list', headerFilterParams: { valuesLookup: true, clearable: true }, formatter: function (cell) { var v = cell.getValue(); return v === 'Violation' ? '<span class="badge bad">Violation</span>' : v === 'Out of service' ? '<span class="badge off">Out of service</span>' : v; } }
      ];
      if (cmp) cols.splice(7, 0, deltaCol('Δ Flow', 'dFlow', 'flow'), deltaCol('Δ Util.', 'dUtil', 'pct'));
    } else if (t === 'nodes') {
      cols = [
        { title: 'Name', field: 'name', frozen: true, width: 220, headerFilter: 'input', headerFilterPlaceholder: 'filter…' },
        { title: 'ID', field: 'id', width: 64, headerFilter: 'input' },
        { title: 'Region', field: 'region', width: 90, headerFilter: 'list', headerFilterParams: { valuesLookup: true, clearable: true } },
        { title: 'Process', field: 'process', width: 80, headerFilter: 'list', headerFilterParams: { valuesLookup: true, clearable: true } },
        numCol('Assets', 'nAssets', null, { width: 75, formatter: 'plaintext' }),
        numCol('Marginal cost', 'cmg', 'price', { width: 140, formatter: cmgScale ? colorFormatter(function (v) { return cmgScale.color(v / priceF); }, U.unitOpt('price').digits) : undefined }),
        numCol('Injection', 'injection', 'flow'),
        numCol('Withdrawal', 'withdrawal', 'flow'),
        numCol('City-gates', 'citygate', 'flow'),
        numCol('Thermal', 'thermal', 'flow'),
        numCol('Net injection', 'net', 'flow'),
        numCol('Pipeline inflow', 'throughput', 'flow'),
        { title: 'Main origin', field: 'origin', width: 160, headerFilter: 'input' },
        numCol('Deficit', 'deficit', 'flow', { formatter: function (cell) { var v = cell.getValue(); return v > 1e-3 ? '<span class="badge bad">' + U.fmtNum(v, U.unitOpt('flow').digits) + '</span>' : '0'; } }),
        numCol('Balance residual', 'residual', 'flow', { visible: false }),
        numCol('Latitude', 'lat', null, { visible: false }), numCol('Longitude', 'lon', null, { visible: false })
      ];
      if (cmp) cols.splice(6, 0, deltaCol('Δ Marg. cost', 'dCmg', 'price'), deltaCol('Δ Withdrawal', 'dWd', 'flow'));
    } else {
      cols = [
        { title: 'Name', field: 'name', frozen: true, width: 240, headerFilter: 'input', headerFilterPlaceholder: 'filter…' },
        { title: 'ID', field: 'id', width: 64, headerFilter: 'input' },
        { title: 'Type', field: 'type', width: 150, headerFilter: 'list', headerFilterParams: { valuesLookup: true, clearable: true } },
        { title: 'Node', field: 'node', width: 170, headerFilter: 'input' },
        { title: 'Region', field: 'region', width: 80, headerFilter: 'list', headerFilterParams: { valuesLookup: true, clearable: true } },
        numCol('Production / consumption', 'value', 'flow', { width: 170 }),
        numCol('Max production', 'maxProd', 'flow', { width: 130 }),
        numCol('Of max', 'util', 'pct', { formatter: utilFormatter, width: 110 }),
        numCol('Deficit', 'deficit', 'flow'),
        numCol('Storage level', 'level', 'volume', { visible: false })
      ];
      if (cmp) cols.splice(6, 0, deltaCol('Δ Value', 'dValue', 'flow'));
    }
    cols = cols.filter(Boolean);
    var hid = hiddenCols[t] || [];
    cols.forEach(function (col) { if (hid.indexOf(col.field) >= 0) col.visible = false; col.headerMenu = headerMenu(t); });
    return cols;
  }
  function headerMenu(t) {
    return function () {
      var menu = [];
      this.getColumns().forEach(function (col) {
        var def = col.getDefinition();
        if (def.frozen) return;
        var label = document.createElement('span');
        label.textContent = (col.isVisible() ? '☑ ' : '☐ ') + def.title;
        menu.push({ label: label, action: function (e) {
          e.stopPropagation(); col.toggle();
          var hid = hiddenCols[t] = (hiddenCols[t] || []).filter(function (f) { return f !== def.field; });
          if (!col.isVisible()) hid.push(def.field);
          U.store.set('hiddenCols', hiddenCols);
          label.textContent = (col.isVisible() ? '☑ ' : '☐ ') + def.title;
        } });
      });
      return menu;
    };
  }

  function rows(t) {
    var c = A.current(), F = A.frame(), P = GV.map.getFilterPass() || c.applyFilters(st.get('filters'), F);
    var flowF = U.unitOpt('flow').factor, priceF = U.unitOpt('price').factor;
    var selIds = {}; st.get('selection').forEach(function (s) { selIds[s.kind + s.id] = 1; });
    var out = [];
    function keep(kind, i, id) {
      if (scope === 'selected') return !!selIds[kind + id];
      if (scope === 'filtered') return !!P[kind][i];
      return true;
    }
    var of = c.hasResults ? c.originFrame(F.sel) : null;
    function domLabel(vg) {
      if (!vg) return '';
      var d = GV.origin.dominant(vg), tot = 0; for (var g = 0; g < vg.length; g++) tot += vg[g];
      return d < 0 ? '' : GV.config.sourceGroups[d].label + ' (' + Math.round(vg[d] / tot * 100) + '%)';
    }
    if (t === 'arcs') {
      var R = F.arc, rng = st.get('range'), refF = A.refValues('arc', 'absFlow'), refU = A.refValues('arc', 'util');
      c.arcs.forEach(function (a, i) {
        if (!keep('arc', i, a.id)) return;
        var u = R.util[i], inSvc = R.capFT[i] + R.capTF[i] > 1e-6;
        out.push({
          id: a.id, name: a.name, type: C.elementTypes[a.kind].label, from: c.node(a.from).name, to: c.node(a.to).name, region: c.node(a.from).region,
          dirs: R.dir[i] > 0 ? '→' : R.dir[i] < 0 ? '←' : '·',
          absFlow: R.absFlow[i] * flowF, capacity: R.capacity[i] * flowF, capTF: R.capTF[i] * flowF,
          util: isNaN(u) ? null : u * 100, utilPeak: isNaN(R.utilPeak[i]) ? null : R.utilPeak[i] * 100,
          headroom: R.headroom[i] * flowF, cong: c.congestionShare(i, st.get('seq'), rng, 0.95) * 100,
          dcmg: R.dcmg[i] * priceF, tcost: R.transportCost[i], length: Math.round(c.arcLength[i]),
          capDual: R.capDual[i] * priceF, congRent: R.congRent[i], congProb: isFinite(R.congProb[i]) ? R.congProb[i] * 100 : null, origin: domLabel(of.arcGrp[i]),
          status: !inSvc && R.absFlow[i] < 1e-3 ? 'Out of service' : u > 1.0001 ? 'Violation' : u >= 0.95 ? 'Near limit' : 'Normal',
          dFlow: refF ? (R.absFlow[i] - refF[i]) * flowF : null, dUtil: refU ? (u - refU[i]) * 100 : null
        });
      });
    } else if (t === 'nodes') {
      var N = F.node, refC = A.refValues('node', 'cmg'), refW = A.refValues('node', 'withdrawal');
      c.nodes.forEach(function (n, i) {
        if (!keep('node', i, n.id)) return;
        out.push({
          id: n.id, name: n.name, region: n.region, process: n.process, nAssets: n.assets.length,
          cmg: N.cmg[i] * priceF, injection: N.injection[i] * flowF, withdrawal: N.withdrawal[i] * flowF, citygate: N.citygate[i] * flowF,
          thermal: N.thermal[i] * flowF, net: N.net[i] * flowF, throughput: N.throughput[i] * flowF, deficit: N.deficit[i] * flowF, residual: N.residual[i] * flowF,
          lat: n.lat, lon: n.lon, origin: domLabel(of && of.nodeGrp[i]),
          dCmg: refC ? (N.cmg[i] - refC[i]) * priceF : null, dWd: refW ? (N.withdrawal[i] - refW[i]) * flowF : null
        });
      });
    } else {
      var X = F.asset, refV = A.refValues('asset', 'aValue');
      c.assets.forEach(function (a, i) {
        if (!keep('asset', i, a.id)) return;
        out.push({
          id: a.id, name: a.name, type: (C.elementTypes[a.type] || {}).label || a.type, node: c.node(a.node).name, region: c.node(a.node).region,
          value: X.aValue[i] * flowF, maxProd: a.maxProd ? a.maxProd[Math.min(st.get('stage'), a.maxProd.length - 1)] * flowF : null,
          util: isFinite(X.aUtil[i]) ? X.aUtil[i] * 100 : null, deficit: X.aDeficit[i] * flowF, level: X.aLevel[i],
          dValue: refV ? (X.aValue[i] - refV[i]) * flowF : null
        });
      });
    }
    return out;
  }
  function kindOf(t) { return t === 'arcs' ? 'arc' : t === 'nodes' ? 'node' : 'asset'; }

  var colSig = {};
  function updateColumns(t) {
    var sig = [A.comparing(), U.unitLabel('flow'), U.unitLabel('price'), A.current().nB].join('|');
    if (colSig[t] !== sig && tables[t]) { tables[t].setColumns(columns(t)); colSig[t] = sig; }
  }

  function buildTable(t, tools) {
    var body = U.$('#bottom-body'), c = A.current();
    var host = U.$('.tbl-host[data-t="' + t + '"]', body);
    if (!host || tableCase[t] !== c.id) {
      if (host) host.remove();
      if (tables[t]) { tables[t].destroy(); delete tables[t]; }
      host = h('div.tbl-host', { dataset: { t: t } });
      body.appendChild(host);
      var tbl = new Tabulator(host, {
        data: rows(t), columns: columns(t), layout: 'fitDataStretch', height: '100%', index: 'id',
        selectableRows: true, selectableRowsRangeMode: 'click', movableColumns: true, placeholder: 'No rows (check filters or the “Show” option)',
        groupBy: groupBy[t] || false, groupStartOpen: true,
        groupHeader: function (value, count) { return value + ' <span class="muted">(' + count + ')</span>'; }
      });
      tbl.on('rowClick', function (e, row) {
        if (syncing) return;
        var additive = e.ctrlKey || e.metaKey || e.shiftKey;
        st.select(kindOf(t), row.getData().id, additive);
        if (!additive) GV.map.flyToElement(kindOf(t), row.getData().id);
      });
      tbl.on('rowDblClick', function (e, row) { GV.actions.drill(kindOf(t), row.getData().id); });
      tbl.on('rowContext', function (e, row) { e.preventDefault(); st.select(kindOf(t), row.getData().id); GV.contextMenu.show(kindOf(t), row.getData().id, e); });
      tbl.on('tableBuilt', function () { tbl._gvBuilt = true; syncSelection(); });
      tables[t] = tbl; tableCase[t] = c.id; colSig[t] = [A.comparing(), U.unitLabel('flow'), U.unitLabel('price'), c.nB].join('|');
    } else if (built(tables[t])) {
      host.style.display = '';
      updateColumns(t);
      tables[t].replaceData(rows(t)).then(syncSelection);
      tables[t].redraw();
    }
    // tools
    var groupOpts = t === 'arcs' ? [['', 'No grouping'], ['type', 'Type'], ['status', 'Status'], ['from', 'Origin node'], ['region', 'Region']]
      : t === 'nodes' ? [['', 'No grouping'], ['region', 'Region'], ['process', 'Process']]
        : [['', 'No grouping'], ['type', 'Type'], ['node', 'Node'], ['region', 'Region']];
    tools.appendChild(h('select', { title: 'Show rows', onchange: function () { scope = this.value; U.store.set('tableScope', scope); refresh(); } },
      [['filtered', 'Rows: matching filters'], ['all', 'Rows: all'], ['selected', 'Rows: selected only']].map(function (o) { return h('option', { value: o[0], selected: o[0] === scope }, o[1]); })));
    tools.appendChild(h('select', { title: 'Group rows', onchange: function () { groupBy[t] = this.value; tables[t].setGroupBy(this.value || false); } },
      groupOpts.map(function (o) { return h('option', { value: o[0], selected: o[0] === groupBy[t] }, o[1]); })));
    tools.appendChild(h('button.btn.sm', { title: 'Columns: use the ☰ menu in any column header to show or hide columns', onclick: function () { U.toast('Use the ⋮ menu on a column header to show or hide columns'); } }, 'Columns'));
    tools.appendChild(h('button.btn.sm', { onclick: function () {
      var name = (A.current().name + '_' + t + '_' + A.current().time.periods[st.get('stage')].key).replace(/[^\w-]+/g, '_');
      tables[t].download('csv', name + '.csv', { bom: true });
    } }, 'Export CSV'));
  }

  function syncSelection() {
    var t = tab, tbl = tables[t]; if (!built(tbl)) return;
    var k = kindOf(t);
    var ids = st.get('selection').filter(function (s) { return s.kind === k; }).map(function (s) { return s.id; });
    syncing = true;
    try {
      tbl.deselectRow();
      if (ids.length) {
        var present = ids.filter(function (id) { return tbl.getRow(id); });
        if (present.length) { tbl.selectRow(present); tbl.scrollToRow(present[0], 'nearest', false).catch(function () { }); }
      }
    } finally { syncing = false; }
  }

  // ======================= chart workspace =======================
  var chartType = U.store.get('chartType', 'mix');
  var CHART_TYPES = [
    ['mix', 'Supply and demand mix over time'],
    ['origin', 'Gas origin → destination (Sankey)'],
    ['originTime', 'Gas delivered by origin over time'],
    ['duals', 'Capacity duals and congestion rent'],
    ['storage', 'Storage and linepack levels'],
    ['hist', 'Utilization histogram'],
    ['scatter', 'Congestion vs marginal-cost spread'],
    ['duration', 'Utilization duration curves'],
    ['cmgprofile', 'Marginal cost by node over time'],
    ['series', 'Time series of selection'],
    ['cases', 'Case / scenario comparison']
  ];
  var seriesVar = { arc: 'absFlow', node: 'cmg', asset: 'aValue' };

  function buildCharts(body) {
    var c = A.current(), F = A.frame();
    var ctl = h('div.charts-ctl'), main = h('div.charts-main'), box = h('div.chart');
    main.appendChild(box);
    body.appendChild(h('div.charts-ws', ctl, main));
    ctl.appendChild(h('div.sec-h', 'Chart'));
    CHART_TYPES.forEach(function (ct) {
      ctl.appendChild(h('label.check', h('input', { type: 'radio', name: 'ctype', checked: chartType === ct[0], onchange: function () { chartType = ct[0]; U.store.set('chartType', chartType); build(); } }), ct[1]));
    });
    var note = h('div.hint', { style: { marginTop: '8px' } });
    ctl.appendChild(note);
    var seq = st.get('seq'), block = st.get('block');
    var selArcs = st.get('selection').filter(function (s) { return s.kind === 'arc'; });

    requestAnimationFrame(function () {
      if (chartType === 'mix') {
        var cats = c.time.periods.map(function (p) { return p.label; }), o = U.unitOpt('flow');
        note.textContent = 'Network totals per period in ' + o.label + ': supply above zero, demand below. Click a bar to go to that period.';
        var keys = [['production', 'Production', '#3f9b6b', 1], ['lng', 'LNG supply', '#0ea5b7', 1], ['stDis', 'Storage discharge', '#8b5cf6', 1],
          ['citygate', 'City-gates', '#3b82f6', -1], ['thermal', 'Thermal plants', '#e4572e', -1], ['stChg', 'Storage charge', '#a78bfa', -1], ['deficit', 'Deficit', '#e11d48', 1]];
        var series = keys.map(function (k) {
          var data = [];
          for (var s = 0; s < c.nS; s++) { var Fs = c.frame({ stage: s, seq: seq, block: block }), tot = 0; Fs.node[k[0]].forEach(function (v) { tot += v; }); data.push(k[3] * tot * o.factor); }
          return { name: k[1], type: 'bar', stack: k[3] > 0 ? 'sup' : 'dem', data: data, itemStyle: { color: k[2] }, barMaxWidth: 26, emphasis: { focus: 'series' } };
        }).filter(function (s) { return s.data.some(function (v) { return Math.abs(v) > 1e-6; }); });
        var t = CH.theme();
        CH.mount(box, {
          grid: { left: 64, right: 20, top: 30, bottom: 28 },
          legend: { top: 0, textStyle: { color: t.text, fontSize: 11 } },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: function (v) { return U.fmtNum(Math.abs(v), o.digits) + ' ' + o.label; } },
          xAxis: CH.axis({ type: 'category', data: cats }),
          yAxis: CH.axis({ type: 'value', axisLabel: { color: t.text, fontSize: 10, formatter: function (v) { return U.fmtNum(Math.abs(v), 0); } } }),
          series: series.concat([{ type: 'line', data: [], markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.accent }, data: [{ xAxis: st.get('stage') }] } }])
        }, { click: function (p) { if (p.componentType === 'series') st.set({ stage: p.dataIndex }); } });
      } else if (chartType === 'origin') {
        note.textContent = 'Where the gas delivered to demands comes from, by source group and by region · use (' + c.periodLabel(st.get('stage')) + '). Proportional mixing at every node.';
        CH.originSankey(box, GV.origin.destinations(c, st.sel()));
      } else if (chartType === 'originTime') {
        note.textContent = 'Gas delivered to city-gates and thermal plants, by origin, for each period. Click to go to a period.';
        var Gs = GV.config.sourceGroups, dat = Gs.map(function () { return []; });
        for (var s0 = 0; s0 < c.nS; s0++) {
          var ofr = c.originFrame({ stage: s0, seq: seq, block: block }), acc = new Float64Array(Gs.length);
          c.assets.forEach(function (x, xi) { if (x.type === 'citygate' || x.type === 'thermal') for (var g = 0; g < Gs.length; g++) acc[g] += ofr.assetGrp[xi][g]; });
          Gs.forEach(function (g, gi) { dat[gi].push(acc[gi]); });
        }
        CH.stacked(box, Gs.map(function (g, gi) { return { name: g.label, data: dat[gi], color: g.color }; }).filter(function (x) { return x.data.some(function (v) { return v > 1e-3; }); }), 'flow');
      } else if (chartType === 'duals') {
        note.textContent = 'Implied capacity duals (value of one more unit of capacity, from the LP optimality conditions) for ' + c.periodLabel(st.get('stage')) + '. Out-of-service arcs show the value of building them. Click a bar to select the arc.';
        var ds = c.arcs.map(function (a, i) { return { a: a, mu: F.arc.capDual[i], rent: F.arc.congRent[i] }; }).filter(function (x) { return x.mu > 0.01; }).sort(function (p, q) { return q.mu - p.mu; }).slice(0, 20);
        if (!ds.length) { CH.mount(box, { title: { text: 'No binding capacity in this period', left: 'center', top: 'middle', textStyle: { color: CH.theme().text, fontSize: 13, fontWeight: 400 } } }); return; }
        CH.bars(box, ds.map(function (x) { return x.a.name; }), [{ name: 'Capacity dual', data: ds.map(function (x) { return x.mu; }), color: '#c21f3a' }], 'price',
          { horizontal: true, onClick: function (p) { var x = ds[p.dataIndex]; st.select('arc', x.a.id); GV.map.flyToElement('arc', x.a.id); } });
      } else if (chartType === 'storage') {
        note.textContent = 'Storage and linepack levels as % of maximum capacity (P10–P90 band when there are several scenarios). Follows the timeline.';
        var sts = c.assets.filter(function (x) { return x.type === 'storage'; });
        CH.timeSeries(box, sts.map(function (x, j) {
          var def = { name: x.name, data: c.series('asset', 'aFill', x.id, seq, block).map(function (v) { return isFinite(v) ? v : NaN; }), unit: 'pct', color: CH.palette[j % CH.palette.length] };
          var b = c.band('asset', 'aFill', x.id, block); if (b) def.band = { lo: b.p10, hi: b.p90 };
          return def;
        }));
      } else if (chartType === 'hist') {
        note.textContent = 'Arcs by utilization class in ' + c.periodLabel(st.get('stage')) + '. Click a bar to select those arcs.';
        var vals = c.arcs.map(function (a, i) { return { id: a.id, v: F.arc.util[i] }; });
        var bins = A.bins();
        CH.histogram(box, vals, {
          bins: bins.map(function (b, i) { var lo = i ? Math.round(bins[i - 1].max * 100) : 0; return { label: b.max === Infinity ? '>' + lo + '%' : lo + '–' + Math.round(Math.min(b.max, 1) * 100) + '%', color: b.color }; }),
          binOf: function (v) { return A.utilBinIndex(v); }, what: 'arcs',
          onPick: function (members) { st.selectMany(members.map(function (m) { return { kind: 'arc', id: m.id }; }), false); }
        });
      } else if (chartType === 'scatter') {
        note.textContent = 'Each point is an arc. A marginal-cost spread between the ends of a highly utilized arc indicates a binding bottleneck. Click to select.';
        var pts = [];
        var selSet = {}; st.get('selection').forEach(function (s) { selSet[s.id] = 1; });
        c.arcs.forEach(function (a, i) {
          var u = F.arc.util[i]; if (!isFinite(u)) return;
          var d = Math.abs(F.arc.dcmg[i]);
          if (!isFinite(d)) return;
          pts.push({ id: a.id, name: a.name, x: u * 100, y: d * U.unitOpt('price').factor, xs: U.fmt(u, 'pct'), ys: U.fmt(d, 'price'), color: A.utilColor(u), sel: !!selSet[a.id], size: 6 + 10 * Math.sqrt(F.arc.absFlow[i] / (c.domain('arc', 'absFlow', st.sel(), true)[1] || 1)) });
        });
        CH.scatter(box, pts, { xLabel: 'Utilization (%)', yLabel: '|Δ marginal cost| (' + U.unitLabel('price') + ')', xFmt: '{value}%', markX: 95,
          onPick: function (p) { st.select('arc', p.id); GV.map.flyToElement('arc', p.id); } });
      } else if (chartType === 'duration') {
        var items = selArcs.length ? selArcs.map(function (s) { return { name: c.arc(s.id).name, ai: c.arcIx[s.id] }; })
          : c.arcs.map(function (a, i) { return { name: a.name, ai: i, s: c.congestionShare(i, seq, st.get('range'), 0.8) }; }).sort(function (p, q) { return q.s - p.s; }).slice(0, 6);
        note.textContent = (selArcs.length ? 'Selected arcs.' : 'Six most loaded arcs (select arcs to choose).') + ' Hours-weighted over ' + (st.get('range') ? 'the analysis range' : 'all periods') + ' and blocks.';
        CH.durationCurve(box, items, seq);
      } else if (chartType === 'cmgprofile') {
        note.textContent = 'Marginal cost by node over time. Selected nodes are shown if any; otherwise the 8 nodes with the highest average cost.';
        var selN = st.get('selection').filter(function (s) { return s.kind === 'node'; }).map(function (s) { return s.id; });
        var ids = selN.length ? selN : c.nodes.map(function (n) { var s = c.series('node', 'cmg', n.id, seq, block); return { id: n.id, m: s.reduce(function (p, q) { return p + q; }, 0) }; })
          .sort(function (p, q) { return q.m - p.m; }).slice(0, 8).map(function (x) { return x.id; });
        CH.timeSeries(box, ids.map(function (id, j) { return { name: c.node(id).name, data: c.series('node', 'cmg', id, seq, block), unit: 'price', color: CH.palette[j % CH.palette.length] }; }));
      } else if (chartType === 'series') {
        var sel = st.get('selection');
        var kinds = {}; sel.forEach(function (s) { kinds[s.kind] = 1; });
        var kind = Object.keys(kinds)[0] || 'arc';
        var vars = A.varsFor(kind);
        ctl.appendChild(h('label.field', h('span', 'Variable'), h('select', { onchange: function () { seriesVar[kind] = this.value; build(); } },
          vars.map(function (v) { return h('option', { value: v.id, selected: v.id === seriesVar[kind] }, v.label); }))));
        var list = sel.filter(function (s) { return s.kind === kind; });
        note.textContent = list.length ? 'Click a period to navigate.' : 'Select elements on the map (Ctrl+click or Shift+drag) to plot them here.';
        var vd = A.varDef(seriesVar[kind]);
        CH.timeSeries(box, list.slice(0, 12).map(function (s, j) { return { name: c.element(kind, s.id).name, data: c.series(kind, vd.id, s.id, seq, block).map(function (x) { return isFinite(x) ? x : NaN; }), unit: vd.unit, color: CH.palette[j % CH.palette.length] }; }));
      } else if (chartType === 'cases') {
        var sel2 = st.get('selection')[0];
        if (!sel2) { note.textContent = 'Select one element to compare it across cases and scenarios.'; CH.mount(box, {}); return; }
        var k2 = sel2.kind, vs = A.varsFor(k2), vv = seriesVar[k2];
        ctl.appendChild(h('label.field', h('span', 'Variable'), h('select', { onchange: function () { seriesVar[k2] = this.value; build(); } },
          vs.map(function (v) { return h('option', { value: v.id, selected: v.id === vv }, v.label); }))));
        var vdef = A.varDef(vv), ser = [];
        A.cases.forEach(function (cc) {
          if (cc.index(k2, sel2.id) === undefined) return;
          for (var q = 0; q < cc.nQ; q++) {
            ser.push({ name: cc.name + (cc.nQ > 1 ? ' · scen. ' + (q + 1) : ''), data: cc.series(k2, vv, sel2.id, q, block).map(function (x) { return isFinite(x) ? x : NaN; }), unit: vdef.unit, color: CH.palette[ser.length % CH.palette.length] });
            if (ser.length > 12) break;
          }
        });
        note.textContent = c.element(k2, sel2.id).name + ': ' + vdef.label + ' in every loaded case' + (A.cases.length < 2 ? ' (open more cases to compare)' : '') + '.';
        CH.timeSeries(box, ser);
      }
    });
  }

  // ======================= comparison =======================
  var cmpMode = 'periods', cmpKind = 'arc', cmpVar = { arc: 'absFlow', node: 'cmg', asset: 'aValue' };
  function buildCompare(body) {
    var c = A.current();
    var bar = h('div.cmp-bar'), content = h('div.cmp-body');
    body.appendChild(h('div.cmp-ws', bar, content));
    bar.appendChild(h('div.segmented', [['periods', 'Periods / cases'], ['elements', 'Selected elements']].map(function (m) {
      return h('button' + (cmpMode === m[0] ? '.on' : ''), { onclick: function () { cmpMode = m[0]; build(); } }, m[1]);
    })));
    if (cmpMode === 'elements') return compareElements(bar, content, c);

    // reference selector (mirrors the toolbar "Compare" control)
    var cmp = st.get('compare');
    var refSel = h('select', { onchange: function () {
      var v = this.value;
      if (v === 'off') st.set({ compare: { mode: 'off' } });
      else if (v.indexOf('s:') === 0) st.set({ compare: { mode: 'stage', stage: +v.slice(2) } });
      else st.set({ compare: { mode: 'case', caseId: v.slice(2) } });
    } }, h('option', { value: 'off' }, 'Choose reference…'),
      h('optgroup', { label: 'Period' }, c.time.periods.map(function (p, i) { return h('option', { value: 's:' + i, selected: cmp.mode === 'stage' && cmp.stage === i }, p.label); })),
      A.cases.length > 1 ? h('optgroup', { label: 'Case' }, A.cases.filter(function (x) { return x.id !== c.id; }).map(function (x) { return h('option', { value: 'c:' + x.id, selected: cmp.mode === 'case' && cmp.caseId === x.id }, x.name); })) : null);
    bar.appendChild(h('span.muted', c.periodLabel(st.get('stage')) + ' (' + c.name + ') vs'));
    bar.appendChild(refSel);
    bar.appendChild(h('div.segmented', [['arc', 'Arcs'], ['node', 'Nodes'], ['asset', 'Assets']].map(function (m) {
      return h('button' + (cmpKind === m[0] ? '.on' : ''), { onclick: function () { cmpKind = m[0]; build(); } }, m[1]);
    })));
    var vars = A.varsFor(cmpKind);
    bar.appendChild(h('select', { onchange: function () { cmpVar[cmpKind] = this.value; build(); } }, vars.map(function (v) { return h('option', { value: v.id, selected: v.id === cmpVar[cmpKind] }, v.label); })));
    if (!A.comparing()) {
      content.appendChild(h('div.props-empty', h('h2', 'Compare two periods or cases'), h('p.muted', 'Choose a reference period or case above (or in the toolbar). The map then shows differences (current − reference) and this table lists them, sorted by the largest absolute change.')));
      return;
    }
    var vd = A.varDef(cmpVar[cmpKind]), F = A.frame(), cur = F[cmpKind][vd.id], ref = A.refValues(cmpKind, vd.id);
    var list = cmpKind === 'arc' ? c.arcs : cmpKind === 'node' ? c.nodes : c.assets;
    var o = U.unitOpt(vd.unit);
    var data = list.map(function (el, i) {
      var a = cur[i], b = ref ? ref[i] : NaN, d = a - b;
      return { id: el.id, name: el.name, a: isFinite(a) ? a * o.factor : null, b: isFinite(b) ? b * o.factor : null, d: isFinite(d) ? d * o.factor : null, dp: isFinite(d) && Math.abs(b) > 1e-9 ? d / Math.abs(b) * 100 : null, ad: isFinite(d) ? Math.abs(d) : -1 };
    }).sort(function (p, q) { return q.ad - p.ad; });
    var split = h('div.cmp-split'), left = h('div'), right = h('div');
    split.appendChild(left); split.appendChild(right); content.appendChild(split);
    var tbl = newTable(left, {
      data: data, layout: 'fitColumns', height: '100%', index: 'id',
      columns: [
        { title: 'Name', field: 'name', headerFilter: 'input', minWidth: 160 },
        numCol('Current', 'a', vd.unit, { width: 100 }), numCol('Reference', 'b', vd.unit, { width: 100 }),
        deltaCol('Δ', 'd', vd.unit), numCol('Δ %', 'dp', null, { width: 80, formatter: function (cell) { var v = cell.getValue(); return v === null ? '–' : (v > 0 ? '+' : '') + U.fmtNum(v, 1) + '%'; } })
      ]
    });
    tbl.on('rowClick', function (e, row) { st.select(cmpKind, row.getData().id); GV.map.flyToElement(cmpKind, row.getData().id); });
    var top = data.filter(function (x) { return x.d !== null && Math.abs(x.d) > 1e-9; }).slice(0, 15);
    var box = h('div.chart'); right.appendChild(box);
    requestAnimationFrame(function () {
      CH.bars(box, top.map(function (x) { return x.name; }), [{ name: 'Δ ' + vd.label, data: top.map(function (x) { return x.d / o.factor; }), color: '#8b5cf6' }], vd.unit,
        { horizontal: true, onClick: function (p) { var x = top[p.dataIndex]; st.select(cmpKind, x.id); GV.map.flyToElement(cmpKind, x.id); } });
    });
  }

  function compareElements(bar, content, c) {
    var sel = st.get('selection');
    if (sel.length < 1) { content.appendChild(h('div.props-empty', h('h2', 'Compare elements'), h('p.muted', 'Select two or more nodes or arcs (Ctrl+click, Shift+drag, or right-click → “Compare with…”).'))); return; }
    var F = A.frame(), kinds = {};
    sel.forEach(function (s) { kinds[s.kind] = kinds[s.kind] || []; kinds[s.kind].push(s); });
    var k = kinds[cmpKind] ? cmpKind : Object.keys(kinds)[0];
    bar.appendChild(h('div.segmented', Object.keys(kinds).map(function (kk) { return h('button' + (kk === k ? '.on' : ''), { onclick: function () { cmpKind = kk; build(); } }, (kk === 'arc' ? 'Arcs' : kk === 'node' ? 'Nodes' : 'Assets') + ' (' + kinds[kk].length + ')'); })));
    var vars = A.varsFor(k);
    var items = kinds[k];
    // side-by-side attribute table: variables as rows, elements as columns
    var cols = [{ title: 'Variable', field: 'v', frozen: true, width: 230 }];
    items.forEach(function (s, j) { cols.push({ title: c.element(k, s.id).name, field: 'e' + j, hozAlign: 'right', width: 150, formatter: 'html' }); });
    var data = vars.map(function (v) {
      var r = { v: v.label + ' (' + (v.unit === 'pct' ? '%' : U.unitLabel(v.unit)) + ')' };
      items.forEach(function (s, j) { var x = F[k][v.id][c.index(k, s.id)]; r['e' + j] = isFinite(x) ? U.fmt(x, v.unit, { noUnit: true }) : x === Infinity ? '∞' : '–'; });
      return r;
    });
    var split = h('div.cmp-split'), left = h('div'), right = h('div');
    split.appendChild(left); split.appendChild(right); content.appendChild(split);
    newTable(left, { data: data, columns: cols, layout: 'fitData', height: '100%' });
    var v = cmpVar[k], vd = A.varDef(v);
    bar.appendChild(h('select', { onchange: function () { cmpVar[k] = this.value; build(); } }, vars.map(function (x) { return h('option', { value: x.id, selected: x.id === v }, 'Chart: ' + x.label); })));
    var box = h('div.chart'); right.appendChild(box);
    requestAnimationFrame(function () {
      CH.timeSeries(box, items.slice(0, 10).map(function (s, j) { return { name: c.element(k, s.id).name, data: c.series(k, v, s.id, st.get('seq'), st.get('block')).map(function (x) { return isFinite(x) ? x : NaN; }), unit: vd.unit, color: CH.palette[j % CH.palette.length] }; }));
    });
  }
})();
