// Builds CSV files for export (SRS FR 6.2). Values are quoted when needed
// and cells that start with = + - @ are prefixed so spreadsheet apps do
// not run them as formulas.
import { OUTCOMES, SEVERITIES, PROJECT_SCALES } from './catalog.js';

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}

export const RANKED_SITES_HEADERS = [
  'Rank', 'Site', 'District', 'Site type', 'Project scale', 'Risk score', 'Priority',
  'Past violations', 'Distance to water (m)', 'Last inspection', 'Days since inspection', 'Overdue',
];

export function rankedSitesCsv(sites) {
  return toCsv(
    RANKED_SITES_HEADERS,
    sites.map((s) => [
      s.rank ?? 'Archived',
      s.name,
      s.district,
      s.typeLabel,
      PROJECT_SCALES[s.projectScale] ?? s.projectScale,
      s.score,
      s.priority,
      s.pastViolations,
      s.distanceToWaterMetres ?? 'Unknown',
      s.lastInspectionDate ?? 'Never',
      s.daysSinceInspection ?? '',
      s.overdue ? 'Yes' : 'No',
    ]),
  );
}

export const INSPECTIONS_HEADERS = [
  'Visit date', 'Site', 'District', 'Outcome', 'Violations', 'Notes', 'Inspector',
  'Score before', 'Score after', 'Recorded at',
];

export function inspectionsCsv(inspections, sitesById) {
  return toCsv(
    INSPECTIONS_HEADERS,
    inspections.map((i) => [
      i.visitDate,
      sitesById[i.siteId]?.name ?? i.siteId,
      sitesById[i.siteId]?.district ?? '',
      OUTCOMES[i.outcome] ?? i.outcome,
      (i.violations ?? []).map((v) => `${SEVERITIES[v.severity] ?? v.severity} - ${v.category}: ${v.description}`).join(' | '),
      i.notes ?? '',
      i.inspectorName ?? '',
      i.scoreBefore ?? '',
      i.scoreAfter ?? '',
      i.recordedAt,
    ]),
  );
}
