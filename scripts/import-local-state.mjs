import fs from 'node:fs/promises';
import process from 'node:process';
import { neon } from '@neondatabase/serverless';

const file=process.argv[2]||'data/user-data.json';
if(!process.env.DATABASE_URL){console.error('DATABASE_URL is required');process.exit(1)}
const raw=JSON.parse(await fs.readFile(file,'utf8'));
raw.version=7;
const sql=neon(process.env.DATABASE_URL);
await sql`create table if not exists app_state (id text primary key,state jsonb not null,revision bigint not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now())`;
const existing=await sql`select revision,state from app_state where id='primary'`;
if(existing.length){
  await sql`create table if not exists state_backups (id bigserial primary key,state_id text not null references app_state(id) on delete cascade,revision bigint not null,state jsonb not null,reason text,created_at timestamptz not null default now())`;
  await sql`insert into state_backups(state_id,revision,state,reason) values('primary',${Number(existing[0].revision)},${JSON.stringify(existing[0].state)}::jsonb,'automatic backup before local import')`;
  await sql`update app_state set state=${JSON.stringify(raw)}::jsonb,revision=revision+1,updated_at=now() where id='primary'`;
}else{
  await sql`insert into app_state(id,state,revision) values('primary',${JSON.stringify(raw)}::jsonb,1)`;
}
console.log(`Imported ${file} into app_state/primary.`);
