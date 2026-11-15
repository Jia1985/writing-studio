// Fountain pen mode. You decide the words on the keyboard; the pen writes
// them on the sheet in a handwritten script, one character at a time, with
// the nib travelling over each letter as it appears.
//
// Editing is a real <textarea> (native IME, undo/redo, selection, paste)
// whose own text is invisible; an aligned layer of per-character spans shows
// the ink, so each new character can be revealed as the pen passes over it.
// Handwriting is stored as its own text beside the typed text. Freehand
// strokes saved by earlier versions are still drawn underneath.

export const UW = 1000, UH = 1300;        // sheet units
const INK = '#1a2036', PAPER = '#f5e6d6';
const LINE = 60, LINES = 18, PAGE_H = LINE * LINES, PAD_X = 90, PAD_T = 150, RULE_Y = 50;
const FONT_STACK = getComputedStyle(document.documentElement).getPropertyValue('--hand').trim() || 'cursive';
const CJK = /[⺀-鿿豈-﫿＀-￯]/;

export function drawStroke(c, s, k) {
  const p = s.p, n = p.length / 3;
  c.strokeStyle = INK; c.fillStyle = INK; c.lineCap = 'round'; c.lineJoin = 'round';
  if (n === 1) { c.beginPath(); c.arc(p[0] * k, p[1] * k, p[2] * k * 0.6, 0, 6.3); c.fill(); return; }
  let mx = p[0], my = p[1];
  for (let i = 1; i < n; i++) {
    const x0 = p[(i - 1) * 3], y0 = p[(i - 1) * 3 + 1], x1 = p[i * 3], y1 = p[i * 3 + 1];
    const nx = i === n - 1 ? x1 : (x0 + x1) / 2, ny = i === n - 1 ? y1 : (y0 + y1) / 2;
    c.lineWidth = Math.max(0.4, ((p[(i - 1) * 3 + 2] + p[i * 3 + 2]) / 2) * k);
    c.beginPath(); c.moveTo(mx * k, my * k); c.quadraticCurveTo(x0 * k, y0 * k, nx * k, ny * k); c.stroke();
    mx = nx; my = ny;
  }
}

export function createInk({ audio, getWork, onChange, isActive, isReduced }) {
  const $ = (id) => document.getElementById(id);
  const sheet = $('inkSheet'), cv = $('inkCanvas'), c = cv.getContext('2d');
  const hand = $('hand'), layer = $('handLayer'), ta = $('handEditor'), pen = $('penCursor');
  const label = $('inkLabel'), prevBtn = $('inkPrev'), nextBtn = $('inkNext');
  let chars = [], state = [], spans = [], endSpan = null;
  let page = 0, pages = 1, composing = false, cur = null, k = 1, writing = false, penAt = null;

  const legacy = (p) => { const a = getWork()?.ink; return a && a[p] ? a[p].strokes : []; };

  // ── layout ───────────────────────────────────────────────────────────
  function resize() {
    const rect = sheet.getBoundingClientRect();
    if (!rect.width) return;
    hand.style.transform = `scale(${rect.width / UW})`;
    const dpr = Math.min(2.5, devicePixelRatio || 1);
    cv.width = Math.round(rect.width * dpr); cv.height = Math.round(rect.height * dpr);
    k = cv.width / UW; drawLegacy();
  }
  function drawLegacy() {
    c.clearRect(0, 0, cv.width, cv.height); c.globalAlpha = 0.94;
    for (const s of legacy(page)) drawStroke(c, s, k);
  }
  function build() {
    const f = document.createDocumentFragment();
    spans = chars.map((ch, i) => { const s = document.createElement('span'); s.textContent = ch; if (!state[i]) s.className = 'p'; f.appendChild(s); return s; });
    endSpan = document.createElement('span'); endSpan.textContent = '​'; f.appendChild(endSpan);
    layer.replaceChildren(f); cur = null;
  }
  function measure() {
    ta.style.height = 'auto';
    pages = Math.max(1, Math.ceil((ta.scrollHeight - 2) / PAGE_H), (getWork()?.ink || []).filter((p) => p.strokes.length).length ? getWork().ink.length : 1);
    ta.style.height = pages * PAGE_H + 'px';
  }
  const caretSpan = () => spans[Array.from(ta.value.slice(0, ta.selectionEnd)).length] || endSpan;
  function place(follow = true) {
    if (follow && endSpan) page = Math.floor(caretSpan().offsetTop / PAGE_H);
    page = Math.min(pages - 1, Math.max(0, page));
    const t = `translateY(${-page * PAGE_H}px)`;
    ta.style.transform = t; layer.style.transform = t;
    label.textContent = `Page ${page + 1} of ${pages}`;
    prevBtn.disabled = page === 0; nextBtn.disabled = page >= pages - 1;
    drawLegacy();
  }
  // bring the ink layer in line with the textarea; newly inserted characters
  // start out unwritten and are queued for the pen
  function sync(allWritten = false) {
    const next = Array.from(ta.value), old = chars;
    let p = 0; const max = Math.min(old.length, next.length);
    while (p < max && old[p] === next[p]) p++;
    let s = 0; while (s < max - p && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
    state = allWritten ? next.map(() => 1)
      : [...state.slice(0, p), ...new Array(next.length - p - s).fill(0), ...state.slice(old.length - s)];
    chars = next; build(); measure(); place(true);
  }
  function turn(d) {
    const p = Math.min(pages - 1, Math.max(0, page + d));
    if (p === page) return;
    page = p; audio.key('soft'); place(false);
  }

  // ── input ────────────────────────────────────────────────────────────
  ta.addEventListener('compositionstart', () => { composing = true; hand.classList.add('composing'); });
  ta.addEventListener('compositionend', () => { composing = false; hand.classList.remove('composing'); sync(); onChange(); });
  ta.addEventListener('input', (e) => { if (composing || e.isComposing) return; sync(); onChange(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'PageDown') { e.preventDefault(); turn(1); }
    else if (e.key === 'PageUp') { e.preventDefault(); turn(-1); }
  });
  document.addEventListener('selectionchange', () => { if (document.activeElement === ta && !composing) place(true); });
  prevBtn.addEventListener('click', () => turn(-1));
  nextBtn.addEventListener('click', () => turn(1));
  sheet.addEventListener('pointerdown', (e) => { if (e.target !== ta) { e.preventDefault(); ta.focus({ preventScroll: true }); } });
  addEventListener('resize', resize);
  if (document.fonts?.ready) document.fonts.ready.then(() => { build(); measure(); place(false); });

  // ── the pen ──────────────────────────────────────────────────────────
  const movePen = (x, y, ease) => {
    if (!penAt || !ease) penAt = [x, y]; else { penAt[0] += (x - penAt[0]) * ease; penAt[1] += (y - penAt[1]) * ease; }
    pen.style.transform = `translate(${(penAt[0] - 20).toFixed(1)}px, ${penAt[1].toFixed(1)}px)`;
  };
  const finish = (i, el) => { state[i] = 1; el.className = ''; el.style.backgroundImage = ''; };
  function stopSound() { if (writing) { audio.penUp(); writing = false; } }

  function frame(now) {
    requestAnimationFrame(frame);
    const active = isActive();
    pen.classList.toggle('show', active);
    if (!active || isReduced()) {
      // nothing to watch: put the ink down at once
      if (state.includes(0)) spans.forEach((el, i) => { if (!state[i]) finish(i, el); });
      cur = null; stopSound();
      if (active && endSpan) { const r = caretSpan().getBoundingClientRect(); movePen(r.left + 8, r.top + r.height * 0.55, 0); }
      return;
    }
    if (!cur) {
      const i = state.indexOf(0);
      if (i >= 0) {
        const el = spans[i], ch = chars[i];
        if (Math.floor(el.offsetTop / PAGE_H) !== page) finish(i, el);       // off this page
        else {
          let pending = 0; for (let j = i; j < state.length && pending < 60; j++) if (!state[j]) pending++;
          const blank = /\s/.test(ch), cjk = CJK.test(ch);
          const dur = (blank ? 45 : cjk ? 300 : 125) / (1 + Math.max(0, pending - 5) / 5); // catch up with fast typing
          cur = { i, el, t0: now, dur, blank, cjk };
          if (!blank) { el.className = 'w'; if (!writing) { audio.penDown(); writing = true; } }
        }
      }
    }
    if (cur) {
      const q = Math.min(1, (now - cur.t0) / cur.dur), r = cur.el.getBoundingClientRect();
      if (!cur.blank) {
        const pct = (q * 108).toFixed(1);
        cur.el.style.backgroundImage = `linear-gradient(90deg, ${INK} ${pct - 8}%, transparent ${pct}%)`;
        const loops = cur.cjk ? 3 : 2, swing = Math.sin(q * Math.PI * loops);
        const x = r.left + r.width * (cur.cjk ? 0.12 + q * 0.76 + 0.12 * Math.sin(q * 11) : q);
        const y = r.top + r.height * (0.6 - 0.2 * swing * (cur.cjk ? 1.25 : 1));
        movePen(x, y, 0.6);
        audio.penMove(0.55 + 0.8 * Math.abs(Math.cos(q * Math.PI * loops)), 0.5);
      }
      if (q >= 1) { finish(cur.i, cur.el); cur = null; }
    } else if (!state.includes(0) && endSpan) {
      // at rest: the nib hovers just past the last word
      stopSound();
      const r = caretSpan().getBoundingClientRect();
      movePen(r.left + 12, r.top + r.height * 0.42, penAt ? 0.14 : 0);
    }
  }
  requestAnimationFrame(frame);

  // ── export ───────────────────────────────────────────────────────────
  // one canvas per page that has ink on it
  function renderPages(width = 1400) {
    const kx = width / UW, out = [];
    for (let p = 0; p < pages; p++) {
      const idx = []; spans.forEach((el, i) => { if (!/\s/.test(chars[i]) && Math.floor(el.offsetTop / PAGE_H) === p) idx.push(i); });
      const strokes = legacy(p);
      if (!idx.length && !strokes.length) continue;
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width * UH / UW);
      const x = canvas.getContext('2d');
      x.fillStyle = PAPER; x.fillRect(0, 0, canvas.width, canvas.height);
      x.strokeStyle = 'rgba(120,90,80,.2)'; x.lineWidth = 1;
      for (let n = 0; n < LINES; n++) { const y = Math.round((PAD_T + n * LINE + RULE_Y) * kx) + 0.5; x.beginPath(); x.moveTo(PAD_X * kx * 0.5, y); x.lineTo(canvas.width - PAD_X * kx * 0.5, y); x.stroke(); }
      x.globalAlpha = 0.94;
      for (const s of strokes) drawStroke(x, s, kx);
      x.fillStyle = INK; const FONT = parseFloat(getComputedStyle(layer).fontSize) || 40; x.font = `400 ${FONT * kx}px ${FONT_STACK}`; x.textBaseline = 'alphabetic';
      const asc = x.measureText('Hg').fontBoundingBoxAscent || FONT * kx * 0.9;
      for (const i of idx) { const el = spans[i]; x.fillText(chars[i], (PAD_X + el.offsetLeft) * kx, (PAD_T + el.offsetTop - p * PAGE_H) * kx + asc); }
      out.push({ page: p, canvas });
    }
    return out;
  }

  return {
    resize, renderPages,
    focus() { ta.focus({ preventScroll: true }); },
    blur() { ta.blur(); },
    load() {
      ta.value = getWork().hand || ''; chars = []; state = []; page = 0; penAt = null;
      ta.setSelectionRange(ta.value.length, ta.value.length);
      sync(true); resize();
    },
    get text() { return ta.value; },
    get page() { return page; },
    get el() { return ta; },
  };
}
