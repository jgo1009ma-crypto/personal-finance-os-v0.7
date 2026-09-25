import {cards,projectTransaction} from '../src';

function eq(actual:unknown, expected:unknown, label:string){
  if(JSON.stringify(actual)!==JSON.stringify(expected)){
    throw new Error(`${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

const classic=cards.find(c=>c.id==='banamex-classic')!;
const regular=projectTransaction({id:'t1',cardId:classic.id,date:'2026-10-13',description:'Compra',amount:1200,kind:'purchase',financing:'regular'},classic);
eq(regular.close,'2026-11-11','close');
eq(regular.legalDue,'2026-12-05','legal due');
eq(regular.payDate,'2026-11-30','personal pay');
eq(regular.paymentMonth,'2026-11','payment month');

const sep=projectTransaction({id:'t2',cardId:classic.id,date:'2026-09-13',description:'Compra',amount:100,kind:'purchase',financing:'regular'},classic);
eq(sep.close,'2026-10-11','sep close');
eq(sep.payDate,'2026-10-30','sep personal pay');

const nu=cards.find(c=>c.id==='nu')!;
const nuTx=projectTransaction({id:'t3',cardId:nu.id,date:'2026-09-20',description:'Compra Nu',amount:100,kind:'purchase',financing:'regular'},nu);
eq(nuTx.close,'2026-10-05','nu close');
eq(nuTx.payDate,'2026-10-09','nu salary pay date');

const msi=projectTransaction({id:'t4',cardId:classic.id,date:'2026-10-13',description:'MSI',amount:1000,kind:'purchase',financing:'msi',installments:3},classic);
if(!('installments' in msi)) throw new Error('MSI projection missing installments');
eq(msi.installments.map(x=>[x.dueMonth,x.amount]),[
  ['2026-11',333.33],['2026-12',333.33],['2027-01',333.34]
],'msi distribution');
console.log('billing.spec: ok');

// Liverpool is paid one month in arrears: close Sep-27 -> due Oct-27, with no personal day-30 override.
{
  const liverpool=cards.find(c=>c.id==='liverpool')!;
  const p=projectTransaction({id:'livtx',cardId:'liv',date:'2026-09-13',description:'Compra',amount:1000,kind:'purchase',financing:'regular'},liverpool);
  eq(p.close,'2026-09-27','liverpool close');
  eq(p.legalDue,'2026-10-27','liverpool due');
  eq(p.payDate,'2026-10-27','liverpool pay');
  eq(p.paymentMonth,'2026-10','liverpool month');
}
