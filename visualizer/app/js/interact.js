/* Tooltip, node / arc popup, context menu, actions (drill-down, topology, picking) and global search. */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, h = U.h;

  // ======================= tooltip (hover) =======================
  var T = GV.tooltip = {};
  /** hit: { kind, id, layer, ref } from GV.map.pickAt */
  T.show = function (hit, ev) {
    var el = U.$('#tooltip'), c = A.current(); if (!c) return;
    var html = hit.kind === 'ref' ? refHtml(hit) : T.html(hit.kind, hit.id, hit.layer);
    if (!html) { T.hide(); return; }
    el.innerHTML = html;
    el.hidden = false;
    var r = el.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    var x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > W - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > H - 8) y = ev.clientY - r.height - 14;
    el.style.left = x + 'px'; el.style.top = y + 'px';
  };
  T.hide = function () { var el = U.$('#tooltip'); if (el) el.hidden = true; };

  function refHtml(hit) {
    var p = hit.ref.properties, l = hit.layer, it = GV.layers.items(l, A.current()).filter(function (x) { return x.id === p.eid; })[0];
    var props = it ? it.f.properties : {};
    var rows = Object.keys(props).filter(function (k) { return k !== 'name' && props[k] !== '' && props[k] !== null; }).slice(0, 9)
      .map(function (k) { return row(U.escapeHtml(k), U.escapeHtml(String(props[k]).slice(0, 60))); }).join('');
    return '<div class="tt-head"><span class="tt-type">' + U.escapeHtml(l ? l.name : 'Reference') + '</span><b>' + U.escapeHtml(props.name || '—') + '</b></div><table>' + rows + '</table>';
  }
  /** Values of the encodings of the layer under the cursor (colour, size, arrows, labels). */
  function layerRows(layer, kind, id) {
    if (!layer || layer.type === 'ref') return '';
    var LY = GV.layers, ctx = LY.context(), c = ctx.c;
    var it = LY.items(layer, c).filter(function (x) { return x.id === id; })[0];
    if (!it) return '';
    var seen = {}, out = '';
    [layer.color.field, layer.size.field, layer.arrows && layer.arrows.show ? layer.arrows.field : null].concat(layer.labels.show ? layer.labels.fields : []).forEach(function (fid) {
      if (!fid || seen[fid] || fid === 'name') return; seen[fid] = true;
      var f = LY.field(layer, fid); if (!f) return;
      var v = LY.value(layer, fid, it, ctx);
      out += row(U.escapeHtml(f.label.replace(/ \(input\)$/, '')), f.type === 'num' ? (isFinite(v) ? U.fmt(v, f.unit || 'count', { sign: LY.isDelta(layer, fid, ctx) }) : '–') : U.escapeHtml(String(v)));
    });
    if (layer.type === 'asset' && it.agg) out = row('Assets', it.assets.map(function (j) { return U.escapeHtml(c.assets[j].name); }).slice(0, 4).join('<br>') + (it.assets.length > 4 ? '<br>+' + (it.assets.length - 4) + ' more' : '')) + out;
    return out ? '<tr><td colspan="2" class="tt-layer">' + U.escapeHtml(layer.name) + '</td></tr>' + out : '';
  }

  function row(k, v, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th>' + k + '</th><td>' + v + '</td></tr>'; }
  function deltaStr(kind, varId, i, unit) {
    var ref = A.refValues(kind, varId); if (!ref) return '';
    var cur = A.frame()[kind][varId][i], d = cur - ref[i];
    if (!isFinite(d)) return '';
    return ' <span class="delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + U.fmt(d, unit, { sign: true, noUnit: true }) + '</span>';
  }
  T.html = function (kind, id, layer) {
    var c = A.current(), F = A.frame(), i = c.index(kind, id), el = c.element(kind, id);
    if (!el) return '';
    var head = '<div class="tt-head"><span class="tt-type">' + U.escapeHtml(c.typeLabel(kind, el)) + '</span><b>' + U.escapeHtml(el.name) + '</b></div>';
    var rows = '';
    if (layer && layer.type === 'asset' && layer.aggregate !== 'each' && kind === 'node') {
      rows = layerRows(layer, kind, id);
      var foot0 = '<div class="tt-foot">' + U.escapeHtml(c.periodLabel(st.get('stage'))) + ' · ' + blockLabel() + ' · click for all elements at this node</div>';
      return head + '<table>' + rows + '</table>' + foot0;
    }
    if (kind === 'node') {
      var n = F.node;
      rows += row('Marginal cost', U.fmt(n.cmg[i], 'price') + deltaStr('node', 'cmg', i, 'price'));
      rows += row('Injection', U.fmt(n.injection[i], 'flow'));
      rows += row('Withdrawal', U.fmt(n.withdrawal[i], 'flow'));
      rows += row('Pipeline in / out', U.fmt(n.pipeIn[i] + n.regasIn[i], 'flow', { noUnit: true }) + ' / ' + U.fmt(n.pipeOut[i] + n.regasOut[i], 'flow'));
      rows += row('Net injection', U.fmt(n.net[i], 'flow', { sign: true }));
      if (n.deficit[i] > 1e-3) rows += row('Deficit', U.fmt(n.deficit[i], 'flow'), 'bad');
      rows += row('Assets', el.assets.length);
    } else if (kind === 'arc') {
      var a = F.arc, f = a.flow[i];
      var from = c.node(el.from).name, to = c.node(el.to).name;
      var dir = a.dir[i] > 0 ? from + ' → ' + to : a.dir[i] < 0 ? to + ' → ' + from : 'no flow';
      var u = a.util[i];
      var ucls = u > 1.0001 ? 'bad' : u >= 0.95 ? 'warn' : '';
      rows += row('Flow', U.fmt(Math.abs(f), 'flow') + deltaStr('arc', 'absFlow', i, 'flow'));
      rows += row('Capacity', U.fmt(a.capacity[i], 'flow') + (a.capTF[i] > 0 ? ' <span class="muted">(rev. ' + U.fmt(a.capTF[i], 'flow', { noUnit: true }) + ')</span>' : ''));
      rows += row('Utilization', (isNaN(u) ? 'out of service' : u === Infinity ? 'flow w/o capacity' : U.fmt(u, 'pct')) + (c.nB > 1 && st.get('block') < 0 && isFinite(a.utilPeak[i]) ? ' <span class="muted">peak ' + U.fmt(a.utilPeak[i], 'pct') + '</span>' : ''), ucls);
      rows += row('Direction', U.escapeHtml(dir));
      if (isFinite(a.dcmg[i])) rows += row('Δ marginal cost', U.fmt(a.dcmg[i], 'price', { sign: true }));
    } else {
      var x = F.asset;
      var t = GV.config.elementTypes[el.type] || {};
      var lbl = t.balance === 'injection' ? 'Production' : t.balance === 'storage' ? 'Discharge (+) / charge (−)' : 'Consumption';
      rows += row(lbl, U.fmt(x.aValue[i], 'flow') + deltaStr('asset', 'aValue', i, 'flow'));
      if (isFinite(x.aUtil[i])) rows += row('Of max production', U.fmt(x.aUtil[i], 'pct'));
      if (x.aDeficit[i] > 1e-3) rows += row('Deficit', U.fmt(x.aDeficit[i], 'flow'), 'bad');
      if (el.type === 'storage') rows += row('Level', U.fmt(x.aLevel[i], 'volume'));
      rows += row('Node', U.escapeHtml(c.node(el.node).name));
    }
    rows += layerRows(layer, kind, id);
    var foot = '<div class="tt-foot">' + U.escapeHtml(c.periodLabel(st.get('stage'))) + ' · ' + blockLabel() + (st.get('pick') ? ' · <b>click to pick</b>' : '') + '</div>';
    return head + '<table>' + rows + '</table>' + foot;
  };
  function blockLabel() { var b = st.get('block'); return b < 0 ? 'avg. of blocks' : 'block ' + (b + 1); }
  T.blockLabel = blockLabel;

  // ======================= popup (click on a node / arc) =======================
  var P = GV.popup = {}, popup = null, current = null;
  P.close = function () { if (popup) { popup.remove(); popup = null; current = null; } };
  /** Called by the map on a click; honours the "clicking a node opens" setting. */
  P.onClick = function (hit, lngLat) {
    var mode = st.get('clickMode') || 'popup';
    var target = hit.kind === 'asset' ? { kind: 'node', id: A.current().asset(hit.id).node, focus: hit.id } : hit;
    if (mode !== 'panel') P.show(target, lngLat);
    if (mode !== 'popup') GV.ui.openProps('overview');
  };
  P.show = function (target, lngLat) {
    var c = A.current(); if (!c) return;
    current = target;
    var pos = lngLat;
    if (target.kind === 'node') { var n = c.node(target.id); pos = [n.dlon, n.dlat]; }
    else if (!pos) { var g = GV.map.geom()[c.arcIx[target.id]]; if (!g) return; pos = U.midpoint(g); }
    if (!popup) {
      popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '400px', className: 'gv-popup', offset: 12 });
      popup.on('close', function () { popup = null; current = null; });
    }
    popup.setLngLat(pos).setDOMContent(content(target)).addTo(GV.map.map);
  };
  P.refresh = function () { if (popup && current && A.current() && A.current().element(current.kind, current.id)) popup.setDOMContent(content(current)); else P.close(); };
  st.on('stage seq block units compare caseId bins', function () { P.refresh(); });

  function valRow(opts) {
    // opts: { name, sub, value, unit, color, bar (0..1+), badge, cls, onclick, focus }
    var r = h('div.pp-row' + (opts.focus ? '.focus' : ''), { onclick: opts.onclick, title: opts.title || '' },
      h('span.pp-ic', { style: { background: opts.color || '#94a3b8' } }),
      h('span.pp-name', opts.name, opts.sub ? h('small', opts.sub) : null),
      h('span.pp-val' + (opts.cls ? '.' + opts.cls : ''), opts.value));
    if (opts.bar !== undefined && isFinite(opts.bar)) r.appendChild(h('span.pp-bar', h('i', { style: { width: Math.min(100, opts.bar * 100) + '%', background: A.utilColor(opts.bar) } })));
    return r;
  }
  function section(title, total, rows) {
    if (!rows.length) return null;
    return h('div.pp-sec', h('div.pp-h', title, total !== null ? h('span', total) : null), rows);
  }
  function content(target) {
    var c = A.current(), F = A.frame();
    return target.kind === 'node' ? nodeContent(c, F, target) : arcContent(c, F, target);
  }
  function nodeContent(c, F, target) {
    var n = c.node(target.id), i = c.nodeIx[n.id], N = F.node, CFG = GV.config.elementTypes;
    var box = h('div.pp');
    var ref = A.refValues('node', 'cmg'), d = ref ? N.cmg[i] - ref[i] : NaN;
    box.appendChild(h('div.pp-head',
      h('div.pp-type', 'Node · ' + ((c.ds.regions.filter(function (r) { return r.id === n.region; })[0] || {}).name || n.region) + ' · ' + c.periodLabel(st.get('stage')) + ' · ' + blockLabel()),
      h('div.pp-title', n.name),
      h('div.pp-kpis',
        h('div', h('span', 'Marginal cost'), h('b', U.fmt(N.cmg[i], 'price')), isFinite(d) && Math.abs(d) > 1e-9 ? h('small.delta' + (d > 0 ? '.up' : '.down'), U.fmt(d, 'price', { sign: true, noUnit: true })) : null),
        h('div', h('span', 'Injection'), h('b', U.fmt(N.injection[i] + N.pipeIn[i] + N.regasIn[i], 'flow'))),
        h('div', h('span', 'Withdrawal'), h('b', U.fmt(N.withdrawal[i] + N.pipeOut[i] + N.regasOut[i], 'flow'))),
        N.deficit[i] > 1e-3 ? h('div.bad', h('span', 'Deficit'), h('b', U.fmt(N.deficit[i], 'flow'))) : null)));
    var groups = { demand: [], supply: [], storage: [] }, tot = { demand: 0, supply: 0 };
    n.assets.forEach(function (id) {
      var j = c.assetIx[id], a = c.assets[j], t = CFG[a.type] || {}, v = F.asset.aValue[j], def = F.asset.aDeficit[j];
      var sel = function () { st.select('asset', a.id); };
      if (t.balance === 'withdrawal') {
        tot.demand += v;
        groups.demand.push({ v: v, el: valRow({ name: a.name, sub: t.label, value: U.fmt(v, 'flow') + (def > 1e-3 ? ' (deficit ' + U.fmt(def, 'flow', { noUnit: true }) + ')' : ''), cls: def > 1e-3 ? 'bad' : '', color: t.color, onclick: sel, focus: target.focus === a.id }) });
      } else if (t.balance === 'injection') {
        tot.supply += v;
        var mp = a.maxProd ? a.maxProd[Math.min(st.get('stage'), a.maxProd.length - 1)] : 0;
        groups.supply.push({ v: v, el: valRow({ name: a.name, sub: t.label + (mp ? ' · max ' + U.fmt(mp, 'flow', { noUnit: true }) : ''), value: U.fmt(v, 'flow'), color: t.color, onclick: sel, focus: target.focus === a.id }) });
      } else {
        groups.storage.push({ v: Math.abs(v), el: valRow({ name: a.name, sub: 'level ' + U.fmt(F.asset.aLevel[j], 'volume'), value: (v >= 0 ? 'discharge ' : 'charge ') + U.fmt(Math.abs(v), 'flow'), color: t.color, onclick: sel, focus: target.focus === a.id }) });
      }
    });
    function sorted(list) { return list.sort(function (p, q) { return Math.abs(q.v) - Math.abs(p.v); }).map(function (x) { return x.el; }); }
    var ins = [], outs = [], regas = [];
    c.nodeArcs[i].forEach(function (ai) {
      var a = c.arcs[ai], f = F.arc.flow[ai], u = F.arc.util[ai];
      var other = c.node(a.to === n.id ? a.from : a.to);
      var incoming = (f > 0 && a.to === n.id) || (f < 0 && a.from === n.id);
      var rowEl = valRow({ name: a.name, sub: (Math.abs(f) < 1e-3 ? '' : incoming ? 'from ' : 'to ') + other.name, value: U.fmt(Math.abs(f), 'flow') + (isFinite(u) ? ' · ' + U.fmt(u, 'pct') : ''), bar: u, color: GV.config.kindColors[a.kind], onclick: function () { st.select('arc', a.id); } });
      var item = { v: Math.abs(f), el: rowEl };
      if (a.kind === 'regas') regas.push(item);
      else if (Math.abs(f) < 1e-3) (a.to === n.id ? ins : outs).push(item);
      else (incoming ? ins : outs).push(item);
    });
    var sumIn = N.pipeIn[i], sumOut = N.pipeOut[i];
    [section('Demand', U.fmt(tot.demand, 'flow'), sorted(groups.demand)),
      section('Production / supply', U.fmt(tot.supply, 'flow'), sorted(groups.supply)),
      section('Storage', null, sorted(groups.storage)),
      section('Transport in', U.fmt(sumIn, 'flow'), sorted(ins)),
      section('Transport out', U.fmt(sumOut, 'flow'), sorted(outs)),
      section('Regasification', U.fmt(N.regasIn[i] + N.regasOut[i], 'flow'), sorted(regas))].forEach(function (s) { if (s) box.appendChild(s); });
    if (c.hasResults) box.appendChild(h('div.pp-sec', h('div.pp-h', 'Gas origin (mix at the node)'), GV.ui.originBar(c.originFrame(st.sel()).nodeGrp[i])));
    var ok = Math.abs(N.residual[i]) <= Math.max(0.5, 0.002 * (N.throughput[i] + N.injection[i]));
    box.appendChild(h('div.pp-note' + (ok ? '' : '.bad'), 'Balance residual: ' + U.fmt(N.residual[i], 'flow') + (ok ? ' (closes)' : '')));
    box.appendChild(h('div.pp-actions',
      h('button.btn.sm', { onclick: function () { st.select('node', n.id); GV.ui.openProps('results'); } }, 'Balance'),
      h('button.btn.sm', { onclick: function () { st.select('node', n.id); GV.ui.openProps('timeseries'); } }, 'Time series'),
      h('button.btn.sm', { onclick: function () { GV.actions.run('upstream', 'node', n.id); } }, 'Upstream'),
      h('button.btn.sm', { onclick: function () { GV.actions.run('downstream', 'node', n.id); } }, 'Downstream'),
      h('button.btn.sm', { onclick: function () { st.select('node', n.id); GV.ui.openProps('overview'); } }, 'Details')));
    return box;
  }
  function arcContent(c, F, target) {
    var a = c.arc(target.id), i = c.arcIx[a.id], R = F.arc, u = R.util[i];
    var from = c.node(a.from), to = c.node(a.to);
    var box = h('div.pp');
    box.appendChild(h('div.pp-head',
      h('div.pp-type', GV.config.elementTypes[a.kind].label + ' · ' + c.periodLabel(st.get('stage')) + ' · ' + blockLabel()),
      h('div.pp-title', a.name),
      h('div.pp-kpis',
        h('div', h('span', 'Flow'), h('b', U.fmt(R.absFlow[i], 'flow'))),
        h('div', h('span', 'Capacity'), h('b', U.fmt(R.capacity[i], 'flow'))),
        h('div' + (u > 1.0001 ? '.bad' : ''), h('span', 'Utilization'), h('b', isFinite(u) ? U.fmt(u, 'pct') : '–')))));
    if (R.capDual[i] > 0.01) box.appendChild(h('div.pp-sec', h('div.pp-h', 'Capacity dual'), h('div.pp-row', h('span.pp-ic', { style: { background: '#c21f3a' } }), h('span.pp-name', 'Value of +1 unit of capacity'), h('span.pp-val', U.fmt(R.capDual[i], 'price')))));
    if (c.hasResults) box.appendChild(h('div.pp-sec', h('div.pp-h', 'Gas origin'), GV.ui.originBar(c.originFrame(st.sel()).arcGrp[i])));
    box.appendChild(h('div.pp-sec', h('div.pp-h', 'Direction'), h('div.pp-row', h('span.pp-name', R.dir[i] > 0 ? from.name + ' → ' + to.name : R.dir[i] < 0 ? to.name + ' → ' + from.name : 'no flow'))));
    box.appendChild(h('div.pp-sec', h('div.pp-h', 'Ends'),
      [from, to].map(function (n) { var ni = c.nodeIx[n.id]; return valRow({ name: n.name, value: U.fmt(F.node.cmg[ni], 'price'), color: GV.config.regionColors[n.region], onclick: function () { st.select('node', n.id); P.show({ kind: 'node', id: n.id }); } }); })));
    box.appendChild(h('div.pp-actions',
      h('button.btn.sm', { onclick: function () { st.select('arc', a.id); GV.ui.openProps('results'); } }, 'Capacity use'),
      h('button.btn.sm', { onclick: function () { st.select('arc', a.id); GV.ui.openProps('timeseries'); } }, 'Time series'),
      h('button.btn.sm', { onclick: function () { GV.actions.run('upstream', 'arc', a.id); } }, 'Upstream'),
      h('button.btn.sm', { onclick: function () { GV.actions.run('downstream', 'arc', a.id); } }, 'Downstream')));
    return box;
  }
  P.showRef = function (hit, lngLat) {
    var html = refHtml(hit);
    P.close();
    popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '360px', className: 'gv-popup', offset: 8 });
    var el = h('div.pp', { html: html.replace('class="tt-head"', 'class="pp-head tt-head"') });
    popup.setLngLat(lngLat).setDOMContent(el).addTo(GV.map.map);
    popup.on('close', function () { popup = null; current = null; });
  };

  // ======================= context menu =======================
  var CM = GV.contextMenu = {};
  CM.hide = function () { var m = U.$('#ctxmenu'); if (m) m.hidden = true; };
  function place(menu, ev) {
    menu.hidden = false;
    var r = menu.getBoundingClientRect(), x = ev.clientX, y = ev.clientY;
    if (x + r.width > window.innerWidth - 6) x = window.innerWidth - r.width - 6;
    if (y + r.height > window.innerHeight - 6) y = window.innerHeight - r.height - 6;
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
  }
  CM.show = function (kind, id, ev) {
    GV.tooltip.hide();
    var menu = U.clear(U.$('#ctxmenu')), c = A.current(), el = c.element(kind, id);
    var items = GV.config.contextMenus[kind] || [];
    var multi = st.get('selection').length > 1;
    menu.appendChild(h('div.cm-title', c.typeLabel(kind, el) + ': ' + el.name));
    items.forEach(function (it) {
      if (it.sep) { menu.appendChild(h('div.cm-sep')); return; }
      menu.appendChild(h('button.cm-item', { onclick: function () { CM.hide(); GV.actions.run(it.id, kind, id); } }, it.label));
    });
    if (multi) {
      menu.appendChild(h('div.cm-sep'));
      menu.appendChild(h('button.cm-item', { onclick: function () { CM.hide(); GV.ui.openCompareSelection(); } }, 'Compare selected (' + st.get('selection').length + ')'));
      menu.appendChild(h('button.cm-item', { onclick: function () { CM.hide(); GV.actions.subsetFromSelection(); } }, 'Filter to selection'));
    }
    place(menu, ev);
  };
  CM.showMap = function (ev, lngLat) {
    var menu = U.clear(U.$('#ctxmenu'));
    menu.appendChild(h('div.cm-title', lngLat.lat.toFixed(3) + ', ' + lngLat.lng.toFixed(3)));
    [['Center map here', function () { GV.map.map.easeTo({ center: lngLat }); }],
      ['Zoom to network', function () { GV.map.fitNetwork(); }],
      ['Clear selection & highlight', function () { st.set({ selection: [], highlight: null }); }],
      ['Copy coordinates', function () { U.copy(lngLat.lat.toFixed(5) + ', ' + lngLat.lng.toFixed(5)); }]
    ].forEach(function (p) { menu.appendChild(h('button.cm-item', { onclick: function () { CM.hide(); p[1](); } }, p[0])); });
    place(menu, ev);
  };
  document.addEventListener('mousedown', function (e) { var m = U.$('#ctxmenu'); if (m && !m.hidden && !m.contains(e.target)) CM.hide(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      CM.hide();
      if (st.get('pick')) { st.set({ pick: null }); U.toast('Picking cancelled'); }
      else if (st.get('highlight')) st.set({ highlight: null });
      else st.set({ selection: [] });
    }
  });

  // ======================= actions =======================
  var ACT = GV.actions = {};
  ACT.drill = function (kind, id) {
    GV.map.flyToElement(kind, id, { zoom: 7.5 });
    GV.ui.openProps(kind === 'arc' ? 'results' : 'results');
  };
  ACT.highlight = function (label, sets) {
    st.set({ highlight: { label: label, nodes: sets.nodes || {}, arcs: sets.arcs || {} } });
  };
  ACT.run = function (action, kind, id) {
    var c = A.current(), F = A.frame(), el = c.element(kind, id);
    var ni = kind === 'node' ? c.nodeIx[id] : -1;
    switch (action) {
      case 'details': st.select(kind, id); GV.ui.openProps('overview'); break;
      case 'timeseries': st.select(kind, id); GV.ui.openProps('timeseries'); break;
      case 'balance': st.select(kind, id); GV.ui.openProps('results'); break;
      case 'capacity': st.select(kind, id); GV.ui.openProps('results'); break;
      case 'compareWith':
        st.set({ pick: { action: 'compare', from: { kind: kind, id: id } } });
        U.toast('Click another element to compare with ' + el.name + ' (Esc to cancel)');
        break;
      case 'pathTo':
        st.set({ pick: { action: 'path', from: { kind: kind, id: id } } });
        U.toast('Click the destination node (Esc to cancel)');
        break;
      case 'upstream':
      case 'downstream': {
        var dir = action === 'upstream' ? -1 : 1, res;
        if (kind === 'node') res = c.trace([ni], dir, F);
        else {
          var ai = c.arcIx[id], d = F.arc.dir[ai] || 1;
          var src = c.nodeIx[d > 0 ? el.from : el.to], dst = c.nodeIx[d > 0 ? el.to : el.from];
          res = c.trace([dir < 0 ? src : dst], dir, F, [ai]);
        }
        ACT.highlight((dir < 0 ? 'Upstream of ' : 'Downstream of ') + el.name, res);
        U.toast((dir < 0 ? 'Upstream' : 'Downstream') + ': ' + Object.keys(res.nodes).length + ' nodes, ' + Object.keys(res.arcs).length + ' arcs (by current flow)');
        break;
      }
      case 'connected': {
        var arcs = {}, nodes = {}; nodes[id] = true;
        c.nodeArcs[ni].forEach(function (a) { var ar = c.arcs[a]; arcs[ar.id] = true; nodes[ar.from] = true; nodes[ar.to] = true; });
        ACT.highlight('Connected to ' + el.name, { nodes: nodes, arcs: arcs });
        break;
      }
      case 'hops': ACT.highlight('2 hops from ' + el.name, c.neighbourhood(ni, 2)); break;
      case 'component': {
        var comp = c.neighbourhood(ni, Infinity, st.get('stage'));
        addFilter({ id: 'f-sub', type: 'subset', label: 'Component of ' + el.name, nodes: comp.nodes, arcs: comp.arcs });
        break;
      }
      case 'filterFrom': {
        var nb = c.trace([ni], 1, F);
        nb.nodes[id] = true;
        addFilter({ id: 'f-sub', type: 'subset', label: 'Network from ' + el.name, nodes: nb.nodes, arcs: nb.arcs });
        break;
      }
      case 'copyId': U.copy(id); break;
      case 'center': GV.map.flyToElement(kind, id); break;
      case 'zoomTo': GV.map.flyToElement('arc', id); break;
      case 'parentNode': st.select('node', el.node); GV.map.flyToElement('node', el.node); break;
    }
  };
  function addFilter(f) {
    var list = st.get('filters').filter(function (x) { return x.id !== f.id; });
    list.push(f);
    st.set({ filters: list });
  }
  ACT.addFilter = addFilter;
  ACT.subsetFromSelection = function () {
    var nodes = {}, arcs = {}, c = A.current();
    st.get('selection').forEach(function (s) {
      if (s.kind === 'node') nodes[s.id] = true;
      else if (s.kind === 'arc') { arcs[s.id] = true; var a = c.arc(s.id); nodes[a.from] = true; nodes[a.to] = true; }
      else nodes[c.asset(s.id).node] = true;
    });
    addFilter({ id: 'f-sub', type: 'subset', label: 'Selection subset (' + st.get('selection').length + ')', nodes: nodes, arcs: arcs });
  };
  ACT.completePick = function (hit) {
    var p = st.get('pick'); if (!p) return;
    if (!hit) { U.toast('Nothing there. Click an element, or press Esc'); return; }
    var c = A.current();
    st.set({ pick: null });
    if (p.action === 'compare') {
      st.selectMany([p.from, { kind: hit.kind, id: hit.id }], false);
      GV.ui.openCompareSelection();
    } else if (p.action === 'path') {
      var target = hit.kind === 'node' ? hit.id : hit.kind === 'asset' ? c.asset(hit.id).node : c.arc(hit.id).to;
      var res = c.path(c.nodeIx[p.from.id], c.nodeIx[target], st.get('stage'));
      if (!res) { U.toast('No path in service between these nodes', 'warn'); return; }
      ACT.highlight('Path ' + c.node(p.from.id).name + ' → ' + c.node(target).name, res);
      GV.map.fitElements(res.nodes, res.arcs);
      U.toast('Path: ' + res.sequence.length + ' nodes, ' + Math.round(res.length) + ' km');
    }
  };

  // ======================= search =======================
  var SR = GV.search = {};
  SR.index = function () {
    var c = A.current(); if (!c) return [];
    var list = [];
    c.nodes.forEach(function (n) { list.push({ kind: 'node', id: n.id, name: n.name, type: 'Node', sub: n.region + ' · ' + n.assets.length + ' assets' }); });
    c.arcs.forEach(function (a) { list.push({ kind: 'arc', id: a.id, name: a.name, type: GV.config.elementTypes[a.kind].label, sub: c.node(a.from).name + ' → ' + c.node(a.to).name }); });
    c.assets.forEach(function (x) { list.push({ kind: 'asset', id: x.id, name: x.name, type: GV.config.elementTypes[x.type].label, sub: 'at ' + c.node(x.node).name }); });
    return list;
  };
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  SR.query = function (q, limit) {
    q = norm(q.trim()); if (!q) return [];
    var terms = q.split(/\s+/);
    return SR.index().map(function (it) {
      var hay = norm(it.name + ' ' + it.id + ' ' + it.type + ' ' + it.sub);
      if (!terms.every(function (t) { return hay.indexOf(t) >= 0; })) return null;
      var nm = norm(it.name), score = nm === q ? 0 : nm.indexOf(q) === 0 ? 1 : norm(it.id) === q ? 0 : nm.indexOf(q) >= 0 ? 2 : 3;
      return { it: it, score: score + (it.kind === 'node' ? 0 : 0.5) };
    }).filter(Boolean).sort(function (a, b) { return a.score - b.score || a.it.name.localeCompare(b.it.name); }).slice(0, limit || 12).map(function (x) { return x.it; });
  };
  SR.go = function (it) {
    st.select(it.kind, it.id);
    GV.map.flyToElement(it.kind, it.id, { zoom: it.kind === 'asset' ? 8 : 7 });
    GV.ui.openProps('overview');
  };
})();
