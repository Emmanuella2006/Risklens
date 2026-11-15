# RiskLens

RiskLens helps environmental inspectors in Rwanda decide which industrial and construction sites to inspect first. It gives each site a risk score based on its type, its past violations, how close it is to water or wetlands, and how long it has been since its last inspection, then ranks the sites from highest to lowest risk.

## Project status

| Sprint | Goal | Status |
|---|---|---|
| 1 | Planning and design: proposal, SRS, UML diagrams | Done |
| 2 | Risk-scoring engine, sample data and tests | Done |
| 3 | Web app: add sites, calculate scores, show the ranked list | Done |
| 4 | Inspector features: record inspections, filter by district or priority; deployment | Next |
| 5 | Testing, fixes and final documentation | Planned |

## What the app does

- **Add a site** with its name, district, type, past violations, distance to water and last inspection date. "Not known" and "Never inspected" are allowed and count as high risk.
- **Scores every site** from 0 to 100 and shows a High, Medium or Low priority.
- **Ranks the sites** from highest to lowest risk, with the points behind each score.
- **Saves the list in the browser**, so it is still there after a refresh.
- **Load sample sites** fills the list with 10 made-up sites to try it out.

## Run it

The app is a plain web page, with no server and nothing to install. Because it uses JavaScript modules, it has to be opened through a local web server rather than by double-clicking `index.html`:

- **VS Code:** install the *Live Server* extension, right-click `index.html` and choose **Open with Live Server**, or
- **Node.js:** run `npm start`, then open the address it prints.

To run the tests (Node.js 18 or later):

```bash
npm test       # scoring engine and form tests
npm run rank   # print the sample sites ranked by risk
```

## Project structure

```
index.html               the app
css/styles.css           styles
js/app.js                page logic: form, ranked list, buttons
js/site-form.js          checks the form and builds a site
js/storage.js            saves sites in the browser
src/scoring.js           the risk-scoring engine
data/sample-sites.json   10 made-up sites for testing
scripts/rank-sample.js   prints the sample sites ranked by risk
test/                    automated tests
docs/scoring-model.md    how the score is calculated, and why
```

See [docs/scoring-model.md](docs/scoring-model.md) for the full scoring model.
