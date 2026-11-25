// Site detail (SRS 3.1): why the site has its score, and its full
// inspection history, newest first (FR 6.1).
import { h, icon, scoreRing, priorityBadge, statusBadges, ago, distance, formatDate, formatDateTime, FACTOR_LABELS, pageHeader, confirmDialog, toast } from '../ui.js';
import { inspectionsForSite } from '../../src/sites.js';
import { PROJECT_SCALES, OUTCOMES, SEVERITIES } from '../../src/catalog.js';

function factorExplanation(site, weights) {
  const why = {
    siteType: `${site.typeLabel} (${site.category})`,
    violations: `${site.pastViolations} on record${site.priorViolations ? ` (${site.priorViolations} before RiskLens)` : ''}`,
    waterDistance: site.distanceToWaterMetres === null ? 'Distance unknown, counted as closest' : `${distance(site.distanceToWaterMetres)} from water or wetland`,
    inspectionAge: site.lastInspectionDate ? `Last inspected ${formatDate(site.lastInspectionDate)}` : 'Never inspected',
  };
  return h('table', { class: 'table factor-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Factor'), h('th', {}, 'Reason'), h('th', { class: 'num' }, 'Points'), h('th', { class: 'num' }, 'Weight'))),
    h('tbody', {}, Object.entries(FACTOR_LABELS).map(([key, label]) =>
      h('tr', {},
        h('th', { scope: 'row' }, label),
        h('td', {}, why[key]),
        h('td', { class: 'num' }, h('span', { class: 'factor-track' }, [1, 2, 3].map((n) => h('span', { class: `factor-pip${n <= site.points[key] ? ' on' : ''}` }))), ` ${site.points[key]}/3`),
        h('td', { class: 'num' }, `×${weights[key]}`)))));
}

export function inspectionItem(i, { showSite = null } = {}) {
  const delta = i.scoreBefore !== null && i.scoreAfter !== null ? i.scoreAfter - i.scoreBefore : null;
  return h('li', { class: `timeline-item outcome-${i.outcome.toLowerCase()}` },
    h('span', { class: 'timeline-dot' }, icon(i.outcome === 'PASS' ? 'check' : 'alert', 14)),
    h('div', { class: 'timeline-body' },
      h('div', { class: 'timeline-head' },
        h('strong', {}, formatDate(i.visitDate)),
        h('span', { class: `badge badge-${i.outcome === 'PASS' ? 'pass' : 'violation'}` }, OUTCOMES[i.outcome]),
        showSite ? h('a', { class: 'link', href: `#/sites/${i.siteId}` }, showSite) : null,
        delta !== null ? h('span', { class: `delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}` }, `Score ${i.scoreBefore} → ${i.scoreAfter}`) : null),
      i.violations.length
        ? h('ul', { class: 'violations' }, i.violations.map((v) =>
          h('li', {}, h('span', { class: `sev sev-${v.severity.toLowerCase()}` }, SEVERITIES[v.severity]), h('strong', {}, v.category), ` — ${v.description}`)))
        : null,
      i.notes ? h('p', { class: 'notes' }, i.notes) : null,
      h('small', { class: 'muted' }, `Recorded by ${i.inspectorName} on ${formatDateTime(i.recordedAt)}`)));
}

export function render(app, id) {
  const site = app.db.site(id);
  if (!site) {
    return h('section', { class: 'card narrow center' }, h('h1', {}, 'Site not found'), h('a', { class: 'btn btn-primary', href: '#/sites' }, 'Back to ranked sites'));
  }
  const history = inspectionsForSite(app.db.inspections, id);
  const weights = app.db.settings.weights;
  const total = app.db.rankedSites().length;

  const actions = [];
  if (app.can('recordInspection') && !site.archived) actions.push(h('a', { class: 'btn btn-primary', href: `#/inspect/${id}` }, icon('clipboard'), 'Record inspection'));
  if (app.can('manageSites')) {
    if (!site.archived) actions.push(h('a', { class: 'btn btn-ghost', href: `#/sites/${id}/edit` }, icon('edit'), 'Edit'));
    actions.push(h('button', {
      class: 'btn btn-ghost',
      type: 'button',
      onclick: async () => {
        const archive = !site.archived;
        const ok = await confirmDialog({
          title: archive ? `Archive ${site.name}?` : `Restore ${site.name}?`,
          body: archive
            ? 'The site will be taken off the ranked list (for example, when a project has closed). Its inspection history is kept and you can restore it at any time.'
            : 'The site will go back on the ranked list.',
          confirmLabel: archive ? 'Archive site' : 'Restore site',
          danger: archive,
        });
        if (!ok) return;
        try {
          app.db.setSiteArchived(id, archive, app.user);
          toast(archive ? `${site.name} archived.` : `${site.name} restored.`);
          app.refresh();
        } catch (err) { toast(err.message, 'error'); }
      },
    }, icon(site.archived ? 'restore' : 'archive'), site.archived ? 'Restore' : 'Archive'));
  }

  return h('div', { class: 'page' },
    h('a', { class: 'back', href: '#/sites' }, icon('back', 16), 'Ranked sites'),
    pageHeader(site.name, `${site.typeLabel} · ${site.district} district`, ...actions),
    site.archived ? h('div', { class: 'alert alert-info' }, icon('archive'), 'This site is archived. It is not on the ranked list and cannot be inspected.') : null,

    h('div', { class: 'grid-detail' },
      h('section', { class: 'card score-card' },
        scoreRing(site.score, site.priority, 'lg'),
        h('div', {},
          h('p', { class: 'eyebrow' }, 'Risk score'),
          h('p', { class: 'score-line' }, priorityBadge(site.priority), site.rank ? ` Rank ${site.rank} of ${total}` : ' Archived'),
          h('div', { class: 'tags' }, statusBadges(site)),
          h('p', { class: 'muted small' }, 'Score = points × weights, out of 100. High is 67 or more, Medium 34 to 66, Low 33 or less.'))),

      h('section', { class: 'card' },
        h('h2', {}, 'Site details'),
        h('dl', { class: 'details' },
          h('dt', {}, 'Site type'), h('dd', {}, site.typeLabel),
          h('dt', {}, 'Project scale'), h('dd', {}, PROJECT_SCALES[site.projectScale] ?? '—'),
          h('dt', {}, 'District'), h('dd', {}, site.district),
          h('dt', {}, 'GPS location'), h('dd', {}, site.latitude !== null
            ? h('a', { class: 'link', href: `https://www.openstreetmap.org/?mlat=${site.latitude}&mlon=${site.longitude}#map=15/${site.latitude}/${site.longitude}`, target: '_blank', rel: 'noopener' }, `${site.latitude}, ${site.longitude}`)
            : 'Not recorded'),
          h('dt', {}, 'Distance to water'), h('dd', {}, distance(site.distanceToWaterMetres)),
          h('dt', {}, 'Last inspection'), h('dd', {}, site.lastInspectionDate ? `${formatDate(site.lastInspectionDate)} (${ago(site.daysSinceInspection)})` : 'Never'),
          h('dt', {}, 'Inspections in RiskLens'), h('dd', {}, String(history.length))))),

    h('section', { class: 'card' },
      h('h2', {}, 'How the score is worked out'),
      h('div', { class: 'table-wrap' }, factorExplanation(site, weights))),

    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Inspection history'), h('span', { class: 'muted small' }, 'Records cannot be edited or deleted.')),
      history.length
        ? h('ol', { class: 'timeline' }, history.map((i) => inspectionItem(i)))
        : h('p', { class: 'muted' }, site.priorInspectionDate
          ? `No inspections recorded in RiskLens yet. The last inspection before RiskLens was on ${formatDate(site.priorInspectionDate)}.`
          : 'This site has never been inspected.')));
}
