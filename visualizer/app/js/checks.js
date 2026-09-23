/*
 * Data checks: automatic consistency checks on the loaded case, listed in the "Data checks" panel.
 * Each finding can be clicked to locate the element on the map.
 */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, h = U.h;
  var K = GV.checks = {};

  /** Returns [{ sev: 'error'|'warn'|'info', title, detail, items: [{ kind, id, label, info }] }] */
  K.run = function (c) {
    var out = [], T = c.T, EPS = 1e-3;
    function add(sev, title, detail, items) { if (items === null || (items && items.length) || !items) out.push({ sev: sev, title: title, detail: detail, items: items || [] }); }
    function tLabel(t) { var s = Math.floor(t / (c.nQ * c.nB)), r = t % (c.nQ * c.nB), q = Math.floor(r / c.nB), b = r % c.nB; return c.periodLabel(s) + (c.nQ > 1 ? ' · scen. ' + (q + 1) : '') + ' · block ' + (b + 1); }

    if (!c.hasResults) add('error', 'No result files', 'Only network inputs were found (etranflw.csv, endcmg.csv, … are missing).', null);
    if ((c.ds.warnings || []).length) add('warn', 'Reading warnings', 'Messages from the SDDP file parser.', c.ds.warnings.map(function (w) { return { label: w }; }));

    add('error', 'Nodes without coordinates', 'These nodes cannot be drawn on the map (gcnode*.dat).',
      c.nodes.filter(function (n) { return n.lat === null; }).map(function (n) { return { kind: 'node', id: n.id, label: n.name }; }));
    add('warn', 'Isolated nodes', 'Nodes without any pipeline, sea route or converter.',
      c.nodes.map(function (n, i) { return c.nodeArcs[i].length ? null : { kind: 'node', id: n.id, label: n.name, info: n.assets.length + ' assets' }; }).filter(Boolean));
    add('error', 'Arcs connecting a node to itself', '', c.arcs.filter(function (a) { return a.from === a.to; }).map(function (a) { return { kind: 'arc', id: a.id, label: a.name }; }));

    var viol = [], noCap = [];
    c.arcs.forEach(function (a, ai) {
      var nv = 0, worst = 0, wt = 0, nc = 0;
      for (var t = 0; t < T; t++) {
        var u = c.utilT(ai, t);
        if (u === Infinity) nc++;
        else if (u > 1.0001) { nv++; if (u > worst) { worst = u; wt = t; } }
      }
      if (nv) viol.push({ kind: 'arc', id: a.id, label: a.name, info: nv + ' block(s), max ' + U.fmtNum(worst * 100, 1) + '% (' + tLabel(wt) + ')' });
      if (nc) noCap.push({ kind: 'arc', id: a.id, label: a.name, info: nc + ' block(s)' });
    });
    add('error', 'Flow above capacity', 'Utilization above 100 % in at least one block.', viol);
    add('error', 'Flow on arcs out of service', 'Flow reported where the capacity is zero in that period.', noCap);

    var bal = [];
    c.nodes.forEach(function (n, i) {
      var worst = 0, wt = 0;
      for (var t = 0; t < T; t++) {
        var r = c.ns.pipeIn[i][t] + c.ns.regasIn[i][t] - c.ns.pipeOut[i][t] - c.ns.regasOut[i][t] + c.ns.production[i][t] + c.ns.lng[i][t] + c.ns.stDis[i][t] - c.ns.citygate[i][t] - c.ns.thermal[i][t] - c.ns.stChg[i][t];
        var tol = Math.max(0.5, 0.002 * (c.ns.pipeIn[i][t] + c.ns.regasIn[i][t] + c.ns.production[i][t] + c.ns.lng[i][t]));
        if (Math.abs(r) > tol && Math.abs(r) > Math.abs(worst)) { worst = r; wt = t; }
      }
      if (worst) bal.push({ kind: 'node', id: n.id, label: n.name, info: 'residual ' + U.fmt(worst, 'flow', { sign: true }) + ' (' + tLabel(wt) + ')' });
    });
    add('warn', 'Nodal balance does not close', 'Inflows − outflows + injections − withdrawals differs from zero by more than rounding (0.2 % or 0.5 mil m³/d).', bal);

    var over = [], def = [], stor = [];
    c.assets.forEach(function (x, xi) {
      var v = c.assetVal[xi], d = c.assetDef[xi];
      if (x.maxProd) {
        var n = 0, worst = 0;
        for (var t = 0; t < T; t++) { var s = Math.floor(t / (c.nQ * c.nB)), mp = x.maxProd[Math.min(s, x.maxProd.length - 1)]; if (v[t] > mp * 1.001 + 0.01) { n++; worst = Math.max(worst, v[t] - mp); } }
        if (n) over.push({ kind: 'asset', id: x.id, label: x.name, info: n + ' block(s), up to +' + U.fmt(worst, 'flow') });
      }
      var nd = 0, sum = 0;
      for (var t2 = 0; t2 < T; t2++) if (d[t2] > EPS) { nd++; sum = Math.max(sum, d[t2]); }
      if (nd) def.push({ kind: 'asset', id: x.id, label: x.name, info: nd + ' block(s), max ' + U.fmt(sum, 'flow') });
      if (x.type === 'storage' && x.maxStorage) {
        var lv = c.assetLevel[xi], bad = 0;
        for (var t3 = 0; t3 < T; t3++) if (lv[t3] < -EPS || lv[t3] > x.maxStorage * 1.001) bad++;
        if (bad) stor.push({ kind: 'asset', id: x.id, label: x.name, info: bad + ' block(s) outside 0 – ' + U.fmt(x.maxStorage, 'volume') });
      }
    });
    add('warn', 'Production above its maximum', 'Compared with MaxProd (including dated modifications).', over);
    add('warn', 'Unserved demand (deficit)', '', def);
    add('warn', 'Storage level outside its limits', '', stor);

    var neg = c.nodes.map(function (n, i) {
      var cnt = 0; for (var t = 0; t < T; t++) if (c.ns.cmg[i][t] <= 0 && (c.ns.citygate[i][t] + c.ns.thermal[i][t]) > EPS) cnt++;
      return cnt ? { kind: 'node', id: n.id, label: n.name, info: cnt + ' block(s)' } : null;
    }).filter(Boolean);
    add('info', 'Demand at nodes with zero or negative marginal cost', 'Often a sign of a free or surplus source nearby.', neg);
    if (Object.keys(GV.layers.refs).length) {
      add('info', 'Pipelines not matched to the reference traces', 'Drawn as straight lines in “Real (EPE)” mode. Add a geometry.geojson to the case to fix them.',
        c.arcs.map(function (a, i) { return a.kind === 'pipeline' && !c.isRouted(i) ? { kind: 'arc', id: a.id, label: a.name } : null; }).filter(Boolean));
    }
    add('info', 'Co-located nodes drawn with an offset', 'Nodes with identical coordinates (e.g. LNG tank and gas side) are shifted slightly for display.',
      c.nodes.filter(function (n) { return n.attrs && n.attrs.Display; }).map(function (n) { return { kind: 'node', id: n.id, label: n.name, info: n.attrs.Display.replace('Offset from co-located node ', 'with ') }; }));
    return out;
  };

  // ---------------------------------------------------------------- panel
  var cache = {}, openGroups = {};
  K.init = function () {
    st.on('caseId casesVersion refsVersion', render);
    render();
  };
  function render() {
    var body = U.$('#checks-body'), c = A.current(); if (!body) return;
    U.clear(body);
    if (!c) return;
    var res = cache[c.id + '|' + st.get('refsVersion')] || (cache[c.id + '|' + st.get('refsVersion')] = K.run(c));
    var cnt = { error: 0, warn: 0, info: 0 };
    res.forEach(function (r) { cnt[r.sev]++; });
    body.appendChild(h('div.chk-sum',
      h('span.chk-b.error', cnt.error + ' errors'), h('span.chk-b.warn', cnt.warn + ' warnings'), h('span.chk-b.info', cnt.info + ' notes'),
      h('span.muted.small', ' · ' + c.name)));
    if (!res.length) body.appendChild(h('div.hint', { style: { padding: '8px 10px' } }, 'No issues found.'));
    ['error', 'warn', 'info'].forEach(function (sev) {
      res.filter(function (r) { return r.sev === sev; }).forEach(function (r) {
        var key = r.title, isOpen = openGroups[key] !== undefined ? openGroups[key] : sev === 'error';
        var grp = h('div.chk-grp.' + sev);
        grp.appendChild(h('div.chk-h', { onclick: function () { openGroups[key] = !isOpen; render(); } },
          h('span.chk-dot'), h('b', r.title), h('span.n', r.items.length || ''), h('span.chev', r.items.length ? h(isOpen ? 'i.fa-solid.fa-chevron-down' : 'i.fa-solid.fa-chevron-right') : '')));
        if (isOpen) {
          if (r.detail) grp.appendChild(h('div.chk-d', r.detail));
          var list = h('div.list');
          r.items.slice(0, 200).forEach(function (it) {
            list.appendChild(h('div.li' + (it.kind ? '' : '.static'), { onclick: it.kind ? function () { st.select(it.kind, it.id); GV.map.flyToElement(it.kind, it.id, { zoom: 6.5 }); } : null },
              h('span.ic', { style: { background: 'transparent' } }), h('span.nm', { title: it.label }, it.label), h('span.v', it.info || '')));
          });
          grp.appendChild(list);
        }
        body.appendChild(grp);
      });
    });
  }
  K.render = render;
})();
