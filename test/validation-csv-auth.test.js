import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSite, validateInspection, validateUser, passwordProblem } from '../src/validation.js';
import { csvCell, rankedSitesCsv } from '../src/csv.js';
import { hashPassword, verifyPassword, randomSalt, can } from '../src/auth.js';

const TODAY = '2026-11-15';
const good = {
  name: 'Test Site', district: 'Gasabo', siteType: 'construction', projectScale: 'SMALL',
  distanceToWaterMetres: 200, latitude: -1.95, longitude: 30.06, priorViolations: 0, priorInspectionDate: '2026-01-01',
};

test('a complete site passes; bad fields get a message each (FR 1.1)', () => {
  assert.deepEqual(validateSite(good, [], TODAY), {});
  const errors = validateSite({ ...good, name: 'X', district: 'Paris', latitude: 10, priorViolations: -1, priorInspectionDate: '2027-01-01' }, [], TODAY);
  assert.deepEqual(Object.keys(errors).sort(), ['district', 'latitude', 'name', 'priorInspectionDate', 'priorViolations']);
});

test('the same site name cannot be registered twice in one district', () => {
  const existing = [{ ...good, id: 'S1', archived: false }];
  assert.match(validateSite({ ...good, name: ' test site ' }, existing, TODAY).name, /already registered/);
  assert.deepEqual(validateSite({ ...good, id: 'S1' }, existing, TODAY), {}); // editing itself is fine
});

test('a violation needs at least one described violation (FR 2.2)', () => {
  const base = { siteId: 'S1', visitDate: TODAY, outcome: 'VIOLATION', notes: '' };
  assert.ok(validateInspection({ ...base, violations: [] }, TODAY).violations);
  assert.deepEqual(validateInspection({ ...base, violations: [{ category: 'Noise', severity: 'MINOR', description: 'Loud at night' }] }, TODAY), {});
  assert.ok(validateInspection({ ...base, outcome: 'PASS', visitDate: '2027-01-01' }, TODAY).visitDate);
});

test('user accounts need a unique email and a strong enough password', () => {
  const existing = [{ id: 'U1', email: 'a@b.rw' }];
  const errors = validateUser({ name: 'New', email: 'A@b.rw', role: 'INSPECTOR', password: 'short' }, existing);
  assert.ok(errors.email);
  assert.ok(errors.password);
  assert.equal(passwordProblem('longenough1'), null);
});

test('CSV cells are quoted and formulas are neutralised (FR 6.2)', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell(-5), '-5');
  const csv = rankedSitesCsv([{ rank: 1, name: 'A', district: 'Huye', typeLabel: 'Mine', projectScale: 'LARGE', score: 90, priority: 'High', pastViolations: 2, distanceToWaterMetres: null, lastInspectionDate: null, daysSinceInspection: null, overdue: true }]);
  assert.match(csv.split('\r\n')[1], /^1,A,Huye,Mine,Large,90,High,2,Unknown,Never,,Yes$/);
});

test('passwords are stored as salted hashes, never as text (NFR 1)', async () => {
  const salt = randomSalt();
  const hash = await hashPassword('Secret123', salt, 1000);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, await hashPassword('Secret123', randomSalt(), 1000));
  assert.equal(await verifyPassword('Secret123', { salt, passwordHash: hash, iterations: 1000 }), true);
  assert.equal(await verifyPassword('secret123', { salt, passwordHash: hash, iterations: 1000 }), false);
});

test('only administrators manage sites and weights; only inspectors log inspections (FR 5.2)', () => {
  assert.equal(can('ADMIN', 'adjustWeights'), true);
  assert.equal(can('INSPECTOR', 'adjustWeights'), false);
  assert.equal(can('INSPECTOR', 'recordInspection'), true);
  assert.equal(can('ADMIN', 'recordInspection'), false);
  assert.equal(can('INSPECTOR', 'exportCsv'), false);
  assert.equal(can('INSPECTOR', 'viewReports'), true);
});
