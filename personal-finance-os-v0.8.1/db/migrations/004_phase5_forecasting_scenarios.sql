-- Personal Finance OS v0.5
-- Forecasting, scenario simulation, planning preferences and reproducible debt projections.
-- Additive migration only.

alter table user_preferences add column if not exists liquid_cash_balance numeric(14,2) not null default 0;
alter table user_preferences add column if not exists emergency_fund_balance numeric(14,2) not null default 0;
alter table user_preferences add column if not exists forecast_horizon_months int not null default 12 check(forecast_horizon_months between 1 and 36);

-- Scenario inputs are persisted independently from canonical transactions. A simulation never mutates financial history.
create table if not exists scenario_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text,
  as_of_date date not null,
  horizon_end date not null,
  opening_cash numeric(14,2) not null default 0,
  variable_spend_target numeric(14,2) not null default 0,
  input jsonb not null default '{}'::jsonb,
  baseline_metrics jsonb not null default '{}'::jsonb,
  scenario_metrics jsonb not null default '{}'::jsonb,
  deltas jsonb not null default '{}'::jsonb,
  engine_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_scenario_runs_user_created on scenario_runs(user_id,created_at desc);

-- Explicit planning commitments derived from statements can be audited even before full plan extraction is available.
create table if not exists planning_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  name text not null,
  commitment_type text not null check(commitment_type in ('msi','subscription_installment','manual')),
  monthly_amount numeric(14,2) not null,
  remaining_payments int not null check(remaining_payments >= 0),
  next_payment_date date not null,
  data_quality text not null default 'official' check(data_quality in ('official','derived','estimated','inconsistent')),
  source_statement_id uuid references statements(id) on delete set null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_planning_commitments_due on planning_commitments(user_id,active,next_payment_date);

-- Forecast items already exist from v0.2. Add scenario linkage and confidence without replacing historical runs.
alter table forecast_runs add column if not exists scenario_run_id uuid references scenario_runs(id) on delete set null;
alter table forecast_items add column if not exists confidence text not null default 'estimated' check(confidence in ('official','derived','estimated'));

comment on table scenario_runs is 'What-if calculations only. Never used as canonical transactions until the user explicitly records a real event.';
comment on table planning_commitments is 'Known future installments used by the planning engine when statement plan-level data is available.';
