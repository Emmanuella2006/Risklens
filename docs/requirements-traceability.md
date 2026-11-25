# Requirements traceability

How each requirement in the RiskLens SRS is met in the prototype, where to find it in the app, where it is in the code, and which automated test checks it.

## Functional requirements

| SRS | Requirement | In the app | Code | Tests |
|---|---|---|---|---|
| FR 1.1 | Administrator adds a new site (type, location, project scale) | **Register site** | `js/views/site-form.js`, `RiskLensDB.addSite`, `validateSite` | `db.test.js`: admins register and edit sites; `validation-csv-auth.test.js`: site checks, duplicates |
| FR 1.2 | Administrator edits site details | Site page → **Edit** (and **Archive**) | `RiskLensDB.updateSite`, `setSiteArchived` | `db.test.js`: admins register and edit sites |
| FR 2.1 | Inspector records an inspection outcome (date, pass/violation) | **Record inspection**, or **Inspect** on a site | `js/views/inspection-form.js`, `RiskLensDB.recordInspection` | `db.test.js`: recording an inspection |
| FR 2.2 | Inspector logs violation details | Violation section of the inspection form (category, severity, description) | `validateInspection` | `validation-csv-auth.test.js`: a violation needs at least one described violation |
| FR 3.1 | Weighted risk score from site type, violation history, proximity to sensitive areas, time since last inspection | Score ring on every site; **How the score is worked out** table on the site page | `src/scoring.js` | `scoring.test.js` |
| FR 3.2 | Score updates automatically after a new inspection | Toast "score 67 → 56 … updated in 1 ms"; history shows score before → after | `deriveFacts`, `buildRankedSites` in `src/sites.js` | `sites.test.js`: violations from inspections; new inspection changes the score |
| FR 4.1 | Ranked list, highest risk first | **Ranked sites**; **Visit next** on the dashboard | `rankSites` | `scoring.test.js`: ranking and ties |
| FR 4.2 | Filter and search by site type, region, risk level | Search box, risk-level chips, district and site-type filters, overdue only | `filterSites` | `sites.test.js`: filters |
| FR 5.1 | Login required | Login page; every page redirects to it when logged out; 30-minute idle logout | `js/main.js`, `RiskLensDB.authenticate` | `db.test.js`: login works with the right password only |
| FR 5.2 | Role-based access (inspector logs inspections; admin manages sites and weights) | Menu changes by role; "Not available for your role" page | `PERMISSIONS`/`can` in `src/auth.js`; checked again in every `RiskLensDB` change | `validation-csv-auth.test.js`: roles; `db.test.js`: roles enforced by the data layer |
| FR 6.1 | Inspection history report for any user | **Reports** (filter, print / save as PDF); history on each site page | `js/views/reports.js`, `js/views/site-detail.js` | covered by browser checks |
| FR 6.2 | Administrator exports the ranked list as CSV | **Export CSV** on Ranked sites and Reports | `src/csv.js` | `validation-csv-auth.test.js`: CSV |
| FR 7.1 | Overdue sites flagged, configurable window | Purple **Overdue** / **Never inspected** tags, dashboard banner and card; window set in **Scoring settings** | `isOverdue`, `RiskLensDB.runOverdueCheck` (runs at login and hourly) | `sites.test.js`: overdue |

## Non-functional requirements

| SRS | Requirement | How it is met | Tests |
|---|---|---|---|
| NFR 1 | Authentication, passwords stored hashed | Supabase Auth checks logins on the server and stores passwords hashed (bcrypt). In demo mode: PBKDF2-SHA-256 with a random salt per user and 100,000 iterations | `validation-csv-auth.test.js`: salted hashes; `db.test.js`: passwords are not stored as text |
| NFR 2 | Score recalculated within 2 seconds | Recalculation is measured on every save and shown in the toast (about 1 ms for the demo data) | `sites.test.js`: ranking 500 sites; `db.test.js`: elapsed time |
| NFR 3 | Interface in English | All text in plain English | — |
| NFR 4 | Inspection records timestamped, append-only, never deleted | Each record gets `recorded_at` (saved on the device) and `synced_at` (reached the database); a database trigger blocks every update and delete, and there are no update or delete rules; in the app records are frozen and there is no edit or delete function; sites are archived, not deleted; users are deactivated, not deleted; restoring a backup that is missing records is refused | `db.test.js`: records cannot be edited; backup missing records refused |
| NFR 5 | Data integrity with intermittent connectivity; no silent data loss | Every change is saved on the device immediately, then sent to the database through an outbox that waits while offline and sends automatically when back online; saving an inspection is idempotent, so re-sending never makes duplicates; changes the database refuses are kept and shown, never dropped; the service worker keeps the app working offline; if a save fails the change is undone and an error is shown; damaged saved data is never overwritten without asking | `db.test.js`: a failed save is reported and nothing is half-saved |
| NFR 6 | Chrome, Firefox, Edge | Standard HTML, CSS and JavaScript only, no browser-specific features | manual check |
| NFR 7 | Responsive on desktop, tablet and mobile | Mobile-first layout; sidebar on wide screens, top bar and bottom menu on phones; no sideways scrolling at 390 px | browser checks at 390, 820 and 1366 px |
| NFR 8 | Violation data only visible to authenticated users | Nothing but the login page is shown until the user logs in; the database gives logged-out visitors no access at all, and deactivated users see nothing | SQL rule checks |

## Business rule and design

| SRS | Item | How it is met |
|---|---|---|
| 5.3 | Only administrators adjust weights; inspectors only log outcomes | `PERMISSIONS` in `src/auth.js` |
| 2.6 | User guide | **User guide** page in the app |
| 3.1 | Dashboard with ranked list, site detail view, forms for sites and inspections | Dashboard, Ranked sites, site page, Register site, Record inspection |
| Use case diagram | Log In, View Ranked Site List («extend» Filter and Search), View Site Inspection History, Record Inspection Outcome («extend» Log Violation Details, «include» Recalculate Risk Score), Register New Site, Edit Site Details, Adjust Scoring Weights, Manage User Accounts, Export Ranked Site List, System Scheduler → Flag Overdue Sites | All present; Manage User Accounts is the **User accounts** page; the System Scheduler is the automatic overdue check |
| Class diagram | User / Inspector / Administrator, Site, Inspection, Violation, ScoringWeights, RiskScoringEngine, SiteRanker, OverdueMonitor | `users` with `role`, `sites`, `inspections` with `violations`, `settings.weights` and `overdueThresholdDays`, `src/scoring.js`, `src/sites.js`, `runOverdueCheck` |
| Sequence diagram | Validate session and role → save append-only inspection → recalculate → update site → refresh ranked list | `RiskLensDB.recordInspection` |

## Section 3.3 (technical constraints)

The SRS plans a backend with a relational database. RiskLens uses **Supabase**: a hosted PostgreSQL (relational) database with server-side login (Supabase Auth) and row-level security rules. The tables in `supabase/schema.sql` follow the class diagram: `profiles` (User, Inspector, Administrator), `sites` (Site), `inspections` (Inspection), `violations` (Violation), `settings` (ScoringWeights and the overdue window) and `activity`. Scoring (RiskScoringEngine, SiteRanker, OverdueMonitor) runs in the browser, in `src/scoring.js` and `src/sites.js`.
