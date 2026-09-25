"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryFinanceRepository = void 0;
const seed_1 = require("../../core/src/seed");
const financial_snapshots_1 = require("./financial-snapshots");
class InMemoryFinanceRepository {
    cards = structuredClone(seed_1.cards).map(c => ({ ...c, status: c.status || 'active' }));
    snapshots = structuredClone(financial_snapshots_1.cardSnapshots);
    recurring = structuredClone(seed_1.recurring);
    recurringOverrides = [];
    transactions = [];
    imports = [];
    preferences = structuredClone(seed_1.defaultPreferences);
    async listCards(includeArchived = false) { return structuredClone(this.cards.filter(c => includeArchived || (c.status || 'active') === 'active')); }
    async getCard(id) { return structuredClone(this.cards.find(c => c.id === id)); }
    async saveCard(card) { this.cards.push(structuredClone(card)); }
    async updateCard(card) { const i = this.cards.findIndex(c => c.id === card.id); if (i < 0)
        throw new Error('Card not found'); this.cards[i] = structuredClone(card); }
    async listCardSnapshots() { return structuredClone(this.snapshots); }
    async getCardSnapshot(cardId) { return structuredClone(this.snapshots.find(s => s.cardId === cardId)); }
    async upsertCardSnapshot(snapshot) { const i = this.snapshots.findIndex(s => s.cardId === snapshot.cardId); if (i < 0)
        this.snapshots.push(structuredClone(snapshot));
    else
        this.snapshots[i] = structuredClone(snapshot); }
    async listDebtPlans() { return structuredClone(seed_1.debtPlans); }
    async getDebtPlan(id) { return structuredClone(seed_1.debtPlans.find(p => p.id === id)); }
    async listIncomeRules() { return structuredClone(seed_1.incomeRules); }
    async listInstallmentCommitments() { return structuredClone(seed_1.installmentCommitments); }
    async getPreferences() { return structuredClone(this.preferences); }
    async savePreferences(p) { this.preferences = structuredClone(p); }
    async listRecurring(includeArchived = false) { return structuredClone(this.recurring.filter(r => includeArchived || (r.status || 'active') === 'active')); }
    async listRecurringOverrides() { return structuredClone(this.recurringOverrides); }
    async saveRecurringOverride(o) { const i = this.recurringOverrides.findIndex(x => x.recurringId === o.recurringId && x.periodKey === o.periodKey); if (i < 0)
        this.recurringOverrides.push(structuredClone(o));
    else
        this.recurringOverrides[i] = structuredClone(o); }
    async listTransactions() { return structuredClone(this.transactions); }
    async saveTransaction(tx) { this.transactions.push(structuredClone(tx)); }
    async listImports() { return structuredClone(this.imports); }
    async getImport(id) { return structuredClone(this.imports.find(x => x.id === id)); }
    async saveImport(x) { this.imports.push(structuredClone(x)); }
    async updateImport(x) { const i = this.imports.findIndex(v => v.id === x.id); if (i < 0)
        throw new Error('Import not found'); this.imports[i] = structuredClone(x); }
}
exports.InMemoryFinanceRepository = InMemoryFinanceRepository;
