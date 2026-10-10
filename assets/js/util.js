// Általános segédfüggvények

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const sum = (arr, f = (x) => x) => arr.reduce((a, b) => a + f(b), 0);
export const mean = (arr, f = (x) => x) => (arr.length ? sum(arr, f) / arr.length : 0);

const nf = new Map();
function numFmt(min, max) {
  const k = min + ':' + max;
  if (!nf.has(k)) nf.set(k, new Intl.NumberFormat('hu-HU', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return nf.get(k);
}

export function fmtNum(x, d = 2, dMin = d) {
  if (x == null || !isFinite(x)) return '–';
  return numFmt(dMin, d).format(x);
}

export function fmtPct(p, d = 1) {
  if (p == null || !isFinite(p)) return '–';
  return numFmt(d, d).format(p * 100) + '%';
}

export function fmtOdds(o) {
  if (!o || !isFinite(o) || o <= 1) return '–';
  if (o >= 100) return numFmt(0, 0).format(o);
  return numFmt(2, 2).format(o);
}

export function fmtEdge(e) {
  if (e == null || !isFinite(e)) return '';
  const s = numFmt(1, 1).format(Math.abs(e) * 100) + '%';
  return (e >= 0 ? '+' : '−') + s;
}

export function fmtMoney(x) {
  if (x == null || !isFinite(x)) return '–';
  return numFmt(0, 0).format(Math.round(x)) + ' Ft';
}

export function fmtLine(x) {
  return numFmt(0, 2).format(x);
}

export function fmtSigned(x, d = 2) {
  if (x == null || !isFinite(x)) return '–';
  const s = numFmt(d, d).format(Math.abs(x));
  return (x > 0 ? '+' : x < 0 ? '−' : '') + s;
}

/** szöveges szám (vesszővel vagy ponttal) -> number */
export function parseNum(s) {
  if (typeof s === 'number') return s;
  if (s == null) return NaN;
  const t = String(s).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return NaN;
  return Number(t);
}

const dfShort = new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric' });
const dfWeek = new Intl.DateTimeFormat('hu-HU', { weekday: 'long' });

export const isoToDate = (iso) => new Date(iso + 'T12:00:00');

export function fmtDate(iso, withYear = false) {
  if (!iso) return '';
  if (withYear) return iso.replace(/-/g, '.') + '.';
  return dfShort.format(isoToDate(iso));
}

export function fmtDay(iso, todayIso) {
  const d = isoToDate(iso);
  const diff = Math.round((d - isoToDate(todayIso)) / 86400000);
  const base = dfShort.format(d);
  const wd = dfWeek.format(d);
  if (diff === 0) return `Ma · ${base}`;
  if (diff === 1) return `Holnap · ${base}`;
  if (diff === -1) return `Tegnap · ${base}`;
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} · ${base}`;
}

export function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso, n) {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ékezet- és kisbetű-független összehasonlításhoz */
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchScore(name, query) {
  const n = norm(name);
  const q = norm(query);
  if (!q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.split(' ').some((w) => w.startsWith(q))) return 60;
  if (n.includes(q)) return 40;
  const parts = q.split(' ');
  if (parts.length > 1 && parts.every((p) => n.includes(p))) return 30;
  return 0;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const store = {
  get(key, def) {
    try {
      const v = localStorage.getItem('gv.' + key);
      return v == null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem('gv.' + key, JSON.stringify(val));
    } catch {
      /* privát mód vagy betelt tárhely */
    }
  },
};

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function combinations(n, k) {
  const out = [];
  const cur = [];
  (function rec(start) {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      cur.push(i);
      rec(i + 1);
      cur.pop();
    }
  })(0);
  return out;
}

export function binom(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v != null && v !== '') p.set(k, v);
  return p.toString();
}

/** egyszerű SVG ikonok */
const ICONS = {
  search: '<path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35" />',
  close: '<path d="M6 6l12 12M18 6 6 18" />',
  plus: '<path d="M12 5v14M5 12h14" />',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" />',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3" />',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  ticket: '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V7Z"/><path d="M14 5v12" stroke-dasharray="2 2"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  save: '<path d="M5 4h11l3 3v13H5V4Z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  minus: '<path d="M5 12h14"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  print: '<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>',
};

export function icon(name, size = 18, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = 'toast show ' + kind;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast ' + kind), 2600);
}
