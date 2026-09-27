"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ym = exports.iso = void 0;
exports.addDays = addDays;
exports.makeDate = makeDate;
exports.monthAdd = monthAdd;
exports.endOrDay = endOrDay;
const iso = (d) => d.toISOString().slice(0, 10);
exports.iso = iso;
const ym = (d) => d.toISOString().slice(0, 7);
exports.ym = ym;
function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function makeDate(y, m, day) { return new Date(Date.UTC(y, m - 1, day)); }
function monthAdd(d, n) { return makeDate(d.getUTCFullYear(), d.getUTCMonth() + 1 + n, 1); }
function endOrDay(y, m, day) { const max = new Date(Date.UTC(y, m, 0)).getUTCDate(); return makeDate(y, m, Math.min(day, max)); }
