// (Re-included to ensure freq_total_norm & time_since_last_norm are present by default)
import { Draw } from "../types";
const DEFAULT_GROUPS: number[][] = [
  [1,2,3],[4,5,6],[7,8,9],[10,11,12],[13,14,15],[16,17,18],[19,20,21],[22,23,24],
  [25,26,27],[28,29,30],[31,32,33],[34,35,36],[37,38,39],[40,41,42],[43,44,45],
];
export type Tabular = { columns: string[]; rows: (number | string | boolean | null)[][] };
export interface CoxCovariateConfig {
  useOdd?: boolean;
  useLow?: boolean;
  useGroups?: boolean;
  dropFirstGroup?: boolean;
  usePrevGap?: boolean;
  useHot6?: boolean;
  useHot12?: boolean;
  useHot24?: boolean;
  useHot36?: boolean;
  useStrataByZone?: boolean;
  useFreq?: boolean;
  useRecency?: boolean;
}
export function buildCoxDataset(history: Draw[], groups: number[][] = DEFAULT_GROUPS, cfg: CoxCovariateConfig = {}): { dataset: Tabular; now: Tabular } {
  const { useOdd=true,useLow=true,useGroups=true,dropFirstGroup=true,usePrevGap=true,useHot6=false,useHot12=false,useHot24=false,useHot36=false,useStrataByZone=false,useFreq=true,useRecency=true } = cfg;
  const L=history.length;
  const presentAt=(d:Draw,n:number)=>d.main.includes(n)||d.supp.includes(n);
  const groupOf=(n:number)=>groups.findIndex(g=>g.includes(n));
  const totalHits=(n:number)=>history.reduce((c,d)=>c+(presentAt(d,n)?1:0),0);
  const timeSinceLast=(n:number)=>{for(let i=L-1;i>=0;i--) if(presentAt(history[i],n)) return L-1-i; return L;};
  const hitsInLast=(n:number,W:number)=>history.slice(-W).reduce((c,d)=>c+(presentAt(d,n)?1:0),0)/Math.max(1,W);
  const baseCols=["duration","event","number"];
  const extra:string[]=[];
  if(useOdd)extra.push("odd");
  if(useLow)extra.push("low");
  if(usePrevGap)extra.push("prev_gap");
  if(useHot6)extra.push("hot6");
  if(useHot12)extra.push("hot12");
  if(useHot24)extra.push("hot24");
  if(useHot36)extra.push("hot36");
  if(useFreq)extra.push("freq_total_norm");
  if(useRecency)extra.push("time_since_last_norm");
  let groupCols:string[]=[]; let strataCol:string|null=null;
  if(useStrataByZone) strataCol="zone"; else if(useGroups){ const dummies=groups.map((_,i)=>`group_z${i+1}`); groupCols=dropFirstGroup?dummies.slice(1):dummies; }
  const allCols=[...baseCols,...extra,...(strataCol?[strataCol]:[]),...groupCols];
  const rows:(number|string|boolean|null)[][]=[];
  for(let n=1;n<=45;n++){
    let last:number|null=null; let prevGap=0;
    for(let t=0;t<L;t++){
      if(presentAt(history[t],n)){
        const end=t; const start=last===null?0:last+1; const duration=end-start+1;
        if(duration>0){
          const row:any[]=[duration,1,n];
          if(useOdd)row.push(n%2?1:0);
          if(useLow)row.push(n<=22?1:0);
          if(usePrevGap)row.push(prevGap);
          if(useHot6)row.push(hitsInLast(n,6));
          if(useHot12)row.push(hitsInLast(n,12));
          if(useHot24)row.push(hitsInLast(n,24));
          if(useHot36)row.push(hitsInLast(n,36));
          if(useFreq)row.push(totalHits(n)/Math.max(1,L));
          if(useRecency)row.push(timeSinceLast(n)/Math.max(1,L));
          if(strataCol){ row.push(groupOf(n)+1); }
          else if(groupCols.length){
            const gk=groupOf(n);
            if(dropFirstGroup){ for(let i=1;i<groups.length;i++) row.push(i===gk?1:0); }
            else { for(let i=0;i<groups.length;i++) row.push(i===gk?1:0); }
          }
          rows.push(row); prevGap=duration;
        }
        last=t;
      }
    }
    if(last===null && L>0){
      const row:any[]=[L,0,n];
      if(useOdd)row.push(n%2?1:0);
      if(useLow)row.push(n<=22?1:0);
      if(usePrevGap)row.push(prevGap);
      if(useHot6)row.push(hitsInLast(n,6));
      if(useHot12)row.push(hitsInLast(n,12));
      if(useHot24)row.push(hitsInLast(n,24));
      if(useHot36)row.push(hitsInLast(n,36));
      if(useFreq)row.push(totalHits(n)/Math.max(1,L));
      if(useRecency)row.push(timeSinceLast(n)/Math.max(1,L));
      if(strataCol){ row.push(groupOf(n)+1); }
      else if(groupCols.length){
        const gk=groupOf(n);
        if(dropFirstGroup){ for(let i=1;i<groups.length;i++) row.push(i===gk?1:0); }
        else { for(let i=0;i<groups.length;i++) row.push(i===gk?1:0); }
      }
      rows.push(row);
    } else if(last!==null && last<L-1){
      const start=last+1; const duration=L-start;
      if(duration>0){
        const row:any[]=[duration,0,n];
        if(useOdd)row.push(n%2?1:0);
        if(useLow)row.push(n<=22?1:0);
        if(usePrevGap)row.push(prevGap);
        if(useHot6)row.push(hitsInLast(n,6));
        if(useHot12)row.push(hitsInLast(n,12));
        if(useHot24)row.push(hitsInLast(n,24));
        if(useHot36)row.push(hitsInLast(n,36));
        if(useFreq)row.push(totalHits(n)/Math.max(1,L));
        if(useRecency)row.push(timeSinceLast(n)/Math.max(1,L));
        if(strataCol){ row.push(groupOf(n)+1); }
        else if(groupCols.length){
          const gk=groupOf(n);
          if(dropFirstGroup){ for(let i=1;i<groups.length;i++) row.push(i===gk?1:0); }
          else { for(let i=0;i<groups.length;i++) row.push(i===gk?1:0); }
        }
        rows.push(row);
      }
    }
  }
  const nowCols=["number",...extra,...(strataCol?[strataCol]:[]),...groupCols];
  const nowRows:(number|string|boolean|null)[][]=[];
  for(let n=1;n<=45;n++){
    let prevGap=0; let last:number|null=null; let beforeLast:number|null=null;
    for(let t=0;t<L;t++){ if(presentAt(history[t],n)){ beforeLast=last; last=t; } }
    if(last!==null && beforeLast!==null) prevGap=last-beforeLast+1;
    const row:any[]=[n];
    if(useOdd)row.push(n%2?1:0);
    if(useLow)row.push(n<=22?1:0);
    if(usePrevGap)row.push(prevGap);
    if(useHot6)row.push(hitsInLast(n,6));
    if(useHot12)row.push(hitsInLast(n,12));
    if(useHot24)row.push(hitsInLast(n,24));
    if(useHot36)row.push(hitsInLast(n,36));
    if(useFreq)row.push(totalHits(n)/Math.max(1,L));
    if(useRecency)row.push(timeSinceLast(n)/Math.max(1,L));
    if(strataCol){ row.push(groupOf(n)+1); }
    else if(groupCols.length){
      const gk=groupOf(n);
      if(dropFirstGroup){ for(let i=1;i<groups.length;i++) row.push(i===gk?1:0); }
      else { for(let i=0;i<groups.length;i++) row.push(i===gk?1:0); }
    }
    nowRows.push(row);
  }
  return { dataset:{columns:allCols,rows}, now:{columns:nowCols,rows:nowRows} };
}