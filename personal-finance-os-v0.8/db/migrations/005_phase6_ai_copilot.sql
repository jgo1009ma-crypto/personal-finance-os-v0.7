-- Phase 6: AI Financial Copilot persistence and audit trail
-- API credentials are NEVER stored in the database. They stay in server environment variables / secret storage.

create table if not exists copilot_sessions (
  id uuid primary key,
  user_id uuid null,
  title text not null,
  provider text not null default 'local' check (provider in ('local','openai')),
  model text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);

create table if not exists copilot_messages (
  id uuid primary key,
  session_id uuid not null references copilot_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  provider text null check (provider is null or provider in ('local','openai')),
  model text null,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists copilot_tool_calls (
  id bigserial primary key,
  message_id uuid not null references copilot_messages(id) on delete cascade,
  ordinal integer not null,
  tool_name text not null,
  arguments jsonb not null default '{}'::jsonb,
  result_summary text null,
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  unique(message_id, ordinal)
);

create index if not exists idx_copilot_sessions_updated on copilot_sessions(updated_at desc);
create index if not exists idx_copilot_messages_session_created on copilot_messages(session_id, created_at);
create index if not exists idx_copilot_tool_calls_message on copilot_tool_calls(message_id, ordinal);

comment on table copilot_sessions is 'Read-only financial copilot conversation sessions. API secrets are not persisted here.';
comment on table copilot_tool_calls is 'Audit-friendly trace of deterministic financial tools invoked by the copilot. Full tool results are not required to be persisted.';
