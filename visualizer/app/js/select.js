/*
 * Styled drop-down lists. Every native <select> in the page is paired with a button and a
 * floating list drawn in the PSR style; the native element stays in the DOM (hidden) and keeps
 * the value, so existing code (value, onchange, options) works unchanged.
 * Opt out with <select data-native>.
 */
(function () {
  'use strict';
  var S = GV.select = {};
  var pop = null, cur = null, active = -1, typed = '', typedT = 0;

  function label(sel) {
    var o = sel.options[sel.selectedIndex];
    return o ? o.textContent : '';
  }
  function sync(sel) {
    var b = sel._gsel; if (!b) return;
    b.querySelector('.gsel-t').textContent = label(sel) || ' ';
    b.disabled = sel.disabled;
    b.title = sel.title || label(sel);
    // keep width rules written for the select (inline style, flex, width)
    if (sel.style.cssText !== b._css) { b._css = sel.style.cssText; b.style.cssText = sel.style.cssText; }
    b.hidden = sel.hidden;
  }
  S.sync = sync;

  function enhance(sel) {
    if (sel._gsel || sel.hasAttribute('data-native') || sel.multiple || sel.size > 1) return;
    if (sel.closest('.tabulator')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'gsel' + (sel.className ? ' ' + sel.className : '');
    if (sel.id) b.setAttribute('data-for', sel.id);
    b.innerHTML = '<span class="gsel-t"></span><i class="fa-solid fa-chevron-down gsel-c"></i>';
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (cur === sel) close(); else open(sel); });
    b.addEventListener('keydown', function (e) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].indexOf(e.key) >= 0 && cur !== sel) { e.preventDefault(); open(sel); }
    });
    sel._gsel = b;
    sel.classList.add('gsel-native');
    sel.tabIndex = -1;
    sel.parentNode.insertBefore(b, sel.nextSibling);
    sel.addEventListener('change', function () { sync(sel); });
    sync(sel);
  }

  // ---------------------------------------------------------------- list
  function items() { return pop ? Array.prototype.slice.call(pop.querySelectorAll('.gsel-o:not(.hide)')) : []; }
  function open(sel) {
    close();
    cur = sel;
    var b = sel._gsel, r = b.getBoundingClientRect();
    pop = document.createElement('div');
    pop.className = 'gsel-pop' + (b.closest('#toolbar') ? ' on-dark' : '');
    var list = document.createElement('div');
    list.className = 'gsel-list';
    var nOpt = 0;
    Array.prototype.forEach.call(sel.children, function (c) {
      if (c.tagName === 'OPTGROUP') {
        var gh = document.createElement('div'); gh.className = 'gsel-g'; gh.textContent = c.label; list.appendChild(gh);
        Array.prototype.forEach.call(c.children, function (o) { list.appendChild(opt(sel, o)); nOpt++; });
      } else if (c.tagName === 'OPTION') { list.appendChild(opt(sel, c)); nOpt++; }
    });
    if (nOpt > 12) {
      var q = document.createElement('input');
      q.type = 'search'; q.className = 'gsel-q'; q.placeholder = GV.i18n && GV.i18n.lang === 'pt' ? 'Filtrar…' : 'Filter…';
      q.addEventListener('input', function () {
        var t = q.value.trim().toLowerCase();
        list.querySelectorAll('.gsel-o').forEach(function (o) { o.classList.toggle('hide', t && o.textContent.toLowerCase().indexOf(t) < 0); });
        list.querySelectorAll('.gsel-g').forEach(function (g) {
          var n = g.nextElementSibling, any = false;
          while (n && !n.classList.contains('gsel-g')) { if (!n.classList.contains('hide')) any = true; n = n.nextElementSibling; }
          g.classList.toggle('hide', !any);
        });
        setActive(0);
      });
      q.addEventListener('keydown', keys);
      pop.appendChild(q);
    }
    pop.appendChild(list);
    document.body.appendChild(pop);
    // position: below the button, or above when there is no room
    var w = Math.max(r.width, 160), vh = window.innerHeight, vw = window.innerWidth;
    pop.style.minWidth = w + 'px';
    pop.style.maxWidth = Math.max(w, 360) + 'px';
    var ph = Math.min(pop.offsetHeight, 340), below = vh - r.bottom - 8, above = r.top - 8;
    var up = below < Math.min(ph, 220) && above > below;
    pop.style.maxHeight = Math.max(120, Math.min(340, up ? above : below)) + 'px';
    pop.style.left = Math.max(6, Math.min(r.left, vw - pop.offsetWidth - 6)) + 'px';
    if (up) { pop.style.bottom = (vh - r.top + 4) + 'px'; pop.classList.add('up'); } else pop.style.top = (r.bottom + 4) + 'px';
    b.classList.add('open');
    var its = items(), si = its.findIndex(function (o) { return o._opt === sel.options[sel.selectedIndex]; });
    setActive(si < 0 ? 0 : si, true);
    var qi = pop.querySelector('.gsel-q');
    (qi || b).focus();
    if (!qi) b.addEventListener('keydown', keys);
  }
  function opt(sel, o) {
    var d = document.createElement('div');
    d.className = 'gsel-o' + (o.selected ? ' sel' : '') + (o.disabled ? ' dis' : '');
    d.innerHTML = '<i class="fa-solid fa-check"></i><span></span>';
    d.querySelector('span').textContent = o.textContent;
    d._opt = o;
    d.addEventListener('mousedown', function (e) { e.preventDefault(); });
    d.addEventListener('click', function () { if (!o.disabled) choose(sel, o); });
    d.addEventListener('mousemove', function () { var its = items(), i = its.indexOf(d); if (i !== active) setActive(i); });
    return d;
  }
  function setActive(i, center) {
    var its = items(); if (!its.length) { active = -1; return; }
    active = Math.max(0, Math.min(its.length - 1, i));
    pop.querySelectorAll('.gsel-o.act').forEach(function (o) { o.classList.remove('act'); });
    its[active].classList.add('act');
    var el = its[active], list = pop.querySelector('.gsel-list');
    if (center) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2;
    else if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop - 4;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 4;
  }
  function choose(sel, o) {
    var changed = sel.value !== o.value || sel.options[sel.selectedIndex] !== o;
    o.selected = true;
    var b = sel._gsel;
    close();
    sync(sel);
    if (b) b.focus();
    if (changed) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  function keys(e) {
    if (!cur) return;
    var its = items();
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(its.length - 1); }
    else if (e.key === 'Enter' || (e.key === ' ' && e.target.tagName !== 'INPUT')) { e.preventDefault(); if (its[active] && !its[active]._opt.disabled) choose(cur, its[active]._opt); }
    else if (e.key === 'Escape' || e.key === 'Tab') { var b = cur._gsel; close(); if (e.key === 'Escape') { e.preventDefault(); b.focus(); } }
    else if (e.key.length === 1 && e.target.tagName !== 'INPUT') {
      // type-ahead
      var now = Date.now(); typed = now - typedT > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase(); typedT = now;
      var k = its.findIndex(function (o) { return o.textContent.trim().toLowerCase().indexOf(typed) === 0; });
      if (k >= 0) setActive(k);
    }
  }
  function close() {
    if (!cur) return;
    var b = cur._gsel;
    if (b) { b.classList.remove('open'); b.removeEventListener('keydown', keys); }
    if (pop) pop.remove();
    pop = null; cur = null; active = -1;
  }
  S.close = close;

  // ---------------------------------------------------------------- wiring
  // programmatic changes (sel.value = …, option.selected = …) do not fire events: patch the setters
  function hook(proto, prop, getSel) {
    var d = Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.set) return;
    Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { d.set.call(this, v); var s = getSel(this); if (s && s._gsel) sync(s); } });
  }
  hook(HTMLSelectElement.prototype, 'value', function (x) { return x; });
  hook(HTMLSelectElement.prototype, 'selectedIndex', function (x) { return x; });
  hook(HTMLSelectElement.prototype, 'disabled', function (x) { return x; });
  hook(HTMLOptionElement.prototype, 'selected', function (x) { return x.parentNode && (x.parentNode.tagName === 'SELECT' ? x.parentNode : x.parentNode.parentNode); });

  var pending = new Set(), scheduled = false;
  function flush() {
    scheduled = false;
    pending.forEach(function (s) { if (s.isConnected) { if (!s._gsel) enhance(s); else sync(s); } });
    pending.clear();
  }
  function queue(s) { pending.add(s); if (!scheduled) { scheduled = true; Promise.resolve().then(flush); } }
  function scan(root) {
    if (root.tagName === 'SELECT') queue(root);
    else if (root.querySelectorAll) root.querySelectorAll('select').forEach(queue);
  }
  S.start = function () {
    scan(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        var t = m.target.nodeType === 3 ? m.target.parentNode : m.target;
        var s = t && t.closest && t.closest('select');
        if (s) { queue(s); return; }
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); });
        m.removedNodes.forEach(function (n) { if (n.nodeType === 1 && cur && (n === cur || n.contains(cur))) close(); });
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'style', 'label', 'hidden'] });
    document.addEventListener('mousedown', function (e) { if (pop && !pop.contains(e.target) && !(cur && cur._gsel.contains(e.target))) close(); }, true);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', function (e) { if (pop && !pop.contains(e.target)) close(); }, true);
  };
})();
