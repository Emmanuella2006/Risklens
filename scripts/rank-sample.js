// Prints the sample sites ranked by risk. Run with: npm run rank
import { readFile } from 'node:fs/promises';
import { rankSites } from '../src/scoring.js';

const sites = JSON.parse(await readFile(new URL('../data/sample-sites.json', import.meta.url), 'utf8'));
const ranked = rankSites(sites);

console.log('RiskLens: sample sites ranked by risk (highest first)\n');
console.table(
  ranked.map((s) => ({
    Rank: s.rank,
    Site: s.name,
    District: s.district,
    Score: s.score,
    Priority: s.priority,
  })),
);
