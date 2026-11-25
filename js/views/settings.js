// Scoring settings, administrators only (SRS FR 5.2, business rule 5.3):
// factor weights, the overdue window (FR 7.1), backups and the activity log.
import { h, icon, pageHeader, toast, confirmDialog, download, showErrors, formatDateTime, FACTOR_LABELS, plural } from '../ui.js';
import { DEFAULT_WEIGHTS, MIN_WEIGHT, MAX_WEIGHT, FACTORS, validateWeights } from '../../src/scoring.js';
import { buildRankedSites } from '../../src/sites.js';
import { ValidationError } from '../../src/db.js';

const FACTOR_HELP = {
  siteType: 'How harmful this kind of activity usually is (chemical plant high, office low).',
  violations: 'Violations found before and since RiskLens.',
  waterDistance: 'How close the site is to a river, lake or wetland.',
  inspectionAge: 'How long since the site was last inspected.',
};

export function render(app) {
  const current = app.db.settings;
  const weights = { ...current.weights };
  const today = app.db.today();
  const baseline = app.db.rankedSites();
  const baselineRank = Object.fromEntries(baseline.map((s) => [s.id, s.rank]));

  const days = h('input', { class: 'input', type: 'number', min: 30, max: 1095, step: 1, value: current.overdueThresholdDays, id: 'overdue-days' });
  const previewList = h('ol', { class: 'preview-rank' });
  const sliders = {};

  function updatePreview() {
    const errors = validateWeights(weights);
    if (errors.length) {
      previewList.replaceChildren(h('li', { class: 'muted' }, errors[0]));
      return;
    }
    const ranked = buildRankedSites({ ...app.db.data, settings: { ...current, weights, overdueThresholdDays: Number(days.value) || current.overdueThresholdDays } }, { asOfDate: today });
    previewList.replaceChildren(...ranked.slice(0, 8).map((s) => {
      const move = baselineRank[s.id] - s.rank;
      return h('li', {},
        h('span', { class: 'rank' }, `#${s.rank}`),
        h('span', { class: 'grow' }, s.name),
        h('span', { class: `badge badge-${s.priority.toLowerCase()}` }, s.score),
        h('span', { class: `move ${move > 0 ? 'up' : move < 0 ? 'down' : ''}`, title: 'Change in rank' }, move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '–'));
    }));
  }

  const weightRows = FACTORS.map((f) => {
    const out = h('output', { class: 'weight-value' }, `×${weights[f]}`);
    const input = h('input', { type: 'range', min: MIN_WEIGHT, max: MAX_WEIGHT, step: 0.5, value: weights[f], id: `w-${f}`, 'aria-describedby': `w-${f}-help` });
    input.addEventListener('input', () => {
      weights[f] = Number(input.value);
      out.textContent = `×${weights[f]}`;
      app.setDirty(true);
      updatePreview();
    });
    sliders[f] = { input, out };
    return h('div', { class: 'weight-row' },
      h('label', { for: `w-${f}` }, FACTOR_LABELS[f]),
      input, out,
      h('small', { class: 'muted', id: `w-${f}-help` }, FACTOR_HELP[f]));
  });
  days.addEventListener('input', () => { app.setDirty(true); updatePreview(); });

  const form = h('form', { class: 'card form', novalidate: true },
    h('h2', {}, 'Factor weights'),
    h('p', { class: 'muted small' }, `Each factor gives 0 to 3 points. The weight says how much it counts, from ${MIN_WEIGHT} (ignored) to ${MAX_WEIGHT} (three times as much). Changes apply to every site straight away.`),
    h('div', { class: 'field', dataset: { field: 'weights' } }, weightRows, h('span', { class: 'field-error', 'aria-live': 'polite' })),
    h('h2', {}, 'Overdue inspections'),
    h('div', { class: 'field', dataset: { field: 'overdueThresholdDays' } },
      h('label', { for: 'overdue-days' }, 'Flag a site as overdue after this many days without an inspection'),
      days,
      h('span', { class: 'hint' }, 'From 30 to 1,095 days. Sites that have never been inspected are always overdue.'),
      h('span', { class: 'field-error', 'aria-live': 'polite' })),
    h('div', { class: 'form-actions' },
      h('button', {
        class: 'btn btn-ghost', type: 'button',
        onclick: () => {
          Object.assign(weights, DEFAULT_WEIGHTS);
          FACTORS.forEach((f) => { sliders[f].input.value = weights[f]; sliders[f].out.textContent = `×${weights[f]}`; });
          days.value = 365;
          app.setDirty(true);
          updatePreview();
        },
      }, 'Back to defaults'),
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save settings')),
    current.updatedAt ? h('p', { class: 'muted small' }, `Last changed ${formatDateTime(current.updatedAt)} by ${app.db.user(current.updatedBy)?.name ?? 'unknown'}.`) : null);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      app.db.updateSettings({ weights: { ...weights }, overdueThresholdDays: Number(days.value) }, app.user);
      app.setDirty(false);
      toast('Settings saved. All sites have been re-scored and re-ranked.');
      app.refresh();
    } catch (err) {
      if (err instanceof ValidationError) showErrors(form, err.errors);
      else toast(err.message, 'error', 8000);
    }
  });

  // ---------- data ----------
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const ok = await confirmDialog({ title: 'Restore this backup?', body: `The data on this device will be replaced with "${file.name}". Backups that are missing any inspection records already on this device are refused.`, confirmLabel: 'Restore backup', danger: true });
    if (!ok) return;
    try {
      app.db.importBackup(await file.text(), app.user);
      toast('Backup restored.');
      app.refresh();
    } catch (err) {
      toast(`Backup not restored: ${err.message}`, 'error', 9000);
    }
  });

  const online = app.remote ? onlineCard(app) : null;
  const data = app.remote ? online : h('section', { class: 'card' },
    h('h2', {}, 'Data on this device'),
    h('p', { class: 'muted small' }, `This prototype keeps its data in this browser (${plural(app.db.sites.length, 'site')}, ${plural(app.db.inspections.length, 'inspection')}, ${plural(app.db.users.length, 'user')}). Download a backup regularly.`),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { download(`risklens-backup-${today}.json`, app.db.exportBackup(app.user), 'application/json'); toast('Backup downloaded.'); } }, icon('download'), 'Download backup'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => fileInput.click() }, icon('upload'), 'Restore backup'),
      fileInput),
    h('details', { class: 'danger-zone' },
      h('summary', {}, 'Demo tools'),
      h('p', { class: 'muted small' }, 'For demonstrations only. This replaces everything on this device, including inspection records, with the original demo data.'),
      h('button', {
        class: 'btn btn-danger btn-small', type: 'button',
        onclick: async () => {
          if (!(await confirmDialog({ title: 'Reset to demo data?', body: 'All sites, inspections, users and settings on this device will be replaced with the demo data. This cannot be undone. Download a backup first if you need the current data.', confirmLabel: 'Reset demo data', danger: true, typeToConfirm: 'RESET' }))) return;
          await app.db.seedDemo();
          app.logout('Demo data restored. Log in again.');
        },
      }, 'Reset demo data')));

  const log = h('section', { class: 'card' },
    h('h2', {}, icon('activity', 18), 'Recent activity'),
    h('ul', { class: 'activity' }, app.db.activity.slice(0, 15).map((a) =>
      h('li', {}, h('span', { class: 'muted small nowrap' }, formatDateTime(a.at)), h('span', {}, h('strong', {}, a.userName), ` ${a.action.toLowerCase()}`, a.detail ? `: ${a.detail}` : '')))));

  updatePreview();
  return h('div', { class: 'page' },
    pageHeader('Scoring settings', 'Only administrators can change how sites are scored.'),
    h('div', { class: 'form-layout' }, form,
      h('aside', { class: 'card preview sticky' },
        h('p', { class: 'eyebrow' }, 'Live preview: top 8'),
        previewList,
        h('p', { class: 'muted small' }, 'Arrows show how each site would move compared with the saved settings.'))),
    h('div', { class: 'grid-2' }, data, log));
}

/** Online database status: what is waiting to be sent, and anything the database refused. */
function onlineCard(app) {
  const st = app.remote.status;
  const failed = app.remote.failed;
  const syncBtn = h('button', { class: 'btn btn-ghost', type: 'button' }, icon('restore'), 'Sync now');
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    const ok = await app.remote.sync();
    toast(ok ? 'Up to date with the online database.' : 'Could not reach the online database. Changes stay on this device until it can.', ok ? 'success' : 'error');
    app.refresh();
  });
  return h('section', { class: 'card' },
    h('h2', {}, 'Online database'),
    h('p', { class: 'muted small' }, 'Data is stored in the RiskLens database (Supabase, PostgreSQL) and shared by every device. Each device also keeps a copy, so RiskLens works offline and sends changes when the connection is back.'),
    h('dl', { class: 'details' },
      h('dt', {}, 'Status'), h('dd', {}, st.online ? 'Online' : 'Offline'),
      h('dt', {}, 'Last synced'), h('dd', {}, st.lastSync ? formatDateTime(st.lastSync) : 'Not yet'),
      h('dt', {}, 'Waiting to send'), h('dd', {}, plural(st.pending, 'change')),
      h('dt', {}, 'Refused by the database'), h('dd', {}, plural(st.failed, 'change'))),
    failed.length ? h('p', { class: 'small field-error' }, failed.at(-1).error) : null,
    h('div', { class: 'btn-row' },
      syncBtn,
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { download(`risklens-backup-${app.db.today()}.json`, app.db.exportBackup(app.user), 'application/json'); toast('Backup downloaded.'); } }, icon('download'), 'Download backup'),
      failed.length ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => download('risklens-refused-changes.json', JSON.stringify(failed, null, 2), 'application/json') }, icon('download'), 'Download refused changes') : null));
}
