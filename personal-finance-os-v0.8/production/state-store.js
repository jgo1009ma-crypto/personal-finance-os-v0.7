const {neon}=require('@neondatabase/serverless');
const {cards:seedCards,debtPlans,recurring:seedRecurring,incomeRules,installmentCommitments,defaultPreferences}=require('../server/dist/core/src/seed');
const {cardSnapshots:seedSnapshots}=require('../server/dist/server/src/financial-snapshots');

function clone(v){return structuredClone(v)}
const defaultUiPreferences=()=>({theme:'system',dashboardMode:'standard',dashboardWidgets:['netWorth','debt','cashflow','emergency','credit','alerts','goals']});
function defaultData(){return {version:8,cards:clone(seedCards).map(c=>({...c,status:c.status||'active'})),snapshots:clone(seedSnapshots),transactions:[],recurringOverrides:[],imports:[],copilotSessions:[],accounts:[],goals:[],goalContributions:[],uiPreferences:defaultUiPreferences(),preferences:clone(defaultPreferences)};}
function migrate(raw){const d=defaultData();const x={...d,...raw,cards:Array.isArray(raw?.cards)?raw.cards:d.cards,snapshots:Array.isArray(raw?.snapshots)?raw.snapshots:d.snapshots,transactions:Array.isArray(raw?.transactions)?raw.transactions:[],recurringOverrides:Array.isArray(raw?.recurringOverrides)?raw.recurringOverrides:[],imports:Array.isArray(raw?.imports)?raw.imports:[],copilotSessions:Array.isArray(raw?.copilotSessions)?raw.copilotSessions:[],accounts:Array.isArray(raw?.accounts)?raw.accounts:[],goals:Array.isArray(raw?.goals)?raw.goals:[],goalContributions:Array.isArray(raw?.goalContributions)?raw.goalContributions:[],uiPreferences:{...d.uiPreferences,...(raw?.uiPreferences||{})},preferences:{...d.preferences,...(raw?.preferences||{})},version:8};const liv=x.cards.find(c=>c.id==='liverpool');if(liv){liv.dueRule={type:'fixed_day',day:27};delete liv.personalPayDay;}return x;}

class NeonStateStore{
  constructor(url,stateId='primary'){if(!url)throw new Error('DATABASE_URL is required in production');this.sql=neon(url);this.stateId=stateId;this.revision=0;this.data=null;}
  async ensureSchema(){await this.sql`create table if not exists app_state (id text primary key,state jsonb not null,revision bigint not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now())`;await this.sql`create table if not exists audit_events (id bigserial primary key,state_id text not null references app_state(id) on delete cascade,event_type text not null,revision bigint not null,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now())`;await this.sql`create table if not exists state_backups (id bigserial primary key,state_id text not null references app_state(id) on delete cascade,revision bigint not null,state jsonb not null,reason text,created_at timestamptz not null default now())`;}
  async load(){await this.ensureSchema();let rows=await this.sql`select state,revision from app_state where id=${this.stateId}`;if(!rows.length){const initial=defaultData();rows=await this.sql`insert into app_state(id,state,revision) values(${this.stateId},${JSON.stringify(initial)}::jsonb,1) on conflict(id) do update set id=excluded.id returning state,revision`;}
    this.data=migrate(rows[0].state);this.revision=Number(rows[0].revision);return this.data;}
  async persist(eventType='update',metadata={}){if(!this.data)throw new Error('State not loaded');const expected=this.revision;const next=expected+1;const rows=await this.sql`update app_state set state=${JSON.stringify(this.data)}::jsonb,revision=${next},updated_at=now() where id=${this.stateId} and revision=${expected} returning revision`;if(!rows.length)throw new Error('Concurrent update detected. Refresh and retry.');this.revision=Number(rows[0].revision);await this.sql`insert into audit_events(state_id,event_type,revision,metadata) values(${this.stateId},${eventType},${this.revision},${JSON.stringify(metadata)}::jsonb)`;return this.revision;}
  async backup(reason='manual'){if(!this.data)await this.load();await this.sql`insert into state_backups(state_id,revision,state,reason) values(${this.stateId},${this.revision},${JSON.stringify(this.data)}::jsonb,${reason})`;return {revision:this.revision,reason};}
  async recentAudit(limit=50){return this.sql.query('select event_type,revision,metadata,created_at from audit_events where state_id=$1 order by created_at desc limit $2',[this.stateId,limit]);}
}

function makeRepository(store,data){
  const save=(type,meta)=>store.persist(type,meta);
  return {
    async listCards(includeArchived=false){return clone(data.cards.filter(c=>includeArchived||(c.status||'active')==='active'))},
    async getCard(id){return clone(data.cards.find(c=>c.id===id))},
    async saveCard(card){data.cards.push(clone(card));await save('card.created',{cardId:card.id})},
    async updateCard(card){const i=data.cards.findIndex(c=>c.id===card.id);if(i<0)throw new Error('Card not found');data.cards[i]=clone(card);await save('card.updated',{cardId:card.id})},
    async listCardSnapshots(){return clone(data.snapshots)},
    async getCardSnapshot(id){return clone(data.snapshots.find(s=>s.cardId===id))},
    async upsertCardSnapshot(s){const i=data.snapshots.findIndex(x=>x.cardId===s.cardId);if(i<0)data.snapshots.push(clone(s));else data.snapshots[i]=clone(s);await save('snapshot.upserted',{cardId:s.cardId})},
    async listDebtPlans(){return clone(debtPlans)}, async getDebtPlan(id){return clone(debtPlans.find(p=>p.id===id))},
    async listIncomeRules(){return clone(incomeRules)}, async listInstallmentCommitments(){return clone(installmentCommitments)},
    async getPreferences(){return clone(data.preferences)}, async savePreferences(p){data.preferences=clone(p);await save('preferences.updated')},
    async listRecurring(includeArchived=false){return clone(seedRecurring.filter(r=>includeArchived||(r.status||'active')==='active'))},
    async listRecurringOverrides(){return clone(data.recurringOverrides)},
    async saveRecurringOverride(o){const i=data.recurringOverrides.findIndex(x=>x.recurringId===o.recurringId&&x.periodKey===o.periodKey);if(i<0)data.recurringOverrides.push(clone(o));else data.recurringOverrides[i]=clone(o);await save('recurring.override',{recurringId:o.recurringId,periodKey:o.periodKey})},
    async listTransactions(){return clone(data.transactions)}, async saveTransaction(tx){data.transactions.push(clone(tx));await save('transaction.created',{transactionId:tx.id,cardId:tx.cardId})},
    async listImports(){return clone(data.imports).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}, async getImport(id){return clone(data.imports.find(x=>x.id===id))},
    async saveImport(x){data.imports.push(clone(x));await save('import.created',{importId:x.id})}, async updateImport(x){const i=data.imports.findIndex(v=>v.id===x.id);if(i<0)throw new Error('Import not found');data.imports[i]=clone(x);await save('import.updated',{importId:x.id,status:x.status})},
    async listAccounts(includeArchived=false){return clone(data.accounts.filter(a=>includeArchived||(a.status||'active')==='active'))},
    async getAccount(id){return clone(data.accounts.find(a=>a.id===id))},
    async saveAccount(a){data.accounts.push(clone(a));await save('account.created',{accountId:a.id})},
    async updateAccount(a){const i=data.accounts.findIndex(x=>x.id===a.id);if(i<0)throw new Error('Account not found');data.accounts[i]=clone(a);await save('account.updated',{accountId:a.id,status:a.status})},
    async listGoals(includeArchived=false){return clone(data.goals.filter(g=>includeArchived||g.status!=='archived'))},
    async getGoal(id){return clone(data.goals.find(g=>g.id===id))},
    async saveGoal(g){data.goals.push(clone(g));await save('goal.created',{goalId:g.id})},
    async updateGoal(g){const i=data.goals.findIndex(x=>x.id===g.id);if(i<0)throw new Error('Goal not found');data.goals[i]=clone(g);await save('goal.updated',{goalId:g.id,status:g.status})},
    async listGoalContributions(goalId){return clone(goalId?data.goalContributions.filter(c=>c.goalId===goalId):data.goalContributions)},
    async saveGoalContribution(c){data.goalContributions.push(clone(c));await save('goal.contribution',{goalId:c.goalId,contributionId:c.id,amount:c.amount})},
    async getUiPreferences(){return clone(data.uiPreferences)},
    async saveUiPreferences(p){data.uiPreferences=clone(p);await save('ui.preferences.updated',{theme:p.theme,dashboardMode:p.dashboardMode})}
  };
}
module.exports={NeonStateStore,makeRepository,defaultData,migrate};
