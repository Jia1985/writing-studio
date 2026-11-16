// The hourglass on the table by the fire is a forty-minute timer. Click it
// and it turns over: the sand runs through the neck in a thin stream, the
// top empties and the heap in the bottom grows until the time is up.
//
// The painted sand is lifted out of the glass and drawn again from the
// timer's state, so the glass shows exactly how much time is left.

export const GLASS_MS = 40 * 60 * 1000;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (k) => -(Math.cos(Math.PI * clamp(k, 0, 1)) - 1) / 2;

// canvas placement (stage px): room for the glass to swing over
const CX0 = 140, CY0 = 455, CW = 330, CH = 335, K = 2;
const NECK = [306.5, 620];                       // the waist of the glass
const TOP_END = 102.5, BOT_END = 118;            // inner ends of the bulbs, from the neck
const FULL = 74;                                 // how high the sand stands in a full top bulb
const PIVOT = [306.5, 622];
const FLIP_MS = 1400;
const TILT = 0.23;                               // we look down on the glass a little: a level ring shows as an ellipse this flat
const REPOSE = 0.55;                             // slope of the heap (rise over run)

// inner half-width of the glass, d px from the neck, traced from the painting
// (the top is a wide cone with a domed shoulder; the bottom a pear with a
// round foot), smoothed so the outline has no corners
const PROFILE = {
  top: [[0, 2.5], [10, 15], [20, 26.5], [30, 36.5], [42, 41.5], [60, 48.5], [80, 49], [90, 46.5], [97, 39], [102.5, 24]],
  bot: [[0, 2.5], [20, 16], [40, 30.5], [60, 43], [80, 46], [90, 45.5], [100, 42], [110, 29.5], [115, 18], [117, 9], [118, 0]],
};
const HSTEP = 0.25, HN = Math.ceil(120 / HSTEP) + 1;
const HW = {};
for (const key of ['top', 'bot']) {
  const tab = PROFILE[key];
  const lin = (d) => { if (d <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (d <= tab[i][0]) { const [a, va] = tab[i - 1], [b, vb] = tab[i]; return va + (vb - va) * (d - a) / (b - a); } return tab[tab.length - 1][1]; };
  let arr = Float32Array.from({ length: HN }, (_, i) => lin(i * HSTEP));
  for (let pass = 0; pass < 3; pass++) {           // a few box blurs round off the corners of the table
    const out = new Float32Array(HN), R = 8;
    for (let i = 0; i < HN; i++) { let sum = 0, n = 0; for (let j = i - R; j <= i + R; j++) { sum += arr[clamp(j, 0, HN - 1)]; n++; } out[i] = sum / n; }
    arr = out;
  }
  HW[key] = arr;
}
function hw(d, top) {
  const arr = top ? HW.top : HW.bot, k = clamp(d, 0, 120) / HSTEP, i = Math.floor(k), t = k - i;
  const v = arr[Math.min(i, HN - 1)] * (1 - t) + arr[Math.min(i + 1, HN - 1)] * t;
  return Math.max(0.8, v);
}

export function createHourglass(canvas, src) {
  const c = canvas.getContext('2d');
  canvas.width = CW * K; canvas.height = CH * K;
  let ready = false, sprite = null, plate = null, shine = null;
  // the painted sand's colours (set here rather than read back from the
  // painting: some browsers blur what a canvas reads back, to stop fingerprinting)
  const sandLit = [248, 172, 160], sandBody = [238, 142, 126], sandDeep = [184, 92, 78];
  let flip = null, blank = true;

  // volume of sand (discs of the glass) from the neck out to d
  const STEP = 0.25, vTop = [0], vBot = [0];
  for (let d = STEP; d <= BOT_END + 0.01; d += STEP) {
    vTop.push(vTop[vTop.length - 1] + hw(d, true) ** 2 * STEP);
    vBot.push(vBot[vBot.length - 1] + hw(d, false) ** 2 * STEP);
  }
  const at = (arr, d) => arr[clamp(Math.round(d / STEP), 0, arr.length - 1)];
  const TOTAL = at(vTop, FULL);
  // the level (distance from the neck) that holds a given volume
  const levelTop = (v) => { let lo = 0, hi = TOP_END; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (at(vTop, m) < v) lo = m; else hi = m; } return (lo + hi) / 2; };
  // bottom fills from its far end back toward the neck
  const levelBot = (v) => { const end = at(vBot, BOT_END); let lo = 0, hi = BOT_END; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (end - at(vBot, m) > v) lo = m; else hi = m; } return (lo + hi) / 2; };

  const img = new Image();
  img.onload = () => { try { build(); ready = true; } catch (e) { console.warn('hourglass', e); } };
  img.src = src;

  // outline of the glass and its brass frame
  function glassPath(x, inset = 0) {
    x.beginPath();
    for (let d = TOP_END; d >= 0; d -= 1) x.lineTo(NECK[0] - hw(d, true) + inset, NECK[1] - d);
    for (let d = 0; d <= BOT_END; d += 1) x.lineTo(NECK[0] - hw(d, false) + inset, NECK[1] + d);
    for (let d = BOT_END; d >= 0; d -= 1) x.lineTo(NECK[0] + hw(d, false) - inset, NECK[1] + d);
    for (let d = 0; d <= TOP_END; d += 1) x.lineTo(NECK[0] + hw(d, true) - inset, NECK[1] - d);
    x.closePath();
  }
  function framePath(x, fresh = true) {
    if (fresh) x.beginPath();
    x.rect(221, 482, 172, 36);                                 // top plate
    for (const [cx, cy, r] of [[242.5, 481, 10], [306.5, 477.5, 9], [370, 481, 10]]) { x.moveTo(cx + r, cy); x.arc(cx, cy, r, 0, 6.3); }
    x.rect(231, 512, 28, 222); x.rect(358, 512, 27, 222);      // pillars
    x.rect(221, 727, 174, 45);                                  // base
    x.rect(283, 514, 48, 220);                                  // the posts behind the glass
  }
  const inGlass = (x, y) => {
    const d = y - NECK[1];
    if (d < -TOP_END || d > BOT_END) return false;
    return Math.abs(x - NECK[0]) < hw(Math.abs(d), d < 0);
  };

  function build() {
    const W = CW, H = CH;
    const src = document.createElement('canvas'); src.width = W; src.height = H;
    const s = src.getContext('2d', { willReadFrequently: true });
    s.drawImage(img, CX0, CY0, W, H, 0, 0, W, H);
    const id = s.getImageData(0, 0, W, H), d = id.data;
    const P = (x, y) => (y * W + x) * 4;

    // lift the painted sand out of the glass. Each bulb is refilled from its
    // own clear glass just above the sand: mirrored upward, squeezed to fit,
    // and stretched across to this row's width so the walls, the reflections
    // and the post behind the glass carry on unbroken.
    const fill = new Uint8ClampedArray(d);
    const sample = (fx, fy, ch) => {              // bilinear read from the painting
      const x0 = clamp(Math.floor(fx), 0, W - 2), y0 = clamp(Math.floor(fy), 0, H - 2), tx = clamp(fx - x0, 0, 1), ty = clamp(fy - y0, 0, 1);
      const p00 = d[P(x0, y0) + ch], p10 = d[P(x0 + 1, y0) + ch], p01 = d[P(x0, y0 + 1) + ch], p11 = d[P(x0 + 1, y0 + 1) + ch];
      return (p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty;
    };
    // the painted stream, from the neck down to the painted heap: the glass
    // behind it, read across from either side (the real stream is drawn live)
    for (let sy = 621; sy <= 680; sy++) {
      const L = P(302 - CX0, sy - CY0), R = P(312 - CX0, sy - CY0);
      for (let sx = 303; sx <= 311; sx++) { const t = (sx - 302) / 10, i = P(sx - CX0, sy - CY0); for (let ch = 0; ch < 3; ch++) d[i + ch] = d[L + ch] * (1 - t) + d[R + ch] * t; }
    }
    fill.set(d);
    const BANDS = [
      { top: true, y0: 563, y1: 619, s0: 562, s1: 527 },   // the top bulb's sand, refilled from the clear glass above it
      { top: false, y0: 673, y1: 739, s0: 672, s1: 636 },  // the heap, refilled from the clear glass between it and the neck
    ];
    for (const band of BANDS) {
      for (let sy = band.y0; sy <= band.y1; sy++) {
        const k = (sy - band.y0) / (band.y1 - band.y0), ty = band.s0 + (band.s1 - band.s0) * k;
        const gH = hw(Math.abs(sy - NECK[1]), band.top), gS = hw(Math.abs(ty - NECK[1]), band.top);
        const dim = band.top ? 1 : 1 - 0.08 * k;        // the foot of the glass is a little darker
        for (let sx = Math.floor(NECK[0] - gH - 3); sx <= Math.ceil(NECK[0] + gH + 3); sx++) {
          const u = sx - NECK[0], au = Math.abs(u);
          if (au > gH + 3) continue;
          // inside the glass: scale to the source row's width; on the wall: keep the distance from the wall
          const uS = au <= gH ? au * gS / gH : gS + (au - gH);
          const fx = NECK[0] + Math.sign(u) * uS - CX0, i = P(sx - CX0, sy - CY0);
          for (let ch = 0; ch < 3; ch++) fill[i + ch] = sample(fx, ty - CY0, ch) * dim;
        }
      }
    }
    const empty = document.createElement('canvas'); empty.width = W; empty.height = H;
    empty.getContext('2d').putImageData(new ImageData(fill, W, H), 0, 0);
    // soften what was filled in (only there, fading in over a few rows so there is no seam)
    const soft = document.createElement('canvas'); soft.width = W; soft.height = H;
    const so = soft.getContext('2d'); so.filter = 'blur(0.9px)'; so.drawImage(empty, 0, 0); so.filter = 'none';
    so.globalCompositeOperation = 'destination-in'; so.translate(-CX0, -CY0);
    for (const band of BANDS) {
      const g = so.createLinearGradient(0, band.y0 - 1, 0, band.y1 + 1);
      const fade = 4 / (band.y1 - band.y0 + 2);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(fade, '#000'); g.addColorStop(1, '#000');
      so.fillStyle = g; so.fillRect(0, band.y0 - 1, 1672, band.y1 - band.y0 + 2);
    }
    so.setTransform(1, 0, 0, 1, 0, 0); so.globalCompositeOperation = 'destination-in'; so.translate(-CX0, -CY0); glassPath(so, -3); so.fill();
    const ec = empty.getContext('2d'); ec.drawImage(soft, 0, 0);

    // the hourglass alone (frame and empty glass), to lift and turn over
    sprite = document.createElement('canvas'); sprite.width = W * K; sprite.height = H * K;
    const sp = sprite.getContext('2d'); sp.scale(K, K); sp.translate(-CX0, -CY0);
    // (glass and frame are clipped one at a time: where their outlines overlap
    // they would otherwise cancel out and leave a hole)
    sp.save(); glassPath(sp, -3); sp.clip(); sp.drawImage(empty, CX0, CY0); sp.restore();
    sp.save(); framePath(sp); sp.clip(); sp.drawImage(empty, CX0, CY0); sp.restore();

    // highlights on the glass, laid back over the sand: bright, colourless
    // streaks in the empty glass are reflections
    const ed = ec.getImageData(0, 0, W, H).data;
    shine = document.createElement('canvas'); shine.width = W; shine.height = H;
    const sh = shine.getContext('2d'), sd = sh.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = x + CX0, sy = y + CY0; if (!inGlass(sx, sy)) continue;
      const i = P(x, y), l = ed[i] * 0.3 + ed[i + 1] * 0.59 + ed[i + 2] * 0.11, sat = Math.max(ed[i], ed[i + 1], ed[i + 2]) - Math.min(ed[i], ed[i + 1], ed[i + 2]);
      const g = hw(Math.abs(sy - NECK[1]), sy < NECK[1]), edge = Math.abs(sx - NECK[0]) > g - 7;
      if (l > 200 && sat < 60) { sd.data[i] = 255; sd.data[i + 1] = 248; sd.data[i + 2] = 240; sd.data[i + 3] = clamp((l - 190) * 3.5, 0, 190) * (edge ? 1 : 0.6); }
    }
    sh.putImageData(sd, 0, 0);
    { const b2 = document.createElement('canvas'); b2.width = W; b2.height = H; const bx = b2.getContext('2d'); bx.filter = 'blur(0.6px)'; bx.drawImage(shine, 0, 0); shine = b2; }

    // what is behind the hourglass, for the moment it is lifted to turn over
    plate = document.createElement('canvas'); plate.width = W; plate.height = H;
    const pl = plate.getContext('2d', { willReadFrequently: true });
    pl.drawImage(img, CX0, CY0, W, H, 0, 0, W, H);
    const m = document.createElement('canvas'); m.width = W; m.height = H;
    const mx = m.getContext('2d', { willReadFrequently: true }); mx.translate(-CX0, -CY0); mx.lineWidth = 6; framePath(mx); mx.fill(); mx.stroke(); glassPath(mx); mx.fill(); mx.stroke();
    const md = mx.getImageData(0, 0, W, H).data, pd = pl.getImageData(0, 0, W, H), q = pd.data;
    const hole = (x, y) => md[(y * W + x) * 4 + 3] > 10;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!hole(x, y)) continue;
        let l = x, r = x; while (l > 0 && hole(l, y)) l--; while (r < W - 1 && hole(r, y)) r++;
        const t = (x - l) / Math.max(1, r - l), i = P(x, y), A = P(l, y), B = P(r, y);
        for (let k = 0; k < 3; k++) q[i + k] = q[A + k] * (1 - t) + q[B + k] * t;
      }
    }
    pl.putImageData(pd, 0, 0);
    const blur = document.createElement('canvas'); blur.width = W; blur.height = H;
    const bl = blur.getContext('2d'); bl.filter = 'blur(5px)'; bl.drawImage(plate, 0, 0); bl.filter = 'none';
    bl.globalCompositeOperation = 'destination-in'; bl.drawImage(m, 0, 0);
    pl.drawImage(blur, 0, 0);
  }

  // ── sand ─────────────────────────────────────────────────────────────
  // The sand is a solid of revolution inside the glass: in the top bulb a
  // level that sinks into a funnel over the neck as it drains, in the bottom a
  // cone heaped up under the stream. Seen from a little above, each level
  // ring is an ellipse; every pixel is shaded from the surface it shows, with
  // a fine grain, and goes a little clear where it meets the glass.
  const BX = Math.floor(NECK[0] - 56), BY = Math.floor(NECK[1] - TOP_END - 2), BW = 112, BH = Math.ceil(TOP_END + BOT_END + 4);
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const smooth = (e0, e1, v) => { const k = clamp((v - e0) / (e1 - e0), 0, 1); return k * k * (3 - 2 * k); };
  const L = (() => { const v = [0.55, 0.7, 0.45], n = Math.hypot(...v); return v.map((c) => c / n); })();   // the fire is off to the right

  // the bottom: where the rim of the heap meets the glass, and how tall it is
  const bottomEnd = at(vBot, BOT_END);
  function heapOf(vb) {
    const cone = (dr) => { const w = hw(dr, false); return w * w * Math.min(REPOSE * w, dr - 8) / 3; };
    let lo = 10, hi = BOT_END;                     // more sand: the rim stands higher (nearer the neck)
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (bottomEnd - at(vBot, m) + cone(m) > vb) lo = m; else hi = m; }
    const dr = (lo + hi) / 2, w = hw(dr, false);
    return { dr, w, h: Math.max(0, Math.min(REPOSE * w, dr - 8)) };
  }
  function shapeOf(f) {
    const vt = TOTAL * f, vb = TOTAL - vt;
    const top = vt > TOTAL * 0.0015 ? (() => {
      const dl = levelTop(vt), w = hw(dl, true);
      // the funnel: a dimple at first, widening and deepening as the top empties
      const drain = clamp((1 - f) * 120, 0, 1);
      const D = Math.min(dl - 0.6, 2 + 10 * (1 - f)) * drain;
      const Rc = w * (0.5 + 0.5 * smooth(34, 6, dl));
      return { y: NECK[1] - dl, w, D, Rc };
    })() : null;
    const bot = vb > TOTAL * 0.0015 ? (() => { const hp = heapOf(vb); return { y: NECK[1] + hp.dr, w: hp.w, h: hp.h, a: hp.w * 0.14 }; })() : null;
    return { top, bot };
  }
  // surface height (stage y) at radius r
  const topY = (s, r) => s.y + (r < s.Rc ? s.D * Math.pow(1 - r / s.Rc, 1.4) : 0);
  const botY = (s, r) => { const a = s.a, R = Math.sqrt(s.w * s.w + a * a) - a; return s.y - s.h * Math.max(0, 1 - (Math.sqrt(r * r + a * a) - a) / R); };

  // the grain: fixed per pixel, made once
  const NW = BW * K, NH = BH * K, grainOf = new Float32Array(NW * NH);
  for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
    const g = hash(i, j), sp = hash(j * 7 + 3, i * 13 + 1);
    grainOf[j * NW + i] = (1 + (g - 0.5) * 0.1) * (sp > 0.965 ? 1.12 : sp < 0.03 ? 0.84 : 1);
  }
  const sandCache = new Map();
  // (the glass drains 1/2400 of its sand a second: redrawing the sand once a
  // second is as smooth as the eye can tell, and costs a few ms)
  const STEPS = 2400;
  function sandLayer(f) {
    const key = Math.round(f * STEPS);
    let cv = sandCache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = NW; cv.height = NH;
    const cx = cv.getContext('2d'), im = cx.createImageData(NW, NH), px = im.data;
    const shape = shapeOf(key / STEPS);
    const [lr, lg, lb] = sandLit, [br, bg, bb] = sandBody, [dr, dg, db] = sandDeep;
    for (let j = 0; j < NH; j++) {
      const y = BY + (j + 0.5) / K, top = y < NECK[1], s = top ? shape.top : shape.bot;
      if (!s) continue;
      const g = hw(Math.abs(y - NECK[1]), top), surf = top ? topY : botY, yRim = s.y;
      if (top && y > NECK[1] + 0.5) continue;
      const i0 = Math.max(0, Math.floor((NECK[0] - g - 1 - BX) * K)), i1 = Math.min(NW - 1, Math.ceil((NECK[0] + g + 1 - BX) * K));
      const depthTop = Math.max(4, NECK[1] - yRim), depthBot = Math.max(4, NECK[1] + BOT_END - yRim);
      for (let i = i0; i <= i1; i++) {
        const x = BX + (i + 0.5) / K, u = x - NECK[0], au = Math.abs(u);
        if (au > g + 0.5) continue;
        const half = au < s.w ? Math.sqrt(s.w * s.w - u * u) : 0;
        const yFront = yRim + TILT * half;
        let r0, g0, b0, m, alpha, cover = 1;
        if (y >= yFront || (au >= s.w && y >= yRim)) {
          // the side of the sand, against the glass: darker toward the walls and toward the neck / foot
          const depth = top ? clamp((y - yFront) / depthTop, 0, 1) : clamp((y - yRim) / depthBot, 0, 1);
          const k = 0.15 + 0.5 * depth, a = au / Math.max(1, g);
          r0 = br + (dr - br) * k; g0 = bg + (dg - bg) * k; b0 = bb + (db - bb) * k;
          m = (1 - 0.22 * a * a * a) * (1 + 0.05 * (u / Math.max(1, g)));
          alpha = 0.95;
        } else if (au < s.w) {
          // the surface: walk from the front of the ring to the back and take the first point the eye meets
          const N = 18; let prevV = half, prevY = surf(s, s.w) + TILT * half, hitV = null, minY = prevY;
          for (let q = 1; q <= N; q++) {
            const v = half - (2 * half * q) / N, yy = surf(s, Math.sqrt(u * u + v * v)) + TILT * v;
            if (yy < minY) minY = yy;
            if (yy <= y) { const t = (prevY - y) / Math.max(1e-6, prevY - yy); hitV = prevV + (v - prevV) * t; break; }
            prevV = v; prevY = yy;
          }
          if (hitV === null) { if (y < minY - 0.5) continue; hitV = 0; cover = clamp((y - minY) * K + 0.5, 0, 1); }
          const r = Math.max(0.01, Math.sqrt(u * u + hitV * hitV)), e = 0.4;
          const slope = (surf(s, r + e) - surf(s, Math.max(0, r - e))) / (2 * e);   // +: the surface drops (screen y grows) outward
          // lit by the fire: the normal of a surface of revolution falling by `slope` per px outward
          const nx = slope * u / r, nz = slope * hitV / r, nn = Math.sqrt(nx * nx + 1 + nz * nz);
          const lit = Math.max(0, (nx * L[0] + L[1] + nz * L[2]) / nn), shade = 0.74 + 0.34 * lit;
          r0 = lr * shade; g0 = lg * shade; b0 = lb * shade;
          // a soft lighter rim where the surface meets the glass
          m = 1 + (s.w > 3 ? smooth(0.82, 1, au / s.w) * 0.06 : 0);
          alpha = 0.97;
        } else continue;
        m *= grainOf[j * NW + i];
        // clear at the glass, so the wall and its shine sit in front of the sand
        const wall = g - au;
        alpha *= (0.55 + 0.45 * smooth(0, 3.5, wall)) * clamp(wall * K + 0.5, 0, 1) * cover;
        if (top && y > NECK[1] - 1.5) alpha *= 0.85;
        const o = (j * NW + i) * 4;
        px[o] = r0 * m; px[o + 1] = g0 * m; px[o + 2] = b0 * m; px[o + 3] = alpha * 255;
      }
    }
    cx.putImageData(im, 0, 0);
    if (sandCache.size > 4) sandCache.delete(sandCache.keys().next().value);
    sandCache.set(key, cv);
    return cv;
  }

  // f: the share of the sand still in the top bulb
  let prefetching = -1;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 30));
  function drawSand(x, f, running, t) {
    x.drawImage(sandLayer(f), BX, BY, BW, BH);
    // draw the next second's sand while the page is idle, so a frame never waits for it
    const next = Math.round(f * STEPS) - 1;
    if (running && next >= 0 && !sandCache.has(next) && prefetching !== next) {
      prefetching = next;
      idle(() => { sandLayer(next / STEPS); prefetching = -1; });
    }
    // the stream through the neck, and the grains landing on the heap
    if (running && f > 0.0015) {
      const s = shapeOf(f).bot, yHit = s ? botY(s, 0) : NECK[1] + BOT_END - 2;
      const [r, g, b] = sandLit;
      x.strokeStyle = `rgba(${r},${g},${b},${0.75 + 0.15 * Math.sin(t * 40)})`; x.lineWidth = 0.9;
      x.beginPath(); x.moveTo(NECK[0], NECK[1] - 1.5); x.lineTo(NECK[0] + Math.sin(t * 23) * 0.12, yHit + 0.5); x.stroke();
      x.fillStyle = `rgb(${r},${g},${b})`;
      for (let i = 0; i < 5; i++) {
        const k = ((t * 3.1 + i * 0.37) % 1), dx = Math.sin(i * 12.9 + Math.floor(t * 3.1 + i * 0.37) * 7.7) * 4 * k;
        x.globalAlpha = 0.8 * (1 - k); x.fillRect(NECK[0] + dx - 0.35, yHit + Math.abs(dx) * REPOSE - Math.sin(k * Math.PI) * 2, 0.7, 0.7);
      }
      x.globalAlpha = 1;
    }
    x.drawImage(shine, CX0, CY0);
  }

  return {
    // turn it over; `then` once it is standing again
    turn(f0, then) { flip = { t0: performance.now(), f0, then }; },
    get turning() { return !!flip; },
    draw(f, running, nowMs) {
      if (!ready) return;
      blank = false;
      const t = nowMs / 1000;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
      c.setTransform(K, 0, 0, K, -CX0 * K, -CY0 * K);
      if (flip) {
        const k = (nowMs - flip.t0) / FLIP_MS;
        if (k >= 1) { const done = flip.then; flip = null; done?.(); }
        else {
          // lifted a little, turned end over end, and set down again
          const a = ease(k) * Math.PI, lift = Math.sin(Math.PI * clamp(k, 0, 1)) * 16;
          c.drawImage(plate, CX0, CY0);
          c.save();
          c.translate(PIVOT[0], PIVOT[1] - lift); c.rotate(a); c.translate(-PIVOT[0], -PIVOT[1]);
          c.shadowColor = 'rgba(30,10,0,.45)'; c.shadowBlur = 18 * Math.sin(Math.PI * k); c.shadowOffsetY = 10;
          c.drawImage(sprite, CX0, CY0, CW, CH);
          c.shadowColor = 'transparent';
          drawSand(c, flip.f0, false, t);
          c.restore();
          // standing upright again: the frame settles into its own shape
          if (k > 0.82) { c.globalAlpha = (k - 0.82) / 0.18; c.drawImage(sprite, CX0, CY0, CW, CH); drawSand(c, 1, false, t); c.globalAlpha = 1; }
          return;
        }
      }
      c.drawImage(sprite, CX0, CY0, CW, CH);
      drawSand(c, f, running, t);
    },
    clear() { if (!blank) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height); blank = true; } },
    get ready() { return ready; },
  };
}
