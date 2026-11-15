import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreSiteType,
  scoreViolations,
  scoreWaterDistance,
  scoreInspectionAge,
  getPriority,
  calculateRiskScore,
  rankSites,
} from '../src/scoring.js';

const AS_OF = '2026-11-15';

test('site type points follow the impact groups', () => {
  assert.equal(scoreSiteType('office'), 1);
  assert.equal(scoreSiteType('construction'), 2);
  assert.equal(scoreSiteType('chemical'), 3);
  assert.throws(() => scoreSiteType('spaceport'), /Unknown site type/);
});

test('past violations are capped at 3 points', () => {
  assert.equal(scoreViolations(0), 0);
  assert.equal(scoreViolations(2), 2);
  assert.equal(scoreViolations(7), 3);
  assert.throws(() => scoreViolations(-1));
  assert.throws(() => scoreViolations(1.5));
});

test('closer to water means more points, and unknown counts as closest', () => {
  assert.equal(scoreWaterDistance(50), 3);
  assert.equal(scoreWaterDistance(100), 2);
  assert.equal(scoreWaterDistance(499), 2);
  assert.equal(scoreWaterDistance(500), 1);
  assert.equal(scoreWaterDistance(2000), 1);
  assert.equal(scoreWaterDistance(2001), 0);
  assert.equal(scoreWaterDistance(null), 3);
});

test('longer since inspection means more points, and never inspected counts as worst', () => {
  assert.equal(scoreInspectionAge('2026-08-15', AS_OF), 0); // 3 months
  assert.equal(scoreInspectionAge('2026-02-15', AS_OF), 1); // 9 months
  assert.equal(scoreInspectionAge('2025-05-15', AS_OF), 2); // 18 months
  assert.equal(scoreInspectionAge('2023-11-15', AS_OF), 3); // 36 months
  assert.equal(scoreInspectionAge(null, AS_OF), 3);
});

test('priority levels', () => {
  assert.equal(getPriority(100), 'High');
  assert.equal(getPriority(67), 'High');
  assert.equal(getPriority(66), 'Medium');
  assert.equal(getPriority(34), 'Medium');
  assert.equal(getPriority(33), 'Low');
  assert.equal(getPriority(0), 'Low');
});

test('worked example: Site A scores 75 (High)', () => {
  const siteA = { siteType: 'chemical', pastViolations: 2, distanceToWaterMetres: 300, lastInspectionDate: '2025-05-15' };
  const result = calculateRiskScore(siteA, { asOfDate: AS_OF });
  assert.deepEqual(result.points, { siteType: 3, violations: 2, waterDistance: 2, inspectionAge: 2 });
  assert.equal(result.score, 75);
  assert.equal(result.priority, 'High');
});

test('weights change the score: doubling water distance', () => {
  const site = { siteType: 'office', pastViolations: 0, distanceToWaterMetres: 50, lastInspectionDate: '2026-10-01' };
  const equal = calculateRiskScore(site, { asOfDate: AS_OF });
  const waterDouble = calculateRiskScore(site, {
    asOfDate: AS_OF,
    weights: { siteType: 1, violations: 1, waterDistance: 2, inspectionAge: 1 },
  });
  assert.equal(equal.score, 33); // 4 of 12 points
  assert.equal(waterDouble.score, 47); // 7 of 15 points
});

test('ranking puts the highest score first and breaks ties by distance to water', () => {
  const sites = [
    { id: 'low', siteType: 'office', pastViolations: 0, distanceToWaterMetres: 3000, lastInspectionDate: '2026-10-01' },
    { id: 'tieFar', siteType: 'chemical', pastViolations: 0, distanceToWaterMetres: 3000, lastInspectionDate: null },
    { id: 'tieNear', siteType: 'chemical', pastViolations: 0, distanceToWaterMetres: 50, lastInspectionDate: '2026-10-01' },
  ];
  const ranked = rankSites(sites, { asOfDate: AS_OF });
  assert.deepEqual(ranked.map((s) => s.id), ['tieNear', 'tieFar', 'low']);
  assert.equal(ranked[0].score, ranked[1].score); // both 50
  assert.equal(ranked[0].rank, 1);
});
