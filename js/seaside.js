// The seaside café comes alive: the painted sea rolls in, whitecaps travel
// toward the shore, the sun glints on the water and gulls wheel in the sky.
// Everything is drawn on one canvas that sits directly on the painting (and
// under the room's light), so the scene's own lighting still colours it.
// Nothing here touches the writing.

const X0 = 760, CW = 912, CH = 562;             // canvas placement on the stage (stage px)
const SEA_TOP = 320, SEA_H = CH - SEA_TOP;      // rows of the canvas that hold water
const HORIZON = 326, SHORE = 560;
const R = Math.random;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const wob = (x) => Math.sin(x * 1.7 + 0.3) * 0.5 + Math.sin(x * 0.63 + 2.1) * 0.3 + Math.sin(x * 3.1 + 5) * 0.2;

// the lower edge of the awning (stage px): gulls pass behind it
const AWNING = [[900, 186], [926, 180], [1271, 104], [1488, 60], [1571, 28], [1672, 16]];
// the two gulls in the painting, lifted out so that real ones can fly
const PAINTED = [[1410, 90, 88, 56], [1344, 162, 102, 48]];

export function createSeaside(canvas, src) {
  const ctx = canvas.getContext('2d');
  canvas.width = CW; canvas.height = CH;
  let ready = false, blank = true;
  let paint = null, mask = null, patches = [];
  const buf = document.createElement('canvas'); buf.width = CW; buf.height = SEA_H;
  const bx = buf.getContext('2d');

  const img = new Image();
  img.onload = () => { try { build(); ready = true; } catch { ready = false; } };
  img.src = src;

  function build() {
    paint = document.createElement('canvas'); paint.width = CW; paint.height = CH;
    const pc = paint.getContext('2d', { willReadFrequently: true });
    pc.drawImage(img, X0, 0, CW, CH, 0, 0, CW, CH);

    // water is whatever in the sea's part of the picture is blue, or white and cool (foam);
    // flowers, stone, sand, railings and people are none of those and stay still
    const px = pc.getImageData(0, SEA_TOP, CW, SEA_H), d = px.data;
    const m = new ImageData(CW, SEA_H);
    for (let y = 0; y < SEA_H; y++) {
      const Y = SEA_TOP + y;
      for (let x = 0; x < CW; x++) {
        const X = X0 + x, top = X < 1195 ? HORIZON : X < 1240 ? HORIZON + (X - 1195) * 0.5 : 349 + (X - 1240) * 0.008;
        if (X < 800 || Y < top || Y > SHORE) continue;
        const i = (y * CW + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        const blue = b > r + 12 && b > 90 && g > r - 6, foam = Math.min(r, g, b) > 168 && r - b < 20 && Math.abs(g - b) < 28;
        if (blue || foam) m.data[i + 3] = 255;
      }
    }
    const raw = document.createElement('canvas'); raw.width = CW; raw.height = SEA_H; raw.getContext('2d').putImageData(m, 0, 0);
    mask = document.createElement('canvas'); mask.width = CW; mask.height = SEA_H;
    const mc = mask.getContext('2d', { willReadFrequently: true });
    mc.filter = 'blur(2px)'; mc.drawImage(raw, 0, 0); mc.filter = 'none';
    // pull the soft edge inward so nothing that isn't water gets carried along
    const soft = mc.getImageData(0, 0, CW, SEA_H);
    for (let i = 3; i < soft.data.length; i += 4) { const k = clamp((soft.data[i] - 150) / 80, 0, 1); soft.data[i] = 255 * k * k * (3 - 2 * k); }
    mc.putImageData(soft, 0, 0);

    patches = PAINTED.map(([x, y, w, h]) => ({ x, y, canvas: skyPatch(pc, x - X0, y, w, h) }));

    // The moving water is drawn from a plate that is water all the way across: wherever a post,
    // a flower or the shore stands in front, the sea beside it is carried through. Otherwise
    // every passing swell would drag a ghost of the railing along with it.
    const filled = new Uint8Array(SEA_H);
    for (let y = 0; y < SEA_H; y++) {
      const row = y * CW, from = new Int32Array(CW).fill(-1); let last = -1;
      for (let x = 0; x < CW; x++) { if (m.data[(row + x) * 4 + 3]) last = x; from[x] = last; }
      last = -1;
      for (let x = CW - 1; x >= 0; x--) {
        if (m.data[(row + x) * 4 + 3]) { last = x; continue; }
        const l = from[x], src = l < 0 ? last : last < 0 ? l : (x - l <= last - x ? l : last);
        if (src < 0) continue;
        for (let c = 0; c < 3; c++) d[(row + x) * 4 + c] = d[(row + src) * 4 + c];
      }
      filled[y] = from[CW - 1] >= 0 ? 1 : 0;
    }
    for (let y = 0; y < SEA_H; y++) {
      if (filled[y]) continue;
      let o = 1; while (o < SEA_H && !(filled[y + o] || filled[y - o])) o++;
      const sy = filled[y + o] ? y + o : y - o; if (sy < 0 || sy >= SEA_H || !filled[sy]) continue;
      d.copyWithin(y * CW * 4, sy * CW * 4, (sy + 1) * CW * 4);
    }
    pc.putImageData(px, 0, SEA_TOP);
  }

  // Rebuild the sky behind a painted gull from the sky around it.
  function skyPatch(pc, x, y, w, h) {
    const px = pc.getImageData(x - 3, y - 3, w + 6, h + 6), d = px.data, W = w + 6;
    const at = (xx, yy, c) => d[(yy * W + xx) * 4 + c];
    const edge = (xx, yy, c, horiz) => horiz ? (at(xx, yy, c) + at(xx + 1, yy, c) + at(xx + 2, yy, c)) / 3 : (at(xx, yy, c) + at(xx, yy + 1, c) + at(xx, yy + 2, c)) / 3;
    const est = new Float32Array(w * h * 3), hit = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const fx = (i + 0.5) / w, fy = (j + 0.5) / h; let dl = 0;
      for (let c = 0; c < 3; c++) {
        const hz = lerp(edge(0, j + 3, c, true), edge(w + 3, j + 3, c, true), fx), vt = lerp(edge(i + 3, 0, c, false), edge(i + 3, h + 3, c, false), fy);
        const e = (hz * (1 - Math.abs(fy - 0.5)) + vt * (1 - Math.abs(fx - 0.5))) / (2 - Math.abs(fy - 0.5) - Math.abs(fx - 0.5));
        est[(j * w + i) * 3 + c] = e; dl += Math.abs(at(i + 3, j + 3, c) - e);
      }
      if (dl > 26) hit[j * w + i] = 1;                      // darker or brighter than the sky should be: bird
    }
    // grow the bird's outline a little, then feather it
    const pass = (a, fn) => { const o = new Float32Array(a.length); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let v = fn === Math.max ? 0 : 0, n = 0; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue; const s = a[jj * w + ii]; if (fn === Math.max) v = Math.max(v, s); else { v += s; n++; } } o[j * w + i] = fn === Math.max ? v : v / n; } return o; };
    const grown = pass(pass(pass(hit, Math.max), Math.max), null);
    const out = new ImageData(w, h);
    for (let k = 0; k < w * h; k++) {
      const a = clamp(grown[k] * 1.6, 0, 1);
      out.data[k * 4] = est[k * 3]; out.data[k * 4 + 1] = est[k * 3 + 1]; out.data[k * 4 + 2] = est[k * 3 + 2]; out.data[k * 4 + 3] = 255 * a;
    }
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(out, 0, 0);
    return c;
  }

  // ── sea ──────────────────────────────────────────────────────────────
  let crests = [], nextCrest = 0;
  const glints = Array.from({ length: 110 }, () => {
    const d = Math.pow(R(), 1.5) * 0.75 + 0.02;
    return { x: 800 + Math.pow(R(), 0.7) * 872, d, ph: R() * 6.28, rate: 1.4 + R() * 3.2 };
  });

  function drawSea(dt, t, kind) {
    const chop = kind === 'rainy' ? 1.55 : kind === 'dusk' ? 0.85 : 1;
    bx.globalCompositeOperation = 'source-over'; bx.clearRect(0, 0, CW, SEA_H);
    // the swell: every row of water rides up and down and slides a little, more the nearer it is
    for (let y = 0; y < SEA_H; y++) {
      const Y = SEA_TOP + y, d = clamp((Y - HORIZON) / (SHORE - HORIZON), 0, 1), u = Math.log(1 + d * 10);
      const amp = (0.3 + 3.1 * d) * chop;
      const dy = amp * (0.6 * Math.sin(u * 22 - t * 1.15) + 0.4 * Math.sin(u * 9.5 - t * 0.66 + 1.7));
      const dx = amp * (1.5 * Math.sin(u * 13 - t * 0.85 + 0.6) + 0.6 * Math.sin(u * 31 - t * 1.7));
      bx.drawImage(paint, 0, clamp(Y + dy, SEA_TOP, CH - 1), CW, 1, dx, y, CW, 1);
    }
    // whitecaps: they rise out at sea, travel in, and dissolve
    if (t > nextCrest) {
      nextCrest = t + (1.6 + R() * 2.6) / chop;
      crests.push({ d: 0.18 + R() * 0.3, v: 0.016 + R() * 0.012, cx: 830 + R() * 820, hw: 70 + R() * 150, age: 0, life: 7 + R() * 5, seed: R() * 50 });
    }
    crests = crests.filter((c) => c.age < c.life && c.d < 0.9);
    for (const c of crests) {
      c.age += dt; c.d += c.v * (0.5 + c.d * 1.6) * dt;
      const Y = HORIZON + c.d * (SHORE - HORIZON), hw = c.hw * (0.45 + 1.5 * c.d), a = Math.pow(Math.sin(Math.PI * c.age / c.life), 1.3) * (kind === 'dusk' ? 0.42 : 0.6);
      for (let x = c.cx - hw; x < c.cx + hw; x += 5) {
        const e = (x - c.cx) / hw, taper = 1 - e * e, n = wob(x * 0.05 + c.seed + t * 0.12);
        if (n < -0.22) continue;                              // a crest is broken, never a ruled line
        const th = (0.8 + 3.4 * c.d) * (0.55 + 0.6 * (n + 0.22)) * taper;
        bx.fillStyle = `rgba(255,255,255,${(a * taper).toFixed(3)})`;
        bx.beginPath(); bx.ellipse(x - X0, Y - SEA_TOP + n * 3.6 * (0.5 + c.d) - e * e * 3.5, 4.5, Math.max(0.7, th / 2), 0, 0, 6.3); bx.fill();
      }
    }
    // sunlight on the water
    if (kind !== 'rainy') {
      bx.globalCompositeOperation = 'lighter';
      const tint = kind === 'dusk' ? '255,214,160' : '255,255,250';
      for (const g of glints) {
        const s = Math.sin(t * g.rate + g.ph); if (s < 0.55) continue;
        const a = Math.pow((s - 0.55) / 0.45, 2) * 0.75;
        bx.fillStyle = `rgba(${tint},${a.toFixed(3)})`;
        bx.fillRect(g.x - X0, HORIZON + g.d * (SHORE - HORIZON) - SEA_TOP + Math.sin(t * 0.9 + g.ph) * 1.5 * g.d, 1.5 + 4 * g.d, 0.8 + 0.8 * g.d);
      }
    }
    bx.globalCompositeOperation = 'destination-in'; bx.drawImage(mask, 0, 0);
    ctx.drawImage(buf, 0, SEA_TOP);
  }

  // ── gulls ────────────────────────────────────────────────────────────
  // Each one soars round a slow loop of its own, gliding most of the time and
  // beating its wings in short bursts, as gulls do on a sea breeze.
  const mkGull = (cx, cy, rx, ry, w, span) => ({ cx, cy, rx, ry, w, span, th: R() * 6.28, k: R() * 20, flap: 0, fp: R() * 6.28, until: 2 + R() * 6, beating: false });
  const gulls = [mkGull(1430, 152, 170, 34, 0.21, 66), mkGull(1290, 218, 235, 46, -0.16, 54), mkGull(1545, 252, 105, 28, 0.29, 34)];
  const far = Array.from({ length: 3 }, (_, i) => ({ x: 1700 + i * 34 + R() * 20, y: 286 + i * 7 + R() * 6, v: 16 + R() * 3, span: 13 + R() * 4, fp: R() * 6.28, wait: 6 + R() * 8 }));

  function wing(s, a, shade) {
    // s: side (-1 / 1); a: -1 (down-stroke) … 1 (up-stroke)
    const ex = s * 22, ey = -9 - a * 12, tx = s * (50 - 9 * a * a), ty = 6 - a * 30;   // gliding, the wing is a shallow M: wrist high, tip trailing
    const g = ctx.createLinearGradient(s * 4, 0, tx, ty);
    g.addColorStop(0, shade(240, 238, 234)); g.addColorStop(0.42, shade(198, 196, 195)); g.addColorStop(0.76, shade(122, 119, 118)); g.addColorStop(1, shade(38, 36, 36));
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(s * 2, -3); ctx.quadraticCurveTo(ex, ey - 5, tx, ty);
    ctx.quadraticCurveTo(ex + s * 3, ey + 12, s * 2, 7); ctx.closePath(); ctx.fill();
  }
  function drawGull(x, y, span, a, bank, dir, dim) {
    const shade = (r, g, b) => `rgb(${Math.round(r * dim)},${Math.round(g * dim)},${Math.round(b * dim)})`;
    ctx.save(); ctx.translate(x - X0, y); ctx.rotate(bank); ctx.scale(span / 100, span / 100);
    wing(-1, a, shade); wing(1, a, shade);
    ctx.fillStyle = shade(250, 247, 241);
    ctx.beginPath(); ctx.ellipse(0, 2.5, 9.5, 5.8, 0, 0, 6.3); ctx.fill();                    // body
    ctx.beginPath(); ctx.arc(dir * 7.5, 0.4, 4, 0, 6.3); ctx.fill();                      // head
    ctx.beginPath(); ctx.moveTo(-dir * 6, 0); ctx.lineTo(-dir * 15, 3); ctx.lineTo(-dir * 6, 6.5); ctx.closePath(); ctx.fill();   // tail
    ctx.fillStyle = shade(226, 168, 70); ctx.beginPath(); ctx.ellipse(dir * 12, 1.2, 2.2, 1, 0, 0, 6.3); ctx.fill();               // bill
    ctx.restore();
  }

  function drawBirds(dt, t, kind) {
    for (const p of patches) ctx.drawImage(p.canvas, p.x - X0, p.y);
    ctx.save(); ctx.beginPath();
    AWNING.forEach(([x, y], i) => (i ? ctx.lineTo(x - X0, y) : ctx.moveTo(x - X0, y)));
    ctx.lineTo(CW, 345); ctx.lineTo(905 - X0, 345); ctx.closePath(); ctx.clip();
    try { ctx.filter = 'blur(0.5px)'; } catch { /* drawn crisp instead */ }
    const dim = kind === 'rainy' ? 0.78 : 1, flock = kind === 'rainy' ? 1 : gulls.length;
    for (let i = 0; i < flock; i++) {
      const g = gulls[i];
      g.th += g.w * dt;
      const x = g.cx + g.rx * Math.cos(g.th) + 34 * Math.sin(t * 0.05 + g.k), y = g.cy + g.ry * Math.sin(g.th) + 9 * Math.sin(t * 0.23 + g.k) + (kind === 'rainy' ? 30 : 0);
      const vx = -g.rx * g.w * Math.sin(g.th), vy = g.ry * g.w * Math.cos(g.th);
      g.until -= dt;
      if (g.until < 0) { g.beating = !g.beating; g.until = g.beating ? 1.2 + R() * 2.2 : (3.5 + R() * 7) * (g.span > 40 ? 1 : 0.5); }
      g.flap += ((g.beating ? 1 : 0) - g.flap) * Math.min(1, dt * 3.5);
      g.fp += dt * 6.28 * (g.span > 40 ? 2.5 : 3.4);
      const a = lerp(0.2 + 0.06 * Math.sin(t * 1.3 + g.k), Math.sin(g.fp) * 0.85, g.flap);
      const near = 1 + 0.2 * Math.sin(g.th);                                       // the low side of the loop is the near side
      drawGull(x, y, g.span * near, a, Math.atan2(vy, Math.abs(vx) + 26) * 0.7 * Math.sign(vx || 1), clamp(vx / 12, -1, 1), dim);
    }
    if (kind !== 'rainy') for (const f of far) {                                   // a few more, far out and low over the water
      if (f.wait > 0) { f.wait -= dt; continue; }
      f.x -= f.v * dt; f.fp += dt * 6.28 * 3.1;
      if (f.x < 880) { f.x = 1700 + R() * 60; f.y = 270 + R() * 40; f.wait = 8 + R() * 22; }
      drawGull(f.x, f.y + Math.sin(t * 0.7 + f.fp * 0.01) * 2, f.span, Math.sin(f.fp) * 0.8, 0, -1, dim * 0.86);
    }
    ctx.restore();
  }

  return {
    draw(dt, t, kind) {
      if (!ready) return;
      ctx.clearRect(0, 0, CW, CH); blank = false;
      drawSea(dt, t, kind); drawBirds(dt, t, kind);
    },
    clear() { if (!blank) { ctx.clearRect(0, 0, CW, CH); blank = true; } },
    get ready() { return ready; },
  };
}
