import fs from 'fs';
import path from 'path';
import { runLeaveOneOutBacktest, PredictorFn } from '../src/lib/backtest';
import { Draw } from '../src/types';

// Simple CSV loader assuming windfall_history_lottolyzer.csv format exists in src/
function loadCSV(filePath: string): Draw[] {
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = txt.split(/\r?\n/).filter(Boolean);
  // skip header if present
  const rows = lines.map(l => l.split(','));
  // Best-effort parsing: assume main numbers are in columns 1..6 and supp 7..8
  const draws: Draw[] = rows.map(cols => {
    // columns may include date at 0, numbers thereafter
    const date = cols[0] || '';
    const nums = cols.slice(1).map(s => Number(s)).filter(n => !Number.isNaN(n));
    const main = nums.slice(0,6);
    const supp = nums.slice(6,8);
    return { date, main, supp } as Draw;
  });
  return draws;
}

function predictorOld_mainsAndSupp(training: Draw[]): Set<number> {
  // Old heuristic: use same orderedCandidates logic from earlier version (mains+supp)
  // Build notDrawn frequencies (mains+supp combined)
  const counts = Array(46).fill(0);
  for (const d of training) {
    const drawn = [...d.main, ...(d.supp || [])];
    for (let n = 1; n <=45; n++) if (!drawn.includes(n)) counts[n]++;
  }
  const ordered = Array.from({length:45},(_,i)=>i+1).sort((a,b)=>counts[b]-counts[a]||a-b);
  return new Set(ordered.slice(0,37));
}

function predictorNew_mainsOnly(training: Draw[]): Set<number> {
  // Use mains-only empirical frequency
  const counts = Array(46).fill(0);
  for (const d of training) {
    for (let n = 1; n <=45; n++) if (!d.main.includes(n)) counts[n]++;
  }
  const ordered = Array.from({length:45},(_,i)=>i+1).sort((a,b)=>counts[b]-counts[a]||a-b);
  return new Set(ordered.slice(0,39));
}

function runCompare(history: Draw[]) {
  console.log('History length', history.length);
  const rt = 200;
  const bi = 300;
  const seed = 42;

  const resOld = runLeaveOneOutBacktest(history, predictorOld_mainsAndSupp as PredictorFn, rt, bi, seed);
  const resNew = runLeaveOneOutBacktest(history, predictorNew_mainsOnly as PredictorFn, rt, bi, seed);

  console.log('\nOld (mains+supp) predictor results (pred-not-drawn=37):');
  console.log(resOld);
  console.log('\nNew (mains-only) predictor results (pred-not-drawn=39):');
  console.log(resNew);

  // Also compute complement match rates: how many of predicted drawn matched actual mains per draw
  // For leave-one-out we can recompute predictions per draw
  const perDrawOldMatches: number[] = [];
  const perDrawNewMatches: number[] = [];
  for (let t = 1; t < history.length; t++) {
    const train = history.slice(0, t);
    const actual = history[t].main; // actual mains
    const setOld = predictorOld_mainsAndSupp(train);
    const setNew = predictorNew_mainsOnly(train);
    // complements
    const predDrawnOld = Array.from({length:45},(_,i)=>i+1).filter(n=>!setOld.has(n)); // size 8
    const predDrawnNew = Array.from({length:45},(_,i)=>i+1).filter(n=>!setNew.has(n)); // size 6
    const matchesOld = predDrawnOld.filter(n=>actual.includes(n)).length;
    const matchesNew = predDrawnNew.filter(n=>actual.includes(n)).length;
    perDrawOldMatches.push(matchesOld);
    perDrawNewMatches.push(matchesNew);
  }

  const avgOldMatch = perDrawOldMatches.reduce((a,b)=>a+b,0)/perDrawOldMatches.length;
  const avgNewMatch = perDrawNewMatches.reduce((a,b)=>a+b,0)/perDrawNewMatches.length;

  console.log('\nAverage complement matches per draw:');
  console.log('Old (8 predicted mains) avg matches:', avgOldMatch.toFixed(3));
  console.log('New (6 predicted mains) avg matches:', avgNewMatch.toFixed(3));

  // Save CSV
  const out = [];
  out.push('type,drawsEvaluated,meanExcluded,meanExcludedRandom,deltaMean,bootstrapCI_lo,bootstrapCI_hi,avgComplementMatch');
  out.push(`old,${resOld.drawsEvaluated},${resOld.meanExcluded},${resOld.meanExcludedRandom},${resOld.deltaMean},${resOld.bootstrapCI?.[0]||''},${resOld.bootstrapCI?.[1]||''},${avgOldMatch}`);
  out.push(`new,${resNew.drawsEvaluated},${resNew.meanExcluded},${resNew.meanExcludedRandom},${resNew.deltaMean},${resNew.bootstrapCI?.[0]||''},${resNew.bootstrapCI?.[1]||''},${avgNewMatch}`);
  fs.writeFileSync(path.join(process.cwd(),'mlnd_compare_results.csv'), out.join('\n'));
}

// Run on src/windfall_history_lottolyzer.csv if exists, otherwise try src/windfall-history file
const csvPath = path.join(process.cwd(),'src','windfall_history_lottolyzer.csv');
if (fs.existsSync(csvPath)) {
  const history = loadCSV(csvPath);
  runCompare(history);
} else {
  console.error('History CSV not found at', csvPath);
  process.exit(1);
}
