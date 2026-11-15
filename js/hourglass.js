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
const TOP_END = 102.5, BOT_END = 112.5;          // inner ends of the bulbs, from the neck
const FULL = 74;                                 // how high the sand stands in a full top bulb
const PIVOT = [306.5, 622];
const FLIP_MS = 1400;

// inner half-width of the glass, d px from the neck (traced from the painting)
// (measured on the painting at twice the stage size, hence p = 2d)
function hw(d, top) {
  const p = 2 * d, R = top ? 165 : 205;
  return Math.max(0.8, (6 + 99 * (1 - Math.exp(-Math.pow(p / 62, 1.6))) - (p > R ? (p - R) ** 2 * 0.012 : 0)) / 2);
}

export function createHourglass(canvas, src) {
  const c = canvas.getContext('2d');
  canvas.width = CW * K; canvas.height = CH * K;
  let ready = false, sprite = null, plate = null, shine = null, sandA = '#f0b3bc', sandB = '#c9808f';
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
    // the painted sand's colours, for the sand drawn from now on
    const avg = (x0, y0, x1, y1) => { let r = 0, g = 0, b = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = P(x - CX0, y - CY0); r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return [r / n, g / n, b / n].map(Math.round); };
    const a = avg(296, 578, 318, 586), b = avg(270, 712, 285, 726);
    sandA = `rgb(${a})`; sandB = `rgb(${b})`;

    // lift the painted sand out of the glass: the empty glass shows what is
    // above the sand in the top bulb, and what is above the heap in the bottom
    const sandTop = (y) => y >= 563 && y <= 619, sandBot = (y) => y >= 672 && y <= 733;
    const fill = new Uint8ClampedArray(d);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = x + CX0, sy = y + CY0;
      if (!inGlass(sx, sy) || !(sandTop(sy) || sandBot(sy))) continue;
      // borrow the clear glass of the other bulb: mirrored across the neck and
      // stretched to this bulb's width, it has the real reflections and the
      // posts seen through it
      const top = sandTop(sy);
      const ty = top ? clamp(NECK[1] + (NECK[1] - sy), 622, 670) : 502 + (733 - sy) / 61 * 60;
      const wHere = hw(Math.abs(sy - NECK[1]), top), wThere = hw(Math.abs(ty - NECK[1]), !top);
      const fx = Math.round(NECK[0] + (sx - NECK[0]) * Math.min(1, (wThere - 1.5) / wHere)) - CX0;
      const i = P(x, y), j = P(clamp(fx, 0, W - 1), Math.round(ty) - CY0);
      const dim = top ? 1 : 0.96;
      // ease from the real glass just above into the borrowed glass, so there is no seam
      const seam = top ? 0 : clamp(1 - (sy - 672) / 14, 0, 1), s0 = P(x, 669 - CY0);
      for (let ch = 0; ch < 3; ch++) fill[i + ch] = (d[j + ch] * dim) * (1 - seam) + d[s0 + ch] * seam;
    }
    const empty = document.createElement('canvas'); empty.width = W; empty.height = H;
    empty.getContext('2d').putImageData(new ImageData(fill, W, H), 0, 0);
    // soften what was filled in
    const soft = document.createElement('canvas'); soft.width = W; soft.height = H;
    const so = soft.getContext('2d'); so.filter = 'blur(1.6px)'; so.drawImage(empty, 0, 0); so.filter = 'none';
    so.globalCompositeOperation = 'destination-in'; so.translate(-CX0, -CY0); so.fillStyle = '#000';
    so.beginPath(); so.rect(0, 563, 1672, 57); so.rect(0, 672, 1672, 62); so.fill();
    so.setTransform(1, 0, 0, 1, 0, 0); so.globalCompositeOperation = 'destination-in'; so.translate(-CX0, -CY0); glassPath(so, 1); so.fill();
    const ec = empty.getContext('2d'); ec.drawImage(soft, 0, 0);

    // the hourglass alone (frame and empty glass), to lift and turn over
    sprite = document.createElement('canvas'); sprite.width = W * K; sprite.height = H * K;
    const sp = sprite.getContext('2d'); sp.scale(K, K); sp.translate(-CX0, -CY0);
    // (glass and frame are clipped one at a time: where their outlines overlap
    // they would otherwise cancel out and leave a hole)
    sp.save(); glassPath(sp); sp.clip(); sp.drawImage(empty, CX0, CY0); sp.restore();
    sp.save(); framePath(sp); sp.clip(); sp.drawImage(empty, CX0, CY0); sp.restore();

    // highlights on the glass, laid back over the sand
    shine = document.createElement('canvas'); shine.width = W; shine.height = H;
    const sh = shine.getContext('2d'), sd = sh.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = x + CX0, sy = y + CY0; if (!inGlass(sx, sy)) continue;
      const i = P(x, y), l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11, sat = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
      // bright, colourless streaks are reflections in the glass
      const edge = Math.abs(sx - NECK[0]) > hw(Math.abs(sy - NECK[1]), sy < NECK[1]) - 7;
      // (the pale pink of the painted sand is not a reflection: red runs well above green there)
      const pink = d[i] - d[i + 1] > 16 || sandTop(sy) && !edge || sandBot(sy) && !edge;
      if (l > 205 && sat < 40 && !pink) { sd.data[i] = 255; sd.data[i + 1] = 248; sd.data[i + 2] = 240; sd.data[i + 3] = clamp((l - 195) * 4, 0, 200) * (edge ? 1 : 0.7); }
    }
    sh.putImageData(sd, 0, 0);

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
  // f: the share of the sand still in the top bulb
  function drawSand(x, f, running, t) {
    const vt = TOTAL * f, vb = TOTAL - vt;
    const dTop = levelTop(vt), dBot = levelBot(vb);
    x.save(); glassPath(x, 1.2); x.clip();
    // top: a level surface that sinks into a funnel over the neck as it drains
    if (f > 0.002) {
      const y0 = NECK[1] - dTop, w = hw(dTop, true), dip = running ? Math.min(dTop * 0.55, 3 + (1 - f) * 7) : 0;
      const g = x.createLinearGradient(0, y0 - 2, 0, NECK[1]); g.addColorStop(0, sandA); g.addColorStop(1, sandB);
      x.fillStyle = g; x.beginPath();
      x.moveTo(NECK[0] - w - 2, y0);
      x.quadraticCurveTo(NECK[0] - w * 0.4, y0 + dip * 0.15, NECK[0], y0 + dip);
      x.quadraticCurveTo(NECK[0] + w * 0.4, y0 + dip * 0.15, NECK[0] + w + 2, y0);
      x.lineTo(NECK[0] + 60, NECK[1] + 1); x.lineTo(NECK[0] - 60, NECK[1] + 1); x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,240,240,.18)'; x.beginPath(); x.ellipse(NECK[0], y0 + dip * 0.4, w * 0.7, 1.6, 0, 0, 6.3); x.fill();
    }
    // bottom: a heap, highest under the stream
    if (f < 0.998) {
      const yL = NECK[1] + dBot, w = hw(dBot, false), heap = Math.min(16, (BOT_END - dBot) * 0.55 + 2);
      const g = x.createLinearGradient(0, yL - heap, 0, NECK[1] + BOT_END); g.addColorStop(0, sandA); g.addColorStop(1, sandB);
      x.fillStyle = g; x.beginPath();
      x.moveTo(NECK[0] - w - 4, yL + heap * 0.35);
      x.quadraticCurveTo(NECK[0] - w * 0.35, yL - heap * 0.45, NECK[0], yL - heap * 0.65);
      x.quadraticCurveTo(NECK[0] + w * 0.35, yL - heap * 0.45, NECK[0] + w + 4, yL + heap * 0.35);
      x.lineTo(NECK[0] + 70, NECK[1] + BOT_END + 2); x.lineTo(NECK[0] - 70, NECK[1] + BOT_END + 2); x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,240,240,.16)'; x.beginPath(); x.ellipse(NECK[0] - w * 0.15, yL - heap * 0.3, w * 0.45, 1.4, -0.05, 0, 6.3); x.fill();
    }
    // the stream through the neck, and the grains landing on the heap
    if (running && f > 0.002) {
      const yHit = NECK[1] + dBot - Math.min(16, (BOT_END - dBot) * 0.55 + 2) * 0.65;
      x.strokeStyle = sandA; x.globalAlpha = 0.85 + 0.15 * Math.sin(t * 40); x.lineWidth = 1.1;
      x.beginPath(); x.moveTo(NECK[0], NECK[1] - 2); x.lineTo(NECK[0] + Math.sin(t * 23) * 0.15, yHit); x.stroke();
      x.globalAlpha = 1; x.fillStyle = sandA;
      for (let i = 0; i < 5; i++) {
        const k = ((t * 3.1 + i * 0.37) % 1), dx = Math.sin(i * 12.9 + Math.floor(t * 3.1 + i * 0.37) * 7.7) * 5 * k;
        x.globalAlpha = 1 - k; x.fillRect(NECK[0] + dx - 0.4, yHit - Math.sin(k * Math.PI) * 2.2, 0.8, 0.8);
      }
      x.globalAlpha = 1;
    }
    x.restore();
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
