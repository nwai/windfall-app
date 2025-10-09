/**
 * Core weight construction logic refactored from BatesPanel.
 * This is a PURE function except for Math.random usage in sampling helpers.
 */

export interface BatesParameterSet {
  k: number;
  dualTri: boolean;
  triMode: number;
  triMode2: number;
  dualTriWeightA: number;   // weight for first triangular peak if dualTri
  mixWeight: number;        // convex mix triangles vs Bates
  betaHot: number;
  betaCold: number;
  betaGlobal: number;
  gammaConditional: number;
  hotQuantile: number;      // 0.5 .. 0.95 typical
  coldQuantile: number;     // 0.05 .. 0.5 typical (should be < hotQuantile)
  highlightHotCold: boolean;
}

export interface BatesInputs {
  recentSignal?: number[];       // length 45
  conditionalProb?: number[];    // length 45
}

export interface BatesWeightsResult {
  finalWeights: number[];        // length 45
  triWeights: number[];          // raw triangular mixture
  batesWeights: number[];        // raw Bates distribution
  baseConvex: number[];          // convex mix pre-modulation
  hotSet: Set<number>;
  coldSet: Set<number>;
}

function factorial(n:number){ let r=1; for(let i=2;i<=n;i++) r*=i; return r; }
function comb(n:number,k:number){ if(k<0||k>n)return 0; if(k===0||k===n)return 1; return Math.round(factorial(n)/(factorial(k)*factorial(n-k))); }

/* Bates PDF (k > 0). Approx forms for integer k */
function batesPdfAt(x:number,k:number){
  if(k<=1) return (x>=0&&x<=1)?1:0;
  if(x<0||x>1) return 0;
  // Implementation similar to your existing panel but simplified:
  const n = Math.max(2, Math.round(k));
  // Bates(n) = average of n uniforms => Irwin-Hall scaled; using piecewise sum.
  // For simplicity, we reuse Irwin–Hall derivative (Polynomial) over [0,1].
  // Very small k differences are minor; a fuller exact formula can be plugged in.
  // We'll approximate via sampling for speed -> but here keep analytic:
  // Irwin-Hall (sum of n uniforms) PDF piecewise polynomial; we want average => scale x by n then multiply n.
  // We'll do series approach:
  const s = x * n;
  const f = Math.floor(s);
  let sum = 0;
  for (let j=0;j<=f;j++){
    sum += ((j%2===0)?1:-1)*comb(n,j)*Math.pow(s - j, n - 1);
  }
  return (n * sum) / factorial(n-1);
}

/* Single triangular PDF with mode m in [0,1] */
function triangularPdfAt(x:number,m:number){
  if(x<0||x>1) return 0;
  if(m<=0) return x===0?0:2*(1-x);
  if(m>=1) return x===1?0:2*x;
  return x<=m ? (2*x)/m : (2*(1-x))/(1-m);
}

/* Build triangular discrete weights */
function singleTriangularDiscrete(n:number, mode:number): number[] {
  const arr:number[]=[];
  for(let i=1;i<=n;i++){
    const x=(i-0.5)/n;
    arr.push(triangularPdfAt(x, mode));
  }
  const sum=arr.reduce((a,b)=>a+b,0)||1;
  return arr.map(v=>v/sum);
}

function dualTriangularDiscrete(n:number, modeA:number, modeB:number, wA:number): {dual:number[], triA:number[], triB:number[]} {
  const wAn = Math.min(1,Math.max(0,wA));
  const wB = 1 - wAn;
  const triA:number[] = singleTriangularDiscrete(n, modeA);
  const triB:number[] = singleTriangularDiscrete(n, modeB);
  const dual = triA.map((a,i)=> wAn*a + wB*triB[i]);
  return { dual, triA, triB };
}

function batesDiscrete(n:number, k:number): number[] {
  const kw = Math.max(1, Math.round(k));
  const arr:number[]=[];
  for(let i=1;i<=n;i++){
    const x=(i-0.5)/n;
    arr.push(batesPdfAt(x, kw));
  }
  const sum=arr.reduce((a,b)=>a+b,0)||1;
  return arr.map(v=>v/sum);
}

export function computeBatesWeights(
  params: BatesParameterSet,
  inputs: BatesInputs
): BatesWeightsResult {
  const N=45;
  const {
    k, dualTri, triMode, triMode2,
    dualTriWeightA, mixWeight,
    betaHot, betaCold, betaGlobal,
    gammaConditional, hotQuantile, coldQuantile,
    highlightHotCold
  } = params;
  const recentSignal = inputs.recentSignal;
  const cond = inputs.conditionalProb;

  // 1. Triangular(s)
  let triWeights:number[];
  if(dualTri){
    const dual = dualTriangularDiscrete(N, triMode, triMode2, dualTriWeightA).dual;
    triWeights = dual;
  } else {
    triWeights = singleTriangularDiscrete(N, triMode);
  }

  // 2. Bates
  const bWeights = batesDiscrete(N, k);

  // 3. Convex mix
  const wTri = Math.min(1,Math.max(0,mixWeight));
  let base = triWeights.map((t,i)=> wTri*t + (1-wTri)*bWeights[i]);

  // 4. Hot/Cold sets
  let hotSet = new Set<number>(), coldSet = new Set<number>();
  if(recentSignal && highlightHotCold) {
    const sorted=[...recentSignal].sort((a,b)=>a-b);
    const lowQ = Math.min(coldQuantile, hotQuantile - 0.05);
    const highQ = Math.max(hotQuantile, lowQ + 0.05);
    const qColdVal = sorted[Math.floor(lowQ*(sorted.length-1))];
    const qHotVal = sorted[Math.floor(highQ*(sorted.length-1))];
    recentSignal.forEach((v,i)=>{
      if(v<=qColdVal) coldSet.add(i+1);
      else if(v>=qHotVal) hotSet.add(i+1);
    });
  }

  // 5. Modulations
  let w = base.slice();

  // Hot / Cold factor
  if(recentSignal && (betaHot>0 || betaCold>0)) {
    const sorted=[...recentSignal].sort((a,b)=>a-b);
    const lowQ = Math.min(coldQuantile, hotQuantile - 0.05);
    const highQ = Math.max(hotQuantile, lowQ + 0.05);
    const qColdVal = sorted[Math.floor(lowQ*(sorted.length-1))];
    const qHotVal = sorted[Math.floor(highQ*(sorted.length-1))];
    const mean = recentSignal.reduce((a,b)=>a+b,0)/recentSignal.length;
    w = w.map((baseWi,i)=>{
      const s = recentSignal[i];
      let f=1;
      if(s>=qHotVal && betaHot>0) f*=1+betaHot*Math.max(0,s-mean);
      else if(s<=qColdVal && betaCold>0) f*=1+betaCold*Math.max(0,mean-s);
      return baseWi*f;
    });
    const sum=w.reduce((a,b)=>a+b,0)||1;
    w=w.map(v=>v/sum);
  }

  // Global tilt
  if(recentSignal && betaGlobal>0){
    const mean=recentSignal.reduce((a,b)=>a+b,0)/recentSignal.length;
    w=w.map((baseWi,i)=> baseWi*(1+betaGlobal*(recentSignal[i]-mean)));
    const sum=w.reduce((a,b)=>a+b,0)||1;
    w=w.map(v=>v/sum);
  }

  // Conditional
  if(cond && gammaConditional>0){
    const meanC=cond.reduce((a,b)=>a+b,0)/cond.length;
    w=w.map((baseWi,i)=> baseWi*(1+gammaConditional*(cond[i]-meanC)));
    const sum=w.reduce((a,b)=>a+b,0)||1;
    w=w.map(v=>v/sum);
  }

  return {
    finalWeights: w,
    triWeights,
    batesWeights: bWeights,
    baseConvex: base,
    hotSet,
    coldSet
  };
}