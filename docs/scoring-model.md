# RiskLens scoring model

RiskLens gives each site a risk score from 0 to 100. The higher the score, the sooner inspectors should visit.

## The four factors

Each factor is scored from 0 to 3 points.

| Factor | 0 points | 1 point | 2 points | 3 points |
|---|---|---|---|---|
| Site type | – | Low impact: office, retail, school | Medium: construction, small manufacturing, agro-processing, hotel | High: chemical, mining, quarry, large factory, waste management |
| Past violations | None | 1 | 2 | 3 or more |
| Distance to water or wetland | Over 2 km | 500 m – 2 km | 100 – 499 m | Under 100 m, or unknown |
| Time since last inspection | Under 6 months | 6 – 11 months | 12 – 24 months | Over 24 months, or never inspected |

## From points to a score

1. Each factor's points are multiplied by its weight. All weights start at 1, so every factor counts equally. An administrator can set each weight from 0 to 3 under **Scoring settings** (SRS FR 5.2); at least one weight must be above 0.
2. The weighted points are divided by the highest possible total and multiplied by 100.

With equal weights: **score = (total points ÷ 12) × 100**, rounded to a whole number.

## Priority levels

| Score | Priority |
|---|---|
| 67 – 100 | High: inspect first |
| 34 – 66 | Medium |
| 0 – 33 | Low |

## Ties

When two sites have the same score, the site closer to water goes first. If they are still tied, the site with more past violations goes first, then the site that has gone longest without an inspection.

## Design decisions

- **Equal weights to start.** There is no evidence yet that one factor matters more than another. Administrators can change the weights in the app once testing or feedback shows a better balance; the defaults are `DEFAULT_WEIGHTS` in `src/scoring.js`.
- **Violations and last inspection come from the inspection history.** A site's past violations are the violations entered when it was registered (from paper records) plus every violation logged in RiskLens. Its last inspection date is the latest of the registered date and the inspections logged in RiskLens. So a new inspection changes the score at once (SRS FR 3.2): a pass resets the time factor, a violation adds to the violations factor.
- **Missing data counts as high risk.** A site with an unknown distance to water, or one that has never been inspected, gets the maximum points for that factor, so a site is never ranked low just because its information is missing.
- **Water first in ties.** Pollution near water and wetlands spreads furthest and is the hardest to reverse.

## Worked example

| Site | Site type | Violations | Water | Last inspection | Points | Score | Priority |
|---|---|---|---|---|---|---|---|
| A | Chemical (3) | 2 (2) | 300 m (2) | 18 months ago (2) | 9 | 75 | High |
| C | Small manufacturing (2) | 1 (1) | 80 m (3) | 14 months ago (2) | 8 | 67 | High |
| B | Construction (2) | 0 (0) | 1 km (1) | 8 months ago (1) | 4 | 33 | Low |

Ranking: A, then C, then B.

## Overdue sites

Separately from the score, a site is flagged **overdue** when it has never been inspected or its last inspection was more than a set number of days ago (365 by default; administrators can set 30 to 1,095 days). This check runs automatically when a user logs in and every hour (SRS FR 7.1).

All demo sites in `src/sample-data.js` are made up for testing.
