// The old library comes alive: dust turns slowly in the shafts of sun, leaves
// drift down past the tall windows, the ivy on the shelves stirs, and the
// clock on the wall keeps time with a real second hand. Two canvases sit
// straight on the painting (under the room's light, so the lamp and the
// weather still colour them). Nothing here touches the writing.

const R = Math.random;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

// left: windows, sunbeams and the dust in them (stage px)
const LW = 760, LH = 640;
// the glass of the four tall windows: [x0, x1, top, sill] — sills stop above the readers' heads
const PANES = [[35, 145, 0, 362], [202, 322, 0, 334], [352, 440, 16, 370], [460, 525, 32, 342]];
const WIN_W = 530, WIN_H = 390;
// The shafts of sun in the painting leave the last window and slant down
// across the pillar, fading before the shelves. Each is a band u = x - SLANT * y.
const SLANT = 0.85;
const BEAMS = [{ u: 431, w: 24, a: 1 }, { u: 356, w: 30, a: 0.8 }, { u: 468, w: 16, a: 0.55 }];
const BEAM_TOP = 30, BEAM_FLOOR = 400, BEAM_X0 = 470, BEAM_X1 = 690;
const beamFade = (x, y) => smooth(BEAM_X0, BEAM_X0 + 50, x) * (1 - smooth(BEAM_X1 - 80, BEAM_X1, x)) * smooth(BEAM_TOP, BEAM_TOP + 40, y) * (1 - smooth(BEAM_FLOOR - 60, BEAM_FLOOR, y));

// right: the ivy on the end of the shelves, and the wall clock
const RX = 1440, RW = 232, RH = 440;
const IVY_X = 1520;
const CLOCK = { x: 1506.5, y: 126 };

export function createLibrary(left, right, src) {
  const lc = left.getContext('2d'), rc = right.getContext('2d');
  left.width = LW; left.height = LH; right.width = RW; right.height = RH;
  let ready = false, blank = true;
  let glass = null, ivy = null, ivyBack = null;
  const leafBuf = document.createElement('canvas'); leafBuf.width = WIN_W; leafBuf.height = WIN_H;
  const lb = leafBuf.getContext('2d');

  const img = new Image();
  img.onload = () => { try { build(); ready = true; } catch { ready = false; } };
  img.src = src;

  function build() {
    // glass: the bright, sunlit squares between the dark glazing bars
    const wc = document.createElement('canvas'); wc.width = WIN_W; wc.height = WIN_H;
    const w = wc.getContext('2d', { willReadFrequently: true });
    w.drawImage(img, 0, 0, WIN_W, WIN_H, 0, 0, WIN_W, WIN_H);
    const px = w.getImageData(0, 0, WIN_W, WIN_H), d = px.data, m = w.createImageData(WIN_W, WIN_H), md = m.data;
    for (const [x0, x1, y0, y1] of PANES) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * WIN_W + x) * 4, lum = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      md[i + 3] = clamp((lum - 92) * 5, 0, 255) * smooth(y1, y1 - 14, y);
    }
    w.putImageData(m, 0, 0);
    glass = document.createElement('canvas'); glass.width = WIN_W; glass.height = WIN_H;
    const g = glass.getContext('2d'); g.filter = 'blur(0.6px)'; g.drawImage(wc, 0, 0); g.filter = 'none';

    // ivy: lift the leaves out, and fill in the shelves behind them
    const ic = document.createElement('canvas'); ic.width = RW; ic.height = RH;
    const s = ic.getContext('2d', { willReadFrequently: true });
    s.drawImage(img, RX, 0, RW, RH, 0, 0, RW, RH);
    const ip = s.getImageData(0, 0, RW, RH), id = ip.data;
    const leaf = new Uint8Array(RW * RH);
    for (let y = 0; y < RH; y++) for (let x = IVY_X - RX; x < RW; x++) {
      const i = (y * RW + x) * 4, r = id[i], gg = id[i + 1], b = id[i + 2];
      if (gg > 46 && gg > r * 1.02 && gg > b * 1.25) leaf[y * RW + x] = 1;
    }
    // grow the leaf mask by a pixel so their soft edges come along too
    const grown = leaf.slice();
    for (let y = 1; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) if (!leaf[y * RW + x] && (leaf[y * RW + x - 1] || leaf[y * RW + x + 1] || leaf[(y - 1) * RW + x] || leaf[(y + 1) * RW + x])) grown[y * RW + x] = 1;
    const sprite = s.createImageData(RW, RH), sd = sprite.data, back = s.createImageData(RW, RH), bd = back.data;
    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        const k = y * RW + x, i = k * 4;
        if (!grown[k]) continue;
        sd[i] = id[i]; sd[i + 1] = id[i + 1]; sd[i + 2] = id[i + 2]; sd[i + 3] = 255;
        // what is behind: blend the nearest shelf colours either side
        let l = x - 1, r = x + 1;
        while (l >= 0 && grown[y * RW + l]) l--; while (r < RW && grown[y * RW + r]) r++;
        const c = (xx) => { const j = (y * RW + xx) * 4; return [id[j], id[j + 1], id[j + 2]]; };
        let col;
        if (l >= 0 && r < RW) { const a = c(l), b = c(r), t = (x - l) / (r - l); col = a.map((v, n) => v + (b[n] - v) * t); }
        else col = c(l >= 0 ? l : Math.min(RW - 1, r));
        bd[i] = col[0] * 0.92; bd[i + 1] = col[1] * 0.9; bd[i + 2] = col[2] * 0.9; bd[i + 3] = 255;
      }
    }
    ivy = document.createElement('canvas'); ivy.width = RW; ivy.height = RH; ivy.getContext('2d').putImageData(sprite, 0, 0);
    ivyBack = document.createElement('canvas'); ivyBack.width = RW; ivyBack.height = RH;
    const bc = ivyBack.getContext('2d'); bc.putImageData(back, 0, 0);
    // soften the filled-in shelves so they read as shadow, not smears
    const soft = document.createElement('canvas'); soft.width = RW; soft.height = RH;
    const so = soft.getContext('2d'); so.filter = 'blur(3px)'; so.drawImage(ivyBack, 0, 0); so.filter = 'none';
    so.globalCompositeOperation = 'destination-in'; so.drawImage(ivyBack, 0, 0);
    ivyBack = soft;
  }

  // ── dust in the sunbeams ───────────────────────────────────────────────
  const beamAt = (x, y) => {
    const u = x - SLANT * y;
    let b = 0;
    for (const s of BEAMS) { const z = (u - s.u) / s.w; b += s.a * Math.exp(-z * z); }
    return Math.min(1, b) * beamFade(x, y);
  };
  const spawn = (m) => {
    // somewhere along one of the shafts, a little to either side of it
    const s = BEAMS[Math.floor(R() * BEAMS.length)];
    for (let i = 0; i < 8; i++) {
      m.x = BEAM_X0 + R() * (BEAM_X1 - BEAM_X0);
      m.y = (m.x - s.u) / SLANT + (R() - 0.5) * s.w * 2.4 / SLANT;
      if (m.y > BEAM_TOP && m.y < BEAM_FLOOR) break;
    }
    m.r = 0.45 + R() * R() * 1.4; m.ph = R() * 6.28; m.f = 0.3 + R() * 1.1;
    m.vx = (R() - 0.5) * 3; m.vy = (R() - 0.5) * 2.2 + 0.6; m.life = 18 + R() * 30; m.age = 0;
    return m;
  };
  const motes = Array.from({ length: 150 }, () => spawn({}));

  function drawBeams(t, sun) {
    // the shafts breathe a little, as a cloud thins and thickens far off
    lc.save(); lc.globalCompositeOperation = 'lighter';
    BEAMS.forEach((s, k) => {
      const a = sun * s.a * (0.05 + 0.025 * Math.sin(t * 0.21 + k * 1.9) + 0.012 * Math.sin(t * 0.67 + k));
      const y0 = BEAM_TOP, y1 = BEAM_FLOOR, hw = s.w * 1.4;
      lc.save();
      lc.setTransform(1, 0, SLANT, 1, 0, 0);      // shear the upright band onto the slant: x = u + SLANT * y
      const g = lc.createLinearGradient(s.u - hw, 0, s.u + hw, 0);
      g.addColorStop(0, 'rgba(255,214,150,0)'); g.addColorStop(0.5, `rgba(255,222,165,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(255,214,150,0)');
      lc.fillStyle = g;
      // fade in as it leaves the window and out before the shelves
      for (let y = y0; y < y1; y += 12) {
        lc.globalAlpha = beamFade(s.u + SLANT * (y + 6), y + 6);
        if (lc.globalAlpha > 0.01) lc.fillRect(s.u - hw, y, hw * 2, 12.5);
      }
      lc.restore();
    });
    lc.restore();
  }
  function drawMotes(dt, t, sun) {
    lc.save(); lc.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      // slow, wandering air: each mote drifts on its own little current
      m.vx += (Math.sin(t * 0.37 + m.ph * 3) * 1.6 - m.vx) * dt * 0.4 + (R() - 0.5) * dt * 4;
      m.vy += (0.5 + Math.sin(t * 0.29 + m.ph) * 1.2 - m.vy) * dt * 0.4 + (R() - 0.5) * dt * 4;
      m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt; m.age += dt;
      const b = beamAt(m.x, m.y);
      if (m.life < 0 || m.y > BEAM_FLOOR || m.y < BEAM_TOP - 10 || m.x < BEAM_X0 - 10 || m.x > BEAM_X1 + 10 || (b < 0.02 && R() < dt * 0.5)) { spawn(m); continue; }
      // a mote shows when it turns its face to the sun
      const tw = Math.pow((Math.sin(t * m.f + m.ph) + 1) / 2, 2.4);
      const a = sun * (0.12 + 0.78 * tw) * (0.08 + 0.92 * b) * smooth(0, 2.5, m.age) * smooth(0, 2.5, m.life);
      if (a < 0.02) continue;
      lc.globalAlpha = Math.min(1, a);
      lc.fillStyle = tw > 0.8 && b > 0.45 ? '#fff4dc' : '#ffe2ae';
      lc.beginPath(); lc.arc(m.x, m.y, m.r * (0.8 + tw * 0.5), 0, 6.3); lc.fill();
    }
    lc.restore();
  }

  // ── leaves falling past the windows ────────────────────────────────────
  const leaves = [];
  function newLeaf(rain, start) {
    const p = PANES[Math.floor(R() * PANES.length)];
    return {
      x: p[0] - 30 + R() * (p[1] - p[0] + 60), y: start ? R() * WIN_H : -10 - R() * 30,
      vy: rain ? 48 + R() * 30 : 14 + R() * 18, sway: 6 + R() * 16, f: 0.5 + R() * 0.9, ph: R() * 6.28,
      spin: 1.5 + R() * 4, s: 2.6 + R() * 3.2, hue: 30 + R() * 26, light: 42 + R() * 18,
    };
  }
  let leafWait = 0;
  function drawLeaves(dt, t, kind) {
    const rain = kind === 'rainy', want = rain ? 4 : 9;
    leafWait -= dt;
    if (leaves.length < want && leafWait < 0) { leaves.push(newLeaf(rain, leaves.length === 0 && t < 2)); leafWait = rain ? 0.9 + R() * 2 : 0.6 + R() * 1.8; }
    lb.setTransform(1, 0, 0, 1, 0, 0); lb.clearRect(0, 0, WIN_W, WIN_H);
    for (let i = leaves.length - 1; i >= 0; i--) {
      const L = leaves[i];
      L.y += L.vy * dt * (0.75 + 0.5 * Math.sin(t * L.f * 1.3 + L.ph) ** 2);
      const x = L.x + Math.sin(t * L.f + L.ph) * L.sway + (rain ? -10 : 4) * (L.y / WIN_H);
      if (L.y > WIN_H + 10) { leaves.splice(i, 1); continue; }
      const turn = t * L.spin + L.ph;
      lb.setTransform(1, 0, 0, 1, x, L.y); lb.rotate(Math.sin(turn * 0.7) * 1.2 + turn * 0.15); lb.scale(Math.cos(turn), 1);
      lb.fillStyle = `hsla(${L.hue},${rain ? 45 : 82}%,${rain ? L.light - 14 : L.light}%,${rain ? 0.75 : 0.95})`;
      lb.beginPath(); lb.moveTo(-L.s, 0); lb.quadraticCurveTo(0, -L.s * 0.75, L.s, 0); lb.quadraticCurveTo(0, L.s * 0.75, -L.s, 0); lb.fill();
    }
    // the leaves are outside: only seen through the glass, never over the glazing bars
    lb.setTransform(1, 0, 0, 1, 0, 0);
    lb.globalCompositeOperation = 'destination-in'; lb.drawImage(glass, 0, 0); lb.globalCompositeOperation = 'source-over';
    lc.drawImage(leafBuf, 0, 0);
  }

  // ── ivy and clock ──────────────────────────────────────────────────────
  function drawIvy(t, kind) {
    // the draught from the windows reaches the end of the shelves: the trailing
    // ends move most, the stems at the top hardly at all
    const gust = 1 + 0.6 * Math.max(0, Math.sin(t * 0.13)) ** 3 + (kind === 'rainy' ? 0.3 : 0);
    rc.drawImage(ivyBack, 0, 0);
    const band = 4;
    for (let y = 0; y < RH; y += band) {
      const k = Math.pow(y / RH, 1.3);
      const dx = k * gust * (1.7 * Math.sin(t * 0.55 + y * 0.011) + 0.7 * Math.sin(t * 1.4 + y * 0.037));
      rc.drawImage(ivy, 0, y, RW, band, dx, y, RW, band);
    }
  }
  let lastSec = -1, tickAt = 0;
  function drawClock(nowMs) {
    const d = new Date(), sec = d.getSeconds();
    if (sec !== lastSec) { lastSec = sec; tickAt = nowMs; }
    // the hand jumps to each second and settles with a tiny bounce
    const k = clamp((nowMs - tickAt) / 140, 0, 1), over = Math.sin(k * Math.PI) * (1 - k) * 0.35;
    const a = ((sec - 1 + Math.min(1, k * 1.6) + over) / 60) * Math.PI * 2;
    const cx = CLOCK.x - RX, cy = CLOCK.y, sx = Math.sin(a), sy = -Math.cos(a);
    rc.save(); rc.lineCap = 'round';
    rc.strokeStyle = 'rgba(0,0,0,.18)'; rc.lineWidth = 1.1;               // its shadow on the dial
    rc.beginPath(); rc.moveTo(cx + 0.8 - sx * 8, cy + 1.2 - sy * 8); rc.lineTo(cx + 0.8 + sx * 33, cy + 1.2 + sy * 33); rc.stroke();
    rc.strokeStyle = 'rgba(122,30,22,.9)'; rc.lineWidth = 0.85;
    rc.beginPath(); rc.moveTo(cx - sx * 8, cy - sy * 8); rc.lineTo(cx + sx * 33, cy + sy * 33); rc.stroke();
    rc.fillStyle = '#c69a52'; rc.beginPath(); rc.arc(cx, cy, 1.7, 0, 6.3); rc.fill();
    rc.restore();
  }

  return {
    draw(dt, t, kind, nowMs) {
      if (!ready) return;
      blank = false;
      const sun = kind === 'rainy' ? 0 : 1;
      lc.clearRect(0, 0, LW, LH);
      drawLeaves(dt, t, kind);
      if (sun) { drawBeams(t, sun); drawMotes(dt, t, sun); }
      rc.clearRect(0, 0, RW, RH);
      drawIvy(t, kind); drawClock(nowMs);
    },
    clear() { if (!blank) { lc.clearRect(0, 0, LW, LH); rc.clearRect(0, 0, RW, RH); blank = true; } },
    get ready() { return ready; },
  };
}
