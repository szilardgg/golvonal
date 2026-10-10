import { $, $$, esc, fmtDay, fmtPct, store, addDays, matchScore } from '../util.js';
import { state, getFixtures, getFit, pool, leagueInfo } from '../data.js';
import { calcMatch, evalMarkets, leagueTable } from '../stats.js';
import { leagueTag, loading, errorBox, empty, matchLink } from '../ui.js';

const F = Object.assign({ day: 'all', leagues: [], allLeagues: false }, store.get('fxFilter', {}));
let q = '';

export async function renderFixtures(view) {
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Közelgő mérkőzések</h1>
        <p id="fx-sub">Kattints egy meccsre a részletes esélyekért.</p>
      </div>
    </div>
    <div class="card fx-filters">
      <div class="toolbar">
        <div class="seg" id="fx-day">
          ${[['all', 'Mind'], ['today', 'Ma'], ['tomorrow', 'Holnap'], ['3', '3 nap'], ['7', '7 nap']].map(([k, t]) => `<button data-day="${k}" class="${F.day === k ? 'active' : ''}">${t}</button>`).join('')}
        </div>
        <input class="input grow" id="fx-q" type="search" placeholder="Csapat szűrése...">
      </div>
      <div class="fx-leagues" id="fx-leagues"></div>
    </div>
    <div id="fx-list">${loading('Mérkőzések betöltése...')}</div>
  `;

  $('#fx-day').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    F.day = b.dataset.day;
    $$('#fx-day button').forEach((x) => x.classList.toggle('active', x === b));
    save();
    renderList();
  });
  $('#fx-q').addEventListener('input', (e) => {
    q = e.target.value;
    renderList();
  });

  let fx;
  try {
    fx = await getFixtures();
  } catch (e) {
    $('#fx-list').innerHTML = errorBox(e);
    return;
  }
  if (!document.body.contains(view)) return;
  renderChips(fx);
  renderList();
  compute(fx, view);
}

function save() {
  store.set('fxFilter', { day: F.day, leagues: F.leagues, allLeagues: F.allLeagues });
}

function renderChips(fx) {
  const counts = new Map();
  for (const f of fx) counts.set(f.l, (counts.get(f.l) || 0) + 1);
  const order = state.leagues.map((l) => l.code).filter((c) => counts.has(c));
  const top = order.filter((c) => leagueInfo(c).tier === 1 && leagueInfo(c).type === 'main');
  const shown = F.allLeagues ? order : [...new Set([...top, ...F.leagues.filter((c) => counts.has(c))])];
  const el = $('#fx-leagues');
  el.innerHTML =
    `<button class="chip ${F.leagues.length ? '' : 'active'}" data-lg="">Összes</button>` +
    shown.map((c) => {
      const l = leagueInfo(c);
      return `<button class="chip ${F.leagues.includes(c) ? 'active' : ''}" data-lg="${c}" title="${esc(l.country + ' - ' + l.name)}"><b class="cc">${esc(l.cc)}</b>${esc(l.name)}</button>`;
    }).join('') +
    (order.length > shown.length || F.allLeagues ? `<button class="chip ghost" data-more>${F.allLeagues ? 'Kevesebb' : `+ ${order.length - shown.length} bajnokság`}</button>` : '');
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-more')) {
      F.allLeagues = !F.allLeagues;
    } else {
      const c = b.dataset.lg;
      if (!c) F.leagues = [];
      else F.leagues = F.leagues.includes(c) ? F.leagues.filter((x) => x !== c) : [...F.leagues, c];
      renderList();
    }
    save();
    renderChips(fx);
  };
}

function dayRange() {
  const t = state.today;
  switch (F.day) {
    case 'today': return [t, t];
    case 'tomorrow': return [addDays(t, 1), addDays(t, 1)];
    case '3': return [t, addDays(t, 2)];
    case '7': return [t, addDays(t, 6)];
    default: return [null, null];
  }
}

function renderList() {
  const el = $('#fx-list');
  if (!el || !state.fixtures) return;
  const [d0, d1] = dayRange();
  let list = state.fixtures.filter((f) => (!F.leagues.length || F.leagues.includes(f.l)) && (!d0 || (f.d >= d0 && f.d <= d1)));
  if (q.trim()) list = list.filter((f) => matchScore(f.h, q) > 0 || matchScore(f.a, q) > 0);
  const sub = $('#fx-sub');
  if (sub) sub.textContent = list.length ? `${list.length} mérkőzés. Kattints egy meccsre a részletes esélyekért.` : 'Nincs mérkőzés.';
  if (!list.length) {
    el.innerHTML = `<div class="card">${empty('Nincs a szűrésnek megfelelő mérkőzés', 'Próbálj másik napot vagy bajnokságot.')}</div>`;
    return;
  }
  const byDay = new Map();
  for (const f of list) {
    if (!byDay.has(f.d)) byDay.set(f.d, new Map());
    const m = byDay.get(f.d);
    if (!m.has(f.l)) m.set(f.l, []);
    m.get(f.l).push(f);
  }
  const order = new Map(state.leagues.map((l, i) => [l.code, i]));
  let html = '';
  for (const [d, lg] of byDay) {
    html += `<section class="fx-day"><h2 class="fx-day-head">${fmtDay(d, state.today)}</h2>`;
    for (const [code, arr] of [...lg.entries()].sort((a, b) => order.get(a[0]) - order.get(b[0]))) {
      const l = leagueInfo(code);
      html += `<div class="card fx-league">
        <div class="fx-league-head">
          ${leagueTag(code)}<a href="#/bajnoksag?l=${code}">${esc(l.name)}</a>
          <div class="fx-cols"><span>1</span><span>X</span><span>2</span><span title="Legalább 3 gól a meccsen">3+ gól</span><span title="Mindkét csapat szerez gólt">Mindkettő lő</span></div>
        </div>
        ${arr.map(rowHtml).join('')}
      </div>`;
    }
    html += `</section>`;
  }
  el.innerHTML = html;
}

function rowHtml(f) {
  const pr = f.pr;
  const i = state.fixtures.indexOf(f);
  const cell = (p, best) => `<span class="fp ${best ? 'best' : ''}">${p == null ? '' : fmtPct(p, 0)}</span>`;
  let cells;
  if (pr) {
    const mx = Math.max(...pr.p3);
    cells = pr.p3.map((p) => cell(p, p === mx)).join('') + cell(pr.pO, false) + cell(pr.pB, false);
  } else if (f.err) {
    cells = `<span class="muted small fx-na">nincs elég adat</span>`;
  } else {
    cells = Array(5).fill('<span class="fp"><span class="skel" style="width:28px;height:10px"></span></span>').join('');
  }
  return `<a class="fx-row" data-i="${i}" href="${esc(matchLink(f.l, f.h, f.a))}">
    <span class="fx-time num">${esc(f.t || '')}</span>
    <span class="fx-teams">
      <span class="t"><span>${esc(f.h)}</span>${pr && pr.posH ? `<small>${pr.posH}.</small>` : ''}</span>
      <span class="t"><span>${esc(f.a)}</span>${pr && pr.posA ? `<small>${pr.posA}.</small>` : ''}</span>
    </span>
    <span class="fx-cells">${cells}</span>
  </a>`;
}

async function compute(fx, view) {
  const codes = [...new Set(fx.filter((f) => !f.pr && !f.err).map((f) => f.l))];
  codes.sort((a, b) => (F.leagues.includes(b) ? 1 : 0) - (F.leagues.includes(a) ? 1 : 0));
  await pool(codes, 4, async (code) => {
    try {
      const { L, M } = await getFit(code);
      const pos = new Map(leagueTable(L.matches.filter((m) => m.s === L.seasons[0])).map((r) => [r.team, r.pos]));
      for (const f of fx) {
        if (f.l !== code) continue;
        if (!M) {
          f.err = true;
          continue;
        }
        const ev = evalMarkets(calcMatch(M, f.h, f.a, { ref: f.ref }), ['1X2:H', '1X2:D', '1X2:A', 'OU:2.5:O', 'BTTS:Y']);
        f.pr = {
          p3: [ev['1X2:H'].p, ev['1X2:D'].p, ev['1X2:A'].p],
          pO: ev['OU:2.5:O'].p,
          pB: ev['BTTS:Y'].p,
          posH: pos.get(f.h),
          posA: pos.get(f.a),
        };
      }
    } catch {
      for (const f of fx) if (f.l === code) f.err = true;
    }
    if (!document.body.contains(view)) return;
    for (const row of $$('.fx-row', view)) {
      const f = state.fixtures[+row.dataset.i];
      if (f && f.l === code) row.outerHTML = rowHtml(f);
    }
  });
}
