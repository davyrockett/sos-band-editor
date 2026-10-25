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
const CHART_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'https://davyrockett.github.io/sos-band-data/'
  : `${location.origin}/sos-band-data/`;
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
  $('show-date').textContent = s ? fmtDate(s.date, false) : '';
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
  $('set-count').textContent = s ? `${nSongs} song${nSongs === 1 ? '' : 's'}${nSets > 1 ? ` in ${nSets} sets` : ''} · ${s.name}` : '';
  $('set-empty').hidden = ids.length > 0;
  wrap.hidden = !ids.length;
  $('print-set-charts').disabled = !nSongs;
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
    btn.append(txt, memberChip(song.lead), el('span', 'keytag', song.key || ''));
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
    const after = order();
    if (after !== before) patchShow(x => { x.setlist = after.split('|'); });
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
  $('plot-sub').textContent = s ? [s.name, fmtDate(s.date), s.venue, s.host].filter(Boolean).join('  |  ') : '';
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
  const r = $('stage').getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY;
  const x0 = parseFloat(card.style.left), y0 = parseFloat(card.style.top);
  let x = x0, y = y0;
  card.classList.add('dragging');
  card.setPointerCapture?.(e.pointerId);
  const move = ev => {
    x = Math.max(6, Math.min(94, x0 + (ev.clientX - sx) / r.width * 100));
    y = Math.max(0, Math.min(85, y0 + (ev.clientY - sy) / r.height * 100));
    card.style.left = x + '%';
    card.style.top = y + '%';
  };
  const up = () => {
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerup', up);
    card.removeEventListener('pointercancel', up);
    card.classList.remove('dragging');
    if (Math.abs(x - x0) + Math.abs(y - y0) <= 0.3) { openMember(memberId); return; }
    patchShow(s => {
      const l = s.lineup.find(v => v.member === memberId);
      if (l) { l.x = Math.round(x * 10) / 10; l.y = Math.round(y * 10) / 10; }
    });
  };
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
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
  return s.mix?.setup === 'two' ? [
    { item: 'Mackie Mixer (8-ch)', how: 'A: instruments, B: vocals + master', qty: 2 },
    { item: 'Power Cables (Mixers)', how: '1 per mixer', qty: 2 },
    { item: 'Cables (Mixer A → Mixer B ch 7–8)', how: 'Stereo submix, L + R', qty: 2 },
  ] : [
    { item: 'Mixer (10-ch)', how: '', qty: 1 },
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
   The channels come from who's on the stage plot: each Mic and DI Box in a player's gear needs one.
   Default: one 10-channel mixer. Or two 8-channel mixers: A takes the instruments, and its main out
   goes in stereo into channels 7–8 of B, which takes the vocals and feeds the PA.
   show.mix = { setup: 'one' | 'two', ch: { '1': key, 'A1': key, 'B3': key… }, known: [keys], out }
   key = 'memberId|mic|0', 'memberId|di|0', or 'text:…' (anything else typed in). Until a channel is set,
   inputs fill the channels in stage order (left to right), vocals first. After that, only new inputs
   (not in `known`) go on the first spare channel; the page warns when an input has no channel or two. */
const MIX = {
  one: [{ id: '', name: 'Mixer', role: '10 channels, out to the PA', n: 10 }],
  two: [{ id: 'A', name: 'Mixer A', role: 'Instrument submix, 8 channels', n: 8 },
    { id: 'B', name: 'Mixer B', role: 'Vocals + master, 8 channels', n: 6, ret: true }],
};
function mixInputs(s) {
  const on = (s.lineup || []).map(l => ({ ...l, m: get(l.member) })).filter(l => l.m).sort((a, b) => a.x - b.x);
  const out = [];
  for (const type of ['mic', 'di']) for (const { m } of on) {
    const n = (m.gear || []).filter(g => g.item === (type === 'mic' ? 'Mic' : 'DI Box')).reduce((t, g) => t + (g.qty || 1), 0);
    const inst = (m.instrument || kindOf(m.kind).label).split('/')[0].trim();
    for (let i = 0; i < n; i++) {
      const what = type === 'mic' ? 'Vox' + (n > 1 ? ` ${i + 1}` : '') : `${inst} (DI${n > 1 ? ` ${i + 1}` : ''})`;
      out.push({ key: `${m.id}|${type}|${i}`, m, type, what });
    }
  }
  return out;
}
function mixLayout(s) {
  const mix = s.mix || {};
  const setup = mix.setup === 'two' ? 'two' : 'one';
  const slots = MIX[setup].flatMap(x => Array.from({ length: x.n }, (_, i) => x.id + (i + 1)));
  const inputs = mixInputs(s);
  const byKey = new Map(inputs.map(i => [i.key, i]));
  const saved = mix.ch || {};
  const pinned = slots.some(c => c in saved);
  // The inputs there were when the channels were last set (older saves: whatever was on a channel or left off).
  const known = new Set(mix.known || [...Object.values(saved), ...(mix.off || [])]);
  const at = {};
  for (const c of slots) {
    const k = saved[c];
    if (k?.startsWith('text:') || byKey.has(k)) at[c] = k;
  }
  // On two mixers, instruments go on A and vocals on B, spilling onto the other one when it's full.
  const onA = slots.filter(c => c[0] === 'A'), onB = slots.filter(c => c[0] === 'B');
  for (const inp of inputs) {
    if (slots.some(c => at[c] === inp.key) || (pinned && known.has(inp.key))) continue;
    const order = setup === 'one' ? slots : inp.type === 'mic' ? [...onB, ...onA] : [...onA, ...onB];
    const c = order.find(x => !at[x]);
    if (c) at[c] = inp.key;
  }
  const where = key => slots.filter(c => at[c] === key);
  return {
    setup, slots, at, byKey, where, pinned,
    none: inputs.filter(i => !where(i.key).length),
    twice: inputs.filter(i => where(i.key).length > 1),
    full: slots.every(c => at[c]),
    out: mix.out ?? ((s.mixers || []).at(-1)?.out || 'Main out L/R → PA speakers'),
  };
}
// Which channels each player is on, for the stage plot.
function mixChannels(s) {
  const L = mixLayout(s), by = {};
  for (const c of L.slots) {
    const inp = L.byKey.get(L.at[c]);
    if (inp) (by[inp.m.id] ||= []).push(c);
  }
  for (const id in by) by[id] = (L.setup === 'one' ? 'Ch ' : '') + by[id].join(', ');
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
function renderMixers(s) {
  const box = $('mixers');
  box.replaceChildren();
  $('mixer-print-title').textContent = s ? `SOS Band — Mixer routing · ${s.name} · ${fmtDate(s.date, false)}` : '';
  $('mixer-notes').replaceChildren();
  $('mix-msgs').replaceChildren();
  if (!s) return;
  const edit = canEdit();
  const L = mixLayout(s);
  document.querySelectorAll('#mix-setup button').forEach(b => b.setAttribute('aria-pressed', b.dataset.setup === L.setup));
  $('mix-redo').disabled = !L.pinned;
  const label = inp => `${inp.m.name} — ${inp.what}`;
  const chName = c => (L.setup === 'one' ? `ch ${c}` : c);
  for (const mx of MIX[L.setup]) {
    const card = el('div', 'mixer');
    card.append(el('h3', null, mx.name), el('p', 'role', mx.role));
    const ol = el('ol');
    for (let i = 1; i <= mx.n; i++) {
      const c = mx.id + i, k = L.at[c] || '', inp = L.byKey.get(k);
      const li = el('li', inp && L.where(k).length > 1 ? 'twice' : '');
      if (inp) li.style.setProperty('--kc', `var(--k-${inp.m.kind})`);
      li.append(el('span', 'ch', c));
      if (edit) {
        const pick = el('div', 'pick');
        const sel = el('select');
        sel.setAttribute('aria-label', `What goes on ${chName(c)}`);
        sel.append(new Option('Spare', ''));
        // Inputs already on another channel are greyed; ones with no channel yet are marked.
        for (const x of [...L.byKey.values()]) {
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
          t.placeholder = 'e.g. Laptop (backing tracks)';
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
      else li.append(el('span', 'spare', 'spare'));
      ol.append(li);
    }
    if (mx.ret) {
      const li = el('li', 'ret');
      li.append(el('span', 'ch', `${mx.id}${mx.n + 1}–${mx.n + 2}`), el('span', null, 'Mixer A (stereo submix)'));
      ol.append(li);
    }
    card.append(ol);
    const master = !(L.setup === 'two' && mx.id === 'A');
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
      mlab.append(el('b', null, 'Monitor'), sel);
      ow.append(lab, mlab);
      card.append(ow);
    } else {
      const p = el('p', 'out');
      p.append(el('b', null, 'Out: '), master ? L.out : 'Main out L/R → Mixer B ch 7–8 (stereo, 2 cables)');
      card.append(p);
      if (master && monitorCount(s)) {
        const m = el('p', 'out');
        m.append(el('b', null, 'Monitor: '), monitorCount(s) > 1 ? '2 stage monitors' : '1 stage monitor');
        card.append(m);
      }
    }
    box.append(card);
  }
  const msg = (cls, text) => $('mix-msgs').append(el('p', 'mix-msg ' + cls, text));
  const chList = cs => cs.map(chName).join(' and ');
  if (L.twice.length) msg('warn', `On two channels: ${L.twice.map(i => `${label(i)} (${chList(L.where(i.key))})`).join(', ')}.`);
  if (L.none.length) msg('warn', `No channel: ${L.none.map(label).join(', ')}.` + (!edit ? '' : !L.full ? ' Pick it on a spare channel.'
    : L.setup === 'one' ? ' Every channel is taken: switch to two mixers or free one up.' : ' Every channel is taken: free one up.'));
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
  const lead = get(s.lead);
  $('sv-lead').textContent = lead ? lead.name : 'Not set';
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

// Save the set's charts on this device so they open at a gig with no signal.
async function keepChartsOffline() {
  if (!navigator.onLine || !('caches' in window)) return;
  const s = currentShow();
  for (const id of s?.setlist || []) {
    const song = get(id);
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
  box.replaceChildren(el('h1', null, `SOS Band · ${s.name}`), el('p', null, [fmtDate(s.date), s.venue].filter(Boolean).join(' · ')));
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
    const extra = [get(song.lead)?.name, song.key && `key ${song.key}`].filter(Boolean).join(' · ');
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
    b.append(el('span', null, s.name + (EDITOR && s.id === band().currentShow ? ' ★' : '')), el('span', 'd', fmtDate(s.date, false)));
    b.addEventListener('click', () => { lsSet(K.show, s.id); render(); openShows(); keepChartsOffline(); });
    li.append(b);
    ul.append(li);
  }
  if (cur) {
    $('sh-name').value = cur.name;
    $('sh-date').value = cur.date || '';
    $('sh-venue').value = cur.venue || '';
    $('sh-host').value = cur.host || '';
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
  patchShow(v => { v.name = $('sh-name').value.trim() || v.name; v.date = $('sh-date').value; v.venue = $('sh-venue').value.trim(); v.host = $('sh-host').value.trim(); });
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
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
});

/* ---------- Metronome ----------
   Clicks are scheduled ahead on the Web Audio clock so they stay steady; the flashing follows the same clock.
   Silent mode schedules no sound, only the flashes. Tempos are saved on each song (song.bpm). */
const BPM_MIN = 30, BPM_MAX = 260;
const cleanBpm = v => { const n = Math.round(Number(v)); return n >= BPM_MIN && n <= BPM_MAX ? n : null; };
const met = Object.assign({ bpm: 120, beats: 4, silent: false, song: null }, (() => { try { return JSON.parse(lsGet(K.met)) || {}; } catch { return {}; } })());
let metCtx = null, metOn = false, metNext = 0, metBeat = 0, metTimer = null, metQueue = [], metLock = null;
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
  while (metNext < metCtx.currentTime + 0.12) {
    if (!met.silent) metClick(metNext, metBeat === 0 && met.beats > 1);
    metQueue.push({ t: metNext, beat: metBeat });
    metNext += 60 / met.bpm;
    metBeat = (metBeat + 1) % met.beats;
  }
}
function metDraw() {
  if (!metOn) return;
  let hit = null;
  while (metQueue.length && metQueue[0].t <= metCtx.currentTime) hit = metQueue.shift();
  if (hit) {
    const box = $('met-box');
    box.classList.remove('flash', 'flash1');
    void box.offsetWidth;   // restart the flash animation
    box.classList.add(hit.beat === 0 && met.beats > 1 ? 'flash1' : 'flash');
    $('met-dots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === hit.beat));
  }
  requestAnimationFrame(metDraw);
}
async function metStart() {
  metCtx = metCtx || new (window.AudioContext || window.webkitAudioContext)();
  if (metCtx.state !== 'running') await metCtx.resume();
  metOn = true;
  metBeat = 0;
  metQueue = [];
  metNext = metCtx.currentTime + 0.08;
  metSchedule();
  metTimer = setInterval(metSchedule, 25);
  requestAnimationFrame(metDraw);
  try { metLock = await navigator.wakeLock?.request('screen'); } catch {}   // keep the screen on while it runs
  metMarks();
}
function metStop() {
  metOn = false;
  clearInterval(metTimer);
  metQueue = [];
  metLock?.release().catch(() => {});
  metLock = null;
  $('met-box').classList.remove('flash', 'flash1');
  $('met-dots').querySelectorAll('i').forEach(d => d.classList.remove('on'));
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
  document.querySelectorAll('#met-mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.silent === '1') === String(met.silent)));
  document.querySelectorAll('#met-beats button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.beats) === met.beats));
  const dots = $('met-dots');
  if (dots.children.length !== met.beats) dots.replaceChildren(...Array.from({ length: met.beats }, () => el('i')));
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
function replaceLocal(next) { items = next; saveLocal(); render(); }

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
      if (EDITOR) render();
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
