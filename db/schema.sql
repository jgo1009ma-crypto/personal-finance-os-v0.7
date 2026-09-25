-- Personal Finance OS schema v0.1
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  currency char(3) not null default 'MXN',
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now()
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('cash','checking','savings','credit_card','wallet')),
  institution text,
  currency char(3) not null default 'MXN',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists credit_cards (
  account_id uuid primary key references accounts(id) on delete cascade,
  credit_limit numeric(14,2) not null,
  statement_close_day smallint not null check(statement_close_day between 1 and 31),
  due_rule_type text not null check(due_rule_type in ('days_after_close','fixed_day','manual')),
  due_rule_value smallint,
  preferred_pay_day smallint,
  default_apr numeric(9,6),
  interest_day_basis smallint not null default 360 check(interest_day_basis in (360,365)),
  interest_tax_rate numeric(9,6) not null default 0.16
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  parent_id uuid references categories(id),
  essential boolean not null default false,
  unique(user_id,name)
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references accounts(id),
  occurred_on date not null,
  posted_on date,
  description text not null,
  merchant text,
  amount numeric(14,2) not null check(amount >= 0),
  direction text not null check(direction in ('debit','credit')),
  kind text not null check(kind in ('purchase','refund','payment','fee','interest','cash_advance','subscription','transfer','income')),
  financing_kind text not null default 'regular' check(financing_kind in ('regular','msi','interest_plan','revolver')),
  category_id uuid references categories(id),
  external_id text,
  source text not null default 'manual' check(source in ('manual','pdf_import','bank_import','rule')),
  status text not null default 'posted' check(status in ('pending','posted','reconciled','void')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_tx_user_date on transactions(user_id,occurred_on);
create index if not exists ix_tx_account_date on transactions(account_id,occurred_on);
create unique index if not exists ux_tx_external on transactions(account_id,external_id) where external_id is not null;

create table if not exists statements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  period_start date,
  period_end date,
  closing_date date not null,
  due_date date not null,
  statement_balance numeric(14,2),
  payment_to_avoid_interest numeric(14,2),
  minimum_payment numeric(14,2),
  official_interest numeric(14,2),
  official_fees numeric(14,2),
  reconciled boolean not null default false,
  source_document_id text,
  unique(account_id,closing_date)
);

create table if not exists statement_transactions (
  statement_id uuid not null references statements(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  primary key(statement_id, transaction_id)
);

create table if not exists installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references accounts(id),
  source_transaction_id uuid references transactions(id),
  name text not null,
  plan_type text not null check(plan_type in ('msi','interest_plan','cash_advance')),
  original_principal numeric(14,2) not null,
  current_principal numeric(14,2) not null,
  apr numeric(9,6) not null default 0,
  tax_rate numeric(9,6) not null default 0.16,
  day_basis smallint not null default 360 check(day_basis in (360,365)),
  original_installments int not null,
  remaining_installments int not null,
  scheduled_payment numeric(14,2),
  start_date date not null,
  status text not null default 'active' check(status in ('active','paid','cancelled')),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists installment_schedule (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references installment_plans(id) on delete cascade,
  installment_no int not null,
  due_date date not null,
  opening_principal numeric(14,2) not null,
  interest numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  principal numeric(14,2) not null,
  payment numeric(14,2) not null,
  closing_principal numeric(14,2) not null,
  status text not null default 'scheduled' check(status in ('scheduled','paid','superseded')),
  unique(plan_id,installment_no,status)
);

create table if not exists debt_payments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references installment_plans(id),
  transaction_id uuid references transactions(id),
  paid_on date not null,
  amount numeric(14,2) not null,
  principal_amount numeric(14,2),
  interest_amount numeric(14,2),
  tax_amount numeric(14,2),
  is_extra_principal boolean not null default false
);

create table if not exists recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  amount numeric(14,2) not null,
  frequency text not null check(frequency in ('monthly','bimonthly','every_n_days','annual','one_time')),
  interval_value int,
  start_date date not null,
  end_date date,
  account_id uuid references accounts(id),
  category_id uuid references categories(id),
  offset_income numeric(14,2) not null default 0,
  active boolean not null default true
);

create table if not exists income_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  amount numeric(14,2) not null,
  frequency text not null check(frequency in ('monthly','semimonthly','one_time','annual')),
  day_1 smallint,
  day_2 smallint,
  start_date date not null,
  end_date date
);

create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  category_id uuid references categories(id),
  month date not null,
  amount numeric(14,2) not null,
  unique(user_id,category_id,month)
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  goal_type text not null check(goal_type in ('emergency_fund','debt_payoff','savings','purchase')),
  target_amount numeric(14,2) not null,
  current_amount numeric(14,2) not null default 0,
  target_date date,
  priority int not null default 3
);

create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  filename text not null,
  provider text,
  imported_at timestamptz not null default now(),
  checksum text,
  status text not null default 'pending' check(status in ('pending','parsed','reviewed','committed','failed')),
  raw_summary jsonb not null default '{}'::jsonb
);
