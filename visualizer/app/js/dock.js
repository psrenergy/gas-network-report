/*
 * Dockable / floating panels.
 * Panels live in one of three docks (left, right, bottom; several panels per dock as tabs) or float
 * over the map as movable, resizable windows. Drag a tab or a window title onto a screen edge to dock
 * it; drag it away from its dock to float it. The layout is saved per user.
 */
(function () {
  'use strict';
  var U = GV.util, h = U.h;
  var D = GV.dock = {};
  var panels = {}, order = [];
  var DEFAULT = {
    panels: {
      layers: { dock: 'left', order: 0 }, filters: { dock: 'left', order: 1 },
      props: { dock: 'right', order: 0 }, checks: { dock: 'right', order: 2 }, data: { dock: 'bottom', order: 0 },
      legend: { dock: 'float', order: 0, x: 12, y: -12, w: 250, h: 330 }
    },
    active: { left: 'layers', right: 'props', bottom: 'data' },
    collapsed: { left: false, right: false, bottom: true }
  };
  var L = null;

  function save() { U.store.set('dockLayout', L); }
  function load() {
    L = U.store.get('dockLayout', null);
    if (!L || !L.panels) L = JSON.parse(JSON.stringify(DEFAULT));
    if (window.innerWidth < 1100 && !U.store.get('dockLayout', null)) { L.collapsed.left = true; }
    if (window.innerWidth < 800 && !U.store.get('dockLayout', null)) { L.collapsed.right = true; }
  }

  /** def: { id, title, el } */
  D.register = function (def) {
    if (!L) load();
    panels[def.id] = def;
    order.push(def.id);
    if (!L.panels[def.id]) L.panels[def.id] = JSON.parse(JSON.stringify(DEFAULT.panels[def.id] || { dock: 'float', x: 60, y: 60, w: 360, h: 320 }));
    def.el.classList.add('gpanel');
  };

  function inDock(dock) {
    return order.filter(function (id) { var p = L.panels[id]; return p.dock === dock && !p.hidden; })
      .sort(function (a, b) { return (L.panels[a].order || 0) - (L.panels[b].order || 0); });
  }

  // ---------------------------------------------------------------- render
  D.render = function () {
    ['left', 'right', 'bottom'].forEach(renderDock);
    renderFloats();
    var ws = U.$('#workspace'), center = U.$('#center');
    var hasL = inDock('left').length > 0, hasR = inDock('right').length > 0;
    ws.classList.toggle('no-left', !hasL);
    ws.classList.toggle('no-right', !hasR);
    ws.classList.toggle('left-collapsed', hasL && L.collapsed.left);
    ws.classList.toggle('right-collapsed', hasR && L.collapsed.right);
    // collapsed side docks keep a thin strip with vertical tabs; empty docks take no space
    // extra[side]: width of a sub-panel attached to that dock (e.g. the layer editor); it pushes the map
    var xl = extra.left ? ' + ' + extra.left + 'px' : '', xr = extra.right ? ' + ' + extra.right + 'px' : '';
    ws.style.gridTemplateColumns = (!hasL ? '0 0' : L.collapsed.left ? 'var(--collapsed-w) 0' : 'calc(var(--left-w)' + xl + ') 5px') + ' 1fr ' +
      (!hasR ? '0 0' : L.collapsed.right ? '0 var(--collapsed-w)' : '5px calc(var(--right-w)' + xr + ')');
    U.$('#dock-left').style.paddingRight = extra.left && hasL && !L.collapsed.left ? extra.left + 'px' : '';
    U.$('#dock-right').style.paddingLeft = extra.right && hasR && !L.collapsed.right ? extra.right + 'px' : '';
    center.classList.toggle('no-bottom', !inDock('bottom').length);
    center.classList.toggle('bottom-collapsed', inDock('bottom').length > 0 && L.collapsed.bottom);
    ['left', 'right', 'bottom'].forEach(function (d) { var b = U.$('#btn-' + d); if (b) b.classList.toggle('on', D.dockOpen(d)); });
    save();
    setTimeout(function () { if (GV.map && GV.map.resize) GV.map.resize(); window.dispatchEvent(new Event('gv-panels')); }, 0);
  };
  var extra = { left: 0, right: 0 };
  /** Reserve width next to a side dock for an attached sub-panel (0 to release). */
  D.setExtra = function (side, px) {
    px = px || 0;
    if (side === 'left' || side === 'right') { if (extra[side] === px) return; extra[side] = px; }
    else { if (!extra.left && !extra.right) return; extra.left = extra.right = 0; }
    D.render();
  };
  D.dockOpen = function (dock) { return inDock(dock).length > 0 && !L.collapsed[dock]; };

  function renderDock(dock) {
    var root = U.$('#dock-' + dock), tabs = U.clear(U.$('.dock-tabs', root)), body = U.$('.dock-body', root);
    var ids = inDock(dock);
    root.classList.toggle('collapsed', !!L.collapsed[dock]);
    if (ids.length && ids.indexOf(L.active[dock]) < 0) L.active[dock] = ids[0];
    Array.prototype.slice.call(body.children).forEach(function (ch) { if (!ids.some(function (id) { return panels[id].el === ch; })) body.removeChild(ch); });
    ids.forEach(function (id) {
      var p = panels[id], active = id === L.active[dock];
      var tab = h('button.dtab' + (active && !L.collapsed[dock] ? '.active' : ''), { title: 'Drag to move · double-click to float' }, h('span', p.title));
      tab.addEventListener('mousedown', function (e) { if (e.button === 0) startTabDrag(e, id); });
      tab.addEventListener('click', function () {
        if (tab._dragged) return;
        if (L.active[dock] === id && !L.collapsed[dock]) L.collapsed[dock] = true;   // click the active tab: collapse
        else { L.active[dock] = id; L.collapsed[dock] = false; }
        D.render();
      });
      tab.addEventListener('dblclick', function () { D.move(id, 'float'); });
      tabs.appendChild(tab);
      if (p.el.parentNode !== body) body.appendChild(p.el);
      p.el.style.display = active ? '' : 'none';
    });
    var tools = h('div.dtab-tools');
    var act = L.active[dock];
    if (act && panels[act] && panels[act].tools) tools.appendChild(panels[act].tools);
    var colIcon = { left: L.collapsed.left ? 'fa-angles-right' : 'fa-angles-left', right: L.collapsed.right ? 'fa-angles-left' : 'fa-angles-right', bottom: L.collapsed.bottom ? 'fa-chevron-up' : 'fa-chevron-down' }[dock];
    if (act) {
      if (!L.collapsed[dock] || dock === 'bottom') {
        tools.appendChild(h('button.icon-btn', { title: 'Float this panel', onclick: function () { D.move(act, 'float'); } }, h('i.fa-regular.fa-window-restore')));
        tools.appendChild(menuButton(act));
      }
      tools.appendChild(h('button.icon-btn.dock-collapse', { title: L.collapsed[dock] ? 'Expand' : 'Collapse', onclick: function () { L.collapsed[dock] = !L.collapsed[dock]; D.render(); } }, h('i.fa-solid.' + colIcon)));
    }
    tabs.appendChild(tools);
  }

  function menuButton(id) {
    return h('button.icon-btn', { title: 'Panel position', onclick: function (e) {
      e.stopPropagation();
      var m = U.$('#dock-menu'); U.clear(m);
      [['left', 'Dock left'], ['right', 'Dock right'], ['bottom', 'Dock bottom'], ['float', 'Float']].forEach(function (o) {
        if (L.panels[id].dock === o[0]) return;
        m.appendChild(h('button', { onclick: function () { m.hidden = true; D.move(id, o[0]); } }, o[1]));
      });
      m.appendChild(h('div.menu-sep'));
      m.appendChild(h('button', { onclick: function () { m.hidden = true; D.hide(id); } }, 'Close panel'));
      var r = e.currentTarget.getBoundingClientRect();
      m.hidden = false;
      m.style.left = Math.min(r.left, window.innerWidth - 200) + 'px'; m.style.top = (r.bottom + 4) + 'px';
    } }, h('i.fa-solid.fa-ellipsis-vertical'));
  }
  document.addEventListener('mousedown', function (e) { var m = U.$('#dock-menu'); if (m && !m.hidden && !m.contains(e.target)) m.hidden = true; });

  // ---------------------------------------------------------------- floating windows
  var zTop = 20;
  function renderFloats() {
    var host = U.$('#floats');
    var ids = order.filter(function (id) { return L.panels[id].dock === 'float' && !L.panels[id].hidden; });
    Array.prototype.slice.call(host.children).forEach(function (w) { if (ids.indexOf(w.dataset.panel) < 0) host.removeChild(w); });
    ids.forEach(function (id) {
      var p = panels[id], cfg = L.panels[id];
      var win = U.$('.fwin[data-panel="' + id + '"]', host);
      if (!win) {
        win = h('div.fwin', { dataset: { panel: id } },
          h('div.fwin-head', h('span.fwin-title', p.title), h('div.fwin-tools')),
          h('div.fwin-body'));
        host.appendChild(win);
        U.$('.fwin-head', win).addEventListener('mousedown', function (e) { if (e.button === 0 && !e.target.closest('button')) startWinDrag(e, id, win); });
        win.addEventListener('mousedown', function () { win.style.zIndex = ++zTop; });
        new ResizeObserver(U.debounce(function () {
          if (!win.isConnected) return;
          cfg.w = win.offsetWidth; cfg.h = win.offsetHeight; save();
        }, 200)).observe(win);
      }
      var tools = U.clear(U.$('.fwin-tools', win));
      if (p.tools) tools.appendChild(p.tools);
      tools.appendChild(h('button.icon-btn', { title: 'Dock left', onclick: function () { D.move(id, 'left'); } }, h('i.fa-solid.fa-arrow-left-long')));
      tools.appendChild(h('button.icon-btn', { title: 'Dock bottom', onclick: function () { D.move(id, 'bottom'); } }, h('i.fa-solid.fa-arrow-down-long')));
      tools.appendChild(h('button.icon-btn', { title: 'Dock right', onclick: function () { D.move(id, 'right'); } }, h('i.fa-solid.fa-arrow-right-long')));
      tools.appendChild(h('button.icon-btn', { title: 'Close', onclick: function () { D.hide(id); } }, h('i.fa-solid.fa-xmark')));
      var body = U.$('.fwin-body', win);
      if (p.el.parentNode !== body) body.appendChild(p.el);
      p.el.style.display = '';
      placeWin(win, cfg);
    });
  }
  function placeWin(win, cfg) {
    var host = U.$('#floats'), W = host.clientWidth || window.innerWidth, H = host.clientHeight || window.innerHeight;
    var w = Math.min(cfg.w || 320, W - 10), hh = Math.min(cfg.h || 300, H - 10);
    var x = cfg.x < 0 ? W - w + cfg.x : cfg.x, y = cfg.y < 0 ? H - hh + cfg.y : cfg.y;
    x = Math.max(0, Math.min(W - 60, x)); y = Math.max(0, Math.min(H - 30, y));
    Object.assign(win.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
  }

  // ---------------------------------------------------------------- dragging
  var dropEl = null;
  function zones() {
    var ws = U.$('#workspace').getBoundingClientRect(), E = 70;
    return {
      left: { x: ws.left, y: ws.top, w: E, h: ws.height },
      right: { x: ws.right - E, y: ws.top, w: E, h: ws.height },
      bottom: { x: ws.left + E, y: ws.bottom - E, w: ws.width - 2 * E, h: E }
    };
  }
  function zoneAt(x, y) {
    var z = zones(), hit = null;
    Object.keys(z).forEach(function (k) { var r = z[k]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) hit = k; });
    return hit;
  }
  function showZones(active) {
    if (!dropEl) { dropEl = h('div#dock-drop'); document.body.appendChild(dropEl); }
    U.clear(dropEl);
    var z = zones();
    Object.keys(z).forEach(function (k) {
      var r = z[k];
      dropEl.appendChild(h('div.dzone' + (k === active ? '.on' : ''), { style: { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' } }, 'Dock ' + k));
    });
    dropEl.hidden = false;
  }
  function hideZones() { if (dropEl) dropEl.hidden = true; }

  function startWinDrag(e, id, win) {
    e.preventDefault();
    var r = win.getBoundingClientRect(), host = U.$('#floats').getBoundingClientRect();
    var ox = e.clientX - r.left, oy = e.clientY - r.top, cfg = L.panels[id];
    win.style.zIndex = ++zTop;
    function mv(ev) {
      cfg.x = ev.clientX - host.left - ox; cfg.y = ev.clientY - host.top - oy;
      win.style.left = cfg.x + 'px'; win.style.top = cfg.y + 'px';
      showZones(zoneAt(ev.clientX, ev.clientY));
    }
    function up(ev) {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
      hideZones();
      var z = zoneAt(ev.clientX, ev.clientY);
      if (z) D.move(id, z); else save();
    }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  }
  function startTabDrag(e, id) {
    var sx = e.clientX, sy = e.clientY, tab = e.currentTarget, floated = false;
    tab._dragged = false;
    function mv(ev) {
      if (!floated && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 12) {
        floated = true; tab._dragged = true;
        var host = U.$('#floats').getBoundingClientRect(), cfg = L.panels[id];
        cfg.x = ev.clientX - host.left - 60; cfg.y = ev.clientY - host.top - 12;
        cfg.w = cfg.w || 340; cfg.h = cfg.h || 320;
        D.move(id, 'float');
        var win = U.$('.fwin[data-panel="' + id + '"]');
        window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
        if (win) startWinDrag({ preventDefault: function () {}, clientX: ev.clientX, clientY: ev.clientY }, id, win);
      }
    }
    function up() { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); setTimeout(function () { tab._dragged = false; }, 0); }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  }

  // ---------------------------------------------------------------- API
  D.move = function (id, where) {
    var cfg = L.panels[id];
    cfg.hidden = false;
    if (where === 'float' && cfg.dock !== 'float') {
      if (cfg.x === undefined) { cfg.x = 80; cfg.y = 60; }
      cfg.w = cfg.w || 360; cfg.h = cfg.h || 360;
    }
    cfg.dock = where;
    if (where !== 'float') {
      cfg.order = inDock(where).length + 1;
      L.active[where] = id; L.collapsed[where] = false;
    }
    D.render();
  };
  D.show = function (id) {
    var cfg = L.panels[id]; if (!cfg) return;
    cfg.hidden = false;
    if (cfg.dock === 'float') { D.render(); var w = U.$('.fwin[data-panel="' + id + '"]'); if (w) w.style.zIndex = ++zTop; return; }
    L.active[cfg.dock] = id; L.collapsed[cfg.dock] = false;
    D.render();
  };
  D.hide = function (id) { L.panels[id].hidden = true; D.render(); if (D.onChange) D.onChange(); };
  D.toggle = function (id) { if (D.isVisible(id)) D.hide(id); else D.show(id); };
  D.isVisible = function (id) {
    var cfg = L && L.panels[id]; if (!cfg || cfg.hidden) return false;
    if (cfg.dock === 'float') return true;
    return L.active[cfg.dock] === id && !L.collapsed[cfg.dock];
  };
  D.isOpen = function (id) { var cfg = L && L.panels[id]; return !!cfg && !cfg.hidden; };
  D.toggleDock = function (dock) {
    if (!inDock(dock).length) { U.toast('No panel docked here. Use the Panels menu or drag a panel to that edge.'); return; }
    L.collapsed[dock] = !L.collapsed[dock]; D.render();
  };
  var saved = null;
  D.mapOnly = function () {
    if (saved) { L.collapsed = saved.c; order.forEach(function (id) { if (saved.f.indexOf(id) >= 0) L.panels[id].hidden = false; }); saved = null; }
    else {
      saved = { c: Object.assign({}, L.collapsed), f: order.filter(function (id) { return L.panels[id].dock === 'float' && !L.panels[id].hidden; }) };
      L.collapsed = { left: true, right: true, bottom: true };
      saved.f.forEach(function (id) { L.panels[id].hidden = true; });
    }
    D.render();
  };
  D.reset = function () { L = JSON.parse(JSON.stringify(DEFAULT)); D.render(); };
  D.list = function () { return order.map(function (id) { return { id: id, title: panels[id].title, open: D.isOpen(id) }; }); };
  D.panelSize = function (dock, px) {
    document.documentElement.style.setProperty('--' + dock + (dock === 'bottom' ? '-h' : '-w'), px + 'px');
  };
  D.init = function () {
    if (!L) load();
    var sizes = U.store.get('sizes', {});
    Object.keys(sizes).forEach(function (k) { document.documentElement.style.setProperty('--' + k, sizes[k] + 'px'); });
    // gutters
    U.$$('.gutter').forEach(function (g) {
      g.addEventListener('mousedown', function (e) {
        e.preventDefault(); g.classList.add('drag');
        var dock = g.dataset.panel, start = { x: e.clientX, y: e.clientY };
        var el = U.$('#dock-' + dock), r = el.getBoundingClientRect(), base = dock === 'bottom' ? r.height : r.width;
        function mv(ev) {
          var d = dock === 'left' ? ev.clientX - start.x : dock === 'right' ? start.x - ev.clientX : start.y - ev.clientY;
          var v = Math.max(dock === 'bottom' ? 120 : 200, Math.min(dock === 'bottom' ? window.innerHeight - 200 : 760, base + d));
          var key = dock === 'left' ? 'left-w' : dock === 'right' ? 'right-w' : 'bottom-h';
          document.documentElement.style.setProperty('--' + key, v + 'px');
          sizes[key] = v;
          GV.map.resize();
        }
        function up() { g.classList.remove('drag'); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); U.store.set('sizes', sizes); window.dispatchEvent(new Event('gv-panels')); }
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      });
    });
    window.addEventListener('resize', U.debounce(function () { renderFloats(); }, 150));
    D.render();
  };
})();
