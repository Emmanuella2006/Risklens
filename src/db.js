// RiskLens data store. Keeps sites, inspections, users and settings as one
// JSON document in a key-value storage (the browser's localStorage in the
// app, an in-memory object in the tests).
//
// Rules from the SRS that live here:
// - Inspection records are append-only: there is no function to edit or
//   delete one, and each gets a recordedAt timestamp (NFR 4).
// - Every change is saved straight away; if saving fails an error is thrown
//   so the screen can tell the user instead of losing data silently (NFR 5).
// - A new inspection updates the site's score at once (FR 3.2).
import { DEFAULT_WEIGHTS, localToday, validateWeights } from './scoring.js';
import { buildRankedSites, DEFAULT_OVERDUE_DAYS } from './sites.js';
import { validateSite, validateInspection, validateUser, validateOverdueDays, passwordProblem } from './validation.js';
import { hashPassword, randomSalt, verifyPassword, can, PBKDF2_ITERATIONS } from './auth.js';
import { buildSampleData, DEMO_ACCOUNTS } from './sample-data.js';

export const STORAGE_KEY = 'risklens.db';
export const SCHEMA_VERSION = 1;
const MAX_ACTIVITY = 300;

export class ValidationError extends Error {
  constructor(errors) {
    super(Object.values(errors)[0] ?? 'Please check the form.');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class PermissionError extends Error {
  constructor(message = 'Your role is not allowed to do this.') {
    super(message);
    this.name = 'PermissionError';
  }
}

export class StorageError extends Error {
  constructor(cause) {
    super('Could not save to this device. Your change was not saved. Free up browser storage and try again.');
    this.name = 'StorageError';
    this.cause = cause;
  }
}

/** Storage that only lives in memory (used by the tests). */
export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function emptyData() {
  return {
    version: SCHEMA_VERSION,
    sites: [],
    inspections: [],
    users: [],
    settings: { weights: { ...DEFAULT_WEIGHTS }, overdueThresholdDays: DEFAULT_OVERDUE_DAYS, updatedAt: null, updatedBy: null },
    activity: [],
    meta: { lastOverdueCheck: null, nextId: 1 },
  };
}

/** Checks the shape of saved or imported data and throws if it is broken. */
export function checkDataShape(data) {
  if (!data || typeof data !== 'object') throw new Error('The data is not a RiskLens file.');
  if (data.version !== SCHEMA_VERSION) throw new Error(`Unsupported data version: ${data.version}`);
  for (const key of ['sites', 'inspections', 'users', 'activity']) {
    if (!Array.isArray(data[key])) throw new Error(`The data is missing the "${key}" list.`);
  }
  if (!data.settings || validateWeights(data.settings.weights).length) throw new Error('The scoring settings are not valid.');
  if (!data.users.some((u) => u.role === 'ADMIN' && u.active)) throw new Error('The data has no active administrator.');
  for (const s of data.sites) {
    if (!s.id || !s.name || !s.siteType || !s.district) throw new Error('A site in the data is incomplete.');
  }
  for (const i of data.inspections) {
    if (!i.id || !i.siteId || !i.visitDate || !i.outcome || !i.recordedAt) throw new Error('An inspection in the data is incomplete.');
  }
  return data;
}

export class RiskLensDB {
  /**
   * @param storage  where to keep the data (localStorage in the app)
   * @param options.key       storage key (a different one is used for the online database cache)
   * @param options.onChange  called with each saved change, so it can be sent to the online database
   */
  constructor(storage, { now = () => new Date(), key = STORAGE_KEY, onChange = null } = {}) {
    this.storage = storage;
    this.now = now;
    this.key = key;
    this.onChange = onChange;
    this.data = null;
    this.pendingChanges = [];
  }

  /** Starts with no data at all (used before the first download from the online database). */
  useEmpty() {
    this.data = emptyData();
  }

  today() {
    return localToday(this.now());
  }

  /** Loads saved data. Returns false when there is nothing saved yet. Throws if it is corrupt. */
  load() {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return false;
    this.data = checkDataShape(JSON.parse(raw));
    return true;
  }

  save() {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.data));
    } catch (err) {
      throw new StorageError(err);
    }
  }

  /** Replaces everything with the demo data. */
  async seedDemo() {
    const today = this.today();
    const data = emptyData();
    const { sites, inspections } = buildSampleData(today);
    data.sites = sites;
    data.users = await Promise.all(
      DEMO_ACCOUNTS.map(async ({ password, ...u }) => {
        const salt = randomSalt();
        return {
          ...u,
          salt,
          iterations: PBKDF2_ITERATIONS,
          passwordHash: await hashPassword(password, salt),
          active: true,
          createdAt: `${today}T08:00:00.000Z`,
        };
      }),
    );
    // Replay the sample inspections in date order so each one has the
    // score before and after it, like inspections recorded in the app.
    for (const inspection of [...inspections].sort((a, b) => a.visitDate.localeCompare(b.visitDate))) {
      const before = this.#scoreOf({ ...data }, inspection.siteId, today);
      data.inspections.push(inspection);
      inspection.scoreBefore = before;
      inspection.scoreAfter = this.#scoreOf(data, inspection.siteId, today);
    }
    data.meta.nextId = 100;
    data.activity.push({ at: this.now().toISOString(), userId: null, userName: 'System', action: 'Loaded demo data' });
    this.data = data;
    this.save();
  }

  #scoreOf(data, siteId, asOfDate) {
    return buildRankedSites(data, { asOfDate, includeArchived: true }).find((s) => s.id === siteId)?.score ?? null;
  }

  /** A random id, so two devices working offline never create the same one. */
  #newId(prefix) {
    return `${prefix}-${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  #emit(kind, row) {
    this.pendingChanges.push({ kind, row: JSON.parse(JSON.stringify(row)) });
  }

  #log(user, action, detail = '') {
    const entry = { at: this.now().toISOString(), userId: user?.id ?? null, userName: user?.name ?? 'System', action, detail };
    this.data.activity.unshift(entry);
    if (user) this.#emit('activity', entry);
    this.data.activity.length = Math.min(this.data.activity.length, MAX_ACTIVITY);
  }

  /** Runs a change; if saving fails the change is undone and the error is passed on. */
  #commit(change) {
    const backup = JSON.stringify(this.data);
    this.pendingChanges = [];
    try {
      const result = change();
      this.save();
      const changes = this.pendingChanges;
      this.pendingChanges = [];
      if (this.onChange) changes.forEach((c) => this.onChange(c));
      return result;
    } catch (err) {
      this.data = JSON.parse(backup);
      this.pendingChanges = [];
      throw err;
    }
  }

  #require(user, action) {
    if (!user || !can(user.role, action)) throw new PermissionError();
  }

  // ---------- reading ----------

  get sites() { return this.data.sites; }
  get inspections() { return this.data.inspections; }
  get users() { return this.data.users; }
  get settings() { return this.data.settings; }
  get activity() { return this.data.activity; }

  rankedSites(options = {}) {
    return buildRankedSites(this.data, { asOfDate: this.today(), ...options });
  }

  site(id) {
    return this.rankedSites({ includeArchived: true }).find((s) => s.id === id) ?? null;
  }

  user(id) {
    return this.data.users.find((u) => u.id === id) ?? null;
  }

  // ---------- login (FR 5.1) ----------

  async authenticate(email, password) {
    const user = this.data.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
    // Hash even when the email is unknown, so the time taken does not reveal which emails exist.
    const ok = await verifyPassword(password, user ?? { salt: '00'.repeat(16), passwordHash: '' });
    if (!user || !ok) return { ok: false, message: 'Email or password is incorrect.' };
    if (!user.active) return { ok: false, message: 'This account has been deactivated. Contact an administrator.' };
    this.#commit(() => this.#log(user, 'Logged in'));
    return { ok: true, user };
  }

  // ---------- sites (FR 1.1, FR 1.2) ----------

  addSite(input, user) {
    this.#require(user, 'manageSites');
    const clean = cleanSite(input);
    const errors = validateSite(clean, this.data.sites, this.today());
    if (Object.keys(errors).length) throw new ValidationError(errors);
    return this.#commit(() => {
      const at = this.now().toISOString();
      const site = { ...clean, id: this.#newId('S'), archived: false, createdAt: at, createdBy: user.id, updatedAt: at };
      this.data.sites.push(site);
      this.#emit('site', site);
      this.#log(user, 'Registered site', site.name);
      return site;
    });
  }

  updateSite(id, input, user) {
    this.#require(user, 'manageSites');
    const existing = this.data.sites.find((s) => s.id === id);
    if (!existing) throw new Error('Site not found.');
    const merged = { ...existing, ...cleanSite(input), id };
    const errors = validateSite(merged, this.data.sites, this.today());
    if (Object.keys(errors).length) throw new ValidationError(errors);
    return this.#commit(() => {
      Object.assign(existing, merged, { updatedAt: this.now().toISOString() });
      this.#emit('site', existing);
      this.#log(user, 'Edited site', existing.name);
      return existing;
    });
  }

  /** Sites are archived, never deleted, so their inspection history is kept (NFR 4). */
  setSiteArchived(id, archived, user) {
    this.#require(user, 'manageSites');
    const site = this.data.sites.find((s) => s.id === id);
    if (!site) throw new Error('Site not found.');
    return this.#commit(() => {
      site.archived = archived;
      site.updatedAt = this.now().toISOString();
      this.#emit('site', site);
      this.#log(user, archived ? 'Archived site' : 'Restored site', site.name);
      return site;
    });
  }

  // ---------- inspections (FR 2.1, FR 2.2, FR 3.2, NFR 4) ----------

  recordInspection(input, user) {
    this.#require(user, 'recordInspection');
    const site = this.data.sites.find((s) => s.id === input.siteId);
    if (!site) throw new ValidationError({ siteId: 'Choose the site you inspected.' });
    if (site.archived) throw new ValidationError({ siteId: 'This site is archived and cannot be inspected.' });
    const inspection = {
      siteId: input.siteId,
      visitDate: input.visitDate,
      outcome: input.outcome,
      notes: (input.notes ?? '').trim(),
      violations: input.outcome === 'VIOLATION'
        ? (input.violations ?? []).map((v) => ({ category: v.category, severity: v.severity, description: (v.description ?? '').trim() }))
        : [],
    };
    const errors = validateInspection(inspection, this.today());
    if (Object.keys(errors).length) throw new ValidationError(errors);

    return this.#commit(() => {
      const started = globalThis.performance?.now?.() ?? Date.now();
      const before = this.#scoreOf(this.data, site.id, this.today());
      const record = Object.freeze({
        id: this.#newId('I'),
        ...inspection,
        violations: Object.freeze(inspection.violations.map((v) => Object.freeze(v))),
        inspectorId: user.id,
        inspectorName: user.name,
        recordedAt: this.now().toISOString(),
        scoreBefore: before,
        scoreAfter: null,
      });
      this.data.inspections.push(record);
      const after = this.#scoreOf(this.data, site.id, this.today());
      // scoreAfter is filled in once, straight after the record is created.
      this.data.inspections[this.data.inspections.length - 1] = Object.freeze({ ...record, scoreAfter: after });
      const elapsedMs = (globalThis.performance?.now?.() ?? Date.now()) - started;
      this.#emit('inspection', this.data.inspections.at(-1));
      this.#log(user, 'Recorded inspection', `${site.name}: ${inspection.outcome === 'PASS' ? 'Pass' : 'Violation'} (score ${before} → ${after})`);
      return { inspection: this.data.inspections.at(-1), before, after, elapsedMs };
    });
  }

  // ---------- settings (FR 5.2, FR 7.1, business rule 5.3) ----------

  updateSettings({ weights, overdueThresholdDays }, user) {
    this.#require(user, 'adjustWeights');
    const errors = {};
    const weightErrors = validateWeights(weights);
    if (weightErrors.length) errors.weights = weightErrors[0];
    const daysError = validateOverdueDays(overdueThresholdDays);
    if (daysError) errors.overdueThresholdDays = daysError;
    if (Object.keys(errors).length) throw new ValidationError(errors);
    return this.#commit(() => {
      this.data.settings = { weights: { ...weights }, overdueThresholdDays, updatedAt: this.now().toISOString(), updatedBy: user.id };
      this.#emit('settings', this.data.settings);
      const w = weights;
      this.#log(user, 'Changed scoring settings', `Weights ${w.siteType}/${w.violations}/${w.waterDistance}/${w.inspectionAge}, overdue after ${overdueThresholdDays} days`);
      return this.data.settings;
    });
  }

  /** The automatic overdue check (System Scheduler in the use case diagram). */
  runOverdueCheck() {
    const overdue = this.rankedSites().filter((s) => s.overdue);
    const at = this.now().toISOString();
    try {
      this.data.meta.lastOverdueCheck = at;
      this.save();
    } catch {
      // Only the time of the check is lost; nothing the user entered.
    }
    return { at, overdue };
  }

  // ---------- users (Manage User Accounts) ----------

  async addUser(input, admin) {
    this.#require(admin, 'manageUsers');
    const candidate = {
      name: (input.name ?? '').trim(),
      email: (input.email ?? '').trim().toLowerCase(),
      role: input.role,
      assignedDistrict: input.role === 'INSPECTOR' ? input.assignedDistrict || null : null,
      password: input.password ?? '',
    };
    const errors = validateUser(candidate, this.data.users);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const salt = randomSalt();
    const passwordHash = await hashPassword(candidate.password, salt);
    return this.#commit(() => {
      const { password, ...rest } = candidate;
      const user = { ...rest, id: this.#newId('U'), salt, iterations: PBKDF2_ITERATIONS, passwordHash, active: true, createdAt: this.now().toISOString() };
      this.data.users.push(user);
      this.#log(admin, 'Added user', `${user.name} (${user.role === 'ADMIN' ? 'Administrator' : 'Inspector'})`);
      return user;
    });
  }

  setUserActive(id, active, admin) {
    this.#require(admin, 'manageUsers');
    const user = this.user(id);
    if (!user) throw new Error('User not found.');
    if (!active && user.id === admin.id) throw new Error('You cannot deactivate your own account.');
    if (!active && user.role === 'ADMIN' && this.data.users.filter((u) => u.role === 'ADMIN' && u.active).length === 1) {
      throw new Error('There must always be at least one active administrator.');
    }
    return this.#commit(() => {
      user.active = active;
      this.#log(admin, active ? 'Reactivated user' : 'Deactivated user', user.name);
      return user;
    });
  }

  async changePassword(user, currentPassword, newPassword) {
    if (!(await verifyPassword(currentPassword, user))) throw new ValidationError({ currentPassword: 'Your current password is incorrect.' });
    const problem = passwordProblem(newPassword);
    if (problem) throw new ValidationError({ newPassword: problem });
    const salt = randomSalt();
    const passwordHash = await hashPassword(newPassword, salt);
    return this.#commit(() => {
      const stored = this.user(user.id);
      Object.assign(stored, { salt, passwordHash, iterations: PBKDF2_ITERATIONS });
      this.#log(stored, 'Changed password');
      return stored;
    });
  }

  // ---------- backup ----------

  exportBackup(user) {
    this.#require(user, 'manageData');
    return JSON.stringify(this.data, null, 2);
  }

  importBackup(json, user) {
    this.#require(user, 'manageData');
    const incoming = checkDataShape(JSON.parse(json));
    return this.#commit(() => {
      // Inspection records cannot be removed, so a backup missing any of
      // the current ones is refused (NFR 4).
      const incomingIds = new Set(incoming.inspections.map((i) => i.id));
      const missing = this.data.inspections.filter((i) => !incomingIds.has(i.id));
      if (missing.length) {
        throw new Error(`This backup is older than the data on this device: it is missing ${missing.length} inspection record(s), and inspection records can never be deleted.`);
      }
      this.data = incoming;
      this.#log(user, 'Restored a backup');
    });
  }
}

/** Keeps only the site fields the form is allowed to set. */
function cleanSite(input) {
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  return {
    name: String(input.name ?? '').trim().replace(/\s+/g, ' '),
    district: input.district,
    siteType: input.siteType,
    projectScale: input.projectScale,
    distanceToWaterMetres: num(input.distanceToWaterMetres),
    latitude: num(input.latitude),
    longitude: num(input.longitude),
    priorViolations: input.priorViolations === '' || input.priorViolations === undefined ? 0 : Number(input.priorViolations),
    priorInspectionDate: input.priorInspectionDate || null,
  };
}
