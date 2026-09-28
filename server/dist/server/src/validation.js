"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTransaction = validateTransaction;
exports.validateCard = validateCard;
exports.validatePreferences = validatePreferences;
const validation_1 = require("../../core/src/validation");
function validateTransaction(input) {
    if (!input || typeof input.cardId !== 'string' || !input.cardId)
        throw new Error('cardId is required');
    (0, validation_1.validDate)(input.date);
    (0, validation_1.finiteNumber)(input.amount, 'amount', 0.01);
    if (typeof input.description !== 'string' || !input.description.trim())
        throw new Error('description is required');
    if (!['purchase', 'refund', 'payment', 'fee', 'interest', 'cash_advance', 'subscription'].includes(input.kind ?? 'purchase'))
        throw new Error('invalid transaction kind');
    if (!['regular', 'msi', 'interest_plan', 'revolver'].includes(input.financing ?? 'regular'))
        throw new Error('invalid financing');
    if (input.financing === 'msi')
        (0, validation_1.integer)(input.installments, 'installments', 2, 360);
    if (input.apr !== undefined)
        (0, validation_1.finiteNumber)(input.apr, 'apr');
}
function validateCard(input) {
    if (typeof input.name !== 'string' || !input.name.trim() || typeof input.issuer !== 'string' || !input.issuer.trim())
        throw new Error('name and issuer are required');
    (0, validation_1.finiteNumber)(input.creditLimit, 'creditLimit', 0.01);
    (0, validation_1.integer)(input.statementCloseDay, 'statementCloseDay', 1, 31);
    if (input.dueRule?.type === 'fixed_day')
        (0, validation_1.integer)(input.dueRule.day, 'dueRule.day', 1, 31);
    else if (input.dueRule?.type === 'days_after_close')
        (0, validation_1.integer)(input.dueRule.days, 'dueRule.days', 1, 90);
    else
        throw new Error('invalid dueRule');
    if (input.personalPayDay !== undefined)
        (0, validation_1.integer)(input.personalPayDay, 'personalPayDay', 1, 31);
    if (input.apr !== undefined)
        (0, validation_1.finiteNumber)(input.apr, 'apr');
    if (input.interestTaxRate !== undefined)
        (0, validation_1.finiteNumber)(input.interestTaxRate, 'interestTaxRate', 0, 1);
    if (input.interestDayBasis !== undefined && ![360, 365].includes(input.interestDayBasis))
        throw new Error('invalid interestDayBasis');
    if (input.last4 !== undefined && input.last4 !== '' && !/^\d{4}$/.test(input.last4))
        throw new Error('last4 must contain exactly four digits');
}
function validatePreferences(p) {
    (0, validation_1.finiteNumber)(p.openingCash, 'openingCash');
    (0, validation_1.finiteNumber)(p.variableSpendTarget, 'variableSpendTarget');
    (0, validation_1.finiteNumber)(p.emergencyFundBalance, 'emergencyFundBalance');
    (0, validation_1.finiteNumber)(p.emergencyFundMonths, 'emergencyFundMonths', 0, 24);
    (0, validation_1.integer)(p.forecastHorizonMonths, 'forecastHorizonMonths', 1, 36);
    (0, validation_1.finiteNumber)(p.maxMsiIncomeRatio, 'maxMsiIncomeRatio', 0, 1);
    (0, validation_1.finiteNumber)(p.maxCreditUtilization, 'maxCreditUtilization', 0, 1);
}
