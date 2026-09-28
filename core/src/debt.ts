import {DebtPlan} from './types';
import {finiteNumber,integer} from './validation';
export function periodInterest(principal:number, apr:number, days:number, basis:number=360, taxRate=0.16){
  finiteNumber(principal,'principal');finiteNumber(apr,'apr');finiteNumber(days,'days');finiteNumber(basis,'basis',1,366);finiteNumber(taxRate,'taxRate',0,1);
  const interest=principal*apr*days/basis; const tax=interest*taxRate;
  return {interest, tax, total:interest+tax};
}
export function amortize(plan:DebtPlan, extraPrincipal=0){
  finiteNumber(plan.principal,'principal');finiteNumber(plan.apr,'apr');finiteNumber(plan.scheduledPayment,'scheduledPayment',0.01);
  integer(plan.remainingPayments,'remainingPayments',1,600);finiteNumber(extraPrincipal,'extraPrincipal',0,plan.principal);
  let balance=Math.max(0,plan.principal-extraPrincipal); const rows=[]; let totalInterest=0,totalTax=0;
  for(let i=1;i<=plan.remainingPayments && balance>0.005;i++){
    const {interest,tax}=periodInterest(balance,plan.apr,30,plan.dayBasis??360,plan.taxRate??0.16);
    const payment=Math.min(plan.scheduledPayment,balance+interest+tax);
    const principalPaid=payment-interest-tax; balance=Math.max(0,balance-principalPaid);
    totalInterest+=interest; totalTax+=tax;
    rows.push({paymentNo:i,opening:balance+principalPaid,interest,tax,payment,principalPaid,closing:balance});
  }
  return {rows,totalInterest,totalTax,totalCost:totalInterest+totalTax,endingBalance:balance};
}
export function compareExtraPayment(plan:DebtPlan, extra:number){
  const before=amortize(plan,0), after=amortize(plan,extra);
  return {before,after,interestAndTaxSaved:before.totalCost-after.totalCost,paymentsSaved:before.rows.length-after.rows.length};
}
