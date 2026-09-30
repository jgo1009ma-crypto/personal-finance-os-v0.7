import {Card, FinancingKind, FinancialAccount, FinancialPreferences, GoalContribution, SavingsGoal, UiPreferences, RecurringExpense, RecurringOverride, TransactionKind} from '../../core/src/types';
import {CardSnapshot,DataQuality} from './financial-snapshots';

export interface CreateTransactionInput {
  cardId: string;
  date: string;
  description: string;
  amount: number;
  kind?: TransactionKind;
  financing?: FinancingKind;
  category?: string;
  installments?: number;
  apr?: number;
  source?: 'manual'|'statement_import'|'legacy_tracker';
  sourceImportId?: string;
}

export interface TransactionRecord extends CreateTransactionInput {
  id: string;
  kind: TransactionKind;
  financing: FinancingKind;
  createdAt: string;
}

export interface PurchaseProjection {
  close: string;
  legalDue: string;
  payDate: string;
  paymentMonth: string;
  amount?: number;
  installments?: Array<{number:number;dueMonth:string;amount:number}>;
}


export interface LegacyTrackerReport {
  meta:{source:string;importedPeriod:string;coverage:readonly string[];dateQuality:string;notes:readonly string[]};
  monthlyTotals:Record<string,number>;
  sourceTotals:Record<string,Record<string,number>>;
  currentCycleTotal:number;
  projectedJanuaryTotal:number;
  declineToJanuaryPct:number;
  candidateVariableSpend:number;
  candidateCount:number;
  newInstallmentPrincipal:number;
  knownOctoberInflows:number;
  octoberResidualAfterKnownInflows:number;
  variableSpendTarget:number;
  variableOverTarget:number;
  variableOverTargetPct:number;
  bbvaSharePct:number;
  items:Array<Record<string,unknown>>;
}

export interface Overview {
  asOf: string;
  monthlyIncome: number;
  monthlyFixedNet: number;
  totalDebt: number;
  interestBearingDebt: number;
  monthlyFreeBeforeVariableAndInstallments: number;
  totalCreditLimit:number;
  creditUtilization:number;
  nextStatementPayments:number;
  dataQualityWarnings:number;
}

export interface ExtraPaymentSimulation {
  planId: string;
  extraPayment: number;
  before: {interestAndTax:number;numberOfPayments:number;endingBalance:number};
  after: {interestAndTax:number;numberOfPayments:number;endingBalance:number};
  interestAndTaxSaved: number;
  paymentsSaved: number;
}

export interface CardDashboard {
  card:Card;
  snapshot?:CardSnapshot;
  currentBalance:number;
  utilization:number;
  currentCycleSpend:number;
  projectedNextPayment:number;
  transactions:TransactionRecord[];
  dataQuality:DataQuality;
}

export interface AppBootstrap {
  cards:Card[];
  snapshots:CardSnapshot[];
  recurring:RecurringExpense[];
  recurringOverrides:RecurringOverride[];
  transactions:TransactionRecord[];
}

export interface CreateCardInput {
  name:string;
  issuer:string;
  creditLimit:number;
  statementCloseDay:number;
  dueRule:{type:'days_after_close',days:number}|{type:'fixed_day',day:number};
  personalPayDay?:number;
  apr?:number;
  interestDayBasis?:360|365;
  interestTaxRate?:number;
  last4?:string;
}

export interface RecurringMonthRow {
  recurring:RecurringExpense;
  month:string;
  amount:number;
  baseAmount:number;
  overridden:boolean;
  override?:RecurringOverride;
}

export type ImportRowStatus='matched'|'new'|'possible_match'|'ignored'|'committed';
export interface ImportedStatementRow {
  id:string;
  importId:string;
  transactionDate:string;
  postingDate?:string;
  description:string;
  amount:number;
  sign:1|-1;
  kindGuess:TransactionKind;
  financingGuess:FinancingKind;
  installments?:number;
  fingerprint:string;
  matchedTransactionId?:string;
  matchConfidence?:number;
  status:ImportRowStatus;
  sourceLine?:string;
}

export interface StatementSummary {
  statementDate?:string;
  periodStart?:string;
  periodEnd?:string;
  paymentDueDate?:string;
  paymentToAvoidInterest?:number;
  totalBalance?:number;
  regularBalance?:number;
  installmentBalance?:number;
  availableCredit?:number;
  dataQuality:DataQuality;
}

export interface StatementImport {
  reviewedTransactionIds?:string[];
  id:string;
  cardId:string;
  filename:string;
  parser:string;
  status:'review'|'committed'|'failed';
  createdAt:string;
  committedAt?:string;
  summary:StatementSummary;
  rows:ImportedStatementRow[];
  extractionWarnings:string[];
}


export interface ForecastOptions {
  asOf:string;
  horizonMonths?:number;
  openingCash?:number;
  variableSpendTarget?:number;
}

export interface ScenarioPurchaseInput {
  cardId:string; date:string; amount:number; description?:string; financing?:FinancingKind; installments?:number;
}
export interface ScenarioExtraPaymentInput {planId:string;date:string;amount:number;}
export interface ScenarioIncomeInput {date:string;amount:number;label?:string;}
export interface ScenarioRequest extends ForecastOptions {
  purchase?:ScenarioPurchaseInput;
  extraDebtPayment?:ScenarioExtraPaymentInput;
  oneTimeIncome?:ScenarioIncomeInput;
}
export interface DebtTimelineRow {
  month:string; interestPrincipal:number; zeroInterestCommitments:number; knownCommittedBalance:number; scheduledDebtPayments:number;
}
export interface ForecastEnvelope {
  forecast: import('../../core/src/forecast').ForecastResult;
  debtTimeline:DebtTimelineRow[];
  emergencyFund:{monthlyEssentialEstimate:number;targetMonths:number;targetAmount:number;currentAmount:number;gap:number;coverageMonths:number};
  assumptions:string[];
}
export interface ScenarioComparison {
  baseline:ForecastEnvelope;
  scenario:ForecastEnvelope;
  deltas:{endingCash:number;minimumCash:number;negativeDays:number;totalOutflow:number;interestAndTaxSaved:number;paymentsSaved:number};
  alerts:string[];
}
export interface PreferencesResponse extends FinancialPreferences {}


export interface CreateAccountInput {
  name:string;
  institution?:string;
  type:FinancialAccount['type'];
  balance:number;
  includeInNetWorth?:boolean;
  isEmergencyFund?:boolean;
  note?:string;
}

export interface CreateGoalInput {
  name:string;
  type:SavingsGoal['type'];
  targetAmount:number;
  currentAmount?:number;
  targetDate?:string;
  priority?:SavingsGoal['priority'];
  note?:string;
}

export type PlanningAlertSeverity='critical'|'warning'|'info'|'success';
export interface PlanningAlert {
  id:string;
  severity:PlanningAlertSeverity;
  title:string;
  message:string;
  route?:string;
  amount?:number;
  date?:string;
}

export interface GoalProgress {
  goal:SavingsGoal;
  fundedPct:number;
  gap:number;
  monthsRemaining?:number;
  requiredMonthly?:number;
}

export interface PlanningSummary {
  asOf:string;
  totalAssets:number;
  liquidAssets:number;
  totalDebt:number;
  netWorth:number;
  accountsConfigured:boolean;
  emergencyFund:{targetAmount:number;currentAmount:number;gap:number;coverageMonths:number;source:'accounts'|'preferences'};
  goals:{activeCount:number;totalTarget:number;totalSaved:number;totalGap:number;items:GoalProgress[]};
  alerts:PlanningAlert[];
}

export interface UiPreferencesResponse extends UiPreferences {}
export interface AccountResponse extends FinancialAccount {}
export interface GoalResponse extends SavingsGoal {}
export interface GoalContributionResponse extends GoalContribution {}
