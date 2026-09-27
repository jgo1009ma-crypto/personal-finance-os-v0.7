import {FinancialPreferences,IncomeRule} from './types';
import {endOrDay,makeDate,monthAdd,ym} from './date';

export type ForecastItemType='income'|'fixed_expense'|'variable_budget'|'card_payment'|'installment'|'interest_debt'|'extra_debt_payment'|'scenario_purchase'|'transfer';
export interface CashEvent {
  date:string;
  label:string;
  amount:number;
  type:'income'|'expense';
  itemType?:ForecastItemType;
  sourceId?:string;
  cardId?:string;
  assumption?:boolean;
  metadata?:Record<string,unknown>;
}
export interface CashflowRow extends CashEvent {balance:number}
export interface MonthlyForecastRow {
  month:string;
  income:number;
  fixedExpenses:number;
  variableBudget:number;
  cardPayments:number;
  installments:number;
  interestDebt:number;
  extraDebtPayments:number;
  scenarioPurchases:number;
  totalOutflow:number;
  netCashflow:number;
  endingBalance:number;
}
export interface ForecastMetrics {
  openingCash:number;
  endingCash:number;
  minimumCash:number;
  minimumCashDate?:string;
  negativeDays:number;
  firstNegativeDate?:string;
  monthsWithNegativeEndingBalance:number;
  totalIncome:number;
  totalOutflow:number;
}
export interface ForecastResult {
  asOf:string;
  horizonEnd:string;
  preferences:FinancialPreferences;
  events:CashEvent[];
  daily:CashflowRow[];
  monthly:MonthlyForecastRow[];
  metrics:ForecastMetrics;
  warnings:string[];
}

const r2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const iso=(d:Date)=>d.toISOString().slice(0,10);

export function cashflow(events:CashEvent[], opening=0){
  let balance=opening;
  return [...events].sort((a,b)=>a.date.localeCompare(b.date)||a.label.localeCompare(b.label)).map(e=>{
    balance += e.type==='income'?e.amount:-e.amount;
    return {...e,balance:r2(balance)};
  });
}

export function horizonEnd(asOf:string,months:number){
  const [y,m]=asOf.slice(0,7).split('-').map(Number);
  const lastMonth=makeDate(y,m+Math.max(1,months)-1,1);
  return iso(endOrDay(lastMonth.getUTCFullYear(),lastMonth.getUTCMonth()+1,31));
}

function active(rule:IncomeRule,date:string){
  if((rule.status||'active')==='archived')return false;
  if(date<rule.startDate)return false;
  if(rule.endDate&&date>rule.endDate)return false;
  return true;
}

/** Project known income events without inventing dates for amounts whose date is unknown. */
export function projectIncomeRules(rules:IncomeRule[],asOf:string,until:string):CashEvent[]{
  const out:CashEvent[]=[];
  const [sy,sm]=asOf.slice(0,7).split('-').map(Number);
  let cursor=makeDate(sy,sm,1);
  while(iso(cursor).slice(0,7)<=until.slice(0,7)){
    const y=cursor.getUTCFullYear(),m=cursor.getUTCMonth()+1;
    for(const rule of rules){
      const push=(date:string)=>{if(date>=asOf&&date<=until&&active(rule,date))out.push({date,label:rule.name,amount:r2(rule.amount),type:'income',itemType:'income',sourceId:rule.id});};
      if(rule.frequency==='semimonthly'){
        if(rule.day1)push(iso(endOrDay(y,m,rule.day1)));
        if(rule.day2)push(iso(endOrDay(y,m,rule.day2)));
      }else if(rule.frequency==='monthly'){
        push(iso(endOrDay(y,m,rule.day1||1)));
      }else if(rule.frequency==='annual'){
        const s=new Date(rule.startDate+'T00:00:00Z');
        if(s.getUTCMonth()+1===m)push(iso(endOrDay(y,m,rule.day1||s.getUTCDate())));
      }else if(rule.frequency==='one_time'&&rule.date&&rule.date.slice(0,7)===`${y}-${String(m).padStart(2,'0')}`){push(rule.date);}
    }
    cursor=monthAdd(cursor,1);
  }
  return out;
}

/** Planning-only variable spend. Four equal envelopes make daily liquidity less falsely optimistic than one month-end lump. */
export function projectVariableBudget(monthlyAmount:number,asOf:string,until:string):CashEvent[]{
  if(!(monthlyAmount>0))return [];
  const out:CashEvent[]=[];
  const [sy,sm]=asOf.slice(0,7).split('-').map(Number);let cursor=makeDate(sy,sm,1);
  while(ym(cursor)<=until.slice(0,7)){
    const y=cursor.getUTCFullYear(),m=cursor.getUTCMonth()+1;
    const amount=r2(monthlyAmount/4);
    [7,14,21,28].forEach((day,i)=>{
      const date=iso(endOrDay(y,m,day));
      if(date>=asOf&&date<=until)out.push({date,label:`Presupuesto variable ${i+1}/4`,amount,type:'expense',itemType:'variable_budget',assumption:true});
    });
    cursor=monthAdd(cursor,1);
  }
  return out;
}

export function buildForecast(asOf:string,until:string,events:CashEvent[],preferences:FinancialPreferences,warnings:string[]=[]):ForecastResult{
  const filtered=events.filter(e=>e.date>=asOf&&e.date<=until&&e.amount>=0);
  const daily=cashflow(filtered,preferences.openingCash);
  const monthMap=new Map<string,MonthlyForecastRow>();
  const [sy,sm]=asOf.slice(0,7).split('-').map(Number);let cursor=makeDate(sy,sm,1);let prevEnding=preferences.openingCash;
  while(ym(cursor)<=until.slice(0,7)){
    const month=ym(cursor);
    monthMap.set(month,{month,income:0,fixedExpenses:0,variableBudget:0,cardPayments:0,installments:0,interestDebt:0,extraDebtPayments:0,scenarioPurchases:0,totalOutflow:0,netCashflow:0,endingBalance:prevEnding});
    cursor=monthAdd(cursor,1);
  }
  for(const e of filtered){
    const row=monthMap.get(e.date.slice(0,7));if(!row)continue;
    if(e.type==='income')row.income+=e.amount;
    else{
      if(e.itemType==='fixed_expense')row.fixedExpenses+=e.amount;
      else if(e.itemType==='variable_budget')row.variableBudget+=e.amount;
      else if(e.itemType==='card_payment')row.cardPayments+=e.amount;
      else if(e.itemType==='installment')row.installments+=e.amount;
      else if(e.itemType==='interest_debt')row.interestDebt+=e.amount;
      else if(e.itemType==='extra_debt_payment')row.extraDebtPayments+=e.amount;
      else if(e.itemType==='scenario_purchase')row.scenarioPurchases+=e.amount;
      row.totalOutflow+=e.amount;
    }
  }
  const monthly=[...monthMap.values()].sort((a,b)=>a.month.localeCompare(b.month));
  let running=preferences.openingCash;
  for(const r of monthly){r.income=r2(r.income);r.fixedExpenses=r2(r.fixedExpenses);r.variableBudget=r2(r.variableBudget);r.cardPayments=r2(r.cardPayments);r.installments=r2(r.installments);r.interestDebt=r2(r.interestDebt);r.extraDebtPayments=r2(r.extraDebtPayments);r.scenarioPurchases=r2(r.scenarioPurchases);r.totalOutflow=r2(r.totalOutflow);r.netCashflow=r2(r.income-r.totalOutflow);running=r2(running+r.netCashflow);r.endingBalance=running;}
  let minimumCash=preferences.openingCash,minimumCashDate:string|undefined,negativeDays=0,firstNegativeDate:string|undefined;
  for(const r of daily){if(r.balance<minimumCash){minimumCash=r.balance;minimumCashDate=r.date}if(r.balance<0){negativeDays++;firstNegativeDate??=r.date}}
  const metrics:ForecastMetrics={openingCash:r2(preferences.openingCash),endingCash:r2(daily.at(-1)?.balance??preferences.openingCash),minimumCash:r2(minimumCash),minimumCashDate,negativeDays,firstNegativeDate,monthsWithNegativeEndingBalance:monthly.filter(m=>m.endingBalance<0).length,totalIncome:r2(filtered.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0)),totalOutflow:r2(filtered.filter(e=>e.type==='expense').reduce((s,e)=>s+e.amount,0))};
  return {asOf,horizonEnd:until,preferences,events:filtered.sort((a,b)=>a.date.localeCompare(b.date)),daily,monthly,metrics,warnings};
}
