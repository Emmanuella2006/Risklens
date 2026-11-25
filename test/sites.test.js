import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRankedSites, deriveFacts, filterSites, isOverdue, summarise } from '../src/sites.js';
import { DEFAULT_WEIGHTS } from '../src/scoring.js';

const TODAY = '2026-11-15';
const site = (id, extra = {}) => ({
  id, name: id, district: 'Gasabo', siteType: 'construction', projectScale: 'MEDIUM',
  distanceToWaterMetres: 1000, priorViolations: 0, priorInspectionDate: null, archived: false, ...extra,
});
const db = (sites, inspections = [], overdueThresholdDays = 365) => ({
  sites, inspections, settings: { weights: DEFAULT_WEIGHTS, overdueThresholdDays },
});

test('violations logged in inspections are added to past violations (FR 3.2)', () => {
  const facts = deriveFacts(site('A', { priorViolations: 1, priorInspectionDate: '2025-01-01' }), [
    { siteId: 'A', visitDate: '2026-10-01', outcome: 'VIOLATION', violations: [{}, {}] },
    { siteId: 'A', visitDate: '2026-11-01', outcome: 'PASS', violations: [] },
  ]);
  assert.equal(facts.pastViolations, 3);
  assert.equal(facts.lastInspectionDate, '2026-11-01');
});

test('a new inspection changes the score straight away (FR 3.2)', () => {
  const sites = [site('A', { priorInspectionDate: '2024-01-01' })];
  const before = buildRankedSites(db(sites), { asOfDate: TODAY })[0].score;
  const after = buildRankedSites(db(sites, [
    { siteId: 'A', visitDate: TODAY, outcome: 'PASS', violations: [] },
  ]), { asOfDate: TODAY })[0].score;
  assert.ok(after < before, `expected ${after} < ${before}`);
});

test('overdue: never inspected, or older than the configurable window (FR 7.1)', () => {
  assert.equal(isOverdue(null, 365, TODAY), true);
  assert.equal(isOverdue('2026-01-01', 365, TODAY), false);
  assert.equal(isOverdue('2026-01-01', 180, TODAY), true);
  const ranked = buildRankedSites(db([site('A', { priorInspectionDate: '2026-05-01' })], [], 90), { asOfDate: TODAY });
  assert.equal(ranked[0].overdue, true);
});

test('archived sites are left out of the ranking', () => {
  const ranked = buildRankedSites(db([site('A'), site('B', { archived: true })]), { asOfDate: TODAY });
  assert.deepEqual(ranked.map((s) => s.id), ['A']);
  const all = buildRankedSites(db([site('A'), site('B', { archived: true })]), { asOfDate: TODAY, includeArchived: true });
  assert.equal(all.find((s) => s.id === 'B').rank, null);
});

test('filters by text, priority, district, type and overdue keep the rank (FR 4.2)', () => {
  const ranked = buildRankedSites(db([
    site('Chem', { siteType: 'chemical', district: 'Huye', distanceToWaterMetres: 50 }),
    site('Office', { siteType: 'office', priorInspectionDate: '2026-11-01', distanceToWaterMetres: 5000 }),
  ]), { asOfDate: TODAY });
  assert.deepEqual(filterSites(ranked, { query: 'chem' }).map((s) => s.rank), [1]);
  assert.deepEqual(filterSites(ranked, { district: 'Gasabo' }).map((s) => s.id), ['Office']);
  assert.deepEqual(filterSites(ranked, { priority: 'High' }).map((s) => s.id), ['Chem']);
  assert.deepEqual(filterSites(ranked, { category: 'Industrial' }).map((s) => s.id), ['Chem']);
  assert.deepEqual(filterSites(ranked, { overdueOnly: true }).map((s) => s.id), ['Chem']);
  const counts = summarise(ranked, [{ visitDate: '2026-11-03' }], TODAY);
  assert.equal(counts.high, 1);
  assert.equal(counts.inspectionsThisMonth, 1);
});

test('ranking 500 sites takes well under 2 seconds (NFR 2)', () => {
  const many = Array.from({ length: 500 }, (_, i) => site(`S${i}`, { distanceToWaterMetres: i * 10, priorViolations: i % 4 }));
  const inspections = many.map((s, i) => ({ siteId: s.id, visitDate: '2026-06-01', outcome: i % 2 ? 'PASS' : 'VIOLATION', violations: [{}] }));
  const start = performance.now();
  buildRankedSites(db(many, inspections), { asOfDate: TODAY });
  assert.ok(performance.now() - start < 2000);
});
