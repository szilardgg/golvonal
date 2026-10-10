import { $, $$, esc, fmtPct, fmtNum, fmtDate, fmtSigned, store } from '../util.js';
import { getFit, getLeague, loadLeague, getFixtures, leagueInfo, api } from '../data.js';
import { leagueTable, leagueSummary, aggregate, teamMatches, calcMatch, evalMarkets } from '../stats.js';
import { leagueOptions, formDots, loading, errorBox, empty, kpi, teamLink, matchLink } from '../ui.js';

let tab = 'table';
let tableMode = 'all';
let statSort = { key: 'gfpm', dir: -1 };
let resTeam = '';

export async function renderLeague(view, params) {
  const l = params.get('l') || store.get('lastLeague', 'E0');
  const reqSeason = params.get('s') || '';
  store.set('lastLeague', l);
  const li = leagueInfo(l);

  view.innerHTML = `
    <div class="page-head">
      <div><h1>${esc(li ? li.name : l)}</h1><p>${esc(li ? li.country : '')}</p></div>
      <div class="actions">
        <select class="select" id="lg-l" aria-label="Bajnokság">${leagueOptions(l)}</select>
        <select class="select" id="lg-s" aria-label="Szezon"><option>${esc(reqSeason || 'Szezon')}</option></select>
      </div>
    </div>
    <div id="lg-body">${loading()}</div>
  `;
  $('#lg-l').addEventListener('change', (e) => (location.hash = `#/bajnoksag?l=${e.target.value}`));

  let L;
  try {
    L = await getLeague(l);
  } catch (e) {
    $('#lg-body').innerHTML = errorBox(e);
    return;
  }
  if (!document.body.contains(view)) return;

  api.seasons(l).then((j) => {
    const sel = $('#lg-s');
    if (!sel) return;
    const curS = reqSeason || L.seasons[0];
    sel.innerHTML = j.seasons.slice(0, 12).map((s) => `<option ${s === curS ? 'selected' : ''}>${esc(s)}</option>`).join('');
    sel.onchange = () => (location.hash = `#/bajnoksag?l=${l}&s=${encodeURIComponent(sel.value)}`);
  }).catch(() => {});

  const season = reqSeason || L.seasons[0];
  let matches;
  let isCurrent = season === L.seasons[0];
  if (L.seasons.includes(season)) {
    matches = L.matches.filter((m) => m.s === season);
  } else {
    try {
      matches = (await loadLeague(l, 1, season)).matches.filter((m) => m.s === season);
    } catch (e) {
      $('#lg-body').innerHTML = errorBox(e);
      return;
    }
    isCurrent = false;
  }
  if (!document.body.contains(view)) return;
  const S = leagueSummary(matches);
  const ctx = { l, L, season, matches, isCurrent };

  const tabs = [['table', 'Tabella'], ['results', 'Eredmények'], ...(isCurrent ? [['fixtures', 'Következő meccsek']] : []), ['stats', 'Statisztika']];
  if (!tabs.some(([k]) => k === tab)) tab = 'table';
  $('#lg-body').innerHTML = `
    ${S ? `<div class="kpis">
      ${kpi('Lejátszott meccs', S.n)}
      ${kpi('Gól / meccs', fmtNum(S.goals, 1))}
      ${kpi('Hazai győzelem', fmtPct(S.home, 0))}
      ${kpi('Döntetlen', fmtPct(S.draw, 0))}
      ${kpi('Vendég győzelem', fmtPct(S.away, 0))}
      ${kpi('3+ gólos meccsek', fmtPct(S.o25, 0))}
      ${kpi('Mindkettő lő', fmtPct(S.btts, 0))}
    </div>` : `<div class="card">${empty('Ebben a szezonban még nincs lejátszott meccs')}</div>`}
    <div class="tabs" id="lg-tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${t}</button>`).join('')}</div>
    <div id="lg-tab"></div>
  `;
  $('#lg-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    $$('#lg-tabs button').forEach((x) => x.classList.toggle('active', x === b));
    renderTab(ctx);
  });
  renderTab(ctx);
}

function renderTab(ctx) {
  const el = $('#lg-tab');
  if (el) ({ table: tabTable, stats: tabStats, results: tabResults, fixtures: tabFixtures })[tab](el, ctx);
}

function tabTable(el, ctx) {
  const { matches, l } = ctx;
  const opts = { all: {}, home: { venue: 'home' }, away: { venue: 'away' }, form: { last: 6 } }[tableMode];
  const rows = leagueTable(matches, opts);
  el.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="seg" id="tb-mode">${[['all', 'Összesített'], ['home', 'Hazai'], ['away', 'Idegenbeli'], ['form', 'Utolsó 6']].map(([k, t]) => `<button data-m="${k}" class="${tableMode === k ? 'active' : ''}">${t}</button>`).join('')}</div>
      </div>
      ${rows.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th class="c">#</th><th class="l">Csapat</th><th>M</th><th>Gy</th><th>D</th><th>V</th><th>Gólok</th><th>GK</th><th>Pont</th><th class="c hide-sm">Forma</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td class="c pos-n">${r.pos}</td>
          <td class="l team">${teamLink(l, r.team)}</td>
          <td>${r.n}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
          <td>${r.gf}:${r.ga}</td>
          <td class="${r.gd > 0 ? 'pos' : r.gd < 0 ? 'neg' : ''}">${fmtSigned(r.gd, 0)}</td>
          <td class="pts">${r.pts}</td>
          <td class="c hide-sm">${formDots(r.form, true)}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : empty('Nincs adat')}
    </div>`;
  $('#tb-mode').onclick = (e) => {
    const b = e.target.closest('[data-m]');
    if (b) {
      tableMode = b.dataset.m;
      tabTable(el, ctx);
    }
  };
}

function tabStats(el, ctx) {
  const { matches, l, L } = ctx;
  const teams = [...new Set(matches.flatMap((m) => [m.h, m.a]))];
  const rows = teams.map((t) => {
    const a = aggregate(teamMatches({ matches }, t));
    return { team: t, n: a.n, gfpm: a.gfpm, gapm: a.gapm, cf: a.cf, kf: a.kf, o25: a.over[2.5], btts: a.btts, cs: a.cs };
  });
  const cols = [
    ['team', 'Csapat'], ['n', 'M'], ['gfpm', 'Lőtt / m'], ['gapm', 'Kapott / m'],
    ...(L.flags.corners ? [['cf', 'Szöglet / m']] : []),
    ...(L.flags.cards ? [['kf', 'Lap / m']] : []),
    ['o25', '3+ gól'], ['btts', 'Mindkettő lő'], ['cs', 'Kapott gól nélkül'],
  ];
  const fmt = (k, v) => (v == null ? '-' : ['o25', 'btts', 'cs'].includes(k) ? fmtPct(v, 0) : k === 'n' ? v : fmtNum(v, k === 'gfpm' || k === 'gapm' ? 2 : 1));
  const draw = () => {
    const { key, dir } = statSort;
    const list = rows.slice().sort((a, b) => (key === 'team' ? dir * a.team.localeCompare(b.team, 'hu') : dir * ((a[key] ?? -1) - (b[key] ?? -1))));
    el.innerHTML = `<div class="card"><div class="table-wrap"><table class="tbl">
      <thead><tr>${cols.map(([k, t]) => `<th class="sortable ${k === 'team' ? 'l' : ''} ${k === key ? 'sorted' : ''}" data-k="${k}">${t}${k === key ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead>
      <tbody>${list.map((r) => `<tr>${cols.map(([k]) => (k === 'team' ? `<td class="l team">${teamLink(l, r.team)}</td>` : `<td>${fmt(k, r[k])}</td>`)).join('')}</tr>`).join('')}</tbody>
    </table></div></div>`;
    $$('th.sortable', el).forEach((th) =>
      th.addEventListener('click', () => {
        const k = th.dataset.k;
        statSort = { key: k, dir: k === statSort.key ? -statSort.dir : k === 'team' ? 1 : -1 };
        draw();
      }),
    );
  };
  draw();
}

function tabResults(el, ctx) {
  const { matches, l } = ctx;
  const teams = [...new Set(matches.flatMap((m) => [m.h, m.a]))].sort((a, b) => a.localeCompare(b, 'hu'));
  const list = matches.filter((m) => !resTeam || m.h === resTeam || m.a === resTeam).slice().reverse().slice(0, 120);
  el.innerHTML = `
    <div class="card">
      <div class="card-head">
        <select class="select" id="rs-team" style="max-width:260px"><option value="">Minden csapat</option>${teams.map((t) => `<option ${t === resTeam ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      </div>
      ${list.length ? `<div class="res-list">${list.map((m) => {
        const r = m.hg > m.ag ? 'h' : m.hg < m.ag ? 'a' : '';
        return `<a class="rl-row" href="${esc(matchLink(l, m.h, m.a))}">
          <span class="d muted small">${fmtDate(m.d)}</span>
          <span class="h ${r === 'h' ? 'win' : ''}">${esc(m.h)}</span>
          <span class="vs"><span class="score">${m.hg}-${m.ag}</span></span>
          <span class="a ${r === 'a' ? 'win' : ''}">${esc(m.a)}</span>
          <span class="meta"></span>
        </a>`;
      }).join('')}</div>` : empty('Nincs eredmény')}
    </div>`;
  $('#rs-team').onchange = (e) => {
    resTeam = e.target.value;
    tabResults(el, ctx);
  };
}

async function tabFixtures(el, ctx) {
  const { l } = ctx;
  el.innerHTML = `<div class="card">${loading()}</div>`;
  let fx, M;
  try {
    fx = (await getFixtures()).filter((f) => f.l === l);
    M = (await getFit(l)).M;
  } catch (e) {
    el.innerHTML = errorBox(e);
    return;
  }
  if (!fx.length) {
    el.innerHTML = `<div class="card">${empty('Nincs ismert következő meccs')}</div>`;
    return;
  }
  el.innerHTML = `<div class="card fx-league">
    <div class="fx-league-head"><span>Következő meccsek</span><div class="fx-cols"><span>1</span><span>X</span><span>2</span><span>3+ gól</span><span>Mindkettő lő</span></div></div>
    ${fx.map((f) => {
      const ev = M ? evalMarkets(calcMatch(M, f.h, f.a, { ref: f.ref }), ['1X2:H', '1X2:D', '1X2:A', 'OU:2.5:O', 'BTTS:Y']) : null;
      const p3 = ev ? [ev['1X2:H'].p, ev['1X2:D'].p, ev['1X2:A'].p] : null;
      const mx = p3 ? Math.max(...p3) : -1;
      const cell = (p, best) => `<span class="fp ${best ? 'best' : ''}">${p == null ? '' : fmtPct(p, 0)}</span>`;
      return `<a class="fx-row" href="${esc(matchLink(f.l, f.h, f.a))}">
        <span class="fx-time num">${fmtDate(f.d)}<br><span class="muted">${esc(f.t || '')}</span></span>
        <span class="fx-teams"><span class="t"><span>${esc(f.h)}</span></span><span class="t"><span>${esc(f.a)}</span></span></span>
        <span class="fx-cells">${ev ? p3.map((p) => cell(p, p === mx)).join('') + cell(ev['OU:2.5:O'].p) + cell(ev['BTTS:Y'].p) : '<span class="muted small fx-na">nincs elég adat</span>'}</span>
      </a>`;
    }).join('')}
  </div>`;
}
