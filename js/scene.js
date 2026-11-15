// Scene engine: camera, light, weather, curtains, steam, vinyl, key animation.
// It only reads settings and draws — it never touches the writing content.

import { PLACES, placeOf } from './places.js';
import { createSeaside } from './seaside.js';
import { createLibrary } from './library.js';
import { createHearth } from './hearth.js';
import { createHourglass, GLASS_MS } from './hourglass.js';

const W = 1672, H = 941;
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const R = Math.random;

export function createScene(settings) {
  const body = document.body, root = document.documentElement;
  const stage = $('#stage'), bg = $('.bg');
  let place = placeOf(settings.place);
  // the weather this place can actually show (a cabin in summer has no snow)
  const wxKind = () => {
    const w = place.id === 'study' ? settings.weather : settings.wxBy?.[place.id];
    return place.weathers.includes(w) ? w : place.weathers[0];
  };
  // the study's curtains and tonearm are woven from its own painting
  const studyImg = new Image(); studyImg.src = PLACES.study.img;
  const state = { view: 'room', caretY: 120, paperTop: 362, scroll: 0, scrollMax: 0 };

  // ── camera ───────────────────────────────────────────────────────────
  // frames the typing line, the platen and the whole keyboard
  function layout() {
    const vw = innerWidth, vh = innerHeight, cover = Math.max(vw / W, vh / H);
    let s, cx, cy;
    if (state.view === 'room') {
      s = cover * settings.roomZoom; cx = 836; cy = 470 + (settings.roomZoom - 1) * 70;
    } else if (place.reader) {
      // reading: the open book, as large as the window allows
      const r = place.readRect;
      s = Math.max(cover, Math.min(vw / r.w, vh / r.h) * settings.focusZoom);
      cx = r.x + r.w / 2; cy = r.y + r.h / 2;
    } else if (settings.mode === 'typing') {
      const r = place.typeRect, pp = place.paper;
      s = Math.max(cover, Math.min(vw / r.w, vh / r.h) * settings.focusZoom);
      cx = r.x + r.w / 2; cy = r.y + r.h / 2;
      const half = vh / (2 * s);
      if (r.h / 2 > half) cy = clamp(state.caretY, r.y + half, r.y + r.h - half);
      // scrolled back to read: look further up the sheet, stopping with the
      // top of the page clear of the toolbar
      const topCy = Math.max(half, state.paperTop + half - 84 / s);
      state.scrollMax = Math.max(0, cy - topCy);
      state.scroll = Math.min(state.scroll, state.scrollMax);
      cy -= state.scroll;
      const halfW = vw / (2 * s);
      if (r.w / 2 > halfW) cx = clamp(cx, pp.x + halfW - 14, pp.x + pp.w - halfW + 14);
    } else {
      s = cover * 3.1; [cx, cy] = place.deskCam;
    }
    const tx = clamp(vw / 2 - cx * s, vw - W * s, 0), ty = clamp(vh / 2 - cy * s, vh - H * s, 0);
    stage.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`;
  }
  function setView(v) {
    state.view = v; state.scroll = 0;
    body.classList.toggle('view-room', v === 'room');
    body.classList.toggle('view-focus', v === 'focus');
    layout();
  }
  function setCaretY(y, paperTop) {
    if (paperTop != null) state.paperTop = paperTop;
    if (Math.abs(y - state.caretY) > 0.5) { state.caretY = y; if (state.view === 'focus') layout(); }
  }
  // scroll the Focus view up and down the sheet (dy in screen px, + is down)
  let scrollAnim = 0;
  function scrollPaper(dy) {
    const s = stage.getBoundingClientRect().width / W;
    state.scroll = Math.max(0, Math.min(state.scrollMax, state.scroll - dy / s));
    body.classList.add('no-anim'); layout();
    clearTimeout(scrollAnim); scrollAnim = setTimeout(() => body.classList.remove('no-anim'), 140);
  }
  function followCaret() { if (state.scroll) { state.scroll = 0; if (state.view === 'focus') layout(); } }
  addEventListener('resize', () => { body.classList.add('no-anim'); layout(); requestAnimationFrame(() => body.classList.remove('no-anim')); });

  // ── light ────────────────────────────────────────────────────────────
  const lightDark = $('.light-dark'), lampCap = $('.lamp-cap'), lampGlow = $('.lamp-glow'), lightDay = $('.light-day'), lightCool = $('.light-cool');
  function applyLight() {
    const e = settings.lampOn ? settings.lamp : 0;
    // window light follows the curtains as they move
    const open = place.curtains ? 1 - Math.min(1, Math.max(0, (cTop + cBot) / 2)) : 1, through = 0.25 + 0.75 * open;
    const day = wxKind() === 'sunny' ? through * place.day : 0;
    const cool = wxKind() === 'snowy' ? through : 0;
    // a room with daylight in it only loses part of its light with the lamp
    const dark = clamp((0.7 - e) / 0.7, 0, 1) * place.dim;
    const glow = clamp((e - 0.7) / 0.3, 0, 1);
    lightDark.style.opacity = (dark * 0.92 * (1 - day * 0.6)).toFixed(3);
    lampCap.style.opacity = clamp(1 - e / 0.4, 0, 1).toFixed(3);
    root.style.setProperty('--flame', clamp(e / 0.4, 0, 1).toFixed(3));
    lampGlow.style.opacity = (glow * 0.85).toFixed(3);
    lightDay.style.opacity = day.toFixed(3);
    lightCool.style.opacity = cool.toFixed(3);
    const pb = 0.46 + 0.54 * (1 - dark) + glow * 0.07 + day * 0.14 * (0.4 + dark);
    root.style.setProperty('--paper-b', pb.toFixed(3));
    root.style.setProperty('--desk-b', Math.min(1, 0.55 + 0.45 * (1 - dark) + day * 0.2 * dark).toFixed(3));
    body.classList.toggle('lamp-off', !settings.lampOn);
  }

  // ── window: weather + curtains ───────────────────────────────────────
  function applyWeather() {
    for (const k of ['rainy', 'snowy', 'sunny', 'dusk']) body.classList.toggle('weather-' + k, wxKind() === k);
    seedWeather(); applyLight();
  }
  function applyCurtains() {
    body.classList.toggle('curtains-closed', !settings.curtainsOpen); applyLight();
    curtainMoveUntil = performance.now() + C_DUR + 900;
    cFrom = cTop; cTarget = settings.curtainsOpen ? 0 : 1; cT0 = performance.now();
    if (body.classList.contains('booting')) { cTop = cBot = cTarget; cVel = 0; drawCurtains(); applyLight(); }
  }
  let curtainMoveUntil = 0;

  // ── curtains ─────────────────────────────────────────────────────────
  // Closed curtains are woven from the sheer already hanging at the left of
  // the window in the artwork, so colour, translucency and folds match. They
  // slide out from behind the side curtains, hang from the ceiling to behind
  // the desk, and stay behind the hanging plant, typewriter, candle, plant pot
  // and the turntable's glass lid.
  const CX = 740, CW = 600, CH = 576, CK = 1.5;           // canvas placement (stage px) and resolution
  const WIN_L = 745, WIN_R = 1338, MEET = 1046, DESK_Y = 574;
  const ccv = $('#curtainCanvas'), cc = ccv.getContext('2d');
  ccv.width = CW * CK; ccv.height = CH * CK;
  let tex = null, occl = null;
  // 0 = open, 1 = closed. cTop is the rail (the top edge); cBot is the hem.
  let cTop = settings.curtainsOpen ? 0 : 1, cBot = cTop, cVel = 0, cFrom = cTop, cTarget = cTop, cT0 = 0;
  const C_DUR = 3200, C_FADE = 1200;   // slide, or a still cross-fade when Reduce motion is on

  function buildCurtains() {
    const img = studyImg;
    // a clean strip of the sheer, clear of the lamp, the steam and the typewriter
    tex = document.createElement('canvas'); tex.width = Math.round(88 * CK); tex.height = Math.round(DESK_Y * CK);
    tex.getContext('2d').drawImage(img, 650, 0, 88, 348, 0, 0, tex.width, tex.height); // stops above the paper

    occl = document.createElement('canvas'); occl.width = ccv.width; occl.height = ccv.height;
    const o = occl.getContext('2d');
    // the hanging plant, picked out of the artwork by colour
    const src = document.createElement('canvas'); src.width = CW; src.height = CH;
    const s = src.getContext('2d', { willReadFrequently: true });
    s.drawImage(img, CX, 0, CW, CH, 0, 0, CW, CH);
    const px = s.getImageData(0, 0, CW, CH), d = px.data, m = s.createImageData(CW, CH), md = m.data;
    // Leaves here are dark olive with almost no blue, while the purple sky,
    // the city lights and the wall all carry more blue. (Only above the sill,
    // so the small potted plant stays behind the sheer with its pot.)
    for (let y = 0; y < 345; y++) for (let x = 0; x < CW; x++) {
      if (x + CX < 1110) continue;
      const i = (y * CW + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      if (g < r * 0.55) continue;
      const lean = (g - b) / Math.max(g, 1), green = g - Math.max(r, b) * 1.02;
      md[i + 3] = Math.max(0, Math.min(255, Math.max((lean - 0.42) * 900, green * 25)));
    }
    s.putImageData(m, 0, 0);
    o.filter = 'blur(1.2px)';
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) o.drawImage(src, dx * CK, dy * CK, ccv.width, ccv.height);
    o.filter = 'none';
    // objects standing in front of the curtains, traced from the artwork
    o.setTransform(CK, 0, 0, CK, -CX * CK, 0); o.fillStyle = '#000';
    const poly = (pts, a = 1) => { o.globalAlpha = a; o.beginPath(); pts.forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y))); o.closePath(); o.fill(); };
    o.filter = 'blur(0.7px)';
    poly([ // typewriter: knobs, levers, platen and body (the paper above is a separate layer)
      [589, 505], [592, 486], [606, 480], [618, 462], [628, 455], [640, 459], [652, 456], [662, 461], [672, 470], [680, 478],
      [998, 478], [1008, 470], [1022, 462], [1033, 456], [1043, 459], [1050, 470], [1056, 484], [1068, 485], [1076, 494],
      [1077, 528], [1070, 536], [1052, 540], [1032, 546], [1032, CH], [652, CH], [652, 546], [624, 544], [600, 538], [590, 528],
    ]);
    o.beginPath(); o.ellipse(1183, 527, 35.5, 6.5, 0, 0, 6.3); o.fill();                                     // candle rim
    poly([[1147.5, 527], [1218.5, 527], [1218.5, CH], [1147.5, CH]]);                                          // candle glass
    poly([[1236, 520], [1272, 513], [1278, 501], [WIN_R + 12, 499], [WIN_R + 12, CH], [1236, CH]]);          // turntable body and platter
    poly([[1257, 352], [WIN_R + 12, 352], [WIN_R + 12, 499], [1322, 505], [1245, 371]], 0.45);              // glass lid (see-through)
    o.filter = 'none'; o.globalAlpha = 1; o.setTransform(1, 0, 0, 1, 0, 0);
    drawCurtains();
  }

  // Each half is a run of folds hanging from the rail. As it is drawn, the
  // leading fold travels first and the folds behind it spread out one after
  // another, so the fabric unfurls instead of stretching. Opening gathers
  // them back up against the side curtain.
  const FOLDS = 5, BANDS = 40;
  const shade = document.createElement('canvas'); shade.width = 32; shade.height = 1;
  { const s = shade.getContext('2d'), g = s.createLinearGradient(0, 0, 32, 0);
    g.addColorStop(0, 'rgba(24,10,20,0)'); g.addColorStop(1, 'rgba(24,10,20,.34)'); s.fillStyle = g; s.fillRect(0, 0, 32, 1); }

  function foldEdges(p) {
    // fold boundaries measured from the rail; near the rail the cloth stays
    // bunched until the leading edge has travelled well out
    const spread = 1 + 1.8 * Math.pow(1 - Math.min(1, Math.max(0, p)), 1.4), out = [0];
    for (let k = 1; k <= FOLDS; k++) out.push(p * Math.pow(k / FOLDS, spread));
    return out;
  }
  function drawBand(rail, full, p, fromRight, y, h) {
    if (p * full < 0.4) return 0;
    const e = foldEdges(p), sy = y * CK, sh = h * CK;
    for (let k = 1; k <= FOLDS; k++) {
      const a = e[k - 1] * full, w = e[k] * full - a;
      if (w < 0.05) continue;
      const x0 = fromRight ? rail - a - w : rail + a, flip = (k + (fromRight ? 1 : 0)) % 2 === 0;
      if (flip) { cc.save(); cc.translate(x0 + w, 0); cc.scale(-1, 1); cc.drawImage(tex, 0, sy, tex.width, sh, 0, y, w + 0.7, h + 0.5); cc.restore(); }
      else cc.drawImage(tex, 0, sy, tex.width, sh, x0, y, w + 0.7, h + 0.5);
    }
    return p * full;
  }

  function drawCurtains() {
    cc.setTransform(1, 0, 0, 1, 0, 0); cc.clearRect(0, 0, ccv.width, ccv.height);
    if (!tex || (cTop <= 0.001 && cBot <= 0.001)) return;
    const still = settings.reduceMotion, fade = still ? Math.min(1, Math.max(0, cTop)) : 1;
    cc.setTransform(CK, 0, 0, CK, -CX * CK, 0); cc.globalAlpha = 0.93 * fade;
    const fullL = MEET - WIN_L + 7, fullR = WIN_R - MEET + 7, bh = DESK_Y / BANDS, leads = [];
    for (let b = 0; b < BANDS; b++) {
      // the hem trails the rail a little while the curtain moves
      const hgt = (b + 0.5) / BANDS, p = still ? 1 : Math.min(1.03, Math.max(0, cTop + (cBot - cTop) * Math.pow(hgt, 1.3)));
      leads.push([drawBand(WIN_L, fullL, p, false, b * bh, bh), drawBand(WIN_R, fullR, p, true, b * bh, bh)]);
    }
    // soft shadow in the fold at each leading edge
    cc.globalCompositeOperation = 'source-atop';
    leads.forEach(([l, r], b) => {
      if (l > 1) cc.drawImage(shade, WIN_L + l - 14, b * bh, 14, bh + 0.5);
      if (r > 1) { cc.save(); cc.translate(WIN_R - r + 14, 0); cc.scale(-1, 1); cc.drawImage(shade, 0, b * bh, 14, bh + 0.5); cc.restore(); }
    });
    cc.globalCompositeOperation = 'source-over';
    cc.globalAlpha = 1; cc.setTransform(1, 0, 0, 1, 0, 0);
    // soft hem where the drop disappears behind the desk
    const hem = cc.createLinearGradient(0, (DESK_Y - 5) * CK, 0, DESK_Y * CK);
    hem.addColorStop(0, 'rgba(0,0,0,0)'); hem.addColorStop(1, 'rgba(0,0,0,1)');
    cc.globalCompositeOperation = 'destination-out';
    cc.fillStyle = hem; cc.fillRect(0, (DESK_Y - 5) * CK, ccv.width, 5 * CK + 4);
    cc.drawImage(occl, 0, 0);
    cc.globalCompositeOperation = 'source-over';
  }

  // The rail follows a slow sine ease; the hem follows the rail on a soft,
  // slightly under-damped spring, so it lags while moving and settles with
  // a gentle sway at the end.
  let cLast = 0;
  function stepCurtains(nowMs) {
    const dt = Math.min(0.5, (nowMs - (cLast || nowMs)) / 1000); cLast = nowMs;
    const moving = cTop !== cTarget, swaying = Math.abs(cBot - cTop) > 0.0004 || Math.abs(cVel) > 0.0004;
    if (!moving && !swaying) return;
    if (moving) {
      const k = Math.min(1, (nowMs - cT0) / (settings.reduceMotion ? C_FADE : C_DUR)), e = -(Math.cos(Math.PI * k) - 1) / 2;
      cTop = k >= 1 ? cTarget : cFrom + (cTarget - cFrom) * e;
    }
    if (settings.reduceMotion) { cBot = cTop; cVel = 0; }
    else {
      // integrate the real elapsed time in small steps, so the hem keeps up
      // even when frames are dropped
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      for (let i = 0; i < n; i++) { const acc = 80 * (cTop - cBot) - 14 * cVel; cVel += acc * h; cBot += cVel * h; }
    }
    if (!moving && Math.abs(cBot - cTop) <= 0.0004 && Math.abs(cVel) <= 0.0004) { cBot = cTop; cVel = 0; }
    drawCurtains(); applyLight();
  }
  if (studyImg.complete && studyImg.naturalWidth) buildCurtains(); else studyImg.addEventListener('load', buildCurtains, { once: true });

  // Rain and snow fall on the panes of glass the place lists, each with its
  // own sill (which may slope when the window runs away from us).
  const wc = $('#weatherCanvas'), wctx = wc.getContext('2d');
  let WX = place.wx, parts = [], streaks = [];
  function sizeWeather() {
    WX = place.wx; wc.width = WX.w; wc.height = WX.h;
    Object.assign(wc.style, { left: WX.x + 'px', top: WX.y + 'px', width: WX.w + 'px', height: WX.h + 'px' });
  }
  const pickPane = () => { let r = R(); for (const p of WX.panes) if ((r -= p.wgt) <= 0) return p; return WX.panes[0]; };
  const sillAt = (p, x) => (p.y1b == null ? p.y1 : p.y1 + (p.y1b - p.y1) * (x - p.x0) / (p.x1 - p.x0));
  const topAt = (p, x) => (p.y0b == null ? p.y0 || 0 : p.y0 + (p.y0b - p.y0) * (x - p.x0) / (p.x1 - p.x0));
  const put = (o, y) => {
    const p = pickPane(); o.x = p.x0 + R() * (p.x1 - p.x0); o.end = sillAt(p, o.x);
    const top = topAt(p, o.x); o.y = y == null ? top + R() * (o.end - top) : top + y; return o;
  };
  const ink = (d, a) => `rgba(${WX.tint.map((v) => Math.min(255, v + d)).join(',')},${Math.min(1, a * WX.alpha).toFixed(3)})`;
  function seedWeather() {
    parts = []; streaks = [];
    const k = WX.panes.reduce((a, p) => a + (p.x1 - p.x0) * p.y1, 0) / 195000, kind = wxKind();
    if (kind === 'rainy') {
      if (WX.drops !== false) for (let i = 0; i < 90 * k; i++) parts.push(put({ r: 0.5 + R() * 1.3, a: 0.25 + R() * 0.5, vy: 0, wait: R() * 9 }));
      for (let i = 0; i < 34 * k * WX.len; i++) streaks.push(put({ l: (9 + R() * 16) * WX.len, v: 520 + R() * 420, a: 0.07 + R() * 0.13 }));
    } else if (kind === 'sunny' && WX.drips) {
      // the rain has stopped, but the glass is still wet: now and then a drop lets go
      for (let i = 0; i < 90 * k * WX.drips; i++) parts.push(put({ r: 0.6 + R() * 1.2, a: 0.22 + R() * 0.35, vy: 0, wait: R() * 14 }));
    } else if (kind === 'snowy') {
      for (let i = 0; i < 110 * k; i++) parts.push(put({ r: 0.6 + R() * 1.9, a: 0.45 + R() * 0.5, vy: 10 + R() * 30, ph: R() * 6.28, f: 0.4 + R() * 0.9, amp: 4 + R() * 10 }));
    }
    drawWeather(0, performance.now() / 1000);
  }
  function drawWeather(dt, t) {
    wctx.clearRect(0, 0, WX.w, WX.h);
    if (!parts.length && !streaks.length) return;
    wctx.save(); wctx.beginPath();
    for (const p of WX.panes) { wctx.moveTo(p.x0, p.y0 || 0); wctx.lineTo(p.x1, p.y0b ?? p.y0 ?? 0); wctx.lineTo(p.x1, p.y1b ?? p.y1); wctx.lineTo(p.x0, p.y1); wctx.closePath(); }
    wctx.clip();
    if (wxKind() !== 'snowy') {
      wctx.lineCap = 'round';
      for (const s of streaks) {
        s.y += s.v * dt; s.x -= s.v * dt * 0.06;
        if (s.y > s.end + 12) put(s, -20);
        wctx.strokeStyle = ink(0, s.a); wctx.lineWidth = WX.lw;
        wctx.beginPath(); wctx.moveTo(s.x, s.y); wctx.lineTo(s.x + s.l * 0.06, s.y - s.l); wctx.stroke();
      }
      for (const p of parts) {
        if (p.vy === 0) { p.wait -= dt; if (p.wait < 0) p.vy = 25 + R() * 110; }
        else {
          p.y += p.vy * dt; p.x += Math.sin(p.y * 0.09) * 0.12;
          wctx.strokeStyle = ink(10, p.a * 0.28); wctx.lineWidth = p.r * 0.9;
          wctx.beginPath(); wctx.moveTo(p.x, p.y - 2); wctx.lineTo(p.x, p.y - 12 - p.vy * 0.1); wctx.stroke();
          if (p.y > p.end + 4) { put(p); p.y *= 0.74; p.vy = 0; p.wait = 2 + R() * 10; }
        }
        wctx.fillStyle = ink(17, p.a);
        wctx.beginPath(); wctx.ellipse(p.x, p.y, p.r * 0.8, p.r * 1.15, 0, 0, 6.3); wctx.fill();
      }
    } else {
      for (const p of parts) {
        p.y += p.vy * dt; if (p.y > p.end + 6) put(p, -6);
        const x = p.x + Math.sin(t * p.f + p.ph) * p.amp;
        wctx.fillStyle = `rgba(255,255,255,${p.a})`;
        wctx.beginPath(); wctx.arc(x, p.y, p.r, 0, 6.3); wctx.fill();
      }
    }
    wctx.restore();
  }

  // ── coffee steam ─────────────────────────────────────────────────────
  const sc = $('#steamCanvas'), sctx = sc.getContext('2d');
  let puffs = [], steamAcc = 0;
  function drawSteam(dt, t) {
    steamAcc += dt * (4.5 + Math.sin(t * 0.37) * 1.6);
    while (steamAcc > 1) {
      steamAcc -= 1;
      puffs.push({ x: place.steam[0] + (R() - 0.5) * 16, y: place.steam[1], age: 0, life: (3.2 + R() * 2.4) * (place.steam[3] > 1 ? 1.25 : 1), r: 4 + R() * 4, vy: (13 + R() * 12) * place.steam[3], ph: R() * 6.28, f: 0.5 + R() * 0.8, amp: 5 + R() * 9 });
    }
    sctx.clearRect(0, 0, 110, sc.height);
    const drift = Math.sin(t * 0.21) * 8 + Math.sin(t * 0.53 + 1.3) * 4;
    puffs = puffs.filter((p) => (p.age += dt) < p.life);
    for (const p of puffs) {
      const k = p.age / p.life;
      p.y -= p.vy * dt * (1 - k * 0.35);
      const x = p.x + Math.sin(t * p.f + p.ph) * p.amp * k + drift * k * k;
      const r = p.r + k * 15 * place.steam[4], a = Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.085 * place.steam[2];
      const g = sctx.createRadialGradient(x, p.y, 0, x, p.y, r);
      g.addColorStop(0, `rgba(255,238,220,${a})`); g.addColorStop(1, 'rgba(255,238,220,0)');
      sctx.fillStyle = g; sctx.beginPath(); sctx.arc(x, p.y, r, 0, 6.3); sctx.fill();
    }
  }

  // ── vinyl ────────────────────────────────────────────────────────────
  const disc = $('.disc');
  const spin = disc.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 1800, iterations: Infinity });
  spin.pause(); let spinRate = 0, spinTarget = 0;
  function setPlaying(on) { body.classList.toggle('playing', on); spinTarget = on ? 1 : 0; }

  // ── typewriter keys ──────────────────────────────────────────────────
  const keysEl = $('#keys'), strike = $('.strike'), paper = $('#paper');
  // Key centres measured from the artwork (stage px). Each pressed key is a
  // patch of the artwork itself, pushed down over a dark well, so the real
  // brass key appears to travel.
  let KEYPOS = {}, caps = {};   // id → [x, y, width]; id → element
  function buildKeys() {
    const K = place.keys;
    for (const el of Object.values(caps)) el.remove();
    KEYPOS = {}; caps = {}; held.clear();
    if (!K) return;                       // a place without a typewriter
    for (const [chars, xs, y] of K.rows) [...chars].forEach((c, i) => { KEYPOS[c] = [xs[i], y, K.w]; });
    for (const [id, v] of Object.entries(K.extra)) KEYPOS[id] = typeof v === 'string' ? KEYPOS[v] : v;
  }
  const held = new Map();      // physical code → key id
  const CODE = {
    Space: 'space', Enter: 'enter', NumpadEnter: 'enter', Backspace: 'delete', Delete: 'delete', Tab: 'tab', ShiftLeft: 'shiftL', ShiftRight: 'shiftR',
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`',
  };
  const idOf = (code) => CODE[code] || (/^Key[A-Z]$/.test(code) ? code[3].toLowerCase() : /^Digit\d$/.test(code) ? code[5] : null);
  const LETTERS = 'qwertyuiopasdfghjklzxcvbnm';
  function capFor(id) {
    if (caps[id]) return caps[id];
    const [x, y, w] = KEYPOS[id], h = place.keys.h;
    const el = document.createElement('div'); el.className = 'kc' + (id === 'space' ? ' bar' : '');
    el.style.cssText = `left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px`;
    const cap = document.createElement('div'); cap.className = 'cap';
    cap.style.backgroundImage = `url("${place.img}")`;
    cap.style.backgroundPosition = `${-(x - w / 2)}px ${-(y - h / 2)}px`;
    el.appendChild(cap); keysEl.appendChild(el);
    return (caps[id] = el);
  }
  function keyDown(code) {
    const id = idOf(code); if (!id || !KEYPOS[id]) return false;
    held.set(code, id); capFor(id).classList.add('down'); return true;
  }
  function keyUp(code) {
    const id = held.get(code); if (!id) return false;
    held.delete(code);
    if (![...held.values()].includes(id)) capFor(id).classList.remove('down');
    return true;
  }
  function releaseKeys() { for (const c of [...held.keys()]) keyUp(c); }
  // for input that arrives without a physical key (paste, on-screen keyboards)
  function keyTap(ch, kind) {
    if (!place.keys) return;
    const id = kind === 'space' ? 'space' : kind === 'enter' ? 'enter' : kind === 'delete' ? 'delete'
      : KEYPOS[(ch || '').toLowerCase()] ? ch.toLowerCase() : LETTERS[Math.floor(R() * LETTERS.length)];
    const el = capFor(id); el.classList.add('down');
    setTimeout(() => { if (![...held.values()].includes(id)) el.classList.remove('down'); }, 90);
  }
  function typeStrike(showBar = true) {
    if (showBar) { strike.classList.remove('on'); void strike.offsetWidth; strike.classList.add('on'); }
    paper.classList.add('hit'); setTimeout(() => paper.classList.remove('hit'), 55);
  }
  addEventListener('blur', releaseKeys);

  // ── tonearm ──────────────────────────────────────────────────────────
  // The arm painted in the artwork is erased (the record under it is rebuilt
  // from the pixels around it) and a real arm is drawn in its place: a tube,
  // headshell and cartridge laid out in the turntable's own plane, so it keeps
  // its shape as it swings about the pivot. Drag it onto the record to drop
  // the needle; lift it back to the rest to stop.
  const ARM = { px: 1515, py: 508, ky: 0.15 };                    // pivot (image px) and how flat the deck appears
  const BASE = [1511, 506.6];                                     // where the tube leaves the bearing
  const pv = (x, y) => [x - ARM.px, (y - ARM.py) / ARM.ky];       // image → deck plane
  const iv = (x, y) => [ARM.px + x, ARM.py + y * ARM.ky];          // deck plane → image
  const TIP0 = pv(1447, 522), L = Math.hypot(TIP0[0], TIP0[1]);   // needle in the painting; arm length
  const C = pv(1385.5, 518.5), REC_R = 107;                           // record centre and radius (plane)
  const tipOf = (deg) => { const a = deg * Math.PI / 180; return [L * Math.cos(a), L * Math.sin(a)]; };
  const radiusAt = (deg) => { const t = tipOf(deg); return Math.hypot(t[0] - C[0], t[1] - C[1]); };
  const angleFor = (r) => { let lo = 95, hi = 165; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (radiusAt(m) > r) lo = m; else hi = m; } return (lo + hi) / 2; };
  const REST = Math.atan2(...pv(1500, 525).reverse()) * 180 / Math.PI;   // on the rest post
  const ON_RECORD = angleFor(REC_R * 0.985), LEAD_IN = angleFor(REC_R * 0.9), RUN_OUT = angleFor(REC_R * 0.38);
  const ARM_MIN = REST - 3, ARM_MAX = RUN_OUT + 2;
  const ARM_POLY = [[1437, 515], [1452, 512.5], [1515, 502.5], [1518.5, 506], [1517.5, 512.5], [1457, 526], [1452, 529.5], [1440, 529.5], [1436, 522]];
  const AX = 1398, AY = 486, AW = 136, AH = 56, AK = 3;
  const acv = $('#armCanvas'), ac = acv.getContext('2d'), grip = $('#hsArm');
  acv.width = AW * AK; acv.height = AH * AK;
  let plate = null, armDeg = settings.musicOn ? angleFor(REC_R * 0.62) : REST, armLift = 0, dragging = false;
  let armQueue = [], armSeg = null, armHook = () => {};

  function buildArm() {
    // rebuild what the painted arm covers from the pixels just around it
    const img = studyImg, TX = 1426, TY = 494, TW = 100, TH = 42;
    const src = document.createElement('canvas'); src.width = TW; src.height = TH;
    const sc = src.getContext('2d', { willReadFrequently: true }); sc.drawImage(img, TX, TY, TW, TH, 0, 0, TW, TH);
    const pix = sc.getImageData(0, 0, TW, TH).data;
    const mc = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    mc.canvas.width = TW; mc.canvas.height = TH; mc.translate(-TX, -TY);
    mc.beginPath(); ARM_POLY.forEach(([x, y], i) => (i ? mc.lineTo(x, y) : mc.moveTo(x, y))); mc.closePath(); mc.fill(); mc.lineWidth = 2.4; mc.stroke();
    const mask = mc.getImageData(0, 0, TW, TH).data;
    const hole = (x, y) => x < 0 || y < 0 || x >= TW || y >= TH || mask[(y * TW + x) * 4 + 3] > 10;
    const col = (x, y) => { const i = (y * TW + x) * 4; return [pix[i], pix[i + 1], pix[i + 2]]; };
    const out = sc.createImageData(TW, TH), o = out.data;
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      if (mask[(y * TW + x) * 4 + 3] <= 10) continue;
      let acc = [0, 0, 0], wsum = 0;
      const add = (a, b, ga, gb) => {           // linear blend across the gap, weighted by how short it is
        const g = ga + gb, w = 1 / (g * g);
        for (let c = 0; c < 3; c++) acc[c] += (a[c] * gb + b[c] * ga) / g * w;
        wsum += w;
      };
      let u = y - 1, d = y + 1, l = x - 1, r = x + 1;
      while (u >= 0 && hole(x, u)) u--; while (d < TH && hole(x, d)) d++;
      while (l >= 0 && hole(l, y)) l--; while (r < TW && hole(r, y)) r++;
      if (u >= 0 && d < TH) add(col(x, u), col(x, d), y - u, d - y);
      if (l >= 0 && r < TW) add(col(l, y), col(r, y), x - l, r - x);
      const i = (y * TW + x) * 4;
      if (wsum) { o[i] = acc[0] / wsum; o[i + 1] = acc[1] / wsum; o[i + 2] = acc[2] / wsum; o[i + 3] = 255; }
    }
    const pc = document.createElement('canvas'); pc.width = TW; pc.height = TH; pc.getContext('2d').putImageData(out, 0, 0);
    plate = { canvas: pc, x: TX, y: TY, w: TW, h: TH };
    drawArm();
  }

  // the arm's outline in image space for a given angle and lift
  function armShape(deg, lift) {
    const a = deg * Math.PI / 180, ax = [Math.cos(a), Math.sin(a)], nx = [-ax[1], ax[0]];
    const at = (s, w) => {                            // s: along the arm (plane px), w: across it
      const [x, y] = iv(ax[0] * s + nx[0] * w, ax[1] * s + nx[1] * w);
      return [x, y - lift * 2.6 * (s / L)];           // the arm hinges at the pivot, so the tip rises most
    };
    return {
      base: [BASE[0], BASE[1]], knee: at(L * 0.84, 0),
      shell: [at(L * 0.82, -5.5), at(L * 1.03, -4.5), at(L * 1.03, 4.5), at(L * 0.82, 5.5)],
      tip: at(L, 0),
    };
  }
  function paintArm(c, sh, shadow) {
    const ink = shadow ? '#000' : null;
    // tube
    c.lineCap = 'round';
    c.strokeStyle = ink || '#141010'; c.lineWidth = 3.8;
    c.beginPath(); c.moveTo(...sh.base); c.lineTo(...sh.knee); c.stroke();
    if (!shadow) {                                    // rounded body, then warm rim light along its top
      c.strokeStyle = '#2e2622'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(sh.base[0], sh.base[1] - 0.4); c.lineTo(sh.knee[0], sh.knee[1] - 0.4); c.stroke();
      c.strokeStyle = 'rgba(222,166,112,.6)'; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(sh.base[0], sh.base[1] - 1.1); c.lineTo(sh.knee[0], sh.knee[1] - 1.1); c.stroke();
    }
    // headshell: top face, then its front edge
    const [p0, p1, p2, p3] = sh.shell, drop = 2.6;
    c.fillStyle = ink || '#24201d';
    c.beginPath(); c.moveTo(...p0); c.lineTo(...p1); c.lineTo(...p2); c.lineTo(...p3); c.closePath(); c.fill();
    c.fillStyle = ink || '#0f0c0b';
    c.beginPath(); c.moveTo(p3[0], p3[1]); c.lineTo(p2[0], p2[1]); c.lineTo(p2[0], p2[1] + drop); c.lineTo(p3[0], p3[1] + drop); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.lineTo(p2[0], p2[1] + drop); c.lineTo(p1[0], p1[1] + drop); c.closePath(); c.fill();
    if (!shadow) {
      c.strokeStyle = 'rgba(214,170,110,.75)'; c.lineWidth = 0.7;      // brass trim
      c.beginPath(); c.moveTo(...p0); c.lineTo(...p1); c.stroke();
    }
    // cartridge, down to the needle
    const [tx, ty] = sh.tip;
    c.fillStyle = ink || '#0b0908'; c.fillRect(tx - 2.6, ty - 0.6, 5.2, 3.2);
    if (!shadow) { c.fillStyle = 'rgba(205,160,96,.85)'; c.fillRect(tx - 2.6, ty - 0.6, 5.2, 0.8); }
  }
  function drawArm() {
    ac.setTransform(1, 0, 0, 1, 0, 0); ac.clearRect(0, 0, acv.width, acv.height);
    if (!plate) return;
    ac.setTransform(AK, 0, 0, AK, -AX * AK, -AY * AK);
    ac.drawImage(plate.canvas, plate.x, plate.y, plate.w, plate.h);
    // shadow on the deck: further away and softer as the arm lifts
    const sh = armShape(armDeg, armLift), sd = armShape(armDeg, 0), off = 1 + armLift * 3.2;
    ac.save(); ac.translate(0.6, off); ac.filter = `blur(${(0.7 + armLift * 1.3).toFixed(2)}px)`; ac.globalAlpha = 0.3 - armLift * 0.08;
    paintArm(ac, sd, true); ac.restore();
    paintArm(ac, sh, false);
    grip.style.left = sh.tip[0].toFixed(1) + 'px'; grip.style.top = sh.tip[1].toFixed(1) + 'px';
  }

  // movement: a queue of short eased segments (lift, swing, lower)
  const easeIO = (k) => -(Math.cos(Math.PI * k) - 1) / 2;
  function queueArm(segs) { armQueue = segs; armSeg = null; if (settings.reduceMotion) finishArm(); }
  function finishArm() {
    for (const s of [armSeg, ...armQueue]) if (s) { if (s.deg != null) armDeg = s.deg; if (s.lift != null) armLift = s.lift; s.then?.(); }
    armSeg = null; armQueue = []; drawArm();
  }
  function stepArm(nowMs, dt) {
    if (!armSeg && armQueue.length) { const s = armQueue.shift(); armSeg = { ...s, t0: nowMs, d0: armDeg, l0: armLift }; }
    if (armSeg) {
      const k = Math.min(1, (nowMs - armSeg.t0) / armSeg.dur), e = easeIO(k);
      if (armSeg.deg != null) armDeg = armSeg.d0 + (armSeg.deg - armSeg.d0) * e;
      if (armSeg.lift != null) armLift = armSeg.l0 + (armSeg.lift - armSeg.l0) * e;
      drawArm();
      if (k >= 1) { const done = armSeg.then; armSeg = null; done?.(); }
    } else if (settings.musicOn && !dragging && armLift === 0 && armDeg >= ON_RECORD && armDeg < RUN_OUT) {
      armDeg = Math.min(RUN_OUT, armDeg + dt * 0.012);         // the needle creeps inward as the record plays
      drawArm();
    }
  }
  // used by the Play / Pause buttons: carry the arm over, or put it away
  function moveArm(on, then) {
    if (dragging) return;
    if (!place.arm) { armQueue = []; armSeg = null; armDeg = on ? LEAD_IN : REST; armLift = 0; drawArm(); then?.(); return; }
    if (on) queueArm([{ lift: 1, dur: 260 }, { deg: armDeg >= ON_RECORD ? Math.min(armDeg, RUN_OUT) : LEAD_IN, dur: 900 }, { lift: 0, dur: 380, then }]);
    else queueArm([{ lift: 1, dur: 240 }, { deg: REST, dur: 950 }, { lift: 0, dur: 300, then }]);
  }
  function cueArm(then) {   // a new record: back to the lead-in groove
    if (dragging) return;
    if (!place.arm) { armDeg = LEAD_IN; then?.(); return; }
    queueArm([{ lift: 1, dur: 240 }, { deg: LEAD_IN, dur: 650 }, { lift: 0, dur: 340, then }]);
  }

  // dragging by hand: the needle follows the pointer around its arc
  const toStage = (e) => { const r = stage.getBoundingClientRect(), k = r.width / W; return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]; };
  let downAt = null, moved = false;
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault(); e.stopPropagation(); grip.setPointerCapture(e.pointerId);
    armQueue = []; armSeg = null; dragging = true; moved = false; downAt = [e.clientX, e.clientY];
    grip.classList.add('dragging');
    const wasOn = armDeg >= ON_RECORD && armLift < 0.5;
    queueArm([{ lift: 1, dur: 140 }]);
    if (wasOn || settings.musicOn) armHook('lift');           // needle leaves the groove (or is caught on its way there)
  });
  grip.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (!moved && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 4) return;
    moved = true;
    const [x, y] = toStage(e), p = pv(x, y);
    armDeg = Math.min(ARM_MAX, Math.max(ARM_MIN, Math.atan2(p[1], p[0]) * 180 / Math.PI)); drawArm();
  });
  const release = () => {
    if (!dragging) return;
    dragging = false; grip.classList.remove('dragging');
    if (!moved) {                                             // a simple click: the opposite of where it is now
      if (armDeg >= ON_RECORD) { armHook('lift'); queueArm([{ deg: REST, dur: 950 }, { lift: 0, dur: 300 }]); }
      else queueArm([{ deg: LEAD_IN, dur: 900 }, { lift: 0, dur: 380, then: () => armHook('drop') }]);
      return;
    }
    if (armDeg >= ON_RECORD) queueArm([{ lift: 0, dur: 300, then: () => armHook('drop') }]);
    else { armHook('lift'); queueArm([{ deg: REST, dur: Math.max(250, Math.abs(armDeg - REST) * 45) }, { lift: 0, dur: 260 }]); }
  };
  grip.addEventListener('pointerup', release);
  grip.addEventListener('pointercancel', release);
  grip.addEventListener('click', (e) => {                     // keyboard: Enter or Space
    if (e.detail !== 0) return;
    if (armDeg >= ON_RECORD) { armHook('lift'); moveArm(false); } else moveArm(true, () => armHook('drop'));
  });
  if (studyImg.complete && studyImg.naturalWidth) buildArm(); else studyImg.addEventListener('load', buildArm, { once: true });
  const armInfo = () => ({ deg: +armDeg.toFixed(1), REST: +REST.toFixed(1), ON_RECORD: +ON_RECORD.toFixed(1), LEAD_IN: +LEAD_IN.toFixed(1), RUN_OUT: +RUN_OUT.toFixed(1), painted: +(Math.atan2(TIP0[1], TIP0[0]) * 180 / Math.PI).toFixed(1) });

  // the sea and the gulls at the café
  const seaside = createSeaside($('#lifeCanvas'), PLACES.cafe.img);
  // the sunbeams, leaves, ivy and clock in the old library
  const library = createLibrary($('#libLeft'), $('#libRight'), PLACES.library.img);
  // the fire, lights and dogs by the fireside, and its hourglass
  const hearth = createHearth($('#hearthCanvas'), PLACES.reading.img);
  const glass = createHourglass($('#glassCanvas'), PLACES.reading.img);
  const glassLeft = () => (settings.glassEnds ? Math.max(0, settings.glassEnds - Date.now()) : 0);
  function turnGlass(then) {
    const f0 = glassLeft() / GLASS_MS;
    if (settings.reduceMotion || place.id !== 'reading') { then?.(); return; }
    glass.turn(f0, then);
  }

  // ── loop ─────────────────────────────────────────────────────────────
  let last = performance.now();
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (nowMs - last) / 1000), t = nowMs / 1000; last = nowMs;
    if (document.hidden) return;
    const reduce = settings.reduceMotion;
    // vinyl ease in / out
    const target = reduce ? 0 : spinTarget;
    if (Math.abs(target - spinRate) > 0.002) {
      spinRate += (target - spinRate) * Math.min(1, dt * 2.2);
      if (spinRate < 0.01 && target === 0) { spinRate = 0; spin.pause(); } else { spin.playbackRate = Math.max(0.02, spinRate); if (spin.playState !== 'running') spin.play(); }
    }
    stepCurtains(nowMs); stepArm(nowMs, dt);
    if (reduce || place.id !== 'cafe') seaside.clear();   // the painting as it was painted
    if (reduce || place.id !== 'library') library.clear();
    if (reduce || place.id !== 'reading') hearth.clear();
    // the hourglass always shows how much time is left, even with motion reduced
    if (place.id === 'reading') { const left = glassLeft(); glass.draw(left / GLASS_MS, left > 0 && !reduce, nowMs); } else glass.clear();
    if (reduce) return;
    const deskView = state.view === 'focus' && settings.mode === 'writing';
    if (!deskView) {
      if (place.id === 'cafe') seaside.draw(dt, t, wxKind());
      if (place.id === 'library') library.draw(dt, t, wxKind(), nowMs);
      if (place.id === 'reading') hearth.draw(dt, t, nowMs);
      drawSteam(dt, t);
      const hidden = place.curtains && !settings.curtainsOpen && nowMs > curtainMoveUntil;
      if (!hidden) drawWeather(dt, t); else wctx.clearRect(0, 0, WX.w, WX.h);
    }
  }
  requestAnimationFrame(frame);

  // ── place ────────────────────────────────────────────────────────────
  // Swap the painting and everything measured from it. Resolves once the
  // new picture is ready to show.
  function setPlace(id) {
    place = placeOf(id);
    for (const k of Object.keys(PLACES)) body.classList.toggle('place-' + k, k === place.id);
    if (bg.getAttribute('src') !== place.img) bg.src = place.img;
    stage.style.setProperty('--sheet-s', (place.paper.w / 720).toFixed(5));
    buildKeys(); sizeWeather(); applyWeather();
    puffs = []; sc.height = place.steam[1] + 14; sc.style.height = sc.height + 'px';
    state.scroll = 0; layout();
    return bg.decode ? bg.decode().catch(() => {}) : Promise.resolve();
  }
  const paperOf = () => { const p = place.paper, scale = p.w / 720; return { scale, platen: p.platen, min: p.min, max: p.max, roomLines: Math.floor((p.min / scale - 78) / 30) }; };
  setPlace(place.id);

  function hotspotRect(id) { return document.getElementById(id).getBoundingClientRect(); }

  return { setPlace, turnGlass, get place() { return place; }, get paper() { return paperOf(); }, wxKind, layout, setView, setCaretY, scrollPaper, followCaret, applyLight, applyWeather, applyCurtains, setPlaying, moveArm, cueArm, onArm(fn) { armHook = fn; }, armInfo, keyDown, keyUp, keyTap, releaseKeys, typeStrike, hotspotRect, get view() { return state.view; } };
}
