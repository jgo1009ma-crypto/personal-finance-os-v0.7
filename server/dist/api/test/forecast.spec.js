"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const src_1 = require("../src");
function ok(v, label) { if (!v)
    throw new Error(label); }
function eq(a, b, label) { if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${label}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
async function run() {
    const service = new src_1.FinanceService(new src_1.InMemoryFinanceRepository());
    await service.updatePreferences({ openingCash: 17000, variableSpendTarget: 5000, forecastHorizonMonths: 4 });
    const f = await service.forecast({ asOf: '2026-09-25' });
    const liv = f.forecast.events.find(e => e.sourceId === 'snapshot:liverpool');
    ok(liv, 'Liverpool statement payment projected');
    eq(liv.date, '2026-09-27', 'Liverpool one-month-arrears pay date');
    ok(f.forecast.events.some(e => e.label === 'Nómina' && e.date === '2026-10-09'), 'salary Oct 9 projected');
    eq(f.emergencyFund.targetAmount, 42108, '3-month emergency target');
    ok(f.debtTimeline.length === 4, 'four-month debt timeline');
    const sim = await service.simulateScenario({ asOf: '2026-09-25', horizonMonths: 12, openingCash: 17000, variableSpendTarget: 5000, extraDebtPayment: { planId: 'bbva-cash', date: '2026-10-09', amount: 10500 } });
    ok(sim.deltas.interestAndTaxSaved > 1900, 'extra payment saves interest');
    eq(sim.deltas.paymentsSaved, 6, 'extra payment removes six payments');
    const purchase = await service.simulateScenario({ asOf: '2026-09-25', horizonMonths: 6, openingCash: 17000, variableSpendTarget: 5000, purchase: { cardId: 'banamex-classic', date: '2026-10-13', amount: 3000, description: 'Compra simulada', financing: 'msi', installments: 6 } });
    ok(purchase.scenario.forecast.events.some(e => e.itemType === 'scenario_purchase'), 'scenario purchase scheduled');
    ok(purchase.deltas.totalOutflow > 0, 'scenario increases projected outflow in horizon');
    console.log('forecast.spec: ok');
}
run();
