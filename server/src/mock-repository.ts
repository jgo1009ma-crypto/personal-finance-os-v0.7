import {cards as seedCards, debtPlans, recurring as seedRecurring, incomeRules, installmentCommitments, defaultPreferences} from '../../core/src/seed';
import {FinanceRepository} from './repositories';
import {StatementImport,TransactionRecord} from './contracts';
import {cardSnapshots as seedSnapshots,CardSnapshot} from './financial-snapshots';
import {Card,FinancialAccount,FinancialPreferences,GoalContribution,RecurringOverride,SavingsGoal,UiPreferences} from '../../core/src/types';

export class InMemoryFinanceRepository implements FinanceRepository {
  async commitStatementImport(statement:StatementImport,transactions:TransactionRecord[],snapshot?:CardSnapshot){
    const index=this.imports.findIndex(i=>i.id===statement.id);
    if(index<0||this.imports[index].status!=='review')throw new Error('Import is already committed');
    this.transactions.push(...structuredClone(transactions));
    if(snapshot){const i=this.snapshots.findIndex(s=>s.cardId===snapshot.cardId);if(i<0)this.snapshots.push(structuredClone(snapshot));else this.snapshots[i]=structuredClone(snapshot);}
    this.imports[index]=structuredClone(statement);
  }
  async contributeToGoal(contribution:GoalContribution){
    const goal=this.goals.find(g=>g.id===contribution.goalId);
    if(!goal||goal.status==='archived')throw new Error('Goal unavailable');
    const amount=Math.round((goal.currentAmount+contribution.amount)*100)/100;
    if(!Number.isSafeInteger(Math.round(amount*100)))throw new Error('Goal balance is too large');
    goal.currentAmount=amount;goal.updatedAt=contribution.createdAt;
    goal.status=amount>=goal.targetAmount?'completed':'active';
    this.goalContributions.push(structuredClone(contribution));
  }
  private cards:Card[]=structuredClone(seedCards).map(c=>({...c,status:c.status||'active'}));
  private snapshots:CardSnapshot[]=structuredClone(seedSnapshots);
  private recurring=structuredClone(seedRecurring);
  private recurringOverrides:RecurringOverride[]=[];
  private transactions:TransactionRecord[]=[];
  private imports:StatementImport[]=[];
  private preferences:FinancialPreferences=structuredClone(defaultPreferences);
  private accounts:FinancialAccount[]=[];
  private goals:SavingsGoal[]=[];
  private goalContributions:GoalContribution[]=[];
  private uiPreferences:UiPreferences={theme:'system',dashboardMode:'standard',dashboardWidgets:['netWorth','debt','cashflow','emergency','credit','alerts','goals']};
  async listCards(includeArchived=false){ return structuredClone(this.cards.filter(c=>includeArchived||(c.status||'active')==='active')); }
  async getCard(id:string){ return structuredClone(this.cards.find(c=>c.id===id)); }
  async saveCard(card:Card){this.cards.push(structuredClone(card));}
  async updateCard(card:Card){const i=this.cards.findIndex(c=>c.id===card.id);if(i<0)throw new Error('Card not found');this.cards[i]=structuredClone(card);}
  async listCardSnapshots(){ return structuredClone(this.snapshots); }
  async getCardSnapshot(cardId:string){ return structuredClone(this.snapshots.find(s=>s.cardId===cardId)); }
  async upsertCardSnapshot(snapshot:CardSnapshot){const i=this.snapshots.findIndex(s=>s.cardId===snapshot.cardId);if(i<0)this.snapshots.push(structuredClone(snapshot));else this.snapshots[i]=structuredClone(snapshot);}
  async listDebtPlans(){ return structuredClone(debtPlans); }
  async getDebtPlan(id:string){ return structuredClone(debtPlans.find(p=>p.id===id)); }
  async listIncomeRules(){return structuredClone(incomeRules);}
  async listInstallmentCommitments(){return structuredClone(installmentCommitments);}
  async getPreferences(){return structuredClone(this.preferences);}
  async savePreferences(p:FinancialPreferences){this.preferences=structuredClone(p);}
  async listRecurring(includeArchived=false){ return structuredClone(this.recurring.filter(r=>includeArchived||(r.status||'active')==='active')); }
  async listRecurringOverrides(){return structuredClone(this.recurringOverrides);}
  async saveRecurringOverride(o:RecurringOverride){const i=this.recurringOverrides.findIndex(x=>x.recurringId===o.recurringId&&x.periodKey===o.periodKey);if(i<0)this.recurringOverrides.push(structuredClone(o));else this.recurringOverrides[i]=structuredClone(o);}
  async listTransactions(){ return structuredClone(this.transactions); }
  async saveTransaction(tx:TransactionRecord){ this.transactions.push(structuredClone(tx)); }
  async listImports(){return structuredClone(this.imports);}
  async getImport(id:string){return structuredClone(this.imports.find(x=>x.id===id));}
  async saveImport(x:StatementImport){this.imports.push(structuredClone(x));}
  async updateImport(x:StatementImport){const i=this.imports.findIndex(v=>v.id===x.id);if(i<0)throw new Error('Import not found');this.imports[i]=structuredClone(x);}
  async listAccounts(includeArchived=false){return structuredClone(this.accounts.filter(a=>includeArchived||a.status!=='archived'));}
  async getAccount(id:string){return structuredClone(this.accounts.find(a=>a.id===id));}
  async saveAccount(a:FinancialAccount){this.accounts.push(structuredClone(a));}
  async updateAccount(a:FinancialAccount){const i=this.accounts.findIndex(x=>x.id===a.id);if(i<0)throw new Error('Account not found');this.accounts[i]=structuredClone(a);}
  async listGoals(includeArchived=false){return structuredClone(this.goals.filter(g=>includeArchived||g.status!=='archived'));}
  async getGoal(id:string){return structuredClone(this.goals.find(g=>g.id===id));}
  async saveGoal(g:SavingsGoal){this.goals.push(structuredClone(g));}
  async updateGoal(g:SavingsGoal){const i=this.goals.findIndex(x=>x.id===g.id);if(i<0)throw new Error('Goal not found');this.goals[i]=structuredClone(g);}
  async listGoalContributions(goalId?:string){return structuredClone(goalId?this.goalContributions.filter(c=>c.goalId===goalId):this.goalContributions);}
  async saveGoalContribution(c:GoalContribution){this.goalContributions.push(structuredClone(c));}
  async getUiPreferences(){return structuredClone(this.uiPreferences);}
  async saveUiPreferences(p:UiPreferences){this.uiPreferences=structuredClone(p);}
}
