import { $, $$, esc, icon, fmtDate, store } from '../util.js';
import { state, getLeague, getFixtures, leagueInfo } from '../data.js';
import { teamMatches, aggregate, leagueTable } from '../stats.js';
import { leagueOptions, formDots, loading, errorBox, empty, kpi, scoreBadge, matchLink, leagueTag, pct, num } from '../ui.js';
import { goalsTimeline } from '../charts.js';
import { bindSearch } from '../search.js';

let venue = 'all';
let scope = 'season';

export async function renderTeam(view, params) {
  const l = params.get('l') || '';
  const t = params.get('t') || '';
  if (!l || !t) {
    renderPicker(view, l);
    return;
  }
  view.innerHTML = loading();
  let L;
  try {
    L = await getLeague(l);
  } catch (e) {
    view.innerHTML = errorBox(e);
    return;
  }
  if (!document.body.contains(view)) return;
  const li = leagueInfo(l);
  const season = L.seasons[0];
  const row = leagueTable(L.matches.filter((m) => m.s === season)).find((r) => r.team === t);
  const all = teamMatches(L, t);
  if (!all.length) {
    view.innerHTML = `<div class="card">${empty('Nincs adat erről a csapatról')}</div>`;
    return;
  }
  await getFixtures().catch(() => null);
  const upcoming = (state.fixtures || []).filter((f) => f.l === l && (f.h === t || f.a === t));

  view.innerHTML = `
    <div class="card team-hero">
      <div>
        <h1>${esc(t)}</h1>
        <div class="meta">${leagueTag(l)}<a href="#/bajnoksag?l=${l}">${esc(li ? li.name : l)}</a>${row ? `<span>${row.pos}. hely, ${row.pts} pont</span>` : ''}</div>
      </div>
      <div class="team-hero-r">
        ${formDots(all.slice(-5).map((x) => x.r))}
        <a class="btn sm" href="#/osszevetes?l1=${encodeURIComponent(l)}&t1=${encodeURIComponent(t)}">Összevetés</a>
      </div>
    </div>
    ${upcoming.length ? `<div class="card next-card">
      ${upcoming.slice(0, 3).map((x) => `<a class="next-row" href="${esc(matchLink(x.l, x.h, x.a))}">
        <span class="muted small">${fmtDate(x.d)} ${esc(x.t || '')}</span>
        <b>${esc(x.h)} - ${esc(x.a)}</b>
        <span class="next-go">Esélyek ${icon('chevron', 15)}</span>
      </a>`).join('')}
    </div>` : ''}
    <div class="toolbar" style="margin:16px 0 12px">
      <div class="seg" id="tm-scope">${[['season', 'Idei szezon'], ['last10', 'Utolsó 10']].map(([k, x]) => `<button data-s="${k}" class="${scope === k ? 'active' : ''}">${x}</button>`).join('')}</div>
      <div class="seg" id="tm-venue">${[['all', 'Minden meccs'], ['home', 'Otthon'], ['away', 'Idegenben']].map(([k, x]) => `<button data-v="${k}" class="${venue === k ? 'active' : ''}">${x}</button>`).join('')}</div>
    </div>
    <div id="tm-body"></div>
  `;
  const draw = () => drawBody($('#tm-body'), { l, t, L, season });
  $('#tm-scope').onclick = (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    scope = b.dataset.s;
    $$('#tm-scope button').forEach((x) => x.classList.toggle('active', x === b));
    draw();
  };
  $('#tm-venue').onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    venue = b.dataset.v;
    $$('#tm-venue button').forEach((x) => x.classList.toggle('active', x === b));
    draw();
  };
  draw();
}

function drawBody(el, { l, t, L, season }) {
  const o = { venue };
  if (scope === 'season') o.season = season;
  if (scope === 'last10') o.last = 10;
  const list = teamMatches(L, t, o);
  if (!list.length) {
    el.innerHTML = `<div class="card">${empty('Nincs meccs ezzel a szűréssel')}</div>`;
    return;
  }
  const A = aggregate(list);
  el.innerHTML = `
    <div class="kpis">
      ${kpi('Mérleg', `${A.w}-${A.d}-${A.l}`, 'győzelem-döntetlen-vereség')}
      ${kpi('Gólok', `${A.gf}:${A.ga}`, `${num(A.gfpm, 1)} - ${num(A.gapm, 1)} / meccs`)}
      ${kpi('3+ gólos meccsek', pct(A.over[2.5]))}
      ${kpi('Mindkettő lő', pct(A.btts))}
      ${kpi('Kapott gól nélkül', pct(A.cs))}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3>Gólok meccsenként</h3><div class="legend"><span><i style="background:var(--pos)"></i>győzelem</span><span><i style="background:var(--draw)"></i>döntetlen</span><span><i style="background:var(--neg)"></i>vereség</span></div></div>
      <div class="card-body">${goalsTimeline(list.slice(-30))}</div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3>Mérkőzések</h3></div>
      <div class="res-list">${list.slice().reverse().map((x) => `
        <a class="rl-row form-row" href="${esc(matchLink(l, x.home ? t : x.opp, x.home ? x.opp : t))}">
          <span class="d muted small">${fmtDate(x.m.d)}</span>
          <span class="muted small">${x.home ? 'otthon' : 'idegenben'}</span>
          <span class="a">${esc(x.opp)}</span>
          <span>${scoreBadge(x.gf, x.ga, x.r)}</span>
        </a>`).join('')}</div>
    </div>`;
}

async function renderPicker(view, l) {
  view.innerHTML = `
    <div class="card card-pad picker-card">
      <div class="quickfind">
        ${icon('search', 18)}
        <input class="input" id="tp-q" type="search" placeholder="Csapat neve..." autocomplete="off">
        <div class="qf-results" id="tp-res"></div>
      </div>
      <div class="picker" style="grid-template-columns:minmax(0,320px)">
        <label class="field"><span>Bajnokság</span><select class="select" id="tp-l">${leagueOptions(l || store.get('lastLeague', 'E0'))}</select></label>
      </div>
    </div>
    <div id="tp-list"></div>`;
  bindSearch($('#tp-q'), $('#tp-res'));
  const sel = $('#tp-l');
  const show = async () => {
    const code = sel.value;
    store.set('lastLeague', code);
    const box = $('#tp-list');
    box.innerHTML = loading();
    try {
      const L = await getLeague(code);
      const table = leagueTable(L.matches.filter((m) => m.s === L.seasons[0]));
      const known = new Set(table.map((r) => r.team));
      const rest = L.teams.filter((x) => !known.has(x));
      const href = (x) => `#/csapat?l=${encodeURIComponent(code)}&t=${encodeURIComponent(x)}`;
      box.innerHTML = `<div class="card"><div class="res-list">
        ${table.map((r) => `<a class="rl-row team-row" href="${href(r.team)}"><span class="muted">${r.pos}.</span><span class="a">${esc(r.team)}</span><span class="hide-sm">${formDots(r.form, true)}</span><span class="meta">${r.pts} pont</span></a>`).join('')}
        ${rest.map((x) => `<a class="rl-row team-row" href="${href(x)}"><span></span><span class="a">${esc(x)}</span><span></span><span></span></a>`).join('')}
      </div></div>`;
    } catch (e) {
      box.innerHTML = errorBox(e);
    }
  };
  sel.onchange = show;
  show();
}
