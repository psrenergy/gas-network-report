/*
 * Preferences dialog: map display (trace, basemap, boundaries), appearance (theme, language,
 * units, scales), animation, interaction, analysis classes and resets. Stored per user.
 */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, C = GV.config, h = U.h;
  var S = GV.settings = {};
  var section = U.store.get('prefSection', 'map');

  function save(key, value) { var o = {}; o[key] = value; st.set(o); U.store.set(key, value); }
  function seg(options, value, onpick) {
    return h('div.segmented', options.map(function (o) {
      return h('button' + (value === o[0] ? '.on' : ''), { onclick: function () { onpick(o[0]); render(); } }, o[2] ? h('i.fa-solid.' + o[2]) : null, o[2] ? ' ' : null, o[1]);
    }));
  }
  function row(label, control, hint) {
    return h('div.pref-row', h('div.pref-l', h('div.pref-t', label), hint ? h('div.pref-h', hint) : null), h('div.pref-c', control));
  }
  function check(key, label) {
    return h('label.check', h('input', { type: 'checkbox', checked: st.get(key) !== false, onchange: function () { save(key, this.checked); } }), label);
  }

  var SECTIONS = [
    ['map', 'Map', 'fa-map'], ['display', 'Appearance', 'fa-palette'], ['motion', 'Animation', 'fa-wind'],
    ['interaction', 'Interaction', 'fa-arrow-pointer'], ['analysis', 'Analysis', 'fa-chart-line'], ['data', 'Data & reset', 'fa-database']
  ];
  var box = null;
  S.open = function (sec) { if (sec) section = sec; box = h('div.pref'); render(); GV.ui.modal(box, { wide: true }); };

  function render() {
    if (!box) return;
    U.clear(box);
    var nav = h('div.pref-nav', h('h2', h('i.fa-solid.fa-gear'), ' Preferences'));
    SECTIONS.forEach(function (sct) {
      nav.appendChild(h('button' + (sct[0] === section ? '.on' : ''), { onclick: function () { section = sct[0]; U.store.set('prefSection', section); render(); } }, h('i.fa-solid.' + sct[2]), sct[1]));
    });
    var body = h('div.pref-body');
    box.appendChild(nav); box.appendChild(body);
    ({ map: mapSec, display: displaySec, motion: motionSec, interaction: interactionSec, analysis: analysisSec, data: dataSec })[section](body);
  }

  function mapSec(b) {
    var c = A.current(), mode = st.get('geomMode') || 'real';
    var routed = c ? c.arcs.filter(function (a, i) { return c.isRouted(i); }).length : 0;
    var pipes = c ? c.arcs.filter(function (a) { return a.kind === 'pipeline'; }).length : 0;
    b.appendChild(h('h3', 'Map'));
    b.appendChild(row('Pipeline trace', seg([['real', 'Real (EPE)', 'fa-route'], ['straight', 'Straight', 'fa-minus'], ['arcs', 'Arcs', 'fa-bezier-curve']], mode, function (v) { save('geomMode', v); }),
      mode === 'real' ? (Object.keys(GV.layers.refs).length ? routed + ' of ' + pipes + ' pipelines follow the real route; the others are drawn straight.' : 'No reference geometry loaded: pipelines are drawn straight. Load EPE shapefiles via Open case.') : 'Pipeline routes from the reference data are turned off.'));
    b.appendChild(row('Basemap', h('select', { onchange: function () { save('basemap', this.value); } }, C.basemapOptions.map(function (o) { return h('option', { value: o.id, selected: o.id === st.get('basemap') }, o.label); }))));
    b.appendChild(row('Basemap place names', check('placeLabels', 'Show city and country names')));
    b.appendChild(row('State boundaries', check('admin', 'Show state boundaries')));
    b.appendChild(row('Parallel pipelines', h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      h('input', { type: 'range', min: 0, max: 12, step: 1, value: st.get('parallelGap'), oninput: function () { save('parallelGap', +this.value); } }), h('span.muted.small', 'gap (px)')),
      'Pipelines that share the same route (or the same two nodes) are drawn side by side with this gap.'));
  }
  function displaySec(b) {
    b.appendChild(h('h3', 'Appearance'));
    var theme = U.store.get('theme', null) || 'auto';
    b.appendChild(row('Theme', seg([['auto', 'System', 'fa-desktop'], ['light', 'Light', 'fa-sun'], ['dark', 'Dark', 'fa-moon']], theme, function (v) {
      if (v === 'auto') { U.store.set('theme', null); GV.ui.setTheme(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', false); }
      else GV.ui.setTheme(v, true);
    })));
    b.appendChild(row('Language', seg([['pt', 'Português'], ['en', 'English']], GV.i18n.lang, function (v) { if (v !== GV.i18n.lang) GV.i18n.setLang(v); }), 'The page reloads to apply the language.'));
    [['flow', 'Flow units'], ['price', 'Marginal cost units']].forEach(function (p) {
      b.appendChild(row(p[1], seg(C.units[p[0]].options.map(function (o) { return [o.id, o.label]; }), U.unitOpt(p[0]).id, function (v) {
        var u = Object.assign({}, st.get('units')); u[p[0]] = v; save('units', u);
      })));
    });
    b.appendChild(row('Colour and size scales', check('lockScale', 'Keep scales fixed across periods'), 'The same colour means the same value in every period, so animations and comparisons are not distorted.'));
  }
  function motionSec(b) {
    b.appendChild(h('h3', 'Animation'));
    b.appendChild(row('Moving flow arrows', check('animateArrows', 'Animate arrows along the flow direction'), 'Each arc layer can also switch its own animation on or off in the layer editor.'));
    b.appendChild(row('Speed', seg([[0.5, 'Slow'], [1, 'Normal'], [2, 'Fast']], st.get('arrowSpeed'), function (v) { save('arrowSpeed', v); })));
    b.appendChild(row('Reduced motion', h('div.muted.small', window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Your system asks for reduced motion: animations are paused.' : 'Animations follow the system “reduce motion” setting.')));
  }
  function interactionSec(b) {
    b.appendChild(h('h3', 'Interaction'));
    b.appendChild(row('Clicking a node opens', seg([['popup', 'Popup on the map'], ['panel', 'Properties panel'], ['both', 'Both']], st.get('clickMode'), function (v) { save('clickMode', v); })));
    b.appendChild(row('Hover tooltips', check('tooltips', 'Show a summary when hovering elements')));
  }
  function analysisSec(b) {
    b.appendChild(h('h3', 'Analysis'));
    var bins = A.bins(), tbl = h('div.pref-bins');
    bins.forEach(function (bn, i) {
      var lo = i ? Math.round(bins[i - 1].max * 100) : 0;
      tbl.appendChild(h('div.pref-bin',
        h('input', { type: 'color', value: bn.color, onchange: function () { editBin(i, { color: this.value }); } }),
        h('span', bn.label), h('span.muted', lo + '% –'),
        bn.max === Infinity ? h('span.muted', '∞') : h('input', { type: 'number', min: 1, max: 1000, step: 1, value: Math.round(bn.max * 100), onchange: function () { editBin(i, { max: (+this.value) / 100 + (i === bins.length - 2 ? 0.0001 : 0) }); } }),
        h('span.muted', bn.max === Infinity ? '' : '%')));
    });
    b.appendChild(row('Utilization classes', h('div', tbl, h('button.btn.sm', { onclick: function () { save('bins', null); render(); } }, h('i.fa-solid.fa-rotate-left'), 'Reset classes')),
      'Upper bound of each class. Used by the map, legend, tables and charts.'));
  }
  function editBin(i, patch) {
    var bins = A.bins().map(function (b) { return Object.assign({}, b); });
    Object.assign(bins[i], patch);
    for (var k = 1; k < bins.length - 1; k++) if (bins[k].max < bins[k - 1].max) bins[k].max = bins[k - 1].max + 0.01;
    save('bins', bins); render();
  }
  function dataSec(b) {
    b.appendChild(h('h3', 'Data & reset'));
    var refs = Object.keys(GV.layers.refs).map(function (k) { var r = GV.layers.refs[k]; return r.label + ' (' + r.layers.length + ' layers)'; });
    b.appendChild(row('Reference data', h('div.small', refs.length ? refs.join(', ') : '—')));
    b.appendChild(row('Loaded cases', h('div.small', A.cases.map(function (c) { return c.name; }).join(', ') || '—')));
    b.appendChild(row('Panel layout', h('button.btn.sm', { onclick: function () { GV.dock.reset(); } }, h('i.fa-solid.fa-rotate-left'), 'Reset panel layout')));
    b.appendChild(row('All preferences', h('button.btn.sm', { onclick: function () {
      if (!window.confirm(GV.t('Reset every preference (layers, panels, units, theme)? Saved views are kept.'))) return;
      var keep = ['gv:myViews', 'gv:notes'];
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf('gv:') === 0 && keep.indexOf(k) < 0) localStorage.removeItem(k); });
      location.reload();
    } }, h('i.fa-solid.fa-trash-can'), 'Reset all preferences'), 'Saved views and annotations are kept.'));
  }
  st.on('geomMode basemap admin lockScale units bins theme animateArrows arrowSpeed clickMode tooltips placeLabels parallelGap', function () { if (box && box.isConnected) render(); });
})();
