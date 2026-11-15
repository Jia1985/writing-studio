// The book on your lap in the reading room. The painted lines of text are
// lifted off its pages (the paper and its lamplight are kept), and the piece
// you are working on is set there instead, page by page, in the same
// perspective as the painting. Read with the arrow keys or by clicking a page.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// where the pages' text sits in the painting (stage px): TL, TR, BR, BL
const QUADS = {
  L: [[664, 731], [901, 767], [914, 941], [651, 941]],
  R: [[946, 748], [1181, 757], [1212, 941], [956, 941]],
};
// a little wider than the text, to take the painted text off
const CLEAN = {
  L: [[652, 706], [903, 752], [918, 941], [640, 941]],
  R: [[932, 736], [1210, 744], [1248, 941], [946, 941]],
};
const PW = 380, PH = 300;   // a page, in its own units (before the perspective)
const BOOK_URL = 'assets/books/a-christmas-carol.json';   // Dickens, 1843 (public domain, via Project Gutenberg)
const HEAD_H = 24;          // the running head at the top of each page
const PH_TEXT = 248;        // the pages run off the bottom of the picture: stop the text where it can still be read
const BX = 620, BY = 690, BW = 650, BH = 251;   // the plate canvas (stage px)

// the transform that takes a PW × PH box onto a quadrilateral
function toQuad(q, w, h) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den, h2 = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h2 * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h2 * y3;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, h2 / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(',')})`;
}

export function createReader({ src, onTurn, onFlip, onPage, reduceMotion, startAt = 0 }) {
  const stage = document.querySelector('#stage');
  const plate = document.querySelector('#bookPlate'), book = document.querySelector('#book');
  const pages = { L: book.querySelector('[data-side=L]'), R: book.querySelector('[data-side=R]') };
  for (const s of ['L', 'R']) {
    Object.assign(pages[s].style, { width: PW + 'px', height: PH + 'px', transform: toQuad(QUADS[s], PW, PH) });
  }

  // ── the clean pages ──────────────────────────────────────────────────
  const img = new Image();
  img.onload = () => { try { buildPlate(); } catch { /* the painted text simply stays */ } };
  img.src = src;
  function buildPlate() {
    const K = 1;
    plate.width = BW * K; plate.height = BH * K;
    const c = document.createElement('canvas'); c.width = BW; c.height = BH;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, BX, BY, BW, BH, 0, 0, BW, BH);
    const px = x.getImageData(0, 0, BW, BH), d = px.data;
    // printed lines are dark on light paper: the brightest pixel a few rows
    // above or below is the paper itself
    const lum = (i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    const out = new Uint8ClampedArray(d.length);
    const RV = 6, RH = 1;
    for (let y = 0; y < BH; y++) for (let xx = 0; xx < BW; xx++) {
      let best = -1, bi = 0;
      for (let dy = -RV; dy <= RV; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= BH) continue;
        for (let dx = -RH; dx <= RH; dx++) {
          const x2 = xx + dx; if (x2 < 0 || x2 >= BW) continue;
          const i = (yy * BW + x2) * 4, l = lum(i);
          if (l > best) { best = l; bi = i; }
        }
      }
      const o = (y * BW + xx) * 4; out[o] = d[bi]; out[o + 1] = d[bi + 1]; out[o + 2] = d[bi + 2]; out[o + 3] = 255;
    }
    const lifted = document.createElement('canvas'); lifted.width = BW; lifted.height = BH;
    lifted.getContext('2d').putImageData(new ImageData(out, BW, BH), 0, 0);
    // soften it into plain lit paper, only inside the pages (so nothing from
    // the blanket bleeds in), then lay it over the painting with a soft edge
    const mask = document.createElement('canvas'); mask.width = BW; mask.height = BH;
    const mx = mask.getContext('2d'); mx.translate(-BX, -BY); mx.fillStyle = '#000';
    for (const q of Object.values(CLEAN)) { mx.beginPath(); q.forEach(([a, b], i) => (i ? mx.lineTo(a, b) : mx.moveTo(a, b))); mx.closePath(); mx.fill(); }
    const blurIn = (cv, r) => { const t = document.createElement('canvas'); t.width = BW; t.height = BH; const tx = t.getContext('2d'); tx.filter = `blur(${r}px)`; tx.drawImage(cv, 0, 0); return t; };
    const masked = document.createElement('canvas'); masked.width = BW; masked.height = BH;
    const mk = masked.getContext('2d'); mk.drawImage(lifted, 0, 0); mk.globalCompositeOperation = 'destination-in'; mk.drawImage(mask, 0, 0);
    const num = blurIn(masked, 3), den = blurIn(mask, 3);
    // the blurred colours come back already divided by their coverage (canvas
    // pixels are read un-premultiplied), so they are the average paper colour
    // as they are; only make them opaque
    const nd = num.getContext('2d').getImageData(0, 0, BW, BH), dd = den.getContext('2d').getImageData(0, 0, BW, BH).data;
    for (let i = 0; i < nd.data.length; i += 4) nd.data[i + 3] = dd[i + 3] > 115 ? 255 : 0;   // the very rim is left to the painting
    const clean = document.createElement('canvas'); clean.width = BW; clean.height = BH; clean.getContext('2d').putImageData(nd, 0, 0);
    const pc = plate.getContext('2d');
    pc.drawImage(clean, 0, 0);
    pc.globalCompositeOperation = 'destination-in'; pc.filter = 'blur(3px)'; pc.drawImage(mask, 0, 0);
    pc.filter = 'none'; pc.globalCompositeOperation = 'source-over';
    plate.classList.add('ready');
    // the colour of the paper, for the leaf that turns
    const s = clean.getContext('2d').getImageData(420, 120, 60, 40).data; let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < s.length; i += 4) if (s[i + 3]) { r += s[i]; g += s[i + 1]; b += s[i + 2]; n++; }
    if (n) paperTone = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  }

  // ── pages ────────────────────────────────────────────────────────────
  // The book is set like a printed one: a title page, the preface, then each
  // chapter from a fresh page under its heading, paragraphs indented and
  // running on from page to page, the book's title and the chapter's name at
  // the head of the pages.
  let list = [{ head: null, blocks: [{ k: 'title', text: 'A book' }] }], spread = 0, novel = null;

  function blockEl(b) {
    const e = document.createElement('div');
    e.className = 'bk-' + b.k + (b.cont ? ' cont' : '') + (b.split ? ' split' : '');
    e.textContent = b.text;
    return e;
  }
  function paint(el, page) {
    el.replaceChildren();
    if (!page) return;
    const head = document.createElement('div'); head.className = 'bp-head'; head.textContent = page.head || '';
    const body = document.createElement('div'); body.className = 'bp-text' + (page.cls ? ' ' + page.cls : '');
    for (const b of page.blocks) body.appendChild(blockEl(b));
    el.append(head, body);
  }

  // lay the whole book out into pages, measuring as it goes
  const measure = document.createElement('div');
  measure.className = 'bp-measure'; measure.style.width = PW + 'px';
  document.body.appendChild(measure);
  function typeset(bk) {
    const out = [], LIMIT = PH_TEXT - HEAD_H;
    let page = null, body = null;
    const open = (head, cls) => {
      page = { head, cls, blocks: [] }; out.push(page);
      measure.replaceChildren(); body = document.createElement('div'); body.className = 'bp-text' + (cls ? ' ' + cls : ''); measure.appendChild(body);
    };
    const fits = () => body.scrollHeight <= LIMIT + 0.5;
    const put = (b, head) => {
      for (let guard = 0; guard < 400; guard++) {
        const el = body.appendChild(blockEl(b));
        if (fits()) { page.blocks.push(b); return; }
        el.remove();
        if (b.k === 'p') {
          // as many words as fit here; the rest of the paragraph runs on overleaf
          const words = b.text.split(' ');
          let lo = 1, hi = words.length - 1, best = 0;
          const trial = body.appendChild(blockEl(b));
          while (lo <= hi) { const mid = (lo + hi) >> 1; trial.textContent = words.slice(0, mid).join(' '); if (fits()) { best = mid; lo = mid + 1; } else hi = mid - 1; }
          trial.remove();
          if (best > 0 && page.blocks.length + best > 1) {
            const first = { ...b, text: words.slice(0, best).join(' '), split: true };
            body.appendChild(blockEl(first)); page.blocks.push(first);
            b = { k: 'p', text: words.slice(best).join(' '), cont: true };
          }
        }
        if (!page.blocks.length) { page.blocks.push(b); return; }   // too big for any page: let it run over
        open(head);
      }
    };
    // title page, and the preface opposite it
    open(null, 'titlepage');
    for (const [k, text] of [['title', bk.title], ['subtitle', bk.subtitle], ['author', 'by ' + bk.author], ['year', String(bk.year)]]) put({ k, text }, null);
    open(bk.title, 'preface');
    put({ k: 'h2', text: 'Preface' }, bk.title);
    bk.preface.forEach((t, i) => put({ k: i ? 'sign' : 'p', text: t, first: !i }, bk.title));
    for (const ch of bk.chapters) {
      if (out.length % 2 === 1) open(null, 'blank');        // a chapter begins on a left-hand page
      open(ch.title, 'chapter');
      put({ k: 'h1', text: ch.label }, ch.title); put({ k: 'h2', text: ch.title }, ch.title);
      ch.paragraphs.forEach((t, i) => put({ k: 'p', text: t, first: !i }, ch.title));
    }
    put({ k: 'end', text: '❦  THE END  ❦' }, null);
    if (out.length % 2) open(null, 'blank');
    return out;
  }
  const spreads = () => Math.max(1, Math.ceil(list.length / 2));
  function show() {
    spread = clamp(spread, 0, spreads() - 1);
    paint(pages.L.firstElementChild, list[spread * 2]);
    paint(pages.R.firstElementChild, list[spread * 2 + 1]);
    onTurn?.(spread, spreads(), list.length);
  }
  async function load() {
    try {
      novel = await (await fetch(BOOK_URL)).json();
      if (document.fonts?.ready) await document.fonts.ready;
      list = typeset(novel);
    } catch (e) { console.warn('book', e); }
    spread = startAt; loaded = true; show();          // open where the reader left off
  }
  let loaded = false;
  function refresh() { if (loaded) show(); }
  // ── turning a page ───────────────────────────────────────────────────
  // A leaf lifts at the spine, stands up, and comes down on the other side.
  // It is two layers moved together: the paper (the whole page, running on
  // below the bottom of the picture) and the same text box the page uses, so
  // at the start and the end it sits exactly where the page's own text does.
  const leafPaper = document.createElement('div'); leafPaper.className = 'bleaf-paper';
  const leafText = document.createElement('div'); leafText.className = 'bleaf-text';
  const leafIn = document.createElement('div'); leafIn.className = 'bp-in'; leafText.appendChild(leafIn);
  for (const el of [leafPaper, leafText]) Object.assign(el.style, { width: PW + 'px', height: PH + 'px' });
  book.append(leafPaper, leafText);
  // each corner of the right-hand leaf, and where it lands on the left (the spine corners stay at the spine)
  const PAPER = { R: [[915, 752], [1214, 745], [1306, 1120], [947, 1120]], L: [[911, 756], [630, 692], [558, 1120], [945, 1120]] };
  const TEXT = { R: QUADS.R, L: [QUADS.L[1], QUADS.L[0], QUADS.L[3], QUADS.L[2]] };
  const spineX = (y) => 913 + (y - 755) / 186 * 16;
  const LIFT = 0.36;             // how far a page standing up rises in this view, for its width
  function leafQuad(pair, a) {
    // a: 0 lying on the right, π lying on the left
    const c = Math.cos(a), s = Math.sin(a);
    return pair.R.map((r, i) => {
      const l = pair.L[i], g = spineX(r[1]), w = Math.max(Math.abs(r[0] - g), Math.abs(l[0] - g));
      const x = g + (r[0] - g) * Math.max(c, 0) + (l[0] - g) * Math.max(-c, 0);
      const y = r[1] * (1 + c) / 2 + l[1] * (1 - c) / 2 - s * w * LIFT;
      return [x, y];
    });
  }
  // the right side's corners in left-page order, for the back of the leaf
  const backOrder = (q) => [q[1], q[0], q[3], q[2]];
  let turning = null, paperTone = '#ead2ae';
  function leafAt(a) {
    const c = Math.cos(a);
    const show = Math.abs(c) > 0.035;
    leafPaper.style.visibility = leafText.style.visibility = show ? 'visible' : 'hidden';
    if (!show) return;
    const front = c > 0, pq = leafQuad(PAPER, a), tq = leafQuad(TEXT, a);
    leafPaper.style.transform = toQuad(front ? pq : backOrder(pq), PW, PH);
    leafText.style.transform = toQuad(front ? tq : backOrder(tq), PW, PH);
    const side = front ? turning.front : turning.back;
    if (leafIn.dataset.side !== (front ? 'f' : 'b')) { paint(leafIn, side); leafIn.dataset.side = front ? 'f' : 'b'; }
    // the page darkens as it turns away from the lamp, most of all near the spine
    const lit = 0.62 + 0.38 * Math.abs(c);
    leafPaper.style.filter = `brightness(${lit.toFixed(3)})`;
    leafPaper.style.background = `linear-gradient(${front ? 90 : 270}deg, rgba(60,30,10,${(0.28 * (1 - Math.abs(c))).toFixed(3)}) 0%, rgba(60,30,10,.05) 22%, rgba(255,240,210,.06) 70%, rgba(60,30,10,.08) 100%), ${paperTone}`;
    leafText.style.opacity = (0.35 + 0.65 * Math.abs(c)).toFixed(3);
  }
  const easeTurn = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  function turn(d) {
    const next = clamp(spread + d, 0, spreads() - 1);
    if (next === spread || turning || !loaded) return false;
    const at = (s, side) => list[s * 2 + (side === 'R' ? 1 : 0)];
    if (reduceMotion?.()) { spread = next; show(); onFlip?.(0.35); return true; }
    // the pages left lying underneath while the leaf is in the air
    const fwd = d > 0;
    turning = { front: fwd ? at(spread, 'R') : at(next, 'R'), back: fwd ? at(next, 'L') : at(spread, 'L'), t0: performance.now(), dur: TURN_MS, fwd };
    if (fwd) paint(pages.R.firstElementChild, at(next, 'R')); else paint(pages.L.firstElementChild, at(next, 'L'));
    leafIn.dataset.side = '';
    book.classList.add('turning');
    onFlip?.(TURN_MS / 1000);
    const step = (now) => {
      const k = clamp((now - turning.t0) / turning.dur, 0, 1), e = easeTurn(k);
      leafAt(turning.fwd ? e * Math.PI : (1 - e) * Math.PI);
      if (k < 1) return requestAnimationFrame(step);
      turning = null; spread = next; show(); book.classList.remove('turning');
    };
    requestAnimationFrame(step);
    return true;
  }
  const TURN_MS = 780;
  // clicking the right page reads on, the left page goes back
  for (const s of ['L', 'R']) pages[s].addEventListener('click', () => (onPage ? onPage(s) : turn(s === 'R' ? 1 : -1)));

  load();
  return {
    refresh, turn,
    go(i) { spread = i; if (loaded) show(); },
    get spread() { return spread; },
    get count() { return spreads(); },
    stage,
  };
}
