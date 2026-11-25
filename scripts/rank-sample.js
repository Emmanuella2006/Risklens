// Prints the demo sites ranked by risk, the same way the app ranks them.
// Run with: npm run rank
import { buildSampleData } from '../src/sample-data.js';
import { buildRankedSites } from '../src/sites.js';
import { DEFAULT_WEIGHTS, localToday } from '../src/scoring.js';

const today = localToday();
const { sites, inspections } = buildSampleData(today);
const ranked = buildRankedSites({ sites, inspections, settings: { weights: DEFAULT_WEIGHTS, overdueThresholdDays: 365 } }, { asOfDate: today });

console.log(`RiskLens: demo sites ranked by risk on ${today} (highest first)\n`);
console.table(
  ranked.map((s) => ({
    Rank: s.rank,
    Site: s.name,
    District: s.district,
    Score: s.score,
    Priority: s.priority,
    Overdue: s.overdue ? 'yes' : '',
  })),
);
