# RiskLens

RiskLens helps environmental inspectors in Rwanda decide which industrial and construction sites to inspect first. It gives each site a risk score based on its type, its past violations, how close it is to water or wetlands, and how long it has been since its last inspection, then ranks the sites from highest to lowest risk.

## Project status

| Sprint | Goal | Status |
|---|---|---|
| 1 | Planning and design: proposal, SRS, UML diagrams | Done |
| 2 | Risk-scoring engine, sample data and tests | Done |
| 3 | Web app: add sites, calculate scores, show the ranked list | Next |
| 4 | Inspector features: record inspections, filter by district or priority; deployment | Planned |
| 5 | Testing, fixes and final documentation | Planned |

## Run it

Requires Node.js 18 or later. No packages to install yet.

```bash
npm test       # run the scoring tests
npm run rank   # rank the sample sites by risk
```

## Project structure

```
src/scoring.js           the risk-scoring engine
data/sample-sites.json   10 made-up sites for testing
scripts/rank-sample.js   prints the sample sites ranked by risk
test/scoring.test.js     tests for the scoring engine
docs/scoring-model.md    how the score is calculated, and why
```

See [docs/scoring-model.md](docs/scoring-model.md) for the full scoring model.
