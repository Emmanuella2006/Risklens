// Ranked site list (SRS FR 4.1) with search and filters (FR 4.2).
// Admins can export the list they are looking at as CSV (FR 6.2).
import { h, icon, scoreRing, priorityBadge, statusBadges, factorBars, ago, distance, pageHeader, emptyState, select, download, toast, plural } from '../ui.js';
import { filterSites } from '../../src/sites.js';
import { DISTRICTS, SITE_CATEGORIES } from '../../src/catalog.js';
import { rankedSitesCsv } from '../../src/csv.js';

const FILTER_KEYS = ['query', 'priority', 'district', 'type', 'overdue', 'archived'];

function readFilters(query) {
  const type = query.get('type') ?? '';
  return {
    query: query.get('q') ?? '',
    priority: query.get('priority') ?? '',
    district: query.get('district') ?? '',
    type,
    overdueOnly: query.get('overdue') === '1',
    showArchived: query.get('archived') === '1',
  };
}

function toQuery(f) {
  const q = new URLSearchParams();
  if (f.query) q.set('q', f.query);
  if (f.priority) q.set('priority', f.priority);
  if (f.district) q.set('district', f.district);
  if (f.type) q.set('type', f.type);
  if (f.overdueOnly) q.set('overdue', '1');
  if (f.showArchived) q.set('archived', '1');
  const s = q.toString();
  return s ? `?${s}` : '';
}

function siteCard(site, app) {
  return h('article', { class: `site-card${site.archived ? ' is-archived' : ''}` },
    h('a', { class: 'site-card-link', href: `#/sites/${site.id}`, 'aria-label': `${site.name}, rank ${site.rank ?? 'archived'}, score ${site.score}` }),
    h('div', { class: 'site-card-rank' }, site.rank ? `#${site.rank}` : '—'),
    scoreRing(site.score, site.priority),
    h('div', { class: 'site-card-body' },
      h('div', { class: 'site-card-title' }, h('h3', {}, site.name), priorityBadge(site.priority)),
      h('p', { class: 'meta' },
        h('span', {}, icon('sites', 14), site.typeLabel),
        h('span', {}, icon('pin', 14), site.district),
        h('span', {}, icon('droplet', 14), distance(site.distanceToWaterMetres)),
        h('span', {}, icon('clock', 14), ago(site.daysSinceInspection))),
      h('div', { class: 'tags' }, statusBadges(site))),
    h('div', { class: 'site-card-factors' }, factorBars(site.points, true)),
    app.can('recordInspection') && !site.archived
      ? h('a', { class: 'btn btn-small btn-ghost site-card-action', href: `#/inspect/${site.id}` }, icon('clipboard', 16), 'Inspect')
      : null);
}

export function render(app) {
  const all = app.db.rankedSites({ includeArchived: true });
  const filters = readFilters(app.query);
  const results = h('div', { class: 'site-list', 'aria-live': 'polite' });
  const countLine = h('p', { class: 'muted small', role: 'status' });
  let shown = [];

  const typeOptions = [['', 'All site types'], ...SITE_CATEGORIES.map((c) => [`cat:${c.label}`, `All ${c.label.toLowerCase()}`])];
  const typeSelect = select([
    ...typeOptions.slice(0, 1),
    { group: 'Categories', options: typeOptions.slice(1) },
    ...SITE_CATEGORIES.map((c) => ({ group: c.label, options: c.types })),
  ], filters.type, { 'aria-label': 'Site type' });
  const districtSelect = select([['', 'All districts'], ...DISTRICTS.map((d) => [d, d])], filters.district, { 'aria-label': 'District' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search by site name, district or type', value: filters.query, 'aria-label': 'Search sites' });
  const overdue = h('input', { type: 'checkbox', checked: filters.overdueOnly });
  const archived = h('input', { type: 'checkbox', checked: filters.showArchived });

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Risk level' },
    ['', 'High', 'Medium', 'Low'].map((p) => h('button', {
      type: 'button',
      class: `chip${p ? ` chip-${p.toLowerCase()}` : ''}`,
      'aria-pressed': String(filters.priority === p),
      onclick: () => { filters.priority = p; update(); },
    }, p || 'All levels')));

  function update() {
    filters.query = search.value;
    filters.district = districtSelect.value;
    filters.type = typeSelect.value;
    filters.overdueOnly = overdue.checked;
    filters.showArchived = archived.checked;
    chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === (filters.priority || 'All levels'))));
    history.replaceState(null, '', `#/sites${toQuery(filters)}`);

    shown = filterSites(all, {
      query: filters.query,
      priority: filters.priority,
      district: filters.district,
      siteType: filters.type && !filters.type.startsWith('cat:') ? filters.type : '',
      category: filters.type.startsWith('cat:') ? filters.type.slice(4) : '',
      overdueOnly: filters.overdueOnly,
      showArchived: filters.showArchived,
    });
    const active = all.filter((s) => !s.archived).length;
    countLine.textContent = `Showing ${shown.length} of ${plural(active, 'active site')}, highest risk first.`;
    results.replaceChildren(...(shown.length
      ? shown.map((s) => siteCard(s, app))
      : [emptyState('No sites match these filters', 'Try a different search or clear the filters.',
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: clear }, 'Clear filters'))]));
  }

  function clear() {
    search.value = '';
    districtSelect.value = '';
    typeSelect.value = '';
    overdue.checked = false;
    archived.checked = false;
    filters.priority = '';
    update();
  }

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 120); });
  [districtSelect, typeSelect, overdue, archived].forEach((c) => c.addEventListener('change', update));

  const exportBtn = app.can('exportCsv')
    ? h('button', {
      class: 'btn btn-ghost',
      type: 'button',
      onclick: () => {
        download(`risklens-ranked-sites-${app.db.today()}.csv`, rankedSitesCsv(shown));
        toast(`Exported ${plural(shown.length, 'site')} to CSV.`);
      },
    }, icon('download'), 'Export CSV')
    : null;
  const addBtn = app.can('manageSites') ? h('a', { class: 'btn btn-primary', href: '#/sites/new' }, icon('plus'), 'Register site') : null;

  const page = h('div', { class: 'page' },
    pageHeader('Ranked sites', 'Every active site, ordered by risk score. Visit the top of the list first.', exportBtn, addBtn),
    h('section', { class: 'filters card' },
      h('div', { class: 'search-box' }, icon('search'), search),
      h('div', { class: 'filter-row' }, chips, districtSelect, typeSelect,
        h('label', { class: 'check' }, overdue, 'Overdue only'),
        app.can('manageSites') ? h('label', { class: 'check' }, archived, 'Show archived') : null,
        h('button', { class: 'link-btn', type: 'button', onclick: clear }, 'Clear'))),
    countLine,
    results);
  update();
  return page;
}

export { FILTER_KEYS };
