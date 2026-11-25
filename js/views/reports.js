// Reports. Any logged-in user can see and print the inspection history
// report (SRS FR 6.1). Administrators can also export CSV files (FR 6.2).
import { h, icon, select, pageHeader, formatDate, download, toast, plural, emptyState } from '../ui.js';
import { inspectionsCsv, rankedSitesCsv } from '../../src/csv.js';
import { DISTRICTS, OUTCOMES, SEVERITIES } from '../../src/catalog.js';
import { daysAgo } from '../../src/sample-data.js';

export function render(app) {
  const today = app.db.today();
  const allSites = app.db.rankedSites({ includeArchived: true });
  const byId = Object.fromEntries(allSites.map((s) => [s.id, s]));

  const site = select([['', 'All sites'], ...[...allSites].sort((a, b) => a.name.localeCompare(b.name)).map((s) => [s.id, s.name])], app.query.get('site') ?? '', { 'aria-label': 'Site' });
  const district = select([['', 'All districts'], ...DISTRICTS.map((d) => [d, d])], '', { 'aria-label': 'District' });
  const outcome = select([['', 'All outcomes'], ...Object.entries(OUTCOMES)], '', { 'aria-label': 'Outcome' });
  const from = h('input', { class: 'input', type: 'date', value: daysAgo(today, 365), max: today, 'aria-label': 'From date' });
  const to = h('input', { class: 'input', type: 'date', value: today, max: today, 'aria-label': 'To date' });

  const summary = h('div', { class: 'report-summary' });
  const body = h('div', {});
  const period = h('p', { class: 'print-only' });
  let rows = [];

  function update() {
    rows = app.db.inspections
      .filter((i) => (!site.value || i.siteId === site.value)
        && (!district.value || byId[i.siteId]?.district === district.value)
        && (!outcome.value || i.outcome === outcome.value)
        && (!from.value || i.visitDate >= from.value)
        && (!to.value || i.visitDate <= to.value))
      .sort((a, b) => b.visitDate.localeCompare(a.visitDate) || b.recordedAt.localeCompare(a.recordedAt));

    const violations = rows.reduce((t, i) => t + i.violations.length, 0);
    const critical = rows.reduce((t, i) => t + i.violations.filter((v) => v.severity === 'CRITICAL').length, 0);
    const failRate = rows.length ? Math.round((rows.filter((i) => i.outcome === 'VIOLATION').length / rows.length) * 100) : 0;
    summary.replaceChildren(
      h('div', { class: 'stat' }, h('strong', {}, rows.length), h('span', {}, 'inspections')),
      h('div', { class: 'stat' }, h('strong', {}, `${failRate}%`), h('span', {}, 'found violations')),
      h('div', { class: 'stat' }, h('strong', {}, violations), h('span', {}, 'violations logged')),
      h('div', { class: 'stat' }, h('strong', {}, critical), h('span', {}, 'critical')));
    period.textContent = `Period: ${formatDate(from.value)} to ${formatDate(to.value)}. Printed ${formatDate(today)} by ${app.user.name}.`;

    body.replaceChildren(rows.length
      ? h('div', { class: 'table-wrap' }, h('table', { class: 'table report-table' },
        h('thead', {}, h('tr', {}, ['Date', 'Site', 'District', 'Outcome', 'Violations', 'Score', 'Inspector'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, rows.map((i) => h('tr', {},
          h('td', { class: 'nowrap' }, formatDate(i.visitDate)),
          h('td', {}, h('a', { class: 'link', href: `#/sites/${i.siteId}` }, byId[i.siteId]?.name ?? i.siteId)),
          h('td', {}, byId[i.siteId]?.district ?? ''),
          h('td', {}, h('span', { class: `badge badge-${i.outcome === 'PASS' ? 'pass' : 'violation'}` }, OUTCOMES[i.outcome])),
          h('td', {}, i.violations.length
            ? h('ul', { class: 'plain' }, i.violations.map((v) => h('li', {}, h('span', { class: `sev sev-${v.severity.toLowerCase()}` }, SEVERITIES[v.severity]), ` ${v.category}: ${v.description}`)))
            : (i.notes || '—')),
          h('td', { class: 'nowrap num' }, i.scoreBefore !== null ? `${i.scoreBefore} → ${i.scoreAfter}` : '—'),
          h('td', {}, i.inspectorName))))))
      : emptyState('No inspections in this period', 'Change the filters or the dates to see more.'));
  }
  [site, district, outcome, from, to].forEach((c) => c.addEventListener('change', update));

  const exports = app.can('exportCsv')
    ? h('section', { class: 'card no-print' },
      h('h2', {}, 'Export (administrators)'),
      h('p', { class: 'muted small' }, 'CSV files open in Excel or Google Sheets.'),
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn btn-ghost', type: 'button',
          onclick: () => {
            const ranked = app.db.rankedSites();
            download(`risklens-ranked-sites-${today}.csv`, rankedSitesCsv(ranked));
            toast(`Exported ${plural(ranked.length, 'site')}.`);
          },
        }, icon('download'), 'Ranked site list (CSV)'),
        h('button', {
          class: 'btn btn-ghost', type: 'button',
          onclick: () => {
            download(`risklens-inspections-${from.value}-to-${to.value}.csv`, inspectionsCsv(rows, byId));
            toast(`Exported ${plural(rows.length, 'inspection')}.`);
          },
        }, icon('download'), 'Inspections shown below (CSV)')))
    : null;

  update();
  return h('div', { class: 'page' },
    pageHeader('Inspection history report', 'Every recorded inspection, with the violations found and how each one changed the site\'s score.',
      h('button', { class: 'btn btn-ghost no-print', type: 'button', onclick: () => window.print() }, icon('printer'), 'Print or save as PDF')),
    exports,
    h('section', { class: 'card filters no-print' },
      h('div', { class: 'filter-row' }, site, district, outcome,
        h('label', { class: 'inline' }, 'From', from), h('label', { class: 'inline' }, 'To', to))),
    period,
    summary,
    h('section', { class: 'card' }, body));
}
