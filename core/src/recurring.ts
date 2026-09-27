import {RecurringExpense,RecurringOverride} from './types';
import {addDays,makeDate} from './date';

export function monthlyEquivalent(e:RecurringExpense){
  let gross=e.amount;
  if(e.frequency==='bimonthly') gross=e.amount/2;
  if(e.frequency==='every_n_days') gross=e.amount*30/(e.everyNDays||30);
  if(e.frequency==='one_time') gross=0;
  return gross-(e.offsetIncome||0);
}

function monthIndex(iso:string){
  const [y,m]=iso.slice(0,7).split('-').map(Number);
  return y*12+(m-1);
}

export function isRecurringActiveInMonth(e:RecurringExpense, month:string){
  if((e.status||'active')==='archived') return false;
  const startMonth=e.startDate.slice(0,7);
  if(month<startMonth) return false;
  if(e.frequency==='monthly') return true;
  if(e.frequency==='bimonthly') return (monthIndex(month)-monthIndex(startMonth))%2===0;
  if(e.frequency==='one_time') return month===startMonth;
  return true;
}

export function overrideFor(overrides:RecurringOverride[], recurringId:string, periodKey:string){
  return overrides.find(o=>o.recurringId===recurringId && o.periodKey===periodKey);
}

/** Resolve one monthly/bimonthly/one-time occurrence. */
export function recurringAmountForMonth(e:RecurringExpense, month:string, overrides:RecurringOverride[]=[]){
  if(!isRecurringActiveInMonth(e,month)) return 0;
  if(e.frequency==='every_n_days'){
    return projectRecurring(e,`${month}-31`,overrides).filter(x=>x.date.startsWith(month)).reduce((s,x)=>s+x.amount,0);
  }
  const o=overrideFor(overrides,e.id,month);
  return (o?.amount ?? e.amount)-(e.offsetIncome||0);
}

export function projectRecurring(e:RecurringExpense, until:string, overrides:RecurringOverride[]=[]){
  const out:{date:string,name:string,amount:number,override:boolean}[]=[];
  let d=new Date(e.startDate+'T00:00:00Z');
  const end=new Date(until+'T00:00:00Z');
  if((e.status||'active')==='archived') return out;

  if(e.frequency==='every_n_days'){
    while(d<=end){
      const date=d.toISOString().slice(0,10);
      const exact=overrideFor(overrides,e.id,date);
      const monthly=overrideFor(overrides,e.id,date.slice(0,7));
      out.push({date,name:e.name,amount:exact?.amount ?? monthly?.amount ?? e.amount,override:Boolean(exact||monthly)});
      d=addDays(d,e.everyNDays||30);
    }
    return out;
  }

  const startMonth=e.startDate.slice(0,7);
  const endMonth=until.slice(0,7);
  const [sy,sm]=startMonth.split('-').map(Number);
  let cursor=makeDate(sy,sm,1);
  while(cursor.toISOString().slice(0,7)<=endMonth){
    const month=cursor.toISOString().slice(0,7);
    if(isRecurringActiveInMonth(e,month)){
      const day=Math.min(Number(e.startDate.slice(8,10))||1,new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0)).getUTCDate());
      const date=`${month}-${String(day).padStart(2,'0')}`;
      const o=overrideFor(overrides,e.id,month)||overrideFor(overrides,e.id,date);
      out.push({date,name:e.name,amount:o?.amount ?? e.amount,override:Boolean(o)});
    }
    cursor=makeDate(cursor.getUTCFullYear(),cursor.getUTCMonth()+2,1);
  }
  return out;
}
