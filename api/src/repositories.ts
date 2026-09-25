import {Card, DebtPlan, FinancialPreferences, IncomeRule, InstallmentCommitment, RecurringExpense,RecurringOverride} from '../../core/src/types';
import {StatementImport,TransactionRecord} from './contracts';
import {CardSnapshot} from './financial-snapshots';

export interface FinanceRepository {
  listCards(includeArchived?:boolean): Promise<Card[]>;
  getCard(id:string): Promise<Card|undefined>;
  saveCard(card:Card):Promise<void>;
  updateCard(card:Card):Promise<void>;
  listCardSnapshots():Promise<CardSnapshot[]>;
  getCardSnapshot(cardId:string):Promise<CardSnapshot|undefined>;
  upsertCardSnapshot(snapshot:CardSnapshot):Promise<void>;
  listDebtPlans(): Promise<DebtPlan[]>;
  listIncomeRules():Promise<IncomeRule[]>;
  listInstallmentCommitments():Promise<InstallmentCommitment[]>;
  getPreferences():Promise<FinancialPreferences>;
  savePreferences(preferences:FinancialPreferences):Promise<void>;
  getDebtPlan(id:string): Promise<DebtPlan|undefined>;
  listRecurring(includeArchived?:boolean): Promise<RecurringExpense[]>;
  listRecurringOverrides():Promise<RecurringOverride[]>;
  saveRecurringOverride(override:RecurringOverride):Promise<void>;
  listTransactions(): Promise<TransactionRecord[]>;
  saveTransaction(tx:TransactionRecord): Promise<void>;
  listImports():Promise<StatementImport[]>;
  getImport(id:string):Promise<StatementImport|undefined>;
  saveImport(statementImport:StatementImport):Promise<void>;
  updateImport(statementImport:StatementImport):Promise<void>;
}
