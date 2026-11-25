// User guide (SRS 2.6): how to register a site, log an inspection and read a score.
import { h, icon, pageHeader, scoreRing } from '../ui.js';
import { PRIORITY_LEVELS } from '../../src/scoring.js';

function step(n, title, ...body) {
  return h('li', { class: 'step' }, h('span', { class: 'step-n' }, n), h('div', {}, h('h3', {}, title), body));
}

export function render(app) {
  const threshold = app.db.settings.overdueThresholdDays;
  return h('div', { class: 'page help' },
    pageHeader('User guide', 'How to use RiskLens. Open this page any time from the menu.'),

    h('nav', { class: 'card toc', 'aria-label': 'On this page' },
      h('a', { href: '#/help', onclick: (e) => { e.preventDefault(); document.getElementById('h-score').scrollIntoView(); } }, 'Reading a risk score'),
      h('a', { href: '#/help', onclick: (e) => { e.preventDefault(); document.getElementById('h-inspect').scrollIntoView(); } }, 'Logging an inspection'),
      h('a', { href: '#/help', onclick: (e) => { e.preventDefault(); document.getElementById('h-site').scrollIntoView(); } }, 'Registering a site'),
      h('a', { href: '#/help', onclick: (e) => { e.preventDefault(); document.getElementById('h-roles').scrollIntoView(); } }, 'Roles'),
      h('a', { href: '#/help', onclick: (e) => { e.preventDefault(); document.getElementById('h-offline').scrollIntoView(); } }, 'Working offline')),

    h('section', { class: 'card', id: 'h-score' },
      h('h2', {}, 'Reading a risk score'),
      h('p', {}, 'Every site gets a score from 0 to 100. A higher score means the site is more likely to be harming the environment, so it should be inspected sooner. The ranked list puts the highest score at the top.'),
      h('div', { class: 'score-legend' },
        PRIORITY_LEVELS.map((p, i) => {
          const max = i === 0 ? 100 : PRIORITY_LEVELS[i - 1].min - 1;
          return h('div', {}, scoreRing(Math.round((p.min + max) / 2), p.label, 'sm'), h('div', {}, h('strong', {}, `${p.label} priority`), h('small', { class: 'muted' }, `${p.min} to ${max}`)));
        })),
      h('p', {}, 'The score comes from four factors, each worth 0 to 3 points:'),
      h('ul', {},
        h('li', {}, h('strong', {}, 'Site type'), ' — chemical plants, mines, quarries, large factories and waste facilities score 3; construction, small manufacturing, agro-processing and hotels 2; offices, shops and schools 1.'),
        h('li', {}, h('strong', {}, 'Past violations'), ' — 0, 1, 2, or 3 and more. Violations logged in RiskLens are added automatically.'),
        h('li', {}, h('strong', {}, 'Distance to water'), ' — under 100 m scores 3, under 500 m 2, up to 2 km 1, further 0. Unknown counts as 3.'),
        h('li', {}, h('strong', {}, 'Time since the last inspection'), ' — under 6 months 0, under a year 1, up to 2 years 2, longer or never 3.')),
      h('p', {}, 'An administrator sets how much each factor counts (its weight). Open any site to see its points for each factor. A purple ', h('span', { class: 'tag tag-overdue' }, icon('clock', 13), 'Overdue'),
        ` tag means the site has not been inspected in the last ${threshold} days.`)),

    h('section', { class: 'card', id: 'h-inspect' },
      h('h2', {}, 'Logging an inspection (inspectors)'),
      h('ol', { class: 'steps' },
        step(1, 'Open the form', 'Click ', h('strong', {}, 'Record inspection'), ' in the menu, or ', h('strong', {}, 'Inspect'), ' on a site.'),
        step(2, 'Choose the site and date', 'The date cannot be in the future.'),
        step(3, 'Choose the outcome', h('strong', {}, 'Pass'), ' if everything was in order, or ', h('strong', {}, 'Violation'), ' if you found problems.'),
        step(4, 'Describe each violation', 'For a violation, add the category, how serious it is (minor, major or critical) and what you found. Use ', h('strong', {}, 'Add another violation'), ' for more.'),
        step(5, 'Save', 'Check the score preview, then save. The site is re-scored and re-ranked straight away. Saved inspections cannot be edited or deleted.'))),

    h('section', { class: 'card', id: 'h-site' },
      h('h2', {}, 'Registering a site (administrators)'),
      h('ol', { class: 'steps' },
        step(1, 'Open the form', 'Click ', h('strong', {}, 'Register site'), '.'),
        step(2, 'Fill in the details', 'Name, type, project scale and district are required. Add the GPS location and the distance to the nearest water source if you have them.'),
        step(3, 'Add earlier history', 'Enter violations and the last inspection date from paper records, if any.'),
        step(4, 'Save', 'The starting score is shown while you type. To change a site later, open it and click ', h('strong', {}, 'Edit'), '. Closed sites can be archived; their history is kept.'))),

    h('section', { class: 'card', id: 'h-roles' },
      h('h2', {}, 'Roles'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Task'), h('th', {}, 'Inspector'), h('th', {}, 'Administrator'))),
        h('tbody', {}, [
          ['View the ranked list, sites and reports', true, true],
          ['Record inspections and violations', true, false],
          ['Register, edit and archive sites', false, true],
          ['Change scoring weights and the overdue window', false, true],
          ['Export CSV, manage users, back up data', false, true],
        ].map(([task, i, a]) => h('tr', {}, h('td', {}, task), h('td', {}, i ? '✓' : '—'), h('td', {}, a ? '✓' : '—'))))))),

    h('section', { class: 'card', id: 'h-offline' },
      h('h2', {}, 'Working offline'),
      h('p', {}, 'After RiskLens has been opened once, it keeps working without internet. Everything you save is stored on the device straight away, so nothing is lost if the connection drops. If a save ever fails (for example, the device is full), RiskLens shows an error and keeps what you typed on the form.'),
      h('p', { class: 'muted small' }, 'You are logged out automatically after 30 minutes without activity.')));
}
