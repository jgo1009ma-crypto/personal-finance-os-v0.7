"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const src_1 = require("../src");
function eq(actual, expected, label) {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
}
async function run() {
    const service = new src_1.FinanceService(new src_1.InMemoryFinanceRepository());
    const base = await service.overview('2026-09-25');
    eq(base.totalDebt, 132933.51, 'baseline total debt');
    const created = await service.createTransaction({
        cardId: 'banamex-classic', date: '2026-10-13', description: 'Compra de prueba', amount: 1200
    });
    eq(created.projection.paymentMonth, '2026-11', 'payment month');
    eq(created.projection.payDate, '2026-11-30', 'personal pay date');
    eq(await service.paymentMonthSpend('2026-11'), 1200, 'monthly spend');
    await service.createTransaction({
        cardId: 'banamex-classic', date: '2026-10-13', description: 'Compra MSI', amount: 3000, financing: 'msi', installments: 6
    });
    eq(await service.paymentMonthSpend('2026-11'), 1700, 'monthly spend incl MSI');
    eq(await service.paymentMonthSpend('2026-12'), 500, 'next MSI month');
    let overview = await service.overview('2026-10-13');
    eq(overview.totalDebt, 137133.51, 'live debt adds captured purchases');
    let detail = await service.cardDashboard('banamex-classic', '2026-10-13');
    eq(detail.currentBalance, 21363.57, 'live card balance');
    await service.createTransaction({
        cardId: 'banamex-classic', date: '2026-10-30', description: 'Pago tarjeta', amount: 500, kind: 'payment'
    });
    overview = await service.overview('2026-10-30');
    eq(overview.totalDebt, 136633.51, 'card payment reduces debt without becoming spending');
    eq(await service.paymentMonthSpend('2026-11'), 1700, 'card payment excluded from spending');
    const sim = await service.simulateExtraPayment('bbva-cash', 10500);
    if (sim.interestAndTaxSaved < 1900)
        throw new Error('expected material interest savings');
    eq(sim.paymentsSaved, 6, 'payments saved');
    overview = await service.overview('2026-09-25');
    eq(overview.monthlyFixedNet, 14036, 'fixed net');
    console.log('service.spec: ok');
}
run();
async function phase8() {
    const service = new src_1.FinanceService(new src_1.InMemoryFinanceRepository());
    const a = await service.createAccount({ name: 'Cuenta ahorro', institution: 'Banco', type: 'savings', balance: 25000, includeInNetWorth: true, isEmergencyFund: true });
    if (a.balance !== 25000)
        throw new Error('phase8 account create failed');
    const g = await service.createGoal({ name: 'Laptop', type: 'purchase', targetAmount: 30000, currentAmount: 5000, targetDate: '2027-03-31', priority: 'medium' });
    const contribution = await service.contributeToGoal(g.id, 2500, '2026-10-01');
    if (contribution.goal?.currentAmount !== 7500)
        throw new Error('phase8 goal contribution failed');
    const planning = await service.planningSummary('2026-09-27');
    if (!planning.accountsConfigured)
        throw new Error('phase8 planning should have accounts');
    if (planning.totalAssets !== 25000)
        throw new Error(`phase8 assets expected 25000 got ${planning.totalAssets}`);
    if (planning.netWorth !== -107933.51)
        throw new Error(`phase8 net worth mismatch ${planning.netWorth}`);
    if (planning.emergencyFund.currentAmount !== 25000)
        throw new Error('phase8 emergency fund should use tagged account');
    if (!planning.goals.items.some(x => x.goal.id === g.id && x.gap === 22500))
        throw new Error('phase8 goal progress missing');
    const ui = await service.updateUiPreferences({ theme: 'dark', dashboardMode: 'analytical', dashboardWidgets: ['netWorth', 'alerts'] });
    if (ui.theme !== 'dark' || ui.dashboardMode !== 'analytical')
        throw new Error('phase8 ui prefs failed');
    console.log('phase8.service.spec: ok');
}
phase8();
