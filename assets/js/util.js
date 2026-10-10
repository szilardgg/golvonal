export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const nf = new Map();
function numFmt(min, max) {
  const k = min + ':' + max;
  if (!nf.has(k)) nf.set(k, new Intl.NumberFormat('hu-HU', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return nf.get(k);
}

export function fmtNum(x, d = 2, dMin = d) {
  if (x == null || !isFinite(x)) return '-';
  return numFmt(dMin, d).format(x);
}

export function fmtPct(p, d = 1) {
  if (p == null || !isFinite(p)) return '-';
  return numFmt(d, d).format(p * 100) + '%';
}

export function fmtLine(x) {
  return numFmt(0, 2).format(x);
}

export function fmtSigned(x, d = 2) {
  if (x == null || !isFinite(x)) return '-';
  const s = numFmt(d, d).format(Math.abs(x));
  return (x > 0 ? '+' : x < 0 ? '−' : '') + s;
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
  if (diff === 0) return `Ma, ${base}`;
  if (diff === 1) return `Holnap, ${base}`;
  if (diff === -1) return `Tegnap, ${base}`;
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${base}`;
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
    }
  },
};

export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v != null && v !== '') p.set(k, v);
  return p.toString();
}

const ICONS = {
  search: '<path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35" />',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3" />',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};

export function icon(name, size = 18, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

