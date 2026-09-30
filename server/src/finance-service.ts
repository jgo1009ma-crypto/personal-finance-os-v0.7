import {amortize, buildForecast, compareExtraPayment, horizonEnd, legacyTrackerItems, legacyTrackerMeta, legacyTrackerMonthlyTotals, legacyTrackerSourceTotals, monthlyEquivalent, projectIncomeRules, projectRecurring, projectTransaction, projectVariableBudget, recurringAmountForMonth, statementCloseFor} from '../../core/src';
import {Card,FinancialAccount,FinancialPreferences,GoalContribution,RecurringOverride,SavingsGoal,UiPreferences} from '../../core/src/types';
import {AppBootstrap, CardDashboard, CreateAccountInput, CreateCardInput, CreateGoalInput, CreateTransactionInput, DebtTimelineRow, ExtraPaymentSimulation, ForecastEnvelope, ForecastOptions, GoalProgress, LegacyTrackerReport, Overview, PlanningAlert, PlanningSummary, PurchaseProjection, RecurringMonthRow, ScenarioComparison, ScenarioRequest, StatementImport, TransactionRecord} from './contracts';
import {FinanceRepository} from './repositories';
import {buildStatementImport,reconcileRows} from './statement-import';
import {CardSnapshot} from './financial-snapshots';
import {finiteNumber,validDate,validMonth} from '../../core/src/validation';
import {validateTransaction,validateCard,validatePreferences} from './validation';
import {endOrDay,makeDate,monthAdd,ym} from '../../core/src/date';

function round2(n:number){ return Math.round((n+Number.EPSILON)*100)/100; }
function pct(n:number){ return Math.round(n*10000)/100; }
function slug(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)||'card';}


function dateAtMonth(month:string,day:number){const [y,m]=month.split('-').map(Number);return endOrDay(y,m,day).toISOString().slice(0,10);}
function monthlyDates(first:string,count:number){const d=new Date(first+'T00:00:00Z');const day=d.getUTCDate();const out:string[]=[];for(let i=0;i<count;i++){const x=monthAdd(d,i);out.push(endOrDay(x.getUTCFullYear(),x.getUTCMonth()+1,day).toISOString().slice(0,10));}return out;}

export class FinanceService {
  constructor(private readonly repo:FinanceRepository){}

  async createTransaction(input:CreateTransactionInput):Promise<{transaction:TransactionRecord;projection:PurchaseProjection}> {
    const result=await this.prepareTransaction(input);
    await this.repo.saveTransaction(result.transaction);
    return result;
  }

  private async prepareTransaction(input:CreateTransactionInput):Promise<{transaction:TransactionRecord;projection:PurchaseProjection}> {
    validateTransaction(input);

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
    const projection=projectTransaction(tx,card) as PurchaseProjection;
    return {transaction:tx,projection};
  }

  async projectPurchase(input:CreateTransactionInput):Promise<PurchaseProjection>{
    validateTransaction({...input,description:input.description||"Proyección"});
    const card=await this.repo.getCard(input.cardId);
    if(!card) throw new Error(`Unknown card: ${input.cardId}`);
    return projectTransaction({
      id:'projection', cardId:input.cardId, date:input.date, description:input.description,
      amount:input.amount, kind:input.kind ?? 'purchase', financing:input.financing ?? 'regular',
      category:input.category, installments:input.installments, apr:input.apr
    },card) as PurchaseProjection;
  }

  async createCard(input:CreateCardInput):Promise<Card>{
    validateCard(input);
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
    validateCard(updated);
    if(!["active","archived"].includes(updated.status||"active"))throw new Error("invalid card status");
    if(updated.statementCloseDay<1||updated.statementCloseDay>31)throw new Error('statementCloseDay must be 1..31');
    if(!(updated.creditLimit>0))throw new Error('creditLimit must be > 0');
    if(patch.status==='archived'&&!card.archivedAt)updated.archivedAt=new Date().toISOString();
    if(patch.status==='active')updated.archivedAt=undefined;
    await this.repo.updateCard(updated);return updated;
  }
  async archiveCard(id:string){return this.updateCard(id,{status:'archived'});}
  async restoreCard(id:string){return this.updateCard(id,{status:'active'});}

  async simulateExtraPayment(planId:string, extraPayment:number):Promise<ExtraPaymentSimulation>{
    finiteNumber(extraPayment,'extraPayment',0.01);
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

  async overview(asOf:string, monthlyIncome?:number):Promise<Overview>{
    validDate(asOf);
    const [plans,recurring,cards,snapshots,txs]=await Promise.all([
      this.repo.listDebtPlans(),this.repo.listRecurring(),this.repo.listCards(true),this.repo.listCardSnapshots(),this.repo.listTransactions()
    ]);
    if(snapshots.some(s=>s.statementDate>asOf))throw new Error('Historical balance unavailable before the latest statement; use a later asOf date');
    if(monthlyIncome===undefined){
      const rules=(await this.repo.listIncomeRules()).filter(r=>r.frequency==='monthly'||r.frequency==='semimonthly');
      const month=asOf.slice(0,7);
      monthlyIncome=projectIncomeRules(rules,month+'-01',dateAtMonth(month,31)).reduce((sum,e)=>sum+e.amount,0);
    }
    finiteNumber(monthlyIncome,'monthlyIncome');
    const balance=(id:string)=>{
      const snap=snapshots.find(s=>s.cardId===id);
      const delta=txs.filter(t=>t.cardId===id&&t.date<=asOf&&(!snap||t.date>snap.statementDate)).reduce((sum,t)=>sum+((t.kind==='payment'||t.kind==='refund')?-t.amount:t.amount),0);
      return Math.max(0,(snap?.totalBalance||0)+delta);
    };
    const cardIds=new Set([...cards.map(c=>c.id),...snapshots.map(s=>s.cardId)]);
    const totalDebt=[...cardIds].reduce((sum,id)=>sum+balance(id),0);
    const activeCards=cards.filter(c=>c.status!=='archived');
    const activeDebt=activeCards.reduce((sum,c)=>sum+balance(c.id),0);
    const interestDebt=plans.filter(p=>p.apr>0).reduce((s,p)=>s+p.principal,0);
    const fixed=recurring.reduce((s,r)=>s+monthlyEquivalent(r),0);
    const limits=activeCards.reduce((s,c)=>s+c.creditLimit,0);
    const nextPayments=snapshots.reduce((sum,snap)=>{
      const credits=txs.filter(t=>t.cardId===snap.cardId&&t.date>snap.statementDate&&t.date<=asOf&&(t.kind==='payment'||t.kind==='refund')).reduce((n,t)=>n+t.amount,0);
      return sum+Math.max(0,(snap.paymentToAvoidInterest||0)-credits);
    },0);
    return {asOf,monthlyIncome:round2(monthlyIncome),monthlyFixedNet:round2(fixed),totalDebt:round2(totalDebt),interestBearingDebt:round2(interestDebt),monthlyFreeBeforeVariableAndInstallments:round2(monthlyIncome-fixed),totalCreditLimit:round2(limits),creditUtilization:limits?pct(activeDebt/limits):0,nextStatementPayments:round2(nextPayments),dataQualityWarnings:snapshots.filter(s=>s.dataQuality==='estimated'||s.dataQuality==='inconsistent').length};
  }

  async legacyTrackerReport():Promise<LegacyTrackerReport>{
    const [txs,incomeRules,recurring,prefs]=await Promise.all([this.repo.listTransactions(),this.repo.listIncomeRules(),this.repo.listRecurring(),this.repo.getPreferences()]);
    const imported=new Map(txs.filter(t=>t.source==='legacy_tracker'&&t.sourceImportId).map(t=>[t.sourceImportId!,t]));
    const items=legacyTrackerItems.map(item=>({...item,imported:imported.has(item.id),importedTransactionId:imported.get(item.id)?.id}));
    const candidateVariableSpend=legacyTrackerItems.filter(i=>i.disposition==='candidate'&&i.financing!=='msi').reduce((s,i)=>s+(i.amount||0),0);
    const newInstallmentPrincipal=legacyTrackerItems.filter(i=>i.disposition==='candidate'&&i.financing==='msi').reduce((s,i)=>s+(i.transactionAmount||i.totalAmount||0),0);
    const current=legacyTrackerMonthlyTotals['2026-10']||0,jan=legacyTrackerMonthlyTotals['2027-01']||0;
    const incomeEvents=projectIncomeRules(incomeRules,'2026-10-01','2026-10-31');
    const directIncome=incomeEvents.reduce((sum,e)=>sum+e.amount,0);
    const supportIncome=recurring.filter(r=>r.startDate<='2026-10-31'&&(r.offsetIncome||0)>0).reduce((sum,r)=>sum+(r.offsetIncome||0),0);
    const knownOctoberInflows=round2(directIncome+supportIncome);
    const variableOverTarget=round2(candidateVariableSpend-(prefs.variableSpendTarget||0));
    return {
      meta:legacyTrackerMeta,
      monthlyTotals:legacyTrackerMonthlyTotals,
      sourceTotals:legacyTrackerSourceTotals,
      currentCycleTotal:round2(current),
      projectedJanuaryTotal:round2(jan),
      declineToJanuaryPct:current?round2((1-jan/current)*100):0,
      candidateVariableSpend:round2(candidateVariableSpend),
      candidateCount:legacyTrackerItems.filter(i=>i.disposition==='candidate').length,
      newInstallmentPrincipal:round2(newInstallmentPrincipal),
      knownOctoberInflows,
      octoberResidualAfterKnownInflows:round2(knownOctoberInflows-current),
      variableSpendTarget:round2(prefs.variableSpendTarget||0),
      variableOverTarget,
      variableOverTargetPct:prefs.variableSpendTarget?round2(variableOverTarget/prefs.variableSpendTarget*100):0,
      bbvaSharePct:current?round2((legacyTrackerSourceTotals['2026-10']?.BBVA||0)/current*100):0,
      items
    };
  }

  async importLegacyTrackerItem(id:string,date?:string){
    const item=legacyTrackerItems.find(x=>x.id===id);if(!item)throw new Error('Legacy tracker item not found');
    if(item.disposition!=='candidate'||!item.cardId)throw new Error('This tracker item is reference-only and cannot be imported automatically');
    const txs=await this.repo.listTransactions();const existing=txs.find(t=>t.source==='legacy_tracker'&&t.sourceImportId===id);if(existing)return {transaction:existing,duplicate:true};
    const effectiveDate=date||item.suggestedDate;if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate))throw new Error('date must be YYYY-MM-DD');
    const created=await this.createTransaction({cardId:item.cardId,date:effectiveDate,description:item.description,amount:item.transactionAmount||item.amount,kind:item.transactionKind||'purchase',financing:item.financing||'regular',category:item.category,installments:item.installments,source:'legacy_tracker',sourceImportId:item.id});
    return {...created,duplicate:false,legacyItem:item};
  }

  async paymentMonthSpend(month:string):Promise<number>{
    validMonth(month);
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
    finiteNumber(amount,'amount');
    if(periodKey.length===7)validMonth(periodKey);else validDate(periodKey);
    const all=await this.repo.listRecurringOverrides();const previous=all.find(o=>o.recurringId===recurringId&&o.periodKey===periodKey);const now=new Date().toISOString();
    const override:RecurringOverride={id:previous?.id||crypto.randomUUID(),recurringId,periodKey,amount:round2(amount),note,createdAt:previous?.createdAt||now,updatedAt:now};
    await this.repo.saveRecurringOverride(override);return override;
  }

  async recurringForMonth(month:string):Promise<RecurringMonthRow[]>{
    validMonth(month);
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
    if(!['new','ignore','match'].includes(action))throw new Error('Invalid import action');
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
    const transactions:TransactionRecord[]=[];
    let snapshot:CardSnapshot|undefined;
    const existing=(await this.repo.listTransactions()).filter(t=>t.cardId===imp.cardId);
    const candidates=reconcileRows(structuredClone(imp.rows.filter(r=>r.status==='new')),existing.filter(t=>!imp.reviewedTransactionIds?.includes(t.id)));
    if(candidates.some(r=>r.status!=='new'))throw new Error('Transactions changed since review; re-import and reconcile before commit');
    for(const row of imp.rows){
      if(row.status!=='new')continue;
      const prepared=await this.prepareTransaction({cardId:imp.cardId,date:row.transactionDate,description:row.description,amount:row.amount,kind:row.kindGuess,financing:row.financingGuess,installments:row.installments,source:'statement_import',sourceImportId:imp.id});
      transactions.push(prepared.transaction);
      row.status='committed';
    }
    if(imp.summary.statementDate && (imp.summary.totalBalance!==undefined || (imp.summary.regularBalance!==undefined && imp.summary.installmentBalance!==undefined))){
      const componentTotal=(imp.summary.regularBalance??0)+(imp.summary.installmentBalance??0);
      const reported=imp.summary.totalBalance;
      const useComponents=imp.summary.dataQuality==='inconsistent' && componentTotal>0 && (reported===undefined || Math.abs(componentTotal-reported)>1);
      const operationalTotal=useComponents?componentTotal:(reported??componentTotal);
      const qualityNote=useComponents?`Saldo total publicado: ${reported?.toFixed(2)??'no detectado'}; saldo operativo derivado de componentes: ${componentTotal.toFixed(2)}.`:'';
      snapshot={cardId:imp.cardId,statementDate:imp.summary.statementDate,totalBalance:round2(operationalTotal),regularBalance:imp.summary.regularBalance,installmentBalance:imp.summary.installmentBalance,paymentToAvoidInterest:imp.summary.paymentToAvoidInterest,availableCredit:imp.summary.availableCredit,dataQuality:imp.summary.dataQuality,note:[qualityNote,...imp.extractionWarnings].filter(Boolean).join(' ')||undefined};
      const current=await this.repo.getCardSnapshot(imp.cardId);
      if(current&&snapshot.statementDate<current.statementDate)snapshot=undefined;
    }
    imp.status='committed';imp.committedAt=new Date().toISOString();await this.repo.commitStatementImport(imp,transactions,snapshot);return imp;
  }

  async getPreferences(){return this.repo.getPreferences();}

  async updatePreferences(patch:Partial<FinancialPreferences>){
    const current=await this.repo.getPreferences();
    const next:FinancialPreferences={...current,...patch,updatedAt:new Date().toISOString()};
    validatePreferences(next);
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
    validatePreferences(prefs);
    const asOf=options.asOf;validDate(asOf,'asOf');
    const until=horizonEnd(asOf,prefs.forecastHorizonMonths);
    const [cards,snapshots,txs,rules,overrides,incomeRules,commitments,plans]=await Promise.all([
      this.repo.listCards(true),this.repo.listCardSnapshots(),this.repo.listTransactions(),this.repo.listRecurring(),this.repo.listRecurringOverrides(),this.repo.listIncomeRules(),this.repo.listInstallmentCommitments(),this.repo.listDebtPlans()
    ]);
    const cardMap=new Map(cards.map(c=>[c.id,c]));const snapshotMap=new Map(snapshots.map(x=>[x.cardId,x]));
    const events:any[]=[];const warnings:string[]=[];const assumptions:string[]=[];
    events.push(...projectIncomeRules(incomeRules,asOf,until));

    // Current reconciled statements: one cash payment, never re-count the underlying purchases.
    for(const snap of snapshots){const card=cardMap.get(snap.cardId);if(!card||!snap.paymentToAvoidInterest)continue;const close=new Date(snap.statementDate+'T00:00:00Z');const p=projectTransaction({id:'snapshot',cardId:card.id,date:snap.statementDate,description:'snapshot',amount:snap.paymentToAvoidInterest,kind:'purchase',financing:'regular'},card) as PurchaseProjection;const date=p.payDate<asOf?asOf:p.payDate;if(date<=until)events.push({date,label:`Estado ${card.name}`,amount:snap.paymentToAvoidInterest,type:'expense',itemType:'card_payment',cardId:card.id,sourceId:`snapshot:${card.id}`,metadata:{statementDate:snap.statementDate,dataQuality:snap.dataQuality}});}

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
    assumptions.push('Los intereses usan periodos estimados de 30 días; tasas y saldos de planes deben actualizarse con el estado de cuenta.');
    assumptions.push('Los recurrentes con tarjeta conocida se proyectan a la fecha esperada de pago; los demás se muestran en su fecha de ocurrencia configurada.');

    // Unreconciled card charges. Refunds/payments are applied once below as liability credits.
    for(const tx of txs){
      if(tx.kind==='payment'||tx.kind==='refund')continue;
      const card=cardMap.get(tx.cardId);if(!card)continue;
      const snap=snapshotMap.get(tx.cardId);if(snap&&tx.date<=snap.statementDate)continue;
      const p=projectTransaction(tx,card) as PurchaseProjection;
      if(tx.financing==='msi'&&p.installments){
        const day=Number(p.payDate.slice(8,10));
        for(const installment of p.installments){const date=dateAtMonth(installment.dueMonth,day);
          if(date>=asOf&&date<=until)events.push({date,label:`${card.name} · ${tx.description} (${installment.number}/${p.installments.length})`,amount:installment.amount,type:'expense',itemType:'installment',cardId:card.id,sourceId:tx.id});
        }
      }else if(p.payDate>=asOf&&p.payDate<=until)events.push({date:p.payDate,label:`${card.name} · ${tx.description}`,amount:tx.amount,type:'expense',itemType:'card_payment',cardId:card.id,sourceId:tx.id});
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
      const schedule=amortize(plan,extraAmount);if(schedule.endingBalance>0.005)warnings.push(`${plan.name}: queda saldo de ${round2(schedule.endingBalance)} al terminar los pagos configurados; el calendario no liquida toda la deuda.`);if(extra){const cmp=compareExtraPayment(plan,extraAmount);interestAndTaxSaved+=cmp.interestAndTaxSaved;paymentsSaved+=cmp.paymentsSaved;}
      const start=plan.nextPaymentDate||asOf;const dates=monthlyDates(start,schedule.rows.length);schedule.rows.forEach((row,i)=>{const date=dates[i];if(date>=asOf&&date<=until)events.push({date,label:`${cardMap.get(plan.cardId)?.name||plan.cardId} · ${plan.name}`,amount:round2(row.payment),type:'expense',itemType:'interest_debt',cardId:plan.cardId,sourceId:plan.id,metadata:{principal:round2(row.principalPaid),interest:round2(row.interest),tax:round2(row.tax),closing:round2(row.closing)}})});
    }

    events.push(...projectVariableBudget(prefs.variableSpendTarget,asOf,until));
    assumptions.push(`Presupuesto variable: ${prefs.variableSpendTarget.toFixed(2)} MXN/mes, distribuido en cuatro sobres de planeación.`);

    // Scenario additions.
    if(scenario?.oneTimeIncome&&scenario.oneTimeIncome.date>=asOf&&scenario.oneTimeIncome.date<=until)events.push({date:scenario.oneTimeIncome.date,label:scenario.oneTimeIncome.label||'Ingreso extraordinario simulado',amount:scenario.oneTimeIncome.amount,type:'income',itemType:'income',assumption:true,sourceId:'scenario-income'});
    if(scenario?.purchase){const q=scenario.purchase;const card=cardMap.get(q.cardId);if(!card)throw new Error(`Unknown card: ${q.cardId}`);const p=projectTransaction({id:'scenario-purchase',cardId:q.cardId,date:q.date,description:q.description||'Compra simulada',amount:q.amount,kind:'purchase',financing:q.financing||'regular',installments:q.installments},card) as PurchaseProjection;if(q.financing==='msi'&&p.installments){const day=Number(p.payDate.slice(8,10));for(const i of p.installments){const date=dateAtMonth(i.dueMonth,day);if(date>=asOf&&date<=until)events.push({date,label:`Simulación · ${q.description||'Compra'} (${i.number}/${p.installments.length})`,amount:i.amount,type:'expense',itemType:'scenario_purchase',cardId:q.cardId,sourceId:'scenario-purchase',assumption:true});}}else if(p.payDate>=asOf&&p.payDate<=until)events.push({date:p.payDate,label:`Simulación · ${q.description||'Compra'}`,amount:q.amount,type:'expense',itemType:'scenario_purchase',cardId:q.cardId,sourceId:'scenario-purchase',assumption:true});}

    if(prefs.openingCash===0)warnings.push('Saldo líquido inicial = 0. Configura tu saldo real para obtener mínimos diarios útiles.');
    if(cards.some(c=>c.id==='liverpool'))warnings.push('Liverpool: fecha de corte 27 y pago el día 27 del mes siguiente. El desglose futuro de planes no se proyecta aún porque el PDF compartido no expone texto fiable a nivel de cada plan.');
    // Apply already recorded payments/refunds to known card obligations, oldest first.
    // Opening cash is as-of cash: paying a card must not consume it a second time.
    for(const card of cards){
      const snap=snapshotMap.get(card.id);
      let credits=txs.filter(t=>t.cardId===card.id&&t.date<=asOf&&(!snap||t.date>snap.statementDate)&&(t.kind==='payment'||t.kind==='refund')).reduce((sum,t)=>sum+t.amount,0);
      const known=events.filter(e=>e.cardId===card.id&&e.type==='expense'&&!e.assumption&&e.itemType!=='extra_debt_payment').sort((a,b)=>a.date.localeCompare(b.date));
      for(const e of known){const applied=Math.min(e.amount,credits);e.amount=round2(e.amount-applied);credits=round2(credits-applied);}
      if(credits>0)warnings.push(`${card.name}: existe crédito a favor sin asignar; no se trata como ingreso en efectivo.`);
      const overdue=known.find(e=>e.sourceId===`snapshot:${card.id}`&&e.amount>0);
      if(overdue&&snap){const due=projectTransaction({id:'due',cardId:card.id,date:snap.statementDate,description:'Estado',amount:1,kind:'purchase',financing:'regular'},card).payDate;if(due<asOf)warnings.push(`${card.name}: el estado vencido se proyecta hoy hasta registrar o conciliar su pago.`);}
    }
    const forecast=buildForecast(asOf,until,events.filter(e=>e.amount>0),prefs,warnings);

    // Known debt/commitment balance trajectory, deliberately separate from total card balance.
    const months=forecast.monthly.map(m=>m.month);const debtTimeline:DebtTimelineRow[]=[];
    for(const month of months){let interestPrincipal=0,zeroInterest=0,scheduled=0;
      for(const plan of plans){const extra=scenario?.extraDebtPayment?.planId===plan.id?scenario.extraDebtPayment.amount:0;const sch=amortize(plan,extra);const dates=monthlyDates(plan.nextPaymentDate||asOf,sch.rows.length);let closing=Math.max(0,plan.principal-extra);for(let i=0;i<sch.rows.length;i++){if(dates[i].slice(0,7)<=month)closing=sch.rows[i].closing;if(dates[i].slice(0,7)===month)scheduled+=sch.rows[i].payment;}interestPrincipal+=closing;}
      for(const c of commitments){const dates=monthlyDates(c.nextPaymentDate,c.remainingPayments);const paid=dates.filter(d=>d.slice(0,7)<=month).length;zeroInterest+=Math.max(0,c.remainingPayments-paid)*c.monthlyAmount;scheduled+=dates.filter(d=>d.slice(0,7)===month).length*c.monthlyAmount;}
      debtTimeline.push({month,interestPrincipal:round2(interestPrincipal),zeroInterestCommitments:round2(zeroInterest),knownCommittedBalance:round2(interestPrincipal+zeroInterest),scheduledDebtPayments:round2(scheduled)});
    }
    const fixed=(await this.repo.listRecurring()).reduce((s,r)=>s+monthlyEquivalent(r),0);const target=round2(fixed*prefs.emergencyFundMonths);const emergencyAccounts=(await this.repo.listAccounts()).filter(a=>a.isEmergencyFund);const emergencyCurrent=round2(emergencyAccounts.length?emergencyAccounts.reduce((sum,a)=>sum+a.balance,0):prefs.emergencyFundBalance);const emergency={monthlyEssentialEstimate:round2(fixed),targetMonths:prefs.emergencyFundMonths,targetAmount:target,currentAmount:emergencyCurrent,gap:round2(Math.max(0,target-emergencyCurrent)),coverageMonths:fixed?round2(emergencyCurrent/fixed):0};
    (forecast as any)._scenarioStats={interestAndTaxSaved:round2(interestAndTaxSaved),paymentsSaved};
    return {forecast,debtTimeline,emergencyFund:emergency,assumptions};
  }

  async forecast(options:ForecastOptions){return this.buildForecastEnvelope(options);}

  async simulateScenario(request:ScenarioRequest):Promise<ScenarioComparison>{
    validDate(request.asOf,'asOf');
    const end=horizonEnd(request.asOf,request.horizonMonths??(await this.repo.getPreferences()).forecastHorizonMonths);
    for(const entry of [request.purchase,request.extraDebtPayment,request.oneTimeIncome]){
      if(entry){validDate(entry.date);finiteNumber(entry.amount,'scenario amount',0.01);if(entry.date<request.asOf||entry.date>end)throw new Error('Scenario date must be inside forecast horizon');}
    }
    if(request.purchase)validateTransaction({...request.purchase,description:request.purchase.description||'Simulación'});
    if(request.extraDebtPayment){
      const extra=request.extraDebtPayment,plan=await this.repo.getDebtPlan(extra.planId);
      if(!plan)throw new Error('Unknown debt plan');
      finiteNumber(extra.amount,'extra payment',0.01,plan.principal);
      if(plan.nextPaymentDate&&extra.date>plan.nextPaymentDate)throw new Error('Extra payment after the next scheduled payment requires an updated debt plan');
    }
    const baseline=await this.buildForecastEnvelope(request);const scenario=await this.buildForecastEnvelope(request,request);const stats=(scenario.forecast as any)._scenarioStats||{interestAndTaxSaved:0,paymentsSaved:0};delete (baseline.forecast as any)._scenarioStats;delete (scenario.forecast as any)._scenarioStats;
    const deltas={endingCash:round2(scenario.forecast.metrics.endingCash-baseline.forecast.metrics.endingCash),minimumCash:round2(scenario.forecast.metrics.minimumCash-baseline.forecast.metrics.minimumCash),negativeDays:scenario.forecast.metrics.negativeDays-baseline.forecast.metrics.negativeDays,totalOutflow:round2(scenario.forecast.metrics.totalOutflow-baseline.forecast.metrics.totalOutflow),interestAndTaxSaved:stats.interestAndTaxSaved,paymentsSaved:stats.paymentsSaved};
    const alerts:string[]=[];if(scenario.forecast.metrics.minimumCash<0)alerts.push(`El escenario cruza saldo negativo el ${scenario.forecast.metrics.firstNegativeDate}.`);if(request.purchase?.financing==='msi'&&request.purchase.installments){const monthly=request.purchase.amount/request.purchase.installments;const income=(await this.overview(request.asOf)).monthlyIncome;const ratio=income>0?monthly/income:Infinity;const pref=await this.repo.getPreferences();if(ratio>pref.maxMsiIncomeRatio)alerts.push(`La nueva mensualidad representa ${(ratio*100).toFixed(1)}% del sueldo mensual, por encima del umbral configurado de ${(pref.maxMsiIncomeRatio*100).toFixed(0)}%.`);}return {baseline,scenario,deltas,alerts};
  }

  async listAccounts(includeArchived=false){ return this.repo.listAccounts(includeArchived); }

  async createAccount(input:CreateAccountInput):Promise<FinancialAccount>{
    if(!input.name?.trim())throw new Error('account name is required');
    if(!['checking','savings','cash','investment','other'].includes(input.type))throw new Error('invalid account type');
    if(!Number.isFinite(input.balance)||input.balance<0)throw new Error('account balance must be >= 0');
    const now=new Date().toISOString();
    const account:FinancialAccount={id:crypto.randomUUID(),name:input.name.trim(),institution:input.institution?.trim()||undefined,type:input.type,balance:round2(input.balance),currency:'MXN',includeInNetWorth:input.includeInNetWorth!==false,isEmergencyFund:Boolean(input.isEmergencyFund),status:'active',note:input.note?.trim()||undefined,createdAt:now,updatedAt:now};
    await this.repo.saveAccount(account);return account;
  }

  async updateAccount(id:string,patch:Partial<CreateAccountInput>&{status?:'active'|'archived'}):Promise<FinancialAccount>{
    const current=await this.repo.getAccount(id);if(!current)throw new Error(`Unknown account: ${id}`);
    const updated:FinancialAccount={...current,...patch,id,currency:'MXN',updatedAt:new Date().toISOString()};
    if(!updated.name?.trim())throw new Error('account name is required');
    if(!Number.isFinite(updated.balance)||updated.balance<0)throw new Error('account balance must be >= 0');
    updated.name=updated.name.trim();updated.institution=updated.institution?.trim()||undefined;updated.note=updated.note?.trim()||undefined;
    if(patch.status==='archived'&&!current.archivedAt)updated.archivedAt=new Date().toISOString();
    if(patch.status==='active')updated.archivedAt=undefined;
    await this.repo.updateAccount(updated);return updated;
  }
  async archiveAccount(id:string){return this.updateAccount(id,{status:'archived'});}

  async listGoals(includeArchived=false){return this.repo.listGoals(includeArchived);}
  async createGoal(input:CreateGoalInput):Promise<SavingsGoal>{
    if(!input.name?.trim())throw new Error('goal name is required');
    finiteNumber(input.targetAmount,'targetAmount',0.01);finiteNumber(input.currentAmount??0,'currentAmount');
    const current=round2(input.currentAmount||0);if(current<0)throw new Error('currentAmount must be >= 0');
    if(input.targetDate)validDate(input.targetDate,'targetDate');
    const now=new Date().toISOString();
    const goal:SavingsGoal={id:crypto.randomUUID(),name:input.name.trim(),type:input.type||'other',targetAmount:round2(input.targetAmount),currentAmount:current,targetDate:input.targetDate,priority:input.priority||'medium',status:current>=input.targetAmount?'completed':'active',note:input.note?.trim()||undefined,createdAt:now,updatedAt:now};
    await this.repo.saveGoal(goal);return goal;
  }
  async updateGoal(id:string,patch:Partial<CreateGoalInput>&{status?:SavingsGoal['status']}):Promise<SavingsGoal>{
    const current=await this.repo.getGoal(id);if(!current)throw new Error(`Unknown goal: ${id}`);
    const updated:SavingsGoal={...current,...patch,id,updatedAt:new Date().toISOString()} as SavingsGoal;
    if(!updated.name?.trim())throw new Error('goal name is required');
    finiteNumber(updated.targetAmount,'targetAmount',0.01);finiteNumber(updated.currentAmount,'currentAmount');
    if(updated.currentAmount<0)throw new Error('currentAmount must be >= 0');
    if(updated.targetDate)validDate(updated.targetDate,'targetDate');
    updated.name=updated.name.trim();updated.note=updated.note?.trim()||undefined;updated.targetAmount=round2(updated.targetAmount);updated.currentAmount=round2(updated.currentAmount);
    if(updated.status!=='archived')updated.status=updated.currentAmount>=updated.targetAmount?'completed':'active';
    if(patch.status==='archived'&&!current.archivedAt)updated.archivedAt=new Date().toISOString();
    if(patch.status==='active')updated.archivedAt=undefined;
    await this.repo.updateGoal(updated);return updated;
  }
  async archiveGoal(id:string){return this.updateGoal(id,{status:'archived'});}
  async contributeToGoal(id:string,amount:number,date?:string,note?:string){
    finiteNumber(amount,'contribution amount',0.01);
    const goal=await this.repo.getGoal(id);if(!goal)throw new Error(`Unknown goal: ${id}`);if(goal.status==='archived')throw new Error('Cannot contribute to an archived goal');
    const when=date||new Date().toISOString().slice(0,10);validDate(when);
    const contribution:GoalContribution={id:crypto.randomUUID(),goalId:id,amount:round2(amount),date:when,note:note?.trim()||undefined,createdAt:new Date().toISOString()};
    await this.repo.contributeToGoal(contribution);return {contribution,goal:await this.repo.getGoal(id)};
  }
  async listGoalContributions(goalId?:string){return this.repo.listGoalContributions(goalId);}

  async getUiPreferences(){return this.repo.getUiPreferences();}
  async updateUiPreferences(patch:Partial<UiPreferences>){
    const current=await this.repo.getUiPreferences();const allowedThemes=['system','light','dark'];const allowedModes=['simple','standard','analytical'];
    const next:UiPreferences={...current,...patch,updatedAt:new Date().toISOString()};
    if(!allowedThemes.includes(next.theme))throw new Error('invalid theme');if(!allowedModes.includes(next.dashboardMode))throw new Error('invalid dashboard mode');
    next.dashboardWidgets=Array.from(new Set((next.dashboardWidgets||[]).map(String))).filter(Boolean);
    await this.repo.saveUiPreferences(next);return next;
  }

  private goalProgress(goal:SavingsGoal,asOf:string):GoalProgress{
    const gap=round2(Math.max(0,goal.targetAmount-goal.currentAmount));const fundedPct=round2(Math.min(100,goal.targetAmount?goal.currentAmount/goal.targetAmount*100:0));
    let monthsRemaining:number|undefined,requiredMonthly:number|undefined;
    if(goal.targetDate){const a=new Date(asOf+'T00:00:00Z'),b=new Date(goal.targetDate+'T00:00:00Z');monthsRemaining=Math.max(1,(b.getUTCFullYear()-a.getUTCFullYear())*12+(b.getUTCMonth()-a.getUTCMonth())+(b.getUTCDate()>=a.getUTCDate()?1:0));requiredMonthly=round2(gap/monthsRemaining);}
    return {goal,fundedPct,gap,monthsRemaining,requiredMonthly};
  }

  async planningSummary(asOf:string):Promise<PlanningSummary>{
    validDate(asOf,'asOf');
    const [accounts,goals,prefs,overview,cards,snapshots,txs]=await Promise.all([this.repo.listAccounts(),this.repo.listGoals(),this.repo.getPreferences(),this.overview(asOf),this.repo.listCards(),this.repo.listCardSnapshots(),this.repo.listTransactions()]);
    const totalAssets=round2(accounts.filter(a=>a.includeInNetWorth).reduce((s,a)=>s+a.balance,0));
    const liquidAssets=round2(accounts.filter(a=>a.type==='checking'||a.type==='savings'||a.type==='cash').reduce((s,a)=>s+a.balance,0));
    const emergencyAccounts=accounts.filter(a=>a.isEmergencyFund);const emergencyCurrent=round2(emergencyAccounts.length?emergencyAccounts.reduce((s,a)=>s+a.balance,0):prefs.emergencyFundBalance);
    const target=round2(overview.monthlyFixedNet*prefs.emergencyFundMonths);const goalItems=goals.filter(g=>g.status!=='archived').map(g=>this.goalProgress(g,asOf));
    const alerts:PlanningAlert[]=[];
    if(!accounts.length)alerts.push({id:'accounts-missing',severity:'info',title:'Completa tus activos',message:'Agrega cuentas bancarias, efectivo o ahorro para calcular un patrimonio neto completo.',route:'accounts'});
    if(overview.interestBearingDebt>0)alerts.push({id:'interest-debt',severity:'warning',title:'Deuda con interés activa',message:`Hay ${round2(overview.interestBearingDebt).toLocaleString('es-MX',{style:'currency',currency:'MXN'})} de principal en planes que generan intereses.`,route:'debt',amount:overview.interestBearingDebt});
    const cardMap=new Map(cards.map(c=>[c.id,c]));
    const risks=cards.map(c=>{const snap=snapshots.find(s=>s.cardId===c.id);const delta=txs.filter(t=>t.cardId===c.id&&t.date<=asOf&&(!snap||t.date>snap.statementDate)).reduce((sum,t)=>sum+((t.kind==='payment'||t.kind==='refund')?-t.amount:t.amount),0);const bal=Math.max(0,(snap?.totalBalance||0)+delta);return {c,bal,u:c.creditLimit?bal/c.creditLimit:0};});
    for(const r of risks.filter(r=>r.u>prefs.maxCreditUtilization).sort((a,b)=>b.u-a.u).slice(0,3))alerts.push({id:`util-${r.c.id}`,severity:r.u>=.8?'critical':'warning',title:`Utilización alta · ${r.c.name}`,message:`La tarjeta está en ${(r.u*100).toFixed(1)}% de utilización; tu umbral configurado es ${(prefs.maxCreditUtilization*100).toFixed(0)}%.`,route:'cards',amount:r.bal});
    if(target>0&&emergencyCurrent<target)alerts.push({id:'emergency-gap',severity:emergencyCurrent<overview.monthlyFixedNet?'warning':'info',title:'Fondo de emergencia incompleto',message:`Faltan ${round2(target-emergencyCurrent).toLocaleString('es-MX',{style:'currency',currency:'MXN'})} para la meta de ${prefs.emergencyFundMonths} meses.`,route:'goals',amount:round2(target-emergencyCurrent)});
    const now=new Date(asOf+'T00:00:00Z');for(const p of goalItems){if(!p.goal.targetDate||p.gap<=0)continue;const days=Math.ceil((new Date(p.goal.targetDate+'T00:00:00Z').getTime()-now.getTime())/86400000);if(days<=90)alerts.push({id:`goal-${p.goal.id}`,severity:days<30?'warning':'info',title:`Meta próxima · ${p.goal.name}`,message:`Faltan ${p.gap.toLocaleString('es-MX',{style:'currency',currency:'MXN'})}${p.requiredMonthly?` (${p.requiredMonthly.toLocaleString('es-MX',{style:'currency',currency:'MXN'})}/mes aprox.)`:''}.`,route:'goals',amount:p.gap,date:p.goal.targetDate});}
    if(overview.nextStatementPayments>overview.monthlyIncome*.5)alerts.push({id:'statement-load',severity:'warning',title:'Carga alta de próximos pagos',message:`Los pagos para no generar intereses registrados suman ${overview.nextStatementPayments.toLocaleString('es-MX',{style:'currency',currency:'MXN'})}.`,route:'cashflow',amount:overview.nextStatementPayments});
    if(!alerts.length)alerts.push({id:'all-clear',severity:'success',title:'Sin alertas prioritarias',message:'No detecté riesgos por encima de tus umbrales configurados.'});
    return {asOf,totalAssets,liquidAssets,totalDebt:overview.totalDebt,netWorth:round2(totalAssets-overview.totalDebt),accountsConfigured:accounts.length>0,emergencyFund:{targetAmount:target,currentAmount:emergencyCurrent,gap:round2(Math.max(0,target-emergencyCurrent)),coverageMonths:overview.monthlyFixedNet?round2(emergencyCurrent/overview.monthlyFixedNet):0,source:emergencyAccounts.length?'accounts':'preferences'},goals:{activeCount:goalItems.filter(g=>g.goal.status==='active').length,totalTarget:round2(goalItems.reduce((s,g)=>s+g.goal.targetAmount,0)),totalSaved:round2(goalItems.reduce((s,g)=>s+g.goal.currentAmount,0)),totalGap:round2(goalItems.reduce((s,g)=>s+g.gap,0)),items:goalItems},alerts};
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

  async cardDashboard(cardId:string,asOf=new Date().toISOString().slice(0,10)):Promise<CardDashboard>{
    validDate(asOf);
    const [card,snapshot,txs]=await Promise.all([this.repo.getCard(cardId),this.repo.getCardSnapshot(cardId),this.repo.listTransactions()]);
    if(!card) throw new Error(`Unknown card: ${cardId}`);
    const cardTx=txs.filter(t=>t.cardId===cardId).sort((a,b)=>b.date.localeCompare(a.date));
    const currentClose=statementCloseFor(asOf,card).toISOString().slice(0,10);
    const cycleTx=cardTx.filter(t=>t.date<=asOf&&t.kind!=='payment' && projectTransaction(t,card).close===currentClose);
    const currentCycleSpend=cycleTx.reduce((s,t)=>s+(t.kind==='refund'?-t.amount:t.amount),0);
    const projectedNextPayment=cycleTx.reduce((sum,t)=>{const p=projectTransaction(t,card) as PurchaseProjection;const sign=t.kind==='refund'?-1:1;if(t.financing==='msi'&&p.installments)return sum+sign*(p.installments[0]?.amount||0);return sum+sign*t.amount;},0);
    const balanceDelta=cardTx.filter(t=>t.date<=asOf&&(!snapshot||t.date>snapshot.statementDate)).reduce((sum,t)=>sum+((t.kind==='payment'||t.kind==='refund')?-t.amount:t.amount),0);
    const currentBalance=round2(Math.max(0,(snapshot?.totalBalance||0)+balanceDelta));
    return {card,snapshot,currentBalance,utilization:round2(currentBalance/card.creditLimit*100),currentCycleSpend:round2(currentCycleSpend),projectedNextPayment:round2(projectedNextPayment),transactions:cardTx,dataQuality:snapshot?.dataQuality||'estimated'};
  }
}
