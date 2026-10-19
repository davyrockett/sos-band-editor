/* share.js: the "Share" section in each app's Settings. Shows the app's web address with a
   "Copy link" button, and a "Share…" button that opens the device's share sheet where the browser has one.
   The same file is copied into every app (master copy: Claude Apps/tools/share.js).
   Load it with: <script src="share.js" defer></script>, and list it in sw.js ASSETS.

   Markup (styled with each app's own classes):
     <div data-share>                         the section (optional data-share-url="../other-app/")
       <p data-share-link></p>                the address appears here
       <button data-share-copy>Copy link</button>
       <button data-share-send hidden>Share…</button>   shown only where the browser can share
     </div>
   Old-style JavaScript on purpose: Memory Lane and Song Party run on TV browsers. */
(function () {
  'use strict';

  function addressFor(box) {
    var base = location.protocol + '//' + location.host + location.pathname.replace(/[^\/]*$/, '');
    var rel = box.getAttribute('data-share-url');
    if (!rel) return base;
    try { return new URL(rel, base).href; } catch (e) { return base; }
  }

  function flash(button, text) {
    var was = button.getAttribute('data-label') || button.textContent;
    button.setAttribute('data-label', was);
    button.textContent = text;
    setTimeout(function () { button.textContent = was; }, 2000);
  }

  function copy(text, button, linkEl) {
    function fallback() {
      // Select the address so it can be copied by hand.
      try {
        var range = document.createRange();
        range.selectNodeContents(linkEl);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        if (document.execCommand && document.execCommand('copy')) return flash(button, 'Copied');
      } catch (e) { /* old browser */ }
      flash(button, 'Selected: copy it');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash(button, 'Copied'); }, fallback);
    } else {
      fallback();
    }
  }

  function setup(box) {
    if (box.getAttribute('data-share-ready')) return;
    box.setAttribute('data-share-ready', '1');
    var url = addressFor(box);
    var link = box.querySelector('[data-share-link]');
    if (link) {
      link.textContent = url;
      link.style.wordBreak = 'break-all';
      link.style.userSelect = 'all';
      link.style.webkitUserSelect = 'all';
    }
    var copyBtn = box.querySelector('[data-share-copy]');
    if (copyBtn) copyBtn.addEventListener('click', function () { copy(url, copyBtn, link || copyBtn); });
    var sendBtn = box.querySelector('[data-share-send]');
    if (sendBtn && navigator.share) {
      sendBtn.hidden = false;
      sendBtn.addEventListener('click', function () {
        navigator.share({ title: document.title, url: url }).catch(function () { /* closed the share sheet */ });
      });
    }
  }

  function run() {
    var boxes = document.querySelectorAll('[data-share]');
    for (var i = 0; i < boxes.length; i++) setup(boxes[i]);
  }
  function start() {
    run();
    // Some apps build their Settings screen only when it's opened: set those up as they appear.
    if (window.MutationObserver) {
      var queued = false;
      new MutationObserver(function () {
        if (queued) return;
        queued = true;
        setTimeout(function () { queued = false; run(); }, 50);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
