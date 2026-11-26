// ATL - main application logic (UI + state). Data access lives in db.js.
import * as db from './db.js';
import { STR } from './i18n.js';
import { fmt, isOverdue } from './dates.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  tasks: [], projects: [],
  prefs: { id: 'prefs', theme: 'auto', lang: 'fa', cal: 'jalali' },
  view: 'dashboard',
  f: { q: '', project: '', status: '' },
  installPrompt: null
};

const t = (k) => (STR[S.prefs.lang] && STR[S.prefs.lang][k]) || k;
const nf = (n) => new Intl.NumberFormat(S.prefs.lang === 'fa' ? 'fa-IR' : 'en').format(n);
const D = (v, time) => fmt(v, S.prefs.cal, S.prefs.lang, time);
const PRIORITIES = ['low', 'med', 'high'];
const STATUSES = ['todo', 'doing', 'done', 'cancelled'];

/* ---------- helpers ---------- */
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function applyPrefs() {
  const root = document.documentElement;
  root.lang = S.prefs.lang;
  root.dir = S.prefs.lang === 'fa' ? 'rtl' : 'ltr';
  root.dataset.theme = S.prefs.theme;
}

// Flattened project tree: [{ p, depth }]
function flat(parent = null, depth = 0) {
  return S.projects
    .filter((p) => (p.parentId || null) === parent)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((p) => [{ p, depth }, ...flat(p.id, depth + 1)]);
}
function descendantIds(id) {
  const out = [id];
  S.projects.filter((p) => p.parentId === id).forEach((c) => out.push(...descendantIds(c.id)));
  return out;
}
const projectName = (id) => (S.projects.find((p) => p.id === id) || {}).name || '';
const projectOptions = (selected, excludeIds = [], emptyLabel) =>
  `<option value="">${esc(emptyLabel)}</option>` +
  flat().filter(({ p }) => !excludeIds.includes(p.id))
    .map(({ p, depth }) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${'\u2014 '.repeat(depth)}${esc(p.name)}</option>`).join('');
const options = (list, prefix, selected) =>
  list.map((k) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(t(prefix + k))}</option>`).join('');

/* ---------- data ---------- */
async function load() {
  [S.tasks, S.projects] = await Promise.all([db.getAll('tasks'), db.getAll('projects')]);
  const saved = (await db.getAll('settings')).find((x) => x.id === 'prefs');
  if (saved) S.prefs = { ...S.prefs, ...saved };
}
async function savePrefs() { await db.put('settings', S.prefs); }

async function saveTask(form, id) {
  const v = Object.fromEntries(new FormData(form));
  const title = (v.title || '').trim();
  if (!title) { toast(t('required')); return false; }
  const est = v.est === '' ? null : Math.max(0, Math.round(Number(v.est)));
  const x = id ? S.tasks.find((a) => a.id === id)
    : { id: db.uid(), createdAt: Date.now(), originalEstMin: null, history: [], sessions: [] };
  // Original estimate is preserved forever; later changes are logged in history.
  if (x.originalEstMin == null && est != null) x.originalEstMin = est;
  else if (id && x.estMin !== est) x.history.push({ at: Date.now(), field: 'estMin', from: x.estMin, to: est });
  Object.assign(x, {
    title, notes: v.notes || '', priority: v.priority, status: v.status,
    projectId: v.project || null, start: v.start || null, deadline: v.deadline || null,
    estMin: est, updatedAt: Date.now()
  });
  x.completedAt = x.status === 'done' ? (x.completedAt || Date.now()) : null;
  await db.put('tasks', x);
  return true;
}

async function saveProject(form, id) {
  const v = Object.fromEntries(new FormData(form));
  const name = (v.name || '').trim();
  if (!name) { toast(t('required')); return false; }
  const x = id ? S.projects.find((a) => a.id === id) : { id: db.uid(), createdAt: Date.now() };
  Object.assign(x, { name, parentId: v.parent || null, notes: v.notes || '' });
  await db.put('projects', x);
  return true;
}

async function deleteProject(id) {
  const p = S.projects.find((a) => a.id === id);
  for (const c of S.projects.filter((c) => c.parentId === id)) { c.parentId = p.parentId || null; await db.put('projects', c); }
  for (const x of S.tasks.filter((x) => x.projectId === id)) { x.projectId = null; await db.put('tasks', x); }
  await db.remove('projects', id);
}

/* ---------- views ---------- */
function taskRow(x) {
  const late = isOverdue(x);
  const meta = [
    x.projectId ? `<span class="chip">${esc(projectName(x.projectId))}</span>` : '',
    `<span class="chip pr-${x.priority}">${esc(t('p_' + x.priority))}</span>`,
    x.deadline ? `<span class="chip ${late ? 'late' : ''}">${esc(D(x.deadline, true))}</span>` : '',
    x.estMin != null ? `<span class="chip">${nf(x.estMin)} ${esc(t('min'))}</span>` : ''
  ].join('');
  return `<li class="task ${x.status}">
    <button class="check" data-act="toggle" data-id="${x.id}" aria-label="${esc(t('s_done'))}">${x.status === 'done' ? '\u2713' : ''}</button>
    <div class="body" data-act="edit-task" data-id="${x.id}" tabindex="0">
      <div class="ttl">${esc(x.title)}</div><div class="meta">${meta}</div>
    </div></li>`;
}

function filteredTasks() {
  const q = S.f.q.trim().toLowerCase();
  const ids = S.f.project ? descendantIds(S.f.project) : null;
  return S.tasks
    .filter((x) => (!q || (x.title + ' ' + (x.notes || '')).toLowerCase().includes(q))
      && (!ids || ids.includes(x.projectId)) && (!S.f.status || x.status === S.f.status))
    .sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.deadline || '9').localeCompare(b.deadline || '9'));
}
const listHtml = () => {
  const items = filteredTasks();
  return items.length ? `<ul class="list">${items.map(taskRow).join('')}</ul>` : `<p class="empty">${esc(t('no_tasks'))}</p>`;
};

const views = {
  dashboard() {
    const open = S.tasks.filter((x) => !['done', 'cancelled'].includes(x.status));
    const late = open.filter((x) => isOverdue(x));
    const upcoming = open.filter((x) => x.deadline && !isOverdue(x)).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5);
    const stat = (n, label, cls = '') => `<div class="stat ${cls}"><b>${nf(n)}</b><span>${esc(label)}</span></div>`;
    const block = (title, arr) => `<section><h2>${esc(title)}</h2>${arr.length ? `<ul class="list">${arr.map(taskRow).join('')}</ul>` : `<p class="empty">${esc(t('nothing'))}</p>`}</section>`;
    return `<header class="top"><h1>${esc(t('nav_dashboard'))}</h1><button class="btn primary" data-act="new-task">+ ${esc(t('new_task'))}</button></header>
      <div class="stats">${stat(open.length, t('pending'))}${stat(late.length, t('overdue'), late.length ? 'warn' : '')}${stat(S.tasks.filter((x) => x.status === 'done').length, t('done'))}${stat(S.tasks.length, t('total'))}</div>
      ${block(t('late_list'), late)}${block(t('upcoming'), upcoming)}`;
  },
  tasks() {
    return `<header class="top"><h1>${esc(t('nav_tasks'))}</h1><button class="btn primary" data-act="new-task">+ ${esc(t('new_task'))}</button></header>
      <div class="filters">
        <input type="search" data-filter="q" value="${esc(S.f.q)}" placeholder="${esc(t('search'))}">
        <select data-filter="project">${projectOptions(S.f.project, [], t('all'))}</select>
        <select data-filter="status"><option value="">${esc(t('all'))}</option>${options(STATUSES, 's_', S.f.status)}</select>
      </div><div id="list">${listHtml()}</div>`;
  },
  projects() {
    const rows = flat().map(({ p, depth }) => {
      const ids = descendantIds(p.id);
      const all = S.tasks.filter((x) => ids.includes(x.projectId) && x.status !== 'cancelled');
      const pct = all.length ? Math.round((all.filter((x) => x.status === 'done').length / all.length) * 100) : 0;
      return `<li class="proj" style="--d:${depth}">
        <div class="body" data-act="edit-project" data-id="${p.id}" tabindex="0"><div class="ttl">${esc(p.name)}</div>
        <div class="bar"><i style="width:${pct}%"></i></div><div class="meta"><span class="chip">${nf(pct)}%</span><span class="chip">${nf(all.length)}</span></div></div>
        <button class="btn" data-act="new-sub" data-id="${p.id}">+ ${esc(t('new_sub'))}</button></li>`;
    }).join('');
    return `<header class="top"><h1>${esc(t('nav_projects'))}</h1><button class="btn primary" data-act="new-project">+ ${esc(t('new_project'))}</button></header>
      ${rows ? `<ul class="list">${rows}</ul>` : `<p class="empty">${esc(t('no_projects'))}</p>`}`;
  },
  settings() {
    const sel = (key, vals, prefix) => `<select data-pref="${key}">${vals.map(([v, l]) => `<option value="${v}" ${S.prefs[key] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `<header class="top"><h1>${esc(t('nav_settings'))}</h1></header>
      <div class="panel">
        <label>${esc(t('theme'))}${sel('theme', [['auto', t('theme_auto')], ['light', t('theme_light')], ['dark', t('theme_dark')]])}</label>
        <label>${esc(t('language'))}${sel('lang', [['fa', 'Persian'], ['en', 'English']])}</label>
        <label>${esc(t('calendar'))}${sel('cal', [['jalali', t('cal_jalali')], ['gregorian', t('cal_greg')]])}</label>
      </div>
      <div class="panel"><h2>${esc(t('backup'))}</h2><p class="hint">${esc(t('backup_hint'))}</p>
        <div class="row"><button class="btn primary" data-act="export">${esc(t('export'))}</button>
        <label class="btn">${esc(t('import'))}<input type="file" id="importFile" accept="application/json,.json" hidden></label></div>
        <p class="hint">${esc(t('storage'))}: <b id="persistState">...</b></p></div>
      <div class="panel"><h2>${esc(t('install'))}</h2><p class="hint">${esc(t('install_hint'))}</p>
        ${S.installPrompt ? `<button class="btn primary" data-act="install">${esc(t('install'))}</button>` : ''}</div>`;
  }
};

function render() {
  applyPrefs();
  const nav = [['dashboard', '\u25D0'], ['tasks', '\u2713'], ['projects', '\u25A4'], ['settings', '\u2699']];
  $('#app').innerHTML = `<nav class="nav"><div class="brand"><img src="icons/icon.svg" alt=""><span>ATL</span></div>
    ${nav.map(([v, i]) => `<button data-act="nav" data-v="${v}" class="${S.view === v ? 'on' : ''}"><span class="ico">${i}</span><span>${esc(t('nav_' + v))}</span></button>`).join('')}</nav>
    <main>${views[S.view]()}</main>`;
  if (S.view === 'settings' && navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => { const el = $('#persistState'); if (el) el.textContent = p ? t('storage_yes') : t('storage_no'); });
  }
}
async function refresh() { await load(); render(); }

/* ---------- dialogs ---------- */
function openDialog(html, onSubmit, danger) {
  const dlg = $('#dlg'), form = $('#dlgForm');
  form.innerHTML = html + `<div class="actions">${danger ? `<button type="button" class="btn danger" id="dlgDel">${esc(t('delete'))}</button>` : ''}<span class="grow"></span>
    <button type="button" class="btn" id="dlgCancel">${esc(t('cancel'))}</button><button class="btn primary">${esc(t('save'))}</button></div>`;
  form.onsubmit = async (e) => {
    e.preventDefault();
    try { if (await onSubmit(form)) { dlg.close(); await refresh(); toast(t('saved')); } } catch (err) { toast(t('error') + ' ' + err.message); }
  };
  $('#dlgCancel').onclick = () => dlg.close();
  if (danger) $('#dlgDel').onclick = async () => { if (confirm(danger.msg)) { await danger.run(); dlg.close(); await refresh(); toast(t('deleted')); } };
  const pv = (name) => { const el = form.elements[name], out = form.querySelector(`[data-pv="${name}"]`); if (el && out) out.textContent = D(el.value, true); };
  form.oninput = () => { pv('start'); pv('deadline'); };
  pv('start'); pv('deadline');
  dlg.showModal();
}

function taskDialog(id) {
  const x = id ? S.tasks.find((a) => a.id === id) : { priority: 'med', status: 'todo', projectId: S.f.project || null };
  const dt = (name, label) => `<label>${esc(label)}<input type="datetime-local" name="${name}" value="${esc(x[name] || '')}"><small data-pv="${name}"></small></label>`;
  openDialog(`<h2>${esc(t(id ? 'edit_task' : 'new_task'))}</h2>
    <label>${esc(t('title'))}<input name="title" value="${esc(x.title || '')}" required maxlength="200"></label>
    <div class="grid2"><label>${esc(t('priority'))}<select name="priority">${options(PRIORITIES, 'p_', x.priority)}</select></label>
    <label>${esc(t('status'))}<select name="status">${options(STATUSES, 's_', x.status)}</select></label></div>
    <label>${esc(t('project'))}<select name="project">${projectOptions(x.projectId, [], t('none'))}</select></label>
    <div class="grid2">${dt('start', t('start'))}${dt('deadline', t('deadline'))}</div>
    <label>${esc(t('estimate'))}<input type="number" name="est" min="0" step="1" value="${x.estMin ?? ''}"></label>
    ${x.originalEstMin != null && x.originalEstMin !== x.estMin ? `<small>${esc(t('orig_est'))}: ${nf(x.originalEstMin)} ${esc(t('min'))}</small>` : ''}
    <label>${esc(t('notes'))}<textarea name="notes" rows="4">${esc(x.notes || '')}</textarea></label>`,
  (f) => saveTask(f, id),
  id ? { msg: t('confirm_task'), run: () => db.remove('tasks', id) } : null);
}

function projectDialog(id, parentId = null) {
  const x = id ? S.projects.find((a) => a.id === id) : { parentId };
  openDialog(`<h2>${esc(t(id ? 'edit_project' : 'new_project'))}</h2>
    <label>${esc(t('name'))}<input name="name" value="${esc(x.name || '')}" required maxlength="120"></label>
    <label>${esc(t('parent'))}<select name="parent">${projectOptions(x.parentId, id ? descendantIds(id) : [], t('root'))}</select></label>
    <label>${esc(t('notes'))}<textarea name="notes" rows="3">${esc(x.notes || '')}</textarea></label>`,
  (f) => saveProject(f, id),
  id ? { msg: t('confirm_project'), run: () => deleteProject(id) } : null);
}

/* ---------- backup / restore ---------- */
function exportData() {
  const data = { app: 'ATL', version: 1, exportedAt: new Date().toISOString(), tasks: S.tasks, projects: S.projects, settings: [S.prefs] };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `atl-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    const ok = data && data.app === 'ATL' && Array.isArray(data.tasks) && Array.isArray(data.projects)
      && data.tasks.every((x) => x && typeof x.id === 'string' && typeof x.title === 'string')
      && data.projects.every((x) => x && typeof x.id === 'string' && typeof x.name === 'string');
    if (!ok) throw new Error('invalid');
    if (!confirm(t('import_confirm'))) return;
    const settings = Array.isArray(data.settings) ? data.settings.filter((s) => s && s.id === 'prefs') : [];
    await db.replaceAll({ tasks: data.tasks, projects: data.projects, settings });
    await refresh();
    toast(t('import_ok'));
  } catch (e) { toast(t('import_bad')); }
}

/* ---------- events ---------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id, v } = el.dataset;
  try {
    if (act === 'nav') { S.view = v; render(); }
    else if (act === 'new-task') taskDialog();
    else if (act === 'edit-task') taskDialog(id);
    else if (act === 'new-project') projectDialog();
    else if (act === 'edit-project') projectDialog(id);
    else if (act === 'new-sub') projectDialog(null, id);
    else if (act === 'export') exportData();
    else if (act === 'install' && S.installPrompt) { S.installPrompt.prompt(); S.installPrompt = null; render(); }
    else if (act === 'toggle') {
      const x = S.tasks.find((a) => a.id === id);
      x.status = x.status === 'done' ? 'todo' : 'done';
      x.completedAt = x.status === 'done' ? Date.now() : null;
      await db.put('tasks', x); await refresh();
    }
  } catch (err) { toast(t('error') + ' ' + err.message); }
});

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.body[data-act]')) { e.preventDefault(); e.target.click(); }
});

document.addEventListener('input', (e) => {
  const key = e.target.dataset.filter;
  if (key === 'q') { S.f.q = e.target.value; $('#list').innerHTML = listHtml(); }
});
document.addEventListener('change', async (e) => {
  const { filter, pref } = e.target.dataset;
  if (filter && filter !== 'q') { S.f[filter] = e.target.value; $('#list').innerHTML = listHtml(); }
  if (pref) { S.prefs[pref] = e.target.value; await savePrefs(); render(); }
  if (e.target.id === 'importFile' && e.target.files[0]) { await importData(e.target.files[0]); e.target.value = ''; }
});

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installPrompt = e; if (S.view === 'settings') render(); });
window.addEventListener('unhandledrejection', (e) => toast(t('error') + ' ' + (e.reason && e.reason.message || e.reason)));

/* ---------- start ---------- */
(async function init() {
  try {
    await load();
    render();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  } catch (err) {
    document.body.textContent = 'ATL failed to start: ' + err.message;
  }
})();
