import {amortize, buildForecast, compareExtraPayment, horizonEnd, monthlyEquivalent, projectIncomeRules, projectRecurring, projectTransaction, projectVariableBudget, recurringAmountForMonth, statementCloseFor} from '../../core/src';
import {Card,FinancialPreferences,RecurringOverride} from '../../core/src/types';
import {AppBootstrap, CardDashboard, CreateCardInput, CreateTransactionInput, DebtTimelineRow, ExtraPaymentSimulation, ForecastEnvelope, ForecastOptions, Overview, PurchaseProjection, RecurringMonthRow, ScenarioComparison, ScenarioRequest, StatementImport, TransactionRecord} from './contracts';
import {FinanceRepository} from './repositories';
import {buildStatementImport} from './statement-import';
import {endOrDay,makeDate,monthAdd,ym} from '../../core/src/date';

function round2(n:number){ return Math.round((n+Number.EPSILON)*100)/100; }
function pct(n:number){ return Math.round(n*10000)/100; }
function slug(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)||'card';}


function dateAtMonth(month:string,day:number){const [y,m]=month.split('-').map(Number);return endOrDay(y,m,day).toISOString().slice(0,10);}
function monthlyDates(first:string,count:number){const d=new Date(first+'T00:00:00Z');const day=d.getUTCDate();const out:string[]=[];for(let i=0;i<count;i++){const x=monthAdd(d,i);out.push(endOrDay(x.getUTCFullYear(),x.getUTCMonth()+1,day).toISOString().slice(0,10));}return out;}

export class FinanceService {
  constructor(private readonly repo:FinanceRepository){}

  async createTransaction(input:CreateTransactionInput):Promise<{transaction:TransactionRecord;projection:PurchaseProjection}> {
    if(!input.cardId) throw new Error('cardId is required');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('date must be YYYY-MM-DD');
    if(!(input.amount>0)) throw new Error('amount must be > 0');
    if(input.financing==='msi' && input.installments!==undefined && input.installments<2) throw new Error('MSI requires installments >= 2');

    const card=await this.repo.getCard(input.cardId);
    if(!card) throw new Error(`Unknown card: ${input.cardId}`);

    const tx:TransactionRecord={
      id:crypto.randomUUID(), cardId:input.cardId, date:input.date,
      description:input.description.trim(), amount:round2(input.amount),
      kind:input.kind ?? 'purchase', financing:input.financing ?? 'regular',
      category:input.category, installments:input.installments, apr:input.apr,
      source:input.source??'manual',sourceImportId:input.sourceImportId,
      createdAt:new Date().toISOString()
    };
    await this.repo.saveTransaction(tx);
    const projection=projectTransaction(tx,card) as PurchaseProjection;
    return {transaction:tx,projection};
  }

  async projectPurchase(input:CreateTransactionInput):Promise<PurchaseProjection>{
    const card=await this.repo.getCard(input.cardId);
    if(!card) throw new Error(`Unknown card: ${input.cardId}`);
    return projectTransaction({
      id:'projection', cardId:input.cardId, date:input.date, description:input.description,
      amount:input.amount, kind:input.kind ?? 'purchase', financing:input.financing ?? 'regular',
      category:input.category, installments:input.installments, apr:input.apr
    },card) as PurchaseProjection;
  }

  async createCard(input:CreateCardInput):Promise<Card>{
    if(!input.name?.trim()||!input.issuer?.trim()) throw new Error('name and issuer are required');
    if(!(input.creditLimit>0)) throw new Error('creditLimit must be > 0');
    if(input.statementCloseDay<1||input.statementCloseDay>31) throw new Error('statementCloseDay must be 1..31');
    const id=`${slug(input.issuer)}-${slug(input.name)}-${crypto.randomUUID().slice(0,6)}`;
    const card:Card={...input,id,name:input.name.trim(),issuer:input.issuer.trim(),status:'active',interestDayBasis:input.interestDayBasis??360,interestTaxRate:input.interestTaxRate??.16,createdAt:new Date().toISOString()};
    await this.repo.saveCard(card);return card;
  }

  async updateCard(id:string,patch:Partial<CreateCardInput>&{status?:'active'|'archived'}):Promise<Card>{
    const card=await this.repo.getCard(id);if(!card)throw new Error(`Unknown card: ${id}`);
    const updated:Card={...card,...patch,id};
    if(updated.statementCloseDay<1||updated.statementCloseDay>31)throw new Error('statementCloseDay must be 1..31');
    if(!(updated.creditLimit>0))throw new Error('creditLimit must be > 0');
    if(patch.status==='archived'&&!card.archivedAt)updated.archivedAt=new Date().toISOString();
    if(patch.status==='active')updated.archivedAt=undefined;
    await this.repo.updateCard(updated);return updated;
  }
  async archiveCard(id:string){return this.updateCard(id,{status:'archived'});}
  async restoreCard(id:string){return this.updateCard(id,{status:'active'});}

  async simulateExtraPayment(planId:string, extraPayment:number):Promise<ExtraPaymentSimulation>{
    if(!(extraPayment>0)) throw new Error('extraPayment must be > 0');
    const plan=await this.repo.getDebtPlan(planId);
    if(!plan) throw new Error(`Unknown plan: ${planId}`);
    const result=compareExtraPayment(plan,extraPayment);
    return {
      planId, extraPayment:round2(extraPayment),
      before:{interestAndTax:round2(result.before.totalCost),numberOfPayments:result.before.rows.length,endingBalance:round2(result.before.endingBalance)},
      after:{interestAndTax:round2(result.after.totalCost),numberOfPayments:result.after.rows.length,endingBalance:round2(result.after.endingBalance)},
      interestAndTaxSaved:round2(result.interestAndTaxSaved),paymentsSaved:result.paymentsSaved
    };
  }

  async overview(asOf:string, monthlyIncome=34000):Promise<Overview>{
    const [plans,recurring,cards,snapshots,txs]=await Promise.all([
      this.repo.listDebtPlans(),this.repo.listRecurring(),this.repo.listCards(),this.repo.listCardSnapshots(),this.repo.listTransactions()
    ]);
    const liveBalance=(snap:typeof snapshots[number])=>{
      const delta=txs.filter(t=>t.cardId===snap.cardId && t.date>snap.statementDate).reduce((sum,t)=>sum+((t.kind==='payment'||t.kind==='refund')?-t.amount:t.amount),0);
      return Math.max(0,snap.totalBalance+delta);
    };
    // Archived/closed cards keep their outstanding debt in the balance sheet until it reaches zero.
    const totalDebt=snapshots.reduce((s,p)=>s+liveBalance(p),0);
    const interestDebt=plans.filter(p=>p.apr>0).reduce((s,p)=>s+p.principal,0);
    const fixed=recurring.reduce((s,r)=>s+monthlyEquivalent(r),0);
    const limits=cards.reduce((s,c)=>s+c.creditLimit,0);
    const nextPayments=snapshots.reduce((s,x)=>s+(x.paymentToAvoidInterest||0),0);
    return {asOf,monthlyIncome:round2(monthlyIncome),monthlyFixedNet:round2(fixed),totalDebt:round2(totalDebt),interestBearingDebt:round2(interestDebt),monthlyFreeBeforeVariableAndInstallments:round2(monthlyIncome-fixed),totalCreditLimit:round2(limits),creditUtilization:limits?pct(totalDebt/limits):0,nextStatementPayments:round2(nextPayments),dataQualityWarnings:snapshots.filter(s=>s.dataQuality==='estimated'||s.dataQuality==='inconsistent').length};
  }

  async paymentMonthSpend(month:string):Promise<number>{
    const [txs,cards]=await Promise.all([this.repo.listTransactions(),this.repo.listCards(true)]);
    const cardMap=new Map(cards.map(c=>[c.id,c]));let total=0;
    for(const tx of txs){
      if(tx.kind==='payment') continue; const card=cardMap.get(tx.cardId); if(!card) continue;
      const p=projectTransaction(tx,card) as PurchaseProjection; const sign=tx.kind==='refund'?-1:1;
      if(tx.financing==='msi' && p.installments) total+=sign*p.installments.filter(i=>i.dueMonth===month).reduce((s,i)=>s+i.amount,0);
      else if(p.paymentMonth===month) total+=sign*tx.amount;
    }
    return round2(total);
  }

  async setRecurringOverride(recurringId:string,periodKey:string,amount:number,note?:string){
    const recurring=(await this.repo.listRecurring(true)).find(r=>r.id===recurringId);if(!recurring)throw new Error(`Unknown recurring rule: ${recurringId}`);
    if(!/^\d{4}-\d{2}(?:-\d{2})?$/.test(periodKey))throw new Error('periodKey must be YYYY-MM or YYYY-MM-DD');
    if(amount<0)throw new Error('amount must be >= 0');
    const all=await this.repo.listRecurringOverrides();const previous=all.find(o=>o.recurringId===recurringId&&o.periodKey===periodKey);const now=new Date().toISOString();
    const override:RecurringOverride={id:previous?.id||crypto.randomUUID(),recurringId,periodKey,amount:round2(amount),note,createdAt:previous?.createdAt||now,updatedAt:now};
    await this.repo.saveRecurringOverride(override);return override;
  }

  async recurringForMonth(month:string):Promise<RecurringMonthRow[]>{
    if(!/^\d{4}-\d{2}$/.test(month))throw new Error('month must be YYYY-MM');
    const [rules,overrides]=await Promise.all([this.repo.listRecurring(),this.repo.listRecurringOverrides()]);
    return rules.map(recurring=>{
      const override=overrides.find(o=>o.recurringId===recurring.id&&(o.periodKey===month||o.periodKey.startsWith(month+'-')));
      return {recurring,month,amount:round2(recurringAmountForMonth(recurring,month,overrides)),baseAmount:recurring.amount,overridden:Boolean(override),override};
    });
  }

  async createImport(cardId:string,filename:string,text:string):Promise<StatementImport>{
    const card=await this.repo.getCard(cardId);if(!card)throw new Error(`Unknown card: ${cardId}`);
    const txs=await this.repo.listTransactions();const imp=buildStatementImport(cardId,filename,text,txs);await this.repo.saveImport(imp);return imp;
  }
  async listImports(){return this.repo.listImports();}
  async getImport(id:string){const x=await this.repo.getImport(id);if(!x)throw new Error(`Unknown import: ${id}`);return x;}
  async resolveImportRow(importId:string,rowId:string,action:'new'|'ignore'|'match',transactionId?:string){
    const imp=await this.getImport(importId);if(imp.status!=='review')throw new Error('Import is already committed');
    const row=imp.rows.find(r=>r.id===rowId);if(!row)throw new Error('Unknown import row');
    if(action==='ignore'){row.status='ignored';row.matchedTransactionId=undefined;}
    if(action==='new'){row.status='new';row.matchedTransactionId=undefined;}
    if(action==='match'){
      if(!transactionId)throw new Error('transactionId is required for match');
      const tx=(await this.repo.listTransactions()).find(t=>t.id===transactionId);if(!tx||tx.cardId!==imp.cardId)throw new Error('Invalid transaction match');
      row.status='matched';row.matchedTransactionId=transactionId;row.matchConfidence=1;
    }
    await this.repo.updateImport(imp);return imp;
  }

  async commitImport(importId:string){
    const imp=await this.getImport(importId);if(imp.status!=='review')throw new Error('Import is already committed');
    const unresolved=imp.rows.filter(r=>r.status==='possible_match');if(unresolved.length)throw new Error(`${unresolved.length} possible matches require review before commit`);
    for(const row of imp.rows){
      if(row.status!=='new')continue;
      await this.createTransaction({cardId:imp.cardId,date:row.transactionDate,description:row.description,amount:row.amount,kind:row.kindGuess,financing:row.financingGuess,source:'statement_import',sourceImportId:imp.id});
      row.status='committed';
    }
    if(imp.summary.statementDate && (imp.summary.totalBalance!==undefined || (imp.summary.regularBalance!==undefined && imp.summary.installmentBalance!==undefined))){
      const componentTotal=(imp.summary.regularBalance??0)+(imp.summary.installmentBalance??0);
      const reported=imp.summary.totalBalance;
      const useComponents=imp.summary.dataQuality==='inconsistent' && componentTotal>0 && (reported===undefined || Math.abs(componentTotal-reported)>1);
      const operationalTotal=useComponents?componentTotal:(reported??componentTotal);
      const qualityNote=useComponents?`Saldo total publicado: ${reported?.toFixed(2)??'no detectado'}; saldo operativo derivado de componentes: ${componentTotal.toFixed(2)}.`:'';
      await this.repo.upsertCardSnapshot({cardId:imp.cardId,statementDate:imp.summary.statementDate,totalBalance:round2(operationalTotal),regularBalance:imp.summary.regularBalance,installmentBalance:imp.summary.installmentBalance,paymentToAvoidInterest:imp.summary.paymentToAvoidInterest,availableCredit:imp.summary.availableCredit,dataQuality:imp.summary.dataQuality,note:[qualityNote,...imp.extractionWarnings].filter(Boolean).join(' ')||undefined});
    }
    imp.status='committed';imp.committedAt=new Date().toISOString();await this.repo.updateImport(imp);return imp;
  }

  async getPreferences(){return this.repo.getPreferences();}

  async updatePreferences(patch:Partial<FinancialPreferences>){
    const current=await this.repo.getPreferences();
    const next:FinancialPreferences={...current,...patch,updatedAt:new Date().toISOString()};
    if(next.openingCash<0)throw new Error('openingCash must be >= 0');
    if(next.variableSpendTarget<0)throw new Error('variableSpendTarget must be >= 0');
    if(next.emergencyFundMonths<0||next.emergencyFundMonths>24)throw new Error('emergencyFundMonths must be 0..24');
    if(next.emergencyFundBalance<0)throw new Error('emergencyFundBalance must be >= 0');
    if(next.forecastHorizonMonths<1||next.forecastHorizonMonths>36)throw new Error('forecastHorizonMonths must be 1..36');
    await this.repo.savePreferences(next);return next;
  }

  private async buildForecastEnvelope(options:ForecastOptions,scenario?:ScenarioRequest):Promise<ForecastEnvelope>{
    const stored=await this.repo.getPreferences();
    const prefs:FinancialPreferences={...stored,openingCash:options.openingCash??stored.openingCash,variableSpendTarget:options.variableSpendTarget??stored.variableSpendTarget,forecastHorizonMonths:options.horizonMonths??stored.forecastHorizonMonths};
    const asOf=options.asOf; if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw new Error('asOf must be YYYY-MM-DD');
    const until=horizonEnd(asOf,prefs.forecastHorizonMonths);
    const [cards,snapshots,txs,rules,overrides,incomeRules,commitments,plans]=await Promise.all([
      this.repo.listCards(true),this.repo.listCardSnapshots(),this.repo.listTransactions(),this.repo.listRecurring(),this.repo.listRecurringOverrides(),this.repo.listIncomeRules(),this.repo.listInstallmentCommitments(),this.repo.listDebtPlans()
    ]);
    const cardMap=new Map(cards.map(c=>[c.id,c]));const snapshotMap=new Map(snapshots.map(x=>[x.cardId,x]));
    const events:any[]=[];const warnings:string[]=[];const assumptions:string[]=[];
    events.push(...projectIncomeRules(incomeRules,asOf,until));

    // Current reconciled statements: one cash payment, never re-count the underlying purchases.
    for(const snap of snapshots){const card=cardMap.get(snap.cardId);if(!card||!snap.paymentToAvoidInterest)continue;const close=new Date(snap.statementDate+'T00:00:00Z');const p=projectTransaction({id:'snapshot',cardId:card.id,date:snap.statementDate,description:'snapshot',amount:snap.paymentToAvoidInterest,kind:'purchase',financing:'regular'},card) as PurchaseProjection;const date=p.payDate;if(date>=asOf&&date<=until)events.push({date,label:`Estado ${card.name}`,amount:snap.paymentToAvoidInterest,type:'expense',itemType:'card_payment',cardId:card.id,sourceId:`snapshot:${card.id}`,metadata:{statementDate:snap.statementDate,dataQuality:snap.dataQuality}});}

    // Recurring obligations. Known card domiciles are shifted to their expected card payment date.
    for(const rule of rules){
      const occurrences=projectRecurring(rule,until,overrides).filter(o=>o.date>=asOf);
      for(const o of occurrences){
        if(rule.offsetIncome&&rule.offsetIncome>0)events.push({date:o.date,label:`Apoyo · ${rule.name}`,amount:rule.offsetIncome,type:'income',itemType:'income',sourceId:`offset:${rule.id}`,assumption:true});
        const amount=Math.max(0,o.amount-(rule.offsetIncome?0:0));
        if(rule.cardId&&cardMap.has(rule.cardId)){
          const card=cardMap.get(rule.cardId)!;const p=projectTransaction({id:`rec-${rule.id}-${o.date}`,cardId:card.id,date:o.date,description:rule.name,amount,kind:'subscription',financing:'regular'},card) as PurchaseProjection;
          if(p.payDate>=asOf&&p.payDate<=until)events.push({date:p.payDate,label:`${card.name} · ${rule.name}`,amount,type:'expense',itemType:'card_payment',cardId:card.id,sourceId:`recurring:${rule.id}`,assumption:true,metadata:{chargeDate:o.date,override:o.override}});
        }else events.push({date:o.date,label:rule.name,amount,type:'expense',itemType:'fixed_expense',sourceId:`recurring:${rule.id}`,assumption:true,metadata:{override:o.override}});
      }
    }
    assumptions.push('Los recurrentes con tarjeta conocida se proyectan a la fecha esperada de pago; los demás se muestran en su fecha de ocurrencia configurada.');

    // New/unreconciled transactions after each card's latest official snapshot.
    for(const tx of txs){
      if(tx.kind==='payment')continue;const card=cardMap.get(tx.cardId);if(!card)continue;const snap=snapshotMap.get(tx.cardId);if(snap&&tx.date<=snap.statementDate)continue;const p=projectTransaction(tx,card) as PurchaseProjection;const sign=tx.kind==='refund'?-1:1;
      if(tx.financing==='msi'&&p.installments){const firstDay=Number(p.payDate.slice(8,10));for(const i of p.installments){const date=dateAtMonth(i.dueMonth,firstDay);if(date>=asOf&&date<=until){if(sign>0)events.push({date,label:`${card.name} · ${tx.description} (${i.number}/${p.installments.length})`,amount:i.amount,type:'expense',itemType:'installment',cardId:card.id,sourceId:tx.id});else events.push({date,label:`Reembolso ${card.name} · ${tx.description}`,amount:i.amount,type:'income',itemType:'transfer',cardId:card.id,sourceId:tx.id});}}}
      else if(p.payDate>=asOf&&p.payDate<=until){const e={date:p.payDate,label:`${card.name} · ${tx.description}`,amount:tx.amount,type:sign>0?'expense':'income',itemType:'card_payment',cardId:card.id,sourceId:tx.id};events.push(e);}
    }

    // Existing zero-interest installments already documented in statements.
    for(const c of commitments){const dates=monthlyDates(c.nextPaymentDate,c.remainingPayments);dates.forEach((date,i)=>{if(date>=asOf&&date<=until)events.push({date,label:`${cardMap.get(c.cardId)?.name||c.cardId} · ${c.name} (${i+1}/${c.remainingPayments})`,amount:c.monthlyAmount,type:'expense',itemType:'installment',cardId:c.cardId,sourceId:c.id,metadata:{dataQuality:c.dataQuality}})});}

    // Interest-bearing debt. A scenario extra payment rewrites only the selected plan schedule.
    let interestAndTaxSaved=0,paymentsSaved=0;
    for(const plan of plans){
      const extra=scenario?.extraDebtPayment?.planId===plan.id?scenario.extraDebtPayment:undefined;
      let extraAmount=extra?.amount||0;if(extraAmount<0)extraAmount=0;
      if(extra&&plan.nextPaymentDate&&extra.date>plan.nextPaymentDate)warnings.push(`El abono a ${plan.name} ocurre después de su próximo pago; esta versión aproxima el abono como reducción de principal antes del calendario restante.`);
      if(extra&&extra.date>=asOf&&extra.date<=until)events.push({date:extra.date,label:`Abono extraordinario · ${plan.name}`,amount:extraAmount,type:'expense',itemType:'extra_debt_payment',cardId:plan.cardId,sourceId:plan.id});
      const schedule=amortize(plan,extraAmount);if(extra){const cmp=compareExtraPayment(plan,extraAmount);interestAndTaxSaved+=cmp.interestAndTaxSaved;paymentsSaved+=cmp.paymentsSaved;}
      const start=plan.nextPaymentDate||asOf;const dates=monthlyDates(start,schedule.rows.length);schedule.rows.forEach((row,i)=>{const date=dates[i];if(date>=asOf&&date<=until)events.push({date,label:`${cardMap.get(plan.cardId)?.name||plan.cardId} · ${plan.name}`,amount:round2(row.payment),type:'expense',itemType:'interest_debt',cardId:plan.cardId,sourceId:plan.id,metadata:{principal:round2(row.principalPaid),interest:round2(row.interest),tax:round2(row.tax),closing:round2(row.closing)}})});
    }

    events.push(...projectVariableBudget(prefs.variableSpendTarget,asOf,until));
    assumptions.push(`Presupuesto variable: ${prefs.variableSpendTarget.toFixed(2)} MXN/mes, distribuido en cuatro sobres de planeación.`);

    // Scenario additions.
    if(scenario?.oneTimeIncome&&scenario.oneTimeIncome.date>=asOf&&scenario.oneTimeIncome.date<=until)events.push({date:scenario.oneTimeIncome.date,label:scenario.oneTimeIncome.label||'Ingreso extraordinario simulado',amount:scenario.oneTimeIncome.amount,type:'income',itemType:'income',assumption:true,sourceId:'scenario-income'});
    if(scenario?.purchase){const q=scenario.purchase;const card=cardMap.get(q.cardId);if(!card)throw new Error(`Unknown card: ${q.cardId}`);const p=projectTransaction({id:'scenario-purchase',cardId:q.cardId,date:q.date,description:q.description||'Compra simulada',amount:q.amount,kind:'purchase',financing:q.financing||'regular',installments:q.installments},card) as PurchaseProjection;if(q.financing==='msi'&&p.installments){const day=Number(p.payDate.slice(8,10));for(const i of p.installments){const date=dateAtMonth(i.dueMonth,day);if(date>=asOf&&date<=until)events.push({date,label:`Simulación · ${q.description||'Compra'} (${i.number}/${p.installments.length})`,amount:i.amount,type:'expense',itemType:'scenario_purchase',cardId:q.cardId,sourceId:'scenario-purchase',assumption:true});}}else if(p.payDate>=asOf&&p.payDate<=until)events.push({date:p.payDate,label:`Simulación · ${q.description||'Compra'}`,amount:q.amount,type:'expense',itemType:'scenario_purchase',cardId:q.cardId,sourceId:'scenario-purchase',assumption:true});}

    if(prefs.openingCash===0)warnings.push('Saldo líquido inicial = 0. Configura tu saldo real para obtener mínimos diarios útiles.');
    if(cards.some(c=>c.id==='liverpool'))warnings.push('Liverpool: fecha de corte 27 y pago el día 27 del mes siguiente. El desglose futuro de planes no se proyecta aún porque el PDF compartido no expone texto fiable a nivel de cada plan.');
    const forecast=buildForecast(asOf,until,events,prefs,warnings);

    // Known debt/commitment balance trajectory, deliberately separate from total card balance.
    const months=forecast.monthly.map(m=>m.month);const debtTimeline:DebtTimelineRow[]=[];
    for(const month of months){let interestPrincipal=0,zeroInterest=0,scheduled=0;
      for(const plan of plans){const extra=scenario?.extraDebtPayment?.planId===plan.id?scenario.extraDebtPayment.amount:0;const sch=amortize(plan,extra);const dates=monthlyDates(plan.nextPaymentDate||asOf,sch.rows.length);let closing=Math.max(0,plan.principal-extra);for(let i=0;i<sch.rows.length;i++){if(dates[i].slice(0,7)<=month)closing=sch.rows[i].closing;if(dates[i].slice(0,7)===month)scheduled+=sch.rows[i].payment;}interestPrincipal+=closing;}
      for(const c of commitments){const dates=monthlyDates(c.nextPaymentDate,c.remainingPayments);const paid=dates.filter(d=>d.slice(0,7)<=month).length;zeroInterest+=Math.max(0,c.remainingPayments-paid)*c.monthlyAmount;scheduled+=dates.filter(d=>d.slice(0,7)===month).length*c.monthlyAmount;}
      debtTimeline.push({month,interestPrincipal:round2(interestPrincipal),zeroInterestCommitments:round2(zeroInterest),knownCommittedBalance:round2(interestPrincipal+zeroInterest),scheduledDebtPayments:round2(scheduled)});
    }
    const fixed=(await this.repo.listRecurring()).reduce((s,r)=>s+monthlyEquivalent(r),0);const target=round2(fixed*prefs.emergencyFundMonths);const emergency={monthlyEssentialEstimate:round2(fixed),targetMonths:prefs.emergencyFundMonths,targetAmount:target,currentAmount:round2(prefs.emergencyFundBalance),gap:round2(Math.max(0,target-prefs.emergencyFundBalance)),coverageMonths:fixed?round2(prefs.emergencyFundBalance/fixed):0};
    (forecast as any)._scenarioStats={interestAndTaxSaved:round2(interestAndTaxSaved),paymentsSaved};
    return {forecast,debtTimeline,emergencyFund:emergency,assumptions};
  }

  async forecast(options:ForecastOptions){return this.buildForecastEnvelope(options);}

  async simulateScenario(request:ScenarioRequest):Promise<ScenarioComparison>{
    const baseline=await this.buildForecastEnvelope(request);const scenario=await this.buildForecastEnvelope(request,request);const stats=(scenario.forecast as any)._scenarioStats||{interestAndTaxSaved:0,paymentsSaved:0};delete (baseline.forecast as any)._scenarioStats;delete (scenario.forecast as any)._scenarioStats;
    const deltas={endingCash:round2(scenario.forecast.metrics.endingCash-baseline.forecast.metrics.endingCash),minimumCash:round2(scenario.forecast.metrics.minimumCash-baseline.forecast.metrics.minimumCash),negativeDays:scenario.forecast.metrics.negativeDays-baseline.forecast.metrics.negativeDays,totalOutflow:round2(scenario.forecast.metrics.totalOutflow-baseline.forecast.metrics.totalOutflow),interestAndTaxSaved:stats.interestAndTaxSaved,paymentsSaved:stats.paymentsSaved};
    const alerts:string[]=[];if(scenario.forecast.metrics.minimumCash<0)alerts.push(`El escenario cruza saldo negativo el ${scenario.forecast.metrics.firstNegativeDate}.`);if(request.purchase?.financing==='msi'&&request.purchase.installments){const monthly=request.purchase.amount/request.purchase.installments;const ratio=monthly/34000;const pref=await this.repo.getPreferences();if(ratio>pref.maxMsiIncomeRatio)alerts.push(`La nueva mensualidad representa ${(ratio*100).toFixed(1)}% del sueldo mensual, por encima del umbral configurado de ${(pref.maxMsiIncomeRatio*100).toFixed(0)}%.`);}return {baseline,scenario,deltas,alerts};
  }

  async listTransactions(){ return this.repo.listTransactions(); }
  async listCards(includeArchived=false){ return this.repo.listCards(includeArchived); }
  async listRecurring(){ return this.repo.listRecurring(); }
  async listRecurringOverrides(){return this.repo.listRecurringOverrides();}
  async listDebtPlans(){ return this.repo.listDebtPlans(); }
  async bootstrap():Promise<AppBootstrap>{
    const [cards,snapshots,recurring,recurringOverrides,transactions]=await Promise.all([this.repo.listCards(),this.repo.listCardSnapshots(),this.repo.listRecurring(),this.repo.listRecurringOverrides(),this.repo.listTransactions()]);
    return {cards,snapshots,recurring,recurringOverrides,transactions};
  }

  async cardDashboard(cardId:string):Promise<CardDashboard>{
    const [card,snapshot,txs]=await Promise.all([this.repo.getCard(cardId),this.repo.getCardSnapshot(cardId),this.repo.listTransactions()]);
    if(!card) throw new Error(`Unknown card: ${cardId}`);
    const cardTx=txs.filter(t=>t.cardId===cardId).sort((a,b)=>b.date.localeCompare(a.date));
    const today=new Date().toISOString().slice(0,10);const currentClose=statementCloseFor(today,card).toISOString().slice(0,10);
    const cycleTx=cardTx.filter(t=>t.kind!=='payment' && projectTransaction(t,card).close===currentClose);
    const currentCycleSpend=cycleTx.reduce((s,t)=>s+(t.kind==='refund'?-t.amount:t.amount),0);
    const projectedNextPayment=cycleTx.reduce((sum,t)=>{const p=projectTransaction(t,card) as PurchaseProjection;const sign=t.kind==='refund'?-1:1;if(t.financing==='msi'&&p.installments)return sum+sign*(p.installments[0]?.amount||0);return sum+sign*t.amount;},0);
    const balanceDelta=cardTx.filter(t=>!snapshot||t.date>snapshot.statementDate).reduce((sum,t)=>sum+((t.kind==='payment'||t.kind==='refund')?-t.amount:t.amount),0);
    const currentBalance=round2(Math.max(0,(snapshot?.totalBalance||0)+balanceDelta));
    return {card,snapshot,currentBalance,utilization:round2(currentBalance/card.creditLimit*100),currentCycleSpend:round2(currentCycleSpend),projectedNextPayment:round2(projectedNextPayment),transactions:cardTx,dataQuality:snapshot?.dataQuality||'estimated'};
  }
}
