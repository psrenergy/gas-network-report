/* ECharts helpers: theme-aware base options and the analytic chart builders. */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app;
  var CH = GV.charts = {};
  var live = [];

  function th() {
    var dark = A.isDark();
    return {
      text: dark ? '#aab3c0' : '#4b5666', strong: dark ? '#e4e8ee' : '#1c2430',
      grid: dark ? '#2b3240' : '#e8ecf1', axis: dark ? '#4a5466' : '#c5ccd6',
      bg: 'transparent', tooltipBg: dark ? '#13223a' : '#ffffff', accent: dark ? '#3aa3ad' : '#26828C', hl: '#AB9671'
    };
  }
  CH.theme = th;
  // data-viz palette built from the PSR institutional colours (literal hex allowed in chart datasets)
  CH.palette = ['#26828C', '#122945', '#AB9671', '#7FCAD2', '#D9822B', '#6B8E23', '#8B5A83', '#706F6F', '#C3B191', '#3F6E9E'];

  /** Mount (or re-use) a chart on an element; returns the instance. */
  CH.mount = function (el, option, onEvents) {
    var inst = echarts.getInstanceByDom(el);
    if (!inst) {
      inst = echarts.init(el, null, { renderer: 'canvas' });
      var ro = new ResizeObserver(function () { inst.resize(); });
      ro.observe(el);
      live.push({ el: el, inst: inst, ro: ro });
    }
    inst.off('click');
    var t = th();
    var base = {
      backgroundColor: 'transparent', animationDuration: 250, animationDurationUpdate: 250,
      textStyle: { fontFamily: 'Inter, Segoe UI, system-ui, sans-serif', color: t.text, fontSize: 11 },
      color: CH.palette,
      // rendered on <body> so it is never clipped by (or hidden behind) the panel that holds the chart
      tooltip: { backgroundColor: t.tooltipBg, borderColor: t.axis, textStyle: { color: t.strong, fontSize: 12 }, appendToBody: true, confine: false,
        extraCssText: 'z-index: 4000; border-radius: 8px; box-shadow: 0 8px 24px rgba(15,23,42,.18); max-width: 360px; white-space: normal;' }
    };
    var opt = Object.assign({}, base, option);
    if (option.tooltip) opt.tooltip = Object.assign({}, base.tooltip, option.tooltip);   // keep the common tooltip settings
    inst.setOption(GV.i18n ? GV.i18n.chart(opt) : opt, true);
    if (onEvents) Object.keys(onEvents).forEach(function (k) { inst.on(k, onEvents[k]); });
    return inst;
  };
  CH.gc = function () {
    live = live.filter(function (x) {
      if (document.body.contains(x.el)) return true;
      x.ro.disconnect(); x.inst.dispose(); return false;
    });
  };

  function axisStyle(extra) {
    var t = th();
    return Object.assign({
      axisLine: { lineStyle: { color: t.axis } }, axisTick: { lineStyle: { color: t.axis } },
      axisLabel: { color: t.text, fontSize: 10.5 }, splitLine: { lineStyle: { color: t.grid } },
      nameTextStyle: { color: t.text, fontSize: 10.5 }
    }, extra || {});
  }
  CH.axis = axisStyle;

  function fmtU(unit) { return function (v) { return U.fmt(v, unit, { noUnit: true }); }; }

  // ---------- time series ----------
  /**
   * series: [{ name, data: [values per period], unit, color?, type?, dashed?, area?, step? }]
   * opts: { unit, unit2, markStage: true, onPeriod: fn(stage), yName }
   */
  CH.timeSeries = function (el, series, opts) {
    opts = opts || {};
    var c = A.current(), t = th();
    var labels = c.time.periods.map(function (p) { return p.label; });
    var rng = st.get('range');
    var units = [];
    series.forEach(function (s) { if (units.indexOf(s.unit) < 0) units.push(s.unit); });
    var yAxes = units.slice(0, 2).map(function (u, i) {
      return axisStyle({ type: 'value', name: u === 'pct' ? '%' : U.unitLabel(u), position: i ? 'right' : 'left', scale: u === 'price', splitLine: { show: i === 0, lineStyle: { color: t.grid } }, axisLabel: { color: t.text, fontSize: 10.5, formatter: fmtU(u) } });
    });
    var out = series.map(function (s, i) {
      var ax = Math.max(0, units.indexOf(s.unit)); if (ax > 1) ax = 1;
      var o = U.unitOpt(s.unit);
      return {
        name: s.name, type: s.type || 'line', yAxisIndex: ax, step: s.step || false,
        data: s.data.map(function (v) { return isFinite(v) ? v * o.factor : null; }),
        showSymbol: s.data.length < 40, symbolSize: 5,
        lineStyle: { width: s.width || 1.8, type: s.dashed ? 'dashed' : 'solid' }, itemStyle: s.color ? { color: s.color } : undefined,
        areaStyle: s.area ? { opacity: 0.12 } : undefined, barMaxWidth: 18,
        markLine: i === 0 && opts.markStage !== false ? {
          silent: true, symbol: 'none', label: { show: false },
          lineStyle: { color: t.accent, width: 1.2, type: 'solid' }, data: [{ xAxis: st.get('stage') }]
        } : undefined,
        markArea: i === 0 && rng ? { silent: true, itemStyle: { color: 'rgba(38,130,140,0.07)' }, data: [[{ xAxis: rng[0] }, { xAxis: rng[1] }]] } : undefined
      };
    });
    // P10–P90 bands (several scenarios): an invisible lower line plus a stacked range area
    series.forEach(function (sr, i) {
      if (!sr.band) return;
      var o = U.unitOpt(sr.unit), ax = Math.min(1, Math.max(0, units.indexOf(sr.unit)));
      var lo = sr.band.lo.map(function (v) { return isFinite(v) ? v * o.factor : null; });
      var rg = sr.band.hi.map(function (v, k) { return isFinite(v) && isFinite(sr.band.lo[k]) ? (v - sr.band.lo[k]) * o.factor : null; });
      out.push({ name: '_lo' + i, type: 'line', data: lo, stack: 'band' + i, yAxisIndex: ax, symbol: 'none', lineStyle: { opacity: 0 }, silent: true, z: 1 });
      out.push({ name: 'P10–P90 ' + sr.name, type: 'line', data: rg, stack: 'band' + i, yAxisIndex: ax, symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: sr.color || '#26828C', opacity: 0.16 }, silent: true, z: 1 });
    });
    var hasBand = series.some(function (sr) { return sr.band; });
    var inst = CH.mount(el, {
      grid: { left: 52, right: units.length > 1 ? 52 : 14, top: series.length > 1 || hasBand ? 30 : 16, bottom: 26 },
      legend: series.length > 1 || hasBand ? { top: 0, left: 'center', type: 'scroll', data: series.map(function (sr) { return sr.name; }).concat(series.filter(function (sr) { return sr.band; }).map(function (sr) { return 'P10–P90 ' + sr.name; })), textStyle: { color: t.text, fontSize: 11 }, itemWidth: 14, itemHeight: 8 } : undefined,
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'line' },
        valueFormatter: undefined,
        formatter: function (ps) {
          var s = '<b>' + ps[0].axisValue + '</b>';
          ps.forEach(function (p) {
            var ser = series[p.seriesIndex];
            if (!ser) {
              var bi = series.findIndex(function (sr) { return p.seriesName === 'P10–P90 ' + sr.name; });
              if (bi >= 0) { var sb = series[bi], ob = U.unitOpt(sb.unit); s += '<br><span style="opacity:.7">P10–P90: ' + U.fmtNum(sb.band.lo[p.dataIndex] * ob.factor, ob.digits) + ' – ' + U.fmtNum(sb.band.hi[p.dataIndex] * ob.factor, ob.digits) + '</span>'; }
              return;
            }
            s += '<br>' + p.marker + ' ' + U.escapeHtml(p.seriesName) + ': <b>' + (p.value === null ? '–' : U.fmtNum(p.value, U.unitOpt(ser.unit).digits) + (ser.unit === 'pct' ? '%' : ' ' + U.unitLabel(ser.unit))) + '</b>';
          });
          return s + '<br><span style="opacity:.6">click to go to this period</span>';
        }
      },
      xAxis: axisStyle({ type: 'category', data: labels, boundaryGap: series.some(function (s) { return s.type === 'bar'; }), splitLine: { show: false } }),
      yAxis: yAxes,
      series: out
    });
    CH.bindAxisClick(el);
    return inst;
  };
  // allow clicks anywhere on the plot (not only on points) to navigate
  CH.bindAxisClick = function (el) {
    var inst = echarts.getInstanceByDom(el); if (!inst) return;
    if (el._gvZrClick) inst.getZr().off('click', el._gvZrClick);
    el._gvZrClick = function (e) {
      var p = [e.offsetX, e.offsetY];
      if (!inst.containPixel('grid', p)) return;
      var x = inst.convertFromPixel({ xAxisIndex: 0 }, p);
      x = Array.isArray(x) ? x[0] : x;
      if (x >= 0 && x < A.current().nS) st.set({ stage: Math.round(x) });
    };
    inst.getZr().on('click', el._gvZrClick);
  };

  // ---------- stacked areas over periods (e.g. gas origin volumes) ----------
  CH.stacked = function (el, series, unit) {
    var c = A.current(), t = th(), o = U.unitOpt(unit);
    var inst = CH.mount(el, {
      grid: { left: 52, right: 14, top: 30, bottom: 26 },
      legend: { top: 0, type: 'scroll', textStyle: { color: t.text, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
      tooltip: { trigger: 'axis', valueFormatter: function (v) { return U.fmtNum(v, o.digits) + ' ' + o.label; } },
      xAxis: axisStyle({ type: 'category', data: c.time.periods.map(function (p) { return p.label; }), boundaryGap: false, splitLine: { show: false } }),
      yAxis: axisStyle({ type: 'value', name: o.label, axisLabel: { color: t.text, fontSize: 10.5, formatter: fmtU(unit) } }),
      series: series.map(function (sr, i) {
        return { name: sr.name, type: 'line', stack: 'all', data: sr.data.map(function (v) { return v * o.factor; }), symbol: 'none', lineStyle: { width: 0.5, color: sr.color }, areaStyle: { color: sr.color, opacity: 0.85 }, itemStyle: { color: sr.color },
          markLine: i === 0 ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.strong, width: 1, opacity: 0.6 }, data: [{ xAxis: st.get('stage') }] } : undefined };
      })
    });
    CH.bindAxisClick(el);
    return inst;
  };

  // ---------- origin → destination Sankey ----------
  CH.originSankey = function (el, flows) {
    var t = th(), o = U.unitOpt('flow'), G = GV.config.sourceGroups;
    var nodes = [], seen = {}, links = [];
    flows.forEach(function (f) {
      var a = G[f.group].label, b = f.dest;
      if (!seen[a]) { seen[a] = 1; nodes.push({ name: a, itemStyle: { color: G[f.group].color } }); }
      if (!seen[b]) { seen[b] = 1; nodes.push({ name: b, itemStyle: { color: /thermal/.test(b) ? '#e4572e' : '#3b82f6' } }); }
      links.push({ source: a, target: b, value: f.value * o.factor });
    });
    return CH.mount(el, {
      tooltip: { trigger: 'item', formatter: function (p) { return p.dataType === 'edge' ? U.escapeHtml(p.data.source + ' → ' + p.data.target) + '<br><b>' + U.fmtNum(p.data.value, o.digits) + ' ' + o.label + '</b>' : U.escapeHtml(p.name) + '<br><b>' + U.fmtNum(p.value, o.digits) + ' ' + o.label + '</b>'; } },
      series: [{ type: 'sankey', left: 10, right: 150, top: 10, bottom: 10, nodeWidth: 12, nodeGap: 8, data: nodes, links: links, emphasis: { focus: 'adjacency' },
        label: { color: t.strong, fontSize: 11 }, lineStyle: { color: 'gradient', opacity: 0.4, curveness: 0.5 } }]
    });
  };

  // ---------- nodal balance waterfall ----------
  CH.balanceWaterfall = function (el, parts) {
    // parts: [{ name, value (signed, base unit) }] ; last bar = net residual
    var t = th(), o = U.unitOpt('flow');
    var base = [], pos = [], neg = [], acc = 0, cats = [];
    parts.forEach(function (p) {
      var v = p.value * o.factor;
      cats.push(p.name);
      if (p.total) { base.push(0); pos.push(v >= 0 ? v : 0); neg.push(v < 0 ? -v : 0); return; }
      if (v >= 0) { base.push(acc); pos.push(v); neg.push(0); acc += v; }
      else { acc += v; base.push(acc); pos.push(0); neg.push(-v); }
    });
    return CH.mount(el, {
      grid: { left: 118, right: 46, top: 6, bottom: 22 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (ps) {
        var i = ps[0].dataIndex, p = parts[i];
        return '<b>' + U.escapeHtml(p.name) + '</b><br>' + U.fmt(p.value, 'flow', { sign: true });
      } },
      yAxis: axisStyle({ type: 'category', data: cats, inverse: true, axisTick: { show: false }, axisLabel: { color: t.text, fontSize: 11, width: 110, overflow: 'truncate' }, splitLine: { show: false } }),
      xAxis: axisStyle({ type: 'value', axisLabel: { color: t.text, fontSize: 10, formatter: fmtU('flow') } }),
      series: [
        { type: 'bar', stack: 'w', data: base, itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, barWidth: '62%' },
        { type: 'bar', stack: 'w', data: pos, itemStyle: { color: function (p) { return parts[p.dataIndex].total ? t.accent : '#3f9b6b'; }, borderRadius: 2 },
          label: { show: true, position: 'right', color: t.text, fontSize: 10, formatter: function (p) { return p.value ? U.fmtNum(p.value, o.digits) : ''; } } },
        { type: 'bar', stack: 'w', data: neg, itemStyle: { color: function (p) { return parts[p.dataIndex].total ? t.accent : '#e3642f'; }, borderRadius: 2 },
          label: { show: true, position: 'right', color: t.text, fontSize: 10, formatter: function (p) { return p.value ? '−' + U.fmtNum(p.value, o.digits) : ''; } } }
      ]
    });
  };

  // ---------- local Sankey ----------
  CH.localSankey = function (el, center, inflows, outflows, onClick) {
    var t = th(), o = U.unitOpt('flow');
    var nodes = [{ name: center, itemStyle: { color: t.accent }, label: { show: false } }], links = [];
    var total = inflows.concat(outflows).reduce(function (p, f) { return p + f.value; }, 0) / 2 || 1;
    function lab(f, pos) { return { position: pos, show: f.value / total >= 0.03 }; }
    inflows.forEach(function (f) { var n = '▸ ' + f.name; nodes.push({ name: n, itemStyle: { color: f.color || '#3f9b6b' }, ref: f.ref, label: lab(f, 'right') }); links.push({ source: n, target: center, value: f.value * o.factor }); });
    outflows.forEach(function (f) { var n = f.name + ' ◂'; if (nodes.some(function (x) { return x.name === n; })) n += ' '; nodes.push({ name: n, itemStyle: { color: f.color || '#e3642f' }, ref: f.ref, label: lab(f, 'left') }); links.push({ source: center, target: n, value: f.value * o.factor }); });
    return CH.mount(el, {
      tooltip: { trigger: 'item', formatter: function (p) { return p.dataType === 'edge' ? U.escapeHtml(p.data.source + ' → ' + p.data.target) + '<br><b>' + U.fmtNum(p.data.value, o.digits) + ' ' + o.label + '</b>' : U.escapeHtml(p.name); } },
      series: [{
        type: 'sankey', left: 4, right: 4, top: 6, bottom: 6, nodeWidth: 9, nodeGap: 5, draggable: false, layoutIterations: 0,
        data: nodes, links: links, emphasis: { focus: 'adjacency' },
        label: { color: t.strong, fontSize: 10.5, textBorderColor: A.isDark() ? '#1a1f28' : '#ffffff', textBorderWidth: 2, formatter: function (p) { var s = p.name.replace(/^▸ | ◂$/g, ''); return s.length > 34 ? s.slice(0, 33) + '…' : s; } },
        lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.5 }
      }]
    }, { click: function (p) { if (p.dataType === 'node' && p.data.ref && onClick) onClick(p.data.ref); } });
  };

  // ---------- flow vs capacity per period ----------
  CH.arcCapacity = function (el, c, ai, seq) {
    var t = th(), o = U.unitOpt('flow'), a = c.arcs[ai];
    var labels = c.time.periods.map(function (p) { return p.label; });
    var flows = [], peaks = [], mins = [], capF = [], capR = [];
    for (var s = 0; s < c.nS; s++) {
      flows.push(c.value('arc', 'flow', a.id, { stage: s, seq: seq, block: -1 }) * o.factor);
      var bl = [];
      for (var b = 0; b < c.nB; b++) bl.push(c.value('arc', 'flow', a.id, { stage: s, seq: seq, block: b }) * o.factor);
      peaks.push(Math.max.apply(null, bl)); mins.push(Math.min.apply(null, bl));
      var cap = c.capacityAt(ai, s); capF.push(cap.ft * o.factor); capR.push(-cap.tf * o.factor);
    }
    var hasRev = capR.some(function (v) { return v < 0; }) || mins.some(function (v) { return v < 0; });
    var inst = CH.mount(el, {
      grid: { left: 52, right: 12, top: 26, bottom: 24 },
      legend: { top: 0, data: ['Flow (avg)', 'Capacity', 'Reverse capacity', 'Block range'], textStyle: { color: t.text, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
      tooltip: { trigger: 'axis', formatter: function (ps) {
        var s = '<b>' + ps[0].axisValue + '</b>';
        ps.forEach(function (p) { if (p.seriesName === 'Block range') return; s += '<br>' + p.marker + ' ' + p.seriesName + ': <b>' + U.fmtNum(p.value, o.digits) + ' ' + o.label + '</b>'; });
        return s;
      } },
      xAxis: axisStyle({ type: 'category', data: labels, splitLine: { show: false } }),
      yAxis: axisStyle({ type: 'value', name: o.label, axisLabel: { color: t.text, fontSize: 10.5, formatter: function (v) { return U.fmtNum(v, o.digits > 1 ? 1 : 0); } } }),
      series: [
        { name: 'Capacity', type: 'line', step: 'middle', data: capF, symbol: 'none', lineStyle: { color: '#c21f3a', type: 'dashed', width: 1.5 }, itemStyle: { color: '#c21f3a' } },
        hasRev ? { name: 'Reverse capacity', type: 'line', step: 'middle', data: capR, symbol: 'none', lineStyle: { color: '#c21f3a', type: 'dotted', width: 1.2 }, itemStyle: { color: '#c21f3a' } } : null,
        c.nB > 1 ? { name: 'Block min', type: 'line', data: mins, symbol: 'none', lineStyle: { opacity: 0 }, stack: 'band', itemStyle: { color: t.accent } } : null,
        c.nB > 1 ? { name: 'Block range', type: 'line', data: peaks.map(function (p, i) { return p - mins[i]; }), symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: t.accent, opacity: 0.15 }, stack: 'band', itemStyle: { color: t.accent }, tooltip: { show: false } } : null,
        { name: 'Flow (avg)', type: 'line', data: flows, symbolSize: 5, lineStyle: { width: 2, color: t.accent }, itemStyle: { color: t.accent },
          markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.strong, width: 1, opacity: .5 }, data: [{ xAxis: st.get('stage') }, { yAxis: 0 }] } }
      ].filter(Boolean)
    });
    CH.bindAxisClick(el);
    return inst;
  };

  // ---------- utilization duration curve ----------
  CH.durationCurve = function (el, items, seq) {
    // items: [{ name, ai }]; x = % of time (hours-weighted), y = utilization (%), over the analysis range
    var c = A.current(), t = th(), rng = st.get('range') || [0, c.nS - 1];
    var series = items.map(function (it) {
      var pts = [], tot = 0;
      for (var s = rng[0]; s <= rng[1]; s++) for (var b = 0; b < c.nB; b++) {
        var qs = seq < 0 ? Array.from({ length: c.nQ }, function (_, i) { return i; }) : [seq];
        qs.forEach(function (q) {
          var u = c.utilT(it.ai, c.tIx(s, q, b)); if (isNaN(u)) return;
          var h = c.hours(s, b); pts.push([isFinite(u) ? u : 1.5, h]); tot += h;
        });
      }
      pts.sort(function (a, b) { return b[0] - a[0]; });
      var acc = 0, data = [];
      pts.forEach(function (p) { data.push([acc / tot * 100, p[0] * 100]); acc += p[1]; data.push([acc / tot * 100, p[0] * 100]); });
      return { name: it.name, type: 'line', data: data, symbol: 'none', lineStyle: { width: 1.8 } };
    });
    var bins = A.bins();
    return CH.mount(el, {
      grid: { left: 46, right: 14, top: items.length > 1 ? 28 : 12, bottom: 30 },
      legend: items.length > 1 ? { top: 0, type: 'scroll', textStyle: { color: t.text, fontSize: 11 } } : undefined,
      tooltip: { trigger: 'axis', formatter: function (ps) { return ps.map(function (p) { return p.marker + ' ' + U.escapeHtml(p.seriesName) + ': ' + U.fmtNum(p.value[1], 1) + '% during ' + U.fmtNum(p.value[0], 0) + '% of hours'; }).join('<br>'); } },
      xAxis: axisStyle({ type: 'value', min: 0, max: 100, name: '% of hours', nameLocation: 'middle', nameGap: 20, axisLabel: { color: t.text, fontSize: 10, formatter: '{value}%' } }),
      yAxis: axisStyle({ type: 'value', min: 0, axisLabel: { color: t.text, fontSize: 10, formatter: '{value}%' } }),
      series: series.concat([{ type: 'line', data: [], markLine: { silent: true, symbol: 'none', label: { show: false }, data: bins.slice(0, -1).map(function (b) { return { yAxis: Math.min(b.max, 1) * 100, lineStyle: { color: b.color, type: 'dashed', width: 1 } }; }) } }])
    });
  };

  // ---------- histogram ----------
  CH.histogram = function (el, values, opts) {
    var t = th();
    var fin = values.filter(function (v) { return isFinite(v.v); });
    if (opts.bins) {
      var cats = opts.bins.map(function (b) { return b.label; }), counts = opts.bins.map(function () { return 0; }), members = opts.bins.map(function () { return []; });
      fin.forEach(function (x) { var i = opts.binOf(x.v); if (i >= 0) { counts[i]++; members[i].push(x); } });
      return CH.mount(el, {
        grid: { left: 40, right: 12, top: 20, bottom: 36 },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (ps) { var i = ps[0].dataIndex; return '<b>' + cats[i] + '</b>: ' + counts[i] + ' ' + (opts.what || 'elements') + '<br><span style="opacity:.6">click to select them</span>'; } },
        xAxis: axisStyle({ type: 'category', data: cats, axisLabel: { color: t.text, fontSize: 10.5, interval: 0 } }),
        yAxis: axisStyle({ type: 'value', minInterval: 1, name: 'count' }),
        series: [{ type: 'bar', data: counts.map(function (n, i) { return { value: n, itemStyle: { color: opts.bins[i].color } }; }), barWidth: '60%', label: { show: true, position: 'top', color: t.text, fontSize: 10.5 } }]
      }, { click: function (p) { if (opts.onPick) opts.onPick(members[p.dataIndex]); } });
    }
    return null;
  };

  // ---------- scatter ----------
  CH.scatter = function (el, pts, opts) {
    var t = th();
    return CH.mount(el, {
      grid: { left: 58, right: 20, top: 16, bottom: 40 },
      tooltip: { trigger: 'item', formatter: function (p) { var d = pts[p.dataIndex]; return '<b>' + U.escapeHtml(d.name) + '</b><br>' + opts.xLabel + ': ' + d.xs + '<br>' + opts.yLabel + ': ' + d.ys; } },
      xAxis: axisStyle({ type: 'value', name: opts.xLabel, nameLocation: 'middle', nameGap: 24, scale: !!opts.xScale, axisLabel: { color: t.text, fontSize: 10, formatter: opts.xFmt } }),
      yAxis: axisStyle({ type: 'value', name: opts.yLabel, nameLocation: 'middle', nameGap: 44, scale: !!opts.yScale, axisLabel: { color: t.text, fontSize: 10, formatter: opts.yFmt } }),
      series: [{
        type: 'scatter', data: pts.map(function (d) { return { value: [d.x, d.y], itemStyle: { color: d.color, borderColor: d.sel ? '#122945' : 'transparent', borderWidth: 2 }, symbolSize: d.size || 9 }; }),
        markLine: opts.markX !== undefined ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.axis, type: 'dashed' }, data: [{ xAxis: opts.markX }] } : undefined
      }]
    }, { click: function (p) { if (opts.onPick) opts.onPick(pts[p.dataIndex]); } });
  };

  // ---------- grouped bars (comparison) ----------
  CH.bars = function (el, cats, series, unit, opts) {
    var t = th(), o = U.unitOpt(unit);
    opts = opts || {};
    return CH.mount(el, {
      grid: { left: opts.horizontal ? 140 : 52, right: 16, top: series.length > 1 ? 28 : 12, bottom: opts.horizontal ? 24 : 50 },
      legend: series.length > 1 ? { top: 0, textStyle: { color: t.text, fontSize: 11 } } : undefined,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (ps) {
        return '<b>' + U.escapeHtml(ps[0].name) + '</b>' + ps.map(function (p) { return '<br>' + p.marker + ' ' + U.escapeHtml(p.seriesName) + ': <b>' + (p.value === null ? '–' : U.fmtNum(p.value, o.digits) + (unit === 'pct' ? '%' : ' ' + o.label)) + '</b>'; }).join('');
      } },
      xAxis: opts.horizontal ? axisStyle({ type: 'value', axisLabel: { color: t.text, fontSize: 10, formatter: fmtU(unit) } })
        : axisStyle({ type: 'category', data: cats, axisLabel: { color: t.text, fontSize: 10, rotate: cats.length > 6 ? 30 : 0, width: 110, overflow: 'truncate', interval: 0 } }),
      yAxis: opts.horizontal ? axisStyle({ type: 'category', data: cats, inverse: true, axisLabel: { color: t.text, fontSize: 10.5, width: 130, overflow: 'truncate' } })
        : axisStyle({ type: 'value', name: unit === 'pct' ? '%' : o.label, axisLabel: { color: t.text, fontSize: 10, formatter: fmtU(unit) } }),
      series: series.map(function (s) { return { name: s.name, type: 'bar', data: s.data.map(function (v) { return isFinite(v) ? v * o.factor : null; }), barMaxWidth: 22, itemStyle: s.color ? { color: s.color } : undefined }; })
    }, opts.onClick ? { click: opts.onClick } : undefined);
  };
})();
