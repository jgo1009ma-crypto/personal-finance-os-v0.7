export const iso=(d:Date)=>d.toISOString().slice(0,10);
export const ym=(d:Date)=>d.toISOString().slice(0,7);
export function addDays(d:Date,n:number){const x=new Date(d); x.setUTCDate(x.getUTCDate()+n); return x;}
export function makeDate(y:number,m:number,day:number){return new Date(Date.UTC(y,m-1,day));}
export function monthAdd(d:Date,n:number){return makeDate(d.getUTCFullYear(),d.getUTCMonth()+1+n,1)}
export function endOrDay(y:number,m:number,day:number){const max=new Date(Date.UTC(y,m,0)).getUTCDate(); return makeDate(y,m,Math.min(day,max));}
