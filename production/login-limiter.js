const {createHmac}=require('crypto');
const {neon}=require('@neondatabase/serverless');

// A shared PostgreSQL counter survives cold starts and parallel Vercel instances.
async function allowLogin(req,sql=neon(process.env.DATABASE_URL)){
  const ip=process.env.VERCEL?req.headers?.['x-forwarded-for']:req.socket?.remoteAddress;
  const key=createHmac('sha256',process.env.SESSION_SECRET).update(`${process.env.APP_STATE_ID||'primary'}:${ip||'unknown'}`).digest('hex');
  await sql`create table if not exists login_attempts (key text primary key, attempts integer not null, reset_at timestamptz not null)`;
  await sql`delete from login_attempts where reset_at < now() - interval '1 day'`;
  const rows=await sql`insert into login_attempts(key,attempts,reset_at) values(${key},1,now()+interval '15 minutes')
    on conflict(key) do update set attempts=case when login_attempts.reset_at<=now() then 1 else least(login_attempts.attempts+1,11) end,
    reset_at=case when login_attempts.reset_at<=now() then now()+interval '15 minutes' else login_attempts.reset_at end returning attempts`;
  return rows[0].attempts<=10;
}
module.exports={allowLogin};
