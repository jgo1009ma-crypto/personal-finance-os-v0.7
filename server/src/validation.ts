import {finiteNumber,integer,validDate} from '../../core/src/validation';
import {CreateCardInput,CreateTransactionInput} from './contracts';
import {FinancialPreferences} from '../../core/src/types';

export function validateTransaction(input:CreateTransactionInput){
  if(!input||typeof input.cardId!=='string'||!input.cardId)throw new Error('cardId is required');
  validDate(input.date);
  finiteNumber(input.amount,'amount',0.01);
  if(typeof input.description!=='string'||!input.description.trim())throw new Error('description is required');
  if(!['purchase','refund','payment','fee','interest','cash_advance','subscription'].includes(input.kind??'purchase'))throw new Error('invalid transaction kind');
  if(!['regular','msi','interest_plan','revolver'].includes(input.financing??'regular'))throw new Error('invalid financing');
  if(input.financing==='msi')integer(input.installments,'installments',2,360);
  if(input.apr!==undefined)finiteNumber(input.apr,'apr');
}
export function validateCard(input:CreateCardInput){
  if(typeof input.name!=='string'||!input.name.trim()||typeof input.issuer!=='string'||!input.issuer.trim())throw new Error('name and issuer are required');
  finiteNumber(input.creditLimit,'creditLimit',0.01);
  integer(input.statementCloseDay,'statementCloseDay',1,31);
  if(input.dueRule?.type==='fixed_day')integer(input.dueRule.day,'dueRule.day',1,31);
  else if(input.dueRule?.type==='days_after_close')integer(input.dueRule.days,'dueRule.days',1,90);
  else throw new Error('invalid dueRule');
  if(input.personalPayDay!==undefined)integer(input.personalPayDay,'personalPayDay',1,31);
  if(input.apr!==undefined)finiteNumber(input.apr,'apr');
  if(input.interestTaxRate!==undefined)finiteNumber(input.interestTaxRate,'interestTaxRate',0,1);
  if(input.interestDayBasis!==undefined&&![360,365].includes(input.interestDayBasis))throw new Error('invalid interestDayBasis');
  if(input.last4!==undefined&&input.last4!==''&&!/^\d{4}$/.test(input.last4))throw new Error('last4 must contain exactly four digits');
}
export function validatePreferences(p:FinancialPreferences){
  finiteNumber(p.openingCash,'openingCash');finiteNumber(p.variableSpendTarget,'variableSpendTarget');
  finiteNumber(p.emergencyFundBalance,'emergencyFundBalance');finiteNumber(p.emergencyFundMonths,'emergencyFundMonths',0,24);
  integer(p.forecastHorizonMonths,'forecastHorizonMonths',1,36);
  finiteNumber(p.maxMsiIncomeRatio,'maxMsiIncomeRatio',0,1);finiteNumber(p.maxCreditUtilization,'maxCreditUtilization',0,1);
}
