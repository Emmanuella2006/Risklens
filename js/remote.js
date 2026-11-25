// Online database (Supabase) for RiskLens.
//
// How it works:
// - Logging in is checked by Supabase Auth on the server (FR 5.1, NFR 1).
// - Every change is saved on the device first, then put in an "outbox" and
//   sent to the database. If there is no connection, the outbox keeps it
//   and sends it as soon as the device is back online (NFR 5, and the
//   "queue locally and sync" step in the SRS sequence diagram).
// - Every 20 seconds, and when the device comes back online, RiskLens
//   downloads the latest data, so a site added on a laptop appears on a phone.
// - The database itself enforces the roles and the append-only inspection
//   records (see supabase/schema.sql), so the rules hold even outside the app.
import {
  siteToRow, rowToSite, inspectionToPayload, rowToInspection, rowToUser, userToRow,
  settingsToRow, rowToSettings, activityToRow, rowToActivity, applyPending, isNetworkError,
} from '../src/remote-map.js';
import { RiskLensDB, memoryStorage, ValidationError } from '../src/db.js';
import { validateUser, passwordProblem } from '../src/validation.js';

const OUTBOX_KEY = 'risklens.outbox';
const FAILED_KEY = 'risklens.failed';
const PROFILE_KEY = 'risklens.profile';
const SYNC_EVERY_MS = 20 * 1000;

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
};
const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full: the outbox stays in memory */ }
};

function friendly(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (isNetworkError(error)) return 'No internet connection. Check your connection and try again.';
  const m = error.message ?? '';
  if (/invalid login credentials/i.test(m)) return 'Email or password is incorrect.';
  if (/already registered|already exists|duplicate key.*email/i.test(m)) return 'An account with this email already exists.';
  if (/row-level security|permission denied/i.test(m)) return 'Your role is not allowed to do this.';
  if (/append-only/i.test(m)) return 'Inspection records cannot be changed or deleted.';
  if (/email.*not confirmed/i.test(m)) return 'This account has not been confirmed. In Supabase, turn off "Confirm email" (see the README).';
  return m || fallback;
}

export class RemoteSync {
  constructor(db, { url, key, onStatus = () => {}, onData = () => {}, onError = () => {} }) {
    this.url = url;
    this.key = key;
    this.db = db;
    this.onStatus = onStatus;
    this.onData = onData;
    this.onError = onError;
    this.client = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'risklens.auth' },
    });
    this.outbox = readJson(OUTBOX_KEY, []);
    this.failed = readJson(FAILED_KEY, []);
    this.flushing = null;
    this.lastSync = null;
    this.lastError = null;
    this.timer = null;
  }

  /** A second connection that does not touch the logged-in session (used to create accounts). */
  #tempClient() {
    return window.supabase.createClient(this.url, this.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `risklens.temp.${Math.random()}` },
    });
  }

  get status() {
    return {
      online: navigator.onLine,
      pending: this.outbox.length,
      failed: this.failed.length,
      syncing: !!this.flushing,
      lastSync: this.lastSync,
      error: this.lastError,
    };
  }

  #notify() { this.onStatus(this.status); }

  // ---------- login ----------

  /** True when nobody has set up RiskLens on this database yet. */
  async needsSetup() {
    const { data, error } = await this.client.rpc('no_users_yet');
    if (error) return null;
    return data === true;
  }

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password });
    if (error) {
      return { ok: false, message: isNetworkError(error) ? 'You need an internet connection to log in. After logging in, RiskLens also works offline.' : friendly(error) };
    }
    const profile = await this.#loadProfile(data.user.id);
    if (!profile.ok) {
      await this.client.auth.signOut({ scope: 'local' });
      return profile;
    }
    return { ok: true, user: profile.user };
  }

  async #loadProfile(id) {
    const { data, error } = await this.client.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) return { ok: false, message: friendly(error) };
    if (!data) return { ok: false, message: 'This login has no RiskLens account. Ask an administrator to add you.' };
    if (!data.active) return { ok: false, message: 'This account has been deactivated. Contact an administrator.' };
    const user = rowToUser(data);
    writeJson(PROFILE_KEY, user);
    return { ok: true, user };
  }

  /** The logged-in user, if this device still has a valid session (works offline too). */
  async currentUser() {
    const { data } = await this.client.auth.getSession();
    const session = data?.session;
    if (!session) return null;
    const cached = readJson(PROFILE_KEY, null);
    if (cached?.id === session.user.id) {
      if (navigator.onLine) {
        const fresh = await this.#loadProfile(session.user.id);
        if (fresh.ok) return fresh.user;
        if (!/internet/i.test(fresh.message)) return null; // deactivated or removed
      }
      return cached;
    }
    const fresh = await this.#loadProfile(session.user.id);
    return fresh.ok ? fresh.user : null;
  }

  async signOut() {
    localStorage.removeItem(PROFILE_KEY);
    try { await this.client.auth.signOut({ scope: 'local' }); } catch { /* offline: the local session is still cleared */ }
  }

  // ---------- sending changes ----------

  enqueue(change) {
    this.outbox.push({ ...change, queuedAt: new Date().toISOString() });
    writeJson(OUTBOX_KEY, this.outbox);
    this.#notify();
    this.flush();
  }

  async #send(op) {
    switch (op.kind) {
      case 'site':
        return (await this.client.from('sites').upsert(siteToRow(op.row))).error;
      case 'inspection':
        return (await this.client.rpc('record_inspection', { p: inspectionToPayload(op.row) })).error;
      case 'settings':
        return (await this.client.from('settings').update(settingsToRow(op.row)).eq('id', 1)).error;
      case 'activity':
        return (await this.client.from('activity').insert(activityToRow(op.row))).error;
      default:
        return null;
    }
  }

  /** Sends everything in the outbox, oldest first. Stops (and keeps the rest) when offline. */
  flush() {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      this.#notify();
      while (this.outbox.length) {
        if (!navigator.onLine) break;
        const op = this.outbox[0];
        let error;
        try { error = await this.#send(op); } catch (e) { error = e; }
        if (error && isNetworkError(error)) { this.lastError = 'offline'; break; }
        this.outbox.shift();
        if (error) {
          // Refused by the database: keep a copy and tell the user, never drop it silently.
          this.failed.push({ ...op, error: friendly(error), failedAt: new Date().toISOString() });
          writeJson(FAILED_KEY, this.failed);
          this.onError(`A change could not be saved to the online database: ${friendly(error)}`);
        }
        writeJson(OUTBOX_KEY, this.outbox);
      }
      if (!this.outbox.length) this.lastError = null;
    })().finally(() => { this.flushing = null; this.#notify(); });
    return this.flushing;
  }

  // ---------- downloading ----------

  async pull() {
    if (!navigator.onLine) { this.#notify(); return false; }
    const isAdmin = this.db.data?.users?.find((u) => u.id === readJson(PROFILE_KEY, {})?.id)?.role === 'ADMIN'
      || readJson(PROFILE_KEY, {})?.role === 'ADMIN';
    const [profiles, sites, inspections, settings, activity] = await Promise.all([
      this.client.from('profiles').select('*').order('created_at'),
      this.client.from('sites').select('*').order('created_at').limit(5000),
      this.client.from('inspections').select('*, violations(*)').order('recorded_at').limit(10000),
      this.client.from('settings').select('*').eq('id', 1).maybeSingle(),
      isAdmin ? this.client.from('activity').select('*').order('at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    ]);
    const error = [profiles, sites, inspections, settings, activity].map((r) => r.error).find(Boolean);
    if (error) {
      this.lastError = isNetworkError(error) ? 'offline' : friendly(error);
      this.#notify();
      return false;
    }
    const fresh = applyPending({
      ...this.db.data,
      users: profiles.data.map(rowToUser),
      sites: sites.data.map(rowToSite),
      inspections: inspections.data.map(rowToInspection),
      settings: settings.data ? rowToSettings(settings.data) : this.db.data.settings,
      activity: (activity.data ?? []).map(rowToActivity),
    }, this.outbox);
    const before = JSON.stringify([this.db.data.users, this.db.data.sites, this.db.data.inspections, this.db.data.settings]);
    const after = JSON.stringify([fresh.users, fresh.sites, fresh.inspections, fresh.settings]);
    this.db.data = fresh;
    try { this.db.save(); } catch { /* the data is still on screen; the next sync tries again */ }
    this.lastSync = new Date().toISOString();
    this.lastError = this.outbox.length && !navigator.onLine ? 'offline' : null;
    this.#notify();
    if (before !== after) this.onData();
    return true;
  }

  async sync() {
    await this.flush();
    return this.pull();
  }

  start() {
    if (this.timer) return;
    const tick = () => { if (document.visibilityState === 'visible') this.sync(); };
    this.timer = setInterval(tick, SYNC_EVERY_MS);
    window.addEventListener('online', () => this.sync());
    window.addEventListener('offline', () => this.#notify());
    document.addEventListener('visibilitychange', tick);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  // ---------- user accounts (online only) ----------

  #requireOnline() {
    if (!navigator.onLine) throw new Error('You need an internet connection to manage accounts.');
  }

  async addUser(input, admin) {
    this.#requireOnline();
    if (admin.role !== 'ADMIN') throw new Error('Your role is not allowed to do this.');
    const candidate = {
      name: (input.name ?? '').trim(),
      email: (input.email ?? '').trim().toLowerCase(),
      role: input.role,
      assignedDistrict: input.role === 'INSPECTOR' ? input.assignedDistrict || null : null,
      password: input.password ?? '',
    };
    const errors = validateUser(candidate, this.db.data.users);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const temp = this.#tempClient();
    const { data, error } = await temp.auth.signUp({ email: candidate.email, password: candidate.password, options: { data: { name: candidate.name } } });
    if (error) throw new ValidationError(/already/i.test(error.message) ? { email: friendly(error) } : { form: friendly(error) });
    const id = data.user?.id;
    if (!id) throw new Error('Supabase did not create the account. Check that "Confirm email" is turned off (see the README).');
    const { error: profileError } = await this.client.from('profiles').insert(userToRow({ ...candidate, id }));
    if (profileError) throw new Error(friendly(profileError));
    this.enqueue({ kind: 'activity', row: { at: new Date().toISOString(), userId: admin.id, userName: admin.name, action: 'Added user', detail: `${candidate.name} (${candidate.role === 'ADMIN' ? 'Administrator' : 'Inspector'})` } });
    await this.pull();
    return this.db.user(id);
  }

  async setUserActive(id, active, admin) {
    this.#requireOnline();
    const users = this.db.data.users;
    const user = users.find((u) => u.id === id);
    if (!user) throw new Error('User not found.');
    if (!active && id === admin.id) throw new Error('You cannot deactivate your own account.');
    if (!active && user.role === 'ADMIN' && users.filter((u) => u.role === 'ADMIN' && u.active).length === 1) {
      throw new Error('There must always be at least one active administrator.');
    }
    const { error } = await this.client.from('profiles').update({ active }).eq('id', id);
    if (error) throw new Error(friendly(error));
    this.enqueue({ kind: 'activity', row: { at: new Date().toISOString(), userId: admin.id, userName: admin.name, action: active ? 'Reactivated user' : 'Deactivated user', detail: user.name } });
    await this.pull();
    return this.db.user(id);
  }

  async changePassword(user, currentPassword, newPassword) {
    this.#requireOnline();
    const check = await this.#tempClient().auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (check.error) throw new ValidationError({ currentPassword: isNetworkError(check.error) ? friendly(check.error) : 'Your current password is incorrect.' });
    const problem = passwordProblem(newPassword);
    if (problem) throw new ValidationError({ newPassword: problem });
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) throw new ValidationError({ newPassword: friendly(error) });
    this.enqueue({ kind: 'activity', row: { at: new Date().toISOString(), userId: user.id, userName: user.name, action: 'Changed password', detail: '' } });
    return user;
  }

  // ---------- first-time setup ----------

  /**
   * Creates the demo accounts and loads the demo sites and inspections into
   * an empty database. Safe to run again if it stopped half-way.
   * `accounts` is a list like DEMO_ACCOUNTS (the first one must be the administrator).
   */
  async setupDemo(accounts, progress = () => {}) {
    this.#requireOnline();
    const ids = {};
    const clients = {};

    // 1. Administrator: create the account (or log in if it was already created).
    const admin = accounts[0];
    progress(`Creating ${admin.email}…`);
    let res = await this.client.auth.signUp({ email: admin.email, password: admin.password, options: { data: { name: admin.name } } });
    if (res.error && /already/i.test(res.error.message)) res = await this.client.auth.signInWithPassword({ email: admin.email, password: admin.password });
    if (res.error) throw new Error(friendly(res.error));
    if (!res.data.session) {
      res = await this.client.auth.signInWithPassword({ email: admin.email, password: admin.password });
      if (res.error) throw new Error(friendly(res.error));
    }
    ids[admin.id] = res.data.user.id;
    await this.#insertProfile({ ...admin, id: ids[admin.id] });

    // 2. Inspectors: each one gets its own connection, so the admin stays logged in.
    for (const acc of accounts.slice(1)) {
      progress(`Creating ${acc.email}…`);
      const temp = this.#tempClient();
      let r = await temp.auth.signUp({ email: acc.email, password: acc.password, options: { data: { name: acc.name } } });
      if (r.error && /already/i.test(r.error.message)) r = await temp.auth.signInWithPassword({ email: acc.email, password: acc.password });
      if (r.error) throw new Error(`${acc.email}: ${friendly(r.error)}`);
      if (!r.data.session) {
        r = await temp.auth.signInWithPassword({ email: acc.email, password: acc.password });
        if (r.error) throw new Error(`${acc.email}: ${friendly(r.error)}`);
      }
      ids[acc.id] = r.data.user.id;
      clients[acc.id] = temp;
      await this.#insertProfile({ ...acc, id: ids[acc.id] });
    }

    // 3. Build the demo data the same way as the offline version, then upload it.
    progress('Adding the demo sites…');
    const local = new RiskLensDB(memoryStorage());
    await local.seedDemo();
    const sites = local.sites.map((s) => ({ ...s, createdBy: ids[s.createdBy] ?? ids[admin.id] }));
    const { error: siteError } = await this.client.from('sites').upsert(sites.map(siteToRow));
    if (siteError) throw new Error(friendly(siteError));

    progress('Adding the demo inspections…');
    const ordered = [...local.inspections].sort((a, b) => a.visitDate.localeCompare(b.visitDate));
    for (const insp of ordered) {
      const client = clients[insp.inspectorId];
      if (!client) continue;
      const { error } = await client.rpc('record_inspection', { p: inspectionToPayload(insp) });
      if (error) throw new Error(friendly(error));
    }

    await this.client.from('activity').insert(activityToRow({ at: new Date().toISOString(), userId: ids[admin.id], userName: admin.name, action: 'Set up RiskLens with demo data', detail: '' }));
    await Promise.all(Object.values(clients).map((c) => c.auth.signOut({ scope: 'local' }).catch(() => {})));
    progress('Done.');
    const profile = await this.#loadProfile(ids[admin.id]);
    return profile.user;
  }

  async #insertProfile(acc) {
    const { error } = await this.client.from('profiles').insert(userToRow({ ...acc, active: true }));
    if (error && error.code !== '23505') throw new Error(`${acc.email}: ${friendly(error)}`); // 23505 = already there
  }
}
