// Checks the data typed into the forms before it is saved.
// Each function returns an object of field -> message (empty when valid),
// so the form can show the message next to the right field.
import { SITE_TYPE_POINTS, localToday, toDay } from './scoring.js';
import { DISTRICTS, PROJECT_SCALES, OUTCOMES, SEVERITIES, VIOLATION_CATEGORIES, RWANDA_BOUNDS, ROLES } from './catalog.js';

const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';

function isValidDate(value) {
  try {
    toDay(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  } catch {
    return false;
  }
}

/**
 * Site form (SRS FR 1.1 and FR 1.2). `existingSites` is used to stop the
 * same site being registered twice in one district.
 */
export function validateSite(site, existingSites = [], today = localToday()) {
  const errors = {};
  const name = (site.name ?? '').trim();
  if (name.length < 3) errors.name = 'Enter the site name (at least 3 characters).';
  else if (name.length > 100) errors.name = 'Keep the site name under 100 characters.';
  else if (
    existingSites.some(
      (s) => s.id !== site.id && !s.archived && s.district === site.district && s.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = `A site called "${name}" is already registered in ${site.district}.`;
  }

  if (!DISTRICTS.includes(site.district)) errors.district = 'Choose a district.';
  if (!(site.siteType in SITE_TYPE_POINTS)) errors.siteType = 'Choose a site type.';
  if (!(site.projectScale in PROJECT_SCALES)) errors.projectScale = 'Choose the project scale.';

  if (site.distanceToWaterMetres !== null && site.distanceToWaterMetres !== undefined) {
    const d = site.distanceToWaterMetres;
    if (typeof d !== 'number' || Number.isNaN(d) || d < 0 || d > 100000) {
      errors.distanceToWaterMetres = 'Enter a distance from 0 to 100,000 metres, or leave it empty if unknown.';
    }
  }

  const hasLat = site.latitude !== null && site.latitude !== undefined;
  const hasLng = site.longitude !== null && site.longitude !== undefined;
  if (hasLat !== hasLng) {
    errors.latitude = 'Enter both latitude and longitude, or leave both empty.';
  } else if (hasLat) {
    const { minLat, maxLat, minLng, maxLng } = RWANDA_BOUNDS;
    if (typeof site.latitude !== 'number' || site.latitude < minLat || site.latitude > maxLat) {
      errors.latitude = `Latitude must be inside Rwanda (${minLat} to ${maxLat}).`;
    }
    if (typeof site.longitude !== 'number' || site.longitude < minLng || site.longitude > maxLng) {
      errors.longitude = `Longitude must be inside Rwanda (${minLng} to ${maxLng}).`;
    }
  }

  if (!Number.isInteger(site.priorViolations) || site.priorViolations < 0 || site.priorViolations > 99) {
    errors.priorViolations = 'Enter a whole number from 0 to 99.';
  }

  if (!isBlank(site.priorInspectionDate)) {
    if (!isValidDate(site.priorInspectionDate)) errors.priorInspectionDate = 'Enter a valid date.';
    else if (site.priorInspectionDate > today) errors.priorInspectionDate = 'The date cannot be in the future.';
  }
  return errors;
}

/** Inspection form (SRS FR 2.1 and FR 2.2). */
export function validateInspection(inspection, today = localToday()) {
  const errors = {};
  if (isBlank(inspection.siteId)) errors.siteId = 'Choose the site you inspected.';
  if (!isValidDate(inspection.visitDate)) errors.visitDate = 'Enter the date of the visit.';
  else if (inspection.visitDate > today) errors.visitDate = 'The visit date cannot be in the future.';
  if (!(inspection.outcome in OUTCOMES)) errors.outcome = 'Choose Pass or Violation.';
  if ((inspection.notes ?? '').length > 2000) errors.notes = 'Keep notes under 2,000 characters.';

  if (inspection.outcome === 'VIOLATION') {
    const items = inspection.violations ?? [];
    if (items.length === 0) {
      errors.violations = 'Add at least one violation.';
    } else {
      items.forEach((v, i) => {
        if (!VIOLATION_CATEGORIES.includes(v.category)) errors[`violations.${i}.category`] = 'Choose a category.';
        if (!(v.severity in SEVERITIES)) errors[`violations.${i}.severity`] = 'Choose a severity.';
        const text = (v.description ?? '').trim();
        if (text.length < 5) errors[`violations.${i}.description`] = 'Describe what was found (at least 5 characters).';
        else if (text.length > 1000) errors[`violations.${i}.description`] = 'Keep the description under 1,000 characters.';
      });
    }
  }
  return errors;
}

export const PASSWORD_RULE = 'At least 8 characters, with at least one letter and one number.';

export function passwordProblem(password) {
  const p = password ?? '';
  if (p.length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) return PASSWORD_RULE;
  return null;
}

/** New user form (administrator only). */
export function validateUser(user, existingUsers = []) {
  const errors = {};
  if ((user.name ?? '').trim().length < 2) errors.name = 'Enter the full name.';
  const email = (user.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  else if (existingUsers.some((u) => u.id !== user.id && u.email.toLowerCase() === email)) {
    errors.email = 'An account with this email already exists.';
  }
  if (!(user.role in ROLES)) errors.role = 'Choose a role.';
  if (user.role === 'INSPECTOR' && user.assignedDistrict && !DISTRICTS.includes(user.assignedDistrict)) {
    errors.assignedDistrict = 'Choose a district.';
  }
  if (user.password !== undefined) {
    const problem = passwordProblem(user.password);
    if (problem) errors.password = problem;
  }
  return errors;
}

export function validateOverdueDays(days) {
  if (!Number.isInteger(days) || days < 30 || days > 1095) {
    return 'Enter a whole number of days from 30 to 1,095 (3 years).';
  }
  return null;
}
