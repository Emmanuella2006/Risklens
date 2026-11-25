// Manage user accounts (use case "Manage User Accounts"), administrators only.
import { h, icon, field, select, showErrors, pageHeader, toast, confirmDialog, formatDate } from '../ui.js';
import { ROLES, DISTRICTS } from '../../src/catalog.js';
import { PASSWORD_RULE } from '../../src/validation.js';
import { ValidationError } from '../../src/db.js';

export function render(app) {
  const c = {
    name: h('input', { class: 'input', autocomplete: 'off' }),
    email: h('input', { class: 'input', type: 'email', autocomplete: 'off' }),
    role: select([['INSPECTOR', 'Inspector'], ['ADMIN', 'Administrator']], 'INSPECTOR'),
    assignedDistrict: select([['', 'No district'], ...DISTRICTS.map((d) => [d, d])], ''),
    password: h('input', { class: 'input', type: 'password', autocomplete: 'new-password' }),
  };
  const districtField = field('Assigned district', c.assignedDistrict, { name: 'assignedDistrict', hint: 'Inspectors see the top sites in their district on the dashboard.' });
  c.role.addEventListener('change', () => { districtField.hidden = c.role.value !== 'INSPECTOR'; });

  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, icon('plus'), 'Add user');
  const form = h('form', { class: 'card form', novalidate: true },
    h('h2', {}, 'Add a user'),
    field('Full name', c.name, { name: 'name', required: true }),
    field('Email', c.email, { name: 'email', required: true }),
    field('Role', c.role, { name: 'role', required: true }),
    districtField,
    field('Temporary password', c.password, { name: 'password', required: true, hint: `${PASSWORD_RULE} Share it with the user privately; they can change it under My account.` }),
    h('div', { class: 'field', dataset: { field: 'form' } }, h('span', { class: 'field-error', 'aria-live': 'polite' })),
    h('div', { class: 'form-actions' }, submit));

  form.addEventListener('input', () => app.setDirty(true));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      const user = await app.addUser(Object.fromEntries(Object.entries(c).map(([k, el]) => [k, el.value])));
      app.setDirty(false);
      toast(`${user.name} can now log in as ${ROLES[user.role].toLowerCase()}.`);
      app.refresh();
    } catch (err) {
      submit.disabled = false;
      if (err instanceof ValidationError) showErrors(form, err.errors);
      else toast(err.message, 'error');
    }
  });

  const rows = [...app.db.users].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map((u) => {
    const me = u.id === app.user.id;
    const toggle = me ? h('span', { class: 'muted small' }, 'You') : h('button', {
      class: `btn btn-small ${u.active ? 'btn-ghost' : 'btn-primary'}`,
      type: 'button',
      onclick: async () => {
        const ok = await confirmDialog({
          title: u.active ? `Deactivate ${u.name}?` : `Reactivate ${u.name}?`,
          body: u.active ? 'They will not be able to log in. Their inspection records stay in the history.' : 'They will be able to log in again.',
          confirmLabel: u.active ? 'Deactivate' : 'Reactivate',
          danger: u.active,
        });
        if (!ok) return;
        try {
          await app.setUserActive(u.id, !u.active);
          toast(u.active ? `${u.name} deactivated.` : `${u.name} reactivated.`);
          app.refresh();
        } catch (err) { toast(err.message, 'error'); }
      },
    }, u.active ? 'Deactivate' : 'Reactivate');
    return h('tr', { class: u.active ? null : 'is-muted' },
      h('td', {}, h('strong', {}, u.name), h('br'), h('small', { class: 'muted' }, u.email)),
      h('td', {}, ROLES[u.role], u.assignedDistrict ? h('small', { class: 'muted' }, ` · ${u.assignedDistrict}`) : null),
      h('td', {}, h('span', { class: `badge ${u.active ? 'badge-pass' : 'badge-muted'}` }, u.active ? 'Active' : 'Deactivated')),
      h('td', { class: 'nowrap' }, formatDate(u.createdAt.slice(0, 10))),
      h('td', { class: 'num' }, toggle));
  });

  return h('div', { class: 'page' },
    pageHeader('User accounts', 'Add inspectors and administrators, or stop someone from logging in. Accounts are deactivated, never deleted, so the inspection history stays complete.'),
    h('div', { class: 'form-layout form-layout-wide' },
      h('section', { class: 'card' },
        h('h2', {}, `${app.db.users.filter((u) => u.active).length} active users`),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, ['User', 'Role', 'Status', 'Added', ''].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, rows)))),
      form));
}
