import { esc, fmtPct, icon, fmtNum } from './util.js';
import { state, leagueInfo } from './data.js';

export const RES_HU = { W: 'Gy', D: 'D', L: 'V' };

export function formDots(arr, sm = false) {
  return `<span class="form ${sm ? 'sm' : ''}">${arr.map((r) => `<i class="${r}" title="${r === 'W' ? 'Győzelem' : r === 'D' ? 'Döntetlen' : 'Vereség'}">${RES_HU[r]}</i>`).join('')}</span>`;
}

export function leagueTag(code) {
  const l = leagueInfo(code);
  return `<span class="tag" title="${l ? esc(l.country + ' - ' + l.name) : ''}">${esc(l ? l.cc : code)}</span>`;
}

export function leagueOptions(selected) {
  const groups = new Map();
  for (const l of state.leagues) {
    if (!groups.has(l.country)) groups.set(l.country, []);
    groups.get(l.country).push(l);
  }
  let html = '';
  for (const [country, list] of groups) {
    html += `<optgroup label="${esc(country)}">${list.map((l) => `<option value="${l.code}" ${l.code === selected ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>`;
  }
  return html;
}

export function teamOptions(teams, selected, emptyLabel = 'Válassz csapatot') {
  return `<option value="">${esc(emptyLabel)}</option>` + teams.map((t) => `<option ${t === selected ? 'selected' : ''}>${esc(t)}</option>`).join('');
}

export function probBar(p3, lg = false) {
  const [h, d, a] = p3;
  return `<div class="pbar ${lg ? 'lg' : ''}"><span class="h" style="width:${h * 100}%"></span><span class="d" style="width:${d * 100}%"></span><span class="a" style="width:${a * 100}%"></span></div>`;
}

export function pcell(label, p, best = false) {
  if (p == null) return `<div class="pc empty"><span class="pc-l">${esc(label)}</span><b>-</b></div>`;
  return `<div class="pc ${best ? 'best' : ''} ${p < 0.05 ? 'low' : ''}"><span class="pc-l">${esc(label)}</span><b class="num">${fmtPct(p, p < 0.1 ? 1 : 0)}</b></div>`;
}

export function loading(text = 'Betöltés...') {
  return `<div class="loading"><span class="spinner"></span>${esc(text)}</div>`;
}

export function errorBox(err) {
  return `<div class="notice err">${icon('info', 16)}<div><b>Hiba történt.</b> ${esc(err && err.message ? err.message : String(err))}</div></div>`;
}

export function empty(title, text = '') {
  return `<div class="empty"><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}</div>`;
}

export function kpi(k, v, s = '') {
  return `<div class="kpi"><div class="k">${esc(k)}</div><div class="v num">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
}

export function scoreBadge(gf, ga, r) {
  return `<span class="score ${r || ''}">${gf}-${ga}</span>`;
}

export const pct = (v) => (v == null ? '-' : fmtPct(v, 0));
export const num = (v, d = 2) => (v == null ? '-' : fmtNum(v, d));

export function teamLink(code, team, label = null) {
  return `<a href="#/csapat?l=${encodeURIComponent(code)}&t=${encodeURIComponent(team)}">${esc(label || team)}</a>`;
}

export function matchLink(code, h, a) {
  return `#/elemzes?l=${encodeURIComponent(code)}&h=${encodeURIComponent(h)}&a=${encodeURIComponent(a)}`;
}
