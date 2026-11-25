// Dashboard (SRS 3.1): the sites to visit next, overdue sites and key counts.
import { h, icon, scoreRing, priorityBadge, statusBadges, ago, formatDateTime, pageHeader, plural } from '../ui.js';
import { summarise } from '../../src/sites.js';

function siteRow(site) {
  return h('a', { class: 'site-row', href: `#/sites/${site.id}` },
    h('span', { class: 'rank' }, `#${site.rank}`),
    scoreRing(site.score, site.priority, 'sm'),
    h('span', { class: 'site-row-main' },
      h('strong', {}, site.name),
      h('small', { class: 'muted' }, `${site.typeLabel} · ${site.district} · ${ago(site.daysSinceInspection)}`)),
    h('span', { class: 'site-row-tags' }, statusBadges(site)),
    icon('chevron'));
}

function kpi(label, value, tone, href, sub) {
  return h('a', { class: `kpi kpi-${tone}`, href }, h('span', { class: 'kpi-label' }, label), h('strong', { class: 'kpi-value' }, value), sub ? h('small', {}, sub) : null);
}

export function render(app) {
  const sites = app.db.rankedSites();
  const counts = summarise(sites, app.db.inspections, app.db.today());
  const overdue = sites.filter((s) => s.overdue);
  const next = sites.slice(0, 5);
  const firstName = app.user.name.split(' ')[0];
  const mine = app.user.assignedDistrict ? sites.filter((s) => s.district === app.user.assignedDistrict).slice(0, 3) : [];

  const byDistrict = Object.entries(
    sites.reduce((acc, s) => { (acc[s.district] ??= { High: 0, Medium: 0, Low: 0 })[s.priority] += 1; return acc; }, {}),
  ).sort((a, b) => (b[1].High - a[1].High) || (b[1].High + b[1].Medium + b[1].Low) - (a[1].High + a[1].Medium + a[1].Low));
  const maxCount = Math.max(1, ...byDistrict.map(([, c]) => c.High + c.Medium + c.Low));

  const check = app.lastOverdueCheck;
  const threshold = app.db.settings.overdueThresholdDays;

  const primary = app.can('recordInspection')
    ? h('a', { class: 'btn btn-primary', href: '#/inspect' }, icon('clipboard'), 'Record inspection')
    : h('a', { class: 'btn btn-primary', href: '#/sites/new' }, icon('plus'), 'Register site');

  return h('div', { class: 'page' },
    pageHeader(`Hello, ${firstName}`, `${plural(counts.total, 'active site')} ranked by environmental risk.`, primary),

    overdue.length
      ? h('a', { class: 'alert alert-overdue', href: '#/sites?overdue=1' }, icon('clock'),
        h('span', {}, h('strong', {}, `${plural(overdue.length, 'site')} overdue for inspection. `),
          `Not inspected in the last ${threshold} days, or never inspected.`),
        h('span', { class: 'alert-link' }, 'View', icon('chevron', 16)))
      : null,

    h('section', { class: 'kpis', 'aria-label': 'Summary' },
      kpi('High priority', counts.high, 'high', '#/sites?priority=High', 'score 67 or more'),
      kpi('Medium priority', counts.medium, 'medium', '#/sites?priority=Medium', 'score 34 to 66'),
      kpi('Overdue', counts.overdue, 'overdue', '#/sites?overdue=1', `${counts.neverInspected} never inspected`),
      kpi('Inspections this month', counts.inspectionsThisMonth, 'neutral', '#/reports', 'all inspectors')),

    h('div', { class: 'grid-2' },
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', {}, 'Visit next'), h('a', { class: 'link', href: '#/sites' }, 'Full ranked list', icon('chevron', 16))),
        next.length ? h('div', { class: 'site-rows' }, next.map(siteRow)) : h('p', { class: 'muted' }, 'No sites yet.'),
        mine.length && app.user.role === 'INSPECTOR'
          ? h('div', {}, h('h3', { class: 'subhead' }, `Top sites in your district (${app.user.assignedDistrict})`), h('div', { class: 'site-rows' }, mine.map(siteRow)))
          : null),

      h('div', { class: 'stack' },
        h('section', { class: 'card' },
          h('h2', {}, 'Risk by district'),
          h('div', { class: 'legend' }, ['High', 'Medium', 'Low'].map((p) => h('span', {}, h('i', { class: `dot dot-${p.toLowerCase()}` }), p))),
          h('ul', { class: 'district-bars' }, byDistrict.slice(0, 8).map(([district, c]) =>
            h('li', {},
              h('a', { href: `#/sites?district=${encodeURIComponent(district)}` }, district),
              h('span', { class: 'stacked', style: { width: `${((c.High + c.Medium + c.Low) / maxCount) * 100}%` }, title: `${c.High} high, ${c.Medium} medium, ${c.Low} low` },
                ['High', 'Medium', 'Low'].map((p) => c[p] ? h('i', { class: `seg seg-${p.toLowerCase()}`, style: { flexGrow: c[p] } }) : null)),
              h('span', { class: 'num' }, c.High + c.Medium + c.Low))))),
        h('section', { class: 'card card-quiet' },
          h('h2', {}, icon('clock', 18), 'Automatic overdue check'),
          h('p', { class: 'muted small' },
            `Runs when you log in and every hour. Sites are overdue after ${threshold} days without an inspection`,
            app.can('adjustWeights') ? [' (', h('a', { class: 'link', href: '#/settings' }, 'change'), ').'] : '.'),
          h('p', { class: 'small' }, check ? `Last run ${formatDateTime(check.at)}: ${plural(check.overdue.length, 'site')} overdue.` : 'Not run yet.')))));
}
