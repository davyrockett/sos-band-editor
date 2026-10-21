/* suite.js: the "All apps" button for David's app suite (www.davyrockett.com/apps/) and Rundown
   (www.davyrockett.com/rundown/). When an app was opened from either, this adds a small round button
   that goes back there (sessionStorage 'davyrockett-suite-home', set by whichever one opened it). Opened any other way (a student's First Frets, the band's SOS Band, a TV), nothing
   shows. The same file is copied into every app (master copy: Claude Apps/tools/suite.js).
   Load it with: <script src="suite.js" defer></script>, and list it in sw.js ASSETS.
   Old-style JavaScript on purpose: Memory Lane runs on TV browsers. */
(function () {
  'use strict';
  var fromSuite = false;
  var home = '/apps/';
  try {
    fromSuite = sessionStorage.getItem('davyrockett-suite') === '1';
    home = sessionStorage.getItem('davyrockett-suite-home') || home;
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
  }
  if (document.body) add();
  else document.addEventListener('DOMContentLoaded', add);
})();
