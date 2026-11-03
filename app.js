/* SOS Band: setlist + charts, stage plot, gear list, mixer routing, band roster.

   Everything lives in one list of records ("items"), each stamped with when it last changed:
     band    – band name, organisation, which show is open
     member  – name, instrument, colour (kind), the gear they need on stage
     song    – title, artist, lead singer (a member id), key, notes, chart (PDF path)
     show    – name, date, venue, who's on stage and where, setlist order, gear extras, mixers
   The list is stored in the public repo davyrockett/sos-band-data (data.json) and charts in its
   charts/ folder, which GitHub Pages serves. Anyone can view; editing needs the access key. */

const DATA_REPO = 'davyrockett/sos-band-data';
const DATA_FILE = 'data.json';
// Published data and charts, on the same site as the app (works on davyrockett.github.io and davyrockett.com).
// Testing locally (serving the Claude Apps folder), that's the Mac's backup copy of sos-band-data.
const CHART_BASE = `${location.origin}/sos-band-data/`;
// Two apps share this code: David's editor (sos-band-editor) and the band's view-only app (sos-band).
// tools/publish-band-app.sh copies it into the band app with data-mode="band".
const EDITOR = document.documentElement.dataset.mode !== 'band';
// Both apps live on the same site and share browser storage, so their keys must differ.
const P = EDITOR ? 'sosed.' : 'sos.';
const K = { data: P + 'data', token: P + 'sync-token', last: P + 'sync-last', tab: P + 'tab', show: P + 'show', theme: P + 'theme', met: P + 'met' };
// The editor's link to the band app shows its address on whichever site this is.
{ const bl = document.getElementById('band-link'); if (bl) bl.textContent = bl.href.replace(/^https?:\/\//, '').replace(/\/$/, ''); }

const KINDS = [
  { key: 'vocal', label: 'Vocalist', icon: '🎤' },
  { key: 'acoustic', label: 'Acoustic Guitar', icon: '🪕' },
  { key: 'electric', label: 'Electric Guitar', icon: '🎸' },
  { key: 'bass', label: 'Bass', icon: '🎸' },
  { key: 'horn', label: 'Horns', icon: '🎷' },
  { key: 'keys', label: 'Keys', icon: '🎹' },
  { key: 'drums', label: 'Drums', icon: '🥁' },
  { key: 'other', label: 'Other', icon: '🎶' },
];
const kindOf = k => KINDS.find(x => x.key === k) || KINDS[KINDS.length - 1];
// The order gear appears in the totals table; anything else goes after, A–Z.
const GEAR_ORDER = ['Music Stand', 'Mic Stand', 'Mic', 'Guitar Stand', 'DI Box', 'XLR Cable', '1/4" Cable', 'Bass Amp',
  'E. Guitar Amp', 'Keyboard Stand', 'Pedalboard', 'Drum Kit'];

const $ = id => document.getElementById(id);
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); return true; } catch { return false; } }
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const slug = s => s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';

/* ---------- Data ---------- */
let items = {};
try { items = JSON.parse(lsGet(K.data) || '{}').items || {}; } catch { items = {}; }
const live = () => Object.entries(items).filter(([, r]) => r && !r.deleted);
const ofType = t => live().filter(([, r]) => r.type === t).map(([id, r]) => ({ id, ...r }));
const get = id => (items[id] && !items[id].deleted ? { id, ...items[id] } : null);
const band = () => get('band') || { name: 'SOS Band', org: '', currentShow: '' };
const members = () => ofType('member').sort((a, b) => a.name.localeCompare(b.name));   // A–Z
const songs = () => ofType('song').sort((a, b) => a.title.replace(/^the /i, '').localeCompare(b.title.replace(/^the /i, '')));
// Gigs: upcoming ones first (soonest at the top), then past ones (most recent first).
function shows() {
  const today = new Date().toLocaleDateString('en-CA');
  const all = ofType('show');
  const next = all.filter(s => !s.date || s.date >= today).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const past = all.filter(s => s.date && s.date < today).sort((a, b) => b.date.localeCompare(a.date));
  return [...next, ...past];
}
function currentShow() {
  // Opens on the gig David marked as main (★) until someone picks another one on their device.
  const id = lsGet(K.show) || band().currentShow;
  return get(id) || shows()[0] || null;
}

function saveLocal() { lsSet(K.data, JSON.stringify({ items })); }
// Every edit goes through here: stamp it, save, redraw, sync.
function put(id, rec) {
  const { id: _drop, ...clean } = rec;
  items[id] = { ...clean, updatedAt: new Date().toISOString() };
  saveLocal();
  render();
  sync.soon();
}
function remove(id) { put(id, { deleted: true }); }
// A sync that finishes while you're dragging, or typing in a list, must not redraw the page under your finger:
// the dragged row was left behind as a copy and saved twice, so ✕ then removed both (David, 2026-10-27).
// The page redraws as soon as you let go.
let dragging = false, renderLater = false, renderTimer = 0;
const userBusy = () => dragging || Boolean(document.activeElement?.closest?.('.panel') && document.activeElement.matches('input:not([type=range]):not([type=checkbox]), textarea'));
function renderWhenFree() {
  clearTimeout(renderTimer);
  if (!userBusy()) { render(); return; }
  renderLater = true;
  renderTimer = setTimeout(() => { if (renderLater) renderWhenFree(); }, 1000);
}
function renderIfWaiting() { if (renderLater && !userBusy()) render(); }
document.addEventListener('focusout', () => setTimeout(renderIfWaiting));
function patchShow(fn) {
  const s = currentShow();
  if (!s) return;
  const next = structuredClone(s);
  fn(next);
  put(s.id, next);
}

const canEdit = () => EDITOR;

/* ---------- Tabs ---------- */
let tab = lsGet(K.tab) || 'set';
if (!document.querySelector(`[data-panel="${tab}"]`)) tab = 'set';
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; lsSet(K.tab, tab); showTab(); }));
function showTab() {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.panel !== tab; });
  $('met-open').classList.toggle('on', tab === 'met');   // the metronome opens from its icon, not a tab
}

/* ---------- Helpers for display ---------- */
function fmtDate(iso, long = true) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', long ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
// A song's lead singer at a gig: the gig's own pick (show.leads) or else the song's default (song.lead).
const leadFor = (song, show) => show?.leads?.[song.id] || song.lead;
// A gig's length is kept in minutes (show.length); shown as "1 hr 30 min".
function fmtLength(min) {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(' ');
}
function memberChip(memberId) {
  const m = get(memberId);
  // Viewers just see nothing when no lead singer is set; editors see a reminder.
  const c = el('span', 'chip' + (m ? '' : ' none'), m ? m.name : 'Lead: ?');
  if (!m && !canEdit()) c.hidden = true;
  if (m) c.style.setProperty('--kc', `var(--k-${m.kind})`);
  c.title = m ? `Lead singer: ${m.name}` : 'Lead singer not set';
  return c;
}
const hasMic = m => (m.gear || []).some(g => g.item === 'Mic');
function icons(m) {
  const k = kindOf(m.kind);
  if (m.kind === 'vocal') return /perc/i.test(m.instrument) ? '🎤🪇' : '🎤';
  return k.icon + (hasMic(m) ? '🎤' : '');
}
// "Mic Stand" + "Mic" read better as one line on the plot, like the old plots.
function gearLines(m) {
  const g = (m.gear || []).filter(x => x.item);
  const has = n => g.find(x => x.item === n && (x.qty || 1) === 1);
  const join = has('Mic Stand') && has('Mic');
  const out = [];
  for (const x of g) {
    if (join && x.item === 'Mic') continue;
    const name = join && x.item === 'Mic Stand' ? 'Mic Stand + Mic' : x.item;
    out.push((x.qty || 1) > 1 ? `${x.qty}× ${name}` : name);
  }
  return out;
}

/* ---------- Render ---------- */
function render() {
  renderLater = false;
  document.body.classList.toggle('editing', canEdit());
  const b = band(), s = currentShow();
  $('band-name').textContent = EDITOR ? 'SOS Band Editor' : 'SOS Band';
  if (EDITOR) {
    const keyProblem = sync.isOn() && sync.status === 'auth';
    $('nokey-banner').hidden = sync.isOn() && !keyProblem;
    $('nokey-text').textContent = keyProblem
      ? `Not saved to the band app yet. ${sync.message} Your changes are kept on this device until then.`
      : 'Changes are only saved on this device. Add your access key in Settings to send them to the band app.';
    $('band-sees').textContent = s && s.id === b.currentShow ? '★ Band app opens on this gig' : `Band app opens on: ${get(b.currentShow)?.name || 'nothing yet'}`;
    $('band-sees').classList.toggle('warn', !s || s.id !== b.currentShow);
  }
  document.title = s ? `SOS Band · ${s.name}` : 'SOS Band';
  $('show-name').textContent = s ? s.name : (Object.keys(items).length ? 'No gig yet' : 'Loading…');
  $('show-date').textContent = s ? [fmtDate(s.date, false), fmtLength(s.length)].filter(Boolean).join(' · ') : '';
  renderSet(s); renderMet(s); renderPlot(s, b); renderGear(s); renderMixers(s); renderBand(s);
}

/* Setlist */
// A break between sets sits in the setlist as "break-…" (not a song). Song numbers keep counting through breaks.
const isBreak = id => typeof id === 'string' && id.startsWith('break-');
// A note ("Will speaks here") sits in the setlist as "note-…"; its text is in the show's setNotes.
const isNote = id => typeof id === 'string' && id.startsWith('note-');
const inSet = id => isBreak(id) || isNote(id) || get(id);
function dragBits(li, label, onRemove) {
  const rm = el('button', 'rm', '✕');
  rm.type = 'button';
  rm.setAttribute('aria-label', `Remove ${label}`);
  rm.addEventListener('click', onRemove);
  const grip = el('button', 'grip', '⠿');
  grip.type = 'button';
  grip.setAttribute('aria-label', `Drag to move ${label}`);
  grip.addEventListener('pointerdown', e => startRowDrag(e, li));
  li.append(rm, grip);
}
// Each set is its own list; on a wide screen the sets sit side by side, each break starting a new column.
function renderSet(s) {
  const wrap = $('setlist');
  wrap.replaceChildren();
  let list = el('ol', 'setlist');
  const ids = (s?.setlist || []).filter(inSet);
  const nSongs = ids.filter(id => !isBreak(id) && !isNote(id)).length;
  const nSets = ids.filter(isBreak).length + 1;
  $('set-count').textContent = s ? `${nSongs} song${nSongs === 1 ? '' : 's'}${nSets > 1 ? ` in ${nSets} sets` : ''} · ${s.name}${s.length ? ` · ${fmtLength(s.length)} gig` : ''}` : '';
  $('set-empty').hidden = ids.length > 0;
  wrap.hidden = !ids.length;
  $('print-set-charts').disabled = !nSongs;
  const playing = new Set((s?.lineup || []).map(l => l.member));
  let n = 0;
  ids.forEach(id => {
    if (isBreak(id)) {
      if (list.children.length) wrap.append(list);
      list = el('ol', 'setlist');
      const li = el('li', 'break-row');
      li.dataset.id = id;
      li.append(el('span', 'break-label', 'Break'));
      if (canEdit()) {
        const rm = el('button', 'rm', '✕');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove this break');
        rm.addEventListener('click', () => patchShow(x => { x.setlist = x.setlist.filter(v => v !== id); }));
        const grip = el('button', 'grip', '⠿');
        grip.type = 'button';
        grip.setAttribute('aria-label', 'Drag to move the break');
        grip.addEventListener('pointerdown', e => startRowDrag(e, li));
        li.append(rm, grip);
      }
      list.append(li);
      return;
    }
    if (isNote(id)) {
      const li = el('li', 'note-row');
      li.dataset.id = id;
      const text = (s.setNotes || {})[id] || '';
      if (canEdit()) {
        const inp = el('input', 'note-input');
        inp.value = text;
        inp.placeholder = 'Type a note, e.g. Will speaks here';
        inp.setAttribute('aria-label', 'Note text');
        inp.addEventListener('change', () => patchShow(x => { x.setNotes = { ...(x.setNotes || {}), [id]: inp.value.trim() }; }));
        li.append(inp);
        dragBits(li, 'this note', () => patchShow(x => {
          x.setlist = x.setlist.filter(v => v !== id);
          if (x.setNotes) delete x.setNotes[id];
        }));
      } else {
        if (!text) return;
        li.append(el('span', 'note-text', text));
      }
      list.append(li);
      return;
    }
    const song = get(id);
    const li = el('li');
    li.dataset.id = id;
    li.append(el('span', 'num', ++n));
    const btn = el('button', 'song-btn');
    btn.type = 'button';
    const txt = el('span', 'song-txt');
    txt.append(el('span', 'song-title', song.title), el('span', 'song-artist', song.artist || ''));
    // A singer who isn't playing this gig is greyed out: change the singer or drop the song (David, 2026-10-26).
    const lead = leadFor(song, s);
    const chip = memberChip(lead);
    if (get(lead) && !playing.has(lead)) {
      chip.classList.add('out');
      chip.title = `${get(lead).name} isn't playing at ${s.name}`;
    } else if (lead !== song.lead) chip.title += ` at this gig (default: ${get(song.lead)?.name || 'not set'})`;
    btn.append(txt, chip, el('span', 'keytag', song.key || ''));
    btn.addEventListener('click', () => openSong(id));
    li.append(btn);
    if (canEdit()) {
      const rm = el('button', 'rm', '✕');
      rm.type = 'button';
      rm.setAttribute('aria-label', `Take ${song.title} out of the set`);
      rm.addEventListener('click', () => {
        patchShow(x => { x.setlist = x.setlist.filter(v => v !== id); });
        toast(`Took “${song.title}” out of the set.`);
      });
      const grip = el('button', 'grip', '⠿');
      grip.type = 'button';
      grip.setAttribute('aria-label', `Drag to move ${song.title}`);
      grip.addEventListener('pointerdown', e => startRowDrag(e, li));
      li.append(rm, grip);
    }
    list.append(li);
  });
  if (list.children.length) wrap.append(list);
  // Only widen the page when there are several sets to show side by side.
  wrap.classList.toggle('multi', wrap.children.length > 1);
  // The page is just as wide as its columns: 620px for one set, 440px more or less per extra set (up to 4 across).
  const sets = Math.min(wrap.children.length, 4);
  $('panel-set').style.maxWidth = sets > 1 ? `${sets * 454 - 14}px` : '620px';
  $('panel-set').classList.toggle('wide', sets > 2);
  renderLibrary(s);
}
function renderLibrary(s) {
  const q = $('song-search').value.trim().toLowerCase();
  const inSet = new Set(s?.setlist || []);
  const lib = $('library');
  lib.replaceChildren();
  for (const song of songs()) {
    if (q && !`${song.title} ${song.artist}`.toLowerCase().includes(q)) continue;
    const li = el('li');
    const btn = el('button', 'song-btn');
    btn.type = 'button';
    const txt = el('span', 'song-txt');
    txt.append(el('span', 'song-title', song.title), el('span', 'song-artist', song.artist || ''));
    btn.append(txt, memberChip(song.lead));
    btn.addEventListener('click', () => openSong(song.id));
    li.append(btn);
    if (canEdit() && s) {
      const add = el('button', 'btn small add', inSet.has(song.id) ? 'In set' : '+ Set');
      add.type = 'button';
      add.disabled = inSet.has(song.id);
      add.addEventListener('click', () => { patchShow(x => { x.setlist = [...(x.setlist || []), song.id]; }); toast(`Added “${song.title}” to the end of the set.`); });
      li.append(add);
    }
    lib.append(li);
  }
}
$('song-search').addEventListener('input', () => renderLibrary(currentShow()));

// Drag a setlist row (song or break) by its handle, within a set or across columns.
// The row moves in the page as you drag; the new order is saved on release.
function startRowDrag(e, li) {
  e.preventDefault();
  if (dragging) return;   // a second finger
  dragging = true;
  const wrap = $('setlist');
  const order = () => [...wrap.querySelectorAll('li[data-id]')].map(r => r.dataset.id).join('|');
  const before = order();
  const r0 = li.getBoundingClientRect();
  const offX = e.clientX - r0.left, offY = e.clientY - r0.top;
  let px = e.clientX, py = e.clientY, scroller = 0;
  li.classList.add('dragging');
  const follow = () => {
    li.style.transform = '';
    const r = li.getBoundingClientRect();
    li.style.transform = `translate(${px - offX - r.left}px, ${py - offY - r.top}px)`;
  };
  const place = () => {
    const lists = [...wrap.querySelectorAll('ol')];
    // The column under the pointer (or the nearest one)
    const dist = ol => { const b = ol.getBoundingClientRect(); return px < b.left ? b.left - px : px > b.right ? px - b.right : 0; };
    const col = lists.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    const rows = [...col.children].filter(r => r !== li);
    const next = rows.find(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 > py; });
    if (next) { if (li.nextElementSibling !== next) col.insertBefore(li, next); }
    else if (col.lastElementChild !== li || li.parentNode !== col) col.append(li);
    follow();
  };
  const move = ev => {
    px = ev.clientX; py = ev.clientY;
    place();
    // Scroll the page when dragging near the top or bottom of the screen
    clearInterval(scroller);
    const edge = py < 110 ? -12 : py > innerHeight - 70 ? 12 : 0;
    if (edge) scroller = setInterval(() => { scrollBy(0, edge); place(); }, 16);
  };
  const up = () => {
    clearInterval(scroller);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    li.classList.remove('dragging');
    li.style.transform = '';
    dragging = false;
    const after = order();
    if (after !== before) patchShow(x => { x.setlist = [...new Set(after.split('|'))]; });
    else if (renderLater) render();
    else renderSet(currentShow());
  };
  // Listen on the whole window: the row is moved around the page while dragging.
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

/* Stage plot */
function renderPlot(s, b) {
  const stage = $('stage');
  stage.querySelectorAll('.pcard').forEach(c => c.remove());
  $('plot-h').textContent = `${b.name || 'SOS Band'} — Stage Plot`;
  $('plot-sub').textContent = s ? [s.name, fmtDate(s.date), fmtLength(s.length), s.venue, s.host].filter(Boolean).join('  |  ') : '';
  const legend = $('legend');
  legend.replaceChildren();
  if (!s) return;
  const on = (s.lineup || []).map(l => ({ ...l, m: get(l.member) })).filter(l => l.m);
  const kinds = new Set(on.map(l => l.m.kind));
  if (on.some(l => hasMic(l.m))) kinds.add('vocal');
  for (const k of KINDS) if (kinds.has(k.key)) {
    const sp = el('span');
    const i = el('i');
    i.style.setProperty('--kc', `var(--k-${k.key})`);
    sp.append(i, k.label);
    legend.append(sp);
  }
  const chs = mixChannels(s);
  for (const l of on) {
    const m = l.m;
    const c = el('div', 'pcard');
    c.style.setProperty('--kc', `var(--k-${m.kind})`);
    c.style.left = l.x + '%';
    c.style.top = l.y + '%';
    c.append(el('div', 'ic', icons(m)), el('div', 'nm', m.name), el('div', 'in', m.instrument || ''));
    if (chs[m.id]) c.append(el('div', 'chs', `🎚 ${chs[m.id]}`));
    const ul = el('ul');
    gearLines(m).forEach(t => ul.append(el('li', null, t)));
    c.append(ul);
    if (canEdit()) c.addEventListener('pointerdown', e => startCardDrag(e, c, m.id));
    else c.addEventListener('click', () => showPlayer(m, chs[m.id]));
    stage.append(c);
  }
}
// Band app: tapping someone on the plot shows their gear (on phones the cards are too small to list it).
function showPlayer(m, ch) {
  $('who-name').textContent = m.name;
  $('who-inst').textContent = [m.instrument, ch && `Mixer: ${ch}`].filter(Boolean).join(' · ');
  $('who-gear').replaceChildren(...gearLines(m).map(t => el('li', null, t)));
  $('who-dlg').showModal();
}
function startCardDrag(e, card, memberId) {
  e.preventDefault();
  if (dragging) return;   // a second finger
  dragging = true;
  const r = $('stage').getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY;
  const x0 = parseFloat(card.style.left), y0 = parseFloat(card.style.top);
  let x = x0, y = y0, moved = false, done = false;
  card.classList.add('dragging');
  try { card.setPointerCapture(e.pointerId); } catch {}
  const move = ev => {
    // A finger wobbles a few pixels on a tap: only start moving the card once it's clearly being dragged.
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) return;
    moved = true;
    x = Math.max(6, Math.min(94, x0 + (ev.clientX - sx) / r.width * 100));
    y = Math.max(0, Math.min(85, y0 + (ev.clientY - sy) / r.height * 100));
    card.style.left = x + '%';
    card.style.top = y + '%';
  };
  const up = () => {
    if (done) return;
    done = true;
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerup', up);
    card.removeEventListener('pointercancel', up);
    card.removeEventListener('lostpointercapture', up);
    card.classList.remove('dragging');
    dragging = false;
    if (!moved) { renderIfWaiting(); openMember(memberId); return; }
    patchShow(s => {
      const l = s.lineup.find(v => v.member === memberId);
      if (l) { l.x = Math.round(x * 10) / 10; l.y = Math.round(y * 10) / 10; }
    });
  };
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
  card.addEventListener('lostpointercapture', up);
}

/* Gear */
function gearTotals(s) {
  const map = new Map();
  for (const l of s.lineup || []) {
    const m = get(l.member);
    if (!m) continue;
    for (const g of m.gear || []) {
      if (!g.item) continue;
      const e = map.get(g.item) || { item: g.item, qty: 0, who: [] };
      e.qty += g.qty || 1;
      e.who.push([m.name, g.qty || 1]);
      map.set(g.item, e);
    }
  }
  const players = (s.lineup || []).filter(l => get(l.member)).length;
  const rows = [...map.values()].map(e => {
    let how = e.who.some(([, q]) => q > 1) ? e.who.map(([n, q]) => `${n}×${q}`).join(', ') : e.who.map(([n]) => n).join(', ');
    if (e.who.length === players && players > 2 && e.who.every(([, q]) => q === 1)) how = 'Everyone';
    return { item: e.item, how, qty: e.qty };
  });
  const rank = i => { const n = GEAR_ORDER.indexOf(i); return n < 0 ? 99 : n; };
  return rows.sort((a, b) => rank(a.item) - rank(b.item) || a.item.localeCompare(b.item));
}
// Stage monitors: none, 1 or 2, picked on the Mixer page (not per player).
const monitorCount = s => Math.min(2, Math.max(0, Number(s.mix?.monitors) || 0));
// The mixers and their cables follow the setup on the Mixer page; each monitor adds itself and its two cables.
function mixerGear(s) {
  const n = monitorCount(s), how = n > 1 ? 'For the stage monitors' : 'For the stage monitor';
  const mon = n ? [
    { item: 'Stage Monitor', how: '', qty: n },
    { item: 'Power Cable', how, qty: n },
    { item: '1/4" Cable', how, qty: n },
  ] : [];
  return [...mixerBoxes(s), ...mon];
}
function mixerBoxes(s) {
  return mixSetup(s) === 'two' ? [
    { item: 'Soundcraft EPM8 Mixer (blue)', how: `Submix → Mackie ch ${MACKIE_RET}`, qty: 1 },
    { item: 'Mackie ProFX12v3 Mixer (black)', how: 'Master + effects → PA', qty: 1 },
    { item: 'Power Cables (Mixers)', how: '1 per mixer', qty: 2 },
    { item: 'XLR to 1/4" Cables', how: `Blue mix out L + R → Mackie ${MACKIE_RET} line in L + R`, qty: 2 },
  ] : [
    { item: 'Soundcraft EPM8 Mixer (blue)', how: '', qty: 1 },
    { item: 'Power Cable (Mixer)', how: '', qty: 1 },
  ];
}
function renderGear(s) {
  const box = $('gear');
  box.replaceChildren();
  $('gear-print-title').textContent = s ? `SOS Band — Gear · ${s.name} · ${fmtDate(s.date, false)}` : '';
  if (!s) return;
  const t = el('table', 'gear-table');
  const head = el('tr');
  head.append(el('th', null, 'Item'), el('th', null, 'Who / how'), el('th', 'q', 'Qty'));
  if (canEdit()) head.append(el('th', 'x'));
  t.append(head);
  for (const r of gearTotals(s)) {
    const tr = el('tr');
    tr.append(el('td', null, r.item), el('td', 'how', r.how), el('td', 'q', r.qty));
    if (canEdit()) tr.append(el('td', 'x'));
    t.append(tr);
  }
  const extras = s.extras || [];
  const sections = [...new Set(extras.map(x => x.section || 'Band'))];
  if (!sections.includes('Band')) sections.unshift('Band');
  if (!sections.includes('PA')) sections.push('PA');
  for (const sec of sections) {
    if (sec !== 'Band') {
      const tr = el('tr', 'sec');
      const th = el('th', null, sec === 'PA' ? 'PA system' : sec);
      th.colSpan = canEdit() ? 4 : 3;
      tr.append(th);
      t.append(tr);
    }
    if (sec === 'PA') for (const r of mixerGear(s)) {
      const tr = el('tr', 'auto');
      tr.append(el('td', null, r.item), el('td', 'how', r.how), el('td', 'q', r.qty));
      if (canEdit()) tr.append(el('td', 'x'));
      t.append(tr);
    }
    extras.forEach((x, i) => {
      if ((x.section || 'Band') !== sec) return;
      const tr = el('tr');
      if (canEdit()) {
        const field = (key, cls) => {
          const td = el('td', key === 'qty' ? 'q' : key === 'how' ? 'how' : null);
          const inp = el('input', cls);
          inp.value = x[key] ?? '';
          if (key === 'qty') { inp.type = 'number'; inp.min = 0; inp.inputMode = 'numeric'; }
          inp.setAttribute('aria-label', key);
          inp.addEventListener('change', () => patchShow(v => { v.extras[i][key] = key === 'qty' ? Number(inp.value) || 0 : inp.value.trim(); }));
          td.append(inp);
          return td;
        };
        const rm = el('button', 'rm', '✕');
        rm.type = 'button';
        rm.setAttribute('aria-label', `Remove ${x.item}`);
        rm.addEventListener('click', () => patchShow(v => { v.extras.splice(i, 1); }));
        const td = el('td', 'x');
        td.append(rm);
        tr.append(field('item'), field('how'), field('qty', 'qty'), td);
      } else {
        tr.append(el('td', null, x.item), el('td', 'how', x.how || ''), el('td', 'q', x.qty));
      }
      t.append(tr);
    });
  }
  box.append(t);
  if (canEdit()) {
    const row = el('div', 'row-btns add-row');
    for (const [sec, label] of [['Band', '+ Band item'], ['PA', '+ PA item']]) {
      const b = el('button', 'btn small', label);
      b.type = 'button';
      b.addEventListener('click', () => patchShow(v => { v.extras = [...(v.extras || []), { item: 'New item', how: '', qty: 1, section: sec }]; }));
      row.append(b);
    }
    box.append(row);
  }
  box.append(notesBox(s, 'gearNotes', 'Gear notes'));
}
function notesBox(s, key, label) {
  const d = el('div', 'notes-box');
  if (canEdit()) {
    const ta = el('textarea');
    ta.rows = 2;
    ta.placeholder = label;
    ta.setAttribute('aria-label', label);
    ta.value = s[key] || '';
    ta.addEventListener('change', () => patchShow(v => { v[key] = ta.value.trim(); }));
    d.append(ta);
  } else if (s[key]) d.textContent = s[key];
  else d.hidden = true;
  return d;
}

/* Mixers
   The band's two mixers (David's photos, 2026-11-02):
   - Soundcraft EPM8 (blue): channels 1–8 take a mic or DI (XLR) or a line; Stereo 1 and 2 take lines only (1/4" L/R).
     Mix out L/R on XLR. No effects.
   - Mackie ProFX12v3 (black, David's photo 2026-11-03; replaced the ProFX8v2): mic channels 1–4 (1–2 combo XLR/1/4"
     with Hi-Z; 1–4 have a compressor), 5/6, 7/8 and 9/10 (a mic, or a stereo line on 1/4" L + R); 11/12 is line only
     (3.5 mm stereo or USB 3-4). GigFX effects (24 presets) with an FX knob on every channel.
   The channels come from who's on the stage plot: each Mic and DI Box in a player's gear needs an XLR channel.
   Setups: 'two' (default, David's plan): the blue mixer takes the vocals and submixes into Mackie 9/10 (line in L + R),
   so the Mackie's effects reach the whole blue mix; the Mackie takes the instruments and feeds the PA. 'one': blue mixer only.
   show.mix = { setup, ch: { '1': key, 'A1': key, 'B3': key… }, known: [keys], out, monitors, fx }
   Slots are the mixer's letter + strip number: A1–A10 = blue 1–8, St 1, St 2; B1–B8 = Mackie 1, 2, 3, 4, 5/6, 7/8,
   9/10, 11/12 (B7 = 9/10 is the blue mix's return, not a slot, on Blue → Mackie).
   key = 'memberId|mic|0', 'memberId|di|0', or 'text:…' (anything else typed in). Until a channel is set,
   inputs fill the channels in stage order (left to right), vocals first. After that, only new inputs
   (not in `known`) go on the first spare channel; the page warns when an input has no channel or two. */
const EPM8 = { short: 'Blue', model: 'Soundcraft EPM8', look: 'epm', strips: ['1', '2', '3', '4', '5', '6', '7', '8', 'St 1', 'St 2'], xlr: 8 };
const MACKIE = { short: 'Mackie', model: 'Mackie ProFX12v3', look: 'mackie', strips: ['1', '2', '3', '4', '5/6', '7/8', '9/10', '11/12'], xlr: 7 };
// Where the blue mixer's mix out comes into the Mackie (a stereo channel's line in L + R).
const MACKIE_RET = '9/10';
const MIX = {
  one: [{ ...EPM8, id: '', name: 'Blue mixer', role: 'Soundcraft EPM8 · everything, out to the PA', aux: 'AUX 1 OUT' }],
  two: [{ ...EPM8, id: 'A', name: 'Blue mixer', role: 'Soundcraft EPM8 · vocals submix into the Mackie' },
    { ...MACKIE, id: 'B', name: 'Mackie', role: 'Mackie ProFX12v3 · instruments, effects + master', ret: MACKIE_RET, aux: 'MON SEND' }],
};
const FX_PRESETS = ['Bright Room', 'Warm Lounge', 'Small Stage', 'Warm Theater', 'Warm Hall', 'Concert Hall', 'Cathedral',
  'Small Plate', 'Large Plate', 'Chorus 1', 'Chorus 2', 'Delay + Reverb', 'Doubler', 'Echo', 'Delay 1', 'Delay 2', 'Delay 3',
  'Ping-Pong Delay', 'Overdrive/Distortion', 'Spring Reverb', 'Early Reflections', 'Auto-Wah', 'Flange', 'Slapback Reverb'];
const fxName = n => n ? `${String(n).padStart(2, '0')} ${FX_PRESETS[n - 1]}` : '';
const mixSetup = s => (s.mix?.setup === 'one' ? 'one' : 'two');
function mixInputs(s) {
  const on = (s.lineup || []).map(l => ({ ...l, m: get(l.member) })).filter(l => l.m).sort((a, b) => a.x - b.x);
  const out = [];
  for (const type of ['mic', 'di']) for (const { m } of on) {
    const n = (m.gear || []).filter(g => g.item === (type === 'mic' ? 'Mic' : 'DI Box')).reduce((t, g) => t + (g.qty || 1), 0);
    const inst = (m.instrument || kindOf(m.kind).label).split('/')[0].trim();
    for (let i = 0; i < n; i++) {
      const what = type === 'mic' ? 'Vox' + (n > 1 ? ` ${i + 1}` : '') : `${inst} (DI${n > 1 ? ` ${i + 1}` : ''})`;
      out.push({ key: `${m.id}|${type}|${i}`, m, type, what, tape: `${m.name} ${type === 'mic' ? 'vox' : 'DI'}` });
    }
  }
  return out;
}
function mixLayout(s) {
  const mix = s.mix || {};
  const setup = mixSetup(s);
  const info = {};
  for (const mx of MIX[setup]) mx.strips.forEach((label, i) => { if (label !== mx.ret) info[mx.id + (i + 1)] = { mx, label, xlr: i < mx.xlr }; });
  const slots = Object.keys(info);
  const inputs = mixInputs(s);
  const byKey = new Map(inputs.map(i => [i.key, i]));
  const saved = mix.ch || {};
  const pinned = slots.some(c => c in saved);
  // The inputs there were when the channels were last set (older saves: whatever was on a channel or left off).
  const known = new Set(mix.known || [...Object.values(saved), ...(mix.off || [])]);
  const at = {};
  for (const c of slots) {
    const k = saved[c];
    // Mics and DIs need an XLR socket: one saved on a line-only channel counts as having no channel.
    if (k?.startsWith('text:') || (byKey.has(k) && info[c].xlr)) at[c] = k;
  }
  // On two mixers, vocals go on the blue one (A) and instruments on the Mackie (B), spilling onto the other when full.
  const xlr = slots.filter(c => info[c].xlr);
  const onA = xlr.filter(c => c[0] === 'A'), onB = xlr.filter(c => c[0] === 'B');
  for (const inp of inputs) {
    if (slots.some(c => at[c] === inp.key) || (pinned && known.has(inp.key))) continue;
    const order = setup === 'one' ? xlr : inp.type === 'mic' ? [...onA, ...onB] : [...onB, ...onA];
    const c = order.find(x => !at[x]);
    if (c) at[c] = inp.key;
  }
  const where = key => slots.filter(c => at[c] === key);
  // 'Ch 3', 'St 1' on one mixer; 'Blue 3', 'Mackie 3/4' on two.
  const chName = c => setup === 'one' ? (info[c].xlr ? 'Ch ' : '') + info[c].label : `${info[c].mx.short} ${info[c].label}`;
  return {
    setup, slots, info, at, byKey, where, chName, pinned,
    none: inputs.filter(i => !where(i.key).length),
    twice: inputs.filter(i => where(i.key).length > 1),
    full: xlr.every(c => at[c]),
    out: mix.out ?? ((s.mixers || []).at(-1)?.out || 'Main out L/R → PA speakers'),
  };
}
// Which channels each player is on, for the stage plot.
function mixChannels(s) {
  const L = mixLayout(s), by = {};
  for (const c of L.slots) {
    const inp = L.byKey.get(L.at[c]);
    if (inp) (by[inp.m.id] ||= []).push(L.chName(c));
  }
  for (const id in by) by[id] = by[id].join(', ');
  return by;
}
// Every change saves the whole layout, so channels stay put from then on.
function setChannel(c, val) {
  const L = mixLayout(currentShow());
  patchShow(v => {
    const ch = { ...(v.mix?.ch || {}) };
    for (const x of L.slots) ch[x] = L.at[x] || '';
    ch[c] = val;
    const { off, ...mix } = v.mix || {};
    v.mix = { ...mix, setup: L.setup, ch, known: [...L.byKey.keys()] };
  });
}
/* Knob, button and fader settings (David, 2026-11-02: to note where everything sat at the last rehearsal).
   show.mix.knobs = { [strip]: { [control]: value, note } }. strip = a channel slot ('A3', 'B2', '7'), or the mixer's
   letter + 'main' / 'ret' ('Amain', 'Bmain', 'Bret'; 'main' on one mixer). Knobs and faders are 0–1 (how far round
   or up, as on the board), buttons true/false. Readouts follow the board's printed scale, roughly: the pointer is what to match. */
const sgn = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const F = {
  eq: v => { const d = Math.round((v - .5) * 30); return d ? `${sgn(d)} dB` : '0'; },
  ten: v => String(Math.round(v * 20) / 2),
  pan: v => { const d = Math.round((v - .5) * 20); return d ? `${d < 0 ? 'L' : 'R'} ${Math.abs(d)}` : 'Centre'; },
  freq: v => { const f = 150 * (3500 / 150) ** v; return f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${Math.round(f / 10) * 10} Hz`; },
  db: (a, b) => v => `${sgn(Math.round(a + v * (b - a)))} dB`,
  // The Mackie's gain marks don't say much: give the pointer's clock position.
  clock: v => { const m = Math.round((7 + v * 10) * 2) / 2, h = Math.floor(m) % 12 || 12; return m % 1 ? `${h}:30` : `${h} o'clock`; },
  // Mackie MON and FX knobs: off … U (unity) at 12 o'clock … +10.
  uni: v => v < .02 ? 'Off' : Math.abs(v - .5) < .02 ? 'U' : v > .5 ? `+${Math.round((v - .5) * 20)} dB` : `${sgn(Math.round(40 * Math.log10(v / .5)))} dB`,
  comp: v => v < .02 ? 'Off' : v > .98 ? 'Max' : String(Math.round(v * 20) / 2),
  // Mackie BLEND: the main mix (Inputs) … USB 1-2.
  blend: v => v < .02 ? 'Inputs' : v > .98 ? 'USB 1-2' : `${Math.round((1 - v) * 100)}% inputs`,
};
// Fader scales as printed beside the faders: [how far up (0–1), dB]; null = ∞ (off).
const FADE = {
  epm: [[0, null], [.13, -30], [.24, -20], [.4, -10], [.54, -5], [.65, 0], [.77, 5], [1, 10]],
  epmMix: [[0, null], [.13, -40], [.24, -30], [.4, -20], [.54, -15], [.65, -10], [.77, -5], [1, 0]],
  mackie: [[0, null], [.08, -50], [.13, -40], [.25, -30], [.36, -20], [.49, -10], [.62, -5], [.74, 0], [.86, 5], [1, 10]],
};
function fadeDb(marks, unity) {
  return v => {
    if (v < .02) return 'Off';
    const i = marks.findIndex(m => m[0] >= v);
    const [p1, d1] = marks[i], [p0, d0] = marks[i - 1];
    const lo = d0 ?? d1 - 20;   // between ∞ and the lowest mark
    const d = Math.round(lo + (v - p0) / (p1 - p0) * (d1 - lo));
    return d ? `${sgn(d)} dB` : unity;
  };
}
// How each knob looks, matched to David's photos (2026-11-02). Blue mixer: a coloured cap on a dark or grey
// ridged skirt with a pointer line. Mackie: black knobs with a coloured pointer fin. c = cap, s = skirt, p = pointer, w = pointer width.
const KL = {
  red: { c: '#E2392F', s: '#2A2A2A', p: '#fff' }, eq: { c: '#2E2E2E', s: '#8E8E8E', p: '#fff' },
  mfw: { c: '#F2F2F2', s: '#8E8E8E', p: '#333' }, teal: { c: '#59D3AE', s: '#2A2A2A', p: '#173A31' },
  sky: { c: '#86A9E3', s: '#2A2A2A', p: '#172A47' }, yellow: { c: '#F3D417', s: '#2A2A2A', p: '#3A3000' },
};
const fin = p => ({ c: '#272727', s: '#121212', p, w: .26 });
const MK = { white: fin('#F0F0F0'), blue: fin('#1E88E5'), green: fin('#7ED321'), yellow: fin('#F5B800'), grey: fin('#C8C8C8') };
const knob = (k, label, look, fmt, def = 0, hint = '') => ({ k, t: 'knob', label, ...look, fmt, def, hint });
const fader = (k, label, marks, unity, more) => ({ k, t: 'fader', label, marks, unity, fmt: fadeDb(marks, unity), def: 0, ...more });
// tag = the button's printed name, drawn under it beside the fader.
const btn = (k, label, tag) => ({ k, t: 'btn', label, tag, def: false });
const MK_EQ = [knob('hi', 'Hi', MK.blue, F.eq, .5, '12 kHz'), knob('mid', 'Mid', MK.blue, F.eq, .5, '2.5 kHz'), knob('low', 'Low', MK.blue, F.eq, .5, '80 Hz')];
// Every Mackie channel's lower half: sends, pan, mute, and the fader with its 1-2 / L-R / PFL buttons beside it.
const MK_SEND = [knob('mon', 'Mon', MK.green, F.uni), knob('fx', 'FX', MK.yellow, F.uni), knob('pan', 'Pan', MK.grey, F.pan, .5),
  btn('mute', 'Mute'), fader('fader', 'Fader', FADE.mackie, 'U'), btn('to12', 'To 1-2', '1-2'), btn('lr', 'To L-R (main)', 'L-R'), btn('pfl', 'PFL solo', 'PFL')];
const CTRL = {
  epm: [knob('gain', 'Gain', KL.red, F.db(5, 60)), knob('hf', 'HF', KL.eq, F.eq, .5, 'treble'), knob('mfq', 'MF freq', KL.mfw, F.freq, .5, 'which mids'),
    knob('mf', 'MF', KL.eq, F.eq, .5, 'mids'), knob('lf', 'LF', KL.eq, F.eq, .5, 'bass'), knob('aux1', 'Aux 1', KL.teal, F.ten),
    knob('aux2', 'Aux 2', KL.sky, F.ten), knob('pan', 'Pan', KL.yellow, F.pan, .5), btn('mute', 'Mute'), fader('fader', 'Fader', FADE.epm, '0 dB')],
  epmSt: [knob('gain', 'Gain', KL.red, F.db(-10, 20)), knob('hf', 'HF', KL.eq, F.eq, .5, 'treble'), knob('lf', 'LF', KL.eq, F.eq, .5, 'bass'),
    knob('aux1', 'Aux 1', KL.teal, F.ten), knob('aux2', 'Aux 2', KL.sky, F.ten), knob('pan', 'Balance', KL.yellow, F.pan, .5),
    btn('mute', 'Mute'), fader('fader', 'Fader', FADE.epm, '0 dB', { cap: '#5B7799' })],
  epmMain: [btn('p48', '48V phantom'), knob('monlvl', 'Monitor', KL.red, F.ten), knob('phones', 'Phones', KL.red, F.ten),
    btn('aux1pre', 'Aux 1 pre'), btn('aux2pre', 'Aux 2 pre'), btn('trkmon', '2-track → monitor'), btn('trkmix', '2-track → mix'),
    fader('fader', 'Mix L', FADE.epmMix, '0 dB', { cap: '#F3D417' }), fader('faderR', 'Mix R', FADE.epmMix, '0 dB', { cap: '#F3D417', same: 'fader' })],
  // ProFX12v3 channels 1–4 (Hi-Z is added on 1 and 2), the stereo channels 5/6, 7/8, 9/10, and line-only 11/12.
  mackie: [knob('gain', 'Gain', MK.white, F.clock), btn('lowcut', 'Low cut 100 Hz'), knob('comp', 'Comp', MK.white, F.comp), ...MK_EQ, ...MK_SEND],
  mackieSt: [knob('gain', 'Gain', MK.white, F.clock), btn('lowcut', 'Low cut 100 Hz'), ...MK_EQ, ...MK_SEND],
  mackieLine: [btn('usb34', 'USB 3-4'), knob('gain', 'Gain', MK.white, F.db(-20, 20), .5), ...MK_EQ, ...MK_SEND],
  mackieMain: [btn('p48', '48V phantom'), btn('fxmute', 'FX mute'),
    knob('aux', 'Aux master', MK.green, F.uni), knob('fxmon', 'FX to mon', MK.green, F.uni), knob('blend', 'Blend', MK.white, F.blend),
    btn('tophones', 'To phones / control room'), knob('phones', 'Phones', MK.white, F.ten), knob('ctrlrm', 'Control room', MK.white, F.ten),
    btn('brk', 'Break (mutes all)'), fader('fxrtn', 'FX return', FADE.mackie, 'U'), btn('fx12', 'FX → 1-2', '1-2'),
    fader('sub', 'Sub 1-2', FADE.mackie, 'U'), btn('sublr', 'Sub 1-2 → L-R', 'L-R'), fader('fader', 'Main', FADE.mackie, 'U', { main: true })],
};
// Where each control sits on the drawing, by the board's rows. Blue mixer: 1 = numbers, 2 = sockets, 3–10 = knob rows,
// 11 = buttons, 12 = faders, 13 = tape. Mackie ProFX12v3: 1 = numbers, 2–4 = sockets (XLR, then line / Hi-Z, insert / line R),
// 5 = low cut, 6 = gain, 7 = comp, 8–10 = EQ, 11 = mon, 12 = FX, 13 = pan, 14 = mute, 15 = faders, 16 = tape.
// 'fb' = in the little column of buttons beside the fader. Master sections give [row, column] inside the master area.
const MK_ROWS = { lowcut: 5, gain: 6, comp: 7, hi: 8, mid: 9, low: 10, mon: 11, fx: 12, pan: 13, mute: 14, fader: 15, tape: 16, to12: 'fb', lr: 'fb', pfl: 'fb' };
const FACE_ROWS = {
  epm: { gain: 3, hf: 4, mfq: 5, mf: 6, lf: 7, aux1: 8, aux2: 9, pan: 10, mute: 11, fader: 12, tape: 13 },
  epmSt: { gain: 5, hf: 6, lf: 7, aux1: 8, aux2: 9, pan: 10, mute: 11, fader: 12, tape: 13 },
  mackie: { ...MK_ROWS, hiz: 3 },
  mackieSt: MK_ROWS,
  mackieLine: { ...MK_ROWS, usb34: 5 },
  epmMain: { p48: [2, 1], monlvl: [7, 1], phones: [7, 2], aux1pre: [8, 1], aux2pre: [9, 1], trkmon: [10, 1], trkmix: [11, 1], fader: [12, 1], faderR: [12, 2] },
  mackieMain: { p48: [6, 3], fxmute: 'fx', aux: [11, 1], blend: [11, 2], phones: [11, 3], fxmon: [12, 1], tophones: [12, 2], ctrlrm: [12, 3],
    brk: [13, 3], fxrtn: [15, 1], fx12: 'fb1', sub: [15, 2], sublr: 'fb2', fader: [15, 3], tape: 16 },
};
// Every strip of the setup, in board order, each mixer's master last.
function knobStrips(L) {
  const out = [];
  for (const mx of MIX[L.setup]) {
    mx.strips.forEach((label, i) => {
      if (label === mx.ret) {
        out.push({ key: mx.id + 'ret', mx, type: 'mackieSt', label, ret: true, name: `${mx.short} ${label}`, what: 'Blue mixer (stereo submix)', ctrls: CTRL.mackieSt });
        return;
      }
      const key = mx.id + (i + 1), xlr = i < mx.xlr;
      const type = mx.look === 'epm' ? (xlr ? 'epm' : 'epmSt') : !xlr ? 'mackieLine' : label.includes('/') ? 'mackieSt' : 'mackie';
      let ctrls = CTRL[type];
      if (type === 'mackie' && i < 2) ctrls = [ctrls[0], btn('hiz', 'Hi-Z (guitar / bass straight in)'), ...ctrls.slice(1)];
      out.push({ key, mx, type, label, xlr, name: L.chName(key), ctrls });
    });
    const type = mx.look + 'Main';
    out.push({ key: mx.id + 'main', mx, type, main: true, name: `${mx.name} master`, what: mx.model, ctrls: CTRL[type] });
  }
  return out;
}
const knobVals = (s, key) => s.mix?.knobs?.[key] || {};
// (Mix R follows Mix L until it's set on its own.)
const ctrlVal = (vals, c) => vals[c.k] ?? (c.same && vals[c.same]) ?? c.def;
// One line of what's been set (left out: anything still where it starts).
function knobSummary(st, vals) {
  const parts = [];
  for (const c of st.ctrls) {
    const v = vals[c.k];
    if (v === undefined || v === c.def) continue;
    if (c.t === 'btn') parts.push(c.label);
    else parts.push(`${c.label} ${c.fmt(v)}`);
  }
  if (vals.note) parts.push(`“${vals.note}”`);
  return parts.join(' · ');
}
function setKnob(key, k, v) {
  patchShow(s => {
    const kn = { ...(s.mix?.knobs || {}) };
    const row = { ...(kn[key] || {}) };
    if (v === undefined || v === '') delete row[k]; else row[k] = v;
    if (Object.keys(row).length) kn[key] = row; else delete kn[key];
    s.mix = { ...(s.mix || {}), knobs: kn };
  });
}
// A drawing of the whole board, laid out on its real rows so it can be matched by eye: every knob with its pointer,
// every button (lit when on), every fader with its scale and where it was set, and a tape label of what's plugged
// into each channel. In the editor the knobs, faders and buttons work right on the drawing (David, 2026-11-02): drag
// up/down, tap a button; the channel number or tape label (or a master label) opens the pop-up. The band app's
// drawing is look-only, and tapping a strip opens its pop-up.
function faceKnob(c, v) {
  const i = el('i', 'kn');
  i.style.cssText = `--c:${c.c};--s:${c.s};--p:${c.p};--pw:${c.w || .11};--a:${-150 + v * 300}deg`;
  return i;
}
function faceFader(c, v) {
  const f = el('span', 'fd' + (c.main ? ' main' : ''));
  for (const [pos, d] of c.marks) if (d !== null) {
    const b = el('b', d === 0 ? 'u' : '');
    b.style.setProperty('--pos', pos);
    f.append(b);
  }
  const i = el('i');
  i.style.setProperty('--v', v);
  if (c.cap) i.style.background = c.cap;
  f.append(i);
  return f;
}
const faceBtn = (cls, on) => el('span', `bt ${cls}${on ? ' on' : ''}`);
function mixerFace(mx, L, s) {
  const edit = canEdit();
  const face = el('div', `face ${mx.look}${edit ? ' edit' : ''}`);
  if (!edit) face.setAttribute('aria-hidden', 'true');
  for (const st of knobStrips(L).filter(x => x.mx === mx)) {
    const vals = knobVals(s, st.key), rows = FACE_ROWS[st.type];
    const cells = new Map();
    const add = (r, col, n, rs = 1, cs = 1) => {
      const key = `${r},${col}`;
      if (!cells.has(key)) cells.set(key, { r, col, rs, cs, nodes: [] });
      cells.get(key).nodes.push(n);
    };
    const ctrl = c => live(c, c.t === 'knob' ? faceKnob(c, ctrlVal(vals, c)) : c.t === 'fader' ? faceFader(c, ctrlVal(vals, c))
      : faceBtn(c.k === 'mute' ? 'mute' : c.tag || /^(hiz|lowcut|usb34)$/.test(c.k) ? 'sm' : '', vals[c.k]));
    // The little column of buttons beside a Mackie fader, each with its printed name under it.
    const fbCol = cs => {
      const b = el('span', 'fbtns');
      for (const c of cs) b.append(ctrl(c), el('small', null, c.tag));
      return b;
    };
    // Editor: the control works where it's drawn, saved as you let go (the page then redraws).
    const live = (c, n) => {
      if (!edit) return n;
      const save = v => { if (v !== ctrlVal(knobVals(currentShow(), st.key), c)) setKnob(st.key, c.k, v === c.def && !c.same ? undefined : v); };
      n.classList.add('live');
      if (c.t === 'btn') {
        n.tabIndex = 0;
        n.setAttribute('role', 'button');
        n.setAttribute('aria-label', `${st.name}: ${c.label}`);
        n.setAttribute('aria-pressed', Boolean(vals[c.k]));
        n.addEventListener('click', () => save(!vals[c.k]));
        n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); save(!vals[c.k]); } });
        return n;
      }
      let v = ctrlVal(vals, c);
      const draw = () => {
        if (c.t === 'knob') n.style.setProperty('--a', `${-150 + v * 300}deg`);
        else n.querySelector('i').style.setProperty('--v', v);
        n.setAttribute('aria-valuetext', c.fmt(v));
      };
      draw();
      dragValue(n, { ...c, label: `${st.name}: ${c.label}` }, () => v, nv => { v = nv; draw(); }, () => save(v),
        () => (c.t === 'knob' ? 160 : n.clientHeight - n.querySelector('i').offsetHeight));
      return n;
    };
    // The channel number and tape label (master: its labels) open the pop-up.
    const opener = n => {
      n.classList.add('opens');
      if (edit) n.addEventListener('click', () => openKnobs(st.key));
      return n;
    };
    let node;
    if (st.main) {
      node = el('div', 'master');
      const inside = {};   // controls drawn inside something else (the FX box, beside a fader)
      for (const c of st.ctrls) {
        const r = rows[c.k];
        if (Array.isArray(r)) add(...r, ctrl(c));
        else if (r) inside[r] = c;
      }
      const led = (on, cls = '') => el('i', `led ${cls}${on ? ' on' : ''}`);
      if (mx.look === 'mackie') {
        // Sockets along the top: MON SEND / FX SEND, the main outs (XLR, then 1/4"), control room / sub out, foot switch / phones.
        for (const r of [2, 3, 4]) for (const col of [1, 2, 3]) add(r, col, el('span', r === 2 && col > 1 ? 'jack xlr' : 'jack'));
        add(5, 1, opener(el('span', 'logo', 'ProFX12v3')), 1, 2);
        add(5, 3, led(vals.p48));
        add(5, 3, led(true, 'pw'));   // power
        const fx = el('span', 'fxbox');
        fx.append(el('small', null, 'GigFX'), opener(el('span', 'led7', s.mix?.fx ? String(s.mix.fx).padStart(2, '0') : '--')),
          faceKnob({ c: '#272727', s: '#121212', p: 'transparent' }, 0), ctrl(inside.fx));
        add(6, 1, fx, 5, 2);
        add(7, 3, el('span', 'meter'), 4, 1);
        ['FX', 'SUB 1-2', 'MAIN'].forEach((t, i) => add(14, i + 1, opener(el('span', 'plabel big', t))));
        add(15, 1, fbCol([inside.fb1]));
        add(15, 2, fbCol([inside.fb2]));
      } else {
        add(2, 1, led(vals.p48));
        add(4, 1, opener(el('span', 'logo', 'EPM 8')), 2, 2);
        add(8, 2, el('span', 'meter'), 4, 1);
        ['MIX L', 'MIX R'].forEach((t, i) => add(13, i + 1, opener(el('span', 'plabel', t))));
      }
    } else {
      const k = L.at[st.key] || '', inp = L.byKey.get(k);
      const tape = st.ret ? 'Blue mix' : inp ? inp.tape : k.slice(5);
      node = el('div', `strip${tape ? '' : ' empty'}${inp && L.where(k).length > 1 ? ' twice' : ''}`);
      const kc = st.ret ? 'var(--accent)' : inp && `var(--k-${inp.m.kind})`;
      if (kc) node.style.setProperty('--kc', kc);
      add(1, 1, opener(el('span', 'num', st.label.replace('St ', 'ST'))));
      if (mx.look === 'epm') {
        if (st.type === 'epmSt') { add(2, 1, el('span', 'jack')); add(3, 1, el('span', 'jack')); }
        else add(2, 1, el('span', 'jack xlr'));
        add(11, 1, faceBtn('pfl'));
      } else if (st.type === 'mackieLine') add(4, 1, el('span', 'jack mini'));
      else {
        // The XLR, then the line in (1–2: the Hi-Z button instead) and the insert (stereo channels: line L and R).
        add(2, 1, el('span', 'jack xlr'));
        if (!st.ctrls.some(c => c.k === 'hiz')) add(3, 1, el('span', 'jack'));
        add(4, 1, el('span', 'jack'));
      }
      const beside = st.ctrls.filter(c => rows[c.k] === 'fb');
      for (const c of st.ctrls) if (!beside.includes(c)) add(rows[c.k], 1, ctrl(c));
      if (beside.length) add(rows.fader, 1, fbCol(beside));
      if (mx.look === 'mackie') add(rows.gain, 1, el('i', 'led'));   // the level-set light beside the gain
      add(rows.tape, 1, opener(el('span', 'tape', tape)));
    }
    for (const { r, col, rs, cs, nodes } of cells.values()) {
      const cell = el('span', 'cell');
      cell.style.gridRow = `${r} / span ${rs}`;
      if (st.main) cell.style.gridColumn = `${col} / span ${cs}`;
      cell.append(...nodes);
      node.append(cell);
    }
    if (!edit) node.addEventListener('click', () => openKnobs(st.key));
    face.append(node);
  }
  return face;
}
/* Signal flow: what plugs into which mixer and where each one goes (on the page and on the printout). */
function mixFlow(L, s) {
  const count = id => {
    const n = { mic: 0, di: 0, other: 0 };
    for (const c of L.slots) if (L.info[c].mx.id === id && L.at[c]) n[L.byKey.get(L.at[c])?.type || 'other']++;
    const p = (k, w) => n[k] && `${n[k]} ${w}${n[k] > 1 ? 's' : ''}`;
    return [p('mic', 'mic'), p('di', 'DI'), n.other && `${n.other} other`].filter(Boolean).join(' + ') || 'Nothing yet';
  };
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const box = (x, y, w, h, lines, cls) => `<g class="${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>`
    + lines.map((t, i) => `<text x="${x + w / 2}" y="${y + h / 2 + (i - (lines.length - 1) / 2) * 20 + 6}" class="${i ? 'sm' : 'big'}">${esc(t)}</text>`).join('') + '</g>';
  const arrow = (x1, y1, x2, y2, label) => `<path d="M${x1} ${y1}H${x2}" class="ar"/>` + (label ? `<text x="${(x1 + x2) / 2}" y="${y1 - 8}" class="lab">${esc(label)}</text>` : '');
  const mons = monitorCount(s), monTxt = `${mons} stage monitor${mons > 1 ? 's' : ''}`;
  const fx = s.mix?.fx ? `FX: ${fxName(s.mix.fx)}` : 'FX: not picked';
  let g;
  if (L.setup === 'two') {
    g = box(10, 20, 170, 56, [count('A'), 'into the blue mixer'], 'src') + box(10, 124, 170, 56, [count('B'), 'into the Mackie'], 'src')
      + box(240, 12, 190, 72, ['BLUE MIXER', 'Soundcraft EPM8'], 'epm')
      + box(500, 12, 200, 176, ['MACKIE', 'ProFX12v3', `${MACKIE_RET} ← blue mix`, fx], 'mackie')
      + box(770, 12, 120, 72, ['PA', 'Main out L/R'], 'out')
      + (mons ? box(770, 116, 120, 72, [monTxt.replace(' stage', ''), 'from MON SEND'], 'out') + arrow(700, 152, 770, 152) : '')
      + arrow(180, 48, 240, 48) + arrow(180, 152, 500, 152) + arrow(430, 48, 500, 48, 'XLR L/R') + arrow(700, 48, 770, 48);
  } else {
    g = box(10, 64, 200, 72, [count(''), 'into the blue mixer'], 'src')
      + box(300, 30, 220, 140, ['BLUE MIXER', 'Soundcraft EPM8'], 'epm')
      + box(640, 20, 170, 72, ['PA', 'Mix out L/R'], 'out')
      + (mons ? box(640, 108, 170, 72, [monTxt.replace(' stage', ''), 'from AUX 1 OUT'], 'out') + arrow(520, 144, 640, 144) : '')
      + arrow(210, 100, 300, 100) + arrow(520, 56, 640, 56);
  }
  const wrap = el('div', 'flow');
  wrap.innerHTML = `<svg viewBox="0 0 ${L.setup === 'two' ? 900 : 820} 200" role="img" aria-label="Signal flow">`
    + `<defs><marker id="flow-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill:var(--ink)"/></marker></defs>${g}</svg>`;
  const p = el('p', 'cap');
  p.append(el('b', null, 'Main out: '), L.out);
  wrap.append(p);
  return wrap;
}

/* The printout: page 1 = signal flow + the blue board drawn as set; page 2 = the Mackie; then a settings sheet, one row per channel
   (blank boxes on strips with nothing set, to write in at rehearsal) and each master section. */
const miniKnob = faceKnob;
function miniFader(v) {
  const f = el('span', 'mfd'), i = el('i');
  i.style.setProperty('--v', v);
  f.append(i);
  return f;
}
function mixPrint(L, s) {
  const box = el('div');
  const strips = knobStrips(L);
  const faces = el('div', 'mp-faces');
  for (const mx of MIX[L.setup]) {
    const f = el('div', `mp-face ${mx.look}`);
    f.append(el('h4', null, `${mx.name} · ${mx.model}`), mixerFace(mx, L, s));
    faces.append(f);
  }
  const sheet = el('div', 'mp-sheet');
  sheet.append(el('h3', 'print-title', `Settings · ${s.name} · ${fmtDate(s.date, false)}`));
  for (const mx of MIX[L.setup]) {
    sheet.append(el('h4', null, `${mx.name} · ${mx.model}`));
    const rows = strips.filter(x => x.mx === mx && !x.main);
    const cols = [];
    for (const st of rows) for (const c of st.ctrls) if (c.t !== 'btn' && !cols.some(x => x.k === c.k)) cols.push(c);
    const t = el('table', 'mp-table');
    const head = el('tr');
    head.append(el('th', 'c', 'Ch'), el('th', 'in', 'Input'), ...cols.map(c => el('th', null, c.label)), el('th', 'nt', 'Buttons / notes'));
    t.append(head);
    for (const st of rows) {
      const vals = knobVals(s, st.key), set = Object.keys(vals).length > 0;
      const k = L.at[st.key] || '', inp = L.byKey.get(k);
      const tr = el('tr', set ? '' : 'blank');
      const who = el('td', 'in');
      if (inp) { who.style.setProperty('--kc', `var(--k-${inp.m.kind})`); who.append(el('b', null, inp.m.name), ` ${inp.what}`); }
      else who.append(st.ret ? 'Blue mix (submix)' : k.slice(5) || el('span', 'spare', st.xlr ? 'spare' : 'spare (line only)'));
      tr.append(el('td', 'c', st.label), who);
      for (const c of cols) {
        const td = el('td');
        const own = st.ctrls.find(x => x.k === c.k);
        if (!own) td.append(el('span', 'na', '–'));
        else if (set) {
          const v = ctrlVal(vals, own);
          if (own.t === 'knob') td.append(miniKnob(own, v));
          td.append(own.fmt(v));
        }
        tr.append(td);
      }
      tr.append(el('td', 'nt', [...st.ctrls.filter(c => c.t === 'btn' && vals[c.k]).map(c => c.label), vals.note].filter(Boolean).join(' · ')));
      t.append(tr);
    }
    sheet.append(t);
    // The master section: its knobs and faders as little pictures, buttons that are on, and where it goes.
    const st = strips.find(x => x.key === mx.id + 'main'), vals = knobVals(s, st.key), set = Object.keys(vals).length > 0;
    const m = el('div', 'mp-master');
    m.append(el('b', 'mp-mh', 'Master'));
    for (const c of st.ctrls) if (c.t !== 'btn') {
      const d = el('span', 'mp-cell');
      const v = ctrlVal(vals, c);
      d.append(el('span', 'mp-l', c.label), set ? (c.t === 'knob' ? miniKnob(c, v) : miniFader(v)) : el('span', 'mp-blank'), el('span', 'mp-v', set ? c.fmt(v) : ''));
      m.append(d);
    }
    const on = st.ctrls.filter(c => c.t === 'btn' && vals[c.k]).map(c => c.label);
    const info = el('div', 'mp-info');
    const line = (b, text) => { const p = el('p'); p.append(el('b', null, b + ': '), text); info.append(p); };
    if (on.length) line('On', on.join(', '));
    if (vals.note) line('Note', vals.note);
    const master = !(L.setup === 'two' && mx.id === 'A');
    line('Out', master ? L.out : `Mix out L/R (XLR) → Mackie ${MACKIE_RET}`);
    if (master) line('Monitor', monitorCount(s) ? `${monitorCount(s) > 1 ? '2 stage monitors' : '1 stage monitor'} from ${mx.aux}` : 'none');
    if (mx.look === 'mackie') line('Effect', s.mix?.fx ? fxName(s.mix.fx) : '');
    m.append(info);
    sheet.append(m);
  }
  box.append(faces, sheet);
  return box;
}
function renderMixers(s) {
  const box = $('mixers');
  box.replaceChildren();
  $('mixer-print-title').textContent = s ? `SOS Band — Mixer routing · ${s.name} · ${fmtDate(s.date, false)}` : '';
  $('mixer-notes').replaceChildren();
  $('mix-msgs').replaceChildren();
  $('mix-flow').replaceChildren();
  $('mix-print').replaceChildren();
  if (!s) return;
  const edit = canEdit();
  const L = mixLayout(s), chName = L.chName;
  $('mix-flow').append(mixFlow(L, s));
  $('mix-print').append(mixPrint(L, s));
  document.querySelectorAll('#mix-setup button').forEach(b => b.setAttribute('aria-pressed', b.dataset.setup === L.setup));
  $('mix-redo').disabled = !L.pinned;
  const label = inp => `${inp.m.name} — ${inp.what}`;
  // Each row ends with a Knobs button and, under it, what's been set on that strip.
  const strips = knobStrips(L);
  const knobBits = (li, key) => {
    const st = strips.find(x => x.key === key), sum = knobSummary(st, knobVals(s, key));
    const b = el('button', 'btn small knob-btn', 'Knobs');
    b.type = 'button';
    b.setAttribute('aria-label', `Knobs and faders for ${st.name}`);
    b.addEventListener('click', () => openKnobs(key));
    li.append(b);
    if (sum) li.append(el('span', 'ksum', sum));
  };
  const cp = $('knob-copy');
  const from = shows().filter(x => x.id !== s.id && Object.keys(x.mix?.knobs || {}).length);
  cp.hidden = !edit || !from.length;
  cp.replaceChildren(new Option('Copy knob settings from…', ''), ...from.map(x => new Option(`${x.name} (${fmtDate(x.date, false)})`, x.id)));
  for (const mx of MIX[L.setup]) {
    const card = el('div', `mixer ${mx.look}`);
    card.append(el('h3', null, mx.name), el('p', 'role', mx.role), mixerFace(mx, L, s));
    const ol = el('ol');
    mx.strips.forEach((strip, i) => {
      if (strip === mx.ret) {
        const li = el('li', 'ret');
        li.append(el('span', 'ch', strip), el('span', null, 'Blue mixer (stereo submix from its mix out L/R)'));
        knobBits(li, mx.id + 'ret');
        ol.append(li);
        return;
      }
      const c = mx.id + (i + 1), k = L.at[c] || '', inp = L.byKey.get(k), xlr = i < mx.xlr;
      const li = el('li', inp && L.where(k).length > 1 ? 'twice' : '');
      li.dataset.ch = c;
      if (inp) li.style.setProperty('--kc', `var(--k-${inp.m.kind})`);
      const badge = el('span', 'ch', strip);
      badge.title = xlr ? 'Mic / DI (XLR) or line' : mx.look === 'mackie' ? 'Line only (3.5 mm stereo or USB 3-4)' : 'Stereo line only (1/4" L + R)';
      li.append(badge);
      if (edit) {
        const pick = el('div', 'pick');
        const sel = el('select');
        sel.setAttribute('aria-label', `What goes on ${chName(c)}`);
        sel.append(new Option(xlr ? 'Spare' : 'Spare (line only, no mic or DI)', ''));
        // Inputs already on another channel are greyed; ones with no channel yet are marked.
        // Line-only channels can't take a mic or DI.
        if (xlr) for (const x of [...L.byKey.values()]) {
          const others = L.where(x.key).filter(y => y !== c);
          const o = new Option(label(x) + (others.length ? ` (on ${others.map(chName).join(', ')})` : x.key === k ? '' : ' (no channel)'), x.key);
          if (others.length) o.className = 'used';
          sel.append(o);
        }
        sel.append(new Option('Something else…', 'text:'));
        sel.value = k.startsWith('text:') ? 'text:' : k;
        sel.addEventListener('change', () => {
          setChannel(c, sel.value);
          if (sel.value === 'text:') document.querySelector(`#mixers input[data-ch="${c}"]`)?.focus();
        });
        pick.append(sel);
        if (k.startsWith('text:')) {
          const t = el('input');
          t.dataset.ch = c;
          t.value = k.slice(5);
          t.placeholder = xlr ? 'e.g. Laptop (backing tracks)' : 'e.g. Keyboard (stereo line)';
          t.setAttribute('aria-label', `What goes on ${chName(c)}`);
          t.addEventListener('change', () => setChannel(c, 'text:' + t.value.trim()));
          pick.append(t);
        }
        li.append(pick);
      } else if (inp) {
        const chip = el('span', 'chip', inp.m.name);
        chip.style.setProperty('--kc', `var(--k-${inp.m.kind})`);
        li.append(chip, el('span', 'what', inp.what));
      } else if (k.slice(5)) li.append(el('span', null, k.slice(5)));
      else li.append(el('span', 'spare', xlr ? 'spare' : 'spare (line only)'));
      knobBits(li, c);
      ol.append(li);
    });
    card.append(ol);
    const master = !(L.setup === 'two' && mx.id === 'A');
    const fxSel = () => {
      const lab = el('label', 'out-lbl');
      const sel = el('select');
      sel.append(new Option('Not picked', ''));
      FX_PRESETS.forEach((_, i) => sel.append(new Option(fxName(i + 1), i + 1)));
      sel.value = s.mix?.fx || '';
      sel.addEventListener('change', () => patchShow(v => { v.mix = { ...(v.mix || {}), fx: Number(sel.value) || 0 }; }));
      lab.append(el('b', null, 'Effect (FX preset)'), sel);
      return lab;
    };
    if (master && edit) {
      const ow = el('div', 'mixer-edit out-edit');
      const lab = el('label', 'out-lbl');
      const inp = el('input');
      inp.value = L.out;
      inp.placeholder = 'Main out goes to…';
      inp.addEventListener('change', () => patchShow(v => { v.mix = { ...(v.mix || {}), out: inp.value.trim() }; }));
      lab.append(el('b', null, 'Main out'), inp);
      // Stage monitors: each one adds a monitor, a power cable and a 1/4" cable to the Gear list.
      const mlab = el('label', 'out-lbl');
      const sel = el('select');
      ['No monitor', '1 monitor', '2 monitors'].forEach((t, n) => sel.append(new Option(t, n)));
      sel.value = monitorCount(s);
      sel.addEventListener('change', () => patchShow(v => { v.mix = { ...(v.mix || {}), monitors: Number(sel.value) }; }));
      mlab.append(el('b', null, `Monitor (from ${mx.aux})`), sel);
      ow.append(lab, mlab);
      if (mx.look === 'mackie') ow.append(fxSel());
      card.append(ow);
    } else {
      const line = (b, text) => { const p = el('p', 'out'); p.append(el('b', null, b + ': '), text); card.append(p); };
      line('Out', master ? L.out : `Mix out L/R (XLR) → Mackie ${MACKIE_RET} line in L + R (2 XLR to 1/4" cables)`);
      if (master && monitorCount(s)) line('Monitor', `${monitorCount(s) > 1 ? '2 stage monitors' : '1 stage monitor'} from ${mx.aux}`);
    }
    const ms = el('div', 'master-row');
    const mb = el('button', 'btn small knob-btn', 'Master knobs');
    mb.type = 'button';
    mb.addEventListener('click', () => openKnobs(mx.id + 'main'));
    const msum = knobSummary(strips.find(x => x.key === mx.id + 'main'), knobVals(s, mx.id + 'main'));
    ms.append(mb, el('span', 'ksum', msum || 'Master section not set yet'));
    card.append(ms);
    if (mx.look === 'mackie') {
      const p = el('p', 'out fx-note');
      p.append(el('b', null, 'Effect: '), s.mix?.fx ? fxName(s.mix.fx) : 'not picked yet',
        `. Turn up the yellow FX knob on ${MACKIE_RET} to put it on the whole blue mix.`);
      card.append(p);
    }
    box.append(card);
  }
  const msg = (cls, text) => $('mix-msgs').append(el('p', 'mix-msg ' + cls, text));
  const chList = cs => cs.map(chName).join(' and ');
  if (L.twice.length) msg('warn', `On two channels: ${L.twice.map(i => `${label(i)} (${chList(L.where(i.key))})`).join(', ')}.`);
  if (L.none.length) msg('warn', `No channel: ${L.none.map(label).join(', ')}.` + (!edit ? '' : !L.full ? ' Pick it on a spare mic channel.'
    : L.setup === 'one' ? ' Every mic channel is taken: switch to Blue → Mackie or free one up.' : ' Every mic channel is taken: free one up.'));
  const own = [];
  for (const l of s.lineup || []) {
    const m = get(l.member);
    for (const g of m?.gear || []) if (/\bamp\b|drum kit/i.test(g.item)) own.push(`${m.name} (${g.item})`);
  }
  if (own.length) msg('', `Not through the mixer: ${own.join(', ')}.`);
  $('mixer-notes').append(notesBox(s, 'mixerNotes', 'Mixer notes'));
}
document.querySelectorAll('#mix-setup button').forEach(b => b.addEventListener('click', () => {
  patchShow(v => { v.mix = { ...(v.mix || {}), setup: b.dataset.setup }; });
}));
$('mix-redo').addEventListener('click', () => {
  const L = mixLayout(currentShow());
  patchShow(v => {
    const ch = { ...(v.mix?.ch || {}) };
    for (const c of L.slots) delete ch[c];
    const { off, known, ...mix } = v.mix || {};
    v.mix = { ...mix, ch };
  });
  toast('Channels now follow the stage plot, left to right: vocals first, then instruments.');
});

/* The settings pop-up for one strip: big knobs, buttons and faders, ‹ › to step through the board.
   Drag a knob or fader up or down (or arrow keys / mouse wheel); a double tap puts it back. Saved when you let go. */
let knobKey = '';
function openKnobs(key) {
  knobKey = key;
  drawKnobs();
  if (!$('knob-dlg').open) $('knob-dlg').showModal();
}
function knobSvg(v, c) {
  const pt = (deg, r) => { const a = deg * Math.PI / 180; return `${(Math.sin(a) * r).toFixed(1)} ${(-Math.cos(a) * r).toFixed(1)}`; };
  let ticks = '';
  for (let i = 0; i <= 10; i++) ticks += `M${pt(-150 + i * 30, 41)}L${pt(-150 + i * 30, 48)}`;
  const a = -150 + v * 300, w = c.w ? 13 : 5;
  return `<svg viewBox="-50 -50 100 100"><path d="${ticks}" stroke="currentColor" stroke-width="2.5" opacity=".5"/>`
    + `<circle r="36" fill="${c.s}" stroke="rgba(0,0,0,.45)" stroke-width="2"/><circle r="24" fill="${c.c}"/>`
    + `<path d="M${pt(a, c.w ? 4 : 0)}L${pt(a, 33)}" stroke="${c.p}" stroke-width="${w}" stroke-linecap="round"/></svg>`;
}
// Drag up/down (full range over `span()` px), arrow keys and the mouse wheel change it; a double tap resets it.
function dragValue(node, c, get, set, commit, span) {
  node.tabIndex = 0;
  node.setAttribute('role', 'slider');
  node.setAttribute('aria-label', c.label);
  let lastDown = 0, timer = 0;
  const later = () => { clearTimeout(timer); timer = setTimeout(commit, 500); };
  const to = v => set(Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000);
  node.addEventListener('pointerdown', e => {
    e.preventDefault();
    node.focus({ preventScroll: true });
    if (e.timeStamp - lastDown < 300) { to(c.def); commit(); lastDown = 0; return; }
    lastDown = e.timeStamp;
    dragging = true;
    node.setPointerCapture(e.pointerId);
    const y0 = e.clientY, v0 = get();
    const move = ev => to(v0 + (y0 - ev.clientY) / span());
    const up = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      commit();
      setTimeout(() => { dragging = false; renderIfWaiting(); });
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  });
  node.addEventListener('keydown', e => {
    const step = { ArrowUp: .02, ArrowRight: .02, ArrowDown: -.02, ArrowLeft: -.02, PageUp: .1, PageDown: -.1 }[e.key];
    if (step) to(get() + step * (e.shiftKey ? .25 : 1));
    else if (e.key === 'Home') to(0);
    else if (e.key === 'End') to(1);
    else return;
    e.preventDefault();
    later();
  });
  node.addEventListener('wheel', e => { e.preventDefault(); to(get() - e.deltaY / 800); later(); }, { passive: false });
}
function drawKnobs() {
  const s = currentShow();
  const L = s && mixLayout(s), all = s ? knobStrips(L) : [], at = all.findIndex(x => x.key === knobKey), st = all[at];
  if (!st) { $('knob-dlg').close(); return; }
  const edit = canEdit(), vals = knobVals(s, st.key);
  const k = L.at[st.key] || '', inp = L.byKey.get(k);
  $('knob-title').textContent = st.name;
  $('knob-sub').textContent = st.what || (inp ? `${inp.m.name} — ${inp.what}` : k.slice(5) || 'Spare');
  $('knob-prev').onclick = () => openKnobs(all[(at - 1 + all.length) % all.length].key);
  $('knob-next').onclick = () => openKnobs(all[(at + 1) % all.length].key);
  const body = $('knob-body');
  body.className = `knob-body look-${st.mx.look}`;
  body.replaceChildren();
  const left = el('div', 'kb-left'), btns = el('div', 'kb-btns'), knobs = el('div', 'kb-knobs'), faders = el('div', 'kb-faders');
  for (const c of st.ctrls) {
    let v = ctrlVal(vals, c);
    const save = () => { if (v !== ctrlVal(knobVals(currentShow(), st.key), c)) setKnob(st.key, c.k, v === c.def && !c.same ? undefined : v); };
    if (c.t === 'btn') {
      const b = el('button', 'btn small ktog' + (c.k === 'mute' ? ' mute' : ''), c.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', Boolean(v));
      if (edit) b.addEventListener('click', () => { v = !v; b.setAttribute('aria-pressed', v); save(); });
      else b.disabled = true;
      btns.append(b);
      continue;
    }
    const cell = el('div', c.t === 'knob' ? 'kcell' : 'fcell');
    const lab = el('span', 'klab', c.label);
    if (c.hint) lab.append(el('small', null, c.hint));
    const out = el('span', 'kval');
    let ctl;
    if (c.t === 'knob') {
      ctl = el('div', 'kdial');
    } else {
      ctl = el('div', 'ftrack');
      for (const [pos, d] of c.marks) {
        const m = el('span', 'fmark', d === null ? '∞' : d === 0 ? c.unity.replace(' dB', '') : sgn(d));
        m.style.setProperty('--pos', pos);
        ctl.append(m);
      }
      const cap = el('i', 'fcap');
      if (c.cap) cap.style.background = c.cap;
      ctl.append(cap);
    }
    const draw = () => {
      if (c.t === 'knob') ctl.innerHTML = knobSvg(v, c);
      else ctl.querySelector('.fcap').style.setProperty('--v', v);
      out.textContent = c.fmt(v);
      ctl.setAttribute('aria-valuetext', c.fmt(v));
    };
    draw();
    if (edit) dragValue(ctl, c, () => v, nv => { v = nv; draw(); }, save, () => (c.t === 'knob' ? 220 : ctl.clientHeight - 28));
    else { ctl.setAttribute('role', 'img'); ctl.setAttribute('aria-label', `${c.label}: ${c.fmt(v)}`); }
    cell.append(lab, ctl, out);
    (c.t === 'knob' ? knobs : faders).append(cell);
  }
  if (btns.childElementCount) left.append(btns);
  if (knobs.childElementCount) left.append(knobs);
  body.append(left, faders);
  const foot = $('knob-foot');
  foot.replaceChildren();
  if (edit) {
    const lab = el('label', null, 'Note');
    const note = el('input');
    note.value = vals.note || '';
    note.placeholder = 'e.g. compressor on, watch for feedback';
    note.addEventListener('change', () => setKnob(st.key, 'note', note.value.trim()));
    lab.append(note);
    const row = el('div', 'row-btns');
    const reset = el('button', 'btn small', 'Reset this strip');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      patchShow(v => { const kn = { ...(v.mix?.knobs || {}) }; delete kn[st.key]; v.mix = { ...(v.mix || {}), knobs: kn }; });
      drawKnobs();
    });
    row.append(reset);
    foot.append(lab, row, el('p', 'cap', 'Drag a knob or fader up or down (or use the arrow keys); double-tap to put it back. Saved as you let go. The numbers are rough: match the pointer to the board.'));
  } else {
    if (vals.note) foot.append(el('p', 'knob-note', vals.note));
    foot.append(el('p', 'cap', Object.keys(vals).length ? 'Where everything was set. The numbers are rough: match the pointer to the board.' : 'Nothing set here yet.'));
  }
}
$('knob-copy').addEventListener('change', () => {
  const s = currentShow(), src = get($('knob-copy').value);
  $('knob-copy').value = '';
  if (!s || !src || !confirm(`Copy every knob, button and fader setting from ${src.name} to ${s.name}? This replaces what's set for ${s.name}.`)) return;
  patchShow(v => { v.mix = { ...(v.mix || {}), knobs: structuredClone(src.mix.knobs), ...(src.mix.fx ? { fx: src.mix.fx } : {}) }; });
  toast(`Copied the knob settings from ${src.name}.`);
});

/* Band */
function renderBand(s) {
  const ul = $('members');
  ul.replaceChildren();
  const on = new Set((s?.lineup || []).map(l => l.member));
  const all = members();
  $('band-cap').textContent = s ? `${[...on].filter(id => get(id)).length} of ${all.length} playing at ${s.name}.` : '';
  for (const m of all) {
    const li = el('li', on.has(m.id) ? '' : 'off');
    li.style.setProperty('--kc', `var(--k-${m.kind})`);
    const who = el('button', 'who');
    who.type = 'button';
    who.append(el('b', null, `${icons(m)} ${m.name}`), el('span', null, m.instrument || ''));
    who.addEventListener('click', () => { if (canEdit()) openMember(m.id); });
    li.append(who);
    if (canEdit() && s) {
      const lab = el('label', 'playing');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = on.has(m.id);
      cb.addEventListener('change', () => patchShow(v => {
        if (cb.checked) v.lineup = [...(v.lineup || []), { member: m.id, x: 50, y: 33 }];
        else v.lineup = v.lineup.filter(l => l.member !== m.id);
      }));
      lab.append(cb, 'Playing');
      li.append(lab);
    } else if (s) {
      li.append(el('span', 'cap', on.has(m.id) ? 'Playing' : 'Not playing'));
    }
    ul.append(li);
  }
}

/* ---------- Song dialog ---------- */
let songId = null, pendingChart = null;
function openSong(id) {
  songId = id;
  const s = get(id);
  $('song-dlg-title').textContent = s.title;
  $('sv-artist').textContent = s.artist || '';
  // In this gig's set, the lead is the gig's pick; the editor can change it here for this gig only.
  const show = currentShow();
  const inGig = Boolean(show?.setlist?.includes(id));
  const lead = get(inGig ? leadFor(s, show) : s.lead);
  $('sv-lead').textContent = lead ? lead.name : 'Not set';
  $('sv-gig-lead-wrap').hidden = !(inGig && canEdit());
  if (inGig && canEdit()) {
    const playing = new Set((show.lineup || []).map(l => l.member));
    const sel = $('sv-gig-lead');
    sel.replaceChildren(new Option(`Default (${get(s.lead)?.name || 'not set'})`, ''));
    members().forEach(m => sel.append(new Option(playing.has(m.id) ? m.name : `${m.name} (not playing)`, m.id)));
    sel.value = show.leads?.[id] || '';
    $('sv-gig-name').textContent = show.name;
  }
  $('sv-key').textContent = s.key || '—';
  $('sv-bpm').textContent = s.bpm ? `${s.bpm} BPM` : '—';
  $('sv-notes').textContent = s.notes || '';
  $('sv-chart').disabled = !s.chart;
  $('sv-nochart').hidden = Boolean(s.chart);
  $('song-view').hidden = false;
  $('song-edit').hidden = true;
  $('song-dlg').showModal();
}
function editSong(id) {
  songId = id;
  const s = id ? get(id) : { title: '', artist: '', lead: '', key: '', notes: '', chart: '' };
  pendingChart = null;
  $('song-dlg-title').textContent = id ? 'Edit song' : 'New song';
  $('se-title').value = s.title;
  $('se-artist').value = s.artist || '';
  $('se-key').value = s.key || '';
  $('se-bpm').value = s.bpm || '';
  $('se-notes').value = s.notes || '';
  const sel = $('se-lead');
  sel.replaceChildren(new Option('Not set', ''));
  members().forEach(m => sel.append(new Option(m.name, m.id)));
  sel.value = s.lead || '';
  $('se-chart-name').textContent = s.chart ? `Current: ${s.chart.split('/').pop()}` : 'No chart yet.';
  $('se-chart').value = '';
  $('se-error').hidden = true;
  $('se-delete').hidden = !id;
  $('se-delete').classList.remove('armed');
  $('se-delete').textContent = 'Delete song';
  $('song-view').hidden = true;
  $('song-edit').hidden = false;
  if (!$('song-dlg').open) $('song-dlg').showModal();
}
$('sv-edit').addEventListener('click', () => editSong(songId));
$('sv-gig-lead').addEventListener('change', e => {
  const v = e.target.value, song = get(songId);
  patchShow(x => {
    x.leads = { ...(x.leads || {}) };
    if (!v || v === song.lead) delete x.leads[songId];   // the default needs no gig pick
    else x.leads[songId] = v;
  });
  openSong(songId);
  toast(`Lead singer for “${song.title}” at ${currentShow().name}: ${get(leadFor(song, currentShow()))?.name || 'not set'}.`);
});
$('song-new').addEventListener('click', () => editSong(null));
$('note-add').addEventListener('click', () => {
  const id = uid('note');
  patchShow(x => { x.setlist = [...(x.setlist || []), id]; x.setNotes = { ...(x.setNotes || {}), [id]: '' }; });
  const inp = document.querySelector(`li[data-id="${id}"] input`);
  inp?.scrollIntoView({ block: 'center' });
  inp?.focus();
  toast('Added a note at the end of the set. Type it, then drag it to where it goes.');
});
$('break-add').addEventListener('click', () => {
  patchShow(x => { x.setlist = [...(x.setlist || []), uid('break')]; });
  toast('Added a break at the end of the set. Drag it to where it goes.');
});
$('se-cancel').addEventListener('click', () => (songId ? openSong(songId) : $('song-dlg').close()));
$('sv-chart').addEventListener('click', () => openChart(get(songId)));
$('se-chart').addEventListener('change', e => {
  pendingChart = e.target.files[0] || null;
  if (pendingChart) $('se-chart-name').textContent = `New: ${pendingChart.name} (uploads when you save)`;
});
$('song-form').addEventListener('submit', async e => {
  e.preventDefault();
  const title = $('se-title').value.trim();
  if (!title) return;
  const id = songId || 's-' + slug(title) + (get('s-' + slug(title)) ? '-' + Date.now().toString(36) : '');
  const old = get(id) || {};
  const rec = { ...old, type: 'song', title, artist: $('se-artist').value.trim(), lead: $('se-lead').value, key: $('se-key').value.trim(), bpm: cleanBpm($('se-bpm').value), notes: $('se-notes').value.trim(), chart: old.chart || '' };
  const btn = $('se-save');
  if (pendingChart) {
    btn.disabled = true;
    btn.textContent = 'Uploading chart…';
    try {
      rec.chart = await uploadChart(pendingChart, slug(title));
      rec.chartVersion = Date.now();
    } catch (ex) {
      $('se-error').textContent = ex.message || 'The chart didn’t upload.';
      $('se-error').hidden = false;
      return;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  }
  put(id, rec);
  openSong(id);
  if (pendingChart) toast('Saved. A new chart can take a minute or two to show up for everyone.');
});
$('se-delete').addEventListener('click', () => {
  const b = $('se-delete');
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again to delete'; return; }
  const title = get(songId)?.title;
  remove(songId);
  for (const s of shows()) if ((s.setlist || []).includes(songId)) put(s.id, { ...s, setlist: s.setlist.filter(v => v !== songId) });
  $('song-dlg').close();
  toast(`Deleted “${title}”.`);
});

/* Charts: open one, or join the whole set into one PDF to print */
const chartUrl = s => CHART_BASE + encodeURI(s.chart) + (s.chartVersion ? `?v=${s.chartVersion}` : '');
// Charts open inside the app in a full-screen viewer (pdf.js draws the pages), with Close, Download and Print.
// Opening the PDF on its own left people stuck in the installed app with no way back.
function openChart(s) {
  if (!s?.chart) return;
  const got = fetch(chartUrl(s)).then(res => {
    if (!res.ok) throw new Error('missing');
    return res.blob();
  });
  showPdf(got, s.title, `${s.title}.pdf`, 'That chart isn’t saved on this device yet. Open it once while online.');
}
$('print-set-charts').addEventListener('click', () => {
  const s = currentShow();
  const list = (s?.setlist || []).map(get).filter(x => x && x.chart);
  if (!list.length) return;
  const made = (async () => {
    await loadScript('vendor/pdf-lib.min.js', 'PDFLib');
    const out = await PDFLib.PDFDocument.create();
    const missing = [];
    for (const song of list) {
      try {
        const res = await fetch(chartUrl(song));
        if (!res.ok) throw new Error();
        const src = await PDFLib.PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(p => out.addPage(p));
      } catch { missing.push(song.title); }
    }
    if (missing.length) toast(`Couldn’t get: ${missing.join(', ')}.`);
    out.setTitle(`SOS Band · ${s.name} · charts`);
    return new Blob([await out.save()], { type: 'application/pdf' });
  })();
  showPdf(made, `${s.name}: all charts`, `SOS Band - ${s.name} - charts.pdf`, 'Couldn’t put the charts together. Check the connection and try again.');
});

function loadScript(src, global) {
  if (window[global]) return Promise.resolve();
  return new Promise((ok, fail) => {
    const sc = document.createElement('script');
    sc.src = src;
    sc.onload = ok;
    sc.onerror = fail;
    document.head.append(sc);
  });
}
const viewer = { blob: null, name: '', doc: null, observer: null };
// On a phone or iPad, the share sheet does saving and printing (Save to Files, Print, AirDrop…).
const useShareSheet = () => matchMedia('(pointer: coarse)').matches && Boolean(navigator.canShare);
async function showPdf(blobPromise, title, fileName, failMessage) {
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  viewer.blob = null;
  viewer.name = fileName.replace(/[\\/:*?"<>|]/g, '-');
  $('viewer-title').textContent = title;
  const pages = $('viewer-pages');
  pages.replaceChildren(el('p', 'viewer-msg', 'Loading…'));
  const share = useShareSheet();
  $('viewer-save').textContent = share ? 'Save / Print' : 'Download';
  $('viewer-print').hidden = share;
  $('viewer-save').disabled = $('viewer-print').disabled = true;
  $('viewer').hidden = false;
  document.body.classList.add('viewing');
  if (history.state?.viewer !== true) history.pushState({ viewer: true }, '');
  try {
    const blob = await blobPromise;
    if ($('viewer').hidden) return;
    viewer.blob = blob;
    $('viewer-save').disabled = $('viewer-print').disabled = false;
    await loadScript('vendor/pdf.min.js', 'pdfjsLib');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    if ($('viewer').hidden) { doc.destroy(); return; }
    viewer.doc = doc;
    pages.replaceChildren();
    const width = Math.min(pages.clientWidth - 16, 1000);
    // Draw each page when it scrolls near the screen (a whole set can be 30+ pages).
    viewer.observer = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting || en.target.dataset.drawn) return;
      en.target.dataset.drawn = '1';
      drawPage(doc, Number(en.target.dataset.page), en.target, width);
    }), { root: pages, rootMargin: '600px 0px' });
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const vp = pg.getViewport({ scale: 1 });
      const box = el('div', 'viewer-page');
      box.dataset.page = i;
      box.style.width = width + 'px';
      box.style.aspectRatio = `${vp.width} / ${vp.height}`;
      pages.append(box);
      viewer.observer.observe(box);
    }
  } catch {
    if (!$('viewer').hidden) pages.replaceChildren(el('p', 'viewer-msg', failMessage));
  }
}
async function drawPage(doc, n, box, width) {
  try {
    const pg = await doc.getPage(n);
    const scale = width / pg.getViewport({ scale: 1 }).width;
    const vp = pg.getViewport({ scale: scale * Math.min(devicePixelRatio || 1, 2.5) });
    const canvas = el('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    canvas.setAttribute('aria-label', `Page ${n}`);
    await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    box.append(canvas);
  } catch {}
}
// Full screen: hide the bar so the chart fills the screen; a small floating ✕ brings the bar back.
// Where the device allows it, the browser goes full screen too (not on iPhone, which doesn't allow it for pages).
function setFull(on) {
  $('viewer').classList.toggle('full', on);
  const v = $('viewer');
  if (on && v.requestFullscreen && !document.fullscreenElement) v.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
$('viewer-full').addEventListener('click', () => setFull(true));
$('viewer-exit').addEventListener('click', () => setFull(false));
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) $('viewer').classList.remove('full'); });
function closeViewer(fromHistory = false) {
  if ($('viewer').hidden) return;
  setFull(false);
  $('viewer').hidden = true;
  document.body.classList.remove('viewing');
  viewer.observer?.disconnect();
  viewer.doc?.destroy();
  viewer.doc = viewer.blob = null;
  $('viewer-pages').replaceChildren();
  if (!fromHistory && history.state?.viewer) history.back();
}
$('viewer-close').addEventListener('click', () => closeViewer());
window.addEventListener('popstate', () => closeViewer(true));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('viewer').classList.contains('full')) setFull(false); else closeViewer();
});
$('viewer-save').addEventListener('click', async () => {
  if (!viewer.blob) return;
  const file = new File([viewer.blob], viewer.name, { type: 'application/pdf' });
  if (useShareSheet() && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: $('viewer-title').textContent }); } catch {}
    return;
  }
  const a = el('a');
  a.href = URL.createObjectURL(file);
  a.download = viewer.name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
});
// Print: each page is drawn as a picture sized to fit the paper, then the browser prints those.
// (Printing the PDF from a hidden frame came out zoomed in and cut off, at least in Safari.)
$('viewer-print').addEventListener('click', async () => {
  const doc = viewer.doc, btn = $('viewer-print');
  if (!doc) return;
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  const box = $('print-pdf');
  box.replaceChildren();
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const vp = pg.getViewport({ scale: 1600 / pg.getViewport({ scale: 1 }).width });
      const canvas = el('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const blob = await new Promise(ok => canvas.toBlob(ok, 'image/png'));
      const img = el('img');
      img.src = URL.createObjectURL(blob);
      img.alt = `Page ${i}`;
      box.append(img);
    }
    await Promise.all([...box.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
    document.body.classList.add('print-pdf');
    window.print();
  } catch {
    toast('Couldn’t get the pages ready to print. Try Download, then print the file.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Print';
  }
});
window.addEventListener('afterprint', () => {
  if (!document.body.classList.contains('print-pdf')) return;
  document.body.classList.remove('print-pdf');
  $('print-pdf').querySelectorAll('img').forEach(img => URL.revokeObjectURL(img.src));
  $('print-pdf').replaceChildren();
});

// Save every chart on this device (this gig's set first) so they open instantly, even at a gig with no signal.
async function keepChartsOffline() {
  if (!navigator.onLine || !('caches' in window)) return;
  const list = [...metSongs(currentShow()), ...songs()];
  for (const song of new Set(list)) {
    if (!song?.chart) continue;
    try {
      const cache = await caches.open('sos-charts');
      if (!(await cache.match(chartUrl(song)))) await cache.add(chartUrl(song));
    } catch {}
  }
}

/* Print the setlist on its own */
$('print-set-list').addEventListener('click', () => {
  const s = currentShow();
  if (!s) return;
  const box = $('print-setlist');
  box.replaceChildren(el('h1', null, `SOS Band · ${s.name}`), el('p', null, [fmtDate(s.date), fmtLength(s.length), s.venue].filter(Boolean).join(' · ')));
  let ol = el('ol');
  for (const id of s.setlist || []) {
    if (isBreak(id)) {
      ol.append(el('li', 'brk', 'Break'));
      continue;
    }
    if (isNote(id)) {
      const t = (s.setNotes || {})[id];
      if (t) ol.append(el('li', 'pnote', t));
      continue;
    }
    const song = get(id);
    if (!song) continue;
    const li = el('li', null, song.title);
    const extra = [get(leadFor(song, s))?.name, song.key && `key ${song.key}`].filter(Boolean).join(' · ');
    if (extra) li.append(el('small', null, extra));
    ol.append(li);
  }
  box.append(ol);
  document.body.classList.add('print-list');
  window.print();
});
window.addEventListener('afterprint', () => document.body.classList.remove('print-list'));
document.querySelectorAll('[data-print]').forEach(b => b.addEventListener('click', () => window.print()));

/* ---------- Member dialog ---------- */
let memberId = null;
$('me-kind').append(...KINDS.map(k => new Option(k.label, k.key)));
function gearRow(g = { item: '', qty: 1 }) {
  const li = el('li');
  const qty = el('input', 'qty');
  qty.type = 'number'; qty.min = 1; qty.value = g.qty || 1; qty.inputMode = 'numeric'; qty.setAttribute('aria-label', 'How many');
  const item = el('input');
  item.value = g.item; item.placeholder = 'e.g. DI Box'; item.setAttribute('list', 'gear-items'); item.setAttribute('aria-label', 'Item');
  const rm = el('button', 'rm', '✕'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove item');
  rm.addEventListener('click', () => li.remove());
  li.append(qty, item, rm);
  return li;
}
function openMember(id) {
  memberId = id;
  const m = id ? get(id) : { name: '', instrument: '', kind: 'vocal', gear: [{ item: 'Music Stand', qty: 1 }] };
  $('member-dlg-title').textContent = id ? m.name : 'New band member';
  $('me-name').value = m.name;
  $('me-inst').value = m.instrument || '';
  $('me-kind').value = m.kind || 'other';
  $('me-gear').replaceChildren(...(m.gear || []).map(gearRow));
  const known = new Set([...GEAR_ORDER, ...members().flatMap(x => (x.gear || []).map(g => g.item))]);
  $('gear-items').replaceChildren(...[...known].map(i => new Option(i)));
  $('me-delete').hidden = !id;
  $('me-delete').classList.remove('armed');
  $('me-delete').textContent = 'Remove from band';
  $('member-dlg').showModal();
}
$('member-new').addEventListener('click', () => openMember(null));
$('me-gear-add').addEventListener('click', () => { const r = gearRow(); $('me-gear').append(r); r.querySelector('input:not(.qty)').focus(); });
$('member-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('me-name').value.trim();
  if (!name) return;
  const gear = [...$('me-gear').children].map(li => {
    const [q, i] = li.querySelectorAll('input');
    return { item: i.value.trim(), qty: Math.max(1, Number(q.value) || 1) };
  }).filter(g => g.item);
  const id = memberId || uid('m');
  const old = get(id) || { order: members().length };
  put(id, { ...old, type: 'member', name, instrument: $('me-inst').value.trim(), kind: $('me-kind').value, gear });
  if (!memberId) {
    const s = currentShow();
    if (s) patchShow(v => { v.lineup = [...(v.lineup || []), { member: id, x: 50, y: 33 }]; });
    toast(`${name} added and put in the middle of the stage plot.`);
  }
  $('member-dlg').close();
});
$('me-delete').addEventListener('click', () => {
  const b = $('me-delete');
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again to remove'; return; }
  const name = get(memberId)?.name;
  remove(memberId);
  $('member-dlg').close();
  toast(`${name} removed from the band.`);
});

/* ---------- Shows dialog ---------- */
function openShows() {
  const cur = currentShow();
  const ul = $('shows');
  ul.replaceChildren();
  for (const s of shows()) {
    const li = el('li');
    const b = el('button');
    b.type = 'button';
    b.setAttribute('aria-current', s.id === cur?.id);
    b.append(el('span', null, s.name + (EDITOR && s.id === band().currentShow ? ' ★' : '')), el('span', 'd', [fmtDate(s.date, false), fmtLength(s.length)].filter(Boolean).join(' · ')));
    b.addEventListener('click', () => { lsSet(K.show, s.id); render(); openShows(); keepChartsOffline(); });
    li.append(b);
    ul.append(li);
  }
  if (cur) {
    $('sh-name').value = cur.name;
    $('sh-date').value = cur.date || '';
    $('sh-venue').value = cur.venue || '';
    $('sh-host').value = cur.host || '';
    $('sh-length').value = cur.length || '';
  }
  $('sh-band').disabled = !cur || cur.id === band().currentShow;
  $('sh-band').textContent = cur && cur.id === band().currentShow ? '★ The band app opens on this gig' : '★ Make the band app open on this gig';
  $('sh-delete').classList.remove('armed');
  $('sh-delete').textContent = 'Delete gig';
  $('sh-delete').disabled = shows().length < 2;
  if (!$('show-dlg').open) $('show-dlg').showModal();
}
$('show-open').addEventListener('click', openShows);
$('sh-band').addEventListener('click', () => {
  const cur = currentShow();
  if (!cur) return;
  put('band', { ...band(), currentShow: cur.id });
  openShows();
  toast(`The band app now opens on ${cur.name}.`);
});
$('show-form').addEventListener('submit', e => {
  e.preventDefault();
  patchShow(v => { v.name = $('sh-name').value.trim() || v.name; v.date = $('sh-date').value; v.venue = $('sh-venue').value.trim(); v.host = $('sh-host').value.trim();
    const len = Math.round(Number($('sh-length').value));
    v.length = len > 0 ? Math.min(len, 600) : 0; });
  openShows();
  toast('Gig saved.');
});
$('sh-copy').addEventListener('click', () => {
  const cur = currentShow();
  if (!cur) return;
  const id = uid('show');
  const { id: _x, updatedAt, ...copy } = structuredClone(cur);
  put(id, { ...copy, name: 'New show', date: '' });
  lsSet(K.show, id);
  openShows();
  $('sh-name').focus();
  $('sh-name').select();
  toast('Copied the stage plot, setlist, gear and mixers. Give it a name and date.');
});
$('sh-delete').addEventListener('click', () => {
  const b = $('sh-delete'), cur = currentShow();
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again to delete'; return; }
  remove(cur.id);
  lsSet(K.show, null);
  const next = shows()[0];
  if (next && band().currentShow === cur.id) put('band', { ...band(), currentShow: next.id });
  openShows();
  toast(`Deleted “${cur.name}”.`);
});

document.querySelectorAll('dialog').forEach(d => {
  // (Not just after dragging a knob or fader: letting go outside the pop-up mustn't close it.)
  d.addEventListener('click', e => { if (e.target === d && !dragging) d.close(); });
  d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
});

/* ---------- Metronome ----------
   Clicks are scheduled ahead on the Web Audio clock so they stay steady; the flashing follows the same clock.
   Silent mode schedules no sound, only the flashes. Tempos are saved on each song (song.bpm). */
// Perform's state (see Perform below); here because the metronome reads its Silent switch.
const pf = { silent: true, songs: [], i: 0, page: 1, docs: new Map(), cache: new Map(), lock: null, token: 0, barTimer: null };
const BPM_MIN = 30, BPM_MAX = 260;
const cleanBpm = v => { const n = Math.round(Number(v)); return n >= BPM_MIN && n <= BPM_MAX ? n : null; };
const met = Object.assign({ bpm: 120, beats: 4, silent: true, song: null }, (() => { try { return JSON.parse(lsGet(K.met)) || {}; } catch { return {}; } })());
let metCtx = null, metOn = false, metNext = 0, metBeat = 0, metTimer = null, metQueue = [], metLock = null, metAudio = false, metRun = 0;
const saveMet = () => lsSet(K.met, JSON.stringify({ bpm: met.bpm, beats: met.beats, silent: met.silent, song: met.song }));
// The songs in this gig's set, in order (breaks and notes left out).
const metSongs = s => (s?.setlist || []).filter(id => !isBreak(id) && !isNote(id) && get(id)).map(get);

function metClick(t, accent) {
  const o = metCtx.createOscillator(), g = metCtx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(accent ? 1760 : 1175, t);
  o.frequency.exponentialRampToValueAtTime(accent ? 1100 : 750, t + 0.04);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.55, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g).connect(metCtx.destination);
  o.start(t);
  o.stop(t + 0.07);
}
function metSchedule() {
  // If the page was too busy to schedule in time (an iPad drawing a chart in Perform), skip the beats already
  // missed instead of playing them all at once, which put the high click on beat 2 or 3 (David, 2026-10-25).
  if (!metOn) return;
  while (metNext < metNow()) {
    metNext += 60 / met.bpm;
    metBeat = (metBeat + 1) % met.beats;
  }
  while (metNext < metNow() + 0.12) {
    // Perform's little metronome has its own Silent switch (on each time Perform opens).
    if (metAudio && !($('perform').hidden ? met.silent : pf.silent)) metClick(metNext, metBeat === 0 && met.beats > 1);
    metQueue.push({ t: metNext, beat: metBeat });
    metNext += 60 / met.bpm;
    metBeat = (metBeat + 1) % met.beats;
  }
}
function metDraw() {
  if (!metOn) return;
  let hit = null;
  while (metQueue.length && metQueue[0].t <= metNow()) hit = metQueue.shift();
  if (hit) {
    // Only beat 1 of each bar flashes (David); the beat lights still step every beat.
    if (hit.beat === 0) for (const box of [$('met-box'), $('pf-met')]) {
      box.classList.remove('flash', 'flash1');
      void box.offsetWidth;   // restart the flash animation
      box.classList.add('flash1');
    }
    document.querySelectorAll('#met-dots i, #pf-dots i').forEach(d => d.classList.toggle('on', d.dataset.n == hit.beat));
  }
  requestAnimationFrame(metDraw);
}
// The beats run on the sound card's clock when it is working, otherwise on the page's own clock (flashes only).
const metNow = () => (metAudio ? metCtx.currentTime : performance.now() / 1000);
// iPad Safari puts the sound to sleep ("interrupted") after the screen locks, another app plays, etc., and
// waking it up again can hang for ever: Start then gave no sound AND no flashing (David, rehearsal 2026-10-26).
// So every Start that finds it asleep makes a fresh one, right there in the tap, and never waits on it.
function metAudioUp() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}   // play even when the iPad is muted
  if (metCtx?.state !== 'running') {
    try { metCtx?.close().catch(() => {}); } catch {}
    metCtx = null;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.addEventListener('statechange', () => { if (ctx === metCtx) metAudioLost(); });
      metCtx = ctx;
    } catch { return; }
  }
  metCtx.resume().catch(() => {});
  try {   // a silent blip, played in the tap, is what lets iPad Safari make sound
    const b = metCtx.createBufferSource();
    b.buffer = metCtx.createBuffer(1, 1, metCtx.sampleRate);
    b.connect(metCtx.destination);
    b.start();
  } catch {}
}
// The sound went to sleep while running (a call, Siri…): keep flashing on the page's clock.
function metAudioLost() {
  if (!metOn || !metAudio || metCtx?.state === 'running') return;
  metAudio = false;
  metQueue = [];
  metNext = metNow() + 0.05;
  toast('The sound stopped. Tap Stop, then Start, to bring it back.');
}
function metStart() {
  metAudioUp();
  const run = ++metRun;
  metAudio = false;
  metOn = true;   // straight away, so the button shows Stop and a second tap stops it
  metMarks();
  try { navigator.wakeLock?.request('screen').then(l => { if (metOn && run === metRun) metLock = l; else l.release(); }).catch(() => {}); } catch {}   // keep the screen on while it runs
  // Give the sound a moment to wake up; if it doesn't, the flashes still start on time.
  const t0 = performance.now();
  (function go() {
    if (!metOn || run !== metRun) return;
    const ready = metCtx?.state === 'running' && metCtx.currentTime > 0;
    if (!ready && performance.now() - t0 < 300) { setTimeout(go, 15); return; }
    metAudio = ready;
    if (!ready) toast('No sound on this device just now, so it is flashing only. Tap Stop, then Start, to try again.');
    metBeat = 0;
    metQueue = [];
    metNext = metNow() + 0.08;
    metSchedule();
    metTimer = setInterval(metSchedule, 25);
    requestAnimationFrame(metDraw);
  })();
}
function metStop() {
  metOn = false;
  metRun++;
  clearInterval(metTimer);
  metTimer = null;
  metQueue = [];
  metLock?.release().catch(() => {});
  metLock = null;
  $('met-box').classList.remove('flash', 'flash1');
  $('pf-met').classList.remove('flash', 'flash1');
  document.querySelectorAll('#met-dots i, #pf-dots i').forEach(d => d.classList.remove('on'));
  metMarks();
}
function setBpm(v) {
  const n = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(v)));
  if (!n) return;
  met.bpm = n;
  saveMet();
  metMarks();
}
// Everything on the metronome screen except the song list.
function metMarks() {
  $('met-bpm').textContent = met.bpm;
  $('met-slider').value = met.bpm;
  $('met-start').textContent = metOn ? 'Stop' : 'Start';
  $('met-start').classList.toggle('on', metOn);
  $('pf-bpm').textContent = met.bpm;
  $('pf-start').textContent = metOn ? 'Stop' : 'Start';
  $('pf-start').classList.toggle('on', metOn);
  $('pf-silent').setAttribute('aria-pressed', pf.silent);
  document.querySelectorAll('#met-mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.silent === '1') === String(met.silent)));
  document.querySelectorAll('#met-beats button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.beats) === met.beats));
  for (const dots of [$('met-dots'), $('pf-dots')])
    if (dots.children.length !== met.beats) dots.replaceChildren(...Array.from({ length: met.beats }, (_, n) => { const d = el('i'); d.dataset.n = n; return d; }));
  const list = metSongs(currentShow());
  const i = list.findIndex(x => x.id === met.song);
  const song = list[i];
  $('met-song').textContent = song ? `${i + 1}. ${song.title}` : 'No song picked';
  $('met-song').classList.toggle('none', !song);
  $('met-prev').disabled = !list.length || i === 0;
  $('met-next').disabled = !list.length || i === list.length - 1;
  document.querySelectorAll('#met-list li[data-id]').forEach(li => li.classList.toggle('cur', li.dataset.id === met.song));
}
function pickSong(id) {
  const song = get(id);
  if (!song) return;
  met.song = id;
  if (song.bpm) setBpm(song.bpm); else { saveMet(); metMarks(); }
}
function stepSong(d) {
  const list = metSongs(currentShow());
  const i = list.findIndex(x => x.id === met.song);
  const next = list[i < 0 ? 0 : i + d];
  if (next) pickSong(next.id);
}
function renderMet(s) {
  const wrap = $('met-list');
  wrap.replaceChildren();
  const ids = (s?.setlist || []).filter(inSet).filter(id => !isNote(id));
  $('met-empty').hidden = ids.some(id => !isBreak(id));
  let list = el('ol', 'setlist met-songs'), n = 0;
  ids.forEach(id => {
    if (isBreak(id)) {
      if (list.children.length) wrap.append(list);
      list = el('ol', 'setlist met-songs');
      return;
    }
    const song = get(id);
    const li = el('li');
    li.dataset.id = id;
    li.append(el('span', 'num', ++n));
    const btn = el('button', 'song-btn');
    btn.type = 'button';
    const txt = el('span', 'song-txt');
    txt.append(el('span', 'song-title', song.title), el('span', 'song-artist', song.artist || ''));
    btn.append(txt);
    btn.addEventListener('click', () => pickSong(id));
    li.append(btn);
    if (canEdit()) {
      const inp = el('input', 'bpm-input');
      inp.type = 'number';
      inp.inputMode = 'numeric';
      inp.min = BPM_MIN; inp.max = BPM_MAX;
      inp.placeholder = 'BPM';
      inp.value = song.bpm || '';
      inp.setAttribute('aria-label', `Tempo of ${song.title}`);
      inp.addEventListener('change', () => {
        const bpm = cleanBpm(inp.value);
        if (inp.value && !bpm) { inp.value = song.bpm || ''; toast(`Tempos go from ${BPM_MIN} to ${BPM_MAX} BPM.`); return; }
        put(id, { ...get(id), bpm });
        if (met.song === id && bpm) setBpm(bpm);
      });
      li.append(inp);
    } else {
      li.append(el('span', 'bpm-tag' + (song.bpm ? '' : ' none'), song.bpm ? `${song.bpm}` : '—'));
    }
    list.append(li);
  });
  if (list.children.length) wrap.append(list);
  wrap.classList.toggle('multi', wrap.children.length > 1);
  metMarks();
}
$('met-start').addEventListener('click', () => (metOn ? metStop() : metStart()));
$('met-minus').addEventListener('click', () => setBpm(met.bpm - 1));
$('met-plus').addEventListener('click', () => setBpm(met.bpm + 1));
$('met-slider').addEventListener('input', e => setBpm(Number(e.target.value)));
$('met-prev').addEventListener('click', () => stepSong(-1));
$('met-next').addEventListener('click', () => stepSong(1));
document.querySelectorAll('#met-mode button').forEach(b => b.addEventListener('click', () => { met.silent = b.dataset.silent === '1'; saveMet(); metMarks(); }));
document.querySelectorAll('#met-beats button').forEach(b => b.addEventListener('click', () => {
  met.beats = Number(b.dataset.beats);
  metBeat = 0;
  saveMet();
  metMarks();
}));
// Tap tempo: the average of the last few taps; a pause of 2 seconds starts over.
// Taps count on touch-down (not on release) so they land on the beat.
function tapTempo(btn, onBpm) {
  let taps = [];
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps = [...taps, now].slice(-6);
    btn.classList.remove('tapped');
    void btn.offsetWidth;
    btn.classList.add('tapped');
    if (taps.length > 1) onBpm(Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1))))));
  });
}
tapTempo($('met-tap'), setBpm);
tapTempo($('se-tap'), bpm => { $('se-bpm').value = bpm; });
// The icon opens the metronome like a section; tapping it again goes back to where you were.
let metFrom = 'set';
$('met-open').addEventListener('click', () => {
  if (tab === 'met') tab = metFrom; else { metFrom = tab; tab = 'met'; }
  lsSet(K.tab, tab);
  showTab();
});
// Leaving the app stops it, so it never keeps clicking in a pocket.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && metOn) metStop(); });
metMarks();

/* ---------- Perform ----------
   The set's charts full screen, one page at a time: tap the right side for the next page, the left side for the one
   before (straight on into the next song), the middle for the bar (Close, pick a song, metronome). Arrow keys and
   page-turner pedals work too. The screen stays on, and the little metronome follows the song on screen.
   On its side (iPad, TV, computer, not a phone) it shows two pages side by side; each song starts on the left, and
   pf.page is then the left page of the two (David, 2026-11-01). */
const PF_GAP = 12;
const pfTwo = () => { const b = $('pf-stage'); return b.clientWidth > b.clientHeight && b.clientHeight >= 500; };
function pfDoc(song) {
  if (!song?.chart) return Promise.resolve(null);
  if (!pf.docs.has(song.id)) pf.docs.set(song.id, (async () => {
    await loadScript('vendor/pdf.min.js', 'pdfjsLib');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const res = await fetch(chartUrl(song));
    if (!res.ok) throw new Error('missing');
    return pdfjsLib.getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
  })().catch(() => { pf.docs.delete(song.id); return 'failed'; }));
  return pf.docs.get(song.id);
}
// Let go of drawn pages (all, or the oldest beyond the last 5). iPad Safari has little room for drawn pages and
// slows right down when it runs out, so a forgotten page is emptied straight away instead of waiting to be cleaned up.
function pfForget(keep = 0) {
  while (pf.cache.size > keep) {
    const [k, job] = pf.cache.entries().next().value;
    pf.cache.delete(k);
    job.then(c => { if (!c.isConnected) c.width = c.height = 0; }).catch(() => {});
  }
}
// One page drawn as big as fits the screen (sharp on Retina screens). Kept for a moment so turning back is instant.
async function pfDraw(doc, n, key) {
  const box = $('pf-stage'), W = pfTwo() ? (box.clientWidth - PF_GAP) / 2 : box.clientWidth, H = box.clientHeight, k = `${key}:${n}:${W}x${H}`;
  if (pf.cache.has(k)) return pf.cache.get(k);
  const job = (async () => {
    const pg = await doc.getPage(n);
    const one = pg.getViewport({ scale: 1 });
    const fit = Math.min(W / one.width, H / one.height);
    const vp = pg.getViewport({ scale: fit * Math.min(devicePixelRatio || 1, 2.5) });
    const c = el('canvas');
    c.width = vp.width; c.height = vp.height;
    c.style.width = `${Math.floor(one.width * fit)}px`; c.style.height = `${Math.floor(one.height * fit)}px`;
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c;
  })();
  pf.cache.set(k, job);
  pfForget(pfTwo() ? 6 : 5);
  return job;
}
async function pfShow() {
  const t = ++pf.token, song = pf.songs[pf.i];
  $('pf-song').value = song.id;
  if (met.song !== song.id) pickSong(song.id);
  $('pf-met-song').textContent = song.bpm ? song.title : `${song.title}: no tempo saved`;
  const doc = await pfDoc(song);
  if (t !== pf.token) return;
  const msg = $('pf-msg'), page = $('pf-page');
  if (!doc || doc === 'failed') {
    pf.page = 1;
    page.replaceChildren();
    msg.replaceChildren(el('b', null, song.title), el('span', null, [song.key && `Key ${song.key}`, song.bpm && `${song.bpm} BPM`].filter(Boolean).join(' · ')),
      el('span', 'pf-dim', doc ? 'Couldn’t load this chart. Check the connection.' : 'No chart for this song.'));
    msg.hidden = false;
    $('pf-count').textContent = `Song ${pf.i + 1} of ${pf.songs.length}`;
    return;
  }
  if (pf.page < 1 || pf.page > doc.numPages) pf.page = pf.page < 1 ? doc.numPages : 1;   // -1 = its last page
  const step = pfTwo() ? 2 : 1;
  if (step === 2) pf.page -= (pf.page - 1) % 2;   // two at a time: 1–2, 3–4, …
  const last = Math.min(pf.page + step - 1, doc.numPages);
  $('pf-count').textContent = `Song ${pf.i + 1} of ${pf.songs.length} · page ${pf.page === last ? pf.page : `${pf.page}–${last}`} of ${doc.numPages}`;
  try {
    const cs = await Promise.all(Array.from({ length: last - pf.page + 1 }, (_, n) => pfDraw(doc, pf.page + n, song.id)));
    if (t !== pf.token) return;
    msg.hidden = true;
    page.replaceChildren(...cs);
  } catch { if (t === pf.token) { msg.replaceChildren(el('b', null, song.title), el('span', 'pf-dim', 'Couldn’t show this page.')); msg.hidden = false; } }
  // Get the next page(s) (or the next song's first) ready in the background.
  const nextSong = pf.songs[pf.i + 1];
  if (last < doc.numPages) for (let n = last + 1; n <= Math.min(last + step, doc.numPages); n++) pfDraw(doc, n, song.id).catch(() => {});
  else if (nextSong) pfDoc(nextSong).then(d => {
    if (d && d !== 'failed') for (let n = 1; n <= Math.min(step, d.numPages); n++) pfDraw(d, n, nextSong.id).catch(() => {});
  }).catch(() => {});
}
async function pfStep(d) {
  const doc = await pfDoc(pf.songs[pf.i]);
  const pages = doc && doc !== 'failed' ? doc.numPages : 1, step = pfTwo() ? 2 : 1;
  if (d > 0) {
    if (pf.page + step <= pages) pf.page += step;
    else if (pf.i < pf.songs.length - 1) { pf.i++; pf.page = 1; }
    else { toast('That’s the end of the set.'); return; }
  } else {
    if (pf.page > 1) pf.page = Math.max(1, pf.page - step);
    else if (pf.i > 0) { pf.i--; pf.page = -1; }
    else return;
  }
  pfShow();
}
function pfBar(show) {
  clearTimeout(pf.barTimer);
  $('pf-bar').classList.toggle('show', show);
}
async function pfWake() {
  try { pf.lock = await navigator.wakeLock?.request('screen'); } catch {}
}
function openPerform() {
  pf.songs = metSongs(currentShow());
  if (!pf.songs.length) { toast('No songs in this set yet.'); return; }
  const sel = $('pf-song');
  sel.replaceChildren(...pf.songs.map((x, n) => new Option(`${n + 1}. ${x.title}${x.bpm ? ` · ${x.bpm}` : ''}`, x.id)));
  pf.i = 0; pf.page = 1; pfForget();
  pf.silent = true;   // on stage the little metronome starts silent (David)
  const v = $('perform');
  v.hidden = false;
  document.body.classList.add('viewing');
  (v.requestFullscreen || v.webkitRequestFullscreen)?.call(v)?.catch?.(() => {});
  if (history.state?.perform !== true) history.pushState({ perform: true }, '');
  pfWake();
  pfShow();
  // Open the rest of the set's charts in the background, one at a time, so no song waits when you get to it.
  const t = pf.token;
  (async () => { for (const song of pf.songs) { if (pf.token < t || $('perform').hidden) return; await pfDoc(song); } })();
  pfBar(true);
  pf.barTimer = setTimeout(() => pfBar(false), 3500);
}
function closePerform(fromHistory = false) {
  if ($('perform').hidden) return;
  $('perform').hidden = true;
  $('pf-met').hidden = true;
  document.body.classList.remove('viewing');
  if (metOn) metStop();
  pf.lock?.release().catch(() => {});
  pf.lock = null;
  pf.token++;
  $('pf-page').replaceChildren();
  pfForget();
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
  if (!fromHistory && history.state?.perform) history.back();
}
$('perform-open').addEventListener('click', openPerform);
$('pf-close').addEventListener('click', () => closePerform());
window.addEventListener('popstate', () => closePerform(true));
$('pf-stage').addEventListener('click', e => {
  const x = e.clientX / $('pf-stage').clientWidth;
  if (x < 0.35) pfStep(-1);
  else if (x > 0.65) pfStep(1);
  else pfBar(!$('pf-bar').classList.contains('show'));
});
$('pf-song').addEventListener('change', e => {
  pf.i = Math.max(0, pf.songs.findIndex(x => x.id === e.target.value));
  pf.page = 1;
  pfShow();
});
document.addEventListener('keydown', e => {
  if ($('perform').hidden || e.target.closest?.('select, input') || (e.key === ' ' && e.target.closest?.('button'))) return;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); pfStep(1); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); pfStep(-1); }
  else if (e.key === 'Escape') closePerform();
});
window.addEventListener('resize', () => { if (!$('perform').hidden) { pfForget(); pfShow(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('perform').hidden) pfWake(); });
// The little metronome in the corner: the song's tempo is already set, so Start counts it in.
$('pf-met-open').addEventListener('click', () => { metMarks(); $('pf-met').hidden = !$('pf-met').hidden; });
$('pf-met-close').addEventListener('click', () => { $('pf-met').hidden = true; if (metOn) metStop(); });
$('pf-minus').addEventListener('click', () => setBpm(met.bpm - 1));
$('pf-plus').addEventListener('click', () => setBpm(met.bpm + 1));
$('pf-silent').addEventListener('click', () => { pf.silent = !pf.silent; metMarks(); });
$('pf-start').addEventListener('click', () => (metOn ? metStop() : metStart()));
tapTempo($('pf-tap'), setBpm);

/* ---------- Toast ---------- */
let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

/* ---------- Sync with GitHub (same approach as GE150 Presets) ----------
   On open, and shortly after each edit, download data.json, merge record by record (newest
   change wins), and upload the result when editing is on. Without a key: view only. */
class SyncError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }   // 'auth' | 'offline' | 'conflict' | 'other'
}
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
async function github(path, options = {}, token = lsGet(K.token)) {
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${DATA_REPO}${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('offline', 'No connection. Changes are saved here and will sync when you’re back online.');
  }
  if (token && res.status === 401) throw new SyncError('auth', 'The access key isn’t working (expired or mistyped).');
  if (token && res.status === 403) throw new SyncError('auth', 'Your access key can read but not save. On GitHub, edit the key: give it sos-band-data with Contents set to “Read and write”.');
  if (!token && (res.status === 403 || res.status === 429)) throw new SyncError('offline', 'GitHub is busy. Will try again shortly.');
  return res;
}
// Viewers read without a key; editors read through the API with theirs.
async function download(token) {
  if (!token) {
    // Read straight from GitHub so edits show up within seconds. ("no-cache" re-checks with GitHub each time;
    // unchanged answers don't count against GitHub's limit of 60 reads an hour.)
    try {
      const res = await fetch(`https://api.github.com/repos/${DATA_REPO}/contents/${DATA_FILE}`,
        { cache: 'no-cache', headers: { Accept: 'application/vnd.github.raw+json' } });
      if (res.ok) return { data: await res.json(), sha: null };
    } catch {}
    // Backup: the published copy, which can lag a few minutes behind.
    let res;
    try { res = await fetch(`${CHART_BASE}${DATA_FILE}?t=${Date.now()}`, { cache: 'no-store' }); }
    catch { throw new SyncError('offline', 'No connection.'); }
    if (!res.ok) throw new SyncError('offline', 'Couldn’t load the latest.');
    return { data: await res.json(), sha: null };
  }
  const res = await github(`/contents/${DATA_FILE}`, {}, token);
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) throw new SyncError('other', `GitHub said ${res.status} when downloading.`);
  const body = await res.json();
  return { data: JSON.parse(fromBase64(body.content)), sha: body.sha };
}
const device = () => (/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Macintosh/.test(navigator.userAgent) ? 'Mac' : 'device');
async function upload(data, sha) {
  const res = await github(`/contents/${DATA_FILE}`, {
    method: 'PUT',
    body: JSON.stringify({ message: `Sync from ${device()}`, content: toBase64(JSON.stringify(data, null, 2) + '\n'), ...(sha ? { sha } : {}) }),
  });
  if (res.status === 409 || res.status === 422) throw new SyncError('conflict', 'Changed on another device at the same moment.');
  if (!res.ok) throw new SyncError('other', `GitHub said ${res.status} when uploading.`);
}
async function uploadChart(file, name) {
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error('Choose a PDF file.');
  if (file.size > 20e6) throw new Error('That PDF is over 20 MB. Try a smaller one.');
  const path = `charts/${name}.pdf`;
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const existing = await github(`/contents/${encodeURI(path)}`);
  const sha = existing.ok ? (await existing.json()).sha : undefined;
  const res = await github(`/contents/${encodeURI(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message: `Chart: ${name}`, content: btoa(bin), ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new Error(`GitHub said ${res.status} when uploading the chart.`);
  return path;
}
function merge(local, remote) {
  const out = { ...local };
  for (const [id, r] of Object.entries(remote)) {
    const l = out[id];
    if (!l || (r.updatedAt || '') >= (l.updatedAt || '')) out[id] = r;
  }
  return out;
}
const canon = s => JSON.stringify(Object.keys(s || {}).sort().map(k => [k, s[k]]));
function replaceLocal(next) { items = next; saveLocal(); renderWhenFree(); }

const sync = {
  status: 'idle',
  message: '',
  isOn: () => Boolean(lsGet(K.token)),
  set(status, message = '') {
    const was = this.status;
    this.status = status; this.message = message;
    renderSync();
    if (EDITOR && (was === 'auth') !== (status === 'auth')) render();
  },
  async run(first = false) {
    if (this.running) { this.again = true; return; }
    this.running = true;
    const on = this.isOn();
    if (on) this.set('syncing');
    try {
      for (let attempt = 1; ; attempt++) {
        const { data, sha } = await download(on ? lsGet(K.token) : null);
        const remote = data && data.items ? data.items : null;
        if (!on) {
          // Band app: always show the published copy. Editor with no key: only fill an empty device.
          if (remote && (!EDITOR || !Object.keys(items).length) && canon(remote) !== canon(items)) replaceLocal(remote);
          break;
        }
        const merged = merge(items, remote || {});
        if (canon(merged) !== canon(items)) replaceLocal(merged);
        if (remote && canon(merged) === canon(remote)) break;
        try { await upload({ app: 'sos-band', format: 1, items: merged }, sha); break; }
        catch (e) { if (e.kind !== 'conflict' || attempt >= 3) throw e; first = false; }
      }
      if (on) { lsSet(K.last, new Date().toISOString()); this.set('ok'); } else this.set('view');
      if (EDITOR) renderWhenFree();
    } catch (e) {
      this.set(e.kind || 'other', e.message);
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.run(); }
    }
  },
  soon() {
    if (!this.isOn()) { render(); return; }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), 1500);
  },
  async connect(token) {
    await download(token);
    const res = await github('', {}, token);
    const repo = res.ok ? await res.json() : null;
    if (repo && repo.permissions && !repo.permissions.push) throw new SyncError('auth', 'That key can read but not change sos-band-data.');
    lsSet(K.token, token);
    lsSet(K.last, null);
    render();
    await this.run();
  },
  disconnect() { lsSet(K.token, null); lsSet(K.last, null); render(); },
};

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  const days = Math.floor(mins / (24 * 60));
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
function renderSync() {
  const on = sync.isOn();
  $('sync-on').hidden = !on;
  $('sync-form').hidden = on;
  const problem = on && ['auth', 'other', 'conflict'].includes(sync.status);
  $('settings-open').classList.toggle('alert', problem);
  if (!on) return;
  const s = $('sync-status'), last = lsGet(K.last);
  s.className = 'cap';
  if (sync.status === 'syncing') s.textContent = 'Syncing…';
  else if (sync.status === 'ok') { s.textContent = `✓ Editing on · up to date · synced ${timeAgo(last)}`; s.classList.add('ok'); }
  else if (sync.status === 'offline') s.textContent = sync.message + (last ? ` Last synced ${timeAgo(last)}.` : '');
  else if (problem) { s.textContent = sync.message; s.classList.add('problem'); }
  else s.textContent = last ? `Last synced ${timeAgo(last)}` : 'Not synced yet';
}
$('sync-form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('sync-error'), btn = $('sync-connect');
  const token = $('sync-token').value.trim();
  err.hidden = true;
  if (!token) { err.textContent = 'Paste the access key.'; err.hidden = false; return; }
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    await sync.connect(token);
    $('sync-token').value = '';
    toast(sync.status === 'ok' ? 'Connected. You can edit on this device.' : sync.message);
  } catch (ex) {
    err.textContent = ex.message || 'Couldn’t connect.';
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect';
  }
});
$('sync-now').addEventListener('click', () => sync.run());
$('sync-disconnect').addEventListener('click', () => {
  const b = $('sync-disconnect');
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tap again to turn off'; return; }
  b.classList.remove('armed');
  b.textContent = 'Turn off editing here';
  sync.disconnect();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.run(); });
window.addEventListener('online', () => sync.run());
setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) sync.run(); }, 2 * 60 * 1000);

/* ---------- Settings ---------- */
function markTheme() {
  const cur = savedTheme();
  document.querySelectorAll('[data-theme-v]').forEach(b => b.setAttribute('aria-pressed', b.dataset.themeV === cur));
}
document.querySelectorAll('[data-theme-v]').forEach(b => b.addEventListener('click', () => {
  lsSet(K.theme, b.dataset.themeV);
  applyTheme(b.dataset.themeV);
  markTheme();
}));
$('settings-open').addEventListener('click', () => {
  markTheme();
  renderSync();
  $('ver-line').textContent = `You're on ${window.APP_VERSION}.`;
  $('set-update').disabled = false;
  $('settings').showModal();
});
$('nokey-settings').addEventListener('click', () => $('settings-open').click());
$('settings-close').addEventListener('click', () => $('settings').close());
$('set-update').addEventListener('click', async () => {
  const ver = $('ver-line'), ub = $('set-update'), reg = window.SW_REG;
  if (!reg || !navigator.onLine) { ver.textContent = 'Connect to the internet, then try again.'; return; }
  ub.disabled = true;
  ver.textContent = 'Checking…';
  try { await reg.update(); } catch {}
  const w = reg.waiting || reg.installing;
  if (w) {
    ver.textContent = 'Updating now…';
    const go = () => w.postMessage('skipWaiting');
    if (w.state === 'installed') go();
    else w.addEventListener('statechange', () => { if (w.state === 'installed') go(); });
  } else {
    ver.textContent = `You're on the latest version (${window.APP_VERSION}).`;
    ub.disabled = false;
  }
});

showTab();
render();
sync.run().then(keepChartsOffline);
