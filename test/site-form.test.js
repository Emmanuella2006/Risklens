import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSiteFromForm } from '../js/site-form.js';

const TODAY = new Date('2026-11-15');

const validInput = {
  name: '  Hillside Paint Works ',
  district: 'Gasabo',
  siteType: 'chemical',
  pastViolations: '2',
  distanceToWaterMetres: '300',
  distanceUnknown: false,
  lastInspectionDate: '2025-05-10',
  neverInspected: false,
};

test('a complete form becomes a site', () => {
  const { site, errors } = buildSiteFromForm(validInput, TODAY);
  assert.deepEqual(errors, []);
  assert.equal(site.name, 'Hillside Paint Works');
  assert.equal(site.pastViolations, 2);
  assert.equal(site.distanceToWaterMetres, 300);
  assert.equal(site.lastInspectionDate, '2025-05-10');
  assert.ok(site.id);
});

test('"Not known" and "Never inspected" save as null', () => {
  const { site } = buildSiteFromForm(
    { ...validInput, distanceToWaterMetres: '', distanceUnknown: true, lastInspectionDate: '', neverInspected: true },
    TODAY,
  );
  assert.equal(site.distanceToWaterMetres, null);
  assert.equal(site.lastInspectionDate, null);
});

test('missing or invalid fields are reported', () => {
  const { site, errors } = buildSiteFromForm(
    { name: '', district: 'Atlantis', siteType: 'spaceport', pastViolations: '-1', distanceToWaterMetres: '', lastInspectionDate: '' },
    TODAY,
  );
  assert.equal(site, null);
  assert.equal(errors.length, 6);
});

test('an inspection date in the future is rejected', () => {
  const { errors } = buildSiteFromForm({ ...validInput, lastInspectionDate: '2027-01-01' }, TODAY);
  assert.deepEqual(errors, ['The last inspection date can’t be in the future.']);
});
