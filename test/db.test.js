import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RiskLensDB, memoryStorage, PermissionError, ValidationError, StorageError, STORAGE_KEY } from '../src/db.js';

const NOW = new Date('2026-11-15T09:00:00');
async function freshDb(storage = memoryStorage()) {
  const db = new RiskLensDB(storage, { now: () => NOW });
  await db.seedDemo();
  return db;
}
const admin = (db) => db.users.find((u) => u.role === 'ADMIN');
const inspector = (db) => db.users.find((u) => u.role === 'INSPECTOR');

test('demo data loads and is saved; passwords are not stored as text', async () => {
  const storage = memoryStorage();
  const db = await freshDb(storage);
  assert.ok(db.sites.length >= 10);
  const raw = storage.getItem(STORAGE_KEY);
  assert.ok(!raw.includes('Admin#2026'));
  const again = new RiskLensDB(storage, { now: () => NOW });
  assert.equal(again.load(), true);
  assert.equal(again.sites.length, db.sites.length);
});

test('login works with the right password only, and not for deactivated users (FR 5.1)', async () => {
  const db = await freshDb();
  assert.equal((await db.authenticate('admin@risklens.rw', 'Admin#2026')).ok, true);
  assert.equal((await db.authenticate('ADMIN@risklens.rw ', 'Admin#2026')).ok, true);
  assert.equal((await db.authenticate('admin@risklens.rw', 'wrong')).ok, false);
  assert.equal((await db.authenticate('nobody@risklens.rw', 'Admin#2026')).ok, false);
  db.setUserActive(inspector(db).id, false, admin(db));
  assert.match((await db.authenticate('inspector@risklens.rw', 'Inspect#2026')).message, /deactivated/);
});

test('recording an inspection appends a timestamped record and re-scores the site (FR 2.1, 3.2, NFR 4)', async () => {
  const db = await freshDb();
  const count = db.inspections.length;
  const result = db.recordInspection({
    siteId: 'S01', visitDate: '2026-11-15', outcome: 'VIOLATION', notes: 'Spill',
    violations: [{ category: 'Water pollution', severity: 'CRITICAL', description: 'Effluent entering the river' }],
  }, inspector(db));
  assert.equal(db.inspections.length, count + 1);
  assert.ok(result.inspection.recordedAt);
  assert.equal(result.inspection.scoreBefore, result.before);
  assert.equal(db.site('S01').score, result.after);
  assert.ok(result.elapsedMs < 2000);
  assert.throws(() => { result.inspection.outcome = 'PASS'; }, TypeError); // records cannot be edited
  assert.equal(typeof db.deleteInspection, 'undefined');
});

test('roles are enforced by the data layer too (FR 5.2)', async () => {
  const db = await freshDb();
  const insp = { siteId: 'S01', visitDate: '2026-11-15', outcome: 'PASS' };
  assert.throws(() => db.recordInspection(insp, admin(db)), PermissionError);
  assert.throws(() => db.addSite({ name: 'X site' }, inspector(db)), PermissionError);
  assert.throws(() => db.updateSettings({ weights: { siteType: 1, violations: 1, waterDistance: 1, inspectionAge: 1 }, overdueThresholdDays: 365 }, inspector(db)), PermissionError);
});

test('admins register and edit sites; invalid input is refused (FR 1.1, 1.2)', async () => {
  const db = await freshDb();
  const site = db.addSite({ name: 'New Quarry', district: 'Huye', siteType: 'quarry', projectScale: 'SMALL', distanceToWaterMetres: '300', latitude: '', longitude: '', priorViolations: '0', priorInspectionDate: '' }, admin(db));
  assert.equal(db.site(site.id).rank > 0, true);
  db.updateSite(site.id, { ...site, distanceToWaterMetres: 20 }, admin(db));
  assert.equal(db.site(site.id).points.waterDistance, 3);
  assert.throws(() => db.addSite({ name: 'New Quarry', district: 'Huye', siteType: 'quarry', projectScale: 'SMALL', priorViolations: 0 }, admin(db)), ValidationError);
  db.setSiteArchived(site.id, true, admin(db));
  assert.equal(db.rankedSites().some((s) => s.id === site.id), false);
});

test('changing weights re-ranks the sites (FR 5.2)', async () => {
  const db = await freshDb();
  const before = db.rankedSites().map((s) => s.id).join();
  db.updateSettings({ weights: { siteType: 0, violations: 0, waterDistance: 3, inspectionAge: 0 }, overdueThresholdDays: 180 }, admin(db));
  assert.notEqual(db.rankedSites().map((s) => s.id).join(), before);
  assert.throws(() => db.updateSettings({ weights: { siteType: 0, violations: 0, waterDistance: 0, inspectionAge: 0 }, overdueThresholdDays: 180 }, admin(db)), ValidationError);
});

test('a failed save is reported and nothing is half-saved (NFR 5)', async () => {
  const storage = memoryStorage();
  const db = await freshDb(storage);
  const count = db.inspections.length;
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => db.recordInspection({ siteId: 'S01', visitDate: '2026-11-15', outcome: 'PASS' }, inspector(db)), StorageError);
  assert.equal(db.inspections.length, count);
});

test('the last active administrator cannot be deactivated', async () => {
  const db = await freshDb();
  assert.throws(() => db.setUserActive(admin(db).id, false, admin(db)), /own account/);
});

test('a backup missing inspection records is refused (NFR 4)', async () => {
  const db = await freshDb();
  const backup = db.exportBackup(admin(db));
  db.recordInspection({ siteId: 'S03', visitDate: '2026-11-15', outcome: 'PASS' }, inspector(db));
  assert.throws(() => db.importBackup(backup, admin(db)), /never be deleted/);
});

test('every saved change is reported, so it can be sent to the online database', async () => {
  const changes = [];
  const db = await freshDb();
  db.onChange = (c) => changes.push(c);
  db.recordInspection({ siteId: 'S02', visitDate: '2026-11-15', outcome: 'PASS' }, inspector(db));
  assert.deepEqual(changes.map((c) => c.kind), ['inspection', 'activity']);
  assert.match(changes[0].row.id, /^I-[0-9a-f]{12}$/);
  const storage = memoryStorage();
  const failing = await freshDb(storage);
  const seen = [];
  failing.onChange = (c) => seen.push(c);
  storage.setItem = () => { throw new Error('full'); };
  assert.throws(() => failing.recordInspection({ siteId: 'S02', visitDate: '2026-11-15', outcome: 'PASS' }, inspector(failing)));
  assert.equal(seen.length, 0); // nothing is sent when the device could not save it
});
