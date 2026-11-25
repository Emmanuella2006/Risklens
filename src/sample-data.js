// Demo data loaded the first time RiskLens opens (and by "Reset demo data").
// The sites, names and people are made up for the prototype.
// Dates are worked out from today, so the demo always looks the same
// whenever it is opened (for example, "inspected 8 months ago").
import { toDay } from './scoring.js';

/** "YYYY-MM-DD" for the date `days` before `today`. */
export function daysAgo(today, days) {
  const d = toDay(today);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export const DEMO_ACCOUNTS = [
  { id: 'U1', name: 'Aline Uwase', email: 'admin@risklens.rw', password: 'Admin#2026', role: 'ADMIN', assignedDistrict: null },
  { id: 'U2', name: 'Eric Mugisha', email: 'inspector@risklens.rw', password: 'Inspect#2026', role: 'INSPECTOR', assignedDistrict: 'Gasabo' },
  { id: 'U3', name: 'Diane Ingabire', email: 'inspector2@risklens.rw', password: 'Inspect#2026', role: 'INSPECTOR', assignedDistrict: 'Musanze' },
];

// [id, name, district, siteType, projectScale, distance to water (m), lat, lng, prior violations, days since prior inspection]
const SITES = [
  ['S01', 'Nyabarongo Chemical Works', 'Nyarugenge', 'chemical', 'LARGE', 60, -1.9706, 30.0274, 2, 540],
  ['S02', 'Gikondo Paint Factory', 'Kicukiro', 'large_factory', 'LARGE', 350, -1.9745, 30.0742, 1, 400],
  ['S03', 'Rulindo Quarry', 'Rulindo', 'quarry', 'MEDIUM', 450, -1.7290, 29.9930, 0, null],
  ['S04', 'Nduba Waste Facility', 'Gasabo', 'waste_management', 'LARGE', 900, -1.8750, 30.1050, 1, 300],
  ['S05', 'Musanze Hotel Extension', 'Musanze', 'hotel', 'MEDIUM', 150, -1.4990, 29.6340, 0, 200],
  ['S06', 'Kimironko Apartments Project', 'Gasabo', 'construction', 'MEDIUM', 1500, -1.9490, 30.1260, 0, 120],
  ['S07', 'Huye Coffee Washing Station', 'Huye', 'agro_processing', 'SMALL', 40, -2.5960, 29.7400, 1, 700],
  ['S08', 'Rwamagana Brick Works', 'Rwamagana', 'small_manufacturing', 'SMALL', 2500, -1.9480, 30.4340, 0, 90],
  ['S09', 'Kacyiru Office Block', 'Gasabo', 'office', 'MEDIUM', 3000, -1.9440, 30.0880, 0, 60],
  ['S10', 'Rutongo Tin Mine', 'Rulindo', 'mining', 'LARGE', 80, -1.8320, 30.0560, 3, 820],
  ['S11', 'Rubavu Lakeside Resort', 'Rubavu', 'hotel', 'LARGE', 70, -1.6880, 29.2620, 0, 420],
  ['S12', 'Nyagatare Maize Mill', 'Nyagatare', 'agro_processing', 'MEDIUM', 600, -1.2930, 30.3270, 0, null],
  ['S13', 'Kigali Heights Retail', 'Gasabo', 'retail', 'SMALL', 2200, -1.9530, 30.0930, 0, 30],
  ['S14', 'Bugesera Industrial Park Unit 4', 'Bugesera', 'large_factory', 'LARGE', 1200, -2.1530, 30.1420, 0, 250],
];

// [siteId, days ago, outcome, inspectorId, notes, violations[[category, severity, description]]]
const INSPECTIONS = [
  ['S02', 30, 'VIOLATION', 'U2', 'Drums of used solvent stored outside the bunded area.', [
    ['Waste disposal', 'MAJOR', 'Solvent drums stored on bare ground without spill containment.'],
  ]],
  ['S04', 45, 'PASS', 'U2', 'Leachate pond lined and covered. Records up to date.', []],
  ['S06', 20, 'VIOLATION', 'U2', 'Dust from earthworks reaching nearby homes.', [
    ['Air emissions or dust', 'MINOR', 'No water spraying on the access road during dry weather.'],
    ['Noise', 'MINOR', 'Concrete mixing before 7 am, outside allowed hours.'],
  ]],
  ['S05', 10, 'PASS', 'U3', 'Erosion control in place on the new slope.', []],
  ['S09', 5, 'PASS', 'U2', 'No issues found.', []],
];

/** Sites, inspections and settings for the demo, dated relative to `today`. */
export function buildSampleData(today) {
  const created = `${daysAgo(today, 30)}T08:00:00.000Z`;
  const sites = SITES.map(([id, name, district, siteType, projectScale, water, lat, lng, prior, ago]) => ({
    id,
    name,
    district,
    siteType,
    projectScale,
    distanceToWaterMetres: water,
    latitude: lat,
    longitude: lng,
    priorViolations: prior,
    priorInspectionDate: ago === null ? null : daysAgo(today, ago),
    archived: false,
    createdAt: created,
    createdBy: 'U1',
    updatedAt: created,
  }));

  const inspectors = Object.fromEntries(DEMO_ACCOUNTS.map((u) => [u.id, u.name]));
  const inspections = INSPECTIONS.map(([siteId, ago, outcome, inspectorId, notes, violations], i) => ({
    id: `I${String(i + 1).padStart(3, '0')}`,
    siteId,
    visitDate: daysAgo(today, ago),
    outcome,
    notes,
    violations: violations.map(([category, severity, description]) => ({ category, severity, description })),
    inspectorId,
    inspectorName: inspectors[inspectorId],
    recordedAt: `${daysAgo(today, ago)}T15:30:00.000Z`,
    scoreBefore: null,
    scoreAfter: null,
  }));

  return { sites, inspections };
}
