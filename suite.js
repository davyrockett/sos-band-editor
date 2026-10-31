/* suite.js: the "All apps" button for David's app suite (www.davyrockett.com/apps/) and Rundown
   (www.davyrockett.com/rundown/). When an app was opened from either, this adds a small round button
   that goes back there ('davyrockett-suite-home', set by whichever one opened it, in sessionStorage and remembered in
   localStorage). On a device that has never opened either (a student's First Frets, the band's SOS Band, a TV), nothing
   shows. The same file is copied into every app (master copy: Claude Apps/tools/suite.js).
   Load it with: <script src="suite.js" defer></script>, and list it in sw.js ASSETS.
   Old-style JavaScript on purpose: Memory Lane runs on TV browsers.
   It also loads the TV mirror (www.davyrockett.com/tv/mirror.js) while 📺 TV is on for this device (switched on the
   Apps screen), so whatever app is open here shows on the TV. Not inside a frame: that's the TV itself.
   Both floating buttons (All apps, and the mirror's "On TV") sit in the bottom-left corner, or just above an app's
   bottom bar when it has one (on an iPhone they covered Memory Lane's controls, 2026-10-30). */
(function () {
  'use strict';
  try {
    if (localStorage.getItem('davyrockett-tv') === '1' && window.top === window) {
      var tv = document.createElement('script');
      tv.src = '/tv/mirror.js';
      document.head.appendChild(tv);
    }
  } catch (e) { /* blocked */ }

  /* ---------- Staying clear of bottom bars ----------
     Looks at what's under the bottom-left corner (leaving out these buttons). If that's inside a bar along the
     bottom of the screen (wide, not tall, its bottom edge at the bottom of the screen), the buttons go just above
     it. Checked a few times a second, since bars come and go as an app changes screens. */
  var FLOAT = ['suite-home', 'tv-pill'];
  function ours(e) {
    for (; e; e = e.parentElement) if (e.id === FLOAT[0] || e.id === FLOAT[1]) return true;
    return false;
  }
  function barTop() {
    var h = window.innerHeight, w = window.innerWidth, top = h, xs = [24, 110, 200, 290];
    if (!document.elementsFromPoint) return 0;
    for (var i = 0; i < xs.length && xs[i] < w; i++) {
      var stack = document.elementsFromPoint(xs[i], h - 30);
      for (var j = 0; j < stack.length; j++) {
        if (ours(stack[j])) continue;
        for (var e = stack[j]; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
          var r = e.getBoundingClientRect();
          if (r.width >= w * 0.6 && r.height < h * 0.5 && r.bottom <= h + 2 && r.bottom >= h - 40) {
            if (r.top < top) top = r.top;
            break;
          }
        }
        break;   // only the topmost thing that isn't one of these buttons
      }
    }
    return top < h ? top : 0;
  }
  function place() {
    var t = barTop();
    var bottom = t ? (window.innerHeight - t + 8) + 'px' : 'calc(12px + env(safe-area-inset-bottom,0px))';
    for (var i = 0; i < FLOAT.length; i++) {
      var el = document.getElementById(FLOAT[i]);
      // Only when it changes: a change on the page makes the TV mirror send a fresh copy.
      if (el && el.suiteBottom !== bottom) { el.style.bottom = bottom; el.suiteBottom = bottom; }
    }
  }
  setInterval(place, 600);
  window.addEventListener('resize', place);

  // Opened from the Apps screen or Rundown on this visit, or ever on this device (a Dock web app reopens straight
  // onto its last page, skipping the Apps screen: 2026-10-30). Students' and the band's devices never open them.
  var fromSuite = false;
  var home = '/apps/';
  try {
    fromSuite = sessionStorage.getItem('davyrockett-suite') === '1' || localStorage.getItem('davyrockett-suite') === '1';
    home = sessionStorage.getItem('davyrockett-suite-home') || localStorage.getItem('davyrockett-suite-home') || home;
  } catch (e) { /* blocked */ }
  if (!fromSuite) return;

  function add() {
    if (document.getElementById('suite-home')) return;
    var a = document.createElement('a');
    a.id = 'suite-home';
    a.href = home;
    a.setAttribute('aria-label', 'All apps');
    a.title = 'All apps';
    a.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">' +
      '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/>' +
      '<rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>';
    a.style.cssText = 'position:fixed;z-index:2147483646;left:calc(12px + env(safe-area-inset-left,0px));' +
      'bottom:calc(12px + env(safe-area-inset-bottom,0px));width:44px;height:44px;border-radius:50%;' +
      'display:flex;align-items:center;justify-content:center;background:rgba(30,27,24,.78);color:#fff;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.28);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);' +
      'border:1px solid rgba(255,255,255,.45);text-decoration:none;opacity:.92';
    document.body.appendChild(a);
    place();
  }
  if (document.body) add();
  else document.addEventListener('DOMContentLoaded', add);
})();
