import fs from 'fs';
import path from 'path';

function loadCSV(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const rows = lines.map(l => l.split(','));
  const draws = rows.map(cols => {
    const date = cols[0] || '';
    const nums = cols.slice(1).map(s => Number(s)).filter(n => !Number.isNaN(n));
    const main = nums.slice(0,6);
    const supp = nums.slice(6,8);
    return { date, main, supp };
  });
  return draws;
}

function seededRng(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function runLeaveOneOutBacktest(history, predictor, randomTrials = 200, bootstrapIters = 300, seed = 42) {
  const rng = seededRng(seed);
  const n = history.length;
  if (n <= 1) return { drawsEvaluated:0, meanExcluded:0, meanExcludedRandom:0, deltaMean:0, deltaPerDraw:[], bootstrapCI:[0,0] };
  const deltaPerDraw = [];
  const excludedPerDraw = [];
  const randomMeanPerDraw = [];
  for (let t=1;t<n;t++){
    const train = history.slice(0,t);
    const actualDraw = [...history[t].main, ...(history[t].supp || [])];
    const actualSet = new Set(actualDraw);
    const predictedNotDrawn = predictor(train);
    let excluded = 0;
    for (const num of actualSet) if (predictedNotDrawn.has(num)) excluded++;
    excludedPerDraw.push(excluded);
    const N = predictedNotDrawn.size || 37;
    let randSum = 0;
    for (let r=0;r<randomTrials;r++){
      const pool = Array.from({length:45},(_,i)=>i+1);
      for (let i=pool.length-1;i>0;i--){
        const j = Math.floor(rng()*(i+1));
        const tmp = pool[i]; pool[i]=pool[j]; pool[j]=tmp;
      }
      const randSet = new Set(pool.slice(0,N));
      let randExcluded = 0;
      for (const num of actualSet) if (randSet.has(num)) randExcluded++;
      randSum += randExcluded;
    }
    const randMean = randSum / randomTrials;
    randomMeanPerDraw.push(randMean);
    deltaPerDraw.push(randMean - excluded);
  }
  const drawsEvaluated = deltaPerDraw.length;
  const meanExcluded = excludedPerDraw.reduce((a,b)=>a+b,0)/(excludedPerDraw.length||1);
  const meanExcludedRandom = randomMeanPerDraw.reduce((a,b)=>a+b,0)/(randomMeanPerDraw.length||1);
  const deltaMean = deltaPerDraw.reduce((a,b)=>a+b,0)/(deltaPerDraw.length||1);
  const bootMeans = [];
  for (let it=0; it<bootstrapIters; it++){
    let sum=0;
    for (let k=0;k<deltaPerDraw.length;k++){ const idx = Math.floor(rng()*deltaPerDraw.length); sum += deltaPerDraw[idx]; }
    bootMeans.push(sum/(deltaPerDraw.length||1));
  }
  bootMeans.sort((a,b)=>a-b);
  const lo = bootMeans[Math.floor(0.025*bootMeans.length)]||0;
  const hi = bootMeans[Math.floor(0.975*bootMeans.length)]||0;
  return { drawsEvaluated, meanExcluded, meanExcludedRandom, deltaMean, deltaPerDraw, bootstrapCI:[lo,hi] };
}

function predictorOld_mainsAndSupp(training){
  const counts = Array(46).fill(0);
  for (const d of training){
    const drawn = [...d.main, ...(d.supp||[])];
    for (let n=1;n<=45;n++) if (!drawn.includes(n)) counts[n]++;
  }
  const ordered = Array.from({length:45},(_,i)=>i+1).sort((a,b)=>counts[b]-counts[a]||a-b);
  return new Set(ordered.slice(0,37));
}
function predictorNew_mainsOnly(training){
  const counts = Array(46).fill(0);
  for (const d of training){ for (let n=1;n<=45;n++) if (!d.main.includes(n)) counts[n]++; }
  const ordered = Array.from({length:45},(_,i)=>i+1).sort((a,b)=>counts[b]-counts[a]||a-b);
  return new Set(ordered.slice(0,39));
}

const csvPath = path.join(process.cwd(),'src','windfall_history_lottolyzer.csv');
if (!fs.existsSync(csvPath)) { console.error('CSV not found:', csvPath); process.exit(1); }
const history = loadCSV(csvPath);
console.log('History length:', history.length);
const resOld = runLeaveOneOutBacktest(history, predictorOld_mainsAndSupp, 200, 300, 42);
const resNew = runLeaveOneOutBacktest(history, predictorNew_mainsOnly, 200, 300, 42);
console.log('\nOld (mains+supp):', resOld);
console.log('\nNew (mains-only):', resNew);
const perDrawOld=[]; const perDrawNew=[];
for (let t=1;t<history.length;t++){
  const train = history.slice(0,t);
  const actual = history[t].main;
  const setOld = predictorOld_mainsAndSupp(train);
  const setNew = predictorNew_mainsOnly(train);
  const predDrawnOld = Array.from({length:45},(_,i)=>i+1).filter(n=>!setOld.has(n));
  const predDrawnNew = Array.from({length:45},(_,i)=>i+1).filter(n=>!setNew.has(n));
  perDrawOld.push(predDrawnOld.filter(n=>actual.includes(n)).length);
  perDrawNew.push(predDrawnNew.filter(n=>actual.includes(n)).length);
}
const avgOld = perDrawOld.reduce((a,b)=>a+b,0)/perDrawOld.length;
const avgNew = perDrawNew.reduce((a,b)=>a+b,0)/perDrawNew.length;
console.log('\nAvg complement matches: old:',avgOld.toFixed(3),'new:',avgNew.toFixed(3));
fs.writeFileSync('mlnd_compare_results.csv',`old,${JSON.stringify(resOld)}\nnew,${JSON.stringify(resNew)}\navgOld,${avgOld}\navgNew,${avgNew}\n`);
console.log('Wrote mlnd_compare_results.csv');
