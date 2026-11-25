// Log in screen (SRS FR 5.1). Shows the demo accounts so markers can try both roles.
import { h, icon, field } from '../ui.js';
import { DEMO_ACCOUNTS } from '../../src/sample-data.js';
import { ROLES } from '../../src/catalog.js';

export async function render(app) {
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', required: true, placeholder: 'name@risklens.rw' });
  const password = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
  const show = h('button', { class: 'link-btn', type: 'button', 'aria-pressed': 'false' }, 'Show');
  show.addEventListener('click', () => {
    const visible = password.type === 'text';
    password.type = visible ? 'password' : 'text';
    show.textContent = visible ? 'Show' : 'Hide';
    show.setAttribute('aria-pressed', String(!visible));
  });
  const error = h('div', { class: 'alert alert-error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit' }, 'Log in');

  const form = h('form', { class: 'login-form', novalidate: true },
    h('h1', {}, 'Log in'),
    h('p', { class: 'muted' }, 'Use your RiskLens account to see which sites to inspect first.'),
    error,
    field('Email', email, { name: 'email' }),
    h('div', { class: 'field' },
      h('div', { class: 'label-row' }, h('label', { for: 'login-password' }, 'Password'), show),
      Object.assign(password, { id: 'login-password' })),
    submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    if (!email.value.trim() || !password.value) {
      error.textContent = 'Enter your email and password.';
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Checking…';
    const result = await app.signIn(email.value, password.value);
    if (!result.ok) {
      error.textContent = result.message;
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Log in';
      password.select();
      return;
    }
    app.startSession(result.user);
    app.go('/dashboard');
  });

  const demo = h('aside', { class: 'demo-box', 'aria-label': 'Demo accounts' },
    h('h2', {}, icon('key', 16), 'Demo accounts'),
    h('p', { class: 'muted small' }, 'This prototype comes with test accounts. Click one to fill in the form.'),
    DEMO_ACCOUNTS.slice(0, 2).map((a) =>
      h('button', {
        class: 'demo-account',
        type: 'button',
        onclick: () => { email.value = a.email; password.value = a.password; submit.focus(); },
      },
      h('strong', {}, ROLES[a.role]),
      h('span', {}, a.email),
      h('code', {}, a.password))));

  // Online database with no accounts yet: offer the one-time setup instead.
  const side = h('div', { class: 'login-side' }, demo);
  if (app.remote) {
    app.remote.needsSetup().then((empty) => { if (empty) side.replaceChildren(setupBox(app)); });
  }
  const mode = h('p', { class: 'mode-note' }, icon(app.onlineDb ? 'check' : 'info', 14),
    app.onlineDb ? 'Connected to the RiskLens online database.' : 'Demo mode: no online database is set up, so data is saved in this browser only.');

  return h('div', { class: 'login-page' },
    h('section', { class: 'login-hero' },
      h('div', { class: 'brand brand-light' }, h('span', { class: 'brand-mark' }, icon('shield', 22)), 'RiskLens'),
      h('div', {},
        h('h2', {}, 'Inspect the riskiest sites first.'),
        h('p', {}, 'RiskLens ranks industrial and construction sites by environmental risk, using site type, past violations, distance to water and time since the last inspection.')),
      h('ul', { class: 'hero-points' },
        h('li', {}, icon('check', 16), 'Ranked list, highest risk first'),
        h('li', {}, icon('check', 16), 'Scores update the moment an inspection is saved'),
        h('li', {}, icon('check', 16), 'Overdue sites flagged automatically'))),
    h('section', { class: 'login-panel' }, form, side, mode));
}

/** One-time setup of an empty online database: creates the demo accounts and demo data. */
function setupBox(app) {
  const status = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
  const button = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Set up RiskLens');
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.className = 'small';
    try {
      const admin = await app.remote.setupDemo(DEMO_ACCOUNTS, (msg) => { status.textContent = msg; });
      app.startSession(admin);
      app.go('/dashboard');
    } catch (err) {
      status.className = 'small field-error';
      status.textContent = `Setup stopped: ${err.message} You can click the button again; it carries on where it stopped.`;
      button.disabled = false;
    }
  });
  return h('aside', { class: 'demo-box setup-box' },
    h('h2', {}, icon('shield', 16), 'First-time setup'),
    h('p', { class: 'muted small' }, 'The online database is empty. This creates the demo accounts below and the demo sites and inspections. It only needs to be done once.'),
    h('ul', { class: 'plain small' }, DEMO_ACCOUNTS.map((a) => h('li', {}, h('strong', {}, ROLES[a.role]), ` · ${a.email} · `, h('code', {}, a.password)))),
    button,
    status);
}
