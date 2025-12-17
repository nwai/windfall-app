const fs = require('fs');
const path = require('path');

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
  if (n <= 1) return { drawsEvaluated:0, meanExcluded:0, meanExcludedRandom:0, deltaMean:0 };
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
  return { drawsEvaluated, meanExcluded, meanExcludedRandom, deltaMean };
}

function makePredictor(formulation, sensitivity){
  const targetNotDrawn = formulation === 'old' ? 37 : 39;
  function makeLookback(trainingLen, baseFactor=0.15){
    const factor = Math.max(0.03, baseFactor * (1 - sensitivity * 0.8));
    return Math.max(1, Math.min(Math.ceil(trainingLen * factor), 60));
  }
  function makeK(lookback){ return Math.max(1, Math.round(lookback * Math.max(0.25, (1 - sensitivity * 0.7)))); }

  return function predictor(training){
    // empirical weighted notDrawn
    const weights = Array(46).fill(0);
    const total = training.length;
    const k = Math.max(1, Math.round(Math.max(3, total / Math.max(1, 8 * (1 - sensitivity)))));
    for (let idx=0; idx<training.length; idx++){
      const d = training[idx];
      const drawnArr = formulation === 'old' ? [...d.main, ...(d.supp||[])] : [...d.main];
      const notDrawn = [];
      for (let i=1;i<=45;i++) if (!drawnArr.includes(i)) notDrawn.push(i);
      const w = Math.exp(-(training.length - 1 - idx)/k);
      for (const n of notDrawn) weights[n]+=w;
    }
    const ordered = Array.from({length:45},(_,i)=>i+1).sort((a,b)=>weights[b]-weights[a]||a-b);
    return new Set(ordered.slice(0,targetNotDrawn));
  };
}

const csvPath = path.join(process.cwd(),'src','windfall_history_lottolyzer.csv');
if (!fs.existsSync(csvPath)) { console.error('CSV not found:', csvPath); process.exit(1); }
const history = loadCSV(csvPath);
console.log('History length:', history.length);

const results = [];
for (const form of ['old','new']){
  for (let s=0; s<=20; s++){
    const sensitivity = Number((s*0.05).toFixed(2));
    const predictor = makePredictor(form, sensitivity);
    const res = runLeaveOneOutBacktest(history, predictor, 200, 200, 42);
    results.push({formulation:form, sensitivity, ...res});
    console.log(`form=${form} sensitivity=${sensitivity} deltaMean=${res.deltaMean.toFixed(3)} meanExcluded=${res.meanExcluded.toFixed(3)}`);
  }
}

// write CSV
const header = 'formulation,sensitivity,drawsEvaluated,meanExcluded,meanExcludedRandom,deltaMean';
const rows = results.map(r => `${r.formulation},${r.sensitivity},${r.drawsEvaluated},${r.meanExcluded},${r.meanExcludedRandom},${r.deltaMean}`);
fs.writeFileSync('mlnd_sweep_results.csv', [header, ...rows].join('\n'));
console.log('Wrote mlnd_sweep_results.csv');
