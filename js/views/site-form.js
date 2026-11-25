// Register a new site (SRS FR 1.1) or edit one (FR 1.2). Administrators only.
// Shows the starting risk score live while the form is filled in.
import { h, icon, field, select, showErrors, scoreRing, toast, pageHeader, factorBars } from '../ui.js';
import { SITE_CATEGORIES, DISTRICTS, PROJECT_SCALES } from '../../src/catalog.js';
import { calculateRiskScore } from '../../src/scoring.js';
import { ValidationError } from '../../src/db.js';

export function render(app, id) {
  const editing = id ? app.db.site(id) : null;
  if (id && !editing) return h('section', { class: 'card narrow center' }, h('h1', {}, 'Site not found'), h('a', { class: 'btn btn-primary', href: '#/sites' }, 'Back'));
  const s = editing ?? { name: '', district: '', siteType: '', projectScale: '', distanceToWaterMetres: null, latitude: null, longitude: null, priorViolations: 0, priorInspectionDate: null };
  const today = app.db.today();

  const c = {
    name: h('input', { class: 'input', value: s.name, maxlength: 100, required: true, autocomplete: 'off' }),
    district: select([['', 'Choose a district'], ...DISTRICTS.map((d) => [d, d])], s.district, { required: true }),
    siteType: select([['', 'Choose a type'], ...SITE_CATEGORIES.map((cat) => ({ group: cat.label, options: cat.types }))], s.siteType, { required: true }),
    projectScale: select([['', 'Choose a scale'], ...Object.entries(PROJECT_SCALES)], s.projectScale, { required: true }),
    distanceToWaterMetres: h('input', { class: 'input', type: 'number', min: 0, max: 100000, step: 1, inputmode: 'numeric', value: s.distanceToWaterMetres ?? '' }),
    latitude: h('input', { class: 'input', type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'e.g. -1.9441', value: s.latitude ?? '' }),
    longitude: h('input', { class: 'input', type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'e.g. 30.0619', value: s.longitude ?? '' }),
    priorViolations: h('input', { class: 'input', type: 'number', min: 0, max: 99, step: 1, inputmode: 'numeric', value: s.priorViolations ?? 0 }),
    priorInspectionDate: h('input', { class: 'input', type: 'date', max: today, value: s.priorInspectionDate ?? '' }),
  };

  const gps = h('button', { class: 'btn btn-ghost btn-small', type: 'button' }, icon('pin', 16), 'Use my location');
  gps.addEventListener('click', () => {
    if (!navigator.geolocation) { toast('This device cannot share its location.', 'error'); return; }
    gps.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        c.latitude.value = pos.coords.latitude.toFixed(5);
        c.longitude.value = pos.coords.longitude.toFixed(5);
        gps.disabled = false;
        preview();
      },
      () => { toast('Could not get your location. Type the coordinates instead.', 'error'); gps.disabled = false; },
      { timeout: 10000 });
  });

  const values = () => Object.fromEntries(Object.entries(c).map(([k, el]) => [k, el.value]));

  const previewBox = h('aside', { class: 'card preview sticky' });
  function preview() {
    const v = values();
    const pastViolations = (editing ? editing.pastViolations - (editing.priorViolations ?? 0) : 0) + (Number.parseInt(v.priorViolations, 10) || 0);
    let lastInspectionDate = v.priorInspectionDate || null;
    if (editing && editing.lastInspectionDate && editing.lastInspectionDate !== editing.priorInspectionDate) {
      lastInspectionDate = [lastInspectionDate, editing.lastInspectionDate].filter(Boolean).sort().at(-1);
    }
    if (!v.siteType) {
      previewBox.replaceChildren(h('p', { class: 'eyebrow' }, 'Starting risk score'), h('p', { class: 'muted' }, 'Choose a site type to see the score.'));
      return;
    }
    try {
      const r = calculateRiskScore({
        siteType: v.siteType,
        pastViolations: Math.max(0, pastViolations),
        distanceToWaterMetres: v.distanceToWaterMetres === '' ? null : Number(v.distanceToWaterMetres),
        lastInspectionDate,
      }, { weights: app.db.settings.weights, asOfDate: today });
      previewBox.replaceChildren(
        h('p', { class: 'eyebrow' }, editing ? 'Risk score after saving' : 'Starting risk score'),
        h('div', { class: 'preview-score' }, scoreRing(r.score, r.priority), h('strong', {}, `${r.priority} priority`)),
        factorBars(r.points),
        h('p', { class: 'muted small' }, 'Updates as you type, using the current scoring weights.'));
    } catch {
      previewBox.replaceChildren(h('p', { class: 'eyebrow' }, 'Starting risk score'), h('p', { class: 'muted' }, 'Finish the form to see the score.'));
    }
  }

  const submit = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, editing ? 'Save changes' : 'Register site');
  const form = h('form', { class: 'card form', novalidate: true },
    h('fieldset', {},
      h('legend', {}, 'About the site'),
      field('Site name', c.name, { name: 'name', required: true }),
      h('div', { class: 'row-2' },
        field('Site type', c.siteType, { name: 'siteType', required: true }),
        field('Project scale', c.projectScale, { name: 'projectScale', required: true, hint: 'Size of the project or facility.' }))),
    h('fieldset', {},
      h('legend', {}, 'Location'),
      field('District', c.district, { name: 'district', required: true }),
      h('div', { class: 'row-2' },
        field('Latitude', c.latitude, { name: 'latitude', hint: 'Optional. Decimal degrees.' }),
        field('Longitude', c.longitude, { name: 'longitude', hint: 'Optional. Decimal degrees.' })),
      gps,
      field('Distance to nearest water source or wetland (metres)', c.distanceToWaterMetres, { name: 'distanceToWaterMetres', hint: 'Leave empty if unknown. Unknown is scored as closest, so the site is not ranked too low.' })),
    h('fieldset', {},
      h('legend', {}, 'History before RiskLens'),
      h('div', { class: 'row-2' },
        field('Past violations on record', c.priorViolations, { name: 'priorViolations', hint: 'From paper records. Violations logged in RiskLens are added automatically.' }),
        field('Last inspection date', c.priorInspectionDate, { name: 'priorInspectionDate', hint: 'Leave empty if never inspected.' }))),
    h('div', { class: 'form-actions' }, h('a', { class: 'btn btn-ghost', href: editing ? `#/sites/${id}` : '#/sites' }, 'Cancel'), submit));

  form.addEventListener('input', () => { app.setDirty(true); preview(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const saved = editing ? app.db.updateSite(id, values(), app.user) : app.db.addSite(values(), app.user);
      app.setDirty(false);
      const scored = app.db.site(saved.id);
      toast(editing ? `${saved.name} updated. Score ${scored.score} (${scored.priority}).` : `${saved.name} registered with a starting score of ${scored.score} (${scored.priority}), rank ${scored.rank}.`);
      app.go(`/sites/${saved.id}`);
    } catch (err) {
      if (err instanceof ValidationError) showErrors(form, err.errors);
      else toast(err.message, 'error', 8000);
    }
  });

  preview();
  return h('div', { class: 'page' },
    h('a', { class: 'back', href: editing ? `#/sites/${id}` : '#/sites' }, icon('back', 16), editing ? editing.name : 'Ranked sites'),
    pageHeader(editing ? `Edit ${editing.name}` : 'Register a new site', editing ? 'Changes are saved to the site and its score is worked out again.' : 'Add a site that needs environmental inspection. It is scored and ranked as soon as it is saved.'),
    h('div', { class: 'form-layout' }, form, previewBox));
}
