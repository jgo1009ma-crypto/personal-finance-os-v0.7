-- Personal Finance OS v0.4
-- Card lifecycle, recurring amount overrides, and statement reconciliation metadata.
-- Additive only. No destructive operations.

alter table imports add column if not exists account_id uuid references accounts(id);
alter table imports add column if not exists parser_version text;
alter table imports add column if not exists committed_at timestamptz;
create index if not exists ix_imports_account_date on imports(account_id, imported_at desc);

alter table import_rows add column if not exists fingerprint text;
alter table import_rows add column if not exists match_confidence numeric(5,4) check(match_confidence between 0 and 1);
alter table import_rows add column if not exists matched_transaction_id uuid references transactions(id);
create index if not exists ix_import_rows_fingerprint on import_rows(import_id, fingerprint);

-- A recurring rule is the baseline; an override stores only the actual amount
-- for one month/occurrence so historical months remain immutable.
create table if not exists recurring_overrides (
  id uuid primary key default gen_random_uuid(),
  recurring_rule_id uuid not null references recurring_rules(id) on delete cascade,
  period_key text not null,
  amount numeric(14,2) not null check(amount >= 0),
  note text,
  source text not null default 'manual' check(source in ('manual','statement','bank_import','rule')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(recurring_rule_id, period_key),
  check(period_key ~ '^\\d{4}-\\d{2}(-\\d{2})?$')
);
create index if not exists ix_recurring_overrides_period on recurring_overrides(period_key, recurring_rule_id);

-- Archiving an account is the canonical "remove from active use" operation.
-- We never cascade-delete a card just because the user stops using it.
create index if not exists ix_accounts_active on accounts(user_id, active, archived_at);

-- Optional audit events for the new mutations.
comment on table recurring_overrides is 'Period-specific actual amounts layered over immutable recurring baselines.';
comment on column accounts.archived_at is 'Archive date. Historical transactions and statements remain queryable.';
