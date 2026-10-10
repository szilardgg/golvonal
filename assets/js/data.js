import { store, qs, todayIso } from './util.js';
import { prepLeague, fitLeague, DEFAULT_OPTS } from './stats.js';

const mem = new Map();

async function getJSON(params) {
  const key = qs(params);
  if (mem.has(key)) return mem.get(key);
  const p = fetch('api.php?' + key, { headers: { Accept: 'application/json' } }).then(async (r) => {
    const txt = await r.text();
    let j;
    try {
      j = JSON.parse(txt);
    } catch {
      throw new Error('Érvénytelen válasz a szervertől. Fut a PHP?');
    }
    if (j.error) throw new Error(j.error);
    return j;
  });
  mem.set(key, p);
  p.catch(() => mem.delete(key));
  return p;
}

export const STATIC = !!window.GV_STATIC;
let buildId = '';

function sget(path) {
  const key = 'static:' + path;
  if (mem.has(key)) return mem.get(key);
  const first = path === 'leagues.json';
  const url = 'data/' + path + (first ? '' : '?v=' + encodeURIComponent(buildId));
  const p = fetch(url, { cache: first ? 'no-cache' : 'default' }).then((r) => {
    if (!r.ok) throw new Error(`Az adatfájl nem érhető el (${r.status}): ${path}`);
    return r.json();
  });
  mem.set(key, p);
  p.catch(() => mem.delete(key));
  return p;
}

async function staticLeague(code, n, from) {
  const idx = await sget(`league/${code}/index.json`);
  const list = idx.seasons;
  let start = 0;
  if (from) {
    const i = list.findIndex((s) => s.s === from);
    if (i >= 0) start = i;
  }
  const pick = list.slice(start, start + n);
  const parts = await Promise.all(pick.map((s) => sget(`league/${code}/${s.k}.json`)));
  const matches = parts
    .flatMap((p) => p.matches.map((m) => ({ ...m })))
    .sort((a, b) => (a.d + (a.t || '')).localeCompare(b.d + (b.t || '')));
  return { code, matches, seasons: pick.map((s) => s.s) };
}

async function staticH2H(code, home, away) {
  const group = leagueInfo(code).group;
  const codes = state.leagues.filter((l) => l.group === group).map((l) => l.code);
  const out = [];
  await Promise.all(
    codes.map(async (c) => {
      const L = await staticLeague(c, 12).catch(() => null);
      if (!L) return;
      for (const m of L.matches) {
        if ((m.h === home && m.a === away) || (m.h === away && m.a === home)) out.push({ ...m, l: c });
      }
    }),
  );
  out.sort((a, b) => b.d.localeCompare(a.d));
  return { matches: out };
}

export const api = STATIC
  ? {
      leagues: async () => {
        const j = await sget('leagues.json');
        buildId = j.updated || '';
        return j;
      },
      league: (code, seasons = 2, from = null) => staticLeague(code, seasons, from),
      seasons: async (code) => ({ code, seasons: (await sget(`league/${code}/index.json`)).seasons.map((s) => s.s) }),
      fixtures: () => sget('fixtures.json'),
      teams: () => sget('teams.json'),
      h2h: (code, home, away) => staticH2H(code, home, away),
    }
  : {
      leagues: () => getJSON({ action: 'leagues' }),
      league: (code, seasons = 2, from = null) => getJSON({ action: 'league', code, seasons, from }),
      seasons: (code) => getJSON({ action: 'seasons', code }),
      fixtures: () => getJSON({ action: 'fixtures' }),
      teams: () => getJSON({ action: 'teams' }),
      h2h: (code, home, away) => getJSON({ action: 'h2h', code, home, away, seasons: 10 }),
    };

export const settings = {
  fit: { ...DEFAULT_OPTS },
  theme: store.get('theme', 'system'),
};

export function saveSettings() {
  store.set('theme', settings.theme);
}

export const state = {
  leagues: [],
  leagueMap: new Map(),
  season: '',
  today: '',
  fixtures: null,
  teamIndex: null,
};

export async function init() {
  const j = await api.leagues();
  state.leagues = j.leagues;
  state.season = j.season;
  state.today = todayIso();
  state.updated = j.updated || null;
  for (const l of j.leagues) state.leagueMap.set(l.code, l);
  return state;
}

export const leagueInfo = (code) => state.leagueMap.get(code);

const leagues = new Map();

export function loadLeague(code, seasons = null, from = null) {
  const n = seasons || settings.fit.seasons || 2;
  const key = `${code}|${n}|${from || ''}`;
  if (!leagues.has(key)) {
    const p = api.league(code, n, from).then((raw) => prepLeague(raw, leagueInfo(code)));
    leagues.set(key, p);
    p.catch(() => leagues.delete(key));
  }
  return leagues.get(key);
}

export const getLeague = (code) => loadLeague(code);

const fits = new Map();
export function getFit(code) {
  if (fits.has(code)) return fits.get(code);
  const p = getLeague(code).then((L) => ({ L, M: fitLeague(L, settings.fit) }));
  fits.set(code, p);
  p.catch(() => fits.delete(code));
  return p;
}

export async function getFixtures() {
  if (!state.fixtures) {
    const j = await api.fixtures();
    state.fixtures = j.fixtures.filter((f) => f.d >= state.today);
  }
  return state.fixtures;
}

export function findFixture(code, home, away) {
  if (!state.fixtures) return null;
  return state.fixtures.find((f) => f.l === code && f.h === home && f.a === away) || null;
}

export async function getTeamIndex() {
  if (!state.teamIndex) {
    const j = await api.teams();
    state.teamIndex = j.teams;
  }
  return state.teamIndex;
}

export async function pool(items, limit, fn) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const it = queue.shift();
      try {
        await fn(it);
      } catch (e) {
        console.warn(e);
      }
    }
  });
  await Promise.all(workers);
}
