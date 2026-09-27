"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.periodInterest = periodInterest;
exports.amortize = amortize;
exports.compareExtraPayment = compareExtraPayment;
function periodInterest(principal, apr, days, basis = 360, taxRate = 0.16) {
    const interest = principal * apr * days / basis;
    const tax = interest * taxRate;
    return { interest, tax, total: interest + tax };
}
function amortize(plan, extraPrincipal = 0) {
    let balance = Math.max(0, plan.principal - extraPrincipal);
    const rows = [];
    let totalInterest = 0, totalTax = 0;
    for (let i = 1; i <= plan.remainingPayments && balance > 0.005; i++) {
        const { interest, tax } = periodInterest(balance, plan.apr, 30, plan.dayBasis ?? 360, plan.taxRate ?? 0.16);
        const payment = Math.min(plan.scheduledPayment, balance + interest + tax);
        const principalPaid = Math.max(0, payment - interest - tax);
        balance = Math.max(0, balance - principalPaid);
        totalInterest += interest;
        totalTax += tax;
        rows.push({ paymentNo: i, opening: balance + principalPaid, interest, tax, payment, principalPaid, closing: balance });
    }
    return { rows, totalInterest, totalTax, totalCost: totalInterest + totalTax, endingBalance: balance };
}
function compareExtraPayment(plan, extra) {
    const before = amortize(plan, 0), after = amortize(plan, extra);
    return { before, after, interestAndTaxSaved: before.totalCost - after.totalCost, paymentsSaved: before.rows.length - after.rows.length };
}
