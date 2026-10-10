// Két csapat összevetése (akár különböző bajnokságból)

import { $, esc, icon, fmtPct, fmtNum, store } from '../util.js';
import { getModel, getLeague } from '../data.js';
import { teamMatches, aggregate, predict, evalMarkets } from '../model.js';
import { leagueOptions, teamOptions, formDots, loading, errorBox, empty, probBar, matchLink } from '../ui.js';
import { cmpRow } from '../charts.js';

let scope = 'season';
let venue = 'all';

export async function renderCompare(view, params) {
  const l1 = params.get('l1') || store.get('lastLeague', 'E0');
  const t1 = params.get('t1') || '';
  const l2 = params.get('l2') || l1;
  const t2 = params.get('t2') || '';

  view.innerHTML = `
    <div class="card card-pad picker-card">
      <div class="grid-2">
        <div class="cmp-pick">
          <label class="field"><span><span class="dot h"></span>Bajnokság</span><select class="select" id="c-l1">${leagueOptions(l1)}</select></label>
          <label class="field"><span>Csapat</span><select class="select" id="c-t1"><option>Betöltés…</option></select></label>
        </div>
        <div class="cmp-pick">
          <label class="field"><span><span class="dot a"></span>Bajnokság</span><select class="select" id="c-l2">${leagueOptions(l2)}</select></label>
          <label class="field"><span>Csapat</span><select class="select" id="c-t2"><option>Betöltés…</option></select></label>
        </div>
      </div>
    </div>
    <div id="c-body"></div>`;

  const go = () => {
    const q = new URLSearchParams({ l1: $('#c-l1').value, t1: $('#c-t1').value, l2: $('#c-l2').value, t2: $('#c-t2').value });
    location.hash = '#/osszevetes?' + q.toString();
  };
  const fill = async (lSel, tSel, val) => {
    try {
      tSel.innerHTML = teamOptions((await getLeague(lSel.value)).teams, val);
    } catch {
      tSel.innerHTML = '<option value="">Hiba</option>';
    }
  };
  await Promise.all([fill($('#c-l1'), $('#c-t1'), t1), fill($('#c-l2'), $('#c-t2'), t2)]);
  $('#c-l1').onchange = () => { $('#c-t1').value = ''; go(); };
  $('#c-l2').onchange = () => { $('#c-t2').value = ''; go(); };
  $('#c-t1').onchange = go;
  $('#c-t2').onchange = go;

  const body = $('#c-body');
  if (!t1 || !t2) {
    body.innerHTML = `<div class="card">${empty('Válassz két csapatot')}</div>`;
    return;
  }
  body.innerHTML = loading();
  let A, B;
  try {
    [A, B] = await Promise.all([getModel(l1), getModel(l2)]);
  } catch (e) {
    body.innerHTML = errorBox(e);
    return;
  }
  drawBody(body, { l1, t1, l2, t2, A, B });
}

function drawBody(body, ctx) {
  const { l1, t1, l2, t2, A, B } = ctx;
  const opt = (L) => {
    const o = { venue };
    if (scope === 'season') o.season = L.seasons[0];
    if (scope === 'last5') o.last = 5;
    return o;
  };
  const la = teamMatches(A.L, t1, opt(A.L));
  const lb = teamMatches(B.L, t2, opt(B.L));
  const X = aggregate(la), Y = aggregate(lb);
  const f1 = (v) => fmtNum(v, 1), pc = (v) => fmtPct(v, 0);
  const both = (k) => A.L.flags[k] && B.L.flags[k];
  const rows = [
    ['Meccsek', X.n, Y.n, (v) => v, true],
    ['Pont / meccs', X.ppg, Y.ppg, f1, true],
    ['Lőtt gól / meccs', X.gfpm, Y.gfpm, f1, true],
    ['Kapott gól / meccs', X.gapm, Y.gapm, f1, false],
    ...(both('shots') ? [['Lövés / meccs', X.sf, Y.sf, f1, true]] : []),
    ...(both('corners') ? [['Szöglet / meccs', X.cf, Y.cf, f1, true]] : []),
    ...(both('cards') ? [['Lap / meccs', X.kf, Y.kf, f1, false]] : []),
    ['3+ gólos meccsek', X.over[2.5], Y.over[2.5], pc, null],
    ['Mindkettő lő', X.btts, Y.btts, pc, null],
    ['Kapott gól nélkül', X.cs, Y.cs, pc, true],
  ];
  let pred = '';
  if (l1 === l2 && A.M) {
    const box = (h, a) => {
      const ev = evalMarkets(predict(A.M, h, a), ['1X2:H', '1X2:D', '1X2:A']);
      const p3 = [ev['1X2:H'].p, ev['1X2:D'].p, ev['1X2:A'].p];
      return `<a class="card card-pad cmp-pred" href="${esc(matchLink(l1, h, a))}">
        <div class="cmp-pred-t"><b>${esc(h)} – ${esc(a)}</b>${icon('chevron', 16)}</div>
        ${probBar(p3)}
        <div class="plabels"><span>1 <b>${fmtPct(p3[0], 0)}</b></span><span>X <b>${fmtPct(p3[1], 0)}</b></span><span>2 <b>${fmtPct(p3[2], 0)}</b></span></div>
      </a>`;
    };
    pred = `<div class="grid-2" style="margin-bottom:16px">${box(t1, t2)}${box(t2, t1)}</div>`;
  }
  body.innerHTML = `
    ${pred}
    <div class="card card-pad">
      <div class="toolbar" style="margin-bottom:14px">
        <div class="seg" id="c-scope">${[['season', 'Idei szezon'], ['last5', 'Utolsó 5']].map(([k, t]) => `<button data-s="${k}" class="${scope === k ? 'active' : ''}">${t}</button>`).join('')}</div>
        <div class="seg" id="c-venue">${[['all', 'Minden meccs'], ['home', 'Otthon'], ['away', 'Idegenben']].map(([k, t]) => `<button data-v="${k}" class="${venue === k ? 'active' : ''}">${t}</button>`).join('')}</div>
      </div>
      <div class="cmp-head">
        <span><span class="dot h"></span><a href="#/csapat?l=${encodeURIComponent(l1)}&t=${encodeURIComponent(t1)}">${esc(t1)}</a></span>
        <span></span>
        <span class="r"><a href="#/csapat?l=${encodeURIComponent(l2)}&t=${encodeURIComponent(t2)}">${esc(t2)}</a><span class="dot a" style="margin:0 0 0 6px"></span></span>
      </div>
      <div class="cmp-head" style="margin-bottom:4px"><span>${formDots(la.slice(-5).map((x) => x.r), true)}</span><span></span><span class="r">${formDots(lb.slice(-5).map((x) => x.r), true)}</span></div>
      ${rows.map(([label, x, y, fmt, hb]) => cmpRow(label, x, y, { fmt, higherBetter: hb == null ? true : hb })).join('')}
    </div>`;
  $('#c-scope').onclick = (e) => {
    const b = e.target.closest('[data-s]');
    if (b) { scope = b.dataset.s; drawBody(body, ctx); }
  };
  $('#c-venue').onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (b) { venue = b.dataset.v; drawBody(body, ctx); }
  };
}
