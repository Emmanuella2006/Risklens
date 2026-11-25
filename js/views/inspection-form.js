// Record an inspection outcome (SRS FR 2.1) with violation details (FR 2.2).
// Inspectors only. Saving re-scores the site straight away (FR 3.2, NFR 2)
// and the record can never be edited or deleted afterwards (NFR 4).
import { h, icon, field, select, showErrors, scoreRing, toast, pageHeader, confirmDialog, priorityBadge, ago, plural } from '../ui.js';
import { VIOLATION_CATEGORIES, SEVERITIES, OUTCOMES } from '../../src/catalog.js';
import { previewScore } from '../../src/sites.js';
import { ValidationError } from '../../src/db.js';

export function render(app, presetId) {
  const today = app.db.today();
  const sites = app.db.rankedSites();
  const preset = presetId ? sites.find((s) => s.id === presetId) : null;
  if (presetId && !preset) {
    return h('section', { class: 'card narrow center' }, h('h1', {}, 'Site not available'), h('p', { class: 'muted' }, 'This site does not exist or is archived.'), h('a', { class: 'btn btn-primary', href: '#/inspect' }, 'Choose another site'));
  }

  const siteSelect = select([['', 'Choose a site'], ...sites.map((s) => [s.id, `#${s.rank} ${s.name} (${s.district}) · score ${s.score}`])], preset?.id ?? '', { required: true });
  const visitDate = h('input', { class: 'input', type: 'date', max: today, value: today, required: true });
  const notes = h('textarea', { class: 'input', rows: 3, maxlength: 2000, placeholder: 'What you checked and anything worth following up.' });

  let outcome = '';
  const outcomeButtons = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Outcome' },
    Object.entries(OUTCOMES).map(([value, label]) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', class: `seg-btn seg-${value.toLowerCase()}`, dataset: { value } },
        icon(value === 'PASS' ? 'check' : 'alert', 18), label);
      b.addEventListener('click', () => setOutcome(value));
      return b;
    }));
  outcomeButtons.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    setOutcome(outcome === 'PASS' ? 'VIOLATION' : 'PASS');
    outcomeButtons.querySelector('[aria-checked="true"]').focus();
  });

  const violationList = h('div', { class: 'violation-list' });
  const addViolationBtn = h('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => { addViolation(); preview(); } }, icon('plus', 16), 'Add another violation');
  const violationSection = h('fieldset', { class: 'violation-section', hidden: true },
    h('legend', {}, 'Violation details'),
    h('div', { class: 'field', dataset: { field: 'violations' } }, h('span', { class: 'field-error', 'aria-live': 'polite' })),
    violationList,
    addViolationBtn);

  function renumber() {
    [...violationList.children].forEach((row, i) => {
      row.querySelector('.violation-title').textContent = `Violation ${i + 1}`;
      row.querySelector('[data-field$=".category"]').dataset.field = `violations.${i}.category`;
      row.querySelector('[data-field$=".severity"]').dataset.field = `violations.${i}.severity`;
      row.querySelector('[data-field$=".description"]').dataset.field = `violations.${i}.description`;
      row.querySelector('.remove').hidden = violationList.children.length === 1;
    });
  }

  function addViolation() {
    const cat = select([['', 'Choose a category'], ...VIOLATION_CATEGORIES.map((v) => [v, v])], '');
    const sev = select([['', 'Choose severity'], ...Object.entries(SEVERITIES)], '');
    const desc = h('textarea', { class: 'input', rows: 2, maxlength: 1000, placeholder: 'What was found, where, and how serious it is.' });
    const row = h('div', { class: 'violation-row' },
      h('div', { class: 'violation-row-head' }, h('strong', { class: 'violation-title' }),
        h('button', { class: 'link-btn remove', type: 'button', onclick: () => { row.remove(); renumber(); preview(); } }, icon('trash', 14), 'Remove')),
      h('div', { class: 'row-2' }, field('Category', cat, { name: 'violations.0.category', required: true }), field('Severity', sev, { name: 'violations.0.severity', required: true })),
      field('Description', desc, { name: 'violations.0.description', required: true }));
    violationList.append(row);
    renumber();
    return row;
  }

  function setOutcome(value) {
    outcome = value;
    outcomeButtons.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.value === value;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    violationSection.hidden = value !== 'VIOLATION';
    if (value === 'VIOLATION' && violationList.children.length === 0) addViolation();
    app.setDirty(true);
    preview();
  }

  function values() {
    return {
      siteId: siteSelect.value,
      visitDate: visitDate.value,
      outcome,
      notes: notes.value,
      violations: outcome === 'VIOLATION' ? [...violationList.children].map((row) => {
        const [cat, sev] = row.querySelectorAll('select');
        return { category: cat.value, severity: sev.value, description: row.querySelector('textarea').value };
      }) : [],
    };
  }

  const siteSummary = h('div', { class: 'site-summary' });
  const previewBox = h('aside', { class: 'card preview sticky', 'aria-live': 'polite' });

  function preview() {
    const site = sites.find((s) => s.id === siteSelect.value);
    if (!site) {
      siteSummary.replaceChildren();
      previewBox.replaceChildren(h('p', { class: 'eyebrow' }, 'Score preview'), h('p', { class: 'muted' }, 'Choose a site to see its score.'));
      return;
    }
    siteSummary.replaceChildren(
      h('span', {}, priorityBadge(site.priority), ` Rank #${site.rank} · ${site.typeLabel} · ${site.lastInspectionDate ? `last inspected ${ago(site.daysSinceInspection).toLowerCase()}` : 'never inspected'}`),
      h('a', { class: 'link', href: `#/sites/${site.id}` }, 'View history'));
    const v = values();
    let after = null;
    if (v.outcome && v.visitDate && v.visitDate <= today) {
      const fake = { ...v, violations: v.outcome === 'VIOLATION' ? (v.violations.length ? v.violations : [{}]) : [] };
      after = previewScore(app.db.data, site.id, fake, today);
    }
    previewBox.replaceChildren(
      h('p', { class: 'eyebrow' }, 'Score preview'),
      h('div', { class: 'before-after' },
        h('div', {}, h('small', {}, 'Now'), scoreRing(site.score, site.priority)),
        icon('chevron', 22),
        h('div', {}, h('small', {}, 'After saving'), after ? scoreRing(after.score, after.priority) : h('div', { class: 'ring ring-md ring-empty' }, h('span', { class: 'ring-value' }, '?')))),
      after
        ? h('p', { class: 'small' }, after.score === site.score ? 'The score stays the same.' : `The score will go ${after.score > site.score ? 'up' : 'down'} by ${Math.abs(after.score - site.score)} points.`)
        : h('p', { class: 'muted small' }, 'Choose the outcome to see the new score.'));
  }

  const submit = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Save inspection');
  const form = h('form', { class: 'card form', novalidate: true },
    field('Site', siteSelect, { name: 'siteId', required: true }),
    siteSummary,
    field('Date of visit', visitDate, { name: 'visitDate', required: true }),
    h('div', { class: 'field', dataset: { field: 'outcome' } },
      h('span', { class: 'label' }, 'Outcome', h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')),
      outcomeButtons,
      h('span', { class: 'field-error', 'aria-live': 'polite' })),
    violationSection,
    field('Notes', notes, { name: 'notes', hint: 'Optional.' }),
    h('p', { class: 'muted small' }, icon('info', 14), ' Saved inspections cannot be edited or deleted, so check the details before saving.'),
    h('div', { class: 'form-actions' }, h('a', { class: 'btn btn-ghost', href: preset ? `#/sites/${preset.id}` : '#/dashboard' }, 'Cancel'), submit));

  siteSelect.addEventListener('change', preview);
  form.addEventListener('input', () => { app.setDirty(true); preview(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = values();
    const { validateInspection } = await import('../../src/validation.js');
    const errors = validateInspection(v, today);
    if (Object.keys(errors).length) { showErrors(form, errors); return; }
    showErrors(form, {});
    const site = sites.find((s) => s.id === v.siteId);
    const ok = await confirmDialog({
      title: 'Save this inspection?',
      body: h('div', {},
        h('p', {}, h('strong', {}, site.name), ` — ${OUTCOMES[v.outcome]}${v.outcome === 'VIOLATION' ? `, ${plural(v.violations.length, 'violation')}` : ''}, visited ${v.visitDate}.`),
        h('p', { class: 'muted' }, 'Inspection records are permanent: once saved they cannot be edited or deleted.')),
      confirmLabel: 'Save inspection',
    });
    if (!ok) return;
    try {
      const result = app.db.recordInspection(v, app.user);
      app.setDirty(false);
      const updated = app.db.site(v.siteId);
      toast(`Inspection saved. ${site.name}: score ${result.before} → ${result.after} (${updated.priority}), now rank #${updated.rank}. Updated in ${Math.max(1, Math.round(result.elapsedMs))} ms.`, 'success', 7000);
      app.go(`/sites/${v.siteId}`);
    } catch (err) {
      if (err instanceof ValidationError) showErrors(form, err.errors);
      else toast(err.message, 'error', 10000); // e.g. storage full: nothing is lost silently
    }
  });

  preview();
  return h('div', { class: 'page' },
    pageHeader('Record inspection', `Logged in as ${app.user.name}. The site's risk score is updated as soon as you save.`),
    h('div', { class: 'form-layout' }, form, previewBox));
}
