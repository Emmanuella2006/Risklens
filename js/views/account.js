// My account: who is logged in, their permissions, and changing the password.
import { h, icon, field, showErrors, pageHeader, toast } from '../ui.js';
import { ROLES } from '../../src/catalog.js';
import { PERMISSIONS } from '../../src/auth.js';
import { PASSWORD_RULE } from '../../src/validation.js';
import { ValidationError } from '../../src/db.js';

const ACTION_LABELS = {
  viewSites: 'View the ranked site list and site details',
  viewReports: 'View and print the inspection history report',
  recordInspection: 'Record inspection outcomes and violations',
  manageSites: 'Register, edit and archive sites',
  adjustWeights: 'Change scoring weights and the overdue window',
  exportCsv: 'Export CSV files',
  manageUsers: 'Add and deactivate user accounts',
  manageData: 'Back up and restore data',
};

export function render(app) {
  const current = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const next = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Change password');
  const form = h('form', { class: 'card form', novalidate: true },
    h('h2', {}, icon('key', 18), 'Change password'),
    field('Current password', current, { name: 'currentPassword', required: true }),
    field('New password', next, { name: 'newPassword', required: true, hint: PASSWORD_RULE }),
    h('div', { class: 'form-actions' }, submit));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      app.user = await app.changePassword(current.value, next.value);
      toast('Password changed.');
      form.reset();
      showErrors(form, {});
    } catch (err) {
      if (err instanceof ValidationError) showErrors(form, err.errors);
      else toast(err.message, 'error');
    }
    submit.disabled = false;
  });

  return h('div', { class: 'page' },
    pageHeader('My account', `${app.user.name} · ${app.user.email}`,
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => app.logout('You have logged out.') }, icon('logout'), 'Log out')),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card' },
        h('h2', {}, `What a${app.user.role === 'ADMIN' ? 'n administrator' : 'n inspector'} can do`),
        h('ul', { class: 'perm-list' }, Object.entries(ACTION_LABELS).map(([action, label]) => {
          const allowed = PERMISSIONS[action].includes(app.user.role);
          return h('li', { class: allowed ? 'yes' : 'no' }, icon(allowed ? 'check' : 'x', 16), label);
        })),
        h('p', { class: 'muted small' }, `Role: ${ROLES[app.user.role]}. Roles are set by an administrator.`)),
      form));
}
