"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultPreferences = exports.installmentCommitments = exports.incomeRules = exports.debtPlans = exports.recurring = exports.cards = void 0;
exports.cards = [
    { id: 'banamex-classic', name: 'Banamex Clásica', issuer: 'Banamex', creditLimit: 16500, statementCloseDay: 11, dueRule: { type: 'days_after_close', days: 24 }, personalPayDay: 30, apr: .6201, interestDayBasis: 360, interestTaxRate: .16 },
    { id: 'banamex-joy', name: 'Banamex Joy', issuer: 'Banamex', creditLimit: 59500, statementCloseDay: 17, dueRule: { type: 'days_after_close', days: 20 }, personalPayDay: 30, apr: .6301, interestDayBasis: 360, interestTaxRate: .16 },
    { id: 'bbva-blue', name: 'BBVA Azul', issuer: 'BBVA', creditLimit: 90600, statementCloseDay: 12, dueRule: { type: 'days_after_close', days: 20 }, personalPayDay: 30, apr: .5081, interestDayBasis: 360, interestTaxRate: .16 },
    { id: 'nu', name: 'Nu Oro', issuer: 'Nu', creditLimit: 25000, statementCloseDay: 5, dueRule: { type: 'days_after_close', days: 12 }, personalPayDay: 9, apr: 1.399, interestDayBasis: 360, interestTaxRate: .16 },
    { id: 'liverpool', name: 'Liverpool', issuer: 'Liverpool', creditLimit: 45000, statementCloseDay: 27, dueRule: { type: 'fixed_day', day: 27 }, apr: .5886, interestDayBasis: 360, interestTaxRate: .16 }
];
exports.recurring = [
    { id: 'rent', name: 'Renta', amount: 5600, frequency: 'monthly', startDate: '2026-11-01' },
    { id: 'maint', name: 'Mantenimiento', amount: 900, frequency: 'monthly', startDate: '2026-10-01' },
    { id: 'gas', name: 'Gas', amount: 100, frequency: 'monthly', startDate: '2026-10-01' },
    { id: 'electric', name: 'Luz', amount: 350, frequency: 'bimonthly', startDate: '2026-10-01' },
    { id: 'water', name: 'Agua', amount: 150, frequency: 'bimonthly', startDate: '2026-10-01' },
    { id: 'uvm', name: 'Maestría UVM', amount: 5116, offsetIncome: 3000, frequency: 'monthly', startDate: '2026-10-01', cardId: 'banamex-classic', category: 'Educación' },
    { id: 'podiatry', name: 'Podóloga', amount: 380, frequency: 'monthly', startDate: '2026-10-01' },
    { id: 'telcel', name: 'Telcel', amount: 500, frequency: 'monthly', startDate: '2026-10-01', cardId: 'banamex-joy', category: 'Telecom' },
    { id: 'hbo', name: 'HBO Max', amount: 179, frequency: 'monthly', startDate: '2026-10-01', cardId: 'banamex-joy', category: 'Entretenimiento' },
    { id: 'netflix', name: 'Netflix', amount: 269, frequency: 'monthly', startDate: '2026-10-01' },
    { id: 'meli', name: 'Meli+', amount: 99, frequency: 'monthly', startDate: '2026-10-01' },
    { id: 'chatgpt', name: 'ChatGPT Plus', amount: 798, frequency: 'monthly', startDate: '2026-10-01', cardId: 'nu', category: 'Software' },
    { id: 'google', name: 'Google', amount: 198, frequency: 'monthly', startDate: '2026-10-01', cardId: 'banamex-classic', category: 'Software' },
    { id: 'catfood', name: 'Croquetas gatos', amount: 600, frequency: 'monthly', startDate: '2026-10-01' },
    { id: 'litter', name: 'Arena gatos', amount: 870, frequency: 'every_n_days', everyNDays: 45, startDate: '2026-10-01' },
    { id: 'f1', name: 'F1 TV', amount: 129, frequency: 'monthly', startDate: '2026-10-01' },
    { id: 'icloud', name: 'iCloud', amount: 50, frequency: 'monthly', startDate: '2026-10-01' },
    { id: 'gamepass', name: 'Game Pass', amount: 349, frequency: 'monthly', startDate: '2026-10-01' },
    { id: 'totalplay', name: 'Totalplay', amount: 800, frequency: 'monthly', startDate: '2026-10-01' },
    { id: 'applemusic', name: 'Apple Music', amount: 139, frequency: 'monthly', startDate: '2026-10-01' }
];
exports.debtPlans = [
    { id: 'bbva-cash', cardId: 'bbva-blue', name: 'BBVA Efectivo Inmediato agregado', principal: 13100.15, apr: .36, remainingPayments: 10, scheduledPayment: 1964.01, dayBasis: 360, taxRate: .16, nextPaymentDate: '2026-10-30' },
    { id: 'nu-interest', cardId: 'nu', name: 'Nu planes con interés', principal: 1465.43, apr: .599, remainingPayments: 3, scheduledPayment: 442.20, dayBasis: 360, taxRate: .16, nextPaymentDate: '2026-10-09' }
];
/** Cash inflows with known timing. The December aguinaldo is intentionally not seeded because its exact date is not yet known. */
exports.incomeRules = [
    { id: 'salary', name: 'Nómina', amount: 17000, frequency: 'semimonthly', day1: 9, day2: 24, startDate: '2026-01-01' },
    { id: 'company-oct-2026', name: 'Ingreso extraordinario empresa', amount: 12000, frequency: 'one_time', date: '2026-10-09', startDate: '2026-10-09' }
];
/**
 * Known zero-interest commitments extracted from the September statements.
 * These begin AFTER the installment already included in the September statement payment.
 * Liverpool is excluded because its PDF text encoding did not expose a reliable plan-level breakdown.
 */
exports.installmentCommitments = [
    { id: 'classic-saludable', cardId: 'banamex-classic', name: 'Saludable', monthlyAmount: 640.33, remainingPayments: 1, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'classic-nike', cardId: 'banamex-classic', name: 'Nike Parque Delta', monthlyAmount: 1149.43, remainingPayments: 2, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'joy-apple', cardId: 'banamex-joy', name: 'Apple Store', monthlyAmount: 1994.33, remainingPayments: 11, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'joy-amazon', cardId: 'banamex-joy', name: 'Amazon a meses', monthlyAmount: 416.75, remainingPayments: 1, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'bbva-precision', cardId: 'bbva-blue', name: 'Precision Opti', monthlyAmount: 1146, remainingPayments: 1, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'bbva-mp-feb', cardId: 'bbva-blue', name: 'Mercado Pago 12 MSI (febrero)', monthlyAmount: 259, remainingPayments: 5, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'bbva-transfer', cardId: 'bbva-blue', name: 'Abono por traspaso promoción', monthlyAmount: 291, remainingPayments: 3, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'bbva-amazon-small', cardId: 'bbva-blue', name: 'Amazon 314.10', monthlyAmount: 53, remainingPayments: 4, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'bbva-amazon-main', cardId: 'bbva-blue', name: 'Amazon 4,452', monthlyAmount: 742, remainingPayments: 4, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'bbva-amazon-667', cardId: 'bbva-blue', name: 'Amazon 667.85', monthlyAmount: 223, remainingPayments: 1, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'bbva-amazon-649', cardId: 'bbva-blue', name: 'Amazon 649', monthlyAmount: 217, remainingPayments: 1, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'bbva-mp-aug', cardId: 'bbva-blue', name: 'Mercado Pago 22,431', monthlyAmount: 1870, remainingPayments: 11, nextPaymentDate: '2026-10-30', source: 'statement', dataQuality: 'official' },
    { id: 'nu-amazon', cardId: 'nu', name: 'Amazon 6 MSI', monthlyAmount: 471.67, remainingPayments: 4, nextPaymentDate: '2026-10-09', source: 'statement', dataQuality: 'official' },
    { id: 'nu-mercadolibre', cardId: 'nu', name: 'MercadoLibre 3 MSI', monthlyAmount: 83.22, remainingPayments: 1, nextPaymentDate: '2026-10-09', source: 'statement', dataQuality: 'official' },
    { id: 'nu-mercadopago', cardId: 'nu', name: 'Mercado Pago 6 MSI', monthlyAmount: 540.34, remainingPayments: 5, nextPaymentDate: '2026-10-09', source: 'statement', dataQuality: 'official' }
];
exports.defaultPreferences = {
    openingCash: 0,
    variableSpendTarget: 6000,
    emergencyFundMonths: 3,
    emergencyFundBalance: 0,
    forecastHorizonMonths: 12,
    maxMsiIncomeRatio: .15,
    maxCreditUtilization: .30
};
