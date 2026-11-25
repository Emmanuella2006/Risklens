/**
 * RiskLens risk-scoring engine.
 *
 * Gives each site a risk score from 0 to 100 so inspectors know which
 * sites to visit first (SRS FR 3.1). Four factors are each scored from
 * 0 to 3 points, combined with weights set by an administrator, and
 * turned into a score out of 100.
 *
 * Everything in this file is plain JavaScript with no browser code,
 * so it can be tested with Node (npm test).
 */

// Site types grouped by environmental impact. 1 = low, 2 = medium, 3 = high.
export const SITE_TYPE_POINTS = {
  office: 1,
  retail: 1,
  school: 1,
  construction: 2,
  small_manufacturing: 2,
  agro_processing: 2,
  hotel: 2,
  chemical: 3,
  mining: 3,
  quarry: 3,
  large_factory: 3,
  waste_management: 3,
};

// How much each factor counts. Equal to start with; administrators can change them.
export const DEFAULT_WEIGHTS = {
  siteType: 1,
  violations: 1,
  waterDistance: 1,
  inspectionAge: 1,
};

export const FACTORS = ['siteType', 'violations', 'waterDistance', 'inspectionAge'];

export const MAX_POINTS_PER_FACTOR = 3;

// Weights can be set from 0 (ignore the factor) to 3 (counts three times as much).
export const MIN_WEIGHT = 0;
export const MAX_WEIGHT = 3;

// Priority levels for the final score (0-100).
export const PRIORITY_LEVELS = [
  { min: 67, label: 'High' },
  { min: 34, label: 'Medium' },
  { min: 0, label: 'Low' },
];

export function scoreSiteType(siteType) {
  const points = SITE_TYPE_POINTS[siteType];
  if (points === undefined) {
    throw new Error(`Unknown site type: "${siteType}"`);
  }
  return points;
}

export function scoreViolations(pastViolations) {
  if (!Number.isInteger(pastViolations) || pastViolations < 0) {
    throw new Error(`Past violations must be a whole number of 0 or more, got: ${pastViolations}`);
  }
  if (pastViolations >= 3) return 3;
  return pastViolations; // 0 -> 0, 1 -> 1, 2 -> 2
}

/**
 * Distance to the nearest water source or wetland, in metres.
 * An unknown distance (null) scores 3, so a site is never ranked low
 * just because its data is missing.
 */
export function scoreWaterDistance(distanceMetres) {
  if (distanceMetres === null || distanceMetres === undefined) return 3;
  if (typeof distanceMetres !== 'number' || Number.isNaN(distanceMetres) || distanceMetres < 0) {
    throw new Error(`Distance to water must be 0 or more metres, got: ${distanceMetres}`);
  }
  if (distanceMetres < 100) return 3;
  if (distanceMetres < 500) return 2;
  if (distanceMetres <= 2000) return 1;
  return 0;
}

/** Turns "2026-05-10" or a Date into a Date at midnight UTC, or throws. */
export function toDay(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Invalid date');
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!match) throw new Error(`Invalid date: ${value}`);
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(day.getTime()) || day.getUTCDate() !== Number(match[3])) {
    throw new Error(`Invalid date: ${value}`);
  }
  return day;
}

/** Today's date as "YYYY-MM-DD" in the user's own time zone (not UTC). */
export function localToday(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole months between two dates (ignores days left over). */
export function monthsBetween(fromDate, toDate) {
  const from = toDay(fromDate);
  const to = toDay(toDate);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** Whole days between two dates. */
export function daysBetween(fromDate, toDate) {
  const ms = toDay(toDate).getTime() - toDay(fromDate).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

/**
 * Time since the last inspection. A site that has never been
 * inspected (null) scores 3.
 */
export function scoreInspectionAge(lastInspectionDate, asOfDate = new Date()) {
  if (lastInspectionDate === null || lastInspectionDate === undefined) return 3;
  const months = monthsBetween(lastInspectionDate, asOfDate);
  if (months < 6) return 0;
  if (months < 12) return 1;
  if (months <= 24) return 2;
  return 3;
}

export function getPriority(score) {
  return PRIORITY_LEVELS.find((level) => score >= level.min).label;
}

/** Checks a set of weights and returns a list of problems (empty if fine). */
export function validateWeights(weights) {
  const errors = [];
  let total = 0;
  for (const factor of FACTORS) {
    const value = weights?.[factor];
    if (typeof value !== 'number' || Number.isNaN(value) || value < MIN_WEIGHT || value > MAX_WEIGHT) {
      errors.push(`The weight for ${factor} must be a number from ${MIN_WEIGHT} to ${MAX_WEIGHT}.`);
    } else {
      total += value;
    }
  }
  if (errors.length === 0 && total === 0) {
    errors.push('At least one factor must have a weight above 0.');
  }
  return errors;
}

/**
 * Score one site. Returns the points for each factor, the final score
 * out of 100 and the priority level.
 */
export function calculateRiskScore(site, { weights = DEFAULT_WEIGHTS, asOfDate = new Date() } = {}) {
  const points = {
    siteType: scoreSiteType(site.siteType),
    violations: scoreViolations(site.pastViolations),
    waterDistance: scoreWaterDistance(site.distanceToWaterMetres),
    inspectionAge: scoreInspectionAge(site.lastInspectionDate, asOfDate),
  };

  let weighted = 0;
  let maxWeighted = 0;
  for (const factor of FACTORS) {
    const weight = weights[factor] ?? 0;
    weighted += points[factor] * weight;
    maxWeighted += MAX_POINTS_PER_FACTOR * weight;
  }
  if (maxWeighted === 0) {
    throw new Error('At least one factor must have a weight above 0');
  }

  const score = Math.round((weighted / maxWeighted) * 100);
  return { points, score, priority: getPriority(score) };
}

/**
 * Score and rank a list of sites, highest risk first (SRS FR 4.1).
 * Ties are broken by: closer to water first, then more past violations,
 * then the site that has gone longest without an inspection, then name.
 */
export function rankSites(sites, options = {}) {
  const scored = sites.map((site) => ({ ...site, ...calculateRiskScore(site, options) }));

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.points.waterDistance !== a.points.waterDistance) return b.points.waterDistance - a.points.waterDistance;
      if (b.points.violations !== a.points.violations) return b.points.violations - a.points.violations;
      if (b.points.inspectionAge !== a.points.inspectionAge) return b.points.inspectionAge - a.points.inspectionAge;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    })
    .map((site, index) => ({ rank: index + 1, ...site }));
}
