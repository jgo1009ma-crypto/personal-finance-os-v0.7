export type Frequency = 'monthly'|'bimonthly'|'every_n_days'|'one_time';
export type TransactionKind = 'purchase'|'refund'|'payment'|'fee'|'interest'|'cash_advance'|'subscription';
export type FinancingKind = 'regular'|'msi'|'interest_plan'|'revolver';
export type EntityStatus = 'active'|'archived';

export interface Card {
  id:string;
  name:string;
  issuer:string;
  creditLimit:number;
  statementCloseDay:number;
  dueRule:{type:'days_after_close', days:number}|{type:'fixed_day', day:number};
  personalPayDay?:number;
  apr?:number;
  interestDayBasis?:360|365;
  interestTaxRate?:number;
  last4?:string;
  status?:EntityStatus;
  createdAt?:string;
  archivedAt?:string;
}

export interface Transaction {
  id:string; cardId:string; date:string; description:string; amount:number;
  kind:TransactionKind; financing:FinancingKind; category?:string;
  installments?:number; apr?:number;
}

export interface Installment {
  number:number; dueMonth:string; amount:number;
}

export interface DebtPlan {
  id:string; cardId:string; name:string; principal:number; apr:number;
  remainingPayments:number; scheduledPayment:number; dayBasis?:360|365; taxRate?:number;
  /** First future payment not already represented by the latest statement snapshot. */
  nextPaymentDate?:string;
}

export interface InstallmentCommitment {
  id:string;
  cardId:string;
  name:string;
  monthlyAmount:number;
  remainingPayments:number;
  /** First payment after the latest reconciled statement payment. */
  nextPaymentDate:string;
  source:'statement'|'manual';
  dataQuality?:'official'|'derived'|'estimated';
}

export interface RecurringExpense {
  id:string; name:string; amount:number; frequency:Frequency; startDate:string;
  everyNDays?:number; cardId?:string; category?:string; offsetIncome?:number;
  status?:EntityStatus;
}

/**
 * A period-specific amount replaces the rule's base amount without mutating history.
 * periodKey may be YYYY-MM for a statement/month or YYYY-MM-DD for a specific occurrence.
 */
export interface RecurringOverride {
  id:string;
  recurringId:string;
  periodKey:string;
  amount:number;
  note?:string;
  createdAt:string;
  updatedAt:string;
}

export interface IncomeRule {
  id:string;
  name:string;
  amount:number;
  frequency:'monthly'|'semimonthly'|'one_time'|'annual';
  day1?:number;
  day2?:number;
  date?:string;
  startDate:string;
  endDate?:string;
  status?:EntityStatus;
}

export interface BudgetRule {
  id:string;
  name:string;
  amount:number;
  category?:string;
  month?:string;
  status?:EntityStatus;
}

export interface FinancialPreferences {
  openingCash:number;
  variableSpendTarget:number;
  emergencyFundMonths:number;
  emergencyFundBalance:number;
  forecastHorizonMonths:number;
  maxMsiIncomeRatio:number;
  maxCreditUtilization:number;
  updatedAt?:string;
}
