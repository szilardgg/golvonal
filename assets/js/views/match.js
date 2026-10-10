import { $, $$, esc, icon, fmtPct, fmtNum, fmtDate, store } from '../util.js';
import { state, getFit, getFixtures, findFixture, leagueInfo, api } from '../data.js';
import { calcMatch, evalMarkets, teamMatches, aggregate, leagueTable, marketText } from '../stats.js';
import { leagueOptions, teamOptions, formDots, probBar, pcell, loading, errorBox, empty, kpi, scoreBadge, matchLink, leagueTag } from '../ui.js';
import { cmpRow } from '../charts.js';
import { bindSearch } from '../search.js';

let cur = null;
let tab = 'odds';
let statScope = 'season';
let statVenue = 'venue';

export async function renderMatch(view, params) {
  const l = params.get('l') || store.get('lastLeague', 'E0');
  const h = params.get('h') || '';
  const a = params.get('a') || '';

  view.innerHTML = `
    <div class="card card-pad picker-card">
      <div class="quickfind">
        ${icon('search', 18)}
        <input class="input" id="qf-input" type="search" placeholder="Írd be a meccset, pl. Arsenal - Chelsea" autocomplete="off" spellcheck="false">
        <div class="qf-results" id="qf-results"></div>
      </div>
      <div class="picker">
        <label class="field f-league"><span>Bajnokság</span><select class="select" id="pk-l">${leagueOptions(l)}</select></label>
        <label class="field"><span>Hazai</span><select class="select" id="pk-h"><option>Betöltés...</option></select></label>
        <button class="btn swap" id="pk-swap" title="Csere" aria-label="Csapatok cseréje">${icon('swap', 16)}</button>
        <label class="field"><span>Vendég</span><select class="select" id="pk-a"><option>Betöltés...</option></select></label>
      </div>
    </div>
    <div id="m-body"></div>
  `;

  bindSearch($('#qf-input'), $('#qf-results'));
  const selL = $('#pk-l'), selH = $('#pk-h'), selA = $('#pk-a');
  const go = () => {
    if (selH.value && selA.value && selH.value !== selA.value) location.hash = matchLink(selL.value, selH.value, selA.value);
  };
  selL.addEventListener('change', () => {
    store.set('lastLeague', selL.value);
    location.hash = `#/elemzes?l=${encodeURIComponent(selL.value)}`;
  });
  selH.addEventListener('change', go);
  selA.addEventListener('change', go);
  $('#pk-swap').addEventListener('click', () => {
    if (selH.value && selA.value) location.hash = matchLink(selL.value, selA.value, selH.value);
  });

  const body = $('#m-body');
  body.innerHTML = loading('Adatok betöltése...');
  let L, M;
  try {
    ({ L, M } = await getFit(l));
  } catch (e) {
    body.innerHTML = errorBox(e);
    return;
  }
  await getFixtures().catch(() => null);
  if (!document.body.contains(view)) return;

  const fxTeams = (state.fixtures || []).filter((f) => f.l === l).flatMap((f) => [f.h, f.a]);
  const teams = [...new Set([...L.teams, ...fxTeams])].sort((x, y) => x.localeCompare(y, 'hu'));
  selH.innerHTML = teamOptions(teams, h, 'Hazai csapat');
  selA.innerHTML = teamOptions(teams, a, 'Vendég csapat');

  if (!h || !a) {
    renderLeaguePick(body, l);
    return;
  }
  if (!M) {
    body.innerHTML = `<div class="card">${empty('Kevés adat', 'Ehhez a bajnoksághoz még nincs elég lejátszott mérkőzés.')}</div>`;
    return;
  }
  store.set('lastLeague', l);
  const fx = findFixture(l, h, a);
  const P = calcMatch(M, h, a, { ref: fx && fx.ref });
  const groups = buildGroups(P);
  const ids = new Set(groups.flatMap((g) => g.rows.flatMap((r) => r.ids)));
  for (const id of TOP_CANDIDATES(P)) ids.add(id);
  const ev = evalMarkets(P, [...ids]);
  cur = { l, h, a, L, M, P, fx, ev, groups };
  renderAnalysis(body);
}

function renderLeaguePick(body, l) {
  const fx = (state.fixtures || []).filter((f) => f.l === l);
  const li = leagueInfo(l);
  body.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>Következő meccsek: ${esc(li ? li.name : l)}</h3></div>
      ${fx.length ? `<div class="res-list">${fx.map((f) => `
        <a class="rl-row" href="${esc(matchLink(f.l, f.h, f.a))}">
          <span class="d muted small">${fmtDate(f.d)} ${esc(f.t || '')}</span>
          <span class="h">${esc(f.h)}</span>
          <span class="vs">-</span>
          <span class="a">${esc(f.a)}</span>
          <span class="meta">${icon('chevron', 16)}</span>
        </a>`).join('')}</div>` : empty('Nincs ismert következő meccs', 'Válaszd ki fent a két csapatot.')}
    </div>`;
}

const ln = (x) => fmtNum(x, 1);

function buildGroups(P) {
  const G = [];
  G.push({ title: 'Végeredmény', head: ['Hazai', 'Döntetlen', 'Vendég'], excl: true, rows: [{ label: '', ids: ['1X2:H', '1X2:D', '1X2:A'] }] });
  G.push({ title: 'Kettős esély', head: ['1X', '12', 'X2'], rows: [{ label: '', ids: ['DC:1X', 'DC:12', 'DC:X2'] }] });
  G.push({ title: 'Gólok száma', head: ['Több mint', 'Kevesebb mint'], excl: true, rows: [0.5, 1.5, 2.5, 3.5, 4.5].map((x) => ({ label: `${ln(x)} gól`, ids: [`OU:${x}:O`, `OU:${x}:U`] })) });
  G.push({ title: 'Mindkét csapat szerez gólt', head: ['Igen', 'Nem'], excl: true, rows: [{ label: '', ids: ['BTTS:Y', 'BTTS:N'] }] });
  G.push({
    title: 'Csapatok góljai',
    head: ['1+ gól', '2+ gól', '3+ gól'],
    rows: [
      { label: P.home, ids: ['TT:H:0.5:O', 'TT:H:1.5:O', 'TT:H:2.5:O'] },
      { label: P.away, ids: ['TT:A:0.5:O', 'TT:A:1.5:O', 'TT:A:2.5:O'] },
    ],
  });
  G.push({ title: 'Félidő eredménye', head: ['1', 'X', '2'], excl: true, rows: [{ label: '', ids: ['HT1X2:H', 'HT1X2:D', 'HT1X2:A'] }] });
  if (P.cor) {
    const c = Math.round(P.cor.mh + P.cor.ma) - 0.5;
    G.push({ title: 'Szögletek', head: ['Több mint', 'Kevesebb mint'], excl: true, rows: [c - 1, c, c + 1].map((x) => ({ label: `${ln(x)} szöglet`, ids: [`CO:${x}:O`, `CO:${x}:U`] })) });
  }
  if (P.card) {
    const k = Math.max(1.5, Math.round(P.card.mh + P.card.ma) - 0.5);
    G.push({ title: 'Lapok', head: ['Több mint', 'Kevesebb mint'], excl: true, rows: [k - 1, k, k + 1].filter((x) => x > 0).map((x) => ({ label: `${ln(x)} lap`, ids: [`KO:${x}:O`, `KO:${x}:U`] })) });
  }
  return G;
}

function TOP_CANDIDATES(P) {
  const ids = ['1X2:H', '1X2:A', 'DC:1X', 'DC:X2', 'DC:12', 'BTTS:Y', 'BTTS:N', 'TS:H:Y', 'TS:A:Y', 'CLS:H:Y', 'CLS:A:Y', 'HTOU:0.5:O', 'HTOU:1.5:U'];
  for (const x of [1.5, 2.5, 3.5]) ids.push(`OU:${x}:O`, `OU:${x}:U`);
  for (const x of [1.5, 2.5]) ids.push(`TT:H:${x}:O`, `TT:A:${x}:O`, `TT:H:${x}:U`, `TT:A:${x}:U`);
  if (P.cor) {
    const c = Math.round(P.cor.mh + P.cor.ma) - 0.5;
    for (const x of [c - 2, c - 1, c + 1, c + 2]) ids.push(`CO:${x}:O`, `CO:${x}:U`);
  }
  if (P.card) {
    const k = Math.max(1.5, Math.round(P.card.mh + P.card.ma) - 0.5);
    for (const x of [k - 1, k + 1]) if (x > 0) ids.push(`KO:${x}:O`, `KO:${x}:U`);
  }
  return ids;
}

function topOutcomes() {
  const { ev, h, a, P } = cur;
  const fam = (id) => {
    const p = id.split(':');
    if (p[0] === 'OU' || p[0] === 'HTOU') return 'goals';
    if (p[0] === 'TT') return 'tt' + p[1];
    if (p[0] === 'CO') return 'co';
    if (p[0] === 'KO') return 'ko';
    if (['1X2', 'DC', 'DNB'].includes(p[0])) return 'res';
    if (p[0] === 'BTTS' || p[0] === 'TS' || p[0] === 'CLS') return 'btts';
    return p[0];
  };
  const list = TOP_CANDIDATES(P)
    .filter((id) => ev[id] && ev[id].push < 0.001)
    .map((id) => ({ id, p: ev[id].p }))
    .filter((x) => x.p >= 0.55 && x.p <= 0.93)
    .sort((x, y) => y.p - x.p);
  const used = new Map();
  const out = [];
  for (const x of list) {
    const f = fam(x.id);
    if ((used.get(f) || 0) >= 2) continue;
    used.set(f, (used.get(f) || 0) + 1);
    out.push(x);
    if (out.length >= 6) break;
  }
  return out.map((x) => ({ ...x, text: plainText(x.id, h, a) }));
}

function renderAnalysis(body) {
  const { l, h, a, L, P, fx, ev } = cur;
  const li = leagueInfo(l);
  const table = leagueTable(L.matches.filter((m) => m.s === L.seasons[0]));
  const rowH = table.find((r) => r.team === h);
  const rowA = table.find((r) => r.team === a);
  const formH = teamMatches(L, h, { last: 5 }).map((x) => x.r);
  const formA = teamMatches(L, a, { last: 5 }).map((x) => x.r);
  const p3 = [ev['1X2:H'].p, ev['1X2:D'].p, ev['1X2:A'].p];
  const mx = Math.max(...p3);
  let best = [0, 0, 0];
  for (let i = 0; i <= P.N; i++) for (let j = 0; j <= P.N; j++) if (P.mat[i][j] > best[2]) best = [i, j, P.mat[i][j]];
  const unknown = !P.rating.h.known || !P.rating.a.known;
  const top = topOutcomes();

  body.innerHTML = `
    <div class="card match-hero">
      <div class="mh-league">
        ${leagueTag(l)}<a href="#/bajnoksag?l=${l}">${esc(li ? li.name : l)}</a>
        ${fx ? `<span>${fmtDate(fx.d, true)} ${esc(fx.t || '')}</span>` : ''}
      </div>
      <div class="mh-teams">
        <div class="mh-team">
          <a class="name" href="#/csapat?l=${encodeURIComponent(l)}&t=${encodeURIComponent(h)}">${esc(h)}</a>
          <div class="meta">${rowH ? `${rowH.pos}. hely, ${rowH.pts} pont` : ''}</div>
          ${formDots(formH)}
        </div>
        <div class="mh-center">
          <div class="mh-score num">${best[0]}<span>-</span>${best[1]}</div>
          <div class="cap">legvalószínűbb eredmény</div>
          <div class="small muted" style="margin-top:6px">várható gólok: ${fmtNum(P.lh, 1)} - ${fmtNum(P.la, 1)}</div>
        </div>
        <div class="mh-team away">
          <a class="name" href="#/csapat?l=${encodeURIComponent(l)}&t=${encodeURIComponent(a)}">${esc(a)}</a>
          <div class="meta">${rowA ? `${rowA.pos}. hely, ${rowA.pts} pont` : ''}</div>
          ${formDots(formA)}
        </div>
      </div>
      <div class="mh-prob">
        ${probBar(p3, true)}
        <div class="mh-p3">
          ${[['Hazai győzelem', p3[0]], ['Döntetlen', p3[1]], ['Vendég győzelem', p3[2]]].map(([t, p]) => `<div class="${p === mx ? 'best' : ''}"><b class="num">${fmtPct(p, 0)}</b><span>${t}</span></div>`).join('')}
        </div>
      </div>
      ${unknown ? `<div class="notice warn" style="margin-top:16px">${icon('info', 16)}<span>${esc(!P.rating.h.known ? h : a)} még nem játszott ebben a bajnokságban, ezért az erejét átlagosnak veszi a számítás.</span></div>` : ''}
    </div>

    ${top.length ? `<div class="card top-card">
      <div class="card-head"><h3>Legvalószínűbb kimenetek</h3></div>
      <div class="top-list">${top.map((x) => `
        <div class="top-row">
          <div class="top-l">${esc(x.text)}</div>
          <div class="meter"><span style="width:${x.p * 100}%"></span></div>
          <b class="top-p num">${fmtPct(x.p, 0)}</b>
        </div>`).join('')}</div>
    </div>` : ''}

    <div class="tabs" id="m-tabs">
      ${[['odds', 'Minden esély'], ['form', 'Forma'], ['h2h', 'Egymás ellen'], ['stats', 'Statisztika']].map(([k, t]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${t}</button>`).join('')}
    </div>
    <div id="m-tab"></div>
  `;
  $('#m-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    $$('#m-tabs button').forEach((x) => x.classList.toggle('active', x === b));
    renderTab();
  });
  renderTab();
}

function renderTab() {
  const el = $('#m-tab');
  if (el) ({ odds: tabOdds, form: tabForm, h2h: tabH2H, stats: tabStats })[tab](el);
}

function tabOdds(el) {
  const { groups, ev, P } = cur;
  const cs = [];
  for (let i = 0; i <= P.N; i++) for (let j = 0; j <= P.N; j++) cs.push([i, j, P.mat[i][j]]);
  cs.sort((x, y) => y[2] - x[2]);
  const groupHtml = (g) => {
    const hasLbl = g.rows.some((r) => r.label);
    const cols = g.head.length;
    return `<div class="card pg">
      <div class="pg-title">${esc(g.title)}</div>
      <div class="pg-grid" style="grid-template-columns:${hasLbl ? 'minmax(70px,auto) ' : ''}repeat(${cols},minmax(0,1fr))">
        ${hasLbl ? '<span></span>' : ''}${g.head.map((x) => `<span class="pg-h">${esc(x)}</span>`).join('')}
        ${g.rows.map((r) => {
          const ps = r.ids.map((id) => (ev[id] ? ev[id].p : null));
          const mx = g.excl ? Math.max(...ps) : -1;
          return (hasLbl ? `<span class="pg-l" title="${esc(r.label)}">${esc(r.label)}</span>` : '') + ps.map((p) => pcell('', p, p === mx)).join('');
        }).join('')}
      </div>
    </div>`;
  };
  el.innerHTML = `<div class="pg-wrap">
    ${groups.map(groupHtml).join('')}
    <div class="card pg">
      <div class="pg-title">Pontos eredmény</div>
      <div class="pg-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        ${cs.slice(0, 6).map(([i, j, p], k) => `<div class="pc ${k === 0 ? 'best' : ''}"><span class="pc-l">${i}-${j}</span><b class="num">${fmtPct(p, 0)}</b></div>`).join('')}
      </div>
    </div>
  </div>`;
}

function formList(L, team, l) {
  const list = teamMatches(L, team, { last: 6 }).reverse();
  if (!list.length) return empty('Nincs lejátszott meccs');
  return `<div class="res-list">${list.map((x) => `
    <a class="rl-row form-row" href="${esc(matchLink(l, x.home ? team : x.opp, x.home ? x.opp : team))}">
      <span class="d muted small">${fmtDate(x.m.d)}</span>
      <span class="muted small">${x.home ? 'otthon' : 'idegenben'}</span>
      <span class="a">${esc(x.opp)}</span>
      <span>${scoreBadge(x.gf, x.ga, x.r)}</span>
    </a>`).join('')}</div>`;
}

function tabForm(el) {
  const { L, h, a, l } = cur;
  el.innerHTML = `<div class="grid-2">
    <div class="card"><div class="card-head"><h3>${esc(h)}</h3></div>${formList(L, h, l)}</div>
    <div class="card"><div class="card-head"><h3>${esc(a)}</h3></div>${formList(L, a, l)}</div>
  </div>`;
}

async function tabH2H(el) {
  const { l, h, a } = cur;
  el.innerHTML = `<div class="card">${loading('Korábbi egymás elleni meccsek...')}</div>`;
  let list;
  try {
    list = (await api.h2h(l, h, a)).matches;
  } catch (e) {
    el.innerHTML = errorBox(e);
    return;
  }
  if (tab !== 'h2h' || !document.body.contains(el)) return;
  if (!list.length) {
    el.innerHTML = `<div class="card">${empty('Nincs korábbi egymás elleni meccs')}</div>`;
    return;
  }
  let wh = 0, d = 0, wa = 0, goals = 0;
  for (const m of list) {
    const gh = m.h === h ? m.hg : m.ag;
    const ga = m.h === h ? m.ag : m.hg;
    if (gh > ga) wh++;
    else if (gh < ga) wa++;
    else d++;
    goals += m.hg + m.ag;
  }
  el.innerHTML = `
    <div class="kpis" style="margin-bottom:16px">
      ${kpi(`${h} nyert`, wh)}
      ${kpi('Döntetlen', d)}
      ${kpi(`${a} nyert`, wa)}
      ${kpi('Gól / meccs', fmtNum(goals / list.length, 1))}
    </div>
    <div class="card"><div class="res-list">${list.slice(0, 10).map((m) => {
      const r = m.hg > m.ag ? 'h' : m.hg < m.ag ? 'a' : '';
      return `<div class="rl-row">
        <span class="d muted small">${fmtDate(m.d, true)}</span>
        <span class="h ${r === 'h' ? 'win' : ''}">${esc(m.h)}</span>
        <span class="vs"><span class="score">${m.hg}-${m.ag}</span></span>
        <span class="a ${r === 'a' ? 'win' : ''}">${esc(m.a)}</span>
        <span class="meta">${leagueTag(m.l)}</span>
      </div>`;
    }).join('')}</div></div>`;
}

function tabStats(el) {
  const { L, h, a } = cur;
  const opt = (venue) => {
    const o = { venue: statVenue === 'venue' ? venue : 'all' };
    if (statScope === 'season') o.season = L.seasons[0];
    if (statScope === 'last5') o.last = 5;
    return o;
  };
  const A = aggregate(teamMatches(L, h, opt('home')));
  const B = aggregate(teamMatches(L, a, opt('away')));
  const f1 = (v) => fmtNum(v, 1), pc = (v) => fmtPct(v, 0);
  const rows = [
    ['Meccsek', A.n, B.n, (v) => v, true],
    ['Pont / meccs', A.ppg, B.ppg, f1, true],
    ['Lőtt gól / meccs', A.gfpm, B.gfpm, f1, true],
    ['Kapott gól / meccs', A.gapm, B.gapm, f1, false],
    ...(L.flags.xg ? [['xG / meccs', A.xgf, B.xgf, f1, true]] : []),
    ...(L.flags.shots ? [['Lövés / meccs', A.sf, B.sf, f1, true]] : []),
    ...(L.flags.corners ? [['Szöglet / meccs', A.cf, B.cf, f1, true]] : []),
    ...(L.flags.cards ? [['Lap / meccs', A.kf, B.kf, f1, false]] : []),
    ['3+ gólos meccsek', A.over[2.5], B.over[2.5], pc, null],
    ['Mindkettő lő', A.btts, B.btts, pc, null],
    ['Kapott gól nélkül', A.cs, B.cs, pc, true],
  ];
  el.innerHTML = `
    <div class="card card-pad">
      <div class="toolbar" style="margin-bottom:14px">
        <div class="seg" id="st-scope">${[['season', 'Idei szezon'], ['last5', 'Utolsó 5']].map(([k, t]) => `<button data-s="${k}" class="${statScope === k ? 'active' : ''}">${t}</button>`).join('')}</div>
        <div class="seg" id="st-venue">${[['venue', 'Otthon / idegenben'], ['all', 'Minden meccs']].map(([k, t]) => `<button data-v="${k}" class="${statVenue === k ? 'active' : ''}">${t}</button>`).join('')}</div>
      </div>
      <div class="cmp-head"><span><span class="dot h"></span>${esc(h)}</span><span></span><span class="r">${esc(a)}<span class="dot a" style="margin:0 0 0 6px"></span></span></div>
      ${rows.map(([label, x, y, fmt, hb]) => cmpRow(label, x, y, { fmt, higherBetter: hb == null ? true : hb })).join('')}
    </div>`;
  $('#st-scope').onclick = (e) => {
    const b = e.target.closest('[data-s]');
    if (b) { statScope = b.dataset.s; tabStats(el); }
  };
  $('#st-venue').onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (b) { statVenue = b.dataset.v; tabStats(el); }
  };
}

function plainText(id, home, away) {
  const p = id.split(':');
  const T = (k) => (k === 'H' ? home : away);
  const atLeast = (x) => Math.round(+x + 0.5);
  const atMost = (x) => Math.round(+x - 0.5);
  switch (p[0]) {
    case '1X2': return p[1] === 'D' ? 'Döntetlen' : `${T(p[1])} nyer`;
    case 'DC': return p[1] === '1X' ? `${home} nem kap ki` : p[1] === 'X2' ? `${away} nem kap ki` : 'Nem lesz döntetlen';
    case 'OU': return p[2] === 'O' ? `Legalább ${atLeast(p[1])} gól lesz` : `Legfeljebb ${atMost(p[1])} gól lesz`;
    case 'TT': return p[3] === 'O' ? `${T(p[1])} legalább ${atLeast(p[2])} gólt lő` : `${T(p[1])} legfeljebb ${atMost(p[2])} gólt lő`;
    case 'BTTS': return p[1] === 'Y' ? 'Mindkét csapat lő gólt' : 'Legalább az egyik csapat nem talál be';
    case 'TS': return `${T(p[1])} lő gólt`;
    case 'CLS': return `${T(p[1])} nem kap gólt`;
    case 'HTOU': return p[2] === 'O' ? `Legalább ${atLeast(p[1])} gól az első félidőben` : `Legfeljebb ${atMost(p[1])} gól az első félidőben`;
    case 'CO': return p[2] === 'O' ? `Legalább ${atLeast(p[1])} szöglet` : `Legfeljebb ${atMost(p[1])} szöglet`;
    case 'KO': return p[2] === 'O' ? `Legalább ${atLeast(p[1])} lap` : `Legfeljebb ${atMost(p[1])} lap`;
    default: return marketText(id, home, away).s;
  }
}
