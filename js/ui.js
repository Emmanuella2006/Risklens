// Small helpers for building the screens. Text from users is always added
// as text (never as HTML), so a site name cannot inject code into the page.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, String(v));
        else el.style[prop] = v;
      }
    }
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'html') el.innerHTML = value; // only used for the built-in icons below
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// Icons (Lucide-style line icons, drawn inline so the app works offline).
const PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  sites: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 10h.01M15 10h.01"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5.5 12 2.5c-.5 3-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.1-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5"/><path d="M12 20h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
};

export function icon(name, size = 18) {
  return h('span', {
    class: 'icon',
    'aria-hidden': 'true',
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] ?? ''}</svg>`,
  });
}

// ---------- formatting ----------

const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const DATETIME_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatDate(ymd) {
  if (!ymd) return 'Never';
  const [y, m, d] = ymd.split('-').map(Number);
  return DATE_FMT.format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateTime(iso) {
  return iso ? DATETIME_FMT.format(new Date(iso)) : '';
}

export function ago(days) {
  if (days === null || days === undefined) return 'Never inspected';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 60) return `${days} days ago`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} months ago`;
  return `${Math.floor(days / 365.25)} years ago`;
}

export function distance(metres) {
  if (metres === null || metres === undefined) return 'Unknown';
  return metres >= 1000 ? `${(metres / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} km` : `${metres} m`;
}

export function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

// ---------- shared pieces ----------

export function priorityBadge(priority) {
  return h('span', { class: `badge badge-${priority.toLowerCase()}` }, priority);
}

export function scoreRing(score, priority, size = 'md') {
  return h(
    'div',
    { class: `ring ring-${size} ring-${priority.toLowerCase()}`, style: { '--p': score }, role: 'img', 'aria-label': `Risk score ${score} out of 100, ${priority} priority` },
    h('span', { class: 'ring-value' }, score),
  );
}

export const FACTOR_LABELS = {
  siteType: 'Site type',
  violations: 'Past violations',
  waterDistance: 'Near water',
  inspectionAge: 'Time since inspection',
};

export function factorBars(points, compact = false) {
  return h(
    'div',
    { class: `factors${compact ? ' factors-compact' : ''}` },
    Object.entries(FACTOR_LABELS).map(([key, label]) =>
      h(
        'div',
        { class: 'factor', title: `${label}: ${points[key]} of 3 points` },
        h('span', { class: 'factor-label' }, label),
        h('span', { class: 'factor-track' }, [1, 2, 3].map((n) => h('span', { class: `factor-pip${n <= points[key] ? ' on' : ''}` }))),
      ),
    ),
  );
}

export function statusBadges(site) {
  const out = [];
  if (site.archived) out.push(h('span', { class: 'tag tag-muted' }, 'Archived'));
  if (!site.lastInspectionDate) out.push(h('span', { class: 'tag tag-overdue' }, icon('clock', 13), 'Never inspected'));
  else if (site.overdue) out.push(h('span', { class: 'tag tag-overdue' }, icon('clock', 13), 'Overdue'));
  if (site.points?.waterDistance === 3 && site.distanceToWaterMetres !== null) out.push(h('span', { class: 'tag tag-water' }, icon('droplet', 13), 'Near water'));
  return out;
}

export function emptyState(title, text, action) {
  return h('div', { class: 'empty' }, icon('search', 28), h('h3', {}, title), h('p', {}, text), action ?? null);
}

export function pageHeader(title, subtitle, ...actions) {
  return h('header', { class: 'page-head' },
    h('div', {}, h('h1', {}, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null),
    actions.length ? h('div', { class: 'page-actions' }, actions) : null);
}

// ---------- toasts and dialogs ----------

export function toast(message, type = 'success', ms = 4500) {
  let region = document.getElementById('toasts');
  if (!region) {
    region = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  const el = h('div', { class: `toast toast-${type}` }, icon(type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check'), h('span', {}, message));
  region.append(el);
  setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 300); }, ms);
}

/** A confirmation dialog. Resolves to true when the user confirms. */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false, typeToConfirm = null }) {
  return new Promise((resolve) => {
    const input = typeToConfirm ? h('input', { class: 'input', 'aria-label': `Type ${typeToConfirm} to confirm`, autocomplete: 'off' }) : null;
    const ok = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'submit', disabled: !!typeToConfirm }, confirmLabel);
    const cancel = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Cancel');
    const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' },
      h('form', { method: 'dialog' },
        h('h2', { id: 'dlg-title' }, title),
        typeof body === 'string' ? h('p', {}, body) : body,
        input ? h('label', { class: 'field' }, h('span', {}, `Type ${typeToConfirm} to confirm`), input) : null,
        h('div', { class: 'dialog-actions' }, cancel, ok)));
    input?.addEventListener('input', () => { ok.disabled = input.value.trim() !== typeToConfirm; });
    const finish = (value) => { dialog.close(); dialog.remove(); resolve(value); };
    cancel.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
    dialog.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); finish(true); });
    document.body.append(dialog);
    dialog.showModal();
    (input ?? ok).focus();
  });
}

// ---------- forms ----------

export function field(label, control, { hint, name, required } = {}) {
  const id = control.id || `f-${name ?? Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  if (name) control.name = name;
  const err = h('span', { class: 'field-error', id: `${id}-err`, 'aria-live': 'polite' });
  control.setAttribute('aria-describedby', `${id}-err${hint ? ` ${id}-hint` : ''}`);
  return h('div', { class: 'field', dataset: { field: name ?? '' } },
    h('label', { for: id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    control,
    hint ? h('span', { class: 'hint', id: `${id}-hint` }, hint) : null,
    err);
}

export function select(options, value, attrs = {}) {
  return h('select', { class: 'input', ...attrs },
    options.map((o) => {
      if (o.group) return h('optgroup', { label: o.group }, o.options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: v === value }, l);
    }));
}

/** Shows validation messages next to fields (keys match data-field). */
export function showErrors(form, errors) {
  form.querySelectorAll('.field').forEach((f) => {
    f.classList.remove('has-error');
    const e = f.querySelector('.field-error');
    if (e) e.textContent = '';
  });
  let first = null;
  for (const [key, message] of Object.entries(errors)) {
    const f = form.querySelector(`[data-field="${CSS.escape(key)}"]`) ?? form.querySelector('[data-field="form"]');
    if (!f) continue;
    f.classList.add('has-error');
    f.querySelector('.field-error').textContent = message;
    first ??= f.querySelector('input, select, textarea, button');
  }
  first?.focus();
}

export function download(filename, text, type = 'text/csv') {
  const blob = new Blob([type === 'text/csv' ? '﻿' + text : text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
