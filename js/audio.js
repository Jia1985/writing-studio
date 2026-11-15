// Audio engine — everything is synthesised with Web Audio (no samples, no
// licensed material). Four buses (writing / room / weather / music) → master.

let ctx = null;
let master, limiter;
const bus = {};
const noise = {};
const vol = { master: 0.8, writing: 0.8, room: 0.5, weather: 0.6, music: 0.6 };
let muted = false;
const BUS_SCALE = { writing: 1.0, room: 0.9, weather: 0.9, music: 1.0 };

const R = Math.random;
const now = () => ctx.currentTime;
const ready = () => !!ctx && ctx.state === 'running';
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function makeNoise() {
  const sr = ctx.sampleRate;
  const mk = (sec, fill) => { const b = ctx.createBuffer(1, sr * sec, sr); fill(b.getChannelData(0)); return b; };
  noise.white = mk(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; });
  noise.pink = mk(5, (d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = R() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  });
  noise.brown = mk(5, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (R() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
}

function loopSrc(kind) {
  const s = ctx.createBufferSource(); s.buffer = noise[kind]; s.loop = true; s.start(0, R() * 1.5); return s;
}
function filt(type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
function gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }

// short filtered noise burst
function burst({ dest, buf = 'white', type = 'bandpass', f = 2000, f2, q = 1, dur = 0.03, g = 0.2, t = now(), attack = 0.001 }) {
  const s = ctx.createBufferSource(); s.buffer = noise[buf];
  const fl = filt(type, f, q); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const a = ctx.createGain();
  a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(g, t + attack); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(a).connect(dest);
  s.start(t, R() * (s.buffer.duration - dur - 0.05), dur + 0.03);
}
function tone({ dest, f, f2, dur = 0.2, g = 0.05, type = 'sine', t = now(), attack = 0.002 }) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const a = ctx.createGain();
  a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(g, t + attack); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(a).connect(dest); o.start(t); o.stop(t + dur + 0.05);
}

function applyVolumes() {
  if (!ctx) return;
  const t = now();
  master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.04);
  for (const k of Object.keys(bus)) bus[k].gain.setTargetAtTime(vol[k] * BUS_SCALE[k], t, 0.04);
}

// ── writing: typewriter ────────────────────────────────────────────────
let lastKey = 0, keyOut = null;
function key(kind = 'char') {
  if (!ready()) return;
  // away from the typewriter, typing is only a soft tap
  if (placeId === 'cafe') { if (kind === 'release' || kind === 'shift') return; kind = 'light'; }
  const t = now();
  if (kind !== 'release') { if (t - lastKey < 0.014) return; lastKey = t; }
  if (!keyOut) {
    // Typewriter strikes sit well above rain and music. A soft clipper rounds
    // off the loudest peaks so the strikes get louder without harsh clipping.
    keyOut = gain(18);
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 1024 - 1) * 1.6) / Math.tanh(1.6);
    shaper.curve = curve; shaper.oversample = '2x';
    keyOut.connect(shaper).connect(bus.writing);
  }
  const d = keyOut;
  if (kind === 'space') {
    burst({ dest: d, type: 'lowpass', f: 300 + R() * 90, dur: 0.19, g: 0.6 });
    burst({ dest: d, f: 1300 + R() * 300, q: 1.6, dur: 0.12, g: 0.3 });
    burst({ dest: d, f: 800, q: 3, dur: 0.03, g: 0.07, t: t + 0.06 });
  } else if (kind === 'enter') {
    for (let i = 0; i < 9; i++) burst({ dest: d, type: 'highpass', f: 2600 + R() * 800, dur: 0.012, g: 0.09 + R() * 0.04, t: t + 0.03 + i * 0.024 + R() * 0.004 });
    burst({ dest: d, buf: 'pink', f: 650, f2: 1500, q: 0.8, dur: 0.28, g: 0.2, attack: 0.04 });
    tone({ dest: d, f: 2093, dur: 1.3, g: 0.05, t: t + 0.02 });
    tone({ dest: d, f: 4216, dur: 0.7, g: 0.014, t: t + 0.02 });
    tone({ dest: d, f: 5630, dur: 0.4, g: 0.007, t: t + 0.02 });
    burst({ dest: d, type: 'lowpass', f: 320, dur: 0.1, g: 0.6, t: t + 0.27 });
    burst({ dest: d, f: 1800, q: 2, dur: 0.02, g: 0.16, t: t + 0.27 });
  } else if (kind === 'delete') {
    burst({ dest: d, f: 1500 + R() * 300, q: 2.2, dur: 0.1, g: 0.3 });
    burst({ dest: d, type: 'lowpass', f: 260, dur: 0.14, g: 0.4 });
    burst({ dest: d, f: 1050 + R() * 150, q: 2.5, dur: 0.03, g: 0.13, t: t + 0.05 });
  } else if (kind === 'release') {          // key springs back up
    burst({ dest: d, f: 1500 + R() * 400, q: 3, dur: 0.02, g: 0.1 });
    burst({ dest: d, type: 'lowpass', f: 300, dur: 0.03, g: 0.08 });
  } else if (kind === 'light' || kind === 'shift') { // key travel without a type slug hitting paper
    burst({ dest: d, f: 1900 + R() * 900, q: 1.6, dur: 0.025, g: 0.17 });
    burst({ dest: d, type: 'lowpass', f: 340, dur: 0.06, g: 0.22 });
  } else if (kind === 'soft') {
    burst({ dest: d, buf: 'pink', f: 1200, q: 0.6, dur: 0.12, g: 0.12, attack: 0.02 });
  } else {
    const v = 0.72 + R() * 0.36;
    burst({ dest: d, f: 2200 + R() * 1600, q: 1.4, dur: 0.06, g: 0.4 * v });            // slug meets platen
    burst({ dest: d, f: 1100 + R() * 300, q: 6, dur: 0.16, g: 0.34 * v });               // metal frame clack
    burst({ dest: d, f: 1700 + R() * 500, q: 2, dur: 0.2, g: 0.36 * v });                // mid-range body the ear picks out
    burst({ dest: d, type: 'lowpass', f: 360 + R() * 140, dur: 0.17, g: 0.6 * v });      // body thud
    burst({ dest: d, type: 'highpass', f: 5200 + R() * 1500, dur: 0.012, g: 0.11 * v }); // tick
    tone({ dest: d, f: 2800 + R() * 1100, dur: 0.06, g: 0.014 * v });                   // faint ring
    burst({ dest: d, f: 850 + R() * 250, q: 3, dur: 0.03, g: 0.09 * v, t: t + 0.05 + R() * 0.02 }); // key return
  }
}
function paperFeed() {
  if (!ready()) return;
  const t = now(), d = bus.writing;
  for (let i = 0; i < 6; i++) burst({ dest: d, type: 'highpass', f: 2400 + R() * 900, dur: 0.012, g: 0.08, t: t + i * 0.03 });
  burst({ dest: d, buf: 'pink', f: 1400, q: 0.5, dur: 0.24, g: 0.1, attack: 0.05 });
}

// ── writing: fountain pen ──────────────────────────────────────────────
let pen = null, penTimer = 0;
function buildPen() {
  const s = loopSrc('white');
  const bp = filt('bandpass', 2600, 0.6), hp = filt('highpass', 900), g = gain(0);
  s.connect(bp).connect(hp).connect(g).connect(bus.writing);
  pen = { bp, g };
}
function penDown() {
  if (!ready()) return;
  burst({ dest: bus.writing, f: 3200, q: 1.5, dur: 0.012, g: 0.07 });
  burst({ dest: bus.writing, type: 'lowpass', f: 400, dur: 0.03, g: 0.07 });
}
function penMove(speed, pressure = 0.5) {
  if (!ready()) return;
  const t = now(), sp = Math.min(speed, 3);
  pen.g.gain.setTargetAtTime(Math.min(0.9, (0.06 + sp * 0.38) * (0.55 + pressure)), t, 0.025);
  pen.bp.frequency.setTargetAtTime(2000 + sp * 900 + R() * 200, t, 0.04);
  clearTimeout(penTimer);
  penTimer = setTimeout(() => ctx && pen.g.gain.setTargetAtTime(0, now(), 0.03), 70);
}
function penUp() {
  if (!ctx) return;
  clearTimeout(penTimer);
  pen.g.gain.setTargetAtTime(0, now(), 0.02);
}

// ── room: curtain, lamp, ambience ──────────────────────────────────────
let curtainNodes = null;
function curtain(dur = 3.2) {
  if (!ready()) return;
  const t = now();
  if (curtainNodes) {
    // reversed mid-travel: hold the old swell where it is, then let it fade
    const c = curtainNodes, gp = c.g.gain;
    if (gp.cancelAndHoldAtTime) gp.cancelAndHoldAtTime(t); else gp.cancelScheduledValues(0);
    gp.setTargetAtTime(0, t, 0.03); setTimeout(() => { c.a.stop(); c.b.stop(); }, 300); }
  const a = loopSrc('pink'), b = loopSrc('brown'), g = gain(0);
  const bp = filt('bandpass', 560, 0.5), lp = filt('lowpass', 190), bg = gain(0.9);
  a.connect(bp).connect(g); b.connect(lp).connect(bg).connect(g); g.connect(bus.room);
  // the fabric is loudest when it moves fastest: the swell follows the
  // curtain's sine-eased speed, quiet at the slow start and the soft stop
  const speed = (x) => Math.sin(Math.PI * Math.min(1, Math.max(0, x)));
  const curve = new Float32Array(64);
  for (let i = 0; i < curve.length; i++) curve[i] = 0.36 * Math.pow(speed(i / (curve.length - 1)), 0.8);
  g.gain.setValueAtTime(0, t); g.gain.setValueCurveAtTime(curve, t + 0.01, dur);
  bp.frequency.setValueAtTime(460, t); bp.frequency.linearRampToValueAtTime(740, t + dur * 0.5); bp.frequency.linearRampToValueAtTime(500, t + dur);
  // rings gliding along the rail: closer together and stronger mid-travel
  for (let x = 0.12; x < dur - 0.15;) {
    const v = speed(x / dur);
    if (v > 0.18) burst({ dest: bus.room, type: 'highpass', f: 2800 + R() * 1500, dur: 0.01, g: (0.02 + R() * 0.03) * v, t: t + x });
    x += 0.06 + R() * 0.06 + (1 - v) * 0.22;
  }
  burst({ dest: bus.room, type: 'lowpass', f: 280, dur: 0.08, g: 0.08, t: t + dur - 0.04 }); // soft stop
  a.stop(t + dur + 0.1); b.stop(t + dur + 0.1);
  curtainNodes = { a, b, g };
}
function lampClick() {
  if (!ready()) return;
  burst({ dest: bus.room, f: 3300, q: 3, dur: 0.016, g: 0.36 });
  burst({ dest: bus.room, type: 'lowpass', f: 520, dur: 0.035, g: 0.3 });
  burst({ dest: bus.room, f: 2400, q: 4, dur: 0.012, g: 0.12, t: now() + 0.028 });
}
function tick() {
  if (!ready()) return;
  burst({ dest: bus.room, f: 2600, q: 3, dur: 0.012, g: 0.14 });
}

// Each place has its own indoor air; only the one you are in is heard.
let placeId = 'study';
const amb = {};
function buildRoom() {
  for (const k of ['study', 'cabin', 'cafe', 'library', 'reading']) { amb[k] = gain(placeId === k ? 1 : 0); amb[k].connect(bus.room); }
  buildLibrary(); buildFireside();
  // café: a murmur of voices a few tables away, and now and then a cup on a saucer
  const mur = filt('lowpass', 1500);
  for (const [f, rate] of [[380, 0.7], [620, 1.1], [900, 0.53]]) {
    const g = gain(0.11), l = ctx.createOscillator(); l.frequency.value = rate; l.connect(gain(0.08)).connect(g.gain); l.start();
    loopSrc('pink').connect(filt('bandpass', f, 1.4)).connect(g).connect(mur);
  }
  mur.connect(gain(0.5)).connect(amb.cafe);
  setInterval(() => {
    if (!ready() || placeId !== 'cafe' || R() > 0.012) return;
    const t = now(), f = 2600 + R() * 1600;
    tone({ dest: amb.cafe, f, dur: 0.09, g: 0.012, t }); tone({ dest: amb.cafe, f: f * 1.5, dur: 0.05, g: 0.005, t });
    if (R() < 0.5) tone({ dest: amb.cafe, f: f * 0.94, dur: 0.07, g: 0.008, t: t + 0.11 + R() * 0.1 });
  }, 120);
  loopSrc('brown').connect(filt('lowpass', 110)).connect(gain(0.3)).connect(amb.study);
  loopSrc('brown').connect(filt('bandpass', 240, 0.5)).connect(gain(0.1)).connect(amb.study); // hearth
  loopSrc('brown').connect(filt('lowpass', 95)).connect(gain(0.2)).connect(amb.cabin);       // still air under a timber roof
  // Fireplace: sparse, low, woody pops with an occasional soft log settle.
  // (A steady stream of short bright ticks reads as rain on glass, so the
  // fire stays warm and infrequent and is never mistaken for weather.)
  setInterval(() => {
    if (!ready() || placeId !== 'study') return;
    const t = now(), r = R();
    if (r < 0.1) {
      const g = 0.02 + R() * R() * 0.06;
      burst({ dest: bus.room, type: 'lowpass', f: 700 + R() * 500, dur: 0.035 + R() * 0.03, g, t });
      burst({ dest: bus.room, f: 420 + R() * 260, q: 3, dur: 0.06, g: g * 0.6, t });
      if (R() < 0.35) burst({ dest: bus.room, type: 'lowpass', f: 900, dur: 0.02, g: g * 0.5, t: t + 0.04 + R() * 0.05 });
    } else if (r < 0.112) {
      burst({ dest: bus.room, buf: 'brown', type: 'lowpass', f: 260, dur: 0.5, g: 0.09, attack: 0.08, t }); // log settles
    }
  }, 120);
}

// The old library: a big, still hall. Its air is low and wide; now and then
// someone turns a page, a chair creaks, a book is set down or footsteps cross
// the far end of the room. The wall clock ticks with its second hand.
function buildLibrary() {
  const hall = gain(1);
  // a short, dark tail so every small sound seems to come from somewhere in a tall room
  const conv = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 400 ? i / 400 : 1); }
  conv.buffer = ir;
  hall.connect(gain(0.75)).connect(amb.library);
  hall.connect(filt('lowpass', 2600)).connect(conv).connect(gain(0.5)).connect(amb.library);
  loopSrc('brown').connect(filt('lowpass', 120)).connect(gain(0.26)).connect(amb.library);           // the room itself
  loopSrc('pink').connect(filt('bandpass', 420, 0.4)).connect(gain(0.012)).connect(amb.library);    // a breath of air from the windows

  // a panner for one sound, let go once it has played
  const pan = (p) => {
    if (!ctx.createStereoPanner) return hall;
    const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(hall);
    setTimeout(() => n.disconnect(), 12000); return n;
  };
  function pageTurn(t, far) {
    // the lift, the swish through the air, and the soft landing
    const d = pan((R() - 0.5) * 1.4), g = 0.05 * far;
    burst({ dest: d, buf: 'pink', f: 1700 + R() * 600, q: 0.7, dur: 0.07, g: g * 0.6, t, attack: 0.02 });
    burst({ dest: d, buf: 'pink', f: 2600 + R() * 900, f2: 1100, q: 0.5, dur: 0.32 + R() * 0.12, g, t: t + 0.08, attack: 0.09 });
    for (let i = 0; i < 4; i++) burst({ dest: d, type: 'highpass', f: 3800 + R() * 2400, dur: 0.008, g: g * (0.25 + R() * 0.3), t: t + 0.12 + R() * 0.3 });
    burst({ dest: d, type: 'lowpass', f: 600, dur: 0.06, g: g * 0.5, t: t + 0.42 + R() * 0.08 });
  }
  function creak(t) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; const f = 150 + R() * 120;
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (1.15 + R() * 0.3), t + 0.35);
    const bp = filt('bandpass', 900 + R() * 500, 4), a = gain(0), g = 0.012 + R() * 0.01;
    a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(g, t + 0.06); a.gain.linearRampToValueAtTime(g * 0.6, t + 0.25); a.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(bp).connect(a).connect(pan((R() - 0.5) * 1.6)); o.start(t); o.stop(t + 0.45);
  }
  function footsteps(t) {
    // someone crossing the far end of the hall, from one side to the other
    const n = 5 + Math.floor(R() * 6), step = 0.52 + R() * 0.12, from = R() < 0.5 ? -0.8 : 0.8, g = 0.05 + R() * 0.03;
    for (let i = 0; i < n; i++) {
      const at = t + i * step + R() * 0.03, k = i / (n - 1), d = pan(from * (1 - 2 * k) * 0.8), env = Math.sin(Math.PI * (0.15 + 0.7 * k));
      burst({ dest: d, type: 'lowpass', f: 380 + R() * 80, dur: 0.07, g: g * env, t: at });
      burst({ dest: d, f: 1500 + R() * 500, q: 2, dur: 0.02, g: g * 0.25 * env, t: at + 0.012 });    // heel on stone
    }
  }
  function bookDown(t) {
    const d = pan((R() - 0.5) * 1.2), g = 0.05 + R() * 0.04;
    burst({ dest: d, type: 'lowpass', f: 260 + R() * 80, dur: 0.12, g, t });
    burst({ dest: d, f: 700 + R() * 200, q: 1.5, dur: 0.05, g: g * 0.35, t: t + 0.005 });
  }

  let nextEvent = 0, nextSec = 0;
  setInterval(() => {
    if (!ready() || placeId !== 'library') { nextSec = 0; return; }
    const t = now();
    // the clock: one tick on every whole second, scheduled a little ahead so a
    // background tab (whose timers only run about once a second) keeps steady time
    const ahead = document.hidden ? 2.5 : 1.2, wall = Date.now() / 1000;
    if (!nextSec) nextSec = Math.ceil(wall + 0.05);
    while (nextSec - wall < ahead) {
      const at = t + (nextSec - wall);
      if (at > t) {
        const tock = nextSec % 2;
        burst({ dest: amb.library, type: 'highpass', f: tock ? 3200 : 3900, dur: 0.009, g: 0.035, t: at });
        burst({ dest: amb.library, f: tock ? 1500 : 1800, q: 6, dur: 0.03, g: 0.016, t: at });
      }
      nextSec++;
    }
    if (t > nextEvent) {
      const r = R();
      if (r < 0.5) { pageTurn(t, 0.5 + R() * 0.5); if (R() < 0.3) pageTurn(t + 0.9 + R() * 0.6, 0.6); }
      else if (r < 0.66) creak(t);
      else if (r < 0.82) footsteps(t);
      else bookDown(t);
      nextEvent = t + 3 + R() * 7;
    }
  }, 120);
}

// The fireside: a log fire close by — its low roar, the crackle and the odd
// snap or hiss of sap — and the two dogs breathing slowly in their sleep, in
// time with how they rise and fall on screen (hearth.js uses the same clock).
const DOG_BREATH = [{ period: 4.6, phase: 0.1, pan: -0.35, g: 0.016 }, { period: 5.3, phase: 0.55, pan: 0.3, g: 0.022 }];
function buildFireside() {
  const out = amb.reading;
  // the roar: a low body that swells and settles
  const roar = gain(0.32), rl = ctx.createOscillator(); rl.frequency.value = 0.23; rl.connect(gain(0.1)).connect(roar.gain); rl.start();
  loopSrc('brown').connect(filt('lowpass', 260)).connect(roar).connect(out);
  const breath = gain(0.05), bl = ctx.createOscillator(); bl.frequency.value = 0.41; bl.connect(gain(0.03)).connect(breath.gain); bl.start();
  loopSrc('pink').connect(filt('bandpass', 700, 0.7)).connect(breath).connect(out);
  const pan = (p) => { if (!ctx.createStereoPanner) return out; const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(out); setTimeout(() => n.disconnect(), 9000); return n; };
  const fireSide = 0.35;   // the fire is a little to the right
  const next = DOG_BREATH.map(() => 0);
  setInterval(() => {
    if (!ready() || placeId !== 'reading') { next.fill(0); return; }
    const t = now();
    // crackle: lots of tiny dry ticks, a few fuller pops, and now and then a snap
    const r = R();
    if (r < 0.55) burst({ dest: out, type: 'highpass', f: 2400 + R() * 3500, dur: 0.004 + R() * 0.01, g: 0.02 + R() * R() * 0.08, t: t + R() * 0.06 });
    if (r < 0.12) { const g = 0.04 + R() * 0.07; burst({ dest: out, f: 900 + R() * 1400, q: 1.2, dur: 0.02 + R() * 0.03, g, t }); burst({ dest: out, type: 'lowpass', f: 500, dur: 0.04, g: g * 0.7, t }); }
    if (r > 0.995) { const d = pan(fireSide + (R() - 0.5) * 0.3); burst({ dest: d, type: 'highpass', f: 1800, dur: 0.05, g: 0.16, t }); burst({ dest: d, type: 'lowpass', f: 700, dur: 0.09, g: 0.12, t: t + 0.01 }); }
    if (r > 0.4 && r < 0.402) burst({ dest: out, buf: 'pink', f: 3800, q: 0.6, dur: 0.9 + R() * 0.8, g: 0.03, attack: 0.25, t });   // sap hissing
    // the dogs: a soft exhale through the nose as each one settles
    const wall = Date.now() / 1000;
    DOG_BREATH.forEach((d, i) => {
      // their breath turns from in to out 40% of the way through each cycle
      let cyc = Math.floor(wall / d.period + d.phase), outAt = (cyc - d.phase + 0.4) * d.period;
      if (outAt < wall) outAt += d.period;
      if (outAt - wall < 0.5 && outAt > next[i]) {
        next[i] = outAt + 0.5;
        const at = t + (outAt - wall), p = pan(d.pan), big = R() < 0.12;
        burst({ dest: p, buf: 'pink', type: 'lowpass', f: big ? 900 : 650, q: 0.4, dur: big ? 2.2 : 1.7, g: d.g * (big ? 1.6 : 1), attack: 0.35, t: at });
        // and the quieter breath in, just before the next one
        burst({ dest: p, buf: 'pink', type: 'bandpass', f: 1100, q: 0.6, dur: 1.1, g: d.g * 0.35, attack: 0.5, t: at + d.period * 0.6 - 0.2 });
      }
    });
  }, 70);
}
// turning a page of a book in your hands
// The sound follows the leaf through its whole turn (reader.js eases it slow,
// fast, slow): a soft peel as it lifts from the spine, the air it moves at its
// fastest, a papery flutter, and the flap as it lies down on the other side.
function pageFlip(dur = 0.78) {
  if (!ready()) return;
  const t = now(), d = bus.writing, g = 0.17;
  if (dur < 0.5) {                                   // no turn to follow: just the sound of a page
    burst({ dest: d, buf: 'pink', f: 2600, f2: 1300, q: 0.5, dur: 0.3, g, attack: 0.06 });
    burst({ dest: d, type: 'lowpass', f: 650, dur: 0.06, g: g * 0.6, t: t + 0.28 });
    return;
  }
  // the peel: the page lets go of the one beneath it
  burst({ dest: d, buf: 'pink', f: 1900 + R() * 400, q: 0.8, dur: 0.07, g: g * 0.5, t, attack: 0.02 });
  for (let i = 0; i < 3; i++) burst({ dest: d, type: 'highpass', f: 4200 + R() * 2200, dur: 0.007, g: g * (0.25 + R() * 0.25), t: t + 0.02 + i * 0.035 + R() * 0.02 });
  // the sweep: loudest and brightest where the leaf moves fastest, mid-turn
  const src = ctx.createBufferSource(); src.buffer = noise.pink;
  const bp = filt('bandpass', 1100, 0.55), env = gain(0);
  bp.frequency.setValueAtTime(1100, t); bp.frequency.linearRampToValueAtTime(3200 + R() * 600, t + dur * 0.5); bp.frequency.linearRampToValueAtTime(1500, t + dur * 0.95);
  env.gain.setValueAtTime(0.0001, t + dur * 0.12);
  env.gain.linearRampToValueAtTime(g * 0.35, t + dur * 0.32);
  env.gain.linearRampToValueAtTime(g * 1.1, t + dur * 0.5);
  env.gain.linearRampToValueAtTime(g * 0.3, t + dur * 0.78);
  env.gain.linearRampToValueAtTime(0.0001, t + dur * 0.98);
  src.connect(bp).connect(env).connect(d);
  src.start(t, R() * 3, dur + 0.2);
  // the edge of the paper fluttering as it goes over
  for (let i = 0; i < 5; i++) burst({ dest: d, type: 'highpass', f: 3600 + R() * 2600, dur: 0.008, g: g * (0.15 + R() * 0.2), t: t + dur * (0.3 + R() * 0.5) });
  // laid down: a soft flap, and the faint slide of paper settling on paper
  burst({ dest: d, type: 'lowpass', f: 520 + R() * 120, dur: 0.07, g: g * 0.9, t: t + dur - 0.01 });
  burst({ dest: d, buf: 'pink', f: 2200, q: 0.6, dur: 0.16, g: g * 0.3, t: t + dur, attack: 0.02 });
}
// the hourglass lifted, turned and set down on the wooden table
function glassTurn(dur = 1.4) {
  if (!ready()) return;
  const t = now(), d = bus.room;
  burst({ dest: d, type: 'lowpass', f: 900, dur: 0.03, g: 0.12, t: t + 0.02 });                       // lifted off the wood
  burst({ dest: d, buf: 'pink', f: 3000, q: 0.5, dur: dur * 0.6, g: 0.05, attack: 0.3, t: t + dur * 0.35 });   // sand sliding inside
  burst({ dest: d, type: 'lowpass', f: 300, dur: 0.12, g: 0.42, t: t + dur - 0.02 });                 // set down
  burst({ dest: d, f: 1600, q: 3, dur: 0.05, g: 0.1, t: t + dur - 0.01 });
  tone({ dest: d, f: 2350, dur: 0.9, g: 0.008, t: t + dur });                                          // the glass rings faintly
}
// the time is up: three soft bells, heard in every room (and over a muted room bus)
function chime() {
  if (!ready()) return;
  const t = now(), out = gain(0.55); out.connect(master); setTimeout(() => out.disconnect(), 9000);
  [[76, 0], [83, 0.42], [88, 0.84], [83, 2.2], [88, 2.62]].forEach(([n, at], i) => {
    const f = mtof(n), g = i < 3 ? 0.11 : 0.07, a = ctx.createGain();
    a.gain.setValueAtTime(0, t + at); a.gain.linearRampToValueAtTime(g, t + at + 0.006); a.gain.setTargetAtTime(0, t + at + 0.02, 0.9);
    a.connect(out);
    for (const [m, v] of [[1, 1], [2.76, 0.18], [5.4, 0.06]]) { const o = ctx.createOscillator(); o.frequency.value = f * m; const og = gain(v); o.connect(og).connect(a); o.start(t + at); o.stop(t + at + 5); }
  });
}

// ── weather ────────────────────────────────────────────────────────────
const wx = {};
let weatherKind = 'rainy', weatherOn = true, nextBird = 0, nextWave = 0, waveTurn = 0;

// One gull cry: a reedy voice that leaps up and falls away ("kee-ow").
function gullCry(t, f, dur, g, pan) {
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f * 0.78, t); o.frequency.linearRampToValueAtTime(f * 1.22, t + dur * 0.22); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + dur);
  const rasp = ctx.createOscillator(); rasp.frequency.value = 38 + R() * 16; const rg = gain(f * 0.035); rasp.connect(rg).connect(o.frequency);   // a throaty edge
  const a = gain(0);
  a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(g, t + Math.min(0.05, dur * 0.2)); a.gain.setValueAtTime(g * 0.9, t + dur * 0.55); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const body = filt('bandpass', 2300 + R() * 500, 1.3), air = filt('lowpass', 5200, 0.5);
  o.connect(body).connect(a); o.connect(gain(0.16)).connect(a);
  let out = a.connect(air);
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out = out.connect(p); }
  out.connect(wx.in);
  o.start(t); rasp.start(t); o.stop(t + dur + 0.05); rasp.stop(t + dur + 0.05);
}
// What gulls actually say: a long call that speeds up, a single drawn-out mew, or a low chuckle.
function gulls(t) {
  const far = 0.35 + R() * 0.65, g = 0.05 * far, f = 880 + R() * 260, pan = R() * 1.4 - 0.5, kind = R();
  if (kind < 0.5) {                        // long call
    const n = 3 + Math.floor(R() * 5); let at = t;
    gullCry(at, f * 0.94, 0.62, g, pan); at += 0.74;
    for (let i = 0; i < n; i++) { const d = Math.max(0.17, 0.34 - i * 0.03); gullCry(at, f * (1 + i * 0.012), d, g * (1 - i * 0.05), pan); at += d + 0.07; }
  } else if (kind < 0.8) {                 // mew
    gullCry(t, f * 0.9, 0.7 + R() * 0.3, g, pan);
    if (R() < 0.5) gullCry(t + 1.1 + R() * 0.4, f * 0.86, 0.6 + R() * 0.3, g * 0.8, pan);
  } else {                                 // chuckle
    const n = 3 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) gullCry(t + i * 0.2, f * 0.72, 0.13, g * 0.8, pan);
  }
  if (R() < 0.35) { const f2 = f * (1.12 + R() * 0.15), p2 = -pan * 0.8; for (let i = 0; i < 2 + Math.floor(R() * 3); i++) gullCry(t + 0.9 + i * 0.42 + R() * 0.1, f2, 0.3, g * 0.45, p2); }   // another answers, further off
}
function buildWeather() {
  wx.in = gain(1); wx.muffle = filt('lowpass', 18000, 0.5); wx.duck = gain(1);
  wx.in.connect(wx.muffle).connect(wx.duck).connect(bus.weather);
  // rain
  wx.rain = gain(0); const mod = gain(1);
  loopSrc('pink').connect(filt('highpass', 520)).connect(filt('lowpass', 8200)).connect(mod);
  loopSrc('brown').connect(filt('lowpass', 380)).connect(gain(0.45)).connect(mod);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11; lfo.connect(gain(0.14)).connect(mod.gain); lfo.start();
  mod.connect(wx.rain).connect(wx.in);
  // wind
  wx.wind = gain(0); const wbp = filt('bandpass', 380, 1.2);
  const wl = ctx.createOscillator(); wl.frequency.value = 0.07; wl.connect(gain(170)).connect(wbp.frequency); wl.start();
  const wg = gain(1); const wl2 = ctx.createOscillator(); wl2.frequency.value = 0.045; wl2.connect(gain(0.4)).connect(wg.gain); wl2.start();
  loopSrc('brown').connect(wbp).connect(wg).connect(wx.wind).connect(wx.in);
  // city
  wx.city = gain(0);
  loopSrc('brown').connect(filt('lowpass', 150)).connect(wx.city).connect(wx.in);
  loopSrc('pink').connect(filt('bandpass', 700, 0.4)).connect(gain(0.06)).connect(wx.city);
  // stream: a low body of water with a few bright currents wandering over it
  wx.stream = gain(0); const bed = filt('lowpass', 3600);
  loopSrc('brown').connect(filt('bandpass', 430, 0.6)).connect(gain(0.55)).connect(bed);
  for (const [f, rate, depth] of [[1050, 0.31, 360], [1800, 0.47, 560], [2700, 0.23, 640]]) {
    const bp = filt('bandpass', f, 2.2), g = gain(0.17);
    const l = ctx.createOscillator(); l.frequency.value = rate; l.connect(gain(depth)).connect(bp.frequency); l.start();
    const l2 = ctx.createOscillator(); l2.frequency.value = rate * 1.7 + 0.05; l2.connect(gain(0.08)).connect(g.gain); l2.start();
    loopSrc('pink').connect(bp).connect(g).connect(bed);
  }
  bed.connect(wx.stream).connect(wx.in);
  // sea: waves that gather and break every ten seconds or so, over a steady low surf
  wx.sea = gain(0); const swell = gain(0.5);
  for (const [rate, depth] of [[0.085, 0.36], [0.13, 0.14]]) { const l = ctx.createOscillator(); l.frequency.value = rate; l.connect(gain(depth)).connect(swell.gain); l.start(); }
  loopSrc('brown').connect(filt('lowpass', 520)).connect(gain(0.9)).connect(swell);
  loopSrc('pink').connect(filt('bandpass', 1500, 0.5)).connect(gain(0.26)).connect(swell);
  loopSrc('brown').connect(filt('lowpass', 190)).connect(gain(0.3)).connect(wx.sea);
  swell.connect(wx.sea).connect(wx.in);
  // single waves over that surf: each one gathers, breaks, and hisses back down the sand.
  // Two voices take turns, so one wave can still be draining away as the next one rises.
  wx.waves = [0, 1].map(() => {
    const lp = filt('lowpass', 300, 0.3), g = gain(0), fizz = gain(0);
    loopSrc('pink').connect(lp); loopSrc('brown').connect(gain(0.7)).connect(lp); lp.connect(g).connect(wx.sea);
    loopSrc('white').connect(filt('highpass', 3200, 0.4)).connect(filt('lowpass', 9000, 0.4)).connect(fizz).connect(wx.sea);
    return { lp, g, fizz };
  });

  setInterval(() => {
    if (!ready() || !weatherOn) return;
    const t = now();
    if (weatherKind === 'rainy') {
      const n = R() < 0.55 ? 1 + (R() < 0.3) : 0;
      for (let i = 0; i < n; i++) burst({ dest: wx.in, f: 2200 + R() * 4200, q: 5, dur: 0.012 + R() * 0.02, g: 0.02 + R() * 0.06, t: t + R() * 0.12 });
      // on a timber roof the drops land lower and rounder
      if (placeId === 'cabin' && R() < 0.7) burst({ dest: wx.in, f: 520 + R() * 900, q: 2.2, dur: 0.02 + R() * 0.03, g: 0.03 + R() * 0.05, t: t + R() * 0.12 });
    }
    const forest = placeId === 'cabin';
    if (placeId === 'cafe') {
      if (t > nextWave) {                              // a wave comes in
        const rough = weatherKind === 'rainy' ? 1.25 : 1;
        nextWave = t + (6.5 + R() * 5) / rough;
        const v = wx.waves[waveTurn ^= 1], a = (0.55 + R() * 0.45) * rough, rise = 2 + R() * 1.2, t1 = t + rise, t2 = t1 + 0.55;
        for (const p of [v.g.gain, v.lp.frequency, v.fizz.gain]) p.cancelScheduledValues(t);
        v.g.gain.setValueAtTime(0.0008, t); v.g.gain.exponentialRampToValueAtTime(0.22 * a, t1); v.g.gain.linearRampToValueAtTime(0.8 * a, t2); v.g.gain.setTargetAtTime(0.0001, t2 + 0.15, 1.25);
        v.lp.frequency.setValueAtTime(260, t); v.lp.frequency.exponentialRampToValueAtTime(800, t1); v.lp.frequency.exponentialRampToValueAtTime(2600 + R() * 1200, t2); v.lp.frequency.setTargetAtTime(420, t2 + 0.2, 1.5);
        v.fizz.gain.setValueAtTime(0.0001, t1); v.fizz.gain.linearRampToValueAtTime(0.085 * a, t2 + 0.5); v.fizz.gain.setTargetAtTime(0.0001, t2 + 0.6, 1.4);
      }
      if (weatherKind !== 'rainy' && t > nextBird) {   // gulls
        nextBird = t + (weatherKind === 'dusk' ? 12 + R() * 20 : 4 + R() * 10);
        gulls(t + 0.05);
      }
    } else if ((weatherKind === 'sunny' || forest) && t > nextBird) {
      nextBird = t + (forest ? (weatherKind === 'sunny' ? 2 + R() * 5 : 9 + R() * 14) : 5 + R() * 11);
      const base = 3000 + R() * 1500, g = forest ? 0.016 : 0.011, song = forest ? R() : 0;
      if (song < 0.5) {                      // a quick run of chirps
        const n = 2 + Math.floor(R() * 4);
        for (let i = 0; i < n; i++) tone({ dest: wx.in, f: base + R() * 500, f2: base + 300 + R() * 900, dur: 0.06 + R() * 0.05, g, t: t + i * (0.1 + R() * 0.05), attack: 0.01 });
      } else if (song < 0.8) {               // two falling whistles
        const f = 2300 + R() * 700;
        tone({ dest: wx.in, f, f2: f * 0.9, dur: 0.2, g, t, attack: 0.02 });
        tone({ dest: wx.in, f: f * 0.8, f2: f * 0.74, dur: 0.26, g: g * 0.9, t: t + 0.3, attack: 0.02 });
      } else {                               // a trill
        const f = 3600 + R() * 900;
        for (let i = 0; i < 9; i++) tone({ dest: wx.in, f: f + (i % 2) * 420, dur: 0.035, g: g * 0.8, t: t + i * 0.055, attack: 0.006 });
      }
    }
  }, 130);
}
function setWeather(kind, fast = false) {
  weatherKind = kind;
  if (!ctx) return;
  // rain, wind, city, stream, sea
  const table = {
    study: { rainy: [0.5, 0.1, 0, 0, 0], snowy: [0, 0.3, 0, 0, 0], sunny: [0, 0.04, 0.4, 0, 0] },
    cabin: { rainy: [0.42, 0.06, 0, 0.16, 0], sunny: [0, 0.07, 0, 0.3, 0] },
    cafe: { sunny: [0, 0.05, 0, 0, 0.5], dusk: [0, 0.04, 0, 0, 0.42], rainy: [0.36, 0.08, 0, 0, 0.4] },
    library: { sunny: [0, 0.035, 0, 0, 0], rainy: [0.34, 0.05, 0, 0, 0] },   // heard through tall old windows
    reading: { snowy: [0, 0.16, 0, 0, 0], sunny: [0, 0.03, 0, 0, 0] },        // wind round the house on a snowy night
  }[placeId];
  const t = now(), lv = table[kind] || Object.values(table)[0];
  const k = weatherOn ? 1 : 0, tc = fast ? 0.12 : 0.8;
  wx.rain.gain.setTargetAtTime(lv[0] * k, t, tc); wx.wind.gain.setTargetAtTime(lv[1] * k, t, tc); wx.city.gain.setTargetAtTime(lv[2] * k, t, tc); wx.stream.gain.setTargetAtTime(lv[3] * k, t, tc); wx.sea.gain.setTargetAtTime(lv[4] * k, t, tc);
}
function setCurtainMuffle(closed, dur = 1.7) {
  if (!ctx) return;
  const t = now();
  wx.muffle.frequency.setTargetAtTime(closed ? 1000 : 18000, t, dur / 3.2);
  wx.duck.gain.setTargetAtTime(closed ? 0.6 : 1, t, dur / 3.2);
}

// ── music (generative "records") ───────────────────────────────────────
const mu = { playing: false, track: 0, crackle: false, timer: 0, bar: 0, next: 0, sess: null, st: {}, src: null, pos: {} };

function buildMusic() {
  mu.in = gain(1);
  const lp = filt('lowpass', 9000, 0.4), hs = filt('highpass', 45);
  const conv = ctx.createConvolver(); const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  conv.buffer = ir;
  mu.in.connect(lp).connect(hs).connect(bus.music);
  hs.connect(conv).connect(gain(0.22)).connect(bus.music);
  // records from files are finished recordings: no room added, just the gentle
  // roll-off of a stylus at the very top and bottom
  mu.direct = gain(0.5);   // mastered recordings are loud: this sets them level with the generated records
  mu.direct.connect(filt('highpass', 28)).connect(bus.music);
  mu.crk = gain(0); mu.crk.connect(bus.music);
  loopSrc('pink').connect(filt('highpass', 3200)).connect(gain(0.012)).connect(mu.crk);
  setInterval(() => {
    if (!ready() || !mu.playing || !mu.crackle) return;
    if (R() < 0.5) burst({ dest: mu.crk, f: 1400 + R() * 5000, q: 1, dur: 0.004 + R() * 0.008, g: 0.012 + R() * R() * 0.09 });
  }, 70);
}

// instruments (d = session gain). Levels are set so a record sits clearly
// above the rain without drowning the typewriter.
function osc(type, f, g, dest, t, stop) {
  const o = ctx.createOscillator();
  if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
  o.frequency.value = f; const a = gain(g); o.connect(a).connect(dest); o.start(t); o.stop(stop); return o;
}
let pianoWave = null;
function piano(d, n, t, dur, vel = 0.6) {
  if (!pianoWave) {
    const h = [0, 1, 0.52, 0.3, 0.2, 0.12, 0.08, 0.05, 0.035, 0.02, 0.012];
    pianoWave = ctx.createPeriodicWave(new Float32Array(h.length), new Float32Array(h));
  }
  const f = mtof(n), a = ctx.createGain(), lp = ctx.createBiquadFilter();
  const tau = dur * 0.5 + (n < 55 ? 0.5 : 0.15), end = t + tau * 5 + 0.3;
  lp.type = 'lowpass'; lp.Q.value = 0.3;
  lp.frequency.setValueAtTime(Math.min(9000, f * (5 + vel * 5)), t); lp.frequency.setTargetAtTime(Math.min(4000, f * 2.2), t, 0.35);
  a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(vel * 0.3, t + 0.006); a.gain.setTargetAtTime(0, t + 0.02, tau);
  lp.connect(a).connect(d);
  osc(pianoWave, f, 1, lp, t, end); osc(pianoWave, f * 1.0018, 0.5, lp, t, end);
}
function ep(d, n, t, dur, vel = 0.6) {
  const f = mtof(n), a = ctx.createGain(), end = t + dur * 2.4 + 0.4;
  a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(vel * 0.34, t + 0.008); a.gain.setTargetAtTime(0, t + 0.03, dur * 0.42);
  a.connect(d);
  osc('sine', f, 1, a, t, end); osc('triangle', f * 1.003, 0.4, a, t, end);
  const h = ctx.createGain(); h.gain.setValueAtTime(0.4, t); h.gain.setTargetAtTime(0.04, t, 0.14); h.connect(a);
  osc('sine', f * 2, 1, h, t, end); osc('sine', f * 4, 0.35, h, t, end);
}
function pad(d, notes, t, dur, vel = 0.5) {
  const lp = filt('lowpass', 900, 0.6), a = ctx.createGain(), end = t + dur + 3;
  a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(vel * 0.085, t + dur * 0.35); a.gain.setTargetAtTime(0, t + dur * 0.8, 0.9);
  lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(800, t + dur);
  lp.connect(a).connect(d);
  for (const n of notes) { const f = mtof(n); osc('sawtooth', f * 0.996, 1, lp, t, end); osc('sawtooth', f * 1.005, 1, lp, t, end); osc('sine', f * 2, 0.6, lp, t, end); }
}
function bass(d, n, t, dur, vel = 0.6) {
  const f = mtof(n), a = ctx.createGain(), lp = filt('lowpass', 520, 0.5), end = t + dur + 0.8;
  a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(vel * 0.5, t + 0.015); a.gain.setTargetAtTime(0, t + 0.05, dur * 0.4);
  lp.connect(a).connect(d);
  osc('sine', f, 1, lp, t, end); osc('sawtooth', f, 0.35, lp, t, end); osc('sine', f * 2, 0.3, lp, t, end); // upper partials carry on small speakers
}
function bell(d, n, t, vel = 0.5, decay = 0.4) {
  const f = mtof(n), a = ctx.createGain(), end = t + decay * 6;
  a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(vel * 0.2, t + 0.004); a.gain.setTargetAtTime(0, t + 0.01, decay);
  a.connect(d); osc('sine', f, 1, a, t, end); osc('sine', f * 3.01, 0.1, a, t, end); osc('sine', f * 4.2, 0.03, a, t, end);
}
// plucked string (Karplus–Strong), rendered once per pitch
const ksCache = {};
function pluck(d, n, t, vel = 0.6) {
  let buf = ksCache[n];
  if (!buf) {
    const sr = ctx.sampleRate, N = Math.max(2, Math.round(sr / mtof(n))), len = Math.floor(sr * 2.4);
    buf = ksCache[n] = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0), ring = new Float32Array(N);
    let prev = 0; for (let i = 0; i < N; i++) { prev = ring[i] = (R() * 2 - 1) * 0.55 + prev * 0.45; }
    const damp = n < 52 ? 0.9975 : 0.996;
    for (let i = 0, k = 0; i < len; i++) { const nx = (k + 1) % N, v = ring[k]; out[i] = v; ring[k] = (v + ring[nx]) * 0.5 * damp; k = nx; }
  }
  const s = ctx.createBufferSource(); s.buffer = buf; const a = gain(vel * 0.95); s.connect(a).connect(d); s.start(t);
}
const hat = (d, t, v) => burst({ dest: d, type: 'highpass', f: 6500, dur: 0.07, g: 0.06 * v, t, attack: 0.004 });
function kick(d, t, v = 1) { tone({ dest: d, f: 135, f2: 46, dur: 0.3, g: 0.75 * v, t }); burst({ dest: d, type: 'lowpass', f: 900, dur: 0.02, g: 0.2 * v, t }); }
function snare(d, t, v = 1) { burst({ dest: d, f: 1900, q: 0.7, dur: 0.17, g: 0.32 * v, t }); tone({ dest: d, f: 210, f2: 150, dur: 0.11, g: 0.2 * v, t }); }
const pick = (a) => a[Math.floor(R() * a.length)];
const walk = (st, scale, steps = [-2, -1, -1, 1, 1, 2]) => { st.i = Math.max(0, Math.min(scale.length - 1, (st.i ?? scale.length >> 1) + pick(steps))); return scale[st.i]; };

const TRACKS = [
  { // 1 ── slow jazz trio: electric piano, upright bass, brushes
    name: 'Midnight Rain', kind: 'Slow Jazz', bpm: 66, beats: 4, tone: 5200,
    ch: [[38, [53, 57, 60, 64]], [43, [53, 59, 64, 69]], [36, [52, 55, 59, 62]], [33, [55, 58, 61, 64]]],
    scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79],
    bar(d, i, t, b, st) {
      const k = i % 4, [root, ch] = this.ch[k];
      ch.forEach((n, j) => ep(d, n, t + j * 0.022, b * 3, 0.5));
      if (R() < 0.55) ch.forEach((n, j) => ep(d, n, t + b * 2.5 + j * 0.015, b * 1.2, 0.3));
      const r = root < 36 ? root + 12 : root;
      bass(d, r, t, b * 1.6, 0.7); bass(d, r + 7, t + b * 2, b * 1.2, 0.55); if (R() < 0.5) bass(d, r + pick([3, 5, 10]), t + b * 3, b * 0.8, 0.45);
      hat(d, t + b, 1); hat(d, t + b * 3, 1); if (R() < 0.4) hat(d, t + b * 3.66, 0.6); if (R() < 0.3) hat(d, t + b * 1.66, 0.5);
      for (let s = 0; s < 8; s++) {
        if (R() > (st.on ? 0.55 : 0.3)) { st.on = false; continue; }
        st.on = true;
        let n = walk(st, this.scale); if (k === 3) n = { 72: 73, 77: 76, 65: 64 }[n] ?? n;
        ep(d, n, t + (s >> 1) * b + (s & 1 ? b * 0.64 : 0), b * 1.1, 0.5 + R() * 0.3);
      }
    },
  },
  { // 2 ── ambient: slow pads and distant bells, no pulse
    name: 'Velvet Hours', kind: 'Ambient', bpm: 52, beats: 4, tone: 4200,
    ch: [[41, [53, 57, 60, 64]], [45, [57, 60, 64, 67]], [38, [53, 57, 60, 64]], [46, [58, 62, 65, 69]]],
    bar(d, i, t, b) {
      const [root, ch] = this.ch[i % 4];
      pad(d, ch, t, b * 4, 0.6); bass(d, root, t, b * 4, 0.36);
      const n = 2 + Math.floor(R() * 3);
      for (let j = 0; j < n; j++) bell(d, pick(ch) + pick([12, 24, 24]), t + Math.floor(R() * 8) * b * 0.5, 0.3 + R() * 0.3, 0.75);
    },
  },
  { // 3 ── solo piano in three: a low note, a held chord, an unhurried melody
    name: 'Paper Moonlight', kind: 'Classical Piano', bpm: 72, beats: 3, tone: 6500,
    ch: [[41, [57, 60, 64]], [48, [55, 59, 64]], [38, [57, 60, 65]], [45, [55, 60, 64]], [46, [57, 62, 65]], [45, [57, 60, 65]], [43, [58, 62, 65]], [48, [58, 64, 67]]],
    scale: [65, 67, 69, 70, 72, 74, 76, 77, 79, 81],
    bar(d, i, t, b, st) {
      const [root, ch] = this.ch[i % 8];
      piano(d, root, t, b * 3, 0.62);
      ch.forEach((n, j) => piano(d, n, t + b + j * 0.012, b * 2, 0.36));
      for (const at of pick([[0], [0, 2], [0, 1, 2], [0, 1.5], [1, 2], [0, 2, 2.5]])) {
        let n = walk(st, this.scale, [-2, -1, -1, 0, 1, 1, 2]);
        if (at === 0 && R() < 0.6) { n = pick(ch) + 12; st.i = Math.max(0, this.scale.indexOf(n)); }
        piano(d, n, t + at * b, b * 1.6, 0.6 + R() * 0.2);
      }
    },
  },
  { // 4 ── lo-fi: dusty drums, mellow keys, a head-nod bass line
    name: 'Rooftop Static', kind: 'Lo-Fi Beats', bpm: 78, beats: 4, tone: 2700,
    ch: [[38, [57, 61, 64, 66]], [35, [57, 62, 66, 69]], [43, [59, 62, 66, 69]], [45, [55, 62, 64, 67]]],
    scale: [74, 76, 78, 81, 83, 86],
    bar(d, i, t, b, st) {
      const [root, ch] = this.ch[i % 4], sw = b * 0.58, r = root < 38 ? root + 12 : root;
      kick(d, t, 1); kick(d, t + b * 2 + sw, 0.85); if (i % 2 && R() < 0.6) kick(d, t + b * 3 + sw, 0.6);
      snare(d, t + b, 0.9); snare(d, t + b * 3, 1);
      for (let s = 0; s < 4; s++) { hat(d, t + s * b, 0.9); hat(d, t + s * b + sw, 0.5 + R() * 0.3); }
      ch.forEach((n, j) => ep(d, n, t + j * 0.03, b * 2.2, 0.5));
      ch.forEach((n, j) => ep(d, n, t + b * 2 + sw + j * 0.02, b * 1.4, 0.36));
      bass(d, r, t, b * 1.5, 0.75); bass(d, r, t + b * 2 + sw, b, 0.6); if (R() < 0.5) bass(d, r + 7, t + b * 3 + sw, b * 0.5, 0.5);
      if (i % 2 === 1 || R() < 0.3) for (const at of pick([[0.58, 1.58], [1, 2.58], [2, 2.58, 3.58], [3]])) bell(d, walk(st, this.scale), t + at * b, 0.34 + R() * 0.2, 0.3);
    },
  },
  { // 5 ── fingerpicked acoustic guitar
    name: 'Open Window', kind: 'Acoustic Guitar', bpm: 92, beats: 4, tone: 7000,
    ch: [[48, 55, [60, 64, 67]], [47, 55, [59, 62, 67]], [45, 52, [57, 60, 64]], [41, 48, [57, 60, 65]], [48, 55, [60, 64, 67]], [40, 47, [55, 59, 64]], [41, 48, [57, 60, 65]], [43, 50, [55, 59, 62]]],
    bar(d, i, t, b) {
      const [b1, b2, up] = this.ch[i % 8], e = b / 2;
      const pat = i % 4 === 3 ? [0, 1, 2, 1, 0, 2, 1, 0] : [0, 2, 1, 2, 0, 1, 2, 1];
      for (let s = 0; s < 8; s++) {
        const tt = t + s * e + (s & 1 ? e * 0.08 : 0);
        if (s === 0) pluck(d, b1, tt, 0.85); else if (s === 4) pluck(d, b2, tt, 0.7);
        if (s !== 0 || R() < 0.5) pluck(d, up[pat[s]], tt + 0.006, 0.42 + R() * 0.2);
      }
      if (R() < 0.45) pluck(d, pick(up) + 12, t + pick([1, 2, 3]) * b, 0.6);
    },
  },
];

// ── records from files ─────────────────────────────────────────────────
// MP3s in assets/music become records on the turntable, ahead of the
// generated ones. Names come from assets/music/records.json; a file that is
// not listed there is named from its filename.
const MUSIC_DIR = 'assets/music/';
const buffers = new Map();   // url → Promise<AudioBuffer>; only the last two are kept, as decoded audio is large
function loadBuffer(url) {
  let p = buffers.get(url);
  if (p) buffers.delete(url);
  else p = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then((a) => ctx.decodeAudioData(a));
  buffers.set(url, p);
  while (buffers.size > 2) buffers.delete(buffers.keys().next().value);
  p.catch(() => buffers.delete(url));
  return p;
}
const titleCase = (s) => s.replace(/[_-]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
function nameFromFile(f) {
  const base = f.replace(/\.[^.]+$/, '').replace(/[-_ ]\d{4,}$/, ''), cut = base.indexOf('-');
  return cut > 0 ? { name: titleCase(base.slice(cut + 1)), kind: titleCase(base.slice(0, cut)) } : { name: titleCase(base), kind: 'Record' };
}
let recordsLoaded = false, onRecordEnd = null;
async function loadRecords() {
  if (recordsLoaded) return;
  recordsLoaded = true;
  let names = {}, files = null;
  try { const r = await fetch(MUSIC_DIR + 'records.json', { cache: 'no-cache' }); if (r.ok) names = await r.json(); } catch { /* none */ }
  try { const r = await fetch('api/music', { cache: 'no-cache' }); if (r.ok) files = await r.json(); } catch { /* a plain static server */ }
  if (!files) files = Object.keys(names);
  const order = [...Object.keys(names).filter((f) => files.includes(f)), ...files.filter((f) => !(f in names)).sort()];
  TRACKS.unshift(...order.map((f) => ({ ...nameFromFile(f), ...names[f], url: MUSIC_DIR + encodeURIComponent(f), tone: 15000 })));
}
function startRecord(delay) {
  startSession(delay);
  const sess = mu.sess, i = mu.track, tr = TRACKS[i], from = mu.pos[i] || 0;
  loadBuffer(tr.url).then((buf) => {
    if (sess !== mu.sess || !mu.playing || !ctx) return;
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(sess);
    const at = Math.max(now() + 0.05, mu.next), off = from < buf.duration - 2 ? from : 0;
    src.start(at, off);
    mu.src = { node: src, at, off, track: i };
    src.onended = () => {
      if (mu.src?.node !== src || !mu.playing) return;          // stopped by hand, not run out
      mu.src = null; mu.pos[i] = 0; onRecordEnd?.(i + 1);
    };
  }).catch(() => { if (sess === mu.sess && mu.playing) { mu.pos[i] = 0; onRecordEnd?.(i + 1); } });   // skip a record that won't play
}

function schedule() {
  if (!ready() || !mu.playing) return;
  const tr = TRACKS[mu.track], b = 60 / tr.bpm;
  if (tr.url) return;                       // a record from a file plays by itself
  const ahead = now() + (document.hidden ? 3 : 1.4);
  // a generated record has a side's length too: it plays out its last bars,
  // fades, and the next record goes on
  if (ahead >= mu.genEnd && mu.fading !== mu.sess) {
    const sess = mu.sess, i = mu.track, end = mu.genEnd;
    mu.fading = sess;
    sess.gain.setTargetAtTime(0, Math.max(now(), end - 4), 1.1);
    clearTimeout(mu.endTimer);
    mu.endTimer = setTimeout(() => { if (sess === mu.sess && mu.playing) { mu.pos[i] = 0; onRecordEnd?.(i + 1); } }, Math.max(0, end - now()) * 1000 + 600);
  }
  if (mu.fading === mu.sess) return;
  if (mu.next < now()) mu.next = now() + 0.05;
  // a background tab only wakes its timers about once a second, so look further ahead there
  while (mu.next < now() + (document.hidden ? 3 : 1.4)) { tr.bar(mu.sess, mu.bar, mu.next, b, mu.st); mu.bar++; mu.next += b * tr.beats; }
}
function endSession(fade = 0.25) {
  const s = mu.sess; if (!s) return; mu.sess = null;
  clearTimeout(mu.endTimer);
  // a generated record remembers how far it had played, like a file does
  if (mu.genStart != null) { mu.pos[mu.sessTrack] = Math.max(0, now() - mu.genStart); mu.genStart = null; }
  if (mu.src) {                             // remember where the needle was lifted
    const r = mu.src; mu.src = null;
    mu.pos[r.track] = Math.max(0, r.off + now() - r.at);
    try { r.node.stop(now() + fade * 5); } catch { /* already stopped */ }
  }
  s.gain.setTargetAtTime(0, now(), fade); setTimeout(() => s.disconnect(), fade * 6000 + 300);
}
function startSession(delay) {
  endSession(0.1);
  const tr = TRACKS[mu.track];
  mu.sess = gain(0); mu.sess.connect(filt('lowpass', tr.tone || 6000, 0.4)).connect(tr.url ? mu.direct : mu.in);
  mu.sess.gain.setValueAtTime(0, now()); mu.sess.gain.setTargetAtTime(1, now() + delay, 0.25);
  mu.bar = 0; mu.st = {}; mu.next = now() + delay; mu.sessTrack = mu.track;
  if (!tr.url) {
    // pick up where this record was lifted, unless it was nearly over
    let used = mu.pos[mu.track] || 0; if (GEN_LEN - used < 25) used = 0;
    mu.genStart = now() + delay - used; mu.genEnd = mu.genStart + GEN_LEN;
  }
}
const GEN_LEN = 210;   // seconds in a side of a generated record
const music = {
  get tracks() { return TRACKS.map((t) => ({ name: t.name, kind: t.kind, file: !!t.url })); },
  loadRecords,
  onEnded(fn) { onRecordEnd = fn; },    // a record has played to the end
  level: () => level('music'),
  play() {
    mu.playing = true;
    if (!ready()) return;
    const t = now();
    burst({ dest: bus.music, type: 'lowpass', f: 180, dur: 0.14, g: 0.7 });            // needle lands
    burst({ dest: bus.music, type: 'highpass', f: 2800, dur: 0.03, g: 0.14, t: t + 0.01 });
    mu.crk.gain.setTargetAtTime(mu.crackle ? 1 : 0, t + 0.05, 0.1);
    if (TRACKS[mu.track].url) startRecord(0.9); else startSession(0.9);
    clearInterval(mu.timer); mu.timer = setInterval(schedule, 200); schedule();
  },
  pause() {
    mu.playing = false;
    if (!ctx) return;
    clearInterval(mu.timer);
    endSession(0.3);
    mu.crk.gain.setTargetAtTime(0, now(), 0.15);
    if (ready()) burst({ dest: bus.music, f: 1800, q: 2, dur: 0.02, g: 0.12 });
  },
  setTrack(i) {
    const next = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    if (next === mu.track && mu.sess) return;
    mu.track = next; mu.pos[next] = 0;      // a record chosen afresh starts from the beginning
    if (mu.playing && ready()) {
      tick();
      burst({ dest: bus.music, type: 'lowpass', f: 180, dur: 0.14, g: 0.6, t: now() + 0.5 });
      if (TRACKS[next].url) startRecord(1.2); else startSession(1.2);
    }
  },
  setCrackle(on) { mu.crackle = on; if (ctx) mu.crk.gain.setTargetAtTime(on && mu.playing ? 1 : 0, now(), 0.1); },
  get playing() { return mu.playing; },
};

// ── lifecycle ──────────────────────────────────────────────────────────
function init() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC({ latencyHint: 'interactive' });
  master = gain(muted ? 0 : vol.master);
  limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -1.5; limiter.ratio.value = 12; limiter.knee.value = 2; limiter.attack.value = 0.003; limiter.release.value = 0.2;
  master.connect(limiter).connect(ctx.destination);
  for (const k of ['writing', 'room', 'weather', 'music']) { bus[k] = gain(vol[k] * BUS_SCALE[k]); bus[k].connect(master); }
  makeNoise(); buildPen(); buildRoom(); buildWeather(); buildMusic();
  setWeather(weatherKind);
  const go = () => { if (mu.playing) music.play(); };
  if (ctx.state === 'running') go(); else ctx.resume().then(go, () => {});
}

// browsers may leave or put the context in "suspended"; any real gesture wakes it
for (const ev of ['pointerdown', 'keydown']) {
  addEventListener(ev, () => { if (ctx && ctx.state === 'suspended') ctx.resume().then(() => { if (mu.playing && !mu.sess) music.play(); }, () => {}); }, true);
}
// The room keeps playing while you are in another tab or window; it only
// falls silent when this tab is closed (or navigated away from).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
});
addEventListener('pagehide', () => { if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {}); ctx = null; });

// RMS level of a bus (after its volume) — used to verify that sound is really produced
const meters = {};
function level(k) {
  if (!ctx) return 0;
  let a = meters[k];
  if (!a) { a = meters[k] = ctx.createAnalyser(); a.fftSize = 4096; (k === 'out' ? limiter : bus[k]).connect(a); }
  const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d);
  let s = 0; for (const v of d) s += v * v;
  return Math.sqrt(s / d.length);
}

export const audio = {
  level,
  keyGain(v) { if (keyOut) keyOut.gain.value = v; return keyOut ? keyOut.gain.value : null; }, // for level checks
  setWeatherOn(on) { weatherOn = on; setWeather(weatherKind, true); },
  setPlace(id) {
    placeId = id;
    if (!ctx) return;
    for (const k in amb) amb[k].gain.setTargetAtTime(k === id ? 1 : 0, now(), 0.4);
    setWeather(weatherKind);
  },
  get state() { return ctx ? ctx.state : 'none'; },
  init, key, paperFeed, penDown, penMove, penUp, curtain, lampClick, tick, pageFlip, glassTurn, chime, setWeather, setCurtainMuffle, music,
  setVolume(k, v) { vol[k] = v; applyVolumes(); },
  setVolumes(v) { Object.assign(vol, v); applyVolumes(); },
  setMuted(m) { muted = m; applyVolumes(); },
  get started() { return !!ctx; },
};
