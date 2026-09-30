# Finanzas_Personales_v2 integration analysis

Version: **Personal Finance OS v0.8.1**

## Purpose

The workbook is useful as a legacy source of transaction context and installment detail, but it should not replace the live Personal Finance OS ledger. It contains month-level planning blocks, mixes actual-cycle charges with recurring costs and financing projections, and has several amounts that have since been superseded by values maintained directly in the app.

## Workbook coverage

The analyzed workbook contains monthly planning blocks for October 2026 through January 2027. The legacy totals are:

| Month | Tracker total |
| --- | ---: |
| Oct 2026 | MXN 43,728.86 |
| Nov 2026 | MXN 30,263.38 |
| Dec 2026 | MXN 28,321.05 |
| Jan 2027 | MXN 26,689.38 |

The tracker therefore shows a **39.0% decline** in planned obligations from October to January, consistent with a temporary stack of installments unwinding over time.

## October concentration

October is the heaviest observed month. BBVA contributes **MXN 20,364.00**, or **46.57%** of the tracker total. Other October totals are Clásica MXN 2,167.00, Mercado Pago MXN 3,985.33, Nu MXN 5,886.15, Joy MXN 6,120.21, Liverpool MXN 3,646.17 and legacy fixed expenses MXN 1,560.00.

The current Personal Finance OS model knows **MXN 49,000** of October inflows when salary, the known MXN 12,000 extraordinary company payment and the MXN 3,000 family tuition support are combined. Against the legacy October tracker total, that leaves a nominal **MXN 5,271.14** margin before timing differences and any transactions missing from either source. This is context, not a cash guarantee.

## Variable-spend signal

After excluding rows already modeled as recurring costs, known installments/debt, references and ambiguous items, the workbook contains **21 regular current-cycle purchase candidates totaling MXN 9,093.50**. Compared with the current MXN 6,000 variable-spend planning target, that is **MXN 3,093.50 above target, or 51.6%**.

This is one of the most useful historical signals in the workbook: the user's real discretionary/current-cycle spend was materially above the planning target in this period. The app now exposes this comparison in Reports instead of silently inserting those purchases.

## New financing signal

The tracker contains a BBVA iPhone purchase with a stated principal of **MXN 25,454**, financed over **13 MSI** at about **MXN 1,958 per month**. Because this materially changes the live BBVA balance and was not confirmed by a bank statement inside the app, it is presented as an import candidate and requires explicit confirmation plus the real transaction date. If confirmed, the app records the full MXN 25,454 purchase with 13 installments, not a single MXN 1,958 expense.

## Liverpool recovery

The Liverpool statement PDF did not expose plan-level text reliably. The workbook supplies a useful reconciliation bridge. v0.8.1 adds derived future commitments beginning with the October payment cycle:

| Plan | Monthly | Future payments modeled |
| --- | ---: | ---: |
| Tablet | MXN 1,083.17 | 5 |
| Xbox | MXN 1,744.33 | 5 |
| Monitor Edith | MXN 588.67 | 3 |
| Playeras | MXN 230.00 | 3 |

These sum to **MXN 3,646.17** for October through December and then **MXN 2,827.50** for January/February as the shorter plans end. The Playeras row is marked derived/estimated because the workbook's installment notation is internally inconsistent with its later monthly projection.

## Conflicts intentionally not imported

The workbook is older than several direct inputs already maintained in the app. For example, its fixed-cost section uses MXN 960 maintenance and MXN 6,450 rent, while the current app uses the user's newer MXN 900 maintenance and MXN 5,600 rent. The live app values remain authoritative.

Likewise, rows that look like interest, loans, transfers, payments or already-modeled recurring/MSI commitments are retained for context but are not automatically posted as spending. This prevents the classic financial-tracker achievement of counting the same peso twice and then wondering where one's salary went.

## Integration policy

- The workbook is a **secondary source**.
- Existing current app configuration wins when values conflict.
- Rows already represented by recurring/MSI/debt logic are not imported again.
- Ambiguous rows remain review/reference only.
- Only clearly unmodeled card purchases are import candidates.
- A candidate requires explicit user confirmation and a real transaction date.
- Imported rows use `source=legacy_tracker` plus a stable `sourceImportId` for duplicate prevention.
- The original workbook is not modified.
