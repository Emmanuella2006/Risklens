# RiskLens

RiskLens helps environmental inspectors in Rwanda decide which industrial and construction sites to inspect first. It gives every registered site a risk score from 0 to 100, based on the type of site, its past violations, how close it is to water or wetlands, and how long it has been since its last inspection. Sites are ranked from highest to lowest risk, and the ranking updates the moment an inspector records an inspection.

- **Live app:** https://emmanuella2006.github.io/Risklens/
- **Requirements (SRS):** see the SRS document submitted with this project
- **Scoring model:** [docs/scoring-model.md](docs/scoring-model.md)
- **Requirements traceability:** [docs/requirements-traceability.md](docs/requirements-traceability.md)

## The problem

The Rwanda Environment Management Authority (REMA) has far more registered industrial and construction sites than inspectors can visit. Inspections are planned from paper files and spreadsheets, so high-risk sites, such as a chemical plant beside a river that has not been visited in two years, can be missed while low-risk sites are visited again. RiskLens turns the information inspectors already have into one ranked list, so limited inspection time goes to the sites most likely to be harming the environment.

## Demo accounts

The app comes with made-up demo data and these test accounts (they are also shown on the login page):

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@risklens.rw` | `Admin#2026` |
| Inspector | `inspector@risklens.rw` | `Inspect#2026` |
| Inspector (Musanze) | `inspector2@risklens.rw` | `Inspect#2026` |

## Features

| Feature | Who | SRS |
|---|---|---|
| Log in with email and password; logged out after 30 minutes without activity | Everyone | FR 5.1, NFR 1 |
| Dashboard: sites to visit next, high-priority and overdue counts, risk by district | Everyone | 3.1 |
| Ranked site list, highest risk first, with the points behind each score | Everyone | FR 4.1 |
| Search and filter by site type or category, district, risk level and overdue status | Everyone | FR 4.2 |
| Site detail: score explanation and full inspection history | Everyone | 3.1, FR 6.1 |
| Record an inspection (date, pass or violation, notes) | Inspector | FR 2.1 |
| Log violation details: category, severity (minor, major, critical) and description | Inspector | FR 2.2 |
| Score recalculated and list re-ranked straight away after an inspection | System | FR 3.1, FR 3.2, NFR 2 |
| Register a site (type, district, GPS, project scale, distance to water, earlier history) | Administrator | FR 1.1 |
| Edit a site; archive a closed site (its history is kept) | Administrator | FR 1.2 |
| Change the scoring weights (0 to 3) with a live preview of the new ranking | Administrator | FR 5.2, rule 5.3 |
| Overdue sites flagged automatically; the overdue window is configurable | System / Administrator | FR 7.1 |
| Inspection history report, filter by site, district, outcome and dates; print or save as PDF | Everyone | FR 6.1 |
| Export the ranked site list (and inspections) as CSV | Administrator | FR 6.2 |
| Add, deactivate and reactivate user accounts | Administrator | Use case "Manage User Accounts" |
| Change your own password | Everyone | NFR 1 |
| Built-in user guide: registering a site, logging an inspection, reading a score | Everyone | 2.6 |
| Shared online database (Supabase, PostgreSQL): a site added on a laptop appears on a phone | Everyone | 3.3 |
| Works offline: changes are saved on the device and sent to the database when the connection is back; save errors are always shown | Everyone | NFR 5 |
| Works on phones, tablets and computers | Everyone | NFR 6, NFR 7 |

Roles are enforced three times: the menu only shows what a role can do, the app's data layer (`src/db.js`) refuses actions the role is not allowed to do, and the database itself refuses them (row-level security in `supabase/schema.sql`). The database also blocks any change to or deletion of an inspection record (NFR 4).

## How it works

```
Browser (HTML, CSS, JavaScript)                      Supabase (online)
┌──────────────────────────────────────┐            ┌──────────────────────────────┐
│ Screens (js/views)                   │            │ Auth: email + password login │
│ Risk scoring and ranking (src/)      │  HTTPS     │ PostgreSQL database:         │
│ Copy of the data on the device  ─────┼──────────▶ │  profiles, sites,            │
│ Outbox: changes waiting to be sent   │ ◀──────────┼  inspections, violations,    │
│                                      │  every 20 s│  settings, activity          │
└──────────────────────────────────────┘            │ Row-level security rules     │
                                                    └──────────────────────────────┘
```

1. Login is checked by Supabase Auth on the server; passwords are stored hashed by Supabase (NFR 1).
2. Every change is saved on the device first, then sent to the database. With no connection it waits in an outbox and is sent automatically when the device is back online (NFR 5; the "queue locally and sync" step in the SRS sequence diagram).
3. Every 20 seconds, and when the connection comes back, the app downloads the latest data, so all devices see the same sites and inspections.
4. Scores are calculated in the browser from the stored data, so a new inspection re-ranks the list straight away (FR 3.2, NFR 2).

If `js/config.js` has no Supabase details, RiskLens runs in **demo mode**: everything works, but data is saved only in that browser.

## Run it on your own computer

You need **Git** and **Node.js 18 or later** (Node is only needed for the tests and the local web server).

1. **Install the tools (once).**
   - Git: download from https://git-scm.com/downloads and install with the default options.
   - Node.js: download the **LTS** version from https://nodejs.org and install with the default options.
   - Check both are installed. Open a terminal (on Windows: *Command Prompt* or *PowerShell*) and run:
     ```bash
     git --version
     node --version
     ```
     Each command should print a version number. `node --version` must be `v18` or higher.

2. **Download the code.**
   ```bash
   git clone https://github.com/Emmanuella2006/Risklens.git
   cd Risklens
   ```

3. **Connect the database** (skip this to try RiskLens in demo mode, where data stays in your browser). Follow [Set up the online database](#set-up-the-online-database-supabase) below, then paste your Supabase **Project URL** and **anon public key** into `js/config.js`.

4. **Start a local web server.** RiskLens uses JavaScript modules, so it must be opened through a web server, not by double-clicking `index.html`.
   ```bash
   npm start
   ```
   The first time, npm asks to download the small `serve` package; type `y` and press Enter. When it prints `Serving!`, open **http://localhost:3000** in Chrome, Firefox or Edge.

   *Alternative without Node:* open the folder in VS Code, install the **Live Server** extension, right-click `index.html` and choose **Open with Live Server**.

5. **Log in** with one of the demo accounts above. With a new, empty database, the login page shows **First-time setup** instead: click **Set up RiskLens** once to create the demo accounts and demo data.

6. **Stop the server** with `Ctrl + C` in the terminal.

There is nothing else to install: the app has no dependencies and no build step.

## Set up the online database (Supabase)

Do this once. It takes about 10 minutes and is free.

1. Go to https://supabase.com, click **Start your project** and sign up (GitHub sign-in works).
2. Click **New project**. Choose any name (for example `risklens`), set a database password (keep it somewhere safe; RiskLens does not need it), pick the region closest to you (for example *West EU* or *South Africa*), and click **Create new project**. Wait about two minutes.
3. In the left menu open **SQL Editor** → **New query**. Open `supabase/schema.sql` from this repository, copy everything, paste it in and click **Run**. It should say *Success. No rows returned*. This creates the tables and the security rules.
4. In the left menu open **Authentication** → **Sign In / Providers** (called *Providers* in some versions) → **Email**, turn **Confirm email** off and click **Save**. RiskLens accounts are created by an administrator, so no confirmation email is needed.
5. Open **Project Settings** (gear icon). Copy the **Project URL** (under **Data API** or **API**) and the public key (under **API Keys**: the **Publishable key**, starting `sb_publishable_`, or the older **anon public** key; either works) into `js/config.js`:
   ```js
   export const SUPABASE_URL = 'https://your-project-id.supabase.co';
   export const SUPABASE_ANON_KEY = 'sb_publishable_...';
   ```
   This key is designed to be public; the security rules decide what each user can do. Never put the *secret* or *service_role* key in the app.
6. Open RiskLens, click **Set up RiskLens** on the login page, and wait for the dashboard.

### Run the tests

```bash
npm test       # 38 automated tests: scoring, ranking, validation, CSV, passwords, roles, data rules and database mapping
npm run rank   # prints the demo sites ranked by risk
```

All tests should pass (`# fail 0`).

## Deploy it (GitHub Pages)

The live app is hosted free on GitHub Pages, straight from the `main` branch:

1. Push the code to the `main` branch of a **public** GitHub repository.
2. On GitHub open the repository, then **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, **Branch** to `main` and the folder to `/ (root)`, then click **Save**.
4. Wait one or two minutes, then refresh the page. GitHub shows the address, for example `https://<username>.github.io/Risklens/`.

Every new push to `main` updates the live app within a few minutes. The empty `.nojekyll` file tells GitHub Pages to publish the files exactly as they are.

## How to use it

1. **Administrator:** log in, open **Register site** and add a site. Its starting score and rank are shown as soon as it is saved.
2. **Inspector:** log in, open **Ranked sites** and visit the top sites first. After a visit, click **Inspect** (or **Record inspection**), choose Pass or Violation, add the violation details and save. The score and ranking update at once and the record is added to the site's history.
3. **Administrator:** under **Scoring settings**, change how much each factor counts or after how many days a site becomes overdue; the preview shows how the ranking would change before you save.
4. Anyone can open **Reports** to see and print the inspection history. Administrators can export CSV files there or from the ranked list.

The full user guide is inside the app (**User guide** in the menu).

## Project structure

```
index.html                 page shell (loads the app)
css/styles.css             all styles (mobile first, print styles for reports)
js/main.js                 start-up, login session, menu and page routing
js/ui.js                   shared screen helpers (score ring, badges, dialogs, toasts)
js/views/                  one file per screen: login, dashboard, sites, site-detail,
                           site-form, inspection-form, reports, settings, users, account, help
src/scoring.js             risk-scoring engine (the four factors, weights, ranking)
src/sites.js               builds the ranked list from sites + inspections; overdue flag; filters
src/db.js                  data store: sites, append-only inspections, users, settings, backups
src/auth.js                password hashing (PBKDF2-SHA-256) and role permissions
src/validation.js          form checks for sites, inspections and users
src/csv.js                 CSV export
src/catalog.js             site types, districts, violation categories, roles
src/sample-data.js         made-up demo sites, inspections and accounts
src/remote-map.js          converts between app data and database rows
js/remote.js               online database: login, outbox, sync, accounts, first-time setup
js/config.js               Supabase Project URL and anon key
js/vendor/supabase.js      Supabase client library (v2.119.2, MIT licence), stored locally so the app works offline
supabase/schema.sql        database tables and security rules (run once in Supabase)
sw.js, manifest.webmanifest  offline support
scripts/rank-sample.js     prints the demo sites ranked by risk
test/                      automated tests (node --test)
docs/                      scoring model and requirements traceability
```

## Technology

- **Front end:** HTML, CSS and plain JavaScript (ES modules), with no framework and no build step. Hosted on GitHub Pages.
- **Back end:** Supabase: PostgreSQL database, Auth (login) and row-level security.
- **Offline:** service worker plus a copy of the data and an outbox on each device.
- **Tests:** Node's built-in test runner.

## Limitations of this prototype

- **Logging in needs internet the first time** on a device. After that, RiskLens works offline until the user logs out.
- **If two people edit the same site while offline**, the last change to reach the database wins. Inspections are never affected, because they are only ever added.
- The free Supabase plan pauses a project after a week without use; open the Supabase dashboard and click **Restore** if that happens.
- In demo mode (no Supabase details), data is saved only in that browser and passwords are hashed in the browser (PBKDF2). **Reset demo data** exists only in demo mode.
- Distance to water is typed in by the administrator; it is not yet calculated from GPS and a map of rivers and wetlands.
- Built for current versions of Chrome, Firefox and Edge (SRS NFR 6). Automated browser checks were run in Chromium; check Firefox by hand before release.

## Development history

| Sprint | Goal | Status |
|---|---|---|
| 1 | Planning and design: proposal, SRS, UML diagrams | Done |
| 2 | Risk-scoring engine, sample data and tests | Done |
| 3 | First web app: add sites, calculate scores, show the ranked list | Done |
| 4 | Login and roles, inspections and violations, filters, overdue flags, reports, CSV export, scoring settings, user accounts | Done |
| 5 | Offline support, responsive design, user guide, testing, deployment and documentation | Done |

## Licence

MIT
