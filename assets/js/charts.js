// Egyszerű SVG grafikonok

import { esc, fmtNum, fmtDate } from './util.js';

/** gólok meccsenként: lőtt felfelé, kapott lefelé; xG pontokkal */
export function goalsTimeline(list, { height = 180 } = {}) {
  if (!list.length) return '<div class="empty small">Nincs adat</div>';
  const W = Math.max(320, list.length * 22);
  const H = height;
  const mid = H / 2;
  const maxG = Math.max(3, ...list.map((x) => Math.max(x.gf, x.ga, x.xgf || 0, x.xga || 0)));
  const unit = (mid - 18) / maxG;
  const bw = Math.min(14, (W - 20) / list.length - 4);
  const step = (W - 20) / list.length;
  const col = { W: 'var(--pos)', D: 'var(--draw)', L: 'var(--neg)' };
  let bars = '';
  list.forEach((x, i) => {
    const cx = 10 + step * i + step / 2;
    const up = x.gf * unit, dn = x.ga * unit;
    const title = `${fmtDate(x.m.d, true)} · ${x.home ? 'H' : 'V'} ${x.opp} ${x.gf}–${x.ga}${x.xgf != null ? ` · xG ${fmtNum(x.xgf, 2)}–${fmtNum(x.xga, 2)}` : ''}`;
    bars += `<g><title>${esc(title)}</title>
      <rect x="${cx - bw / 2}" y="${mid - up}" width="${bw}" height="${Math.max(up, 0.0001)}" rx="2" fill="${col[x.r]}" opacity="0.9"/>
      <rect x="${cx - bw / 2}" y="${mid}" width="${bw}" height="${Math.max(dn, 0.0001)}" rx="2" fill="${col[x.r]}" opacity="0.35"/>
      ${x.xgf != null ? `<circle cx="${cx}" cy="${mid - x.xgf * unit}" r="2.6" fill="var(--text)"/><circle cx="${cx}" cy="${mid + x.xga * unit}" r="2.6" fill="none" stroke="var(--text)" stroke-width="1.2"/>` : ''}
    </g>`;
  });
  let grid = '';
  for (let g = 1; g <= maxG; g++) {
    if (maxG > 5 && g % 2) continue;
    grid += `<line x1="0" x2="${W}" y1="${mid - g * unit}" y2="${mid - g * unit}"/><line x1="0" x2="${W}" y1="${mid + g * unit}" y2="${mid + g * unit}"/>`;
  }
  return `<div class="table-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 640)}px;height:${H}px" preserveAspectRatio="none">
    <g class="grid">${grid}</g>
    <line class="axis" x1="0" x2="${W}" y1="${mid}" y2="${mid}"/>
    ${bars}
  </svg></div>`;
}

/** tükrözött összehasonlító sor */
export function cmpRow(label, a, b, { fmt = (v) => fmtNum(v, 2), higherBetter = true, max = null } = {}) {
  const va = a == null ? null : a;
  const vb = b == null ? null : b;
  const m = max != null ? max : Math.max(Math.abs(va || 0), Math.abs(vb || 0)) || 1;
  const wa = va == null ? 0 : (Math.abs(va) / m) * 100;
  const wb = vb == null ? 0 : (Math.abs(vb) / m) * 100;
  let ca = '', cb = '';
  if (va != null && vb != null && va !== vb) {
    const aBetter = higherBetter ? va > vb : va < vb;
    ca = aBetter ? 'better' : 'worse';
    cb = aBetter ? 'worse' : 'better';
  }
  return `<div class="cmp-row">
    <div class="v ${ca}">${va == null ? '–' : fmt(va)}</div>
    <div class="bar l"><span style="width:${wa}%"></span></div>
    <div class="lbl">${esc(label)}</div>
    <div class="bar r"><span style="width:${wb}%"></span></div>
    <div class="v r ${cb}">${vb == null ? '–' : fmt(vb)}</div>
  </div>`;
}
