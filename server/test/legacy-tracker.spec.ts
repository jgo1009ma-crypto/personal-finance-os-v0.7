import {FinanceService} from '../src/finance-service';
import {InMemoryFinanceRepository} from '../src/mock-repository';
import {installmentCommitments} from '../../core/src/seed';
function eq(actual:unknown,expected:unknown,label:string){if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`)}
function ok(value:unknown,label:string){if(!value)throw new Error(label)}
async function main(){
  const repo=new InMemoryFinanceRepository();
  const service=new FinanceService(repo);
  const report=await service.legacyTrackerReport();
  eq(report.currentCycleTotal,43728.86,'oct total');
  eq(report.projectedJanuaryTotal,26689.38,'jan total');
  eq(report.candidateVariableSpend,9093.5,'candidate variable');
  eq(report.newInstallmentPrincipal,25454,'iphone principal');
  eq(report.candidateCount,22,'candidate count');
  eq(report.knownOctoberInflows,49000,'oct inflows');
  eq(report.octoberResidualAfterKnownInflows,5271.14,'oct residual');
  eq(report.bbvaSharePct,46.57,'bbva share');
  ok(report.items.some((x:any)=>x.description==='Iphone'&&x.disposition==='candidate'),'iphone candidate missing');
  const iphone:any=report.items.find((x:any)=>x.description==='Iphone'&&x.source==='BBVA');
  const imported=await service.importLegacyTrackerItem(iphone.id,'2026-09-27');
  eq(imported.transaction.amount,25454,'iphone tx amount');
  eq(imported.transaction.financing,'msi','iphone financing');
  eq(imported.transaction.installments,13,'iphone installments');
  eq(imported.transaction.source,'legacy_tracker','iphone source');
  const duplicate=await service.importLegacyTrackerItem(iphone.id,'2026-09-27');
  eq(duplicate.duplicate,true,'duplicate guard');
  const report2=await service.legacyTrackerReport();
  eq((report2.items.find((x:any)=>x.id===iphone.id) as any).imported,true,'import status');
  const liverpool=installmentCommitments.filter(x=>x.cardId==='liverpool');
  eq(liverpool.length,4,'liverpool commitments');
  eq(liverpool.reduce((s,x)=>s+x.monthlyAmount,0).toFixed(2),'3646.17','liverpool oct total');
  eq(liverpool.filter(x=>x.remainingPayments>=4).reduce((s,x)=>s+x.monthlyAmount,0).toFixed(2),'2827.50','liverpool jan/feb total');
  console.log('legacy-tracker.spec: ok');
}
main();
