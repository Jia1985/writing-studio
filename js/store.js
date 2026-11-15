// Local-only persistence: settings in localStorage, works in IndexedDB
// (with a localStorage fallback and a synchronous "pending" journal so a
// refresh mid-keystroke never loses typed text).

const SKEY = 'ws.settings.v1';
const PKEY = 'ws.pending.v1';
const FKEY = 'ws.works.v1';

export const defaults = () => ({
  place: 'study',
  mode: 'typing',
  roomZoom: 1,
  focusZoom: 1,
  lampOn: true,
  lamp: 0.7,
  weather: 'rainy',
  wxBy: {},              // weather chosen in each of the other places
  weatherSound: true,
  curtainsOpen: true,
  musicOn: false,
  track: 0,
  crackle: false,
  vol: { master: 0.8, writing: 0.8, room: 0.5, weather: 0.6, music: 0.6 },
  muted: false,
  reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  remember: true,
  currentWorkId: null,
});

export function loadSettings() {
  const d = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(SKEY) || 'null');
    if (!raw) return d;
    if (raw.remember === false) {
      // keep only what is not "room state"
      return { ...d, remember: false, currentWorkId: raw.currentWorkId ?? null, reduceMotion: raw.reduceMotion ?? d.reduceMotion };
    }
    return { ...d, ...raw, vol: { ...d.vol, ...(raw.vol || {}) } };
  } catch { return d; }
}

export function saveSettings(s) {
  try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}

// ── works ──────────────────────────────────────────────────────────────
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open('writing-studio', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('works', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
function tx(mode, fn) {
  return db().then((d) => {
    if (!d) return fallback(mode, fn);
    return new Promise((resolve, reject) => {
      const t = d.transaction('works', mode);
      const out = fn(t.objectStore('works'));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = t.onabort = () => reject(t.error);
    });
  });
}
// localStorage fallback implementing the tiny subset of the object store we use
function fallback(mode, fn) {
  let map = {};
  try { map = JSON.parse(localStorage.getItem(FKEY) || '{}'); } catch { /* ignore */ }
  const res = { result: undefined };
  const store = {
    getAll: () => { res.result = Object.values(map); return res; },
    get: (id) => { res.result = map[id]; return res; },
    put: (w) => { map[w.id] = w; return res; },
    delete: (id) => { delete map[id]; return res; },
  };
  const out = fn(store);
  if (mode === 'readwrite') localStorage.setItem(FKEY, JSON.stringify(map));
  return Promise.resolve(out ? out.result : undefined);
}

export const works = {
  all: () => tx('readonly', (s) => s.getAll()).then((a) => (a || []).sort((x, y) => y.updatedAt - x.updatedAt)),
  get: (id) => tx('readonly', (s) => s.get(id)),
  put: (w) => tx('readwrite', (s) => s.put(w)),
  remove: (id) => tx('readwrite', (s) => s.delete(id)),
};

export function newWork(seed = false) {
  const now = Date.now();
  return {
    id: 'w' + now.toString(36) + Math.random().toString(36).slice(2, 7),
    title: seed ? 'Chapter I' : '',
    text: seed
      ? 'Chapter I\n\nIt was a rainy evening in the city,\nand the kind of night that made\nstories feel a little more real. '
      : '',
    caret: null,
    hand: '',                 // handwritten page text (pen mode)
    ink: [{ strokes: [] }],   // freehand strokes from earlier versions
    createdAt: now,
    updatedAt: now,
  };
}

// synchronous journal of the latest typed text
export function writePending(w) {
  try { localStorage.setItem(PKEY, JSON.stringify({ id: w.id, title: w.title, text: w.text, caret: w.caret, updatedAt: w.updatedAt })); } catch { /* ignore */ }
}
export function readPending() {
  try { return JSON.parse(localStorage.getItem(PKEY) || 'null'); } catch { return null; }
}
