/* Right panel: overview, properties (tabs) for nodes, pipelines and assets, and multi-selection analysis. */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, C = GV.config, CH = GV.charts, h = U.h;
  var UI = GV.ui = GV.ui || {};
  var tabByKind = U.store.get('propTabs', { node: 'overview', arc: 'overview', asset: 'overview' });
  var multiVar = { node: 'cmg', arc: 'util', asset: 'aValue' };

  UI.openProps = function (tab) {
    GV.dock.show('props');
    var s = st.get('selection')[0];
    if (s && tab) { tabByKind[s.kind] = tab; U.store.set('propTabs', tabByKind); }
    render();
  };

  UI.initProps = function () {
    st.on('selection stage seq block units compare caseId casesVersion theme bins range filters', U.debounce(render, 16));
    render();
  };

  function render() {
    var body = U.$('#right-body'), c = A.current();
    var scroll = body.scrollTop, prevKey = body.dataset.key;
    U.clear(body);
    if (!c) { CH.gc(); return; }
    var sel = st.get('selection').filter(function (s) { return c.element(s.kind, s.id); });
    var key = sel.map(function (s) { return s.kind + s.id; }).join(',') + '|' + (sel[0] ? tabByKind[sel[0].kind] : '');
    body.dataset.key = key;
    if (!sel.length) overview(body, c);
    else if (sel.length === 1) single(body, c, sel[0]);
    else multi(body, c, sel);
    CH.gc();
    if (prevKey === key) body.scrollTop = scroll;
  }
  UI.renderProps = render;

  function stat(label, value, cls, title) { return h('div.stat' + (cls ? '.' + cls : ''), { title: title }, h('span', label), h('b', { html: value })); }
  function fmtStat(v, unit, opts) {
    var o = U.unitOpt(unit);
    if (!isFinite(v)) return '–';
    return U.fmtNum(v * o.factor, (opts && opts.digits) !== undefined ? opts.digits : o.digits) + ' <small>' + (unit === 'pct' ? '%' : o.label) + '</small>';
  }
  function kv(pairs) {
    var dl = h('dl.kv');
    pairs.forEach(function (p) { if (!p) return; dl.appendChild(h('dt', p[0])); dl.appendChild(h('dd' + (p[2] ? '.' + p[2] : ''), p[1])); });
    return dl;
  }
  function sec(title, content, tools) { return h('div.props-sec', h('h3', title, tools || null), content); }
  function link(kind, id, text) { return h('a', { onclick: function () { st.select(kind, id); GV.map.flyToElement(kind, id); } }, text); }
  function chartBox(cls) { return h('div.chart' + (cls ? '.' + cls : '')); }
  function after(fn) { requestAnimationFrame(fn); }
  /** Horizontal stacked bar of gas origin shares, with legend of the non-zero groups. */
  function originBar(vg) {
    var G = GV.config.sourceGroups, sh = GV.origin.shares(vg), bar = h('div.obar'), leg = h('div.olegend');
    var tot = 0; for (var g = 0; g < vg.length; g++) tot += vg[g];
    if (tot <= 1e-6) return h('div.hint', 'No gas flows through this element in the selected period.');
    Array.prototype.forEach.call(sh, function (v, g) {
      if (v < 0.0005) return;
      bar.appendChild(h('i', { style: { width: (v * 100) + '%', background: G[g].color }, title: G[g].label + ': ' + U.fmtNum(v * 100, 1) + '%' }));
      leg.appendChild(h('span', h('b', { style: { background: G[g].color } }), G[g].label + ' ' + U.fmtNum(v * 100, v < 0.1 ? 1 : 0) + '%'));
    });
    return h('div', bar, leg);
  }
  UI.originBar = originBar;
  /** Adds a P10–P90 band to a time-series definition when the case has several scenarios. */
  function withBand(c, def, kind, varId, id, block) {
    var b = c.band(kind, varId, id, block);
    if (b) def.band = { lo: b.p10, hi: b.p90 };
    return def;
  }
  function periodTag() { return A.current().periodLabel(st.get('stage')) + ' · ' + GV.tooltip.blockLabel(); }

  // ------------------------------------------------------------ overview
  function overview(body, c) {
    var F = A.frame();
    var head = h('div.props-head', h('div.props-type', 'Case overview'), h('div.props-name', c.name),
      h('div.props-sub', c.nodes.length + ' nodes · ' + c.arcs.length + ' arcs · ' + c.assets.length + ' assets · ' + c.nS + ' periods × ' + c.nB + ' blocks' + (c.nQ > 1 ? ' × ' + c.nQ + ' scenarios' : '')));
    body.appendChild(head);
    if (!c.hasResults) body.appendChild(h('div.props-sec', h('div.warnbox', 'No result files found: showing network inputs only.')));
    if (c.ds.warnings && c.ds.warnings.length) {
      body.appendChild(sec('Data warnings (' + c.ds.warnings.length + ')', h('div.small.muted', c.ds.warnings.slice(0, 8).map(function (w) { return h('div', '• ' + w); }))));
    }
    // most loaded arcs
    var arcs = c.arcs.map(function (a, i) { return { a: a, i: i, u: F.arc.util[i] }; }).filter(function (x) { return isFinite(x.u) || x.u === Infinity; })
      .sort(function (p, q) { return q.u - p.u; }).slice(0, 8);
    var l1 = h('div.list');
    arcs.forEach(function (x) {
      l1.appendChild(h('div.li', { onclick: function () { st.select('arc', x.a.id); GV.map.flyToElement('arc', x.a.id); } },
        h('span.ic', { style: { background: A.utilColor(x.u) } }), h('span.nm', x.a.name), h('span.v', x.u === Infinity ? '∞' : U.fmt(x.u, 'pct'))));
    });
    body.appendChild(sec('Most loaded arcs · ' + periodTag(), l1));
    // recurrent bottlenecks
    var rng = st.get('range'), rec = c.arcs.map(function (a, i) { return { a: a, s: c.congestionShare(i, st.get('seq'), rng, 0.95) }; })
      .filter(function (x) { return x.s > 0; }).sort(function (p, q) { return q.s - p.s; }).slice(0, 6);
    var l3 = h('div.list');
    if (!rec.length) l3.appendChild(h('div.hint', 'No arc reaches 95% utilization in any block.'));
    rec.forEach(function (x) {
      l3.appendChild(h('div.li', { onclick: function () { st.select('arc', x.a.id); GV.map.flyToElement('arc', x.a.id); } },
        h('span.ic', { style: { background: '#e3642f', opacity: 0.3 + 0.7 * x.s } }), h('span.nm', x.a.name), h('span.v', U.fmtNum(x.s * 100, 0) + '% of hours')));
    });
    body.appendChild(sec('Recurring bottlenecks (≥ 95%)' + (rng ? ' · ' + c.time.periods[rng[0]].short + '–' + c.time.periods[rng[1]].short : ' · all periods'), l3));
    // marginal costs
    var nodes = c.nodes.map(function (n, i) { return { n: n, v: F.node.cmg[i] }; }).filter(function (x) { return x.v > 0; }).sort(function (p, q) { return q.v - p.v; });
    if (nodes.length) {
      var box = chartBox('sm');
      body.appendChild(sec('Marginal cost ranking · ' + periodTag(), box));
      var top = nodes.slice(0, 10);
      after(function () {
        CH.bars(box, top.map(function (x) { return x.n.name; }), [{ name: 'Marginal cost', data: top.map(function (x) { return x.v; }), color: '#d0452b' }], 'price',
          { horizontal: true, onClick: function (p) { var x = top[p.dataIndex]; st.select('node', x.n.id); GV.map.flyToElement('node', x.n.id); } });
      });
    }
    // deficits
    var defs = c.nodes.map(function (n, i) { return { n: n, v: F.node.deficit[i] }; }).filter(function (x) { return x.v > 1e-3; });
    if (defs.length) {
      var l2 = h('div.list');
      defs.forEach(function (x) { l2.appendChild(h('div.li', { onclick: function () { st.select('node', x.n.id); GV.map.flyToElement('node', x.n.id); } }, h('span.ic', { style: { background: '#e11d48' } }), h('span.nm', x.n.name), h('span.v', U.fmt(x.v, 'flow')))); });
      body.appendChild(sec('Deficits', l2));
    }
    body.appendChild(h('div.props-sec.small.muted', 'Click an element on the map to inspect it. Ctrl+click or Shift+drag to select several and compare. Right-click for network analysis (upstream, downstream, paths).'));
  }

  // ------------------------------------------------------------ single element
  var TABS = {
    node: [['overview', 'Overview'], ['assets', 'Assets'], ['results', 'Balance'], ['origin', 'Gas origin'], ['timeseries', 'Time series'], ['connections', 'Connections'], ['metadata', 'Metadata']],
    arc: [['overview', 'Overview'], ['results', 'Capacity use'], ['timeseries', 'Time series'], ['connections', 'Connections'], ['metadata', 'Metadata']],
    asset: [['overview', 'Overview'], ['timeseries', 'Time series'], ['metadata', 'Metadata']]
  };
  function single(body, c, s) {
    var el = c.element(s.kind, s.id), i = c.index(s.kind, s.id);
    var tab = tabByKind[s.kind];
    if (!TABS[s.kind].some(function (t) { return t[0] === tab; })) tab = 'overview';
    var sub;
    if (s.kind === 'node') sub = [(c.ds.regions.filter(function (r) { return r.id === el.region; })[0] || {}).name || el.region, el.process, el.assets.length + ' assets'].filter(Boolean).join(' · ');
    else if (s.kind === 'arc') sub = h('span', link('node', el.from, c.node(el.from).name), ' → ', link('node', el.to, c.node(el.to).name));
    else sub = h('span', 'at ', link('node', el.node, c.node(el.node).name));
    body.appendChild(h('div.props-head',
      h('div.props-type', c.typeLabel(s.kind, el), h('span', { style: { display: 'flex', gap: '2px' } },
        h('button.icon-btn', { title: 'Zoom to', onclick: function () { GV.map.flyToElement(s.kind, s.id, { zoom: 8 }); } }, h('i.fa-solid.fa-crosshairs')),
        h('button.icon-btn', { title: 'Copy ID', onclick: function () { U.copy(s.id); } }, h('i.fa-regular.fa-copy')),
        h('button.icon-btn', { title: 'Clear selection (Esc)', onclick: function () { st.select(null); } }, h('i.fa-solid.fa-xmark')))),
      h('div.props-name', el.name), h('div.props-sub', s.id + ' · ', sub)));
    var tabs = h('div.props-tabs');
    TABS[s.kind].forEach(function (t) {
      tabs.appendChild(h('button.ptab' + (t[0] === tab ? '.active' : ''), { onclick: function () { tabByKind[s.kind] = t[0]; U.store.set('propTabs', tabByKind); render(); } }, t[1]));
    });
    body.appendChild(tabs);
    var fn = ({ node: nodeTabs, arc: arcTabs, asset: assetTabs })[s.kind];
    fn(body, c, el, i, tab);
  }

  // ------------------------------------------------------------ node
  function nodeTabs(body, c, n, i, tab) {
    var F = A.frame(), N = F.node, seq = st.get('seq'), block = st.get('block');
    if (tab === 'overview') {
      var ref = A.refValues('node', 'cmg');
      var dcm = ref ? N.cmg[i] - ref[i] : NaN;
      body.appendChild(sec(periodTag(), h('div.stat-grid',
        stat('Marginal cost', fmtStat(N.cmg[i], 'price') + (isFinite(dcm) ? ' <small class="delta ' + (dcm > 0 ? 'up' : 'down') + '">' + U.fmt(dcm, 'price', { sign: true, noUnit: true }) + '</small>' : '')),
        stat('Net injection', fmtStat(N.net[i], 'flow')),
        stat('Injection', fmtStat(N.injection[i], 'flow'), null, 'Production + LNG supply + storage discharge'),
        stat('Withdrawal', fmtStat(N.withdrawal[i], 'flow'), null, 'City-gates + thermal plants + storage charge'),
        stat('Pipeline inflow', fmtStat(N.pipeIn[i] + N.regasIn[i], 'flow')),
        stat('Pipeline outflow', fmtStat(N.pipeOut[i] + N.regasOut[i], 'flow')),
        N.deficit[i] > 1e-3 ? stat('Deficit', fmtStat(N.deficit[i], 'flow'), 'bad') : null,
        N.thermal[i] > 1e-3 ? stat('Thermal consumption', fmtStat(N.thermal[i], 'flow')) : null
      )));
      var cm = chartBox('sm');
      body.appendChild(sec('Marginal cost over time', cm));
      after(function () { CH.timeSeries(cm, [withBand(c, { name: 'Marginal cost', data: c.series('node', 'cmg', n.id, seq, block), unit: 'price', color: '#d0452b', area: c.nQ < 2 }, 'node', 'cmg', n.id, block)]); });
      if (c.hasResults) body.appendChild(sec('Gas origin (mix at the node)', originBar(c.originFrame(st.sel()).nodeGrp[i])));
      body.appendChild(sec('Location', kv([['ID', n.id], ['Code', n.code], ['Latitude', n.lat], ['Longitude', n.lon], ['Region', n.region], ['Process', n.process], ['Associated assets', n.assets.length]])));
    } else if (tab === 'assets') {
      var groups = {};
      n.assets.forEach(function (id) { var a = c.asset(id); (groups[a.type] = groups[a.type] || []).push(a); });
      if (!n.assets.length) body.appendChild(h('div.props-sec.muted', 'No assets associated with this node.'));
      Object.keys(groups).forEach(function (t) {
        var def = C.elementTypes[t] || {}, list = h('div.list'), tot = 0;
        groups[t].forEach(function (a) {
          var j = c.assetIx[a.id], v = F.asset.aValue[j]; tot += v;
          list.appendChild(h('div.li', { onclick: function () { st.select('asset', a.id); } },
            h('span.ic', { style: { background: def.color } }), h('span.nm', a.name), h('span.v', U.fmt(v, 'flow'))));
        });
        body.appendChild(sec((def.plural || t) + ' (' + groups[t].length + ')', list, h('span.muted', U.fmt(tot, 'flow'))));
      });
    } else if (tab === 'results') {
      var parts = [
        { name: 'Pipeline inflow', value: N.pipeIn[i] },
        { name: 'Regasification in', value: N.regasIn[i] },
        { name: 'Production', value: N.production[i] },
        { name: 'LNG supply', value: N.lng[i] },
        { name: 'Storage discharge', value: N.stDis[i] },
        { name: 'Pipeline outflow', value: -N.pipeOut[i] },
        { name: 'To regasification', value: -N.regasOut[i] },
        { name: 'City-gates', value: -N.citygate[i] },
        { name: 'Thermal plants', value: -N.thermal[i] },
        { name: 'Storage charge', value: -N.stChg[i] }
      ].filter(function (p) { return Math.abs(p.value) > 1e-3; });
      parts.push({ name: 'Balance', value: N.residual[i], total: true });
      var wf = chartBox();
      wf.style.height = Math.max(120, 26 * parts.length + 30) + 'px';
      var ok = Math.abs(N.residual[i]) <= Math.max(0.5, 0.002 * (N.throughput[i] + N.injection[i]));
      body.appendChild(sec('Nodal balance · ' + periodTag(), h('div', wf,
        h('div.small' + (ok ? '.muted' : ''), ok ? 'Balance closes (residual ' + U.fmt(N.residual[i], 'flow') + ', rounding and losses).' : h('span.warnbox', 'Residual of ' + U.fmt(N.residual[i], 'flow') + ': check losses or missing results.')),
        N.deficit[i] > 1e-3 ? h('div.warnbox', 'Unserved demand (deficit): ' + U.fmt(N.deficit[i], 'flow')) : null)));
      after(function () { CH.balanceWaterfall(wf, parts); });
      // sankey
      var ins = [], outs = [];
      c.nodeArcs[i].forEach(function (ai) {
        var a = c.arcs[ai], f = F.arc.flow[ai];
        if (Math.abs(f) < 1e-3) return;
        var incoming = (f > 0 && a.to === n.id) || (f < 0 && a.from === n.id);
        var other = c.node(a.to === n.id ? a.from : a.to).name;
        var arr = incoming ? Math.abs(f) * (1 - (f > 0 ? a.lossFT : a.lossTF)) : Math.abs(f);
        (incoming ? ins : outs).push({ name: a.name + ' (' + other + ')', value: arr, color: incoming ? '#4f8fc7' : '#8fb8dc', ref: { kind: 'arc', id: a.id } });
      });
      n.assets.forEach(function (id) {
        var a = c.asset(id), v = F.asset.aValue[c.assetIx[id]], t = C.elementTypes[a.type] || {};
        if (Math.abs(v) < 1e-3) return;
        var isIn = t.balance === 'injection' || (t.balance === 'storage' && v > 0);
        (isIn ? ins : outs).push({ name: a.name, value: Math.abs(v), color: t.color, ref: { kind: 'asset', id: a.id } });
      });
      if (ins.length || outs.length) {
        var sk = chartBox();
        sk.style.height = Math.max(160, 22 * Math.max(ins.length, outs.length) + 40) + 'px';
        body.appendChild(sec('Local flow diagram', sk));
        after(function () { CH.localSankey(sk, n.name, ins, outs, function (ref) { st.select(ref.kind, ref.id); }); });
      }
    } else if (tab === 'origin') {
      var of = c.originFrame(st.sel()), G = C.sourceGroups;
      body.appendChild(sec('Gas origin · ' + periodTag(), h('div', originBar(of.nodeGrp[i]),
        h('div.small.muted', { style: { marginTop: '6px' } }, 'Mix of all gas entering the node (pipelines + local injections), assuming perfect mixing at every node: ' + U.fmt(of.nodeTot[i], 'flow') + '.'))));
      var srcRows = of.sources.map(function (sv, k) { return { s: sv, v: of.nodeSrc[i][k] }; }).filter(function (x) { return x.v > 1e-3; })
        .sort(function (p, q) { return q.v - p.v; }).slice(0, 12);
      var lst = h('div.list');
      srcRows.forEach(function (x) {
        lst.appendChild(h('div.li', { onclick: function () { st.select('asset', x.s.id); GV.map.flyToElement('asset', x.s.id, { zoom: 6 }); } },
          h('span.ic', { style: { background: G[x.s.group].color } }), h('span.nm', x.s.name, h('small', '  ' + c.nodes[x.s.node].name)),
          h('span.v', U.fmt(x.v, 'flow') + ' · ' + U.fmtNum(x.v / (of.nodeTot[i] || 1) * 100, 0) + '%')));
      });
      body.appendChild(sec('Main individual sources', srcRows.length ? lst : h('div.hint', 'None.')));
      var dem = [];
      n.assets.forEach(function (id) {
        var j = c.assetIx[id], x = c.assets[j];
        if (x.type === 'citygate' || x.type === 'thermal') dem.push(h('div', { style: { margin: '4px 0 8px' } }, h('div.small', x.name), originBar(of.assetGrp[j])));
      });
      if (dem.length) body.appendChild(sec('Origin of the gas delivered to each demand', h('div', dem)));
      var oc = chartBox();
      body.appendChild(sec('Origin over time', oc));
      after(function () {
        var data = G.map(function () { return []; });
        for (var s2 = 0; s2 < c.nS; s2++) { var o2 = c.originFrame({ stage: s2, seq: seq, block: block }).nodeGrp[i]; G.forEach(function (g, gi) { data[gi].push(o2[gi]); }); }
        CH.stacked(oc, G.map(function (g, gi) { return { name: g.label, data: data[gi], color: g.color }; }).filter(function (x) { return x.data.some(function (v) { return v > 1e-3; }); }), 'flow');
      });
    } else if (tab === 'timeseries') {
      var t1 = chartBox(), t2 = chartBox();
      body.appendChild(sec('Supply and demand', t1));
      body.appendChild(sec('Marginal cost', t2));
      after(function () {
        CH.timeSeries(t1, [
          { name: 'Injection', data: c.series('node', 'injection', n.id, seq, block), unit: 'flow', color: '#3f9b6b' },
          { name: 'Withdrawal', data: c.series('node', 'withdrawal', n.id, seq, block), unit: 'flow', color: '#e3642f' },
          { name: 'Pipeline inflow', data: c.series('node', 'throughput', n.id, seq, block), unit: 'flow', color: '#4f8fc7', dashed: true },
          { name: 'Deficit', data: c.series('node', 'deficit', n.id, seq, block), unit: 'flow', color: '#e11d48', type: 'bar' }
        ].filter(function (s) { return s.data.some(function (v) { return Math.abs(v) > 1e-3; }); }));
        CH.timeSeries(t2, [withBand(c, { name: 'Marginal cost', data: c.series('node', 'cmg', n.id, seq, block), unit: 'price', color: '#d0452b', area: c.nQ < 2 }, 'node', 'cmg', n.id, block)]);
      });
    } else if (tab === 'connections') {
      var list = h('div.list');
      c.nodeArcs[i].forEach(function (ai) {
        var a = c.arcs[ai], f = F.arc.flow[ai], u = F.arc.util[ai];
        var other = a.to === n.id ? a.from : a.to;
        var incoming = (f > 0 && a.to === n.id) || (f < 0 && a.from === n.id);
        list.appendChild(h('div.li', { onclick: function () { st.select('arc', a.id); }, title: a.name },
          h('span.ic', { style: { background: A.utilColor(u) || '#b4bcc8' } }),
          h('span.nm', (Math.abs(f) < 1e-3 ? '· ' : incoming ? '← ' : '→ ') + c.node(other).name, h('small', '  ' + a.name)),
          h('span.v', U.fmt(Math.abs(f), 'flow', { noUnit: true }) + (isFinite(u) ? ' · ' + U.fmt(u, 'pct') : ''))));
      });
      body.appendChild(sec('Connected arcs (' + c.nodeArcs[i].length + ')', c.nodeArcs[i].length ? list : h('div.hint', 'No pipelines, sea routes or converters at this node.'), h('span.muted', U.unitLabel('flow'))));
      // local elements: supply, demand and storage attached to the node
      [['Production and supply', ['producer', 'lng_supply']], ['Demand', ['citygate', 'thermal']], ['Storage', ['storage']]].forEach(function (g) {
        var ids = n.assets.filter(function (id) { return g[1].indexOf(c.asset(id).type) >= 0; });
        if (!ids.length) return;
        var lst = h('div.list'), tot = 0;
        ids.forEach(function (id) {
          var a = c.asset(id), j = c.assetIx[id], v = F.asset.aValue[j], def = C.elementTypes[a.type] || {};
          var extra = '', arrow = '';
          if (a.type === 'storage') {
            arrow = v > 0.5 ? '↑ ' : v < -0.5 ? '↓ ' : '· ';
            extra = isFinite(F.asset.aFill[j]) ? ' · ' + U.fmt(F.asset.aFill[j], 'pct') + ' ' + GV.i18n.t('full') : '';
            tot += v;
          } else if (g[1][0] === 'citygate') {
            arrow = '↓ '; tot += v;
            if (F.asset.aDeficit[j] > 1e-3) extra = ' · ' + GV.i18n.t('deficit') + ' ' + U.fmt(F.asset.aDeficit[j], 'flow', { noUnit: true });
          } else {
            arrow = '↑ '; tot += v;
            if (isFinite(F.asset.aUtil[j]) && F.asset.aUtil[j] > 0) extra = ' · ' + U.fmt(F.asset.aUtil[j], 'pct');
          }
          lst.appendChild(h('div.li', { onclick: function () { st.select('asset', a.id); }, title: a.name + ' · ' + (def.label || a.type) },
            h('span.ic', { style: { background: def.color || '#888' } }),
            h('span.nm', arrow + a.name, h('small', '  ' + (def.label || a.type))),
            h('span.v' + (extra.indexOf(GV.i18n.t('deficit')) >= 0 ? '.bad' : ''), U.fmt(a.type === 'storage' ? v : Math.abs(v), 'flow', { noUnit: true, sign: a.type === 'storage' }) + extra)));
        });
        body.appendChild(sec(g[0] + ' (' + ids.length + ')', lst, h('span.muted', U.fmt(g[1][0] === 'storage' ? tot : Math.abs(tot), 'flow', { sign: g[1][0] === 'storage' }))));
      });
      if (n.assets.length && n.assets.some(function (id) { return c.asset(id).type === 'storage'; })) body.appendChild(h('div.hint', { style: { padding: '0 12px 6px' } }, 'Storage: positive = discharge into the network, negative = injection into storage.'));
      var nb = h('div.list');
      c.nodeArcs[i].forEach(function (ai) {
        var a = c.arcs[ai], o = c.node(a.to === n.id ? a.from : a.to), oi = c.nodeIx[o.id];
        nb.appendChild(h('div.li', { onclick: function () { st.select('node', o.id); GV.map.flyToElement('node', o.id); } },
          h('span.ic', { style: { background: GV.config.regionColors[o.region] || '#888', borderRadius: '50%' } }), h('span.nm', o.name), h('span.v', U.fmt(F.node.cmg[oi], 'price'))));
      });
      body.appendChild(sec('Neighbour nodes', nb));
      body.appendChild(sec('Network analysis', h('div.chipset',
        ['upstream', 'downstream', 'connected', 'hops', 'component', 'filterFrom', 'pathTo'].map(function (a) {
          var lab = (C.contextMenus.node.filter(function (x) { return x.id === a; })[0] || {}).label;
          return h('button.btn.sm', { onclick: function () { GV.actions.run(a, 'node', n.id); } }, lab);
        }))));
    } else metadata(body, n);
  }

  // ------------------------------------------------------------ arc
  function arcTabs(body, c, a, i, tab) {
    var F = A.frame(), R = F.arc, seq = st.get('seq'), block = st.get('block');
    var u = R.util[i], f = R.flow[i];
    var from = c.node(a.from), to = c.node(a.to);
    if (tab === 'overview') {
      var cls = u > 1.0001 ? 'bad' : u >= 0.95 ? 'warn' : null;
      var dir = R.dir[i] > 0 ? from.name + ' → ' + to.name : R.dir[i] < 0 ? to.name + ' → ' + from.name + ' (reverse)' : 'No flow';
      var ref = A.refValues('arc', 'absFlow'), d = ref ? R.absFlow[i] - ref[i] : NaN;
      var grid = h('div.stat-grid',
        stat('Flow', fmtStat(Math.abs(f), 'flow') + (isFinite(d) ? ' <small class="delta">' + U.fmt(d, 'flow', { sign: true, noUnit: true }) + '</small>' : '')),
        stat('Capacity', fmtStat(R.capacity[i], 'flow'), null, 'Capacity in the flow direction'),
        stat('Utilization', isNaN(u) ? 'out of service' : u === Infinity ? '∞' : fmtStat(u, 'pct'), cls),
        stat('Idle capacity', fmtStat(R.headroom[i], 'flow')),
        c.nB > 1 && block < 0 ? stat('Peak block util.', isFinite(R.utilPeak[i]) ? fmtStat(R.utilPeak[i], 'pct') : '–', R.utilPeak[i] >= 0.95 ? 'warn' : null) : null,
        isFinite(R.dcmg[i]) ? stat('Δ marginal cost', fmtStat(R.dcmg[i], 'price'), null, 'Marginal cost at destination minus origin (congestion signal)') : null,
        stat('Capacity dual', fmtStat(R.capDual[i], 'price'), R.capDual[i] > 0.01 ? 'warn' : null, 'Value of one more unit of capacity: (1 − loss) × CMg(destination) − CMg(origin) − tariff, positive only when the arc limits the flow (implied by the LP optimality conditions). For arcs out of service it is the value of building them.'),
        stat('Congestion rent', fmtStat(R.congRent[i], 'moneyRate'), null, 'Capacity dual × flow'),
        c.nQ > 1 || c.nB > 1 ? stat('P(util ≥ 95 %)', isFinite(R.congProb[i]) ? fmtStat(R.congProb[i], 'pct') : '–', R.congProb[i] > 0.2 ? 'warn' : null, 'Share of hours' + (c.nQ > 1 ? ' and scenarios' : '') + ' with utilization ≥ 95 %') : null
      );
      var bar = h('div.ubar', h('i', { style: { width: Math.min(100, (isFinite(u) ? u : 1) * 100) + '%', background: A.utilColor(u) || '#b4bcc8' } }),
        A.bins().slice(0, -1).map(function (b) { return h('b', { style: { left: Math.min(b.max, 1) * 100 + '%', opacity: 0.25 } }); }));
      body.appendChild(sec(periodTag(), h('div', grid, bar, h('div.small.muted', { style: { marginTop: '6px' } }, 'Direction: ' + dir))));
      if (c.hasResults) body.appendChild(sec('Gas origin (composition of the flow)', originBar(c.originFrame(st.sel()).arcGrp[i])));
      var cap = chartBox();
      body.appendChild(sec('Flow vs capacity over time', cap));
      after(function () { CH.arcCapacity(cap, c, i, seq); });
      body.appendChild(sec('Characteristics', kv([
        ['Type', C.elementTypes[a.kind].label], ['From', from.name], ['To', to.name],
        ['Capacity from→to', U.fmt(R.capFT[i], 'flow')], ['Capacity to→from', R.capTF[i] > 0 ? U.fmt(R.capTF[i], 'flow') : '— (unidirectional)'],
        ['Length', Math.round(c.arcLength[i]) + ' km' + (a.geometry ? '' : ' (straight line)')],
        a.kind === 'regas' ? ['Efficiency', U.fmtNum(a.eff, 3)] : ['Loss from→to', U.fmtNum(a.lossFT * 100, 2) + '%'],
        ['Transport cost', U.fmt(R.transportCost[i], 'money')]
      ])));
    } else if (tab === 'results') {
      var d1 = chartBox(), rows = [];
      for (var b = 0; b < c.nB; b++) {
        var sel = st.sel({ block: b }), Fb = c.frame(sel);
        rows.push(h('tr', h('td', 'Block ' + (b + 1)), h('td.num', Math.round(c.hours(st.get('stage'), b)) + ' h'), h('td.num', U.fmt(Fb.arc.flow[i], 'flow', { noUnit: true })), h('td.num', isFinite(Fb.arc.util[i]) ? U.fmt(Fb.arc.util[i], 'pct') : '–')));
      }
      body.appendChild(sec('By block · ' + c.periodLabel(st.get('stage')), h('table.small', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('tr', h('th', { style: { textAlign: 'left' } }, 'Block'), h('th', 'Hours'), h('th', 'Flow (' + U.unitLabel('flow') + ')'), h('th', 'Util.')), rows)));
      var rng = st.get('range');
      var share = c.congestionShare(i, seq, rng, 0.95), shareV = c.congestionShare(i, seq, rng, 1.0001);
      body.appendChild(sec('Congestion' + (rng ? ' in range' : ' (all periods)'), h('div.stat-grid',
        stat('Hours ≥ 95%', isFinite(share) ? U.fmtNum(share * 100, 1) + ' <small>%</small>' : '–', share > 0.2 ? 'warn' : null),
        stat('Hours > 100%', isFinite(shareV) ? U.fmtNum(shareV * 100, 1) + ' <small>%</small>' : '–', shareV > 0 ? 'bad' : null))));
      body.appendChild(sec('Utilization duration curve', d1));
      after(function () { CH.durationCurve(d1, [{ name: a.name, ai: i }], seq); });
    } else if (tab === 'timeseries') {
      var t1 = chartBox(), t2 = chartBox('sm');
      body.appendChild(sec('Flow and utilization', t1));
      body.appendChild(sec('Marginal cost at both ends', t2));
      var t3 = chartBox('sm');
      body.appendChild(sec('Capacity dual and congestion probability', t3));
      after(function () {
        CH.timeSeries(t3, [
          withBand(c, { name: 'Capacity dual', data: c.series('arc', 'capDual', a.id, seq, block), unit: 'price', color: '#c21f3a', type: 'bar' }, 'arc', 'capDual', a.id, block),
          { name: 'P(util ≥ 95 %)', data: c.series('arc', 'congProb', a.id, seq, block), unit: 'pct', color: '#e3a72f' }
        ]);
      });
      after(function () {
        CH.timeSeries(t1, [
          withBand(c, { name: 'Flow (signed)', data: c.series('arc', 'flow', a.id, seq, block), unit: 'flow', color: '#26828C' }, 'arc', 'flow', a.id, block),
          { name: 'Utilization', data: c.series('arc', 'util', a.id, seq, block).map(function (v) { return isFinite(v) ? v : NaN; }), unit: 'pct', color: '#e3642f', dashed: true }
        ]);
        CH.timeSeries(t2, [
          { name: from.name, data: c.series('node', 'cmg', from.id, seq, block), unit: 'price', color: '#64748b' },
          { name: to.name, data: c.series('node', 'cmg', to.id, seq, block), unit: 'price', color: '#d0452b' }
        ]);
      });
    } else if (tab === 'connections') {
      [from, to].forEach(function (n, k) {
        var ni = c.nodeIx[n.id];
        body.appendChild(sec(k ? 'Destination node' : 'Origin node', h('div.list', h('div.li', { onclick: function () { st.select('node', n.id); GV.map.flyToElement('node', n.id); } },
          h('span.ic', { style: { background: GV.config.regionColors[n.region] || '#888', borderRadius: '50%' } }), h('span.nm', n.name), h('span.v', U.fmt(F.node.cmg[ni], 'price'))))));
      });
      body.appendChild(sec('Network analysis', h('div.chipset',
        ['upstream', 'downstream'].map(function (x) { return h('button.btn.sm', { onclick: function () { GV.actions.run(x, 'arc', a.id); } }, x === 'upstream' ? 'Highlight upstream' : 'Highlight downstream'); }),
        h('button.btn.sm', { onclick: function () { GV.actions.run('compareWith', 'arc', a.id); } }, 'Compare with…'))));
    } else metadata(body, a);
  }

  // ------------------------------------------------------------ asset
  function assetTabs(body, c, a, i, tab) {
    var F = A.frame(), X = F.asset, seq = st.get('seq'), block = st.get('block'), t = C.elementTypes[a.type] || {};
    if (tab === 'overview') {
      var lbl = t.balance === 'injection' ? 'Production' : t.balance === 'storage' ? 'Discharge (+) / charge (−)' : 'Consumption';
      body.appendChild(sec(periodTag(), h('div.stat-grid',
        stat(lbl, fmtStat(X.aValue[i], 'flow')),
        isFinite(X.aUtil[i]) ? stat('Of max production', fmtStat(X.aUtil[i], 'pct')) : null,
        a.maxProd ? stat('Max production', fmtStat(a.maxProd[Math.min(st.get('stage'), a.maxProd.length - 1)], 'flow')) : null,
        X.aDeficit[i] > 1e-3 ? stat('Deficit', fmtStat(X.aDeficit[i], 'flow'), 'bad') : null,
        a.type === 'storage' ? stat('Level', fmtStat(X.aLevel[i], 'volume')) : null,
        a.type === 'storage' && isFinite(X.aFill[i]) ? stat('Fill (of max)', fmtStat(X.aFill[i], 'pct')) : null)));
      if (c.hasResults && (a.type === 'citygate' || a.type === 'thermal')) body.appendChild(sec('Origin of the gas consumed', originBar(c.originFrame(st.sel()).assetGrp[i])));
      var ts = chartBox('sm');
      body.appendChild(sec(lbl + ' over time', ts));
      after(function () { assetSeries(ts, c, a, seq, block); });
      body.appendChild(sec('Location', kv([['Node', c.node(a.node).name], ['Type', t.label], ['Process', a.process]])));
    } else if (tab === 'timeseries') {
      var t1 = chartBox();
      body.appendChild(sec('Time series', t1));
      after(function () { assetSeries(t1, c, a, seq, block); });
    } else metadata(body, a);
  }
  function assetSeries(el, c, a, seq, block) {
    var s = [withBand(c, { name: 'Value', data: c.series('asset', 'aValue', a.id, seq, block), unit: 'flow', color: (C.elementTypes[a.type] || {}).color }, 'asset', 'aValue', a.id, block)];
    if (a.maxProd) s.push({ name: 'Max production', data: a.maxProd.slice(0, c.nS), unit: 'flow', color: '#c21f3a', dashed: true, step: 'middle' });
    var d = c.series('asset', 'aDeficit', a.id, seq, block);
    if (d.some(function (v) { return v > 1e-3; })) s.push({ name: 'Deficit', data: d, unit: 'flow', color: '#e11d48', type: 'bar' });
    if (a.type === 'storage') s.push({ name: 'Level', data: c.series('asset', 'aLevel', a.id, seq, block), unit: 'volume', color: '#8b5cf6' });
    CH.timeSeries(el, s);
  }

  function metadata(body, el) {
    var pairs = [['ID', el.id], ['Code', el.code], ['Name', el.name]];
    Object.keys(el.attrs || {}).forEach(function (k) { pairs.push([k, String(el.attrs[k])]); });
    body.appendChild(sec('Attributes', kv(pairs)));
    body.appendChild(sec('Source', kv([['Case', A.current().name], ['Model', A.current().ds.source || '–'], ['Loaded', (A.current().ds.createdAt || '').replace('T', ' ').slice(0, 16)]])));
  }

  // ------------------------------------------------------------ multi-selection
  function multi(body, c, sel) {
    var F = A.frame();
    var kinds = {};
    sel.forEach(function (s) { (kinds[s.kind] = kinds[s.kind] || []).push(s); });
    body.appendChild(h('div.props-head', h('div.props-type', 'Multi-selection', h('button.icon-btn', { title: 'Clear selection', onclick: function () { st.select(null); } }, h('i.fa-solid.fa-xmark'))),
      h('div.props-name', sel.length + ' elements'),
      h('div.props-sub', Object.keys(kinds).map(function (k) { return kinds[k].length + ' ' + (k === 'arc' ? 'arcs' : k + 's'); }).join(' · '))));
    body.appendChild(h('div.props-sec', h('div.chipset',
      h('button.btn.sm', { onclick: UI.openCompareSelection }, 'Compare in table'),
      h('button.btn.sm', { onclick: GV.actions.subsetFromSelection }, 'Filter to selection'),
      h('button.btn.sm', { onclick: function () { var nodes = {}, arcs = {}; sel.forEach(function (s) { if (s.kind === 'node') nodes[s.id] = 1; if (s.kind === 'arc') arcs[s.id] = 1; }); GV.map.fitElements(nodes, arcs); } }, 'Zoom to selection'))));
    Object.keys(kinds).forEach(function (k) {
      var list = kinds[k], vars = A.varsFor(k);
      var v = multiVar[k] = vars.some(function (x) { return x.id === multiVar[k]; }) ? multiVar[k] : vars[0].id;
      var vd = A.varDef(v);
      var picker = h('select', { onchange: function () { multiVar[k] = this.value; render(); } }, vars.map(function (x) { return h('option', { value: x.id, selected: x.id === v }, x.label); }));
      var vals = list.map(function (s) { return F[k][v][c.index(k, s.id)]; });
      var fin = vals.filter(isFinite);
      var sum = fin.reduce(function (p, q) { return p + q; }, 0);
      var statsBox = h('div.stat-grid',
        vd.unit !== 'price' && vd.unit !== 'pct' ? stat('Sum', fmtStat(sum, vd.unit)) : null,
        stat('Mean', fin.length ? fmtStat(sum / fin.length, vd.unit) : '–'),
        stat('Min', fin.length ? fmtStat(Math.min.apply(null, fin), vd.unit) : '–'),
        stat('Max', fin.length ? fmtStat(Math.max.apply(null, fin), vd.unit) : '–'));
      var lst = h('div.list');
      list.forEach(function (s, j) {
        var el = c.element(k, s.id);
        lst.appendChild(h('div.li', { onclick: function () { st.select(k, s.id); } },
          h('span.ic', { style: { background: CH.palette[j % CH.palette.length] } }), h('span.nm', el.name),
          h('span.v', isFinite(vals[j]) ? U.fmt(vals[j], vd.unit) : '–'),
        ));
      });
      var ts = chartBox();
      body.appendChild(sec((k === 'arc' ? 'Arcs' : k === 'node' ? 'Nodes' : 'Assets') + ' (' + list.length + ')', h('div', h('div.field', h('span', 'Variable'), picker), statsBox, h('div', { style: { height: '6px' } }), lst, ts)));
      after(function () {
        CH.timeSeries(ts, list.slice(0, 10).map(function (s, j) {
          return { name: c.element(k, s.id).name, data: c.series(k, v, s.id, st.get('seq'), st.get('block')).map(function (x) { return isFinite(x) ? x : NaN; }), unit: vd.unit, color: CH.palette[j % CH.palette.length] };
        }));
      });
    });
  }
})();
