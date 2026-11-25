// Turns stored sites and inspections into the ranked list the app shows:
// works out each site's violation count and last inspection date from its
// inspections (SRS FR 3.2), scores and ranks the sites (FR 3.1, FR 4.1),
// flags overdue sites (FR 7.1) and filters the list (FR 4.2).
// Plain JavaScript with no browser code, so it can be tested with Node.
import { rankSites, daysBetween, DEFAULT_WEIGHTS, localToday } from './scoring.js';
import { SITE_TYPE_LABELS, SITE_TYPE_CATEGORY } from './catalog.js';

export const DEFAULT_OVERDUE_DAYS = 365;

/** All inspections for one site, newest first. */
export function inspectionsForSite(inspections, siteId) {
  return inspections
    .filter((i) => i.siteId === siteId)
    .sort((a, b) => (b.visitDate.localeCompare(a.visitDate)) || (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''));
}

/** Number of violations found during a list of inspections. */
export function countViolations(inspections) {
  return inspections.reduce(
    (total, i) => total + (i.outcome === 'VIOLATION' ? Math.max(1, (i.violations ?? []).length) : 0),
    0,
  );
}

/**
 * The scoring inputs for one site: violations before RiskLens plus the ones
 * logged since, and the most recent inspection date from either source.
 */
export function deriveFacts(site, siteInspections) {
  const dates = siteInspections.map((i) => i.visitDate);
  if (site.priorInspectionDate) dates.push(site.priorInspectionDate);
  const lastInspectionDate = dates.length ? dates.sort().at(-1) : null;
  return {
    pastViolations: (site.priorViolations ?? 0) + countViolations(siteInspections),
    lastInspectionDate,
    inspectionCount: siteInspections.length,
  };
}

/** True when a site has never been inspected or the last visit is older than the window. */
export function isOverdue(lastInspectionDate, overdueDays, asOfDate) {
  if (!lastInspectionDate) return true;
  return daysBetween(lastInspectionDate, asOfDate) > overdueDays;
}

/**
 * Builds the full ranked list. Archived sites are left out unless asked for,
 * and are never given a rank.
 */
export function buildRankedSites(db, { asOfDate = localToday(), includeArchived = false } = {}) {
  const weights = db.settings?.weights ?? DEFAULT_WEIGHTS;
  const overdueDays = db.settings?.overdueThresholdDays ?? DEFAULT_OVERDUE_DAYS;
  const withFacts = db.sites.map((site) => {
    const facts = deriveFacts(site, inspectionsForSite(db.inspections, site.id));
    return {
      ...site,
      ...facts,
      overdue: isOverdue(facts.lastInspectionDate, overdueDays, asOfDate),
      daysSinceInspection: facts.lastInspectionDate ? daysBetween(facts.lastInspectionDate, asOfDate) : null,
      typeLabel: SITE_TYPE_LABELS[site.siteType] ?? site.siteType,
      category: SITE_TYPE_CATEGORY[site.siteType] ?? 'Other',
    };
  });

  const active = rankSites(withFacts.filter((s) => !s.archived), { weights, asOfDate });
  if (!includeArchived) return active;
  const archived = rankSites(withFacts.filter((s) => s.archived), { weights, asOfDate })
    .map((s) => ({ ...s, rank: null }));
  return active.concat(archived);
}

/** Scores one site as it would look with extra inspections (used for the live preview). */
export function previewScore(db, siteId, extraInspection, asOfDate = localToday()) {
  const preview = { ...db, inspections: db.inspections.concat(extraInspection ? [extraInspection] : []) };
  return buildRankedSites(preview, { asOfDate }).find((s) => s.id === siteId) ?? null;
}

/**
 * Filters the ranked list (SRS FR 4.2) by search text, priority, district,
 * site type or category, and overdue status. Ranks are kept from the full list.
 */
export function filterSites(sites, filters = {}) {
  const query = (filters.query ?? '').trim().toLowerCase();
  return sites.filter((s) => {
    if (query && !`${s.name} ${s.district} ${s.typeLabel}`.toLowerCase().includes(query)) return false;
    if (filters.priority && s.priority !== filters.priority) return false;
    if (filters.district && s.district !== filters.district) return false;
    if (filters.siteType && s.siteType !== filters.siteType) return false;
    if (filters.category && s.category !== filters.category) return false;
    if (filters.overdueOnly && !s.overdue) return false;
    if (!filters.showArchived && s.archived) return false;
    return true;
  });
}

/** Counts used on the dashboard. */
export function summarise(sites, inspections, asOfDate = localToday()) {
  const month = asOfDate.slice(0, 7);
  const active = sites.filter((s) => !s.archived);
  return {
    total: active.length,
    high: active.filter((s) => s.priority === 'High').length,
    medium: active.filter((s) => s.priority === 'Medium').length,
    low: active.filter((s) => s.priority === 'Low').length,
    overdue: active.filter((s) => s.overdue).length,
    neverInspected: active.filter((s) => !s.lastInspectionDate).length,
    inspectionsThisMonth: inspections.filter((i) => i.visitDate.startsWith(month)).length,
    averageScore: active.length ? Math.round(active.reduce((t, s) => t + s.score, 0) / active.length) : 0,
  };
}
