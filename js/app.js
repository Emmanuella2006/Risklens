import { rankSites } from '../src/scoring.js';
import { buildSiteFromForm, SITE_TYPE_LABELS, DISTRICTS } from './site-form.js';
import { loadSites, saveSites } from './storage.js';

let sites = loadSites();

const form = document.querySelector('#site-form');
const errorBox = document.querySelector('#form-errors');
const tableBody = document.querySelector('#ranked-body');
const emptyState = document.querySelector('#empty-state');
const tableWrap = document.querySelector('#table-wrap');
const distanceInput = form.elements.distanceToWaterMetres;
const dateInput = form.elements.lastInspectionDate;

// Fill the dropdowns.
for (const district of DISTRICTS) {
  form.elements.district.append(new Option(district, district));
}
for (const [value, label] of Object.entries(SITE_TYPE_LABELS)) {
  form.elements.siteType.append(new Option(label, value));
}
dateInput.max = new Date().toISOString().slice(0, 10);

// "Not known" and "Never inspected" switch off their inputs.
form.elements.distanceUnknown.addEventListener('change', (e) => {
  distanceInput.disabled = e.target.checked;
  if (e.target.checked) distanceInput.value = '';
});
form.elements.neverInspected.addEventListener('change', (e) => {
  dateInput.disabled = e.target.checked;
  if (e.target.checked) dateInput.value = '';
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const { site, errors } = buildSiteFromForm({
    name: form.elements.name.value,
    district: form.elements.district.value,
    siteType: form.elements.siteType.value,
    pastViolations: form.elements.pastViolations.value,
    distanceToWaterMetres: distanceInput.value,
    distanceUnknown: form.elements.distanceUnknown.checked,
    lastInspectionDate: dateInput.value,
    neverInspected: form.elements.neverInspected.checked,
  });

  if (errors.length > 0) {
    showErrors(errors);
    return;
  }

  showErrors([]);
  sites.push(site);
  persistAndRender();
  form.reset();
  distanceInput.disabled = false;
  dateInput.disabled = false;
  form.elements.name.focus();
});

document.querySelector('#load-sample').addEventListener('click', async () => {
  const response = await fetch('data/sample-sites.json');
  const sample = await response.json();
  const existingIds = new Set(sites.map((s) => s.id));
  sites = sites.concat(sample.filter((s) => !existingIds.has(s.id)));
  persistAndRender();
});

document.querySelector('#clear-all').addEventListener('click', () => {
  if (sites.length === 0) return;
  if (!window.confirm('Remove all sites from the list?')) return;
  sites = [];
  persistAndRender();
});

tableBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-remove]');
  if (!button) return;
  sites = sites.filter((s) => s.id !== button.dataset.remove);
  persistAndRender();
});

function persistAndRender() {
  saveSites(sites);
  render();
}

function showErrors(errors) {
  errorBox.replaceChildren(...errors.map((message) => {
    const li = document.createElement('li');
    li.textContent = message;
    return li;
  }));
  errorBox.hidden = errors.length === 0;
}

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function render() {
  const ranked = rankSites(sites);
  const counts = { High: 0, Medium: 0, Low: 0 };
  ranked.forEach((s) => { counts[s.priority] += 1; });
  document.querySelector('#count-high').textContent = counts.High;
  document.querySelector('#count-medium').textContent = counts.Medium;
  document.querySelector('#count-low').textContent = counts.Low;

  emptyState.hidden = ranked.length > 0;
  tableWrap.hidden = ranked.length === 0;

  tableBody.replaceChildren(...ranked.map((site) => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    const name = document.createElement('strong');
    name.textContent = site.name;
    const detail = document.createElement('span');
    detail.className = 'muted';
    detail.textContent = `${SITE_TYPE_LABELS[site.siteType]} · ${site.district}`;
    nameCell.append(name, document.createElement('br'), detail);

    const breakdown = `Type ${site.points.siteType} · Violations ${site.points.violations} · Water ${site.points.waterDistance} · Inspection ${site.points.inspectionAge}`;

    const priorityCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge badge-${site.priority.toLowerCase()}`;
    badge.textContent = site.priority;
    priorityCell.append(badge);

    const actionCell = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link-button';
    remove.dataset.remove = site.id;
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${site.name}`);
    actionCell.append(remove);

    row.append(
      cell(site.rank, 'rank'),
      nameCell,
      cell(site.score, 'score'),
      priorityCell,
      cell(breakdown, 'muted small'),
      actionCell,
    );
    return row;
  }));
}

render();
