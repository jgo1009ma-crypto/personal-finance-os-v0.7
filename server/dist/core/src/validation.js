"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validDate = validDate;
exports.validMonth = validMonth;
exports.finiteNumber = finiteNumber;
exports.integer = integer;
/** Runtime validation is required at HTTP and tool boundaries; TS types alone do not validate JSON. */
function validDate(value, field = 'date') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new Error(`${field} must be YYYY-MM-DD`);
    const d = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
        throw new Error(`${field} must be a valid calendar date`);
}
function validMonth(value, field = 'month') {
    if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
        throw new Error(`${field} must be YYYY-MM`);
}
function finiteNumber(value, field, min = 0, max = Number.MAX_SAFE_INTEGER / 100) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
        throw new Error(`${field} must be a finite number between ${min} and ${max}`);
}
function integer(value, field, min, max) {
    finiteNumber(value, field, min, max);
    if (!Number.isInteger(value))
        throw new Error(`${field} must be an integer`);
}
