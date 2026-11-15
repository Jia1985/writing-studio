// Typewriter: a real <textarea> on the paper (native IME, undo/redo, copy,
// paste, selection), paginated by sliding it inside a clipped page window.
//
// In Focus View the sheet behaves like paper in a real machine: the line
// being typed sits just above the platen and the sheet rises one line at a
// time, so the keyboard stays in view and answers every keystroke.

const L = 30;              // line height (sheet px)
const PAGE_LINES = 26;
const PAGE_H = L * PAGE_LINES;
const CLIP_TOP = 62;       // top margin of the sheet (sheet px)

export function createTypewriter({ scene, audio, onChange, isFocus }) {
  const ta = document.getElementById('editor');
  const mirror = document.getElementById('mirror');
  const paper = document.getElementById('paper');
  const label = document.getElementById('pageLabel');
  const prevBtn = document.getElementById('pagePrev'), nextBtn = document.getElementById('pageNext');
  let page = 0, pages = 1, caretTop = 0, composing = false;
  let rollY = 0, mouseSel = false, lastKeyAt = 0;

  function measure() {
    ta.style.height = 'auto';
    pages = Math.max(1, Math.ceil((ta.scrollHeight - 2) / PAGE_H));
    ta.style.height = pages * PAGE_H + 'px';
  }
  function measureCaret() {
    mirror.textContent = ta.value.slice(0, ta.selectionEnd);
    const mark = document.createElement('span'); mark.textContent = '​';
    mirror.appendChild(mark);
    return mark.offsetTop;
  }
  function refresh(follow = true) {
    caretTop = measureCaret();
    const caretPage = Math.floor(caretTop / PAGE_H);
    if (follow) page = caretPage;
    page = Math.min(pages - 1, Math.max(0, page));
    const focus = isFocus(), inPage = caretTop - page * PAGE_H, onPage = caretPage === page;
    // where the paper sits in this place's typewriter
    const { scale: SHEET_SCALE, platen: PLATEN_Y, min: PAPER_MIN, max: PAPER_MAX, roomLines: ROOM_LINES } = scene.paper;
    let off = page * PAGE_H, h = PAPER_MIN;
    if (focus) {
      // roll the sheet so the caret line rests above the platen; a mouse
      // click on text that is already showing does not move the paper
      const want = onPage ? inPage : PAGE_H - L;
      if (!(mouseSel && onPage && inPage <= rollY)) rollY = want;
      h = Math.min(PAPER_MAX, Math.max(PAPER_MIN, (CLIP_TOP + rollY + L + 16) * SHEET_SCALE));
      paper.style.setProperty('--paper-h', h.toFixed(1) + 'px');
    } else {
      paper.style.removeProperty('--paper-h');
      if (onPage) off += Math.max(0, inPage + L - ROOM_LINES * L);
    }
    ta.style.transform = `translateY(${-off}px)`;
    const y = onPage ? inPage - (off - page * PAGE_H) : rollY;
    scene.setCaretY(PLATEN_Y - h + (CLIP_TOP + y + L / 2) * SHEET_SCALE, PLATEN_Y - h);
    label.textContent = `Page ${page + 1} of ${pages}`;
    prevBtn.disabled = page === 0; nextBtn.disabled = page >= pages - 1;
  }
  function turn(d) {
    const p = Math.min(pages - 1, Math.max(0, page + d));
    if (p === page) return;
    page = p; audio.paperFeed(); refresh(false);
  }

  // The full strike sound follows *effective* input only; the key caps
  // follow the physical keys.
  function feedback(e) {
    const t = e.inputType || '';
    if (composing || e.isComposing || t === 'insertCompositionText' || t === 'insertFromComposition') return;
    const physical = performance.now() - lastKeyAt < 120;
    if (t === 'insertText') {
      const d = e.data || '';
      if (d === ' ') { audio.key('space'); if (!physical) scene.keyTap('', 'space'); scene.typeStrike(false); }
      else { audio.key('char'); if (!physical) scene.keyTap(d.slice(-1)); scene.typeStrike(true); }
    } else if (t === 'insertLineBreak' || t === 'insertParagraph') { audio.key('enter'); if (!physical) scene.keyTap('', 'enter'); scene.typeStrike(false); }
    else if (t.startsWith('delete') && t !== 'deleteByCut') { audio.key('delete'); if (!physical) scene.keyTap('', 'delete'); scene.typeStrike(false); }
    else audio.key('soft'); // paste, cut, undo, redo, drop
  }

  ta.addEventListener('compositionstart', () => { composing = true; });
  ta.addEventListener('compositionend', () => { composing = false; audio.key('char'); scene.typeStrike(true); });
  ta.addEventListener('input', (e) => { mouseSel = false; scene.followCaret(); feedback(e); measure(); refresh(true); onChange(); });
  ta.addEventListener('pointerdown', () => { mouseSel = true; });
  ta.addEventListener('keydown', (e) => {
    mouseSel = false;
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && scene.keyDown(e.code)) {
      lastKeyAt = performance.now();
      // while an input method is composing, keys answer with a lighter tap
      if (composing || e.isComposing || e.keyCode === 229) audio.key('light');
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') audio.key('shift');
    } else if (e.repeat) lastKeyAt = performance.now();
    if (e.key === 'PageDown') { e.preventDefault(); turn(1); }
    else if (e.key === 'PageUp') { e.preventDefault(); turn(-1); }
    else if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey && isFocus()) {
      e.preventDefault(); document.execCommand('insertText', false, '    ');
    }
  });
  ta.addEventListener('keyup', (e) => { if (scene.keyUp(e.code)) audio.key('release'); });
  ta.addEventListener('blur', () => scene.releaseKeys());
  document.addEventListener('selectionchange', () => { if (document.activeElement === ta) refresh(true); });
  prevBtn.addEventListener('click', () => turn(-1));
  nextBtn.addEventListener('click', () => turn(1));

  let wheelAcc = 0, wheelLock = 0;
  function wheel(e) {
    const nowT = performance.now();
    if (nowT < wheelLock) return;
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > 70) { turn(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; wheelLock = nowT + 380; }
  }

  if (document.fonts?.ready) document.fonts.ready.then(() => { measure(); refresh(false); });

  return {
    el: ta, wheel, turn,
    refresh: () => { mouseSel = false; measure(); refresh(true); },
    focus() { ta.focus({ preventScroll: true }); },
    get text() { return ta.value; },
    get caret() { return ta.selectionEnd; },
    get pages() { return pages; },
    set(text, caret) {
      ta.value = text || '';
      const c = caret == null ? ta.value.length : Math.min(caret, ta.value.length);
      ta.setSelectionRange(c, c);
      mouseSel = false; measure(); refresh(true);
    },
  };
}
