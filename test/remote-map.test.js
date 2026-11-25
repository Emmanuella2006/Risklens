import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteToRow, rowToSite, inspectionToPayload, rowToInspection, applyPending, isNetworkError, settingsToRow, rowToSettings } from '../src/remote-map.js';

const site = {
  id: 'S-1', name: 'Test Site', district: 'Huye', siteType: 'quarry', projectScale: 'SMALL', distanceToWaterMetres: 300,
  latitude: -2.5, longitude: 29.7, priorViolations: 1, priorInspectionDate: '2026-01-01', archived: false,
  createdAt: '2026-11-01T00:00:00Z', createdBy: 'u1', updatedAt: '2026-11-01T00:00:00Z',
};

test('sites survive the trip to the database and back unchanged', () => {
  const row = siteToRow(site);
  assert.equal(row.site_type, 'quarry');
  assert.deepEqual(rowToSite({ ...row, distance_to_water_metres: '300', latitude: '-2.5' }), site);
});

test('inspections keep their violations in order', () => {
  const insp = rowToInspection({
    id: 'I-1', site_id: 'S-1', visit_date: '2026-11-20', outcome: 'VIOLATION', notes: '', inspector_id: 'u2', inspector_name: 'Eric',
    recorded_at: 'x', synced_at: 'y', score_before: 50, score_after: 58,
    violations: [{ position: 1, category: 'Noise', severity: 'MINOR', description: 'second' }, { position: 0, category: 'Water pollution', severity: 'CRITICAL', description: 'first' }],
  });
  assert.deepEqual(insp.violations.map((v) => v.description), ['first', 'second']);
  assert.deepEqual(inspectionToPayload(insp).violations[0], { category: 'Water pollution', severity: 'CRITICAL', description: 'first' });
});

test('settings map both ways', () => {
  const s = { weights: { siteType: 2, violations: 1, waterDistance: 3, inspectionAge: 1 }, overdueThresholdDays: 180, updatedAt: 'x', updatedBy: 'u1' };
  assert.deepEqual(rowToSettings(settingsToRow(s)), s);
});

test('changes not yet sent stay visible after downloading fresh data (NFR 5)', () => {
  const data = { sites: [site], inspections: [], activity: [], settings: { weights: {}, overdueThresholdDays: 365 } };
  const outbox = [
    { kind: 'site', row: { ...site, name: 'Renamed offline' } },
    { kind: 'site', row: { ...site, id: 'S-2', name: 'Added offline' } },
    { kind: 'inspection', row: { id: 'I-9', siteId: 'S-1' } },
    { kind: 'settings', row: { weights: { siteType: 3 }, overdueThresholdDays: 90 } },
  ];
  const merged = applyPending(data, outbox);
  assert.deepEqual(merged.sites.map((s) => s.name), ['Renamed offline', 'Added offline']);
  assert.equal(merged.inspections.length, 1);
  assert.equal(merged.settings.overdueThresholdDays, 90);
  assert.equal(data.sites[0].name, 'Test Site'); // original not changed
});

test('network errors are told apart from refusals', () => {
  assert.equal(isNetworkError({ message: 'TypeError: Failed to fetch' }), true);
  assert.equal(isNetworkError({ message: 'new row violates row-level security policy' }), false);
});
