const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FinanceService,InMemoryFinanceRepository}=require('../server/dist/server/src');
const {buildForecast,projectVariableBudget}=require('../server/dist/core/src/forecast');
const {amortize}=require('../server/dist/core/src/debt');
const {defaultPreferences}=require('../server/dist/core/src/seed');
const {sessionCookie,isAuthenticated,assertOrigin}=require('../production/auth');
const {jsonBody,bufferBody}=require('../production/http-body');
const {NeonStateStore,makeRepository,defaultData,migrate}=require('../production/state-store');
const {commitDraft}=require('../production/atomic-mutations');
const {allowLogin}=require('../production/login-limiter');
const {PGlite}=require('@electric-sql/pglite');

const input={cardId:'nu',date:'2026-10-01',description:'Test',amount:100};
const service=()=>new FinanceService(new InMemoryFinanceRepository());

test('invalid JSON financial inputs never persist or corrupt forecasts',async()=>{
  const s=service();
  for(const patch of [{date:'2026-02-30'},{date:'2026-13-01'},{amount:Infinity},{amount:'100'},{amount:0.001},{kind:'invalid'},{financing:'msi'},{financing:'msi',installments:2.5},{financing:'msi',installments:1000000}]){
    await assert.rejects(s.createTransaction({...input,...patch}));
  }
  assert.equal((await s.listTransactions()).length,0);
  await assert.rejects(s.forecast({asOf:'2026-09-27',horizonMonths:1000000}));
  await assert.rejects(s.updatePreferences({variableSpendTarget:NaN}));
  await assert.rejects(s.updatePreferences({maxCreditUtilization:2}));
  await assert.rejects(s.createCard({name:'X',issuer:'X',creditLimit:100,statementCloseDay:12,dueRule:{type:'fixed_day',day:99}}));
});

test('new and archived cards retain debt; future purchases do not affect current balances',async()=>{
  const s=service(),base=await s.overview('2026-09-27');
  const c=await s.createCard({name:'New',issuer:'Bank',creditLimit:100,statementCloseDay:15,dueRule:{type:'days_after_close',days:20}});
  await s.createTransaction({...input,cardId:c.id,date:'2026-09-27',amount:90});
  await s.createTransaction({...input,cardId:c.id,date:'2026-10-27',amount:500});
  assert.equal((await s.overview('2026-09-27')).totalDebt,Math.round((base.totalDebt+90)*100)/100);
  assert.equal((await s.cardDashboard(c.id,'2026-09-27')).currentBalance,90);
  assert.ok((await s.planningSummary('2026-09-27')).alerts.some(a=>a.id===`util-${c.id}`));
  await s.archiveCard(c.id);
  assert.equal((await s.overview('2026-09-27')).totalDebt,Math.round((base.totalDebt+90)*100)/100);
  await assert.rejects(s.overview('2020-01-01'),/Historical/);
});

test('negative days include idle calendar days and exclude same-day ordering artifacts',()=>{
  const p={...defaultPreferences,openingCash:0};
  const events=[{date:'2026-10-01',label:'Expense',amount:100,type:'expense'},{date:'2026-10-05',label:'Income',amount:100,type:'income'}];
  assert.equal(buildForecast('2026-10-01','2026-10-10',events,p).metrics.negativeDays,4);
  events[1].date='2026-10-01';
  assert.equal(buildForecast('2026-10-01','2026-10-10',events,p).metrics.negativeDays,0);
  const empty=buildForecast('2026-10-01','2026-10-10',[],{...p,openingCash:-5});
  assert.equal(empty.metrics.negativeDays,10);
  assert.equal(empty.metrics.firstNegativeDate,'2026-10-01');
  const budget=projectVariableBudget(100.01,'2026-10-01','2026-10-31');
  assert.equal(Math.round(budget.reduce((s,e)=>s+e.amount,0)*100),10001);
});

test('negative amortization retains unpaid interest and overpayments are rejected',()=>{
  const plan={principal:1000,apr:1.2,remainingPayments:1,scheduledPayment:10,taxRate:0,dayBasis:360};
  assert.equal(amortize(plan).endingBalance,1090);
  assert.throws(()=>amortize(plan,1001));
});

test('unsupported extra-payment dates cannot generate fictional savings',async()=>{
  const s=service();
  for(const extraDebtPayment of [{planId:'bbva-cash',date:'2026-12-01',amount:1000},{planId:'bbva-cash',date:'2030-01-01',amount:1000},{planId:'missing',date:'2026-10-01',amount:1000}]){
    await assert.rejects(s.simulateScenario({asOf:'2026-09-27',horizonMonths:3,extraDebtPayment}));
  }
});

test('paid statements are not charged twice; card refunds never create cash income',async()=>{
  const repo=new InMemoryFinanceRepository(),s=new FinanceService(repo);
  const snap=await repo.getCardSnapshot('liverpool');
  await s.createTransaction({cardId:'liverpool',date:'2026-09-27',description:'Paid statement',kind:'payment',amount:snap.paymentToAvoidInterest});
  await s.createTransaction({cardId:'liverpool',date:'2026-09-27',description:'Refund',kind:'refund',amount:100});
  const f=await s.forecast({asOf:'2026-09-27',horizonMonths:2});
  assert.ok(!f.forecast.events.some(e=>e.sourceId==='snapshot:liverpool'));
  assert.ok(!f.forecast.events.some(e=>e.cardId==='liverpool'&&e.type==='income'));
  const unpaid=await service().forecast({asOf:'2026-10-01',horizonMonths:1});
  assert.ok(unpaid.forecast.events.some(e=>e.sourceId==='snapshot:liverpool'&&e.date==='2026-10-01'));
  assert.ok(unpaid.forecast.warnings.some(w=>w.includes('vencido')));
});

const statement=`Fecha de corte: 11-sep-2026\nSaldo deudor total: $100.00\n01-sep-2026 01-sep-2026 SHOP + $100.00`;
test('import validation and persistence are atomic, old statements cannot replace newer snapshots',async()=>{
  const repo=new InMemoryFinanceRepository(),s=new FinanceService(repo);
  const imp=await s.createImport('nu','test.txt',statement);
  imp.rows.push({...imp.rows[0],id:'invalid',transactionDate:'2026-02-30'});await repo.updateImport(imp);
  await assert.rejects(s.commitImport(imp.id));
  assert.equal((await repo.listTransactions()).length,0);
  assert.equal((await repo.getImport(imp.id)).status,'review');
  imp.rows.pop();await repo.updateImport(imp);
  await repo.upsertCardSnapshot({cardId:'nu',statementDate:'2026-10-05',totalBalance:777,dataQuality:'official'});
  await s.commitImport(imp.id);
  assert.equal((await repo.getCardSnapshot('nu')).totalBalance,777);
  await assert.rejects(s.commitImport(imp.id));
});

test('two staged imports cannot duplicate the same newly committed movements',async()=>{
  const s=service(),a=await s.createImport('nu','a.txt',statement),b=await s.createImport('nu','b.txt',statement);
  await s.commitImport(a.id);await assert.rejects(s.commitImport(b.id),/changed since review/);
  assert.equal((await s.listTransactions()).length,1);
});

test('identical statement lines are preserved for review, opposite signs never auto-match',async()=>{
  const s=service();
  await s.createTransaction({...input,date:'2026-09-01',description:'SHOP',kind:'payment'});
  const imp=await s.createImport('nu','test.txt',statement+'\n01-sep-2026 01-sep-2026 SHOP + $100.00');
  assert.equal(imp.rows.length,2);assert.ok(imp.rows.every(r=>r.status==='new'));
  assert.ok(imp.extractionWarnings.length>0);
});

test('concurrent goal contributions retain both increments',async()=>{
  const s=service(),g=await s.createGoal({name:'Goal',type:'other',targetAmount:1000});
  await Promise.all([s.contributeToGoal(g.id,100),s.contributeToGoal(g.id,200)]);
  assert.equal((await s.listGoals()).find(x=>x.id===g.id).currentAmount,300);
});

test('malformed/extended session cookies fail closed and cross-origin login is rejected',()=>{
  const secret='test-secret-'.repeat(4),cookie=sessionCookie(secret).split(';')[0];
  assert.equal(isAuthenticated({headers:{cookie}},secret),true);
  assert.equal(isAuthenticated({headers:{cookie:cookie+'.extra'}},secret),false);
  assert.equal(isAuthenticated({headers:{cookie:'pfos_session=%ZZ'}},secret),false);
  assert.throws(()=>assertOrigin({method:'POST',headers:{host:'finance.test',origin:'https://attacker.test'}}),/Origin rejected/);
});

test('body limits cover streams and platform-preparsed JSON/buffers',async()=>{
  await assert.rejects(jsonBody({body:{password:'x'.repeat(100)}},20),/Payload too large/);
  await assert.rejects(bufferBody({body:Buffer.alloc(100)},20),/Payload too large/);
  await assert.rejects(jsonBody({body:'null'}),/JSON object/);
  await assert.rejects(jsonBody({body:'[]'}),/JSON object/);
  assert.deepEqual(await jsonBody({body:'{"ok":true}'}),{ok:true});
});

test('failed draft persistence leaves local memory untouched; migration preserves edited Liverpool dates',async()=>{
  const data={value:1};await assert.rejects(commitDraft(data,()=>{throw Error('disk full');},draft=>draft.value=2));
  assert.deepEqual(data,{value:1});
  assert.equal(migrate({version:8,cards:[{id:'liverpool',dueRule:{type:'fixed_day',day:20},personalPayDay:19}]}).cards[0].dueRule.day,20);
});

test('PostgreSQL integration: atomic state/audit, optimistic conflicts, failed audit rollback, durable login limits',async()=>{
  const db=new PGlite();await db.waitReady;
  const sql=async(strings,...values)=>{
    const query=strings.reduce((s,part,i)=>s+(i?`$${i}`:'')+part,'');
    return (await db.query(query,values)).rows;
  };
  const store=new NeonStateStore('postgresql://user:pass@localhost/test');store.sql=sql;
  const loaded=await store.load();const repo=makeRepository(store,loaded);
  await repo.saveAccount({id:'a',name:'Account',balance:5});
  assert.equal((await db.query('select count(*)::int n from audit_events')).rows[0].n,1);
  const stale=new NeonStateStore('postgresql://user:pass@localhost/test');stale.sql=sql;await stale.load();
  await store.persist('test');await assert.rejects(stale.persist('conflict'),/Concurrent update/);
  const before=(await db.query('select revision from app_state')).rows[0].revision;
  await db.exec("alter table audit_events add constraint reject_bad check(event_type <> 'bad')");
  await assert.rejects(store.persist('bad'));
  assert.equal((await db.query('select revision from app_state')).rows[0].revision,before);
  process.env.SESSION_SECRET='test-secret';
  try{const req={headers:{},socket:{remoteAddress:'127.0.0.1'}};
    const results=await Promise.all(Array.from({length:11},()=>allowLogin(req,sql)));
    assert.equal(results.filter(Boolean).length,10);
    assert.equal(await allowLogin(req,sql),false);
    await db.exec("update login_attempts set reset_at=now()-interval '1 second'");
    assert.equal(await allowLogin(req,sql),true);
  }finally{delete process.env.SESSION_SECRET;await db.close();}
});
