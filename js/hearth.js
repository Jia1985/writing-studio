// The reading room comes alive: the fire moves and breathes, the fairy
// lights on the tree and the mantel twinkle, the candle flames flicker and
// the two dogs asleep on the rug rise and fall with their breathing. All of
// it is drawn on one canvas straight over the painting, under the room's light.

const W = 1672, H = 941;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
// cheap smooth noise: a few sines at unrelated rates
const n1 = (x) => Math.sin(x) * 0.5 + Math.sin(x * 2.17 + 1.3) * 0.3 + Math.sin(x * 5.31 + 4.1) * 0.2;

// the fire: the opening of the firebox, and where the flames stand on the logs
const FIRE = { x: 1060, y: 292, w: 180, h: 160, base: 438 };
// where to look for little lights in the painting
const LIGHT_ZONES = [[1468, 0, 204, 600], [790, 62, 745, 150], [570, 0, 130, 120]];
const FLAMES = [[80, 650], [948, 468], [893, 112], [916, 92], [1279, 31], [1419, 58], [1446, 47], [1346, 56], [851, 116], [688, 322]];
// the dogs: the part of each that rises with a breath, and the floor it rests on
export const DOGS = [
  { cx: 772, cy: 540, rx: 168, ry: 64, floor: 606, period: 4.6, phase: 0.1 },
  { cx: 1338, cy: 598, rx: 150, ry: 72, floor: 674, period: 5.3, phase: 0.55 },
];
// how full a dog's chest is at a moment of its breath: in quickly, out slowly
export function breath(dog, wallSec) {
  const ph = ((wallSec / dog.period + dog.phase) % 1 + 1) % 1;
  return ph < 0.4 ? Math.sin((ph / 0.4) * Math.PI / 2) ** 2 : Math.cos(((ph - 0.4) / 0.6) * Math.PI / 2) ** 2;
}

export function createHearth(canvas, src) {
  const c = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  let ready = false, blank = true, fireSrc = null, lights = [], dogs = [];

  const img = new Image();
  img.onload = () => { try { build(); ready = true; } catch (e) { console.warn('hearth', e); } };
  img.src = src;

  function build() {
    fireSrc = document.createElement('canvas'); fireSrc.width = FIRE.w; fireSrc.height = FIRE.h;
    fireSrc.getContext('2d').drawImage(img, FIRE.x, FIRE.y, FIRE.w, FIRE.h, 0, 0, FIRE.w, FIRE.h);

    // the little lights: small, bright, warm spots
    for (const [zx, zy, zw, zh] of LIGHT_ZONES) {
      const t = document.createElement('canvas'); t.width = zw; t.height = zh;
      const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(img, zx, zy, zw, zh, 0, 0, zw, zh);
      const d = x.getImageData(0, 0, zw, zh).data, seen = new Uint8Array(zw * zh);
      const hot = (i) => { const p = i * 4; return d[p] > 236 && d[p + 1] > 196 && d[p] - d[p + 2] > 40; };
      for (let i = 0; i < zw * zh; i++) {
        if (seen[i] || !hot(i)) continue;
        // flood the spot to find its size and centre
        const stack = [i]; seen[i] = 1; let n = 0, sx = 0, sy = 0;
        while (stack.length) {
          const j = stack.pop(), jx = j % zw, jy = (j / zw) | 0; n++; sx += jx; sy += jy;
          for (const k of [j - 1, j + 1, j - zw, j + zw]) if (k >= 0 && k < zw * zh && !seen[k] && Math.abs((k % zw) - jx) <= 1 && hot(k)) { seen[k] = 1; stack.push(k); }
        }
        if (n >= 2 && n <= 70) {
          const lx = zx + sx / n, ly = zy + sy / n;
          if (FLAMES.some(([fx, fy]) => Math.hypot(fx - lx, fy - ly) < 14)) continue;   // candle flames are done separately
          lights.push({ x: lx, y: ly, r: 2.2 + Math.sqrt(n) * 1.1, ph: Math.random() * 6.28, f: 0.4 + Math.random() * 1.4, k: Math.random() });
        }
      }
    }

    // the dogs, lifted out so they can breathe
    dogs = DOGS.map((g) => {
      const x0 = Math.floor(g.cx - g.rx - 4), y0 = Math.floor(g.cy - g.ry - 6), w = Math.ceil(g.rx * 2 + 8), h = Math.ceil(g.floor - y0 + 2);
      const s = document.createElement('canvas'); s.width = w; s.height = h;
      const x = s.getContext('2d'); x.drawImage(img, x0, y0, w, h, 0, 0, w, h);
      // only the body, fading out toward the edges (so head, paws and rug stay still)
      const m = document.createElement('canvas'); m.width = w; m.height = h;
      const mx = m.getContext('2d');
      const grd = mx.createRadialGradient(0, 0, 0, 0, 0, 1);
      grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.72, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      mx.setTransform(g.rx, 0, 0, g.ry, g.cx - x0, g.cy - y0); mx.fillStyle = grd; mx.beginPath(); mx.arc(0, 0, 1, 0, 6.3); mx.fill();
      x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
      return { ...g, x0, y0, w, h, s };
    });
  }

  // ── fire ─────────────────────────────────────────────────────────────
  const tongues = [];
  function drawFire(dt, t) {
    // the flames lick upward: each row of the fire is pushed sideways by a
    // ripple travelling up from the logs, more strongly the higher it is
    const { x: X, y: Y, w, h, base } = FIRE;
    c.save();
    c.beginPath(); c.rect(X + 6, Y + 6, w - 12, base - Y + 6); c.clip();
    for (let y = 0; y < base - Y; y += 2) {
      const up = smooth(base - Y, 20, y);                       // 0 at the logs, 1 at the top
      const dx = up * (3.2 * n1(y * 0.075 - t * 5.2) + 1.6 * n1(y * 0.21 - t * 9.1 + 2));
      const sy = clamp(y + up * 2.2 * n1(t * 3.3 + y * 0.03), 0, h - 2);
      c.drawImage(fireSrc, 0, sy, w, 2, X + dx, Y + y, w, 2);
    }
    // breathing: the whole fire brightens and dims a little
    const glow = 0.18 + 0.14 * n1(t * 2.3) + 0.08 * n1(t * 7.7 + 1);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = clamp(glow, 0, 0.5);
    c.drawImage(fireSrc, 0, 0, w, base - Y, X, Y, w, base - Y);
    // fresh tongues of flame rise from the logs and fade
    if (Math.random() < dt * 9) tongues.push({ x: X + 50 + Math.random() * 90, y: base - 18 - Math.random() * 18, vy: 40 + Math.random() * 50, life: 0, max: 0.5 + Math.random() * 0.6, s: 5 + Math.random() * 7, ph: Math.random() * 6 });
    for (let i = tongues.length - 1; i >= 0; i--) {
      const q = tongues[i]; q.life += dt; q.y -= q.vy * dt;
      if (q.life > q.max) { tongues.splice(i, 1); continue; }
      const k = q.life / q.max, a = Math.sin(Math.PI * k) * 0.55, s = q.s * (1 - k * 0.5), x = q.x + Math.sin(t * 6 + q.ph) * 3 * k;
      const g = c.createRadialGradient(x, q.y, 0, x, q.y, s * 2.2);
      g.addColorStop(0, `rgba(255,236,170,${a})`); g.addColorStop(0.45, `rgba(255,160,60,${a * 0.6})`); g.addColorStop(1, 'rgba(255,120,30,0)');
      c.globalAlpha = 1; c.fillStyle = g;
      c.beginPath(); c.ellipse(x, q.y, s, s * 2.2, 0, 0, 6.3); c.fill();
    }
    c.restore();
    // firelight on the hearth, the rug and the dogs
    const a = 0.05 + 0.04 * n1(t * 2.9) + 0.02 * n1(t * 8.3);
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(1150, 470, 20, 1150, 520, 420);
    g.addColorStop(0, `rgba(255,150,60,${a})`); g.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = g; c.fillRect(700, 260, 900, 520);
    c.restore();
  }

  // ── lights and flames ────────────────────────────────────────────────
  function drawLights(t) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      // most glow steadily and breathe a little; now and then one sparkles
      const tw = 0.35 + 0.35 * (Math.sin(t * L.f + L.ph) * 0.5 + 0.5) + (L.k > 0.75 ? 0.6 * Math.max(0, Math.sin(t * L.f * 2.7 + L.ph)) ** 12 : 0);
      const g = c.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 2.6);
      g.addColorStop(0, `rgba(255,236,190,${0.55 * tw})`); g.addColorStop(0.35, `rgba(255,200,120,${0.22 * tw})`); g.addColorStop(1, 'rgba(255,180,90,0)');
      c.fillStyle = g; c.beginPath(); c.arc(L.x, L.y, L.r * 2.6, 0, 6.3); c.fill();
    }
    FLAMES.forEach(([x, y], i) => {
      const f = 0.55 + 0.25 * n1(t * 7 + i * 3.1) + 0.2 * n1(t * 17 + i);
      const r = 9 + 3 * f, dy = n1(t * 5 + i) * 0.8;
      const g = c.createRadialGradient(x, y + dy, 0, x, y + dy, r);
      g.addColorStop(0, `rgba(255,226,150,${0.32 * f})`); g.addColorStop(1, 'rgba(255,170,80,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y + dy, r, 0, 6.3); c.fill();
    });
    c.restore();
  }

  // ── the dogs ─────────────────────────────────────────────────────────
  function drawDogs(wallSec) {
    for (const g of dogs) {
      const b = breath(g, wallSec), k = 1 + b * 0.016;
      // the body swells upward from where it lies on the floor
      const h = g.h * k, y = g.y0 + g.h - h;
      c.drawImage(g.s, g.x0, y - (k - 1) * 4, g.w, h);
    }
  }

  return {
    draw(dt, t, nowMs) {
      if (!ready) return;
      blank = false;
      c.clearRect(0, 0, W, H);
      drawDogs(Date.now() / 1000);
      drawFire(dt, t);
      drawLights(t);
    },
    clear() { if (!blank) { c.clearRect(0, 0, W, H); blank = true; } },
    get ready() { return ready; },
  };
}
