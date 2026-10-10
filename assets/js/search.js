import { esc, matchScore, fmtDate, icon } from './util.js';
import { getFixtures, getTeamIndex, leagueInfo, state } from './data.js';
import { matchLink } from './ui.js';

const SEP = /\s+(?:-|\u2013|\u2014|vs\.?|v|ellen)\s+|\s*[\u2013\u2014]\s*|\s+-\s*|\s*-\s+/i;

export async function searchAll(q, { limit = 8 } = {}) {
  q = q.trim();
  if (q.length < 2) return { fixtures: [], teams: [], pairs: [] };
  const [fx, teams] = await Promise.all([getFixtures().catch(() => []), getTeamIndex().catch(() => [])]);
  const parts = q.split(SEP).map((s) => s.trim()).filter(Boolean);

  let fixtures = [];
  let pairs = [];
  let teamHits = [];

  if (parts.length >= 2) {
    const [qa, qb] = parts;
    fixtures = fx
      .map((f) => ({ f, s: Math.min(matchScore(f.h, qa), matchScore(f.a, qb)) + 0.5 * Math.min(matchScore(f.a, qa), matchScore(f.h, qb)) }))
      .filter((x) => matchScore(x.f.h, qa) > 0 && matchScore(x.f.a, qb) > 0 || matchScore(x.f.a, qa) > 0 && matchScore(x.f.h, qb) > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, limit)
      .map((x) => x.f);
    const ta = teams.map((t) => ({ ...t, s: matchScore(t.n, qa) })).filter((t) => t.s > 0).sort((x, y) => y.s - x.s).slice(0, 6);
    const tb = teams.map((t) => ({ ...t, s: matchScore(t.n, qb) })).filter((t) => t.s > 0).sort((x, y) => y.s - x.s).slice(0, 6);
    for (const x of ta) for (const y of tb) {
      if (x.l === y.l && x.n !== y.n) pairs.push({ l: x.l, h: x.n, a: y.n, s: x.s + y.s });
    }
    pairs.sort((x, y) => y.s - x.s);
    const seen = new Set(fixtures.map((f) => `${f.l}|${f.h}|${f.a}`));
    pairs = pairs.filter((p) => !seen.has(`${p.l}|${p.h}|${p.a}`)).slice(0, 5);
  } else {
    fixtures = fx
      .map((f) => ({ f, s: Math.max(matchScore(f.h, q), matchScore(f.a, q)) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s || (x.f.d < y.f.d ? -1 : 1))
      .slice(0, limit)
      .map((x) => x.f);
    teamHits = teams
      .map((t) => ({ ...t, s: matchScore(t.n, q) }))
      .filter((t) => t.s > 0)
      .sort((x, y) => y.s - x.s || x.n.localeCompare(y.n))
      .slice(0, limit);
  }
  return { fixtures, teams: teamHits, pairs };
}

export function resultsHtml(r, q) {
  let html = '';
  if (r.fixtures.length) {
    html += `<div class="gs-head">Közelgő mérkőzések</div>`;
    html += r.fixtures
      .map((f) => {
        const li = leagueInfo(f.l);
        return `<a class="gs-item" href="${esc(matchLink(f.l, f.h, f.a))}"><span class="tag">${esc(li ? li.cc : f.l)}</span><span>${esc(f.h)} - ${esc(f.a)}</span><span class="gs-sub">${fmtDate(f.d)} ${esc(f.t || '')}</span></a>`;
      })
      .join('');
  }
  if (r.pairs.length) {
    html += `<div class="gs-head">Párosítás elemzése</div>`;
    html += r.pairs
      .map((p) => {
        const li = leagueInfo(p.l);
        return `<a class="gs-item" href="${esc(matchLink(p.l, p.h, p.a))}"><span class="tag">${esc(li ? li.cc : p.l)}</span><span>${esc(p.h)} - ${esc(p.a)}</span><span class="gs-sub">${esc(li ? li.name : '')}</span></a>`;
      })
      .join('');
  }
  if (r.teams.length) {
    html += `<div class="gs-head">Csapatok</div>`;
    html += r.teams
      .map((t) => {
        const li = leagueInfo(t.l);
        return `<a class="gs-item" href="#/csapat?l=${encodeURIComponent(t.l)}&t=${encodeURIComponent(t.n)}"><span class="tag">${esc(li ? li.cc : t.l)}</span><span>${esc(t.n)}</span><span class="gs-sub">${esc(li ? li.name : '')}</span></a>`;
      })
      .join('');
  }
  if (!html) {
    html = `<div class="gs-item" style="cursor:default;color:var(--text-3)">Nincs találat erre: "${esc(q)}". Párosításhoz írd így: <b style="color:var(--text)">Arsenal - Chelsea</b></div>`;
  }
  return html;
}

export function bindSearch(input, box, { onPick } = {}) {
  let seq = 0;
  let sel = -1;
  const run = async () => {
    const q = input.value;
    const my = ++seq;
    if (q.trim().length < 2) {
      box.classList.remove('open');
      return;
    }
    if (!state.teamIndex) {
      box.innerHTML = `<div class="gs-item" style="cursor:default;color:var(--text-3)"><span class="spinner"></span>Csapatlista betöltése (első alkalommal néhány másodperc)...</div>`;
      box.classList.add('open');
    }
    const r = await searchAll(q);
    if (my !== seq) return;
    box.innerHTML = resultsHtml(r, q);
    box.classList.add('open');
    sel = -1;
  };
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(run, 160);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) run();
    else getTeamIndex().catch(() => {});
  });
  input.addEventListener('keydown', (e) => {
    const items = [...box.querySelectorAll('a.gs-item')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((x, i) => x.classList.toggle('sel', i === sel));
      items[sel].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      const it = items[sel >= 0 ? sel : 0];
      if (it) {
        e.preventDefault();
        location.hash = it.getAttribute('href');
        close();
      }
    } else if (e.key === 'Escape') {
      close();
      input.blur();
    }
  });
  const close = () => {
    box.classList.remove('open');
    onPick && onPick();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('a.gs-item')) {
      close();
      input.value = '';
    }
  });
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target) && e.target !== input) box.classList.remove('open');
  });
  return { close };
}
