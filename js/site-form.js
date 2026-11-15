// Turns the raw values from the "Add a site" form into a site object,
// and lists anything that needs fixing first.
import { SITE_TYPE_POINTS } from '../src/scoring.js';

export const SITE_TYPE_LABELS = {
  office: 'Office',
  retail: 'Retail / shops',
  school: 'School',
  construction: 'Construction site',
  small_manufacturing: 'Small manufacturing',
  agro_processing: 'Agro-processing',
  hotel: 'Hotel',
  chemical: 'Chemical plant',
  mining: 'Mine',
  quarry: 'Quarry',
  large_factory: 'Large factory',
  waste_management: 'Waste management',
};

export const DISTRICTS = [
  'Bugesera', 'Burera', 'Gakenke', 'Gasabo', 'Gatsibo', 'Gicumbi', 'Gisagara', 'Huye',
  'Kamonyi', 'Karongi', 'Kayonza', 'Kicukiro', 'Kirehe', 'Muhanga', 'Musanze', 'Ngoma',
  'Ngororero', 'Nyabihu', 'Nyagatare', 'Nyamagabe', 'Nyamasheke', 'Nyanza', 'Nyarugenge',
  'Nyaruguru', 'Rubavu', 'Ruhango', 'Rulindo', 'Rusizi', 'Rutsiro', 'Rwamagana',
];

/**
 * @param {object} input raw form values (all strings, plus two checkbox booleans)
 * @param {Date} today used to reject inspection dates in the future
 * @returns {{ site: object|null, errors: string[] }}
 */
export function buildSiteFromForm(input, today = new Date()) {
  const errors = [];
  const name = (input.name ?? '').trim();
  const district = (input.district ?? '').trim();
  const siteType = input.siteType ?? '';

  if (!name) errors.push('Enter the site name.');
  if (!DISTRICTS.includes(district)) errors.push('Choose a district.');
  if (!(siteType in SITE_TYPE_POINTS)) errors.push('Choose a site type.');

  const violationsText = String(input.pastViolations ?? '').trim();
  const pastViolations = Number(violationsText);
  if (violationsText === '' || !Number.isInteger(pastViolations) || pastViolations < 0) {
    errors.push('Past violations must be a whole number (0 or more).');
  }

  let distanceToWaterMetres = null;
  if (!input.distanceUnknown) {
    const distanceText = String(input.distanceToWaterMetres ?? '').trim();
    distanceToWaterMetres = Number(distanceText);
    if (distanceText === '' || Number.isNaN(distanceToWaterMetres) || distanceToWaterMetres < 0) {
      errors.push('Enter the distance to water in metres, or tick “Not known”.');
    }
  }

  let lastInspectionDate = null;
  if (!input.neverInspected) {
    lastInspectionDate = (input.lastInspectionDate ?? '').trim();
    const date = new Date(lastInspectionDate);
    if (!lastInspectionDate || Number.isNaN(date.getTime())) {
      errors.push('Enter the last inspection date, or tick “Never inspected”.');
    } else if (date > today) {
      errors.push('The last inspection date can’t be in the future.');
    }
  }

  if (errors.length > 0) return { site: null, errors };

  return {
    site: {
      id: `site-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      district,
      siteType,
      pastViolations,
      distanceToWaterMetres,
      lastInspectionDate,
    },
    errors: [],
  };
}
