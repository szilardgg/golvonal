import { settings, saveSettings } from './data.js';
import { icon } from './util.js';

const mq = window.matchMedia('(prefers-color-scheme: dark)');

export function isDark() {
  return settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
}

export function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', settings.theme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerHTML = isDark() ? icon('sun') : icon('moon');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark() ? '#0a0c10' : '#ffffff');
}

export function toggleTheme() {
  settings.theme = isDark() ? 'light' : 'dark';
  saveSettings();
  applyTheme();
}

mq.addEventListener && mq.addEventListener('change', applyTheme);
