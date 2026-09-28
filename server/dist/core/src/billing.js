"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statementCloseFor = statementCloseFor;
exports.dueDateForClose = dueDateForClose;
exports.expectedPersonalPayDate = expectedPersonalPayDate;
exports.splitMSI = splitMSI;
exports.projectTransaction = projectTransaction;
const date_1 = require("./date");
const validation_1 = require("./validation");
/** Resolve the statement closing date that will contain a transaction. */
function statementCloseFor(txDate, card) {
    (0, validation_1.validDate)(txDate);
    (0, validation_1.integer)(card.statementCloseDay, 'statementCloseDay', 1, 31);
    const d = new Date(txDate + 'T00:00:00Z');
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    let close = (0, date_1.endOrDay)(y, m, card.statementCloseDay);
    if (d > close)
        close = (0, date_1.endOrDay)(y, m + 1, card.statementCloseDay);
    return close;
}
/** Resolve the bank's legal due date for a statement. */
function dueDateForClose(close, card) {
    if (card.dueRule.type === 'days_after_close')
        return (0, date_1.addDays)(close, card.dueRule.days);
    const next = (0, date_1.monthAdd)(close, 1);
    return (0, date_1.endOrDay)(next.getUTCFullYear(), next.getUTCMonth() + 1, card.dueRule.day);
}
/**
 * Resolve the date the user normally intends to pay.
 * The preferred day is interpreted as the latest occurrence of that day
 * after the statement closes and on/before the legal due date.
 * Example: close 11-Nov, due 05-Dec, preferred day 30 => 30-Nov.
 */
function expectedPersonalPayDate(close, card) {
    const legal = dueDateForClose(close, card);
    if (!card.personalPayDay)
        return legal;
    let cursor = new Date(Date.UTC(close.getUTCFullYear(), close.getUTCMonth(), 1));
    let best;
    // Statement-to-due windows are normally < 2 months, but search four safely.
    for (let i = 0; i < 4; i++) {
        const y = cursor.getUTCFullYear();
        const m = cursor.getUTCMonth() + 1;
        const candidate = (0, date_1.endOrDay)(y, m, card.personalPayDay);
        if (candidate > close && candidate <= legal)
            best = candidate;
        cursor = (0, date_1.monthAdd)(cursor, 1);
    }
    return best ?? legal;
}
function splitMSI(total, months, firstDue) {
    (0, validation_1.finiteNumber)(total, 'total', 0.01);
    (0, validation_1.integer)(months, 'months', 1, 360);
    const cents = Math.round(total * 100);
    const base = Math.floor(cents / months);
    const remainder = cents - base * months;
    return Array.from({ length: months }, (_, i) => ({
        number: i + 1,
        dueMonth: (0, date_1.ym)((0, date_1.monthAdd)(firstDue, i)),
        // Put rounding remainder in final installment for auditability.
        amount: (base + (i === months - 1 ? remainder : 0)) / 100
    }));
}
function projectTransaction(tx, card) {
    const close = statementCloseFor(tx.date, card);
    const legalDue = dueDateForClose(close, card);
    const payDate = expectedPersonalPayDate(close, card);
    const base = {
        close: close.toISOString().slice(0, 10),
        legalDue: legalDue.toISOString().slice(0, 10),
        payDate: payDate.toISOString().slice(0, 10),
        paymentMonth: (0, date_1.ym)(payDate)
    };
    if (tx.financing === 'msi' && tx.installments && tx.installments > 1) {
        return { ...base, installments: splitMSI(tx.amount, tx.installments, payDate) };
    }
    return { ...base, amount: tx.amount };
}
