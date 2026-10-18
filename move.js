/* move.js: carries an app's settings over when David's apps move from davyrockett.github.io to
   www.davyrockett.com. Browsers keep saved data per web address, so without this every app would
   open empty at the new address. The same file is copied into every app (master copy:
   Claude Apps/tools/move.js). Plan: Claude Apps/move-to-davyrockett-com.md.

   Load it as the FIRST script in <head>, so settings arrive before the app reads them:
     <script src="move.js" data-keep="bg."></script>
   data-keep    localStorage key prefixes this app owns (comma-separated).
   data-synced  keys that are also on GitHub: carried only if this device couldn't sync them just now.
   data-guard   "idb" for apps that keep entries in IndexedDB: a device whose entries aren't synced
                to GitHub doesn't move automatically (they can't travel in a link).

   On the old address it checks, when the app opens, whether GitHub now redirects to the new one.
   If so: finish any pending sync, pack this app's settings (never access keys) into the part of the
   link after "#" (it never reaches any server), switch off the old offline copy, and open the app at
   the new address. At the new address it unpacks them without overwriting anything already there.
   Written in old-style JavaScript on purpose: Memory Lane runs on TV browsers. */
(function () {
  'use strict';
  var OLD_HOST = 'davyrockett.github.io';
  var NEW_ORIGIN = 'https://www.davyrockett.com';
  var SKIP = /token|sync-?last/i;   // access keys and "last synced" times never travel

  var script = document.currentScript || (function () {
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) if (/(^|\/)move\.js/.test(all[i].src)) return all[i];
    return null;
  })();
  function list(attr) {
    var v = script && script.getAttribute(attr);
    return v ? v.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
  }
  var KEEP = list('data-keep');
  var SYNCED = list('data-synced');
  var GUARD = script && script.getAttribute('data-guard');

  function owned(key) {
    if (SKIP.test(key)) return false;
    for (var i = 0; i < KEEP.length; i++) if (key.indexOf(KEEP[i]) === 0) return true;
    return false;
  }

  /* ---------- Packing settings into a link ---------- */

  function toB64url(binary) {
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(text) {
    return atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  }
  function bytesToBinary(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return out;
  }
  function binaryToBytes(binary) {
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function streamBytes(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()
      .then(function (buf) { return new Uint8Array(buf); });
  }

  // "j" + plain JSON, or "z" + gzipped JSON for bigger bundles (where the browser can).
  function encode(data) {
    var json = unescape(encodeURIComponent(JSON.stringify(data)));
    if (json.length > 4000 && typeof CompressionStream === 'function') {
      return streamBytes(binaryToBytes(json), new CompressionStream('gzip'))
        .then(function (bytes) { return 'z' + toB64url(bytesToBinary(bytes)); })
        .catch(function () { return 'j' + toB64url(json); });
    }
    return Promise.resolve('j' + toB64url(json));
  }

  function store(data) {
    var added = 0;
    for (var key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key) || !owned(key)) continue;
      try {
        if (localStorage.getItem(key) === null) { localStorage.setItem(key, String(data[key])); added++; }
      } catch (e) { /* storage full or blocked: skip */ }
    }
    return added;
  }

  /* ---------- Arriving at the new address ---------- */

  function receive() {
    if (location.hash.indexOf('#carry=') !== 0) return;
    var packed = location.hash.slice(7);
    // Clean the address first, so a reload never imports twice.
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* old browser */ }
    try {
      if (packed.charAt(0) === 'j') {
        store(JSON.parse(decodeURIComponent(escape(fromB64url(packed.slice(1))))));
      } else if (packed.charAt(0) === 'z' && typeof DecompressionStream === 'function') {
        // Unzipping takes a moment, so the app has already started: reload once it's saved.
        streamBytes(binaryToBytes(fromB64url(packed.slice(1))), new DecompressionStream('gzip'))
          .then(function (bytes) {
            if (store(JSON.parse(decodeURIComponent(escape(bytesToBinary(bytes)))))) location.reload();
          })
          .catch(function () {});
      }
    } catch (e) { /* damaged link: start fresh rather than break the app */ }
  }

  /* ---------- Leaving the old address ---------- */

  function syncer() {
    try { return (typeof sync !== 'undefined' && sync && typeof sync.isOn === 'function') ? sync : null; } catch (e) { return null; }
  }

  // Runs the app's own sync and waits (up to 20 s) for it to finish. Resolves true if it succeeded.
  function finishSync() {
    var s = syncer();
    if (!s || !s.isOn() || typeof s.run !== 'function') return Promise.resolve(false);
    return new Promise(function (resolve) {
      try { s.run(); } catch (e) { return resolve(false); }
      var start = Date.now();
      (function poll() {
        if (!s.running && s.status !== 'syncing') return resolve(s.status === 'ok');
        if (Date.now() - start > 20000) return resolve(false);
        setTimeout(poll, 300);
      })();
    });
  }

  // How many entries this device keeps in IndexedDB (apps with data-guard="idb").
  function localEntries() {
    var hasDb = false;
    try { hasDb = typeof db !== 'undefined' && db && typeof db.snapshot === 'function'; } catch (e) { /* none */ }
    if (!hasDb) return Promise.resolve(0);
    return db.snapshot().then(function (snap) {
      var n = 0;
      for (var k in snap) if (snap[k] && snap[k].length) n += snap[k].length;
      return n;
    }).catch(function () { return 1; });
  }

  function pack(synced) {
    var data = {}, count = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!owned(key) || (synced && SYNCED.indexOf(key) >= 0)) continue;
        data[key] = localStorage.getItem(key);
        count++;
      }
    } catch (e) { /* storage blocked */ }
    return count ? encode(data) : Promise.resolve('');
  }

  // Switch off this app's offline copy at the old address, so its icon stops opening it.
  function forgetOldCopy() {
    if (!navigator.serviceWorker || !navigator.serviceWorker.getRegistration) return Promise.resolve();
    return navigator.serviceWorker.getRegistration(location.href)
      .then(function (reg) { return reg && reg.unregister(); })
      .catch(function () {});
  }

  function go(target, synced) {
    return pack(synced).then(function (packed) {
      return forgetOldCopy().then(function () {
        location.replace(target + (packed ? '#carry=' + packed : ''));
      });
    });
  }

  function notice(target) {
    if (document.getElementById('move-notice')) return;
    var name = document.title || 'This app';
    var box = document.createElement('div');
    box.id = 'move-notice';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;max-width:560px;margin:0 auto;' +
      'background:#1E1B18;color:#fff;border-radius:14px;padding:16px 18px;font:15px/1.45 system-ui,-apple-system,sans-serif;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.35)';
    box.innerHTML = '<b style="display:block;font-size:16px;margin-bottom:4px"></b><span></span>' +
      '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">' +
      '<button type="button" data-a="later" style="font:inherit;padding:8px 14px;border-radius:9px;border:1px solid #777;background:none;color:#fff">Not now</button>' +
      '<button type="button" data-a="go" style="font:inherit;font-weight:700;padding:8px 14px;border-radius:9px;border:0;background:#F57C14;color:#1E1B18">Move anyway</button></div>';
    box.querySelector('b').textContent = name + ' has moved to www.davyrockett.com';
    box.querySelector('span').textContent = 'This device has entries that aren’t saved to GitHub yet, so they would be left ' +
      'behind here. Connect your access key in Settings (it saves them), then reopen the app. ' +
      '“Move anyway” leaves them on this old copy.';
    box.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'later') box.parentNode.removeChild(box);
      if (a === 'go') go(target, false);
    });
    (document.body || document.documentElement).appendChild(box);
  }

  function leave(target) {
    return finishSync().then(function (synced) {
      if (synced || GUARD !== 'idb') return go(target, synced);
      return localEntries().then(function (n) { return n ? notice(target) : go(target, false); });
    });
  }

  // Local test: on localhost, set localStorage['move-test'] = '1' to "move" to 127.0.0.1 (another address).
  function testTarget() {
    try {
      if (location.hostname === 'localhost' && localStorage.getItem('move-test') === '1') {
        return 'http://127.0.0.1:' + location.port + location.pathname.replace(/[^\/]*$/, '');
      }
    } catch (e) { /* none */ }
    return null;
  }

  var lastCheck = 0, leaving = false;
  function check() {
    if (leaving || !window.fetch || !window.Promise || Date.now() - lastCheck < 10 * 60 * 1000) return;
    var test = testTarget();
    if (!test && location.hostname !== OLD_HOST) return;
    lastCheck = Date.now();
    var target = test || NEW_ORIGIN + location.pathname.replace(/[^\/]*$/, '');
    // The site root is outside every app's offline copy, so this always asks GitHub itself.
    var probe = test ? Promise.resolve(true) :
      fetch('https://' + OLD_HOST + '/?move-check=' + Date.now(), { cache: 'no-store', redirect: 'manual' })
        .then(function (r) {
          return r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400) ||
            (r.redirected && r.url.indexOf('https://' + OLD_HOST) !== 0);
        });
    probe.then(function (moved) {
      if (!moved) return;
      // Make sure the app really is at the new address before leaving. (GitHub allows this
      // cross-site read; the local test server doesn't, so the test accepts an unreadable answer.)
      return fetch(target + 'manifest.webmanifest', test ? { mode: 'no-cors' } : { cache: 'no-store' }).then(function (r) {
        if (!(r.ok || (test && r.type === 'opaque')) || leaving) return;
        leaving = true;
        return leave(target);
      });
    }).catch(function () { leaving = false; });
  }

  receive();
  if (document.readyState === 'complete') setTimeout(check, 1500);
  else window.addEventListener('load', function () { setTimeout(check, 1500); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
})();
