import {FinanceService,InMemoryFinanceRepository} from '../src';

function eq(actual:unknown, expected:unknown, label:string){
  if(JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
}

async function run(){
  const service=new FinanceService(new InMemoryFinanceRepository());
  const base=await service.overview('2026-09-25');
  eq(base.totalDebt,132933.51,'baseline total debt');

  const created=await service.createTransaction({
    cardId:'banamex-classic',date:'2026-10-13',description:'Compra de prueba',amount:1200
  });
  eq(created.projection.paymentMonth,'2026-11','payment month');
  eq(created.projection.payDate,'2026-11-30','personal pay date');
  eq(await service.paymentMonthSpend('2026-11'),1200,'monthly spend');

  await service.createTransaction({
    cardId:'banamex-classic',date:'2026-10-13',description:'Compra MSI',amount:3000,financing:'msi',installments:6
  });
  eq(await service.paymentMonthSpend('2026-11'),1700,'monthly spend incl MSI');
  eq(await service.paymentMonthSpend('2026-12'),500,'next MSI month');

  let overview=await service.overview('2026-10-13');
  eq(overview.totalDebt,137133.51,'live debt adds captured purchases');
  let detail=await service.cardDashboard('banamex-classic');
  eq(detail.currentBalance,21363.57,'live card balance');

  await service.createTransaction({
    cardId:'banamex-classic',date:'2026-10-30',description:'Pago tarjeta',amount:500,kind:'payment'
  });
  overview=await service.overview('2026-10-30');
  eq(overview.totalDebt,136633.51,'card payment reduces debt without becoming spending');
  eq(await service.paymentMonthSpend('2026-11'),1700,'card payment excluded from spending');

  const sim=await service.simulateExtraPayment('bbva-cash',10500);
  if(sim.interestAndTaxSaved < 1900) throw new Error('expected material interest savings');
  eq(sim.paymentsSaved,6,'payments saved');

  overview=await service.overview('2026-09-25');
  eq(overview.monthlyFixedNet,14036,'fixed net');
  console.log('service.spec: ok');
}
run();
