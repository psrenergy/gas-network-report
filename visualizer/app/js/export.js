/*
 * Export the map as a figure (PNG or SVG) with title, legend of the visible layers, annotations,
 * period / case information and sources. The map itself is embedded as an image; title, legend and
 * annotations are vector (SVG) and rasterised for PNG.
 */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, C = GV.config, LY = GV.layers, h = U.h;
  var X = GV.exporter = {};
  var FONT = "Inter, Segoe UI, Helvetica, Arial, sans-serif";

  function esc(s) { return U.escapeHtml(String(s)); }
  function defaultTitle() {
    var c = A.current(); if (!c) return 'Gas network';
    var v = st.get('view') || '', vl = (C.views.filter(function (x) { return x.id === v; })[0] || {}).label || (v.indexOf('saved:') === 0 ? v.slice(6) : '');
    return c.name + (vl ? ' — ' + vl : '');
  }
  function subtitle() {
    var c = A.current(); if (!c) return '';
    var seq = st.get('seq'), sq = seq >= 0 ? (c.nQ > 1 ? 'scenario ' + (seq + 1) : '') : (GV.SEQ_CODES.filter(function (o) { return o.code === seq; })[0] || {}).label;
    return [c.periodLabel(st.get('stage')), GV.tooltip.blockLabel(), sq, A.comparing() ? A.compareLabel() : ''].filter(Boolean).join(' · ');
  }

  // ---------------------------------------------------------------- legend (SVG)
  function svgShape(shape, x, y, px, fill) {
    var r = px / 2, pts = [], i;
    function poly(p) { return '<polygon points="' + p.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ') + '" fill="' + fill + '"/>'; }
    if (shape === 'square') return '<rect x="' + (x - r * 0.84) + '" y="' + (y - r * 0.84) + '" width="' + r * 1.68 + '" height="' + r * 1.68 + '" fill="' + fill + '"/>';
    if (shape === 'diamond') return poly([[x, y - r], [x + r, y], [x, y + r], [x - r, y]]);
    if (shape === 'triangle') return poly([[x, y - r], [x + r * 0.95, y + r * 0.75], [x - r * 0.95, y + r * 0.75]]);
    if (shape === 'hexagon') { for (i = 0; i < 6; i++) { var a = Math.PI / 3 * i + Math.PI / 6; pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]); } return poly(pts); }
    if (shape === 'star') { for (i = 0; i < 10; i++) { var b = -Math.PI / 2 + Math.PI / 5 * i, rr = i % 2 ? r * 0.45 : r; pts.push([x + rr * Math.cos(b), y + rr * Math.sin(b)]); } return poly(pts); }
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '"/>';
  }
  function legendSvg(width) {
    var B = GV.map.builds() || {}, list = (st.get('layerList') || []).filter(function (l) { return l.visible && l.legend !== false && B[l.id]; });
    var out = [], y = 0, x0 = 12;
    function text(tx, x, yy, opts) { opts = opts || {}; out.push('<text x="' + x + '" y="' + yy + '" font-family="' + FONT + '" font-size="' + (opts.size || 11) + '" fill="' + (opts.color || '#1f2937') + '"' + (opts.bold ? ' font-weight="600"' : '') + (opts.anchor ? ' text-anchor="' + opts.anchor + '"' : '') + '>' + esc(tx) + '</text>'); }
    y += 18; text('Legend', x0, y, { bold: true, size: 12 });
    list.forEach(function (l) {
      var b = B[l.id], cs = b.colorScale, kind = LY.geomKind(l);
      y += 22;
      var col = l.color.value || (cs && cs.stops ? cs.stops[Math.floor(cs.stops.length * 0.7)] : '#64748b');
      if (kind === 'line') out.push('<line x1="' + x0 + '" y1="' + (y - 4) + '" x2="' + (x0 + 22) + '" y2="' + (y - 4) + '" stroke="' + col + '" stroke-width="' + Math.min(6, l.size.value || 3) + '"' + (l.dash === 'dashed' ? ' stroke-dasharray="5 3"' : '') + '/>');
      else if (l.shape === 'pie') out.push(svgShape('circle', x0 + 7, y - 4, 12, C.sourceGroups[0].color));
      else out.push(svgShape(l.shape || 'circle', x0 + 7, y - 4, 12, col));
      text(l.name, x0 + 30, y, { bold: true });
      function fieldTitle(f, prefix) {
        y += 16;
        var u = f.unit ? (f.unit === 'pct' ? '%' : U.unitLabel(f.unit)) : '';
        text((prefix || '') + f.label.replace(/ \(input\)$/, '') + (u ? ' (' + u + ')' : ''), x0 + 4, y, { color: '#4b5563', size: 10.5 });
      }
      if (l.shape === 'pie') {
        fieldTitle({ label: 'Gas origin' });
        C.sourceGroups.forEach(function (g) { y += 14; out.push('<rect x="' + (x0 + 6) + '" y="' + (y - 9) + '" width="12" height="9" fill="' + g.color + '"/>'); text(g.label, x0 + 24, y, { size: 10.5 }); });
      } else if (cs && cs.type === 'cat') {
        fieldTitle(cs.field);
        cs.entries.slice(0, 12).forEach(function (e) { y += 14; out.push('<rect x="' + (x0 + 6) + '" y="' + (y - 9) + '" width="16" height="' + (kind === 'line' ? 4 : 9) + '" fill="' + e.color + '"/>'); text(e.label, x0 + 28, y, { size: 10.5 }); });
      } else if (cs && cs.type === 'utilization') {
        fieldTitle(cs.field);
        cs.bins.forEach(function (bn, i) {
          var lo = i ? Math.round(cs.bins[i - 1].max * 100) : 0, rng = bn.max === Infinity ? '> ' + lo + '%' : lo + '–' + Math.round(Math.min(bn.max, 1) * 100) + '%';
          y += 14; out.push('<rect x="' + (x0 + 6) + '" y="' + (y - 7) + '" width="18" height="5" fill="' + bn.color + '"/>'); text(rng + ' ' + bn.label.toLowerCase(), x0 + 30, y, { size: 10.5 });
        });
      } else if (cs && cs.type === 'continuous') {
        fieldTitle(cs.field, cs.delta ? 'Δ ' : '');
        var gid = 'g' + l.id.replace(/\W/g, ''), w = width - 2 * x0 - 12;
        out.push('<defs><linearGradient id="' + gid + '">' + cs.stops.map(function (s, i) { return '<stop offset="' + (i / (cs.stops.length - 1)) + '" stop-color="' + s + '"/>'; }).join('') + '</linearGradient></defs>');
        y += 6; out.push('<rect x="' + (x0 + 6) + '" y="' + y + '" width="' + w + '" height="9" fill="url(#' + gid + ')"/>');
        var o = U.unitOpt(cs.field.unit), d = cs.domain;
        y += 21;
        text(U.fmtNum(d[0] * o.factor, o.digits), x0 + 6, y, { size: 10 });
        text(U.fmtNum((d[0] + d[1]) / 2 * o.factor, o.digits), x0 + 6 + w / 2, y, { size: 10, anchor: 'middle' });
        text(U.fmtNum(d[1] * o.factor, o.digits), x0 + 6 + w, y, { size: 10, anchor: 'end' });
      }
      [['size', b.sizeScale], ['arrows', b.arrowScale]].forEach(function (p) {
        var ss = p[1]; if (!ss || ss.type !== 'scaled') return;
        fieldTitle(ss.field, p[0] === 'arrows' ? 'Arrows: ' : kind === 'line' ? 'Width: ' : 'Size: ');
        var o2 = U.unitOpt(ss.field.unit), xx = x0 + 8;
        y += 22;
        [0.1, 0.4, 1].forEach(function (f) {
          var v = ss.max * f, px = ss.size(v);
          if (p[0] === 'arrows') out.push('<polygon points="' + xx + ',' + (y - 6 - 6 * px) + ' ' + (xx + 14 * px) + ',' + (y - 6) + ' ' + xx + ',' + (y - 6 + 6 * px) + '" fill="#475569"/>');
          else if (kind === 'line') out.push('<line x1="' + xx + '" y1="' + (y - 6) + '" x2="' + (xx + 24) + '" y2="' + (y - 6) + '" stroke="#64748b" stroke-width="' + px + '"/>');
          else out.push(svgShape(l.shape === 'pie' ? 'circle' : (l.shape || 'circle'), xx + 10, y - 6, Math.max(5, px), '#94a3b8'));
          text(U.fmtNum(v * o2.factor, o2.digits > 1 ? 1 : 0), xx + 32, y - 2, { size: 10 });
          xx += 70;
        });
        y += 4;
      });
      if ((l.filter || []).length) { y += 14; text('Filter: ' + l.filter.map(function (r) { return LY.describeRule(l, r); }).join('; '), x0 + 4, y, { size: 10, color: '#6b7280' }); }
    });
    return { svg: out.join(''), height: y + 14 };
  }

  // ---------------------------------------------------------------- compose
  X.build = function (opts) {
    var map = GV.map.map, canvas = map.getCanvas();
    var mw = canvas.clientWidth, mh = canvas.clientHeight, lw = opts.legend ? 270 : 0, head = 58, foot = 26;
    var lg = opts.legend ? legendSvg(lw) : null;
    var W = mw + lw, H = Math.max(head + mh + foot, lg ? lg.height + head + foot : 0);
    var img = canvas.toDataURL('image/png');
    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">');
    parts.push('<rect width="100%" height="100%" fill="#ffffff"/>');
    parts.push('<text x="14" y="26" font-family="' + FONT + '" font-size="17" font-weight="600" fill="#111827">' + esc(opts.title) + '</text>');
    parts.push('<text x="14" y="46" font-family="' + FONT + '" font-size="12" fill="#4b5563">' + esc(opts.subtitle) + '</text>');
    parts.push('<image x="0" y="' + head + '" width="' + mw + '" height="' + mh + '" href="' + img + '" xlink:href="' + img + '"/>');
    parts.push('<rect x="0" y="' + head + '" width="' + mw + '" height="' + mh + '" fill="none" stroke="#d1d5db"/>');
    if (opts.notes) (st.get('notes') || []).forEach(function (n) {
      var p = map.project([n.lng, n.lat]); if (p.x < 0 || p.y < 0 || p.x > mw || p.y > mh) return;
      var x = p.x, y = p.y + head, tw = Math.min(260, 7 + n.text.length * 6.3);
      parts.push('<g><circle cx="' + x + '" cy="' + y + '" r="4" fill="' + n.color + '" stroke="#fff" stroke-width="1.5"/>' +
        '<rect x="' + (x + 6) + '" y="' + (y - 26) + '" width="' + tw + '" height="20" rx="4" fill="#ffffff" stroke="' + n.color + '" stroke-width="1.5"/>' +
        '<text x="' + (x + 12) + '" y="' + (y - 12) + '" font-family="' + FONT + '" font-size="11.5" fill="#111827">' + esc(n.text.length > 40 ? n.text.slice(0, 39) + '…' : n.text) + '</text></g>');
    });
    if (lg) parts.push('<g transform="translate(' + mw + ',' + head + ')"><rect x="0" y="0" width="' + lw + '" height="' + (H - head - foot) + '" fill="#fafafa" stroke="#e5e7eb"/>' + lg.svg + '</g>');
    var c = A.current();
    parts.push('<text x="14" y="' + (H - 9) + '" font-family="' + FONT + '" font-size="10" fill="#6b7280">' + esc('Source: SDDP case “' + (c ? c.name : '') + '”' + (Object.keys(LY.refs).length && st.get('geomMode') === 'real' ? ' · pipeline traces: EPE' : '') + ' · basemap © Esri · ' + new Date().toISOString().slice(0, 10) + ' · Gas Network Explorer') + '</text>');
    parts.push('</svg>');
    return { svg: parts.join(''), width: W, height: H };
  };

  X.download = function (opts) {
    var map = GV.map.map;
    map.once('render', function () {
      var r = X.build(opts), name = (opts.title || 'map').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 60);
      if (opts.format === 'svg') { U.download(name + '.svg', r.svg, 'image/svg+xml'); return; }
      var scale = opts.scale || 2, cv = document.createElement('canvas');
      cv.width = r.width * scale; cv.height = r.height * scale;
      var g = cv.getContext('2d'), im = new Image();
      im.onload = function () {
        g.drawImage(im, 0, 0, cv.width, cv.height);
        cv.toBlob(function (blob) {
          var a = h('a', { href: URL.createObjectURL(blob), download: name + '.png' });
          document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        }, 'image/png');
      };
      im.onerror = function () { U.toast('Could not render the PNG; try SVG', 'warn'); };
      im.src = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
    });
    map.triggerRepaint();
  };

  X.dialog = function () {
    var title = h('input', { type: 'text', value: defaultTitle(), style: { width: '100%' } });
    var sub = h('input', { type: 'text', value: subtitle(), style: { width: '100%' } });
    var cL = h('input', { type: 'checkbox', checked: true }), cN = h('input', { type: 'checkbox', checked: true });
    var fmt = h('select', h('option', { value: 'png' }, 'PNG (image)'), h('option', { value: 'svg' }, 'SVG (vector legend, for reports)'));
    var sc = h('select', h('option', { value: 1 }, '1× (screen)'), h('option', { value: 2, selected: true }, '2× (print)'), h('option', { value: 3 }, '3×'));
    GV.ui.modal(h('div', h('h2', 'Export map figure'),
      h('label.field', { style: { gridTemplateColumns: '80px 1fr' } }, h('span', 'Title'), title),
      h('label.field', { style: { gridTemplateColumns: '80px 1fr' } }, h('span', 'Subtitle'), sub),
      h('label.field', { style: { gridTemplateColumns: '80px 1fr' } }, h('span', 'Format'), fmt),
      h('label.field', { style: { gridTemplateColumns: '80px 1fr' } }, h('span', 'Resolution'), sc),
      h('label.check', cL, 'Include legend of the visible layers'),
      h('label.check', cN, 'Include annotations'),
      h('p.muted.small', 'The map is exported exactly as shown (zoom, layers, labels). Resize the window or hide panels to change its size.'),
      h('div.modal-actions', h('button.btn.primary', { onclick: function () {
        X.download({ title: title.value, subtitle: sub.value, legend: cL.checked, notes: cN.checked, format: fmt.value, scale: +sc.value });
        GV.ui.closeModal();
      } }, 'Export'))));
  };
})();
