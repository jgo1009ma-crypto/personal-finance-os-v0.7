import {Card,Transaction,Installment} from './types';
import {endOrDay, addDays, ym, monthAdd} from './date';
import {finiteNumber,integer,validDate} from './validation';

/** Resolve the statement closing date that will contain a transaction. */
export function statementCloseFor(txDate:string, card:Card){
  validDate(txDate);integer(card.statementCloseDay,'statementCloseDay',1,31);
  const d=new Date(txDate+'T00:00:00Z');
  const y=d.getUTCFullYear();
  const m=d.getUTCMonth()+1;
  let close=endOrDay(y,m,card.statementCloseDay);
  if(d>close) close=endOrDay(y,m+1,card.statementCloseDay);
  return close;
}

/** Resolve the bank's legal due date for a statement. */
export function dueDateForClose(close:Date, card:Card){
  if(card.dueRule.type==='days_after_close') return addDays(close,card.dueRule.days);
  const next=monthAdd(close,1);
  return endOrDay(next.getUTCFullYear(),next.getUTCMonth()+1,card.dueRule.day);
}

/**
 * Resolve the date the user normally intends to pay.
 * The preferred day is interpreted as the latest occurrence of that day
 * after the statement closes and on/before the legal due date.
 * Example: close 11-Nov, due 05-Dec, preferred day 30 => 30-Nov.
 */
export function expectedPersonalPayDate(close:Date, card:Card){
  const legal=dueDateForClose(close,card);
  if(!card.personalPayDay) return legal;

  let cursor=new Date(Date.UTC(close.getUTCFullYear(), close.getUTCMonth(), 1));
  let best:Date|undefined;
  // Statement-to-due windows are normally < 2 months, but search four safely.
  for(let i=0;i<4;i++){
    const y=cursor.getUTCFullYear();
    const m=cursor.getUTCMonth()+1;
    const candidate=endOrDay(y,m,card.personalPayDay);
    if(candidate>close && candidate<=legal) best=candidate;
    cursor=monthAdd(cursor,1);
  }
  return best ?? legal;
}

export function splitMSI(total:number, months:number, firstDue:Date):Installment[]{
  finiteNumber(total,'total',0.01);integer(months,'months',1,360);
  const cents=Math.round(total*100);
  const base=Math.floor(cents/months);
  const remainder=cents-base*months;
  return Array.from({length:months},(_,i)=>({
    number:i+1,
    dueMonth:ym(monthAdd(firstDue,i)),
    // Put rounding remainder in final installment for auditability.
    amount:(base+(i===months-1?remainder:0))/100
  }));
}

export function projectTransaction(tx:Transaction, card:Card){
  const close=statementCloseFor(tx.date,card);
  const legalDue=dueDateForClose(close,card);
  const payDate=expectedPersonalPayDate(close,card);
  const base={
    close:close.toISOString().slice(0,10),
    legalDue:legalDue.toISOString().slice(0,10),
    payDate:payDate.toISOString().slice(0,10),
    paymentMonth:ym(payDate)
  };
  if(tx.financing==='msi' && tx.installments && tx.installments>1){
    return {...base, installments:splitMSI(tx.amount,tx.installments,payDate)};
  }
  return {...base, amount:tx.amount};
}
