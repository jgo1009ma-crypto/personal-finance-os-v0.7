"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseStatementSummary = parseStatementSummary;
exports.parseMovementLines = parseMovementLines;
exports.reconcileRows = reconcileRows;
exports.buildStatementImport = buildStatementImport;
const MONTHS = {
    ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
    jan: '01', apr: '04', aug: '08', dec: '12'
};
const money = (s) => Number(s.replace(/[$,\s]/g, ''));
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\brfc\b.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
function dateTokenToIso(token) {
    const clean = token.trim().replace(/\s+/g, ' ');
    let m = clean.match(/^(\d{1,2})-([A-Za-zÁÉÍÓÚáéíóú]{3})-(\d{4})$/);
    if (m) {
        const mm = MONTHS[norm(m[2]).slice(0, 3)];
        if (mm)
            return `${m[3]}-${mm}-${String(Number(m[1])).padStart(2, '0')}`;
    }
    m = clean.match(/^(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3})\s+(\d{4})$/);
    if (m) {
        const mm = MONTHS[norm(m[2]).slice(0, 3)];
        if (mm)
            return `${m[3]}-${mm}-${String(Number(m[1])).padStart(2, '0')}`;
    }
    return undefined;
}
function firstDate(text, patterns) {
    for (const p of patterns) {
        const m = text.match(p);
        if (m) {
            const d = dateTokenToIso(m[1]);
            if (d)
                return d;
        }
    }
}
function firstMoney(text, patterns) {
    for (const p of patterns) {
        const m = text.match(p);
        if (m)
            return money(m[1]);
    }
}
function parseStatementSummary(text) {
    const flattened = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n');
    const statementDate = firstDate(flattened, [/Fecha de corte:?\s*([0-9]{1,2}-[A-Za-zÁÉÍÓÚáéíóú]{3}-[0-9]{4})/i, /Fecha de corte:?\s*([0-9]{1,2}\s+[A-Za-zÁÉÍÓÚáéíóú]{3}\s+[0-9]{4})/i]);
    const period = flattened.match(/Periodo:?\s*([0-9]{1,2}(?:-|\s)[A-Za-zÁÉÍÓÚáéíóú]{3}(?:-|\s)[0-9]{4})\s+al\s+([0-9]{1,2}(?:-|\s)[A-Za-zÁÉÍÓÚáéíóú]{3}(?:-|\s)[0-9]{4})/i);
    const paymentDueDate = firstDate(flattened, [/Fecha l[ií]mite de pago:?\s*\d*\s*(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)?[,]?\s*([0-9]{1,2}-[A-Za-zÁÉÍÓÚáéíóú]{3}-[0-9]{4})/i, /Fecha l[ií]mite de pago\d*\s*:?\s*(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)?[,]?\s*([0-9]{1,2}\s+[A-Za-zÁÉÍÓÚáéíóú]{3}\s+[0-9]{4})/i]);
    const paymentToAvoidInterest = firstMoney(flattened, [/Pago para no generar intereses\d*\s*:?\s*\$?\s*([\d,]+\.\d{2})/i, /PAGO PARA NO GENERAR\s+INTERESES\d*\s*=\s*\$?\s*([\d,]+\.\d{2})/i]);
    const totalBalance = firstMoney(flattened, [/Saldo deudor total:?\s*\d*\s*\$?\s*([\d,]+\.\d{2})/i, /Saldo al corte\s*\$?\s*([\d,]+\.\d{2})/i]);
    const regularBalance = firstMoney(flattened, [/Saldo cargos regulares:?\s*\$?\s*([\d,]+\.\d{2})/i]);
    const installmentBalance = firstMoney(flattened, [/Saldo (?:cargo|cargos) a meses:?\s*\$?\s*([\d,]+\.\d{2})/i]);
    const availableCredit = firstMoney(flattened, [/Cr[eé]dito disponible:?\s*\$?\s*([\d,]+\.\d{2})/i]);
    let dataQuality = statementDate ? 'official' : 'derived';
    if (totalBalance !== undefined && regularBalance !== undefined && installmentBalance !== undefined && Math.abs(totalBalance - (regularBalance + installmentBalance)) > 1)
        dataQuality = 'inconsistent';
    return {
        statementDate,
        periodStart: period ? dateTokenToIso(period[1]) : undefined,
        periodEnd: period ? dateTokenToIso(period[2]) : undefined,
        paymentDueDate, paymentToAvoidInterest, totalBalance, regularBalance, installmentBalance, availableCredit, dataQuality
    };
}
function kindAndFinancing(description, sign) {
    const n = norm(description);
    if (sign === -1) {
        if (/pago|abono|gracias/.test(n))
            return { kind: 'payment', financing: 'regular' };
        return { kind: 'refund', financing: 'regular' };
    }
    if (/interes/.test(n))
        return { kind: 'interest', financing: /efi|efectivo inmediato|plan/.test(n) ? 'interest_plan' : 'regular' };
    if (/comision|iva comision/.test(n))
        return { kind: 'fee', financing: 'regular' };
    if (/efectivo inmediato|disposicion/.test(n))
        return { kind: 'cash_advance', financing: 'interest_plan' };
    const m = n.match(/(?:^|\s)(\d{1,2})\s+de\s+(\d{1,2})(?:\s|$)/) || n.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\s|$)/);
    if (m)
        return { kind: 'purchase', financing: 'msi' };
    return { kind: 'purchase', financing: 'regular' };
}
function fingerprint(cardId, date, description, amount, sign) {
    const input = `${cardId}|${date}|${norm(description)}|${amount.toFixed(2)}|${sign}`;
    let h1 = 2166136261 >>> 0, h2 = 2246822519 >>> 0;
    for (let i = 0; i < input.length; i++) {
        const c = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = Math.imul(h2 ^ c, 3266489917) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + input.length.toString(16).padStart(8, '0');
}
function parseMovementLines(cardId, text, importId) {
    const rows = [];
    const seen = new Set();
    const iso = /^\s*(\d{1,2}-[A-Za-zÁÉÍÓÚáéíóú]{3}-\d{4})\s+(\d{1,2}-[A-Za-zÁÉÍÓÚáéíóú]{3}-\d{4})\s+(.+?)\s+([+-])\s*\$\s*([\d,]+\.\d{2})\s*$/i;
    const nu = /^\s*(\d{1,2}\s+[A-Za-zÁÉÍÓÚáéíóú]{3}\s+\d{4})\s+(\d{1,2}\s+[A-Za-zÁÉÍÓÚáéíóú]{3}\s+\d{4})\s+(.+?)\s+([+-])\s*\$?\s*([\d,]+\.\d{2})\s*$/i;
    for (const line of text.replace(/\r/g, '').split('\n')) {
        const m = line.match(iso) || line.match(nu);
        if (!m)
            continue;
        const transactionDate = dateTokenToIso(m[1]);
        const postingDate = dateTokenToIso(m[2]);
        if (!transactionDate)
            continue;
        const description = m[3].replace(/\s{2,}/g, ' ').trim();
        const sign = m[4] === '-' ? -1 : 1;
        const amount = money(m[5]);
        if (!(amount > 0))
            continue;
        const fp = fingerprint(cardId, transactionDate, description, amount, sign);
        if (seen.has(fp))
            continue;
        seen.add(fp);
        const guessed = kindAndFinancing(description, sign);
        rows.push({ id: crypto.randomUUID(), importId, transactionDate, postingDate, description, amount, sign, kindGuess: guessed.kind, financingGuess: guessed.financing, installments: guessed.installments, fingerprint: fp, status: 'new', sourceLine: line.trim() });
    }
    return rows;
}
function dateDiffDays(a, b) { return Math.abs((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000); }
function descScore(a, b) {
    const A = new Set(norm(a).split(' ').filter(x => x.length > 1));
    const B = new Set(norm(b).split(' ').filter(x => x.length > 1));
    if (!A.size || !B.size)
        return 0;
    let common = 0;
    for (const x of A)
        if (B.has(x))
            common++;
    return common / Math.max(A.size, B.size);
}
function reconcileRows(rows, existing) {
    const used = new Set();
    for (const row of rows) {
        let best;
        let bestScore = 0;
        for (const tx of existing) {
            if (used.has(tx.id))
                continue;
            if (Math.abs(tx.amount - row.amount) > 0.02)
                continue;
            const dd = dateDiffDays(tx.date, row.transactionDate);
            if (dd > 5)
                continue;
            let score = .55;
            score += dd === 0 ? .25 : dd === 1 ? .22 : dd <= 3 ? .15 : .08;
            score += Math.min(.20, descScore(tx.description, row.description) * .20);
            const txSign = (tx.kind === 'payment' || tx.kind === 'refund') ? -1 : 1;
            if (txSign !== row.sign)
                score -= .20;
            if (score > bestScore) {
                bestScore = score;
                best = tx;
            }
        }
        row.matchConfidence = Math.round(bestScore * 100) / 100;
        if (best && bestScore >= .83) {
            row.status = 'matched';
            row.matchedTransactionId = best.id;
            used.add(best.id);
        }
        else if (best && bestScore >= .70) {
            row.status = 'possible_match';
            row.matchedTransactionId = best.id;
        }
        else
            row.status = 'new';
    }
    return rows;
}
function buildStatementImport(cardId, filename, text, existing) {
    const id = crypto.randomUUID();
    const summary = parseStatementSummary(text);
    const rows = reconcileRows(parseMovementLines(cardId, text, id), existing.filter(t => t.cardId === cardId));
    const warnings = [];
    if (!summary.statementDate)
        warnings.push('No se pudo detectar la fecha de corte automáticamente.');
    if (!rows.length)
        warnings.push('No se detectaron movimientos tabulares. El PDF puede requerir OCR o un parser específico.');
    if (summary.dataQuality === 'inconsistent')
        warnings.push('Los subtotales del estado no reconcilian con el saldo total publicado.');
    return { id, cardId, filename, parser: 'mx-statement-v0.4', status: 'review', createdAt: new Date().toISOString(), summary, rows, extractionWarnings: warnings };
}
