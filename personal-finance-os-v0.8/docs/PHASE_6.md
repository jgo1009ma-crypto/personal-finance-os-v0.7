# Phase 6 — AI Financial Copilot

Version: **v0.6.0**

## Objective

Add a conversational layer without moving financial arithmetic into the language model. The model may choose which deterministic finance tool to call, but balances, billing cycles, interest savings, cash flow and scenario math continue to come from the existing engine.

## Architecture

```text
Browser chat
    ↓
/api/v1/copilot/chat
    ↓
CopilotService
    ├── Local deterministic fallback (no API key)
    └── OpenAI Responses API (optional)
            ↓ function calls
       FinanceService tools
            ↓
       deterministic engine
```

The Copilot is intentionally **read-only** in v0.6. It cannot create transactions, pay cards, archive cards or modify recurring expenses. Mutations remain explicit UI actions.

## OpenAI integration

The external provider is optional. Configure in the project root `.env`:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=medium
```

The implementation uses the Responses API and strict function schemas. Tool calling is sequential (`parallel_tool_calls=false`) to make audit traces predictable. `store=false` is sent on API calls from this application.

No API key is sent to the browser or written to `data/user-data.json`.

## Tools exposed to the model

- `get_financial_overview`
- `get_cash_flow_forecast`
- `list_cards`
- `get_card`
- `list_debt_plans`
- `simulate_extra_payment`
- `simulate_scenario`
- `get_recurring_month`
- `search_transactions`
- `get_payment_month_spend`
- `get_preferences`

The tool surface deliberately stays small. The language model is not allowed direct database access.

## Accuracy rules

The system prompt requires the Copilot to:

- use tools before making user-specific quantitative claims;
- let deterministic code perform financial calculations;
- distinguish official, derived, estimated and assumed data;
- surface relevant forecast warnings;
- never count card payments as new spending;
- respect the Liverpool 27th-to-27th month-in-arrears rule;
- never claim a mutation occurred;
- never request full card PAN/CVV or banking credentials.

## Local fallback

If `OPENAI_API_KEY` is absent, the Copilot still runs in `local-finance-engine` mode. It can answer common structured questions about:

- debt and utilization;
- cash-flow forecast;
- interest-bearing debt;
- recurring expenses.

This mode has limited natural-language interpretation but uses the same deterministic finance engine.

## Conversation storage

Local prototype sessions are stored in `data/user-data.json` along with the rest of the local app state. Up to 50 recent sessions are retained. Each assistant message stores:

- provider and model;
- warnings;
- a compact tool trace;
- tool duration and result summary.

PostgreSQL migration `005_phase6_ai_copilot.sql` adds normalized tables for production persistence.

## UI

New `Copiloto` module includes:

- provider status (local/OpenAI);
- session list;
- new/delete conversation;
- prompt shortcuts;
- chat history;
- expandable internal data/tool trace;
- warnings and read-only disclosure.

## Tests

Phase 6 tests validate:

- local fallback uses the real FinanceService;
- forecast/debt intent routing;
- Responses API tool loop with a mocked provider;
- strict schemas;
- `store=false` and sequential tool calls;
- function-call outputs returned to the model;
- reasoning items preserved across tool-call turns.

The OpenAI network itself is not called by tests.
