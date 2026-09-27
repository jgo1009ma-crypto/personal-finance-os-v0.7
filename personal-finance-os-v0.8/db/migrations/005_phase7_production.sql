-- Personal Finance OS v0.7 production persistence.
-- The existing normalized finance schema remains available for future analytics.
-- v0.7 stores the complete application aggregate as JSONB to preserve exact v0.6 semantics
-- while moving persistence from local disk to durable Postgres.

create table if not exists app_state (
  id text primary key,
  state jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  id bigserial primary key,
  state_id text not null references app_state(id) on delete cascade,
  event_type text not null,
  revision bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_audit_events_state_created
  on audit_events(state_id, created_at desc);

-- Operational snapshots are useful before importing statements or large edits.
create table if not exists state_backups (
  id bigserial primary key,
  state_id text not null references app_state(id) on delete cascade,
  revision bigint not null,
  state jsonb not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists ix_state_backups_state_created
  on state_backups(state_id, created_at desc);
