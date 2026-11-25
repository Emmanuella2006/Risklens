// Fixed lists used across RiskLens: site types, districts, project scales,
// violation categories and severities. Plain data, no browser code.

// Site types, grouped the same way as the SiteType enumeration in the
// class diagram (Industrial, Construction, Mining, Agro-processing),
// plus commercial and service sites that also need an ESIA.
export const SITE_CATEGORIES = [
  {
    label: 'Industrial',
    types: [
      ['chemical', 'Chemical plant'],
      ['large_factory', 'Large factory'],
      ['small_manufacturing', 'Small manufacturing'],
      ['waste_management', 'Waste management'],
    ],
  },
  { label: 'Construction', types: [['construction', 'Construction site']] },
  { label: 'Mining', types: [['mining', 'Mine'], ['quarry', 'Quarry']] },
  { label: 'Agro-processing', types: [['agro_processing', 'Agro-processing']] },
  {
    label: 'Commercial and services',
    types: [['hotel', 'Hotel'], ['office', 'Office'], ['retail', 'Retail / shops'], ['school', 'School']],
  },
];

export const SITE_TYPE_LABELS = Object.fromEntries(SITE_CATEGORIES.flatMap((c) => c.types));

export const SITE_TYPE_CATEGORY = Object.fromEntries(
  SITE_CATEGORIES.flatMap((c) => c.types.map(([value]) => [value, c.label])),
);

export const DISTRICTS = [
  'Bugesera', 'Burera', 'Gakenke', 'Gasabo', 'Gatsibo', 'Gicumbi', 'Gisagara', 'Huye',
  'Kamonyi', 'Karongi', 'Kayonza', 'Kicukiro', 'Kirehe', 'Muhanga', 'Musanze', 'Ngoma',
  'Ngororero', 'Nyabihu', 'Nyagatare', 'Nyamagabe', 'Nyamasheke', 'Nyanza', 'Nyarugenge',
  'Nyaruguru', 'Rubavu', 'Ruhango', 'Rulindo', 'Rusizi', 'Rutsiro', 'Rwamagana',
];

export const PROJECT_SCALES = {
  SMALL: 'Small',
  MEDIUM: 'Medium',
  LARGE: 'Large',
};

export const OUTCOMES = {
  PASS: 'Pass',
  VIOLATION: 'Violation',
};

export const SEVERITIES = {
  MINOR: 'Minor',
  MAJOR: 'Major',
  CRITICAL: 'Critical',
};

export const VIOLATION_CATEGORIES = [
  'Waste disposal',
  'Water pollution',
  'Air emissions or dust',
  'Noise',
  'Soil erosion or land damage',
  'ESMP measure not in place',
  'Missing permit or records',
  'Other',
];

export const ROLES = {
  ADMIN: 'Administrator',
  INSPECTOR: 'Inspector',
};

// Rough bounding box of Rwanda, used to check GPS coordinates.
export const RWANDA_BOUNDS = { minLat: -2.9, maxLat: -1.0, minLng: 28.8, maxLng: 30.95 };
