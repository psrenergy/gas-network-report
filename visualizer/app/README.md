# Gas Network Explorer

An interactive map for exploring SDDP gas-network cases: topology, flows, capacity use, bottlenecks, marginal costs and nodal balances.

**Nothing to install.** It is a static web page that runs in the browser (Chrome, Edge or Firefox). Case files are read locally and never uploaded.

## Quick start

1. Open `index.html` by double-clicking it.
2. Click **Open case → SDDP case folder…** and select a case folder, meaning the one that contains `celecnode*.dat`, `celectransport.dat` and the result CSVs (`etranflw.csv`, `endcmg.csv`, …). You can also drag one or more case folders onto the window.
3. Open several folders to compare cases (toolbar → **Compare → vs case**).

Press **?** in the app to see all interactions and keyboard shortcuts.

## Layers, legend and panels

**Layers panel.** Each layer shows one element type: arcs (pipelines, LNG sea routes, regasification), nodes, assets at nodes (thermal plants, city-gates, production, LNG supply, storage) or reference data (EPE). The same type can be added several times, so one node can carry several results at once. For example: a circle coloured by marginal cost, a diamond sized by thermal consumption to the NE, and a square sized by city-gate demand to the NW. Per layer you can set:

- **Filter:** conditions on inputs (capacity, tariff, length, max production…) or results (flow, utilization, marginal cost, deficit…), e.g. *utilization ≥ 80 %*.
- **Colour:** single colour, or by any field (continuous palettes, utilization classes, categories).
- **Size:** line width or symbol size, fixed or proportional to a field.
- **Flow arrows** (arcs): on/off; the size can follow the absolute flow. Dashed/dotted lines and flow animation are also available.
- **Symbol** (points): circle, square, triangle, diamond, hexagon or star; position around the node (9 positions) and distance; outline.
- **Labels:** any combination of fields written on the map, with a toggle (the **Aa** button).

Drag ⠿ to reorder; the top of the list is drawn on top. **View** loads ready-made layer sets (defined in `js/config.js`, `views`). Your layers are remembered in the browser.

**Legend panel.** Reflects every visible layer: colour scales, size and arrow scales, symbols, filters and label fields. It shows Δ scales in comparison mode. Clicking a utilization class filters the map.

**Floating / dockable panels.** Layers, Filters, Legend, Properties and Tables & charts can be docked left, right or bottom (as tabs) or float over the map. Drag a tab away from its dock to float it. Drag a floating window's title onto a screen edge to dock it. Use the ❐ / ⋮ buttons, or the **Panels** menu, which also has *Reset panel layout*. Floating windows can be resized from the corner.

**Clicking a node** opens a popup with everything connected to it for the selected period/block: demands (city-gates, thermal plants, deficits), production and LNG supply, storage, pipelines in and out (flow and utilization), regasification, and the balance check. **Panels → Clicking a node opens** switches between the popup, the Properties panel, or both.

## Analyses

- **Gas origin tracing.** Each production field, LNG supply and storage discharge is a source. At every node the gas that arrives mixes with local injections (proportional mixing), and everything that leaves carries that mix. It is solved per block and scenario and aggregated like any other result; on the sample case it closes exactly (supply − losses = delivered). Where to see it:
  - the **Gas origin** view: arcs coloured by dominant origin, pie charts at the nodes;
  - node **Gas origin** tab and popups: origin mix, main individual sources, origin of the gas delivered to each demand, evolution over time;
  - layer fields *Share from …*, *Dominant gas origin* and *Gas mixed at node*, usable in any layer (colour, size, filter, labels);
  - **Charts → Gas origin → destination (Sankey)** and **Gas delivered by origin over time**.

  Source groups (Pre-salt, Bolivia/Argentina, Biomethane, Other domestic, LNG, Storage) are defined by name rules in `js/config.js` (`sourceGroups`).
- **Capacity duals.** SDDP's `etrancmc.csv` is not a capacity shadow price: it is non-zero on every pipeline, including idle ones. The explorer therefore derives the dual from the LP optimality conditions: μ = (1 − loss)·CMg(destination) − CMg(origin) − tariff, positive only where the arc limits the flow. For arcs out of service, μ is the value of building them. Related fields: *Capacity dual*, *Congestion rent* (μ × flow), *Probability of congestion* (share of hours and scenarios at ≥ 95 %). See the **Bottlenecks & capacity duals** view and **Charts → Capacity duals and congestion rent**.
- **Several scenarios.** The Scenario selector offers each scenario plus *Mean*, *Median (P50)*, *P10* and *P90*; the map, tables and legends follow the choice. Time-series charts show the P10–P90 band.
- **Storage and linepack.** Level, fill (% of maximum) and charge/discharge. See the **Storage & LNG** view and **Charts → Storage and linepack levels**, which follow the timeline.
- **Data checks panel.** Lists the following, each item clickable to locate it on the map:
  - flow above capacity, and flow on arcs out of service;
  - balances that do not close;
  - production above its maximum, and deficits;
  - storage levels outside their limits;
  - isolated nodes and nodes without coordinates;
  - demand at zero-cost nodes, and pipelines without a matching real trace;
  - parser warnings.

## Views, annotations and figures

- **Save view…** (Layers panel) stores the layers and styles, trace mode, basemap, filters and, optionally, the period, map position and annotations. Saved views appear under *My views* in the View menu.
  - **Manage views** downloads a view as `.json` (anyone can open it with Open case) or as a `.view.js` team file: copy it into `data/` and list it in `data/library.js`, and it appears under *Team views* for everyone.
- **Annotations:** 📍 button, **+ Note** or the N key, then click on the map. Drag a note to move it; double-click to edit or delete it.
- **Export figure** (📷): PNG (1×/2×/3×) or SVG with title, subtitle, the map exactly as shown, annotations, a vector legend of the visible layers, and a source line.

## Language

The interface is in Brazilian Portuguese by default (numbers as 1.234,5). The **EN / PT** button switches to English. Translations are in `js/i18n.js` (`DICT`); strings missing there appear in English.

## Real pipeline traces (EPE geofiles)

`data/epe-infra.js` holds the EPE gas-infrastructure layers: transport, gathering/offshore and distribution pipelines, compression stations, LNG terminals and processing plants. When it is loaded, every model pipeline is routed automatically along the EPE transport network: a shortest path between the reference points nearest to its two nodes, accepted only when plausible. On the sample case, 42 of the 45 pipelines match. The Bolivian stretches and the Lateral Cuiabá (which starts in Bolivia) keep a straight line.

**Layers → Display → Pipeline trace** switches between **Real (EPE)**, **Straight** and **Arcs**. EPE layers can also be added as map layers (Layers → + Add layer → Reference data), coloured by category (existing / authorised / indicative).

To update the EPE data, run the command below. Alternatively, drop the `.shp/.dbf/.cpg` files (or the `epe_shapefiles` folder) onto the app to load them for the current session.

```
node tools/pack-reference.js "<folder with epe_shapefiles>" data/epe-infra.js
```

A per-case `geometry.geojson` (see below) still takes priority over the automatic routes.

## Sharing with your team

Pick the option that fits. None of them needs a server-side install.

| Option | How |
|---|---|
| **Shared folder** (recommended) | Copy the whole `app` folder to a network drive, SharePoint-synced folder or Teams channel files. Everyone opens `index.html` from there. |
| **Pre-loaded cases** | In the app, use **Open case → Save as team-library file (.case.js)**. Copy the file into `app/data/` and add its path to `app/data/library.js`. Everyone who opens that copy of the app sees the case immediately. |
| **Send one case** | **Open case → Save current case as dataset (.json)**. Send the file; the recipient opens it with **Open case → Dataset…** or drags it onto the window. |
| **Point to a view** | The 🔗 button copies a link with the current case, period, block, view, selection and map position. It works for anyone who has the same case loaded (the same shared copy or the same library). |
| **Web server** | The folder can also be served as static files (IIS, nginx, GitHub Pages, `python -m http.server`). No build step is needed. |

Personal preferences (theme, units, panel sizes, utilization classes) are stored per user in the browser.

## What is shown

| Concept | Source (SDDP) | Notes |
|---|---|---|
| Nodes | `celecnode*.dat`, coordinates `gcnode*.dat` | The region comes from the file suffix (`se`, `ne`, `no`, `su`). Co-located nodes (e.g. an FSRU tank and its gas-side node) are drawn slightly offset. |
| Pipelines / LNG sea routes | `celectransport.dat` + dated changes in `melectransport.dat` | Capacity per period in both directions. `Existing = 1` means out of service until a modification activates the pipeline. |
| Regasification | `fixedconv.dat`, `comfixconv.dat`, `mfixedconv.dat` | Drawn as an arc from the LNG tank node to the gas node. |
| Assets | producers `celecgen*.dat`, loads `celecload*.dat`, storage `celecstorage*.dat` | Loads whose name contains "nivel N / elástico" are classified as city-gates, the rest as thermal plants (edit `classifyLoad` in `js/config.js`). |
| Flow | `etranflw.csv`, `fxcnod.csv` | Converted from volume per block to an average rate in **mil m³/d**. The `etranflw` header says "UE", but the values are kUE; this is handled automatically. |
| Marginal cost | `endcmg.csv` | k$/unit → **US$/mil m³** (the Units menu can switch to US$/MMBtu). |
| Production, demand, deficit, storage | `epdger`, `edemmet`, `edemdef`, `estinj`, `estbal` | Storage: a positive value means gas delivered to the network. |
| Block durations | `duraci.csv` | "All blocks" = hours-weighted average. |

**Utilization** = |flow| ÷ capacity in the flow direction. With "All blocks" it is the hours-weighted average of the per-block utilizations. The peak block is shown separately. The nodal balance (inflows − outflows + injections − withdrawals) is computed from the results and closes to rounding on the sample case.

## Pipeline geometry

SDDP stores only node coordinates. Besides the automatic EPE routes, you can give exact routes with a GeoJSON file of `LineString` features. Either place it as `geometry.geojson` inside the case folder, or load it with **Open case → Dataset or geometry file**. Each feature is matched to a pipeline by the property `id` (e.g. `P12`), `code` (e.g. `12`) or `name`:

```json
{ "type": "FeatureCollection", "features": [
  { "type": "Feature", "properties": { "code": 1 },
    "geometry": { "type": "LineString", "coordinates": [[-57.65, -19.01], [-56.2, -19.9], [-54.65, -20.44]] } }
] }
```

## Customising

Most changes are made in `js/config.js`, without touching the rest of the code:

- `elementTypes`: asset types, colours and icons
- `variables`: result variables available for colours, sizes, tables and charts
- `views`: ready-made layer sets (the View menu)
- `basemaps`: background maps (replace the tile URLs with your organisation's tile server if needed)
- `contextMenus`: right-click actions
- `utilizationBins`: default utilization classes (each user can also edit them under **Styling**)
- `units`: display units and conversion factors

## Folder layout

```
app/
  index.html          entry point
  css/app.css
  js/                 config, parser, model, layers, routing, shapefile reader, map, docks, panels, charts
  vendor/             MapLibre GL, ECharts, Tabulator (local copies, so the app works offline)
  data/library.js     list of pre-loaded team cases and reference data (epe-infra.js)
  tools/pack-case.js  optional: build a library file from the command line (needs Node.js)
```

An internet connection is needed only for background maps and state boundaries. The network, results, charts and tables work offline.

Command-line alternative for pre-loading cases (optional):

```
node tools/pack-case.js "<case folder>" "Case name" data/case-name.case.js --check
```

`--check` prints the largest nodal-balance residuals as a quick sanity check.
