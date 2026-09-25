-- Personal Finance OS v0.2 enterprise foundation
-- Additive migration over 001_initial.sql. No destructive operations.

alter table accounts add column if not exists last4 char(4);
alter table accounts add column if not exists display_order int not null default 0;
alter table accounts add column if not exists archived_at timestamptz;

alter table statements add column if not exists total_debt_balance numeric(14,2);
alter table statements add column if not exists data_quality text not null default 'official' check(data_quality in ('official','derived','inconsistent','estimated'));
alter table statements add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table transactions add column if not exists updated_at timestamptz not null default now();
alter table transactions add column if not exists deleted_at timestamptz;
alter table transactions add column if not exists statement_id uuid references statements(id);
alter table transactions add column if not exists transfer_group_id uuid;
alter table transactions add column if not exists recurring_rule_id uuid references recurring_rules(id);

-- Versioned card rules: bank rules and the user's preferred payment behavior can change over time.
create table if not exists card_rule_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  valid_from date not null,
  valid_to date,
  statement_close_day smallint not null check(statement_close_day between 1 and 31),
  due_rule_type text not null check(due_rule_type in ('days_after_close','fixed_day','manual')),
  due_rule_value smallint,
  preferred_pay_day smallint check(preferred_pay_day between 1 and 31),
  default_apr numeric(9,6),
  interest_day_basis smallint not null default 360 check(interest_day_basis in (360,365)),
  interest_tax_rate numeric(9,6) not null default 0.16,
  source text not null default 'manual' check(source in ('manual','statement','bank_import')),
  created_at timestamptz not null default now(),
  check(valid_to is null or valid_to >= valid_from),
  unique(account_id, valid_from)
);
create index if not exists ix_card_rules_effective on card_rule_versions(account_id, valid_from desc);

-- Persisted transaction projections make forecasts auditable and allow official statements to override them later.
create table if not exists transaction_projections (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  card_rule_version_id uuid references card_rule_versions(id),
  projected_closing_date date not null,
  projected_legal_due_date date not null,
  projected_pay_date date not null,
  projected_payment_month date not null,
  projection_version int not null default 1,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(transaction_id, projection_version)
);
create index if not exists ix_tx_projection_paydate on transaction_projections(projected_pay_date) where superseded_at is null;

-- Link two sides of a transfer/payment so cash outflow is not counted again as spending.
create table if not exists transfer_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_transaction_id uuid not null references transactions(id) on delete cascade,
  destination_transaction_id uuid references transactions(id) on delete cascade,
  amount numeric(14,2) not null check(amount > 0),
  transfer_type text not null check(transfer_type in ('account_transfer','credit_card_payment','wallet_transfer','debt_payment')),
  status text not null default 'confirmed' check(status in ('suggested','confirmed','rejected')),
  created_at timestamptz not null default now(),
  check(source_transaction_id <> destination_transaction_id)
);
create index if not exists ix_transfer_source on transfer_links(source_transaction_id);
create index if not exists ix_transfer_destination on transfer_links(destination_transaction_id);

-- Allocate payments explicitly across statement balance, installment plans, fees or principal.
create table if not exists payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null references transactions(id) on delete cascade,
  statement_id uuid references statements(id) on delete cascade,
  plan_id uuid references installment_plans(id) on delete cascade,
  allocation_type text not null check(allocation_type in ('statement','scheduled_installment','extra_principal','interest','tax','fee','revolving_principal')),
  amount numeric(14,2) not null check(amount > 0),
  created_at timestamptz not null default now(),
  check(statement_id is not null or plan_id is not null)
);
create index if not exists ix_payment_alloc_payment on payment_allocations(payment_transaction_id);
create index if not exists ix_payment_alloc_plan on payment_allocations(plan_id);

-- Store raw parsed rows before they become canonical transactions.
create table if not exists import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imports(id) on delete cascade,
  row_no int,
  occurred_on date,
  posted_on date,
  description text,
  amount numeric(14,2),
  direction text check(direction in ('debit','credit')),
  external_id text,
  parsed_data jsonb not null default '{}'::jsonb,
  review_status text not null default 'unreviewed' check(review_status in ('unreviewed','matched','new','ignored','conflict')),
  created_at timestamptz not null default now()
);
create index if not exists ix_import_rows_review on import_rows(import_id, review_status);

create table if not exists reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  import_row_id uuid not null references import_rows(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  match_score numeric(5,4) not null check(match_score between 0 and 1),
  match_reason jsonb not null default '{}'::jsonb,
  decision text not null default 'suggested' check(decision in ('suggested','accepted','rejected')),
  decided_at timestamptz,
  unique(import_row_id, transaction_id)
);
create index if not exists ix_reconciliation_row on reconciliation_matches(import_row_id, match_score desc);

-- Recurring rule occurrences separate expected charges from actual matched transactions.
create table if not exists recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  recurring_rule_id uuid not null references recurring_rules(id) on delete cascade,
  expected_on date not null,
  expected_amount numeric(14,2) not null,
  matched_transaction_id uuid references transactions(id),
  status text not null default 'expected' check(status in ('expected','matched','skipped','overdue')),
  unique(recurring_rule_id, expected_on)
);
create index if not exists ix_recurring_occurrence_date on recurring_occurrences(expected_on, status);

-- Merchant normalization and categorization rules.
create table if not exists merchant_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  raw_pattern text not null,
  normalized_merchant text not null,
  category_id uuid references categories(id),
  priority int not null default 100,
  active boolean not null default true,
  unique(user_id, raw_pattern)
);

create table if not exists categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  match_field text not null check(match_field in ('merchant','description','amount','account')),
  operator text not null check(operator in ('contains','equals','regex','gte','lte')),
  match_value text not null,
  category_id uuid not null references categories(id),
  priority int not null default 100,
  active boolean not null default true
);
create index if not exists ix_cat_rules_priority on categorization_rules(user_id, active, priority);

-- Point-in-time balances provide reconciliation anchors without replacing transaction history.
create table if not exists balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  snapshot_date date not null,
  balance numeric(14,2) not null,
  available_credit numeric(14,2),
  source text not null check(source in ('manual','statement','bank_import','computed')),
  statement_id uuid references statements(id),
  created_at timestamptz not null default now(),
  unique(account_id, snapshot_date, source)
);

-- Reproducible forecast runs. UI dashboards can query latest run instead of recomputing every card on every render.
create table if not exists forecast_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  as_of_date date not null,
  horizon_end date not null,
  engine_version text not null,
  assumptions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists forecast_items (
  id uuid primary key default gen_random_uuid(),
  forecast_run_id uuid not null references forecast_runs(id) on delete cascade,
  item_date date not null,
  item_type text not null check(item_type in ('income','fixed_expense','variable_budget','card_payment','installment','interest','tax','transfer','goal_contribution')),
  amount numeric(14,2) not null,
  account_id uuid references accounts(id),
  source_entity_type text,
  source_entity_id uuid,
  description text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists ix_forecast_items_date on forecast_items(forecast_run_id,item_date);

-- Auditable mutation trail: recalculations and reconciliation decisions should be inspectable.
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  actor text not null default 'user' check(actor in ('user','system','import','copilot')),
  occurred_at timestamptz not null default now()
);
create index if not exists ix_audit_entity on audit_events(entity_type, entity_id, occurred_at desc);

create table if not exists user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  month_start_day smallint not null default 1 check(month_start_day between 1 and 28),
  variable_spend_target numeric(14,2),
  emergency_fund_months numeric(5,2) not null default 3,
  max_msi_income_ratio numeric(7,6) not null default 0.15,
  max_credit_utilization numeric(7,6) not null default 0.30,
  updated_at timestamptz not null default now()
);

-- Helpful analytical views. These are derived and never the source of truth.
create or replace view v_active_interest_debt as
select
  p.user_id,
  p.account_id,
  p.id as plan_id,
  p.name,
  p.current_principal,
  p.apr,
  p.scheduled_payment,
  p.remaining_installments
from installment_plans p
where p.status='active' and p.apr > 0 and p.current_principal > 0;

create or replace view v_monthly_fixed_net as
select
  user_id,
  sum(
    case frequency
      when 'monthly' then amount - offset_income
      when 'bimonthly' then (amount - offset_income) / 2
      when 'annual' then (amount - offset_income) / 12
      when 'every_n_days' then (amount - offset_income) * 30.4375 / nullif(interval_value,0)
      else 0
    end
  )::numeric(14,2) as monthly_equivalent
from recurring_rules
where active
  and (end_date is null or end_date >= current_date)
group by user_id;
