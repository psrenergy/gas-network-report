/* Start-up: restore per-user preferences, build the UI, then activate the first loaded case. */
(function () {
  'use strict';
  var U = GV.util, st = GV.state, A = GV.app, C = GV.config;

  if (!window.maplibregl || !window.echarts || !window.Tabulator) {
    document.body.innerHTML = '<div style="font:14px system-ui;padding:40px;max-width:640px">' +
      '<h2>Libraries could not be loaded</h2><p>The files in the <code>vendor/</code> folder are missing and the CDN is not reachable. ' +
      'Copy the complete application folder (including <code>vendor/</code>) and open <code>index.html</code> again.</p></div>';
    return;
  }

  // ---------- preferences ----------
  var storedTheme = U.store.get('theme', null);
  var theme = storedTheme || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;

  var savedList = U.store.get('layerList', null);
  st.set({
    units: Object.assign({ flow: 'kNm3d', price: 'usd_km3' }, U.store.get('units', {})),
    bins: U.store.get('bins', null),
    lockScale: U.store.get('lockScale', true),
    geomMode: U.store.get('geomMode', 'real'),
    basemap: U.store.get('basemap', theme === 'dark' ? 'dark' : 'light'),
    admin: U.store.get('admin', true),
    clickMode: U.store.get('clickMode', 'popup'),
    placeLabels: U.store.get('placeLabels', true),
    parallelGap: U.store.get('parallelGap', 4),
    animateArrows: U.store.get('animateArrows', true),
    arrowSpeed: U.store.get('arrowSpeed', 1),
    tooltips: U.store.get('tooltips', true),
    theme: theme
  });
  // migration: before v2 "animate" meant dashed-line animation (off by default); arrows now animate by default
  if (savedList && U.store.get('layersVersion', 1) < 2) { savedList.forEach(function (l) { if (l.type === 'arc') l.animate = true; }); U.store.set('layersVersion', 2); }
  if (savedList && savedList.length) st.set({ layerList: savedList.map(GV.layers.make), view: U.store.get('view', 'custom') });
  else GV.layers.applyView(C.defaultView);
  // remember the user's layers between sessions
  st.on('layerList view', U.debounce(function () { U.store.set('layerList', st.get('layerList')); U.store.set('view', st.get('view')); }, 300));

  // ---------- panels ----------
  U.$$('#panel-src > section').forEach(function (sec) {
    GV.dock.register({ id: sec.dataset.panel, title: sec.dataset.title, el: sec });
  });

  // ---------- UI ----------
  GV.ui.initToolbar();
  GV.ui.initSearch();
  GV.ui.initFilters();
  GV.ui.initChips();
  GV.ui.initKpis();
  GV.ui.initKeys();
  GV.ui.initProps();
  GV.ui.initBottom();
  GV.loader.init();
  GV.map.init('map');
  GV.ui.initLayers();
  GV.ui.initTimeline();
  GV.checks.init();
  GV.dock.init();
  GV.views.initNotes();
  GV.i18n.start();
  GV.select.start();

  function updateEmpty() { U.$('#empty').hidden = A.cases.length > 0; }
  st.on('casesVersion caseId', updateEmpty);
  updateEmpty();

  // ---------- activation ----------
  A.ready = true;
  var hashApplied = false;
  function activatePending() {
    if (A._pendingActivate) { var id = A._pendingActivate; A._pendingActivate = null; A.activate(id); }
    if (!hashApplied && A.current()) { hashApplied = true; GV.ui.applyHash(); }
  }
  GV.onLibraryLoaded = activatePending;
  st.on('casesVersion', function () { if (!hashApplied && A.current()) { hashApplied = true; GV.ui.applyHash(); } });
  activatePending();

  // follow the OS theme unless the user picked one
  if (!storedTheme && window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) { GV.ui.setTheme(e.matches ? 'dark' : 'light', false); });
  }
})();
