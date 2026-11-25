// Starts RiskLens: loads the data, checks who is logged in, draws the menu
// and shows the screen that matches the address (for example #/sites/S01).
import { RiskLensDB, STORAGE_KEY } from '../src/db.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { RemoteSync } from './remote.js';
import { can } from '../src/auth.js';
import { ROLES } from '../src/catalog.js';
import { h, icon, toast, confirmDialog, download } from './ui.js';
import * as loginView from './views/login.js';
import * as dashboardView from './views/dashboard.js';
import * as sitesView from './views/sites.js';
import * as siteDetailView from './views/site-detail.js';
import * as siteFormView from './views/site-form.js';
import * as inspectionView from './views/inspection-form.js';
import * as reportsView from './views/reports.js';
import * as settingsView from './views/settings.js';
import * as usersView from './views/users.js';
import * as helpView from './views/help.js';
import * as accountView from './views/account.js';

const SESSION_KEY = 'risklens.session';
const IDLE_LIMIT_MS = 30 * 60 * 1000; // log out after 30 minutes without activity
const OVERDUE_CHECK_MS = 60 * 60 * 1000; // the automatic overdue check runs every hour

// Each route: address pattern, screen, and the permission needed (if any).
const ROUTES = [
  [/^\/dashboard$/, dashboardView],
  [/^\/sites$/, sitesView],
  [/^\/sites\/new$/, siteFormView, 'manageSites'],
  [/^\/sites\/([\w-]+)\/edit$/, siteFormView, 'manageSites'],
  [/^\/sites\/([\w-]+)$/, siteDetailView],
  [/^\/inspect$/, inspectionView, 'recordInspection'],
  [/^\/inspect\/([\w-]+)$/, inspectionView, 'recordInspection'],
  [/^\/reports$/, reportsView, 'viewReports'],
  [/^\/settings$/, settingsView, 'adjustWeights'],
  [/^\/users$/, usersView, 'manageUsers'],
  [/^\/help$/, helpView],
  [/^\/account$/, accountView],
];

const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/sites', label: 'Ranked sites', short: 'Sites', icon: 'sites' },
  { path: '/inspect', label: 'Record inspection', short: 'Inspect', icon: 'clipboard', permission: 'recordInspection' },
  { path: '/sites/new', label: 'Register site', short: 'Add site', icon: 'plus', permission: 'manageSites' },
  { path: '/reports', label: 'Reports', icon: 'report', permission: 'viewReports' },
  { path: '/settings', label: 'Scoring settings', icon: 'sliders', permission: 'adjustWeights' },
  { path: '/users', label: 'User accounts', icon: 'users', permission: 'manageUsers' },
  { path: '/help', label: 'User guide', icon: 'help' },
];

// With a Supabase URL and key in js/config.js, RiskLens uses the online
// database; without them it runs on this browser only.
const ONLINE_DB = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);

const app = {
  db: new RiskLensDB(window.localStorage, {
    key: ONLINE_DB ? 'risklens.cache' : STORAGE_KEY,
    onChange: (change) => app.remote?.enqueue(change),
  }),
  remote: null,
  onlineDb: ONLINE_DB,
  user: null,
  lastOverdueCheck: null,
  dirty: false, // true while a form has unsaved typing
  can(action) { return !!this.user && can(this.user.role, action); },
  go(path) {
    if (location.hash === `#${path}`) render();
    else location.hash = path;
  },
  refresh() { render(); },
  setDirty(value) { this.dirty = value; },

  // Account actions go to the online database when there is one.
  async signIn(email, password) {
    if (!this.remote) return this.db.authenticate(email, password);
    const result = await this.remote.signIn(email, password);
    if (result.ok) this.remote.enqueue({ kind: 'activity', row: { at: new Date().toISOString(), userId: result.user.id, userName: result.user.name, action: 'Logged in', detail: '' } });
    return result;
  },
  addUser(input) { return this.remote ? this.remote.addUser(input, this.user) : this.db.addUser(input, this.user); },
  setUserActive(id, active) { return this.remote ? this.remote.setUserActive(id, active, this.user) : this.db.setUserActive(id, active, this.user); },
  changePassword(current, next) { return this.remote ? this.remote.changePassword(this.user, current, next) : this.db.changePassword(this.user, current, next); },
};
window.riskLens = app; // handy for checking things in the browser console

// ---------- session (FR 5.1, NFR 1, NFR 8) ----------

function readSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    if (!s || Date.now() - s.lastActive > IDLE_LIMIT_MS) return null;
    return s;
  } catch {
    return null;
  }
}

function touchSession() {
  if (!app.user) return;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: app.user.id, lastActive: Date.now() })); } catch { /* private mode */ }
}

export function startSession(user) {
  app.user = user;
  touchSession();
  runOverdueCheck();
  if (app.remote) {
    app.remote.start();
    app.remote.sync().then(() => runOverdueCheck());
  }
}

function logout(message) {
  app.user = null;
  app.dirty = false;
  app.lastOverdueCheck = null;
  sessionStorage.removeItem(SESSION_KEY);
  if (app.remote) { app.remote.stop(); app.remote.signOut(); }
  if (message) toast(message, 'info');
  app.go('/login');
}
app.logout = logout;
app.startSession = startSession;

async function restoreSession() {
  const s = readSession();
  if (app.remote) {
    if (!s) { await app.remote.signOut(); app.user = null; return; }
    const user = await app.remote.currentUser();
    app.user = user && user.id === s.userId ? user : null;
    return;
  }
  const user = s && app.db.user(s.userId);
  app.user = user && user.active ? user : null;
}

// ---------- sync status (online database) ----------

function syncLabel(st) {
  if (!st) return null;
  if (st.failed) return { tone: 'error', text: `${st.failed} change(s) refused by the database`, title: 'See Scoring settings → Online database (administrators).' };
  if (!st.online || st.error === 'offline') {
    return { tone: 'offline', text: st.pending ? `Offline · ${st.pending} change(s) waiting` : 'Offline · saved on this device', title: 'Changes are sent automatically when the connection is back.' };
  }
  if (st.syncing || st.pending) return { tone: 'busy', text: 'Syncing…', title: 'Sending changes to the online database.' };
  if (st.error) return { tone: 'error', text: 'Sync problem', title: st.error };
  return { tone: 'ok', text: 'Synced with online database', title: st.lastSync ? `Last synced ${new Date(st.lastSync).toLocaleTimeString()}` : '' };
}

function syncBadge() {
  const el = h('div', { class: 'sync-status', role: 'status', 'aria-live': 'polite' });
  paintSync(el, app.remote?.status);
  return el;
}

function paintSync(el, st) {
  const l = syncLabel(st);
  if (!l) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `sync-status sync-${l.tone}`;
  el.title = l.title;
  el.replaceChildren(h('i', { class: 'sync-dot' }), h('span', {}, l.text));
}

function updateSyncStatus(st) {
  document.querySelectorAll('.sync-status').forEach((el) => paintSync(el, st));
}

// ---------- automatic overdue check (FR 7.1, System Scheduler) ----------

function runOverdueCheck() {
  if (!app.user) return;
  const { at, overdue } = app.db.runOverdueCheck();
  const previous = app.lastOverdueCheck?.overdue.map((s) => s.id) ?? [];
  const newlyOverdue = overdue.filter((s) => !previous.includes(s.id));
  app.lastOverdueCheck = { at, overdue };
  if (previous.length && newlyOverdue.length) {
    toast(`${newlyOverdue.length} more site(s) became overdue for inspection.`, 'info');
  }
}

// ---------- layout ----------

function navItems() {
  return NAV.filter((n) => !n.permission || app.can(n.permission));
}

function isActive(path, current) {
  if (path === '/sites') return current === '/sites' || (/^\/sites\/(?!new)/.test(current));
  if (path === '/inspect') return current.startsWith('/inspect');
  return current === path;
}

function shell(content, current) {
  const role = ROLES[app.user.role];
  const initials = app.user.name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  const sidebar = h('nav', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Main menu' },
    h('a', { class: 'brand', href: '#/dashboard' }, h('span', { class: 'brand-mark' }, icon('shield', 20)), h('span', {}, 'RiskLens')),
    h('ul', { class: 'nav' }, navItems().map((n) =>
      h('li', {}, h('a', { href: `#${n.path}`, class: isActive(n.path, current) ? 'active' : null, 'aria-current': isActive(n.path, current) ? 'page' : null }, icon(n.icon), n.label)))),
    h('div', { class: 'sidebar-foot' },
      app.remote ? syncBadge() : h('div', { class: 'sync-status sync-local', title: 'No online database is set up: data is saved in this browser only.' }, h('i', { class: 'sync-dot' }), h('span', {}, 'Saved in this browser only')),
      h('a', { class: 'me', href: '#/account', title: 'My account' },
        h('span', { class: 'avatar' }, initials),
        h('span', { class: 'me-text' }, h('strong', {}, app.user.name), h('small', {}, role + (app.user.assignedDistrict ? ` · ${app.user.assignedDistrict}` : '')))),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => logout('You have logged out.') }, icon('logout'), 'Log out')));

  const topbar = h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Open menu', 'aria-controls': 'sidebar', onclick: () => document.body.classList.toggle('menu-open') }, icon('menu', 22)),
    h('a', { class: 'brand', href: '#/dashboard' }, h('span', { class: 'brand-mark' }, icon('shield', 18)), 'RiskLens'),
    app.remote ? syncBadge() : null,
    h('a', { class: 'avatar', href: '#/account', 'aria-label': 'My account' }, initials));

  const bottom = h('nav', { class: 'bottom-nav', 'aria-label': 'Quick menu' },
    navItems().slice(0, 4).map((n) =>
      h('a', { href: `#${n.path}`, class: isActive(n.path, current) ? 'active' : null }, icon(n.icon, 20), h('span', {}, n.short ?? n.label))));

  const offline = h('div', { class: 'offline-banner', role: 'status' }, icon('wifiOff', 16),
    app.remote
      ? 'You are offline. Keep working: changes are saved on this device and sent to the online database when you are back online.'
      : 'You are offline. RiskLens keeps working and saves everything on this device.');

  return h('div', { class: 'layout' },
    sidebar,
    h('div', { class: 'scrim', onclick: () => document.body.classList.remove('menu-open') }),
    h('div', { class: 'main-col' }, topbar, offline, h('main', { id: 'main', class: 'content', tabindex: '-1' }, content)),
    bottom);
}

function forbidden() {
  return h('section', { class: 'card narrow center' },
    icon('shield', 32),
    h('h1', {}, 'Not available for your role'),
    h('p', { class: 'muted' }, app.user.role === 'ADMIN'
      ? 'Inspection outcomes are recorded by inspectors (SRS business rule 5.3). Log in with an inspector account to record one.'
      : 'Only administrators can do this. Inspectors can view sites and reports and record inspections.'),
    h('a', { class: 'btn btn-primary', href: '#/dashboard' }, 'Go to the dashboard'));
}

function notFound() {
  return h('section', { class: 'card narrow center' }, h('h1', {}, 'Page not found'), h('p', { class: 'muted' }, 'This address does not match any RiskLens page.'),
    h('a', { class: 'btn btn-primary', href: '#/dashboard' }, 'Go to the dashboard'));
}

// ---------- router ----------

let renderToken = 0;

async function render() {
  const token = ++renderToken;
  const root = document.getElementById('app');
  const [path, queryString = ''] = (location.hash.replace(/^#/, '') || '/dashboard').split('?');
  app.query = new URLSearchParams(queryString);
  document.body.classList.remove('menu-open');

  if (!app.user) {
    if (path !== '/login') { location.replace('#/login'); return; }
    root.replaceChildren(await loginView.render(app));
    document.title = 'Log in · RiskLens';
    return;
  }
  if (path === '/login') { location.replace('#/dashboard'); return; }

  let view = null;
  let params = [];
  let permission = null;
  for (const [pattern, v, perm] of ROUTES) {
    const m = pattern.exec(path);
    if (m) { view = v; params = m.slice(1); permission = perm; break; }
  }

  let content;
  try {
    if (!view) content = notFound();
    else if (permission && !app.can(permission)) content = forbidden();
    else content = await view.render(app, ...params);
  } catch (err) {
    console.error(err);
    content = h('section', { class: 'card narrow center' }, icon('alert', 32), h('h1', {}, 'Something went wrong'),
      h('p', { class: 'muted' }, err.message), h('a', { class: 'btn btn-primary', href: '#/dashboard' }, 'Go to the dashboard'));
  }
  if (token !== renderToken) return; // a newer navigation started while this one was loading
  app.dirty = false;
  root.replaceChildren(shell(content, path));
  const heading = root.querySelector('main h1');
  document.title = `${heading?.textContent ?? 'RiskLens'} · RiskLens`;
  window.scrollTo(0, 0);
  root.querySelector('#main')?.focus({ preventScroll: true });
}

// Ask before leaving a form with unsaved typing.
let lastHash = location.hash;
window.addEventListener('hashchange', async () => {
  if (app.dirty && app.user) {
    const target = location.hash;
    history.replaceState(null, '', lastHash);
    const leave = await confirmDialog({ title: 'Leave without saving?', body: 'What you typed on this form has not been saved yet.', confirmLabel: 'Leave page', danger: true });
    if (!leave) return;
    app.dirty = false;
    location.hash = target;
    return;
  }
  lastHash = location.hash;
  render();
});
window.addEventListener('beforeunload', (e) => { if (app.dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- start-up ----------

function showCorruptDataScreen(err) {
  const raw = localStorage.getItem(STORAGE_KEY) ?? '';
  document.getElementById('app').replaceChildren(
    h('section', { class: 'card narrow center', style: { marginTop: '10vh' } },
      icon('alert', 32),
      h('h1', {}, 'The saved data could not be read'),
      h('p', { class: 'muted' }, `RiskLens found data on this device but it is damaged (${err.message}). Nothing has been deleted.`),
      h('div', { class: 'stack' },
        h('button', { class: 'btn btn-ghost', onclick: () => download('risklens-damaged-data.json', raw, 'application/json') }, icon('download'), 'Download the damaged data'),
        h('button', {
          class: 'btn btn-danger',
          onclick: async () => {
            if (await confirmDialog({ title: 'Start again with demo data?', body: 'Download the damaged data first if you need it. This replaces it on this device.', confirmLabel: 'Start again', danger: true })) {
              await app.db.seedDemo();
              location.reload();
            }
          },
        }, 'Start again with demo data'))));
}

async function start() {
  if (ONLINE_DB) {
    // Online database: start from the copy saved on this device (so it works
    // offline), then download the latest data.
    try { if (!app.db.load()) app.db.useEmpty(); } catch { app.db.useEmpty(); }
    app.remote = new RemoteSync(app.db, {
      url: SUPABASE_URL,
      key: SUPABASE_ANON_KEY,
      onStatus: updateSyncStatus,
      onError: (message) => toast(message, 'error', 10000),
      onData: () => {
        if (!app.user) return;
        const me = app.db.user(app.user.id);
        if (me && !me.active) { logout('Your account was deactivated.'); return; }
        if (me) app.user = me;
        if (app.dirty) toast('New data arrived from the online database. It will show when you leave this form.', 'info');
        else render();
      },
    });
  } else {
    try {
      if (!app.db.load()) await app.db.seedDemo();
    } catch (err) {
      showCorruptDataScreen(err);
      return;
    }
  }
  await restoreSession();
  if (app.user) {
    runOverdueCheck();
    if (app.remote) { app.remote.start(); app.remote.sync().then(() => runOverdueCheck()); }
  }

  ['click', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, touchSession, { passive: true }));
  setInterval(() => {
    if (app.user && !readSession()) logout('You were logged out after 30 minutes without activity.');
  }, 60 * 1000);
  setInterval(() => { runOverdueCheck(); if (!app.dirty && /dashboard|sites$/.test(location.hash)) render(); }, OVERDUE_CHECK_MS);

  // Keep several open tabs in step: when another tab saves, reload the data here.
  window.addEventListener('storage', (e) => {
    if (e.key !== app.db.key || e.newValue === null) return;
    try {
      app.db.load();
      if (app.user) app.user = app.db.user(app.user.id) ?? app.user;
      if (app.user && !app.user.active) { logout('Your account was deactivated.'); return; }
      if (app.dirty) toast('Data was changed in another tab. It will show when you leave this form.', 'info');
      else render();
    } catch { /* the other tab is mid-save; the next event will carry the full data */ }
  });

  const setOnline = () => document.body.classList.toggle('is-offline', !navigator.onLine);
  window.addEventListener('online', () => { setOnline(); toast('Back online.', 'info', 2500); });
  window.addEventListener('offline', setOnline);
  setOnline();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Offline support not available:', err));
  }
  render();
}

start();
