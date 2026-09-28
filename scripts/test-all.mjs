import {spawnSync,spawn} from 'node:child_process';
import {readdirSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import http from 'node:http';
const root=fileURLToPath(new URL('../',import.meta.url));
function run(args){const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw Error(`Failed: ${args.join(' ')}`);}
run(['node_modules/typescript/bin/tsc','-p','core/tsconfig.json']);
run(['node_modules/typescript/bin/tsc','-p','server/tsconfig.json']);
run(['core/dist/test/billing.spec.js']);
for(const name of readdirSync(join(root,'server/dist/server/test')).filter(n=>n.endsWith('.spec.js')))run(['server/dist/server/test/'+name]);
run(['--test','test/audit.test.js']);
for(const folder of ['public','production','api'])for(const name of readdirSync(join(root,folder)).filter(n=>n.endsWith('.js')))run(['--check',`${folder}/${name}`]);
run(['--check','server/server.js']);
for(const file of ['package.json','vercel.json','public/manifest.webmanifest'])JSON.parse(readFileSync(join(root,file),'utf8'));

// Each run owns a fresh data directory. Never remove or overwrite the user's financial state.
const dir=mkdtempSync(join(tmpdir(),'pfos-test-'));
let child;
try{
  child=spawn(process.execPath,['server/server.js'],{cwd:root,env:{...process.env,PORT:'0',PFOS_DATA_DIR:dir,OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
  let output='';let errors='';child.stderr.on('data',c=>errors+=c);
  const port=await new Promise((ok,fail)=>{
    const timer=setTimeout(()=>fail(Error('Server startup timed out: '+errors)),15000);
    child.once('exit',()=>{clearTimeout(timer);fail(Error('Server exited: '+errors));});
    child.stdout.on('data',c=>{output+=c;const m=output.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);ok(m[1]);}});
  });
  const origin=`http://127.0.0.1:${port}`;
  const request=async(path,options={})=>{const response=await fetch(origin+path,options);return {response,body:await response.json()};};
  assert.equal((await request('/api/v1/health')).body.version,JSON.parse(readFileSync(join(root,'package.json'))).version);
  assert.equal((await fetch(origin)).status,200);
  assert.equal((await request('/api/v1/reports/legacy-tracker')).response.status,200);
  assert.ok(Array.isArray((await request('/api/v1/planning-summary?asOf=2026-09-27')).body.alerts));
  const account=await request('/api/v1/accounts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Smoke account',type:'savings',balance:1000})});
  assert.equal(account.response.status,201);assert.equal(account.body.balance,1000);
  const denied=await request('/api/v1/accounts',{method:'POST',headers:{origin:'https://attacker.test','content-type':'application/json'},body:'{}'});
  assert.equal(denied.response.status,403);
  const hostStatus=await new Promise((ok,fail)=>{const req=http.get(origin+'/api/v1/health',{headers:{host:'attacker.test'}},res=>{res.resume();ok(res.statusCode);});req.on('error',fail);});
  assert.equal(hostStatus,403);
  const invalid=await request('/api/v1/transactions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId:'nu',date:'2026-02-30',amount:100,description:'bad date'})});
  assert.equal(invalid.response.status,400);
  const persisted=JSON.parse(readFileSync(join(dir,'user-data.json'),'utf8'));
  assert.equal(persisted.accounts.length,1);assert.equal(persisted.transactions.length,0);
  await new Promise(resolve=>{child.once('exit',resolve);child.kill();});child=null;
  // Corrupt data must stop startup and remain byte-for-byte intact.
  writeFileSync(join(dir,'user-data.json'),'{invalid');
  const bad=spawnSync(process.execPath,['server/server.js'],{cwd:root,env:{...process.env,PFOS_DATA_DIR:dir},encoding:'utf8',timeout:5000});
  assert.notEqual(bad.status,0);assert.equal(readFileSync(join(dir,'user-data.json'),'utf8'),'{invalid');
  console.log('HTTP, origin, isolated persistence and corrupt-state protection: ok');
}finally{
  if(child)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
  assert.ok(resolve(dir).startsWith(resolve(tmpdir())));rmSync(dir,{recursive:true,force:true});
}
console.log('All tests passed');
