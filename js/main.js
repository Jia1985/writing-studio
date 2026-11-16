import { loadSettings, saveSettings, works, newWork, writePending, readPending } from './store.js';
import { audio } from './audio.js';
import { createScene } from './scene.js';
import { createTypewriter } from './typewriter.js';
import { createInk } from './ink.js';
import { PLACES, PLACE_ORDER } from './places.js';
import { createReader } from './reader.js?v=2';
import { GLASS_MS } from './hourglass.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const body = document.body;

const settings = loadSettings();
let work = null;
let view = 'room';

const scene = createScene(settings);
const tw = createTypewriter({ scene, audio, onChange: markDirty, isFocus: () => view === 'focus' && settings.mode === 'typing' });
const ink = createInk({
  audio, getWork: () => work, onChange: markDirty,
  isActive: () => view === 'focus' && settings.mode === 'writing', isReduced: () => settings.reduceMotion,
});

const persist = () => saveSettings(settings);

// there is nothing to type on by the fire: the typewriter's page stays put
{ const focusTw = tw.focus.bind(tw); tw.focus = () => { if (!scene.place.reader) focusTw(); }; }

// ── reading ────────────────────────────────────────────────────────────
// The book on your lap by the fire is A Christmas Carol, and it keeps your
// place: it opens where you last stopped reading.
const reader = createReader({
  src: PLACES.reading.img,
  startAt: settings.bookAt || 0,
  // the sound of the page follows the page: lifted, swept over, laid down
  onFlip: (sec) => audio.pageFlip(sec),
  reduceMotion: () => settings.reduceMotion,
  onTurn(s, n, pages) {
    readPos = { s, n, pages }; readLabel();
    if (settings.bookAt !== s) { settings.bookAt = s; persist(); }
  },
  onPage: (side) => readTurn(side === 'R' ? 1 : -1),
});
let readPos = { s: 0, n: 1, pages: 2 };
function readLabel() {
  const { s, n, pages } = readPos, a = s * 2 + 1, b = Math.min(pages, a + 1);
  if (scene.narrowRead) {
    // one page at a time on a phone held upright
    const side = scene.readSide(), p = side === 'L' ? a : b;
    $('#readLabel').textContent = `Page ${p} of ${pages}`;
    $('#readPrev').disabled = s === 0 && side === 'L'; $('#readNext').disabled = s >= n - 1 && side === 'R';
    return;
  }
  $('#readLabel').textContent = a === b ? `Page ${a} of ${pages}` : `Pages ${a}–${b} of ${pages}`;
  $('#readPrev').disabled = s === 0; $('#readNext').disabled = s >= n - 1;
}
// On a wide screen both pages are in view and every step turns the leaf. On a
// narrow one, reading on goes from the left page across to the right, and
// from the right page the leaf turns and the view comes back to the left.
function readTurn(d) {
  if (!scene.narrowRead) return reader.turn(d);
  const side = scene.readSide();
  if (d > 0 && side === 'L') scene.readSide('R');
  else if (d < 0 && side === 'R') scene.readSide('L');
  else if (reader.turn(d)) setTimeout(() => { scene.readSide(d > 0 ? 'L' : 'R'); readLabel(); }, 420);
  readLabel();
}
addEventListener('resize', readLabel);
$('#readPrev').addEventListener('click', () => readTurn(-1));
$('#readNext').addEventListener('click', () => readTurn(1));
$('#readIn').addEventListener('click', () => { settings.focusZoom = clamp(settings.focusZoom + 0.1, 0.8, 1.7); persist(); scene.layout(); });
$('#readOut').addEventListener('click', () => { if (settings.focusZoom <= 0.81) return setView('room'); settings.focusZoom = clamp(settings.focusZoom - 0.1, 0.8, 1.7); persist(); scene.layout(); });
$('#btnRoomC').addEventListener('click', () => setView('room'));

// ── the hourglass: a forty-minute timer ────────────────────────────────
const glassLeft = () => (settings.glassEnds ? Math.max(0, settings.glassEnds - Date.now()) : 0);
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
let glassDoneShown = false;
function turnGlass() {
  closePopovers();
  if (scene.place.id === 'reading') audio.glassTurn(settings.reduceMotion ? 0.3 : 1.4);
  // every turn of the glass is a fresh forty minutes
  settings.glassEnds = null; syncGlass();
  scene.turnGlass(() => { settings.glassEnds = Date.now() + GLASS_MS; glassDoneShown = false; persist(); syncGlass(); });
}
function stopGlass() { settings.glassEnds = null; glassDoneShown = false; persist(); syncGlass(); closePopovers(); }
function syncGlass() {
  const left = glassLeft(), running = left > 0, chip = $('#timerChip');
  const done = !running && glassDoneShown;
  chip.hidden = !running && !done;
  chip.classList.toggle('done', done);
  $('#timerText').textContent = done ? 'Time’s up' : mmss(left);
  $('#glassLeft').textContent = running ? mmss(left) : done ? 'Time’s up' : '40:00';
  $('#glassMeta').textContent = running ? 'left of forty minutes' : done ? 'The sand has run through' : 'Turn it over for forty minutes';
  $('#glassStop').disabled = !running && !done;
  $('#glassStop').textContent = done ? 'Done' : 'Lay it down';
}
setInterval(() => {
  // the sand has run out: chime, wherever you are
  if (settings.glassEnds && Date.now() >= settings.glassEnds) {
    settings.glassEnds = null; glassDoneShown = true; persist(); audio.chime();
  }
  syncGlass();
}, 500);
$('#hsGlass').addEventListener('click', () => { if (glassLeft() > 0 || glassDoneShown) showPop('#popGlass', 'hsGlass', 'center'); else turnGlass(); });
$('#timerChip').addEventListener('click', () => showPop('#popGlass', 'timerChip', 'below'));
$('#glassTurn').addEventListener('click', turnGlass);
$('#glassStop').addEventListener('click', stopGlass);

// ── saving ─────────────────────────────────────────────────────────────
const statusEl = $('#saveStatus'), titleInput = $('#titleInput');
let dirty = false, saveTimer = 0;
function status(text, busy = false) { statusEl.textContent = text; statusEl.classList.toggle('busy', busy); }
function syncWork() { work.text = tw.text; work.caret = tw.caret; work.hand = ink.text; work.title = titleInput.value.trim(); work.updatedAt = Date.now(); }
function markDirty() {
  dirty = true; status('Saving…', true);
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 450);
  noteActivity();
}
async function flush() {
  clearTimeout(saveTimer);
  if (!work || !dirty) return;
  syncWork(); writePending(work); dirty = false;
  try { await works.put(work); if (!dirty) status('Saved'); }
  catch { status('Not saved — storage unavailable', true); }
}
function flushNow() { if (work && dirty) { syncWork(); writePending(work); dirty = false; works.put(work).catch(() => {}); } }
addEventListener('pagehide', flushNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });

function openWork(w) {
  work = w; settings.currentWorkId = w.id; persist();
  titleInput.value = w.title || '';
  tw.set(w.text, w.caret); ink.load();
  dirty = false; status('Saved'); renderLibrary();}

// ── view / mode ────────────────────────────────────────────────────────
function setView(v) {
  if (v === view) return;
  view = v; scene.setView(v); tw.refresh(); closePopovers();
  if (scene.place.reader) { tw.el.blur(); ink.blur(); reader.refresh(); }
  else if (v === 'focus' && settings.mode === 'writing') { tw.el.blur(); inkReady(); }
  else if (settings.mode === 'typing') tw.focus();
  else ink.blur();
  body.classList.remove('idle');
  syncUi();
}
function setMode(m) {
  // reading happens by the fire, and writing at a desk: changing between
  // them takes you there (and back to the room you came from)
  if (m === 'reading' && !scene.place.reader) { settings.writePlace = settings.place; settings.writeMode = settings.mode; return setPlace('reading'); }
  if (m !== 'reading' && scene.place.reader) { settings.writeMode = m; return setPlace(PLACES[settings.writePlace] && !PLACES[settings.writePlace].reader ? settings.writePlace : 'study'); }
  if (m !== settings.mode) {
    settings.mode = m; persist(); audio.tick();
    body.classList.toggle('mode-typing', m === 'typing'); body.classList.toggle('mode-writing', m === 'writing'); body.classList.toggle('mode-reading', m === 'reading');
    scene.layout(); tw.refresh();
    if (m === 'writing') { tw.el.blur(); if (view === 'focus') inkReady(); }
    else { ink.blur(); tw.focus(); }
    body.classList.remove('idle');
  }
  syncUi();
}
function inkReady() { ink.resize(); ink.focus(); setTimeout(ink.resize, 1400); }

const ROOM_Z = [1, 1.6], FOCUS_Z = [0.8, 1.7];
function zoomStep(d) {
  if (view === 'room') {
    if (d > 0 && settings.roomZoom >= ROOM_Z[1] - 0.01) return setView('focus');
    settings.roomZoom = clamp(settings.roomZoom + d * 0.15, ...ROOM_Z);
  } else if (settings.mode === 'typing') {
    if (d < 0 && settings.focusZoom <= FOCUS_Z[0] + 0.01) return setView('room');
    settings.focusZoom = clamp(settings.focusZoom + d * 0.1, ...FOCUS_Z);
  } else return;
  persist(); scene.layout(); syncUi();
}
let wheelPush = 0, wheelCool = 0, wheelAnim = 0;
$('#viewport').addEventListener('wheel', (e) => {
  e.preventDefault();
  const t = performance.now();
  if (t < wheelCool) return;
  if (view === 'focus' && settings.mode === 'writing') return;
  const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
  // typing focus: scrolling reads up and down the sheet; pinch (or ctrl + wheel) zooms
  if (view === 'focus' && settings.mode === 'typing' && !e.ctrlKey) return scene.scrollPaper(dy);
  const f = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016));
  const key = view === 'room' ? 'roomZoom' : 'focusZoom', range = view === 'room' ? ROOM_Z : FOCUS_Z;
  const next = clamp(settings[key] * f, ...range);
  const blocked = next === settings[key];
  settings[key] = next;
  if (blocked) {
    wheelPush += Math.abs(dy);
    if (wheelPush > 160) {
      wheelPush = 0; wheelCool = t + 1100;
      if (view === 'room' && dy < 0) return setView('focus');
      if (view === 'focus' && dy > 0) return setView('room');
    }
  } else wheelPush = 0;
  body.classList.add('no-anim'); clearTimeout(wheelAnim); wheelAnim = setTimeout(() => body.classList.remove('no-anim'), 160);
  scene.layout(); syncUi(); persist();
}, { passive: false });

// ── environment ────────────────────────────────────────────────────────
function setLampOn(on) { if (on === settings.lampOn) return; settings.lampOn = on; audio.lampClick(); scene.applyLight(); persist(); syncUi(); }
function setLamp(v) { settings.lamp = v; scene.applyLight(); persist(); syncUi(); }
function setCurtains(open) {
  if (open === settings.curtainsOpen) return;
  settings.curtainsOpen = open; scene.applyCurtains();
  const dur = settings.reduceMotion ? 1.2 : 3.2; // matches the curtain fade / slide in scene.js
  audio.curtain(dur); audio.setCurtainMuffle(!open, dur);
  persist(); syncUi();
}
function setWeather(w) { if (w === scene.wxKind()) return;
  if (scene.place.id === 'study') settings.weather = w; else settings.wxBy = { ...settings.wxBy, [scene.place.id]: w };
  scene.applyWeather(); audio.setWeather(scene.wxKind()); persist(); syncUi(); }
// The tonearm decides: dropping the needle plays, lifting it stops. The Play
// and Pause buttons carry the arm over (or put it away) and the music follows.
function setMusic(on, byHand = false) {
  const changed = on !== settings.musicOn;
  if (changed) { settings.musicOn = on; scene.setPlaying(on); persist(); syncUi(); }
  // the needle is the truth: even if the switch already agrees, make the sound agree too
  if (byHand) { if (on !== audio.music.playing) on ? audio.music.play() : audio.music.pause(); return; }
  if (!changed) return;
  if (on) scene.moveArm(true, () => { if (settings.musicOn) audio.music.play(); });
  else { audio.music.pause(); scene.moveArm(false); }
}
scene.onArm((what) => { if (what === 'drop') setMusic(true, true); else if (what === 'lift') setMusic(false, true); });
function setTrack(i) {
  const n = audio.music.tracks.length; settings.track = ((i % n) + n) % n;
  // the needle goes back to the lead-in groove; if it was still on its way down, it starts the record when it lands
  if (settings.musicOn) scene.cueArm(() => { if (settings.musicOn && !audio.music.playing) audio.music.play(); });
  audio.music.setTrack(settings.track); persist(); syncUi();
}
// a record from a file has played to its end: the next one goes on
audio.music.onEnded(() => { if (settings.musicOn) setTrack(settings.track + 1); });
function setWeatherSound(on) { settings.weatherSound = on; audio.setWeatherOn(on); persist(); syncUi(); }
function setMuted(m) { settings.muted = m; audio.setMuted(m); persist(); syncUi(); }
function setReduce(r) { settings.reduceMotion = r; body.classList.toggle('reduce-motion', r); scene.setPlaying(settings.musicOn); persist(); syncUi(); }

// ── ui sync ────────────────────────────────────────────────────────────
function setRange(el, v) { el.value = v; fill(el); }
function fill(el) { el.style.setProperty('--fill', ((el.value - el.min) / (el.max - el.min)) * 100 + '%'); }
const tog = (id, v) => $(id).setAttribute('aria-checked', String(!!v));
function syncUi() {
  for (const g of $$('[data-setting]')) {
    const k = g.dataset.setting, val = k === 'view' ? view : k === 'weather' ? scene.wxKind() : settings[k];
    for (const b of g.children) b.setAttribute('aria-checked', String(b.dataset.value === val));
  }
  for (const b of $('#modeSwitch').children) b.setAttribute('aria-checked', String(b.dataset.mode === settings.mode));
  tog('#lampToggle', settings.lampOn); tog('#setLampOn', settings.lampOn);
  setRange($('#lampRange'), settings.lamp); setRange($('#setLamp'), settings.lamp);
  tog('#curtainToggle', settings.curtainsOpen); tog('#setCurtains', settings.curtainsOpen);
  tog('#setMusicOn', settings.musicOn); tog('#crackleToggle', settings.crackle);
  tog('#wxSoundToggle', settings.weatherSound); tog('#setWxSound', settings.weatherSound);
  for (const el of $$('.wx-sound-label')) el.textContent = scene.place.wxSound[scene.wxKind()];
  tog('#setMute', settings.muted); tog('#setReduce', settings.reduceMotion); tog('#setRemember', settings.remember);
  $('#btnMute').setAttribute('aria-pressed', String(settings.muted));
  $('#musicToggle').textContent = settings.musicOn ? 'Pause' : 'Play';
  $('#musicToggle').setAttribute('aria-pressed', String(settings.musicOn));
  $('#trackName').textContent = audio.music.tracks[settings.track].name;
  $('#trackMeta').textContent = `${audio.music.tracks[settings.track].kind} · ${settings.track + 1} of ${audio.music.tracks.length} · ${settings.musicOn ? 'playing' : 'stopped'}`;
  $('#setTrack').value = settings.track;
  setRange($('#musicVol'), settings.vol.music);
  for (const r of $$('[data-vol]')) setRange(r, settings.vol[r.dataset.vol]);
  const z = view === 'room' ? settings.roomZoom : settings.focusZoom, zr = view === 'room' ? ROOM_Z : FOCUS_Z;
  $('#zoomLabel').textContent = Math.round(settings.focusZoom * 100) + '%';
  setRange($('#setZoom'), (z - zr[0]) / (zr[1] - zr[0])); $('#setZoomVal').textContent = Math.round(z * 100) + '%';
  $('#setZoom').disabled = view === 'focus' && settings.mode === 'writing';
  $('#roomHint').textContent = settings.mode === 'typing' ? scene.place.labels.typeHint : scene.place.labels.penHint;
}

// ── controls wiring ────────────────────────────────────────────────────
const actions = { mode: setMode, weather: setWeather, view: setView };
document.addEventListener('click', (e) => {
  const seg = e.target.closest('[data-setting] > button');
  if (seg) actions[seg.parentElement.dataset.setting](seg.dataset.value);
});
$('#modeSwitch').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
const onToggle = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); fn($(id).getAttribute('aria-checked') !== 'true'); });
onToggle('#lampToggle', setLampOn); onToggle('#setLampOn', setLampOn);
onToggle('#curtainToggle', setCurtains); onToggle('#setCurtains', setCurtains);
onToggle('#setMusicOn', setMusic);
onToggle('#crackleToggle', (v) => { settings.crackle = v; audio.music.setCrackle(v); persist(); syncUi(); });
onToggle('#setMute', setMuted); onToggle('#wxSoundToggle', setWeatherSound); onToggle('#setWxSound', setWeatherSound); onToggle('#setReduce', setReduce);
onToggle('#setRemember', (v) => { settings.remember = v; persist(); syncUi(); });
for (const id of ['#lampRange', '#setLamp']) $(id).addEventListener('input', (e) => { const v = +e.target.value; if (!settings.lampOn) setLampOn(true); setLamp(v); });
for (const r of [...$$('[data-vol]'), $('#musicVol')]) {
  r.addEventListener('input', () => { const k = r.dataset.vol || 'music'; settings.vol[k] = +r.value; audio.setVolume(k, +r.value); persist(); syncUi(); });
}
$('#setZoom').addEventListener('input', (e) => {
  const v = +e.target.value;
  if (view === 'room') settings.roomZoom = ROOM_Z[0] + v * (ROOM_Z[1] - ROOM_Z[0]); else settings.focusZoom = FOCUS_Z[0] + v * (FOCUS_Z[1] - FOCUS_Z[0]);
  body.classList.add('no-anim'); scene.layout(); requestAnimationFrame(() => body.classList.remove('no-anim')); persist(); syncUi();
});
$('#btnMute').addEventListener('click', () => setMuted(!settings.muted));

// Full screen does two things at once: the browser's tabs and window frame
// go, and so do the studio's own buttons, leaving just the room and its
// sound. A click or any key brings the buttons back (still full screen);
// the button, or Esc, then leaves full screen. Where a page can't go full
// screen (iPhone), the button just hides the controls.
{
  const root = document.documentElement;
  const btn = $('#btnFull'), veil = $('#sceneVeil'), hint = veil.querySelector('.scene-hint');
  const enter = root.requestFullscreen || root.webkitRequestFullscreen;
  const leave = document.exitFullscreen || document.webkitExitFullscreen;
  const canFull = !!enter && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const current = () => document.fullscreenElement || document.webkitFullscreenElement;
  let wakeTimer = 0, since = 0;

  const wake = () => {
    veil.classList.add('awake');
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => veil.classList.remove('awake'), 2500);
  };
  const hide = () => {
    closePopovers(); closePanels();
    if (document.activeElement) document.activeElement.blur();
    hint.textContent = current() || canFull
      ? 'Click anywhere to bring the controls back · Esc leaves full screen'
      : 'Click anywhere to bring the controls back';
    body.classList.add('scene-only');
    veil.hidden = false; since = performance.now();
    wake();
  };
  const show = () => {
    if (veil.hidden) return;
    veil.hidden = true; clearTimeout(wakeTimer); veil.classList.remove('awake');
    body.classList.remove('scene-only');
  };
  const sync = () => {
    const on = !!current();
    btn.setAttribute('aria-pressed', String(on));
    // set here as well as in the CSS, so an old cached style sheet can't show both
    btn.querySelector('.enter').style.display = on ? 'none' : 'block';
    btn.querySelector('.leave').style.display = on ? 'block' : 'none';
    btn.title = on ? 'Leave full screen' : (canFull ? 'Full screen' : 'Hide the controls');
    btn.setAttribute('aria-label', btn.title);
    if (!on && canFull) show();   // leaving full screen (Esc, or the browser) brings the buttons back
  };

  btn.hidden = false;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (current()) {
      try { const p = leave.call(document); if (p && p.catch) p.catch(() => {}); } catch { /* refused */ }
      return;
    }
    if (canFull) {
      try { const p = enter.call(root); if (p && p.catch) p.catch(() => {}); } catch { /* refused: still hide */ }
    }
    hide();
  });
  veil.addEventListener('pointermove', wake);
  veil.addEventListener('click', () => { if (performance.now() - since > 300) show(); });
  // capture first, so the key only brings the controls back and does nothing else
  addEventListener('keydown', (e) => {
    if (veil.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== 'Escape') e.preventDefault();
    e.stopImmediatePropagation(); show();
  }, true);
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
}
$('#musicToggle').addEventListener('click', () => setMusic(!settings.musicOn));
$('#musicNext').addEventListener('click', () => setTrack(settings.track + 1));
$('#setTrack').addEventListener('change', (e) => setTrack(+e.target.value));
$('#zoomIn').addEventListener('click', () => zoomStep(1));
$('#zoomOut').addEventListener('click', () => zoomStep(-1));
$('#btnFocus').addEventListener('click', () => setView('focus'));
$('#btnRoomA').addEventListener('click', () => setView('room'));
$('#btnRoomB').addEventListener('click', () => setView('room'));
titleInput.addEventListener('input', markDirty);
titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); settings.mode === 'typing' ? tw.focus() : titleInput.blur(); } });
titleInput.addEventListener('change', renderLibrary);
// ── hotspots + contextual popovers ─────────────────────────────────────
let popTimer = 0, openPop = null;
function closePopovers() { clearTimeout(popTimer); for (const p of $$('.popover.open')) p.classList.remove('open'); openPop = null; }
function armPop(ms = 4200) { clearTimeout(popTimer); popTimer = setTimeout(closePopovers, ms); }
function showPop(id, hsId, place) {
  const p = $(id);
  if (openPop === p) return closePopovers();
  closePopovers();
  const r = scene.hotspotRect(hsId), pw = p.offsetWidth, ph = p.offsetHeight;
  let x = r.left + r.width / 2 - pw / 2, y;
  if (place === 'below') y = r.bottom + 12; else if (place === 'above') y = r.top - ph - 12; else y = r.top + r.height / 2 - ph / 2;
  p.style.left = clamp(x, 12, innerWidth - pw - 12) + 'px';
  p.style.top = clamp(y, 70, innerHeight - ph - 84) + 'px';
  p.classList.add('open'); openPop = p; armPop();
}
for (const p of $$('.popover')) {
  p.addEventListener('pointerenter', () => clearTimeout(popTimer));
  p.addEventListener('pointerleave', () => armPop(2200));
  p.addEventListener('input', () => armPop(5000));
  p.addEventListener('click', () => armPop(5000));
  p.addEventListener('focusin', () => armPop(8000));
}
document.addEventListener('pointerdown', (e) => { if (openPop && !e.target.closest('.popover, .hotspot, #btnPlaces')) closePopovers(); });
$('#hsLamp').addEventListener('click', () => showPop('#popLamp', 'hsLamp', 'below'));
$('#hsWindow').addEventListener('click', () => showPop('#popWindow', 'hsWindow', 'center'));
$('#hsPlayer').addEventListener('click', () => showPop('#popPlayer', 'hsPlayer', 'above')); // play with the tonearm or the Play button
$('#hsTypewriter').addEventListener('click', () => { setMode('typing'); setView('focus'); tw.focus(); });
// where there is no typewriter, the notebook opens whichever way of writing is chosen
$('#hsPen').addEventListener('click', () => { if (scene.place.reader) return setView('focus');
  if (scene.place.typewriter !== false) setMode('writing'); setView('focus'); if (settings.mode === 'typing') tw.focus(); });

// ── places ─────────────────────────────────────────────────────────────
// Everything that is worded or offered differently from place to place.
function applyPlaceUi() {
  const p = scene.place, L = p.labels;
  $('#hsLamp').dataset.label = L.lamp; $('#hsWindow').dataset.label = L.window; $('#hsPlayer').dataset.label = L.player; $('#hsPen').dataset.label = L.pen;
  $('#hsLamp').setAttribute('aria-label', L.lamp + ' controls'); $('#hsPen').setAttribute('aria-label', 'Write by hand: ' + L.pen);
  $('#playerTitle').textContent = L.playerTitle;
  $('#lampTitle').textContent = L.lamp; $('#setLampLabel').textContent = L.lamp; $('#popLamp').setAttribute('aria-label', L.lamp);
  for (const b of $$('[data-setting="weather"] > button')) { b.hidden = !p.weathers.includes(b.dataset.value); b.textContent = p.wxName[b.dataset.value] || b.textContent; }
  $('#introLine').textContent = p.tagline;
  for (const c of $$('.place-card')) c.setAttribute('aria-current', String(c.dataset.place === p.id));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let travelling = false;
async function setPlace(id) {
  closePopovers();
  if (travelling || id === settings.place || !PLACES[id]) return;
  travelling = true;
  const p = PLACES[id], veil = $('#veil');
  $('#veilName').textContent = p.name; veil.classList.add('on');
  await wait(settings.reduceMotion ? 80 : 700);
  // the fireside is for reading; leaving it, you pick up your pen again
  if (p.reader && settings.mode !== 'reading') { settings.writePlace = settings.place; settings.writeMode = settings.mode; }
  const mode = p.reader ? 'reading' : settings.mode === 'reading' ? settings.writeMode || 'typing' : settings.mode;
  settings.place = id; persist();
  body.classList.add('no-anim');
  await scene.setPlace(id);
  if (mode !== settings.mode) {
    settings.mode = mode; persist();
    for (const k of ['typing', 'writing', 'reading']) body.classList.toggle('mode-' + k, k === mode);
    if (mode === 'writing') tw.el.blur(); else ink.blur();
  }
  if (p.reader) { tw.el.blur(); reader.refresh(); }
  audio.setPlace(id); audio.setWeather(scene.wxKind()); audio.setCurtainMuffle(p.curtains && !settings.curtainsOpen, 0.2);
  scene.applyLight(); scene.setPlaying(settings.musicOn); tw.refresh(); applyPlaceUi(); syncUi();
  await wait(settings.reduceMotion ? 80 : 450);
  body.classList.remove('no-anim'); veil.classList.remove('on'); travelling = false;
  if (settings.mode === 'typing') tw.focus(); else if (settings.mode === 'writing' && view === 'focus') inkReady();
}
$('#placeList').replaceChildren(...PLACE_ORDER.map((id) => {
  const p = PLACES[id], b = document.createElement('button'); b.className = 'place-card'; b.dataset.place = id;
  const th = document.createElement('span'); th.className = 'thumb'; th.style.backgroundImage = `url("${p.img}")`;
  const tx = document.createElement('span');
  for (const [cls, text] of [['p-name', p.name], ['p-blurb', p.blurb], ['p-here', 'You are here']]) { const s = document.createElement('span'); s.className = cls; s.textContent = text; tx.appendChild(s); }
  b.append(th, tx); b.addEventListener('click', () => setPlace(id));
  return b;
}));
$('#btnPlaces').addEventListener('click', () => showPop('#popPlaces', 'btnPlaces', 'below'));

// ── panels ─────────────────────────────────────────────────────────────
const scrim = $('#scrim');
function openPanel(id) { closePanels(); closePopovers(); const p = $(id); p.classList.add('open'); p.setAttribute('aria-hidden', 'false'); scrim.classList.add('open'); p.querySelector('[data-close]').focus(); }
function closePanels() {
  const open = $('.panel.open'); if (!open) return false;
  open.classList.remove('open'); open.setAttribute('aria-hidden', 'true'); scrim.classList.remove('open');
  if (settings.mode === 'typing') tw.focus(); else if (view === 'focus') ink.focus();
  return true;
}
$('#btnSettings').addEventListener('click', () => openPanel('#settingsPanel'));
$('#btnLibrary').addEventListener('click', () => { renderLibrary(); openPanel('#libraryPanel'); });
scrim.addEventListener('click', closePanels);
for (const b of $$('[data-close]')) b.addEventListener('click', closePanels);

// ── library ────────────────────────────────────────────────────────────
const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const countWords = (t) => { const latin = (t.match(/[A-Za-z0-9'’-]+/g) || []).length, cjk = (t.match(/[㐀-鿿]/g) || []).length; return latin + cjk; };
async function renderLibrary() {
  const ul = $('#workList'); if (!work) return;
  await flush();
  const list = await works.all();
  ul.replaceChildren(...list.map((w) => {
    const li = document.createElement('li'); li.className = 'work' + (w.id === work.id ? ' current' : '');
    const open = document.createElement('button'); open.className = 'open';
    const t = document.createElement('span'); t.className = 'w-title'; t.textContent = w.title || 'Untitled';
    const m = document.createElement('span'); m.className = 'w-meta';
    const hw = countWords(w.hand || '');
    m.textContent = `${fmt.format(w.updatedAt)} · ${countWords(w.text || '')} words typed${hw ? ` · ${hw} handwritten` : ''}`;
    open.append(t, m);
    open.addEventListener('click', async () => { if (w.id !== work.id) { await flush(); openWork(await works.get(w.id)); } closePanels(); });
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '×'; del.setAttribute('aria-label', `Delete ${w.title || 'Untitled'}`);
    del.addEventListener('click', () => {
      const c = document.createElement('span'); c.className = 'confirm';
      const yes = document.createElement('button'); yes.className = 'pill danger'; yes.textContent = 'Delete';
      const no = document.createElement('button'); no.className = 'pill'; no.textContent = 'Keep';
      c.append(yes, no); del.replaceWith(c); yes.focus();
      no.addEventListener('click', renderLibrary);
      yes.addEventListener('click', async () => {
        await works.remove(w.id);
        if (w.id === work.id) {
          dirty = false; clearTimeout(saveTimer);
          const rest = await works.all(); let nw = rest[0];
          if (!nw) { nw = newWork(); await works.put(nw); }
          openWork(nw);
        } else renderLibrary();
      });
    });
    li.append(open, del); return li;
  }));
}
$('#newWork').addEventListener('click', async () => {
  await flush(); const w = newWork(); await works.put(w); openWork(w); closePanels();
  setMode('typing'); setView('focus'); tw.focus();
});

// ── export ─────────────────────────────────────────────────────────────
const safeName = () => (work.title || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Untitled';
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const note = (t) => { $('#exportNote').textContent = t; };
const toBlob = (cv, type, q) => new Promise((res) => cv.toBlob(res, type, q));
$('#exTxt').addEventListener('click', async () => {
  await flush();
  if (!work.text.trim()) return note('There is no typed text in this piece yet.');
  download(new Blob([work.text], { type: 'text/plain;charset=utf-8' }), safeName() + '.txt'); note('Typed text exported.');
});
$('#exPng').addEventListener('click', async () => {
  const pg = ink.renderPages(1500).find((p) => p.page === ink.page);
  if (!pg) return note('The current handwritten page is empty.');
  download(await toBlob(pg.canvas, 'image/png'), `${safeName()} - page ${ink.page + 1}.png`); note('Handwritten page exported.');
});
$('#exPdf').addEventListener('click', async () => {
  const pgs = ink.renderPages(1400);
  if (!pgs.length) return note('There is no handwriting in this piece yet.');
  const imgs = [];
  for (const p of pgs) { const cv = p.canvas; imgs.push({ w: cv.width, h: cv.height, data: new Uint8Array(await (await toBlob(cv, 'image/jpeg', 0.9)).arrayBuffer()) }); }
  download(makePdf(imgs), safeName() + ' - handwriting.pdf'); note(`${pgs.length} handwritten page${pgs.length > 1 ? 's' : ''} exported.`);
});
function makePdf(imgs) {
  const enc = new TextEncoder(), chunks = [], offs = []; let len = 0;
  const push = (d) => { const u = typeof d === 'string' ? enc.encode(d) : d; chunks.push(u); len += u.length; };
  const obj = (n, dict, stream) => { offs[n] = len; push(`${n} 0 obj\n${dict}\n`); if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); } push('endobj\n'); };
  const PW = 612, PH = 796, n = imgs.length, total = 2 + n * 3;
  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${imgs.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  imgs.forEach((im, i) => {
    const pg = 3 + i * 3, cs = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${pg + 2} 0 R >> >> /Contents ${pg + 1} 0 R >>`);
    obj(pg + 1, `<< /Length ${cs.length} >>`, cs);
    obj(pg + 2, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>`, im.data);
  });
  const xref = len;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= total; i++) push(`${String(offs[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

// ── keyboard + idle chrome ─────────────────────────────────────────────
let idleTimer = 0, lastMove = [0, 0];
function noteActivity() {
  if (view !== 'focus' || settings.mode !== 'typing' || document.activeElement !== tw.el) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (view === 'focus' && settings.mode === 'typing' && !$('.panel.open') && document.activeElement === tw.el) body.classList.add('idle'); }, 2600);
}
addEventListener('pointermove', (e) => {
  if (Math.abs(e.clientX - lastMove[0]) + Math.abs(e.clientY - lastMove[1]) < 4) return;
  lastMove = [e.clientX, e.clientY]; clearTimeout(idleTimer); body.classList.remove('idle');
});
addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Escape') {
    if (!$('#intro').classList.contains('gone')) return;
    if (openPop) return closePopovers();
    if (closePanels()) return;
    if (view === 'focus') setView('room');
    return;
  }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); dirty = dirty || !!work; flush(); return; }
  // reading: turn the pages
  if (scene.place.reader && view === 'focus' && !mod && !$('.panel.open') && !e.target.closest?.('input, select, textarea')) {
    const d = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[e.key];
    if (d) { e.preventDefault(); readTurn(e.shiftKey && e.key === ' ' ? -1 : d); return; }
  }
  if (scene.place.reader && view === 'room' && !mod && e.key === 'Enter' && e.target === body) { setView('focus'); return; }
  // in pen mode, typing anywhere goes to the handwritten page
  if (view === 'focus' && settings.mode === 'writing' && !mod && e.target === body && !$('.panel.open')) ink.focus();
  // start typing from anywhere in the room
  const t = e.target;
  if (settings.mode === 'typing' && !mod && !e.altKey && (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace')
    && (t === body || t.classList?.contains('hotspot')) && !$('.panel.open') && $('#intro').classList.contains('gone')) {
    if (t.classList?.contains('hotspot') && (e.key === 'Enter' || e.key === ' ')) return;
    if (view === 'room' && scene.place.typewriter === false) setView('focus');   // the typed sheet is only laid out in Focus
    tw.focus();
  }
});

// ── boot ───────────────────────────────────────────────────────────────
async function boot() {
  // reading belongs to the fireside, and the fireside to reading
  if (PLACES[settings.place]?.reader) settings.mode = 'reading';
  else if (settings.mode === 'reading') settings.mode = settings.writeMode || 'typing';
  for (const k of ['typing', 'writing', 'reading']) body.classList.toggle('mode-' + k, settings.mode === k);
  body.classList.toggle('reduce-motion', settings.reduceMotion);
  syncGlass();
  await audio.music.loadRecords();   // the MP3s in assets/music join the generated records
  $('#setTrack').replaceChildren(...audio.music.tracks.map((t, i) => new Option(`${t.name} — ${t.kind}`, i)));
  scene.applyWeather(); scene.applyCurtains(); scene.setPlaying(settings.musicOn); scene.layout();
  audio.setPlace(scene.place.id); audio.setVolumes(settings.vol); audio.setMuted(settings.muted); audio.setWeather(scene.wxKind()); audio.setWeatherOn(settings.weatherSound);
  applyPlaceUi();
  audio.music.setTrack(settings.track = Math.min(settings.track, audio.music.tracks.length - 1)); audio.music.setCrackle(settings.crackle);

  let list = [];
  try { list = await works.all(); } catch { /* fall through to a fresh piece */ }
  let w = list.find((x) => x.id === settings.currentWorkId) || list[0];
  if (!w) { w = newWork(true); await works.put(w).catch(() => {}); }
  const p = readPending();
  if (p && p.id === w.id && p.updatedAt > w.updatedAt) { Object.assign(w, { text: p.text, title: p.title, caret: p.caret, updatedAt: p.updatedAt }); works.put(w).catch(() => {}); }
  openWork(w); syncUi();

  const enter = $('#enterBtn'); enter.focus();
  enter.addEventListener('click', () => {
    if (settings.musicOn) audio.music.play();
    audio.init(); audio.setCurtainMuffle(scene.place.curtains && !settings.curtainsOpen, 0.1);
    $('#intro').classList.add('gone'); body.classList.remove('booting');
    if (settings.mode === 'typing') tw.focus();
  }, { once: true });
}
boot();
window.__studio = { audio, settings, scene, reader }; // handy for debugging in the console
