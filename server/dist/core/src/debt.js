"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.periodInterest = periodInterest;
exports.amortize = amortize;
exports.compareExtraPayment = compareExtraPayment;
const validation_1 = require("./validation");
function periodInterest(principal, apr, days, basis = 360, taxRate = 0.16) {
    (0, validation_1.finiteNumber)(principal, 'principal');
    (0, validation_1.finiteNumber)(apr, 'apr');
    (0, validation_1.finiteNumber)(days, 'days');
    (0, validation_1.finiteNumber)(basis, 'basis', 1, 366);
    (0, validation_1.finiteNumber)(taxRate, 'taxRate', 0, 1);
    const interest = principal * apr * days / basis;
    const tax = interest * taxRate;
    return { interest, tax, total: interest + tax };
}
function amortize(plan, extraPrincipal = 0) {
    (0, validation_1.finiteNumber)(plan.principal, 'principal');
    (0, validation_1.finiteNumber)(plan.apr, 'apr');
    (0, validation_1.finiteNumber)(plan.scheduledPayment, 'scheduledPayment', 0.01);
    (0, validation_1.integer)(plan.remainingPayments, 'remainingPayments', 1, 600);
    (0, validation_1.finiteNumber)(extraPrincipal, 'extraPrincipal', 0, plan.principal);
    let balance = Math.max(0, plan.principal - extraPrincipal);
    const rows = [];
    let totalInterest = 0, totalTax = 0;
    for (let i = 1; i <= plan.remainingPayments && balance > 0.005; i++) {
        const { interest, tax } = periodInterest(balance, plan.apr, 30, plan.dayBasis ?? 360, plan.taxRate ?? 0.16);
        const payment = Math.min(plan.scheduledPayment, balance + interest + tax);
        const principalPaid = payment - interest - tax;
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
