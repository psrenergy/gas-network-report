/*
 * Configuration: element types, variables, presets, layers and context-menu actions.
 * Most customisation (new asset types, new result variables, new presets) happens here,
 * without touching the rest of the application.
 */
window.GV = window.GV || {};

GV.config = {
  appName: 'Gas Network Explorer',

  // ---------- units (display conversions; data is stored in base units) ----------
  units: {
    flow: {
      base: 'mil m³/d',
      options: [
        { id: 'kNm3d', label: 'mil m³/d', factor: 1, digits: 0 },
        { id: 'MMm3d', label: 'MMm³/d', factor: 0.001, digits: 2 }
      ]
    },
    price: {
      base: '$/mil m³',
      options: [
        { id: 'usd_km3', label: 'US$/mil m³', factor: 1, digits: 1 },
        // 1 MMBtu ≈ 26.8 m³ of natural gas (9,400 kcal/m³). 1 mil m³ ≈ 37.3 MMBtu.
        { id: 'usd_mmbtu', label: 'US$/MMBtu', factor: 1 / 37.3, digits: 2 }
      ]
    },
    money: { base: 'k$', options: [{ id: 'kusd', label: 'k$', factor: 1, digits: 1 }] },
    moneyRate: { base: 'k$/d', options: [{ id: 'kusdd', label: 'k$/d', factor: 1, digits: 1 }] },
    pct: { base: '%', options: [{ id: 'pct', label: '%', factor: 100, digits: 1 }] },
    volume: { base: 'mil m³', options: [{ id: 'km3', label: 'mil m³', factor: 1, digits: 0 }] },
    km: { base: 'km', options: [{ id: 'km', label: 'km', factor: 1, digits: 0 }] },
    count: { base: '', options: [{ id: 'n', label: '', factor: 1, digits: 0 }] }
  },

  // ---------- utilization classes (editable in the legend, persisted per user) ----------
  utilizationBins: [
    { max: 0.50, label: 'Low', color: '#3f9b6b' },
    { max: 0.80, label: 'Moderate', color: '#9bb83a' },
    { max: 0.95, label: 'High', color: '#e3a72f' },
    { max: 1.0001, label: 'Near limit', color: '#e3642f' },
    { max: Infinity, label: 'Violation', color: '#c21f3a' }
  ],

  // ---------- element types ----------
  elementTypes: {
    node: { label: 'Node', plural: 'Nodes', group: 'network' },
    pipeline: { label: 'Pipeline', plural: 'Pipelines', group: 'network', dash: null },
    maritime: { label: 'LNG sea route', plural: 'LNG sea routes', group: 'network', dash: [2, 2] },
    regas: { label: 'Regasification', plural: 'Regasification units', group: 'network', dash: [1, 1] },
    citygate: { label: 'City-gate / distribution', plural: 'City-gates', group: 'asset', color: '#3b82f6', glyph: 'C', shape: 'square', balance: 'withdrawal' },
    thermal: { label: 'Thermal plant', plural: 'Thermal plants', group: 'asset', color: '#e4572e', glyph: 'T', shape: 'diamond', balance: 'withdrawal' },
    producer: { label: 'Production / import', plural: 'Production', group: 'asset', color: '#2e9e5b', glyph: 'P', shape: 'triangle', balance: 'injection' },
    lng_supply: { label: 'LNG supply', plural: 'LNG supply', group: 'asset', color: '#0ea5b7', glyph: 'L', shape: 'hexagon', balance: 'injection' },
    storage: { label: 'Storage / linepack', plural: 'Storage', group: 'asset', color: '#8b5cf6', glyph: 'S', shape: 'circle', balance: 'storage' }
  },

  // Source groups for gas-origin tracing: first matching rule wins (types and/or name pattern).
  sourceGroups: [
    { id: 'presal', label: 'Pre-salt', color: '#1d4ed8', types: ['producer'], match: /pr[eé].?sal|rota\s*\d/i },
    { id: 'bolivia', label: 'Bolivia / Argentina', color: '#b45309', types: ['producer'], match: /bol[ií]via|argentin|campo duran/i },
    { id: 'biomethane', label: 'Biomethane', color: '#65a30d', types: ['producer'], match: /biometano|biomethane/i },
    { id: 'domestic', label: 'Other domestic production', color: '#7c3aed', types: ['producer'] },
    { id: 'lng', label: 'LNG', color: '#0ea5b7', types: ['lng_supply'] },
    { id: 'storage', label: 'Storage / linepack', color: '#94a3b8', types: ['storage'] }
  ],

  // Classifies SDDP loads into asset types (edit to match your naming conventions).
  classifyLoad: function (name) {
    return /n[ií]vel\s*\d|inel[aá]stic|el[aá]stic/i.test(name) ? 'citygate' : 'thermal';
  },

  // ---------- variables usable for styling / tables / charts ----------
  // kind: 'arc' | 'node' | 'asset'; unit: key of GV.config.units; scale: 'sequential' | 'diverging' | 'utilization'
  variables: [
    { id: 'flow', kind: 'arc', label: 'Flow (signed)', unit: 'flow', scale: 'diverging' },
    { id: 'absFlow', kind: 'arc', label: 'Flow (absolute)', unit: 'flow', scale: 'sequential' },
    { id: 'util', kind: 'arc', label: 'Capacity utilization', unit: 'pct', scale: 'utilization' },
    { id: 'capacity', kind: 'arc', label: 'Capacity (flow direction)', unit: 'flow', scale: 'sequential' },
    { id: 'headroom', kind: 'arc', label: 'Idle capacity', unit: 'flow', scale: 'sequential' },
    { id: 'dcmg', kind: 'arc', label: 'Marginal cost spread (to − from)', unit: 'price', scale: 'diverging' },
    { id: 'transportCost', kind: 'arc', label: 'Transport cost', unit: 'money', scale: 'sequential' },
    { id: 'utilPeak', kind: 'arc', label: 'Peak block utilization', unit: 'pct', scale: 'utilization' },
    { id: 'capDual', kind: 'arc', label: 'Capacity dual (value of +1 unit of capacity)', unit: 'price', scale: 'sequential' },
    { id: 'congRent', kind: 'arc', label: 'Congestion rent', unit: 'moneyRate', scale: 'sequential' },
    { id: 'congProb', kind: 'arc', label: 'Probability of congestion (≥ 95 %)', unit: 'pct', scale: 'sequential' },
    // inputs (input: true) - usable for filters, colours, sizes and labels like any result
    { id: 'capFT', kind: 'arc', label: 'Capacity from→to (input)', unit: 'flow', scale: 'sequential', input: true },
    { id: 'capTF', kind: 'arc', label: 'Capacity to→from (input)', unit: 'flow', scale: 'sequential', input: true },
    { id: 'tariff', kind: 'arc', label: 'Transport tariff (input)', unit: 'price', scale: 'sequential', input: true },
    { id: 'lossPct', kind: 'arc', label: 'Losses (input)', unit: 'pct', scale: 'sequential', input: true },
    { id: 'length', kind: 'arc', label: 'Length', unit: 'km', scale: 'sequential', input: true },

    { id: 'cmg', kind: 'node', label: 'Marginal cost', unit: 'price', scale: 'sequential' },
    { id: 'injection', kind: 'node', label: 'Injection (production + LNG + storage)', unit: 'flow', scale: 'sequential' },
    { id: 'withdrawal', kind: 'node', label: 'Withdrawal (demand)', unit: 'flow', scale: 'sequential' },
    { id: 'citygate', kind: 'node', label: 'City-gate demand', unit: 'flow', scale: 'sequential' },
    { id: 'thermal', kind: 'node', label: 'Thermal consumption', unit: 'flow', scale: 'sequential' },
    { id: 'net', kind: 'node', label: 'Net injection', unit: 'flow', scale: 'diverging' },
    { id: 'throughput', kind: 'node', label: 'Throughput (pipeline inflow)', unit: 'flow', scale: 'sequential' },
    { id: 'deficit', kind: 'node', label: 'Deficit', unit: 'flow', scale: 'sequential' },
    { id: 'residual', kind: 'node', label: 'Balance residual', unit: 'flow', scale: 'diverging' },
    { id: 'nAssets', kind: 'node', label: 'Number of assets (input)', unit: 'count', scale: 'sequential', input: true },

    { id: 'aValue', kind: 'asset', label: 'Production / consumption', unit: 'flow', scale: 'sequential' },
    { id: 'aDeficit', kind: 'asset', label: 'Deficit', unit: 'flow', scale: 'sequential' },
    { id: 'aLevel', kind: 'asset', label: 'Storage level', unit: 'volume', scale: 'sequential' },
    { id: 'aUtil', kind: 'asset', label: 'Production utilization', unit: 'pct', scale: 'utilization' },
    { id: 'maxProd', kind: 'asset', label: 'Max production (input)', unit: 'flow', scale: 'sequential', input: true },
    { id: 'aFill', kind: 'asset', label: 'Storage fill (level / max)', unit: 'pct', scale: 'sequential' },
    { id: 'maxStorage', kind: 'asset', label: 'Max storage (input)', unit: 'volume', scale: 'sequential', input: true }
  ],

  // ---------- views: ready-made layer sets (the "View" menu). Users can then edit or add layers. ----------
  // Layer spec (all options in js/layers.js):
  //   type: 'arc' | 'node' | 'asset' | 'ref'
  //   color / size: { field } or { value }   arrows: { show, field | value }   labels: { show, fields }
  //   shape (points): circle | square | triangle | diamond | hexagon | star
  //   position (points): C | N | NE | E | SE | S | SW | W | NW  (offset from the node, so several symbols fit one node)
  //   filter: [{ field, op: '>' | '>=' | '<' | '<=' | '=' | '!=' | 'between', value, value2 }]
  views: [
    { id: 'congestion', label: 'Pipeline congestion', layers: [
      { type: 'arc', name: 'Pipelines – loading', kinds: ['pipeline', 'regas'], color: { field: 'util' }, size: { field: 'absFlow' }, arrows: { show: true, field: 'absFlow' } },
      { type: 'arc', name: 'LNG sea routes', kinds: ['maritime'], color: { field: 'util' }, size: { value: 1.6 }, dash: 'dashed', arrows: { show: true, value: 0.8 } },
      { type: 'node', name: 'Nodes', color: { value: '#334155' }, size: { value: 9 }, labels: { show: true, fields: ['name'], minzoom: 5.5 } }
    ] },
    { id: 'multi', label: 'Loading + marginal cost + demand', layers: [
      { type: 'arc', name: 'Pipelines – loading', kinds: ['pipeline', 'regas'], color: { field: 'util' }, size: { value: 3 }, arrows: { show: true, field: 'absFlow' } },
      { type: 'arc', name: 'LNG sea routes', kinds: ['maritime'], color: { field: 'util' }, size: { value: 1.4 }, dash: 'dashed', arrows: { show: true, value: 0.7 } },
      { type: 'node', name: 'Nodes – marginal cost', shape: 'circle', color: { field: 'cmg' }, size: { value: 13 }, labels: { show: false, fields: ['name', 'cmg'] } },
      { type: 'asset', name: 'Thermal plants – consumption', assetTypes: ['thermal'], shape: 'diamond', color: { value: '#e4572e' }, size: { field: 'aValue' }, position: 'NE', distance: 13 },
      { type: 'asset', name: 'City-gates – demand', assetTypes: ['citygate'], shape: 'square', color: { value: '#3b82f6' }, size: { field: 'aValue' }, position: 'NW', distance: 13 },
      { type: 'asset', name: 'Production & LNG', assetTypes: ['producer', 'lng_supply'], shape: 'triangle', color: { value: '#2e9e5b' }, size: { field: 'aValue' }, position: 'S', distance: 14 }
    ] },
    { id: 'flow', label: 'Gas flow', layers: [
      { type: 'arc', name: 'All arcs – flow', kinds: ['pipeline', 'regas', 'maritime'], color: { field: 'absFlow' }, size: { field: 'absFlow' }, arrows: { show: true, field: 'absFlow' }, labels: { show: false, fields: ['absFlow'] } },
      { type: 'node', name: 'Nodes – throughput', color: { value: '#334155' }, size: { field: 'throughput' } }
    ] },
    { id: 'cmg', label: 'Marginal costs', layers: [
      { type: 'arc', name: 'Pipelines – cost spread', kinds: ['pipeline', 'regas'], color: { field: 'dcmg' }, size: { value: 2.5 }, arrows: { show: true, value: 0.9 } },
      { type: 'node', name: 'Nodes – marginal cost', color: { field: 'cmg' }, size: { field: 'withdrawal' }, labels: { show: true, fields: ['cmg'], minzoom: 5 } }
    ] },
    { id: 'balance', label: 'Nodal balance', layers: [
      { type: 'arc', name: 'Pipelines – flow', kinds: ['pipeline', 'regas', 'maritime'], color: { value: '#94a3b8' }, size: { field: 'absFlow' }, arrows: { show: true, field: 'absFlow' } },
      { type: 'node', name: 'Nodes – net injection', color: { field: 'net' }, size: { field: 'throughput' }, labels: { show: false, fields: ['net'] } }
    ] },
    { id: 'origin', label: 'Gas origin', layers: [
      { type: 'arc', name: 'Arcs – dominant origin', kinds: ['pipeline', 'regas', 'maritime'], color: { field: 'origDom' }, size: { field: 'absFlow' }, arrows: { show: true, field: 'absFlow' } },
      { type: 'node', name: 'Nodes – origin mix', shape: 'pie', size: { field: 'origVol', min: 9, max: 34 }, labels: { show: false, fields: ['name', 'origDom'] } }
    ] },
    { id: 'bottlenecks', label: 'Bottlenecks & capacity duals', layers: [
      { type: 'arc', name: 'All arcs', kinds: ['pipeline', 'regas', 'maritime'], color: { value: '#cbd5e1' }, size: { value: 1.6 } },
      { type: 'arc', name: 'Capacity dual > 0', kinds: ['pipeline', 'regas', 'maritime'], color: { field: 'capDual' }, size: { field: 'congRent', min: 3, max: 12 }, arrows: { show: true, value: 1 }, filter: [{ field: 'capDual', op: '>', value: 0.01 }], labels: { show: true, fields: ['name', 'capDual'] } },
      { type: 'node', name: 'Nodes – marginal cost', color: { field: 'cmg' }, size: { value: 9 } }
    ] },
    { id: 'storage', label: 'Storage & LNG', layers: [
      { type: 'arc', name: 'Pipelines', kinds: ['pipeline'], color: { value: '#94a3b8' }, size: { value: 1.8 }, arrows: { show: true, value: 0.7 } },
      { type: 'arc', name: 'LNG chain (sea routes + regas)', kinds: ['maritime', 'regas'], color: { field: 'util' }, size: { field: 'absFlow' }, arrows: { show: true, field: 'absFlow' } },
      { type: 'asset', name: 'Storage – fill level', assetTypes: ['storage'], shape: 'hexagon', color: { field: 'aFill' }, size: { field: 'aLevel', min: 10, max: 30 }, labels: { show: true, fields: ['aFill', 'aValue'] } },
      { type: 'asset', name: 'LNG supply', assetTypes: ['lng_supply'], shape: 'triangle', color: { value: '#0ea5b7' }, size: { field: 'aValue' } }
    ] },
    { id: 'violations', label: 'Violations & deficits', layers: [
      { type: 'arc', name: 'All arcs', kinds: ['pipeline', 'regas', 'maritime'], color: { value: '#cbd5e1' }, size: { value: 1.5 } },
      { type: 'arc', name: 'Arcs ≥ 95% loaded', kinds: ['pipeline', 'regas', 'maritime'], color: { field: 'util' }, size: { value: 5 }, arrows: { show: true, value: 1 }, filter: [{ field: 'util', op: '>=', value: 0.95 }], labels: { show: true, fields: ['name', 'util'] } },
      { type: 'node', name: 'Nodes with deficit', color: { value: '#e11d48' }, size: { field: 'deficit' }, filter: [{ field: 'deficit', op: '>', value: 0.001 }], labels: { show: true, fields: ['name', 'deficit'] } }
    ] },
    { id: 'topology', label: 'Topology & EPE reference', layers: [
      { type: 'ref', name: 'EPE transport pipelines', ref: 'epe:transport', color: { field: 'category' }, size: { value: 1.3 }, opacity: 0.75 },
      { type: 'arc', name: 'Model arcs', kinds: ['pipeline', 'regas', 'maritime'], color: { field: 'kind' }, size: { value: 2.4 } },
      { type: 'node', name: 'Nodes – region', color: { field: 'region' }, size: { value: 9 }, labels: { show: true, fields: ['name'], minzoom: 5.5 } }
    ] }
  ],
  defaultView: 'multi',

  // categorical colours (per categorical field)
  categoryColors: {
    kind: { pipeline: '#5b6b7f', maritime: '#0ea5b7', regas: '#8b5cf6' },
    status: { 'Normal': '#3f9b6b', 'Near limit': '#e3642f', 'Violation': '#c21f3a', 'Out of service': '#b4bcc8' },
    category: { 'Existente': '#475569', 'Autorizado': '#d97706', 'Indicativo': '#0ea5b7', 'Planejado': '#8b5cf6' },
    atype: { citygate: '#3b82f6', thermal: '#e4572e', producer: '#2e9e5b', lng_supply: '#0ea5b7', storage: '#8b5cf6' }
  },
  categoricalPalette: ['#26828C', '#122945', '#AB9671', '#7FCAD2', '#D9822B', '#6B8E23', '#8B5A83', '#706F6F', '#C3B191', '#3F6E9E'],

  basemapOptions: [
    { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'satellite', label: 'Satellite' },
    { id: 'terrain', label: 'Terrain' }, { id: 'none', label: 'None' }
  ],

  // Key-free raster basemaps (Esri). Replace with your organisation's tile server if needed.
  basemaps: {
    light: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'], attribution: 'Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors', maxzoom: 16 },
    dark: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'], attribution: 'Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors', maxzoom: 16 },
    satellite: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
    terrain: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'], attribution: 'Relief © Esri', maxzoom: 13 }
  },
  labelsOverlay: {
    light: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
    dark: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}']
  },
  adminBoundariesUrl: 'https://cdn.jsdelivr.net/gh/codeforgermany/click_that_hood@main/public/data/brazil-states.geojson',
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
  font: ['Noto Sans Regular'],
  fontBold: ['Noto Sans Medium'],

  regionColors: { SE: '#2f6fb3', NE: '#d9822b', N: '#2e9e5b', S: '#8b5cf6', CO: '#b8860b' },
  kindColors: { pipeline: '#5b6b7f', maritime: '#0ea5b7', regas: '#8b5cf6' },

  // ---------- context menus ----------
  // Each action: { id, label, when?(el) } – handlers live in js/actions.js
  contextMenus: {
    node: [
      { id: 'details', label: 'View details' },
      { id: 'timeseries', label: 'Open time series' },
      { id: 'balance', label: 'Inspect balance' },
      { id: 'compareWith', label: 'Compare with…' },
      { sep: true },
      { id: 'upstream', label: 'Highlight upstream' },
      { id: 'downstream', label: 'Highlight downstream' },
      { id: 'connected', label: 'Show connected pipelines' },
      { id: 'hops', label: 'Show 2 hops' },
      { id: 'component', label: 'Isolate connected component' },
      { id: 'filterFrom', label: 'Filter network from this node' },
      { id: 'pathTo', label: 'Find path to…' },
      { sep: true },
      { id: 'copyId', label: 'Copy ID' },
      { id: 'center', label: 'Center map here' }
    ],
    arc: [
      { id: 'details', label: 'View details' },
      { id: 'timeseries', label: 'Open time series' },
      { id: 'capacity', label: 'Show capacity usage' },
      { id: 'upstream', label: 'Highlight upstream network' },
      { id: 'downstream', label: 'Highlight downstream network' },
      { id: 'compareWith', label: 'Compare with…' },
      { sep: true },
      { id: 'copyId', label: 'Copy ID' },
      { id: 'zoomTo', label: 'Zoom to pipeline' }
    ],
    asset: [
      { id: 'details', label: 'View details' },
      { id: 'timeseries', label: 'Open time series' },
      { id: 'parentNode', label: 'Select node' },
      { id: 'copyId', label: 'Copy ID' }
    ]
  }
};
