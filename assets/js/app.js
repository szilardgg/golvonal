import { $, $$ } from './util.js';
import { init, STATIC } from './data.js';
import { applyTheme, toggleTheme } from './theme.js';
import { bindSearch } from './search.js';
import { errorBox } from './ui.js';
import { renderFixtures } from './views/fixtures.js';
import { renderMatch } from './views/match.js';
import { renderLeague } from './views/league.js';
import { renderTeam } from './views/team.js';
import { renderCompare } from './views/compare.js';

const routes = {
  meccsek: [renderFixtures, 'Meccsek'],
  elemzes: [renderMatch, 'Elemzés'],
  bajnoksag: [renderLeague, 'Bajnokságok'],
  csapat: [renderTeam, 'Csapatok'],
  osszevetes: [renderCompare, 'Összevetés'],
};

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const name = path.split('/')[0] || 'meccsek';
  return { name: routes[name] ? name : 'meccsek', params: new URLSearchParams(query || '') };
}

let lastName = null;
async function route() {
  const { name, params } = parseHash();
  const [render, title] = routes[name];
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  document.title = `${title} | Gólvonal`;
  const view = document.createElement('main');
  view.id = 'view';
  view.className = 'view';
  view.tabIndex = -1;
  $('#view').replaceWith(view);
  if (lastName !== name) window.scrollTo({ top: 0 });
  lastName = name;
  try {
    await render(view, params);
  } catch (e) {
    console.error(e);
    view.innerHTML = errorBox(e);
  }
}

async function start() {
  applyTheme();
  $('#theme-btn').addEventListener('click', toggleTheme);
  try {
    await init();
  } catch (e) {
    $('#view').innerHTML = `<div class="card card-pad">${errorBox(e)}${STATIC ? '' : '<p class="muted" style="margin:12px 0 0">Helyi futtatáshoz PHP kell: indítsd a <b>start.bat</b> fájllal.</p>'}</div>`;
    return;
  }
  bindSearch($('#gsearch-input'), $('#gsearch-results'));
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      $('#gsearch-input').focus();
    }
  });
  window.addEventListener('hashchange', route);
  route();
}

start();
