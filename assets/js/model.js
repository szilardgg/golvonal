// Statisztikai modell: csapaterősségek, Poisson / Dixon–Coles gólmodell,
// szöglet- és lapmodell, piacok kiértékelése, szelvény-számítás.

import { clamp, fmtLine } from './util.js';

const DAY = 86400000;
export const toTs = (iso) => Date.parse(iso + 'T12:00:00Z');

export const DEFAULT_OPTS = {
  halfLife: 200, // napokban: ennyi idő alatt feleződik egy meccs súlya
  wGoals: 0.4, // valódi gólok súlya
  wXg: 0.25, // várható gólok (xG) súlya, ahol elérhető
  wMarket: 0.35, // a lezárt meccsek piaci (záró) szorzóiból visszafejtett gólvárakozás súlya
  shrink: 4, // zsugorítás az átlag felé (virtuális meccsek száma)
  dc: true, // Dixon–Coles korrekció alacsony eredményekre
  seasons: 2, // betöltött szezonok
};

/* ------------------------------------------------------------------ */
/* Eloszlások                                                          */
/* ------------------------------------------------------------------ */

export function pois(l, n) {
  const a = new Float64Array(n + 1);
  let p = Math.exp(-l);
  a[0] = p;
  for (let k = 1; k <= n; k++) {
    p *= l / k;
    a[k] = p;
  }
  return a;
}

/** negatív binomiális (szórásnégyzet = átlag * phi) */
export function nbin(mean, phi, n) {
  if (!(phi > 1.03)) return pois(mean, n);
  const r = mean / (phi - 1);
  const q = mean / (r + mean);
  const a = new Float64Array(n + 1);
  a[0] = Math.pow(1 - q, r);
  for (let k = 1; k <= n; k++) a[k] = (a[k - 1] * (k - 1 + r) * q) / k;
  return a;
}

function binomRow(n, p) {
  const row = new Float64Array(n + 1);
  // P(X=k), X~Bin(n,p)
  let c = 1;
  for (let k = 0; k <= n; k++) {
    row[k] = c * Math.pow(p, k) * Math.pow(1 - p, n - k);
    c = (c * (n - k)) / (k + 1);
  }
  return row;
}

export function implied(odds) {
  if (!odds || odds.some((o) => !(o > 1))) return null;
  const inv = odds.map((o) => 1 / o);
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map((x) => x / s);
}

export function margin(odds) {
  if (!odds) return null;
  return odds.reduce((a, o) => a + 1 / o, 0) - 1;
}

/* ------------------------------------------------------------------ */
/* Piaci szorzók -> várható gólok                                      */
/* ------------------------------------------------------------------ */

function hao(lh, la) {
  const N = 9;
  const ph = pois(lh, N);
  const pa = pois(la, N);
  let H = 0, A = 0, O = 0, T = 0;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const v = ph[i] * pa[j];
      T += v;
      if (i > j) H += v;
      else if (j > i) A += v;
      if (i + j >= 3) O += v;
    }
  }
  return [H / T, A / T, O / T];
}

/**
 * 1X2 (és ha van, gólszám 2,5) valószínűségekből a két csapat várható gólszáma.
 */
export function marketLambdas(p3, pO, avgTotal) {
  const sup = p3[0] - p3[2];
  if (pO != null) {
    const F = (v) => {
      const q = hao(v[0], v[1]);
      return [q[0] - q[1] - sup, q[2] - pO];
    };
    let x = [Math.max(0.25, avgTotal / 2 + sup), Math.max(0.25, avgTotal / 2 - sup)];
    for (let it = 0; it < 25; it++) {
      const f = F(x);
      if (Math.abs(f[0]) + Math.abs(f[1]) < 1e-7) break;
      const e = 1e-4;
      const fa = F([x[0] + e, x[1]]);
      const fb = F([x[0], x[1] + e]);
      const j00 = (fa[0] - f[0]) / e, j01 = (fb[0] - f[0]) / e;
      const j10 = (fa[1] - f[1]) / e, j11 = (fb[1] - f[1]) / e;
      const det = j00 * j11 - j01 * j10;
      if (Math.abs(det) < 1e-12) break;
      let d0 = (j11 * f[0] - j01 * f[1]) / det;
      let d1 = (-j10 * f[0] + j00 * f[1]) / det;
      const mx = Math.max(Math.abs(d0), Math.abs(d1));
      if (mx > 0.6) {
        d0 *= 0.6 / mx;
        d1 *= 0.6 / mx;
      }
      x = [clamp(x[0] - d0, 0.05, 7), clamp(x[1] - d1, 0.05, 7)];
    }
    return x;
  }
  const T = avgTotal;
  const g = (S) => {
    const q = hao((T + S) / 2, (T - S) / 2);
    return q[0] - q[1] - sup;
  };
  let S = clamp(sup * 2.2, -T + 0.1, T - 0.1);
  for (let it = 0; it < 25; it++) {
    const f = g(S);
    if (Math.abs(f) < 1e-7) break;
    const e = 1e-4;
    const d = (g(S + e) - f) / e;
    if (Math.abs(d) < 1e-9) break;
    S = clamp(S - clamp(f / d, -0.6, 0.6), -T + 0.1, T - 0.1);
  }
  return [(T + S) / 2, (T - S) / 2];
}

/* ------------------------------------------------------------------ */
/* Bajnoki adatok előkészítése                                         */
/* ------------------------------------------------------------------ */

export function prepLeague(raw, info) {
  const ms = raw.matches || [];
  for (const m of ms) m.ts = toTs(m.d);
  const seasons = raw.seasons || [];
  const has = (k) => ms.some((m) => m[k] != null);
  const flags = {
    xg: has('hxg'),
    corners: has('hc'),
    cards: has('hy'),
    ht: has('hhg'),
    shots: has('hs'),
    fouls: has('hf'),
    odds: has('o') || has('oc'),
    ref: has('ref'),
  };
  const avgT = ms.length ? ms.reduce((a, m) => a + m.hg + m.ag, 0) / ms.length : 2.6;
  for (const m of ms) {
    const p3 = implied(m.oc || m.o);
    if (!p3) continue;
    const ouOdds = m.ouc || m.ou;
    const pO = ouOdds ? implied(ouOdds)[0] : null;
    const [lh, la] = marketLambdas(p3, pO, avgT);
    m.mh = lh;
    m.ma = la;
  }
  // csapatok szezononként
  const bySeason = new Map();
  for (const m of ms) {
    if (!bySeason.has(m.s)) bySeason.set(m.s, new Set());
    bySeason.get(m.s).add(m.h).add(m.a);
  }
  const cur = seasons[0];
  const prev = seasons[1];
  const curTeams = bySeason.get(cur) || new Set();
  const prevTeams = bySeason.get(prev) || new Set();
  const newTeams = new Set();
  if (prevTeams.size) for (const t of curTeams) if (!prevTeams.has(t)) newTeams.add(t);
  let teams = [...curTeams];
  if (teams.length < 4 && prevTeams.size) teams = [...prevTeams];
  teams.sort((a, b) => a.localeCompare(b, 'hu'));
  return { code: raw.code, info, matches: ms, seasons, flags, avgT, teams, newTeams, bySeason };
}

/* ------------------------------------------------------------------ */
/* Erősség-illesztés (multiplikatív Poisson, iteratív)                 */
/* ------------------------------------------------------------------ */

/**
 * rows: [{h, a, yh, ya, w}]
 * várható hazai = bh * att[h] * def[a]; várható vendég = ba * att[a] * def[h]
 */
function fitStrength(rows, shrink, priorOf) {
  const idx = new Map();
  const names = [];
  for (const r of rows) {
    for (const t of [r.h, r.a]) {
      if (!idx.has(t)) {
        idx.set(t, names.length);
        names.push(t);
      }
    }
  }
  const n = names.length;
  const H = new Int32Array(rows.length), A = new Int32Array(rows.length);
  rows.forEach((r, i) => {
    H[i] = idx.get(r.h);
    A[i] = idx.get(r.a);
  });
  let sw = 0, syh = 0, sya = 0;
  for (const r of rows) {
    sw += r.w;
    syh += r.w * r.yh;
    sya += r.w * r.ya;
  }
  let bh = sw ? syh / sw : 1.4;
  let ba = sw ? sya / sw : 1.1;
  const att = new Float64Array(n).fill(1);
  const def = new Float64Array(n).fill(1);
  const pAtt = new Float64Array(n).fill(1);
  const pDef = new Float64Array(n).fill(1);
  if (priorOf) {
    names.forEach((t, i) => {
      const p = priorOf(t);
      if (p) {
        pAtt[i] = p[0];
        pDef[i] = p[1];
      }
    });
  }
  const wsum = new Float64Array(n);
  rows.forEach((r, i) => {
    wsum[H[i]] += r.w;
    wsum[A[i]] += r.w;
  });

  const num = new Float64Array(n), den = new Float64Array(n);
  for (let it = 0; it < 60; it++) {
    const mbar = (bh + ba) / 2;
    // támadás
    for (let i = 0; i < n; i++) {
      num[i] = shrink * mbar * pAtt[i];
      den[i] = shrink * mbar;
    }
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k], h = H[k], a = A[k];
      num[h] += r.w * r.yh;
      den[h] += r.w * bh * def[a];
      num[a] += r.w * r.ya;
      den[a] += r.w * ba * def[h];
    }
    let maxd = 0;
    let ma = 0;
    for (let i = 0; i < n; i++) {
      const v = den[i] > 0 ? num[i] / den[i] : 1;
      maxd = Math.max(maxd, Math.abs(v - att[i]));
      att[i] = v;
      ma += v;
    }
    ma /= n || 1;
    for (let i = 0; i < n; i++) att[i] /= ma;
    // védekezés
    for (let i = 0; i < n; i++) {
      num[i] = shrink * mbar * pDef[i];
      den[i] = shrink * mbar;
    }
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k], h = H[k], a = A[k];
      num[a] += r.w * r.yh;
      den[a] += r.w * bh * att[h];
      num[h] += r.w * r.ya;
      den[h] += r.w * ba * att[a];
    }
    let md = 0;
    for (let i = 0; i < n; i++) {
      const v = den[i] > 0 ? num[i] / den[i] : 1;
      maxd = Math.max(maxd, Math.abs(v - def[i]));
      def[i] = v;
      md += v;
    }
    md /= n || 1;
    for (let i = 0; i < n; i++) def[i] /= md;
    // alapszintek
    let eh = 0, ea = 0;
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k];
      eh += r.w * att[H[k]] * def[A[k]];
      ea += r.w * att[A[k]] * def[H[k]];
    }
    if (eh > 0) bh = syh / eh;
    if (ea > 0) ba = sya / ea;
    if (maxd < 1e-6) break;
  }
  // illeszkedési szórás (a szögletek / lapok szórásához)
  let sse = 0, smu = 0;
  rows.forEach((r, k) => {
    const mh = bh * att[H[k]] * def[A[k]];
    const ma2 = ba * att[A[k]] * def[H[k]];
    sse += r.w * ((r.yh - mh) ** 2 + (r.ya - ma2) ** 2);
    smu += r.w * (mh + ma2);
  });
  const phi = smu > 0 ? Math.max(1, sse / smu) : 1;
  return { idx, names, att, def, bh, ba, wsum, phi, H, A };
}

function tau(i, j, lh, la, rho) {
  if (i === 0 && j === 0) return 1 - lh * la * rho;
  if (i === 0 && j === 1) return 1 + lh * rho;
  if (i === 1 && j === 0) return 1 + la * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

function fitRho(rows, g) {
  let best = 0, bestLL = -Infinity;
  for (let rho = -0.2; rho <= 0.151; rho += 0.01) {
    let ll = 0;
    let ok = true;
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k];
      const m = r.m;
      if (m.hg > 1 || m.ag > 1) continue;
      const lh = g.bh * g.att[g.H[k]] * g.def[g.A[k]];
      const la = g.ba * g.att[g.A[k]] * g.def[g.H[k]];
      const t = tau(m.hg, m.ag, lh, la, rho);
      if (t <= 0) {
        ok = false;
        break;
      }
      ll += r.w * Math.log(t);
    }
    if (ok && ll > bestLL) {
      bestLL = ll;
      best = rho;
    }
  }
  return Math.round(best * 100) / 100;
}

/**
 * Modell építése egy bajnokságra.
 * refTs: csak az ennél korábbi meccseket használja (visszateszteléshez).
 */
export function buildModel(L, opts = DEFAULT_OPTS, refTs = Date.now()) {
  const o = { ...DEFAULT_OPTS, ...opts };
  const hl = Math.max(20, o.halfLife);
  const rows = [];
  for (const m of L.matches) {
    if (m.ts >= refTs) continue;
    const age = (refTs - m.ts) / DAY;
    const w = Math.exp((-Math.LN2 * age) / hl);
    if (w < 0.02) continue;
    let sw = o.wGoals, yh = o.wGoals * m.hg, ya = o.wGoals * m.ag;
    if (o.wXg > 0 && m.hxg != null && m.axg != null) {
      sw += o.wXg;
      yh += o.wXg * m.hxg;
      ya += o.wXg * m.axg;
    }
    if (o.wMarket > 0 && m.mh != null) {
      sw += o.wMarket;
      yh += o.wMarket * m.mh;
      ya += o.wMarket * m.ma;
    }
    if (sw <= 0) {
      sw = 1;
      yh = m.hg;
      ya = m.ag;
    }
    rows.push({ h: m.h, a: m.a, yh: yh / sw, ya: ya / sw, w, m });
  }
  if (rows.length < 10) return null;

  const tier1 = L.info && L.info.tier === 1;
  const priorOf = (t) => (tier1 && L.newTeams.has(t) ? [0.9, 1.1] : null);
  const goals = fitStrength(rows, o.shrink, priorOf);
  const rho = o.dc ? fitRho(rows, goals) : 0;

  // félidő arány
  let w1h = 0, wfh = 0, w1a = 0, wfa = 0;
  for (const r of rows) {
    const m = r.m;
    if (m.hhg == null || m.hag == null) continue;
    w1h += r.w * m.hhg;
    wfh += r.w * m.hg;
    w1a += r.w * m.hag;
    wfa += r.w * m.ag;
  }
  const ht = {
    h: wfh > 20 ? clamp(w1h / wfh, 0.3, 0.6) : 0.445,
    a: wfa > 20 ? clamp(w1a / wfa, 0.3, 0.6) : 0.445,
  };

  // szögletek
  let corners = null;
  const cRows = [];
  for (const r of rows) if (r.m.hc != null && r.m.ac != null) cRows.push({ h: r.h, a: r.a, yh: r.m.hc, ya: r.m.ac, w: r.w, m: r.m });
  if (cRows.length >= 30) corners = fitStrength(cRows, 6, null);

  // lapok (sárga + piros)
  let cards = null;
  const kRows = [];
  for (const r of rows) {
    const m = r.m;
    if (m.hy != null && m.ay != null) kRows.push({ h: r.h, a: r.a, yh: m.hy + (m.hr || 0), ya: m.ay + (m.ar || 0), w: r.w, m });
  }
  if (kRows.length >= 30) {
    cards = fitStrength(kRows, 8, null);
    // játékvezetői szorzó, zsugorítva
    const refs = new Map();
    kRows.forEach((r, k) => {
      const ref = r.m.ref;
      if (!ref) return;
      const exp = cards.bh * cards.att[cards.H[k]] * cards.def[cards.A[k]] + cards.ba * cards.att[cards.A[k]] * cards.def[cards.H[k]];
      const cur = refs.get(ref) || { act: 0, exp: 0, n: 0 };
      cur.act += r.w * (r.yh + r.ya);
      cur.exp += r.w * exp;
      cur.n += 1;
      refs.set(ref, cur);
    });
    const K = 6 * (cards.bh + cards.ba);
    cards.refs = new Map();
    for (const [ref, v] of refs) cards.refs.set(ref, { f: (v.act + K) / (v.exp + K), n: v.n });
  }

  return { goals, rho, ht, corners, cards, refTs, n: rows.length, opts: o, flags: L.flags };
}

function rating(fit, team) {
  const i = fit.idx.get(team);
  if (i == null) return { att: 1, def: 1, known: false, w: 0 };
  return { att: fit.att[i], def: fit.def[i], known: true, w: fit.wsum[i] };
}

/* ------------------------------------------------------------------ */
/* Előrejelzés                                                         */
/* ------------------------------------------------------------------ */

const NMAX = 10;

export function predict(M, home, away, ctx = {}) {
  const g = M.goals;
  const rh = rating(g, home);
  const ra = rating(g, away);
  const lh = g.bh * rh.att * ra.def;
  const la = g.ba * ra.att * rh.def;
  const ph = pois(lh, NMAX), pa = pois(la, NMAX);
  const mat = [];
  let tot = 0;
  for (let i = 0; i <= NMAX; i++) {
    const row = new Float64Array(NMAX + 1);
    for (let j = 0; j <= NMAX; j++) {
      let v = ph[i] * pa[j] * tau(i, j, lh, la, M.rho);
      if (v < 0) v = 0;
      row[j] = v;
      tot += v;
    }
    mat.push(row);
  }
  for (const row of mat) for (let j = 0; j <= NMAX; j++) row[j] /= tot;

  let cor = null;
  if (M.corners) {
    const c = M.corners;
    const a = rating(c, home), b = rating(c, away);
    cor = { mh: c.bh * a.att * b.def, ma: c.ba * b.att * a.def, phi: c.phi };
  }
  let card = null;
  if (M.cards) {
    const c = M.cards;
    const a = rating(c, home), b = rating(c, away);
    let f = 1;
    let refInfo = null;
    if (ctx.ref && c.refs && c.refs.has(ctx.ref)) {
      refInfo = c.refs.get(ctx.ref);
      f = refInfo.f;
    }
    card = { mh: c.bh * a.att * b.def * f, ma: c.ba * b.att * a.def * f, phi: c.phi, ref: ctx.ref || null, refF: f, refN: refInfo ? refInfo.n : 0 };
  }
  return {
    home, away, lh, la, mat, N: NMAX,
    rh: M.ht.h, ra: M.ht.a,
    cor, card,
    rating: { h: rh, a: ra },
    rho: M.rho,
  };
}

/* ------------------------------------------------------------------ */
/* Piacok                                                              */
/* ------------------------------------------------------------------ */

const W = [1, 0], L0 = [0, 0], PU = [0, 1];
const res = (h, a) => (h > a ? 'H' : h < a ? 'A' : 'D');
const RES_CODE = { H: '1', D: 'X', A: '2' };
const ou = (x, line, side) => {
  const d = x - line;
  if (Math.abs(d) < 1e-9) return PU;
  return (side === 'O' ? d > 0 : d < 0) ? W : L0;
};
function ahOutcome(diff, line) {
  if (Math.abs(Math.round(line * 4)) % 2 === 1) {
    const a = ahOutcome(diff, line - 0.25), b = ahOutcome(diff, line + 0.25);
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
  const v = diff + line;
  if (Math.abs(v) < 1e-9) return PU;
  return v > 0 ? W : L0;
}

const parsed = new Map();

/** Piac-azonosító értelmezése: tartomány és kimenet-függvény */
export function parseMarket(id) {
  if (parsed.has(id)) return parsed.get(id);
  const p = id.split(':');
  const t = p[0];
  let dom = 'g';
  let f = null;
  const side = (k) => (k === 'H' ? 'h' : 'a');
  switch (t) {
    case '1X2': f = (s) => (res(s.hg, s.ag) === p[1] ? W : L0); break;
    case 'DC': f = (s) => (p[1].includes(RES_CODE[res(s.hg, s.ag)]) ? W : L0); break;
    case 'DNB': f = (s) => (s.hg === s.ag ? PU : res(s.hg, s.ag) === p[1] ? W : L0); break;
    case 'OU': { const l = +p[1]; f = (s) => ou(s.hg + s.ag, l, p[2]); break; }
    case 'TT': { const l = +p[2]; f = (s) => ou(p[1] === 'H' ? s.hg : s.ag, l, p[3]); break; }
    case 'BTTS': f = (s) => ((s.hg > 0 && s.ag > 0) === (p[1] === 'Y') ? W : L0); break;
    case 'RB': f = (s) => (res(s.hg, s.ag) === p[1] && (s.hg > 0 && s.ag > 0) === (p[2] === 'Y') ? W : L0); break;
    case 'RO': { const l = +p[2]; f = (s) => (res(s.hg, s.ag) === p[1] && ou(s.hg + s.ag, l, p[3]) === W ? W : L0); break; }
    case 'BO': { const l = +p[2]; f = (s) => ((s.hg > 0 && s.ag > 0) === (p[1] === 'Y') && ou(s.hg + s.ag, l, p[3]) === W ? W : L0); break; }
    case 'EH': {
      const n = +p[2];
      f = (s) => {
        const h = s.hg + (p[1] === 'H' ? n : 0);
        const a = s.ag + (p[1] === 'A' ? n : 0);
        return res(h, a) === p[3] ? W : L0;
      };
      break;
    }
    case 'AH': { const l = +p[1]; f = (s) => (p[2] === 'H' ? ahOutcome(s.hg - s.ag, l) : ahOutcome(s.ag - s.hg, -l)); break; }
    case 'CS': {
      if (p[1] === 'X') f = (s) => (s.hg > 5 || s.ag > 5 ? W : L0);
      else {
        const [h, a] = p[1].split('-').map(Number);
        f = (s) => (s.hg === h && s.ag === a ? W : L0);
      }
      break;
    }
    case 'TG': {
      const plus = p[1].endsWith('+');
      const n = parseInt(p[1], 10);
      f = (s) => ((plus ? s.hg + s.ag >= n : s.hg + s.ag === n) ? W : L0);
      break;
    }
    case 'TGR': {
      const [lo, hi] = p[1].split('-');
      f = (s) => {
        const x = s.hg + s.ag;
        return x >= +lo && (hi === '' || x <= +hi) ? W : L0;
      };
      break;
    }
    case 'OE': f = (s) => (((s.hg + s.ag) % 2 === 1) === (p[1] === 'O') ? W : L0); break;
    case 'TS': f = (s) => ((s[side(p[1]) + 'g'] > 0) === (p[2] === 'Y') ? W : L0); break;
    case 'CLS': f = (s) => (((p[1] === 'H' ? s.ag : s.hg) === 0) === (p[2] === 'Y') ? W : L0); break;
    case 'WTN': f = (s) => (p[1] === 'H' ? (s.hg > 0 && s.ag === 0 ? W : L0) : s.ag > 0 && s.hg === 0 ? W : L0); break;
    case 'WM': {
      // győzelmi különbség: H1, H2, H3+ / A1 ...
      const team = p[1][0];
      const plus = p[1].endsWith('+');
      const n = parseInt(p[1].slice(1), 10);
      f = (s) => {
        const d = team === 'H' ? s.hg - s.ag : s.ag - s.hg;
        return (plus ? d >= n : d === n) ? W : L0;
      };
      break;
    }
    case 'HT1X2': dom = 'h'; f = (s) => (res(s.h1, s.a1) === p[1] ? W : L0); break;
    case 'HTDC': dom = 'h'; f = (s) => (p[1].includes(RES_CODE[res(s.h1, s.a1)]) ? W : L0); break;
    case 'HTOU': { dom = 'h'; const l = +p[1]; f = (s) => ou(s.h1 + s.a1, l, p[2]); break; }
    case 'HTFT': {
      dom = 'h';
      const [x, y] = p[1].split('/');
      f = (s) => (res(s.h1, s.a1) === x && res(s.hg, s.ag) === y ? W : L0);
      break;
    }
    case 'H2X': dom = 'h'; f = (s) => (res(s.h2, s.a2) === p[1] ? W : L0); break;
    case 'H2OU': { dom = 'h'; const l = +p[1]; f = (s) => ou(s.h2 + s.a2, l, p[2]); break; }
    case 'HSH': {
      dom = 'h';
      f = (s) => {
        const a = s.h1 + s.a1, b = s.h2 + s.a2;
        return (a > b ? '1' : a < b ? '2' : 'E') === p[1] ? W : L0;
      };
      break;
    }
    case 'HTBTTS': dom = 'h'; f = (s) => ((s.h1 > 0 && s.a1 > 0) === (p[1] === 'Y') ? W : L0); break;
    case 'SBH': {
      // gól mindkét félidőben
      dom = 'h';
      f = (s) => ((s.h1 + s.a1 > 0 && s.h2 + s.a2 > 0) === (p[1] === 'Y') ? W : L0);
      break;
    }
    case 'CO': { dom = 'c'; const l = +p[1]; f = (s) => ou(s.hc + s.ac, l, p[2]); break; }
    case 'CTT': { dom = 'c'; const l = +p[2]; f = (s) => ou(p[1] === 'H' ? s.hc : s.ac, l, p[3]); break; }
    case 'C1X2': dom = 'c'; f = (s) => (res(s.hc, s.ac) === p[1] ? W : L0); break;
    case 'CAH': { dom = 'c'; const l = +p[1]; f = (s) => (p[2] === 'H' ? ahOutcome(s.hc - s.ac, l) : ahOutcome(s.ac - s.hc, -l)); break; }
    case 'KO': { dom = 'k'; const l = +p[1]; f = (s) => ou(s.hk + s.ak, l, p[2]); break; }
    case 'KTT': { dom = 'k'; const l = +p[2]; f = (s) => ou(p[1] === 'H' ? s.hk : s.ak, l, p[3]); break; }
    case 'K1X2': dom = 'k'; f = (s) => (res(s.hk, s.ak) === p[1] ? W : L0); break;
    default:
      f = () => L0;
  }
  const out = { id, t, p, dom, f };
  parsed.set(id, out);
  return out;
}

/** Megjelenítendő szöveg egy piachoz */
export function marketText(id, home = 'Hazai', away = 'Vendég') {
  const p = id.split(':');
  const T = (k) => (k === 'H' ? home : k === 'A' ? away : 'Döntetlen');
  const R = (k) => (k === 'H' ? '1' : k === 'D' ? 'X' : '2');
  const OU = (s, l) => `${s === 'O' ? 'Több mint' : 'Kevesebb mint'} ${fmtLine(l)}`;
  const YN = (s) => (s === 'Y' ? 'Igen' : 'Nem');
  const hcp = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmtLine(Math.abs(x));
  switch (p[0]) {
    case '1X2': return { g: 'Végeredmény', s: `${R(p[1])} · ${T(p[1])}`, short: R(p[1]) };
    case 'DC': return { g: 'Kettős esély', s: p[1], short: p[1] };
    case 'DNB': return { g: 'Döntetlennél visszajár', s: T(p[1]), short: p[1] === 'H' ? '1' : '2' };
    case 'OU': return { g: 'Gólok száma', s: OU(p[2], +p[1]), short: (p[2] === 'O' ? 'T ' : 'K ') + fmtLine(+p[1]) };
    case 'TT': return { g: `${T(p[1])} góljai`, s: OU(p[3], +p[2]) };
    case 'BTTS': return { g: 'Mindkét csapat szerez gólt', s: YN(p[1]) };
    case 'RB': return { g: 'Végeredmény + mindkét csapat gól', s: `${R(p[1])} és ${YN(p[2]).toLowerCase()}` };
    case 'RO': return { g: 'Végeredmény + gólok', s: `${R(p[1])} és ${OU(p[3], +p[2]).toLowerCase()}` };
    case 'BO': return { g: 'Mindkét csapat gól + gólok', s: `${YN(p[1])} és ${OU(p[3], +p[2]).toLowerCase()}` };
    case 'EH': return { g: `Hendikep (${p[1] === 'H' ? home : away} ${hcp(+p[2])})`, s: `${R(p[3])} · ${T(p[3])}` };
    case 'AH': {
      const l = +p[1];
      return { g: 'Ázsiai hendikep', s: p[2] === 'H' ? `${home} ${hcp(l)}` : `${away} ${hcp(-l)}` };
    }
    case 'CS': return { g: 'Pontos végeredmény', s: p[1] === 'X' ? 'Egyéb (6+ gól egy csapattól)' : p[1].replace('-', '–') };
    case 'TG': return { g: 'Gólok pontos száma', s: `${p[1]} gól` };
    case 'TGR': {
      const [lo, hi] = p[1].split('-');
      return { g: 'Gólok sávja', s: hi === '' ? `${lo} vagy több gól` : `${lo}–${hi} gól` };
    }
    case 'OE': return { g: 'Gólok páros / páratlan', s: p[1] === 'O' ? 'Páratlan' : 'Páros' };
    case 'TS': return { g: `${T(p[1])} szerez gólt`, s: YN(p[2]) };
    case 'CLS': return { g: `${T(p[1])} kapott gól nélkül`, s: YN(p[2]) };
    case 'WTN': return { g: 'Győzelem kapott gól nélkül', s: T(p[1]) };
    case 'WM': {
      const team = p[1][0];
      return { g: 'Győzelmi különbség', s: `${T(team)} ${p[1].slice(1)} góllal` };
    }
    case 'HT1X2': return { g: 'Félidő eredménye', s: `${R(p[1])} · ${T(p[1])}`, short: R(p[1]) };
    case 'HTDC': return { g: 'Félidő kettős esély', s: p[1] };
    case 'HTOU': return { g: 'Félidő gólok', s: OU(p[2], +p[1]) };
    case 'HTFT': {
      const [x, y] = p[1].split('/');
      return { g: 'Félidő / végeredmény', s: `${R(x)} / ${R(y)}` };
    }
    case 'H2X': return { g: '2. félidő eredménye', s: `${R(p[1])} · ${T(p[1])}` };
    case 'H2OU': return { g: '2. félidő gólok', s: OU(p[2], +p[1]) };
    case 'HSH': return { g: 'Gólgazdagabb félidő', s: p[1] === '1' ? '1. félidő' : p[1] === '2' ? '2. félidő' : 'Egyenlő' };
    case 'HTBTTS': return { g: 'Félidő: mindkét csapat gól', s: YN(p[1]) };
    case 'SBH': return { g: 'Gól mindkét félidőben', s: YN(p[1]) };
    case 'CO': return { g: 'Szögletek száma', s: OU(p[2], +p[1]) };
    case 'CTT': return { g: `${T(p[1])} szögletei`, s: OU(p[3], +p[2]) };
    case 'C1X2': return { g: 'Több szöglet', s: `${R(p[1])} · ${T(p[1])}` };
    case 'CAH': {
      const l = +p[1];
      return { g: 'Szöglet-hendikep', s: p[2] === 'H' ? `${home} ${hcp(l)}` : `${away} ${hcp(-l)}` };
    }
    case 'KO': return { g: 'Lapok száma', s: OU(p[2], +p[1]) };
    case 'KTT': return { g: `${T(p[1])} lapjai`, s: OU(p[3], +p[2]) };
    case 'K1X2': return { g: 'Több lap', s: `${R(p[1])} · ${T(p[1])}` };
    default: return { g: id, s: '' };
  }
}

/* ------------------------------------------------------------------ */
/* Kiértékelés állapottereken                                          */
/* ------------------------------------------------------------------ */

function binomCache(P) {
  if (!P._bin) {
    P._bin = { h: [], a: [] };
    for (let n = 0; n <= P.N; n++) {
      P._bin.h.push(binomRow(n, P.rh));
      P._bin.a.push(binomRow(n, P.ra));
    }
  }
  return P._bin;
}

/** gól-állapotok bejárása; ha needHalf, félidő-bontással (binomiális ritkítás) */
function eachGoalState(P, needHalf, cb) {
  const { mat, N } = P;
  const s = { hg: 0, ag: 0, h1: 0, a1: 0, h2: 0, a2: 0 };
  if (!needHalf) {
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const pr = mat[i][j];
        if (pr < 1e-12) continue;
        s.hg = i;
        s.ag = j;
        cb(s, pr);
      }
    }
    return;
  }
  const B = binomCache(P);
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const pr = mat[i][j];
      if (pr < 1e-10) continue;
      const bi = B.h[i], bj = B.a[j];
      for (let h1 = 0; h1 <= i; h1++) {
        const p1 = pr * bi[h1];
        if (p1 < 1e-13) continue;
        for (let a1 = 0; a1 <= j; a1++) {
          s.hg = i; s.ag = j; s.h1 = h1; s.a1 = a1; s.h2 = i - h1; s.a2 = j - a1;
          cb(s, p1 * bj[a1]);
        }
      }
    }
  }
}

function countPmfs(P, dom) {
  const key = '_pmf' + dom;
  if (P[key]) return P[key];
  const src = dom === 'c' ? P.cor : P.card;
  if (!src) return null;
  const n = dom === 'c' ? 30 : 16;
  const ph = nbin(src.mh, src.phi, n), pa = nbin(src.ma, src.phi, n);
  P[key] = { ph, pa, n };
  return P[key];
}

function eachCountState(P, dom, cb) {
  const pm = countPmfs(P, dom);
  if (!pm) return false;
  const s = { hc: 0, ac: 0, hk: 0, ak: 0 };
  const kh = dom === 'c' ? 'hc' : 'hk', ka = dom === 'c' ? 'ac' : 'ak';
  for (let i = 0; i <= pm.n; i++) {
    if (pm.ph[i] < 1e-12) continue;
    for (let j = 0; j <= pm.n; j++) {
      const pr = pm.ph[i] * pm.pa[j];
      if (pr < 1e-13) continue;
      s[kh] = i;
      s[ka] = j;
      cb(s, pr);
    }
  }
  return true;
}

function eachState(P, dom, needHalf, cb) {
  if (dom === 'g') {
    eachGoalState(P, needHalf, cb);
    return true;
  }
  return eachCountState(P, dom, cb);
}

/**
 * Sok piac egyszerre: {id: {p, push}} (p = nyerési, push = visszajárási valószínűség)
 */
export function evalMarkets(P, ids) {
  const out = {};
  const groups = { g: [], h: [], c: [], k: [] };
  for (const id of ids) {
    const m = parseMarket(id);
    groups[m.dom].push(m);
    out[id] = { p: 0, push: 0 };
  }
  const run = (list, dom, half) => {
    if (!list.length) return;
    const ok = eachState(P, dom, half, (s, pr) => {
      for (const m of list) {
        const r = m.f(s);
        if (r[0]) out[m.id].p += pr * r[0];
        if (r[1]) out[m.id].push += pr * r[1];
      }
    });
    if (!ok) for (const m of list) out[m.id] = null;
  };
  run(groups.g, 'g', false);
  run(groups.h, 'g', true);
  run(groups.c, 'c', false);
  run(groups.k, 'k', false);
  return out;
}

export function evalMarket(P, id) {
  return evalMarkets(P, [id])[id];
}

/* ------------------------------------------------------------------ */
/* Csapat- és bajnoki statisztikák                                     */
/* ------------------------------------------------------------------ */

export function teamView(m, team) {
  const home = m.h === team;
  const g = (hk, ak) => (m[hk] == null ? null : home ? m[hk] : m[ak]);
  const gf = home ? m.hg : m.ag;
  const ga = home ? m.ag : m.hg;
  const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  const o = m.oc || m.o;
  return {
    m, home, opp: home ? m.a : m.h, gf, ga, r, pts: r === 'W' ? 3 : r === 'D' ? 1 : 0,
    xgf: g('hxg', 'axg'), xga: g('axg', 'hxg'),
    sf: g('hs', 'as'), sa: g('as', 'hs'),
    stf: g('hst', 'ast'), sta: g('ast', 'hst'),
    cf: g('hc', 'ac'), ca: g('ac', 'hc'),
    ff: g('hf', 'af'), fa: g('af', 'hf'),
    kf: m.hy == null ? null : home ? m.hy + (m.hr || 0) : m.ay + (m.ar || 0),
    ka: m.hy == null ? null : home ? m.ay + (m.ar || 0) : m.hy + (m.hr || 0),
    redf: g('hr', 'ar'),
    h1f: g('hhg', 'hag'), h1a: g('hag', 'hhg'),
    oddsWin: o ? (home ? o[0] : o[2]) : null,
    oddsDraw: o ? o[1] : null,
    xgOk: m.hxg != null,
  };
}

export function teamMatches(L, team, { season = null, venue = 'all', last = 0, before = null } = {}) {
  let list = L.matches.filter((m) => (m.h === team || m.a === team) && (!season || m.s === season) && (!before || m.ts < before));
  if (venue === 'home') list = list.filter((m) => m.h === team);
  if (venue === 'away') list = list.filter((m) => m.a === team);
  list = list.map((m) => teamView(m, team));
  if (last > 0) list = list.slice(-last);
  return list;
}

const avgOf = (list, k) => {
  const v = list.filter((x) => x[k] != null);
  return v.length ? v.reduce((a, x) => a + x[k], 0) / v.length : null;
};
const pctOf = (list, f) => (list.length ? list.filter(f).length / list.length : null);

export function aggregate(list) {
  const n = list.length;
  const w = list.filter((x) => x.r === 'W').length;
  const d = list.filter((x) => x.r === 'D').length;
  const l = n - w - d;
  const gf = list.reduce((a, x) => a + x.gf, 0);
  const ga = list.reduce((a, x) => a + x.ga, 0);
  const tot = (x) => x.gf + x.ga;
  const out = {
    n, w, d, l, gf, ga, pts: w * 3 + d,
    ppg: n ? (w * 3 + d) / n : null,
    gfpm: n ? gf / n : null,
    gapm: n ? ga / n : null,
    xgf: avgOf(list, 'xgf'), xga: avgOf(list, 'xga'),
    sf: avgOf(list, 'sf'), sa: avgOf(list, 'sa'),
    stf: avgOf(list, 'stf'), sta: avgOf(list, 'sta'),
    cf: avgOf(list, 'cf'), ca: avgOf(list, 'ca'),
    kf: avgOf(list, 'kf'), ka: avgOf(list, 'ka'),
    ff: avgOf(list, 'ff'), fa: avgOf(list, 'fa'),
    h1f: avgOf(list, 'h1f'), h1a: avgOf(list, 'h1a'),
    btts: pctOf(list, (x) => x.gf > 0 && x.ga > 0),
    cs: pctOf(list, (x) => x.ga === 0),
    fts: pctOf(list, (x) => x.gf === 0),
    winPct: n ? w / n : null,
    drawPct: n ? d / n : null,
    lossPct: n ? l / n : null,
    over: {},
    tOver: {},
    cOver: {},
    kOver: {},
  };
  for (const ln of [0.5, 1.5, 2.5, 3.5, 4.5]) out.over[ln] = pctOf(list, (x) => tot(x) > ln);
  for (const ln of [0.5, 1.5, 2.5]) out.tOver[ln] = pctOf(list, (x) => x.gf > ln);
  const withC = list.filter((x) => x.cf != null);
  if (withC.length) for (const ln of [7.5, 8.5, 9.5, 10.5, 11.5]) out.cOver[ln] = pctOf(withC, (x) => x.cf + x.ca > ln);
  const withK = list.filter((x) => x.kf != null);
  if (withK.length) for (const ln of [2.5, 3.5, 4.5, 5.5]) out.kOver[ln] = pctOf(withK, (x) => x.kf + x.ka > ln);
  // félidő
  const withH = list.filter((x) => x.h1f != null);
  if (withH.length) {
    out.htW = pctOf(withH, (x) => x.h1f > x.h1a);
    out.htD = pctOf(withH, (x) => x.h1f === x.h1a);
    out.htL = pctOf(withH, (x) => x.h1f < x.h1a);
    out.g1 = withH.reduce((a, x) => a + x.h1f, 0);
    out.g2 = withH.reduce((a, x) => a + (x.gf - x.h1f), 0);
    out.c1 = withH.reduce((a, x) => a + x.h1a, 0);
    out.c2 = withH.reduce((a, x) => a + (x.ga - x.h1a), 0);
  }
  return out;
}

export function leagueTable(matches, { venue = 'all', last = 0 } = {}) {
  const T = new Map();
  const get = (t) => {
    if (!T.has(t)) T.set(t, { team: t, list: [] });
    return T.get(t);
  };
  for (const m of matches) {
    if (venue !== 'away') get(m.h).list.push(teamView(m, m.h));
    else get(m.h);
    if (venue !== 'home') get(m.a).list.push(teamView(m, m.a));
    else get(m.a);
  }
  const rows = [];
  for (const { team, list } of T.values()) {
    const l = last ? list.slice(-last) : list;
    const a = aggregate(l);
    rows.push({ team, ...a, gd: a.gf - a.ga, form: list.slice(-5).map((x) => x.r), xgd: a.xgf != null ? (a.xgf - a.xga) * a.n : null });
  }
  rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team));
  rows.forEach((r, i) => (r.pos = i + 1));
  return rows;
}

export function leagueSummary(matches) {
  const n = matches.length;
  if (!n) return null;
  const s = (f) => matches.reduce((a, m) => a + f(m), 0);
  const withC = matches.filter((m) => m.hc != null);
  const withK = matches.filter((m) => m.hy != null);
  const withX = matches.filter((m) => m.hxg != null);
  return {
    n,
    goals: s((m) => m.hg + m.ag) / n,
    hg: s((m) => m.hg) / n,
    ag: s((m) => m.ag) / n,
    home: s((m) => (m.hg > m.ag ? 1 : 0)) / n,
    draw: s((m) => (m.hg === m.ag ? 1 : 0)) / n,
    away: s((m) => (m.hg < m.ag ? 1 : 0)) / n,
    o25: s((m) => (m.hg + m.ag > 2.5 ? 1 : 0)) / n,
    o15: s((m) => (m.hg + m.ag > 1.5 ? 1 : 0)) / n,
    o35: s((m) => (m.hg + m.ag > 3.5 ? 1 : 0)) / n,
    btts: s((m) => (m.hg > 0 && m.ag > 0 ? 1 : 0)) / n,
    corners: withC.length ? withC.reduce((a, m) => a + m.hc + m.ac, 0) / withC.length : null,
    cards: withK.length ? withK.reduce((a, m) => a + m.hy + m.ay + (m.hr || 0) + (m.ar || 0), 0) / withK.length : null,
    xg: withX.length ? withX.reduce((a, m) => a + m.hxg + m.axg, 0) / withX.length : null,
  };
}
