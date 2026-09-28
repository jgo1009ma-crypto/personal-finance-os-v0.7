"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cashflow = cashflow;
exports.horizonEnd = horizonEnd;
exports.projectIncomeRules = projectIncomeRules;
exports.projectVariableBudget = projectVariableBudget;
exports.buildForecast = buildForecast;
const date_1 = require("./date");
const validation_1 = require("./validation");
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const iso = (d) => d.toISOString().slice(0, 10);
function cashflow(events, opening = 0) {
    let balance = opening;
    return [...events].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label)).map(e => {
        balance += e.type === 'income' ? e.amount : -e.amount;
        return { ...e, balance: r2(balance) };
    });
}
function horizonEnd(asOf, months) {
    (0, validation_1.validDate)(asOf);
    (0, validation_1.integer)(months, 'months', 1, 36);
    const [y, m] = asOf.slice(0, 7).split('-').map(Number);
    const lastMonth = (0, date_1.makeDate)(y, m + Math.max(1, months) - 1, 1);
    return iso((0, date_1.endOrDay)(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 31));
}
function active(rule, date) {
    if ((rule.status || 'active') === 'archived')
        return false;
    if (date < rule.startDate)
        return false;
    if (rule.endDate && date > rule.endDate)
        return false;
    return true;
}
/** Project known income events without inventing dates for amounts whose date is unknown. */
function projectIncomeRules(rules, asOf, until) {
    const out = [];
    const [sy, sm] = asOf.slice(0, 7).split('-').map(Number);
    let cursor = (0, date_1.makeDate)(sy, sm, 1);
    while (iso(cursor).slice(0, 7) <= until.slice(0, 7)) {
        const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth() + 1;
        for (const rule of rules) {
            const push = (date) => { if (date >= asOf && date <= until && active(rule, date))
                out.push({ date, label: rule.name, amount: r2(rule.amount), type: 'income', itemType: 'income', sourceId: rule.id }); };
            if (rule.frequency === 'semimonthly') {
                if (rule.day1)
                    push(iso((0, date_1.endOrDay)(y, m, rule.day1)));
                if (rule.day2)
                    push(iso((0, date_1.endOrDay)(y, m, rule.day2)));
            }
            else if (rule.frequency === 'monthly') {
                push(iso((0, date_1.endOrDay)(y, m, rule.day1 || 1)));
            }
            else if (rule.frequency === 'annual') {
                const s = new Date(rule.startDate + 'T00:00:00Z');
                if (s.getUTCMonth() + 1 === m)
                    push(iso((0, date_1.endOrDay)(y, m, rule.day1 || s.getUTCDate())));
            }
            else if (rule.frequency === 'one_time' && rule.date && rule.date.slice(0, 7) === `${y}-${String(m).padStart(2, '0')}`) {
                push(rule.date);
            }
        }
        cursor = (0, date_1.monthAdd)(cursor, 1);
    }
    return out;
}
/** Planning-only variable spend. Four equal envelopes make daily liquidity less falsely optimistic than one month-end lump. */
function projectVariableBudget(monthlyAmount, asOf, until) {
    if (!(monthlyAmount > 0))
        return [];
    const out = [];
    const [sy, sm] = asOf.slice(0, 7).split('-').map(Number);
    let cursor = (0, date_1.makeDate)(sy, sm, 1);
    while ((0, date_1.ym)(cursor) <= until.slice(0, 7)) {
        const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth() + 1;
        const cents = Math.round(monthlyAmount * 100), base = Math.floor(cents / 4);
        [7, 14, 21, 28].forEach((day, i) => {
            const date = iso((0, date_1.endOrDay)(y, m, day));
            const amount = (base + (i === 3 ? cents - base * 4 : 0)) / 100;
            if (date >= asOf && date <= until)
                out.push({ date, label: `Presupuesto variable ${i + 1}/4`, amount, type: 'expense', itemType: 'variable_budget', assumption: true });
        });
        cursor = (0, date_1.monthAdd)(cursor, 1);
    }
    return out;
}
function buildForecast(asOf, until, events, preferences, warnings = []) {
    (0, validation_1.validDate)(asOf);
    (0, validation_1.validDate)(until);
    (0, validation_1.finiteNumber)(preferences.openingCash, 'openingCash', -Number.MAX_SAFE_INTEGER / 100);
    if (until < asOf || Date.parse(until) - Date.parse(asOf) > 366 * 3 * 86400000)
        throw new Error('invalid forecast range');
    for (const event of events) {
        (0, validation_1.validDate)(event.date);
        (0, validation_1.finiteNumber)(event.amount, 'event amount');
    }
    const filtered = events.filter(e => e.date >= asOf && e.date <= until && e.amount >= 0);
    const daily = cashflow(filtered, preferences.openingCash);
    const monthMap = new Map();
    const [sy, sm] = asOf.slice(0, 7).split('-').map(Number);
    let cursor = (0, date_1.makeDate)(sy, sm, 1);
    let prevEnding = preferences.openingCash;
    while ((0, date_1.ym)(cursor) <= until.slice(0, 7)) {
        const month = (0, date_1.ym)(cursor);
        monthMap.set(month, { month, income: 0, fixedExpenses: 0, variableBudget: 0, cardPayments: 0, installments: 0, interestDebt: 0, extraDebtPayments: 0, scenarioPurchases: 0, totalOutflow: 0, netCashflow: 0, endingBalance: prevEnding });
        cursor = (0, date_1.monthAdd)(cursor, 1);
    }
    for (const e of filtered) {
        const row = monthMap.get(e.date.slice(0, 7));
        if (!row)
            continue;
        if (e.type === 'income')
            row.income += e.amount;
        else {
            if (e.itemType === 'fixed_expense')
                row.fixedExpenses += e.amount;
            else if (e.itemType === 'variable_budget')
                row.variableBudget += e.amount;
            else if (e.itemType === 'card_payment')
                row.cardPayments += e.amount;
            else if (e.itemType === 'installment')
                row.installments += e.amount;
            else if (e.itemType === 'interest_debt')
                row.interestDebt += e.amount;
            else if (e.itemType === 'extra_debt_payment')
                row.extraDebtPayments += e.amount;
            else if (e.itemType === 'scenario_purchase')
                row.scenarioPurchases += e.amount;
            row.totalOutflow += e.amount;
        }
    }
    const monthly = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));
    let running = preferences.openingCash;
    for (const r of monthly) {
        r.income = r2(r.income);
        r.fixedExpenses = r2(r.fixedExpenses);
        r.variableBudget = r2(r.variableBudget);
        r.cardPayments = r2(r.cardPayments);
        r.installments = r2(r.installments);
        r.interestDebt = r2(r.interestDebt);
        r.extraDebtPayments = r2(r.extraDebtPayments);
        r.scenarioPurchases = r2(r.scenarioPurchases);
        r.totalOutflow = r2(r.totalOutflow);
        r.netCashflow = r2(r.income - r.totalOutflow);
        running = r2(running + r.netCashflow);
        r.endingBalance = running;
    }
    let minimumCash = preferences.openingCash, minimumCashDate, negativeDays = 0, firstNegativeDate;
    // Risk metrics use calendar days and closing balances, independent of labels/event order.
    const closings = new Map();
    for (const row of daily)
        closings.set(row.date, row.balance);
    let closing = preferences.openingCash;
    for (let day = new Date(asOf + 'T00:00:00Z'); iso(day) <= until; day = (0, date_1.addDays)(day, 1)) {
        const date = iso(day);
        closing = closings.get(date) ?? closing;
        if (closing < minimumCash) {
            minimumCash = closing;
            minimumCashDate = date;
        }
        if (closing < 0) {
            negativeDays++;
            firstNegativeDate ??= date;
        }
    }
    const metrics = { openingCash: r2(preferences.openingCash), endingCash: r2(daily.at(-1)?.balance ?? preferences.openingCash), minimumCash: r2(minimumCash), minimumCashDate, negativeDays, firstNegativeDate, monthsWithNegativeEndingBalance: monthly.filter(m => m.endingBalance < 0).length, totalIncome: r2(filtered.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)), totalOutflow: r2(filtered.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)) };
    return { asOf, horizonEnd: until, preferences, events: filtered.sort((a, b) => a.date.localeCompare(b.date)), daily, monthly, metrics, warnings };
}
