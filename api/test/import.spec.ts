import {FinanceService,InMemoryFinanceRepository,buildStatementImport} from '../src';

function ok(v:unknown,label:string){if(!v)throw new Error(label);}
function eq(a:unknown,b:unknown,label:string){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${label}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);}

const sample=`
Periodo: 14-ago-2026 al 11-sep-2026
Fecha de corte: 11-sep-2026
Fecha límite de pago: lunes, 5-oct-2026
Pago para no generar intereses: $14,224.36
Saldo cargos regulares: $ 14,224.36
Saldo cargos a meses: $ 2,939.21
Saldo deudor total: $ 17,163.57
Crédito disponible: $ 0.00
13-ago-2026 14-ago-2026 CHILIS PARQUE DELTA GAS 910208GP3 + $932.80
14-ago-2026 14-ago-2026 SU ABONO...GRACIAS - $11,607.92
22-ago-2026 24-ago-2026 STARBUCKS PLZ DELTA LL CSI 020226MV4MX + $106.00
`;

async function run(){
  const parsed=buildStatementImport('banamex-classic','sample.txt',sample,[]);
  eq(parsed.summary.statementDate,'2026-09-11','statement date');
  eq(parsed.summary.totalBalance,17163.57,'balance');
  eq(parsed.rows.length,3,'movement rows');
  eq(parsed.rows[1].kindGuess,'payment','payment detection');

  const service=new FinanceService(new InMemoryFinanceRepository());
  const card=await service.createCard({name:'Prueba',issuer:'Banco X',creditLimit:10000,statementCloseDay:15,dueRule:{type:'days_after_close',days:20},personalPayDay:30});
  ok(card.id,'card created');
  eq((await service.listCards()).length,6,'card list adds card');
  await service.archiveCard(card.id);
  eq((await service.listCards()).length,5,'archived card hidden');
  eq((await service.listCards(true)).length,6,'archived card preserved');
  await service.restoreCard(card.id);

  let oct=await service.recurringForMonth('2026-10');
  const food=oct.find(x=>x.recurring.id==='catfood')!;
  eq(food.amount,600,'base cat food');
  await service.setRecurringOverride('catfood','2026-10',725,'Amazon increased price');
  oct=await service.recurringForMonth('2026-10');
  eq(oct.find(x=>x.recurring.id==='catfood')!.amount,725,'monthly override');
  await service.setRecurringOverride('electric','2026-10',520,'Higher CFE bill');
  oct=await service.recurringForMonth('2026-10');
  eq(oct.find(x=>x.recurring.id==='electric')!.amount,520,'bimonthly occurrence override');
  const nov=await service.recurringForMonth('2026-11');
  eq(nov.find(x=>x.recurring.id==='electric')!.amount,0,'no CFE occurrence in off month');

  const imp=await service.createImport('banamex-classic','sample.txt',sample);
  eq(imp.rows.length,3,'service import rows');
  await service.commitImport(imp.id);
  const txs=await service.listTransactions();
  eq(txs.length,3,'new import rows committed');
  ok(txs.every(t=>t.source==='statement_import'),'source marked');
  console.log('import.spec: ok');
}
run();
