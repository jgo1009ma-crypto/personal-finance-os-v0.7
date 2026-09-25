const http=require('http');
const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawnSync}=require('child_process');
const {randomUUID}=require('crypto');
const {FinanceService,CopilotService}=require('./dist/api/src');
const {cards:seedCards,debtPlans,recurring:seedRecurring,incomeRules,installmentCommitments,defaultPreferences}=require('./dist/core/src/seed');
const {cardSnapshots:seedSnapshots}=require('./dist/api/src/financial-snapshots');

const ROOT=path.resolve(__dirname,'..');
const WEB=path.join(ROOT,'web');
const DATA_DIR=path.join(ROOT,'data');
const DATA_FILE=path.join(DATA_DIR,'user-data.json');
function loadDotEnv(){const file=path.join(ROOT,'.env');if(!fs.existsSync(file))return;for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const i=line.indexOf('=');if(i<1)continue;const key=line.slice(0,i).trim(),value=line.slice(i+1).trim().replace(/^['"]|['"]$/g,'');if(process.env[key]===undefined)process.env[key]=value;}}
loadDotEnv();
fs.mkdirSync(DATA_DIR,{recursive:true});

function clone(v){return structuredClone(v)}
function defaultData(){return {version:6,cards:clone(seedCards).map(c=>({...c,status:c.status||'active'})),snapshots:clone(seedSnapshots),transactions:[],recurringOverrides:[],imports:[],copilotSessions:[],preferences:clone(defaultPreferences)};}
function loadData(){
  try{
    const raw=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    const d=defaultData();
    const migrated={...d,...raw,cards:Array.isArray(raw.cards)?raw.cards:d.cards,snapshots:Array.isArray(raw.snapshots)?raw.snapshots:d.snapshots,transactions:Array.isArray(raw.transactions)?raw.transactions:[],recurringOverrides:Array.isArray(raw.recurringOverrides)?raw.recurringOverrides:[],imports:Array.isArray(raw.imports)?raw.imports:[],copilotSessions:Array.isArray(raw.copilotSessions)?raw.copilotSessions:[],preferences:{...d.preferences,...(raw.preferences||{})},version:6};
    // v0.5: Liverpool closes on the 27th and is paid on the 27th of the following month (month in arrears), not on the user's generic day 30.
    if(Number(raw.version||0)<5){
      const liv=migrated.cards.find(c=>c.id==='liverpool');if(liv){liv.dueRule={type:'fixed_day',day:27};delete liv.personalPayDay;}
      const snap=migrated.snapshots.find(x=>x.cardId==='liverpool');if(snap&&snap.statementDate==='2026-09-15')snap.statementDate='2026-08-27';
    }
    return migrated;
  }catch(_){return defaultData();}
}
function saveData(data){const tmp=DATA_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,DATA_FILE);}
const data=loadData();saveData(data);

const repo={
  async listCards(includeArchived=false){return clone(data.cards.filter(c=>includeArchived||(c.status||'active')==='active'))},
  async getCard(id){return clone(data.cards.find(c=>c.id===id))},
  async saveCard(card){data.cards.push(clone(card));saveData(data)},
  async updateCard(card){const i=data.cards.findIndex(c=>c.id===card.id);if(i<0)throw new Error('Card not found');data.cards[i]=clone(card);saveData(data)},
  async listCardSnapshots(){return clone(data.snapshots)},
  async getCardSnapshot(id){return clone(data.snapshots.find(s=>s.cardId===id))},
  async upsertCardSnapshot(s){const i=data.snapshots.findIndex(x=>x.cardId===s.cardId);if(i<0)data.snapshots.push(clone(s));else data.snapshots[i]=clone(s);saveData(data)},
  async listDebtPlans(){return clone(debtPlans)},
  async getDebtPlan(id){return clone(debtPlans.find(p=>p.id===id))},
  async listIncomeRules(){return clone(incomeRules)},
  async listInstallmentCommitments(){return clone(installmentCommitments)},
  async getPreferences(){return clone(data.preferences)},
  async savePreferences(p){data.preferences=clone(p);saveData(data)},
  async listRecurring(includeArchived=false){return clone(seedRecurring.filter(r=>includeArchived||(r.status||'active')==='active'))},
  async listRecurringOverrides(){return clone(data.recurringOverrides)},
  async saveRecurringOverride(o){const i=data.recurringOverrides.findIndex(x=>x.recurringId===o.recurringId&&x.periodKey===o.periodKey);if(i<0)data.recurringOverrides.push(clone(o));else data.recurringOverrides[i]=clone(o);saveData(data)},
  async listTransactions(){return clone(data.transactions)},
  async saveTransaction(tx){data.transactions.push(clone(tx));saveData(data)},
  async listImports(){return clone(data.imports).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))},
  async getImport(id){return clone(data.imports.find(x=>x.id===id))},
  async saveImport(x){data.imports.push(clone(x));saveData(data)},
  async updateImport(x){const i=data.imports.findIndex(v=>v.id===x.id);if(i<0)throw new Error('Import not found');data.imports[i]=clone(x);saveData(data)}
};
const service=new FinanceService(repo);
const copilot=new CopilotService(service,{
  apiKey:process.env.OPENAI_API_KEY,
  model:process.env.OPENAI_MODEL||'gpt-5.6-terra',
  reasoningEffort:process.env.OPENAI_REASONING_EFFORT||'medium',
  baseUrl:process.env.OPENAI_BASE_URL||'https://api.openai.com/v1'
});
function newCopilotSession(){const now=new Date().toISOString();return {id:randomUUID(),title:'Nueva conversación',createdAt:now,updatedAt:now,messages:[]};}
function saveCopilotSession(session){const i=data.copilotSessions.findIndex(x=>x.id===session.id);if(i<0)data.copilotSessions.unshift(session);else data.copilotSessions[i]=session;data.copilotSessions=data.copilotSessions.slice(0,50);saveData(data);}
function sessionSummary(s){return {id:s.id,title:s.title,createdAt:s.createdAt,updatedAt:s.updatedAt,messageCount:s.messages.length};}


function json(res,status,payload){const body=JSON.stringify(payload,null,2);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store'});res.end(body);}
function jsonBody(req,limit=1_000_000){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>limit){reject(new Error('Payload too large'));req.destroy();}});req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch(_){reject(new Error('Invalid JSON'));}});req.on('error',reject);});}
function bufferBody(req,limit=20_000_000){return new Promise((resolve,reject)=>{const chunks=[];let size=0;req.on('data',c=>{size+=c.length;if(size>limit){reject(new Error('File too large (20 MB max)'));req.destroy();return;}chunks.push(c);});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);});}
function extractText(buffer,contentType,filename){
  if(contentType.includes('text/plain')||filename.toLowerCase().endsWith('.txt'))return buffer.toString('utf8');
  if(!contentType.includes('pdf')&&!filename.toLowerCase().endsWith('.pdf'))throw new Error('Phase 4 accepts PDF or TXT statements');
  const tmp=path.join(os.tmpdir(),`finance-${randomUUID()}.pdf`);fs.writeFileSync(tmp,buffer);
  try{
    const out=spawnSync('pdftotext',['-layout',tmp,'-'],{encoding:'utf8',maxBuffer:15_000_000});
    if(out.error||out.status!==0)throw new Error('PDF text extraction is unavailable. Upload a TXT export or install pdftotext.');
    if(!out.stdout.trim())throw new Error('The PDF contains no extractable text and may require OCR.');
    return out.stdout;
  }finally{try{fs.unlinkSync(tmp)}catch(_){}}
}
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
function staticFile(req,res,urlPath){const rel=urlPath==='/'?'index.html':urlPath.replace(/^\//,'');const file=path.resolve(WEB,rel);if(!file.startsWith(WEB+path.sep)&&file!==path.join(WEB,'index.html'))return false;if(!fs.existsSync(file)||!fs.statSync(file).isFile())return false;const ext=path.extname(file);const content=fs.readFileSync(file);res.writeHead(200,{'content-type':MIME[ext]||'application/octet-stream','content-length':content.length,'cache-control':ext==='.html'?'no-store':'public, max-age=60'});res.end(content);return true;}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')){
      if(req.method==='GET'&&url.pathname==='/api/v1/health')return json(res,200,{ok:true,version:'0.6.0',storage:'local-json',statementExtraction:'pdftotext-adapter'});
      if(req.method==='GET'&&url.pathname==='/api/v1/bootstrap')return json(res,200,await service.bootstrap());
      if(req.method==='GET'&&url.pathname==='/api/v1/overview')return json(res,200,await service.overview(url.searchParams.get('asOf')||new Date().toISOString().slice(0,10)));

      if(req.method==='GET'&&url.pathname==='/api/v1/cards')return json(res,200,await service.listCards(url.searchParams.get('includeArchived')==='true'));
      if(req.method==='POST'&&url.pathname==='/api/v1/cards')return json(res,201,await service.createCard(await jsonBody(req)));
      const card=url.pathname.match(/^\/api\/v1\/cards\/([^/]+)$/);
      if(req.method==='GET'&&card)return json(res,200,await service.cardDashboard(card[1]));
      if(req.method==='PATCH'&&card)return json(res,200,await service.updateCard(card[1],await jsonBody(req)));
      if(req.method==='DELETE'&&card)return json(res,200,await service.archiveCard(card[1]));
      const restore=url.pathname.match(/^\/api\/v1\/cards\/([^/]+)\/restore$/);
      if(req.method==='POST'&&restore)return json(res,200,await service.restoreCard(restore[1]));

      if(req.method==='GET'&&url.pathname==='/api/v1/transactions')return json(res,200,await service.listTransactions());
      if(req.method==='POST'&&url.pathname==='/api/v1/transactions')return json(res,201,await service.createTransaction(await jsonBody(req)));
      const purchase=url.pathname.match(/^\/api\/v1\/cards\/([^/]+)\/project-purchase$/);
      if(req.method==='POST'&&purchase){const b=await jsonBody(req);return json(res,200,await service.projectPurchase({...b,cardId:purchase[1]}));}

      if(req.method==='GET'&&url.pathname==='/api/v1/debt-plans')return json(res,200,await service.listDebtPlans());
      const sim=url.pathname.match(/^\/api\/v1\/debt-plans\/([^/]+)\/simulate-extra-payment$/);
      if(req.method==='POST'&&sim){const b=await jsonBody(req);return json(res,200,await service.simulateExtraPayment(sim[1],Number(b.amount)));}

      if(req.method==='GET'&&url.pathname==='/api/v1/preferences')return json(res,200,await service.getPreferences());
      if(req.method==='PUT'&&url.pathname==='/api/v1/preferences')return json(res,200,await service.updatePreferences(await jsonBody(req)));
      if(req.method==='GET'&&url.pathname==='/api/v1/forecast')return json(res,200,await service.forecast({asOf:url.searchParams.get('asOf')||new Date().toISOString().slice(0,10),horizonMonths:url.searchParams.get('months')?Number(url.searchParams.get('months')):undefined,openingCash:url.searchParams.get('openingCash')?Number(url.searchParams.get('openingCash')):undefined,variableSpendTarget:url.searchParams.get('variable')?Number(url.searchParams.get('variable')):undefined}));
      if(req.method==='POST'&&url.pathname==='/api/v1/scenarios/simulate')return json(res,200,await service.simulateScenario(await jsonBody(req)));
      if(req.method==='GET'&&url.pathname==='/api/v1/recurring')return json(res,200,await service.listRecurring());
      if(req.method==='GET'&&url.pathname==='/api/v1/recurring/month')return json(res,200,await service.recurringForMonth(url.searchParams.get('month')||new Date().toISOString().slice(0,7)));
      const recurringOverride=url.pathname.match(/^\/api\/v1\/recurring\/([^/]+)\/overrides\/([^/]+)$/);
      if(req.method==='PUT'&&recurringOverride){const b=await jsonBody(req);return json(res,200,await service.setRecurringOverride(recurringOverride[1],decodeURIComponent(recurringOverride[2]),Number(b.amount),b.note));}

      if(req.method==='GET'&&url.pathname==='/api/v1/imports')return json(res,200,await service.listImports());
      if(req.method==='POST'&&url.pathname==='/api/v1/imports'){
        const cardId=url.searchParams.get('cardId');if(!cardId)throw new Error('cardId is required');
        const filename=url.searchParams.get('filename')||'statement.pdf';const buf=await bufferBody(req);const text=extractText(buf,String(req.headers['content-type']||''),filename);
        return json(res,201,await service.createImport(cardId,filename,text));
      }
      const imp=url.pathname.match(/^\/api\/v1\/imports\/([^/]+)$/);
      if(req.method==='GET'&&imp)return json(res,200,await service.getImport(imp[1]));
      const resolve=url.pathname.match(/^\/api\/v1\/imports\/([^/]+)\/rows\/([^/]+)$/);
      if(req.method==='PATCH'&&resolve){const b=await jsonBody(req);return json(res,200,await service.resolveImportRow(resolve[1],resolve[2],b.action,b.transactionId));}
      const commit=url.pathname.match(/^\/api\/v1\/imports\/([^/]+)\/commit$/);
      if(req.method==='POST'&&commit)return json(res,200,await service.commitImport(commit[1]));

      if(req.method==='GET'&&url.pathname==='/api/v1/copilot/status')return json(res,200,{...copilot.status(),privacy:'API key stays server-side; chat history is stored locally in data/user-data.json.'});
      if(req.method==='GET'&&url.pathname==='/api/v1/copilot/sessions')return json(res,200,data.copilotSessions.map(sessionSummary));
      if(req.method==='POST'&&url.pathname==='/api/v1/copilot/sessions'){const session=newCopilotSession();saveCopilotSession(session);return json(res,201,session);}
      const copilotSession=url.pathname.match(/^\/api\/v1\/copilot\/sessions\/([^/]+)$/);
      if(req.method==='GET'&&copilotSession){const session=data.copilotSessions.find(x=>x.id===copilotSession[1]);if(!session)throw new Error('Copilot session not found');return json(res,200,session);}
      if(req.method==='DELETE'&&copilotSession){const i=data.copilotSessions.findIndex(x=>x.id===copilotSession[1]);if(i<0)throw new Error('Copilot session not found');data.copilotSessions.splice(i,1);saveData(data);return json(res,200,{deleted:true});}
      if(req.method==='POST'&&url.pathname==='/api/v1/copilot/chat'){const b=await jsonBody(req);const message=String(b.message||'').trim();if(!message)throw new Error('message is required');let session=b.sessionId?data.copilotSessions.find(x=>x.id===b.sessionId):undefined;if(!session){session=newCopilotSession();data.copilotSessions.unshift(session);}
        const history=session.messages.filter(m=>m.role==='user'||m.role==='assistant').slice(-12).map(m=>({role:m.role,content:m.content}));const now=new Date().toISOString();session.messages.push({id:randomUUID(),role:'user',content:message,createdAt:now});if(session.title==='Nueva conversación')session.title=message.replace(/\s+/g,' ').slice(0,52)+(message.length>52?'…':'');session.updatedAt=now;saveCopilotSession(session);
        const answer=await copilot.chat(history,message);const assistant={id:randomUUID(),role:'assistant',content:answer.content,createdAt:new Date().toISOString(),provider:answer.provider,model:answer.model,toolTrace:answer.toolTrace,warnings:answer.warnings};session.messages.push(assistant);session.updatedAt=assistant.createdAt;saveCopilotSession(session);return json(res,200,{session:sessionSummary(session),message:assistant,status:copilot.status()});}

      if(req.method==='GET'&&url.pathname==='/api/v1/reports/payment-month-spend')return json(res,200,{month:url.searchParams.get('month'),amount:await service.paymentMonthSpend(url.searchParams.get('month'))});
      return json(res,404,{error:{code:'NOT_FOUND',message:'Route not found'}});
    }
    if(staticFile(req,res,url.pathname))return;return staticFile(req,res,'/');
  }catch(e){return json(res,400,{error:{code:'BAD_REQUEST',message:e.message||String(e)}});}
});
const port=Number(process.env.PORT||8787);server.listen(port,()=>console.log(`Personal Finance OS v0.6 listening on http://localhost:${port}`));
