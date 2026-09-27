const {randomUUID}=require('crypto');
const {FinanceService,CopilotService}=require('../server/dist/server/src');
const {NeonStateStore,makeRepository}=require('../production/state-store');
const {sessionCookie,clearCookie,isAuthenticated,secureComparePassword,assertOrigin}=require('../production/auth');

function json(res,status,payload,extraHeaders={}){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');for(const [k,v] of Object.entries(extraHeaders))res.setHeader(k,v);res.end(JSON.stringify(payload));}
async function jsonBody(req,limit=1_000_000){if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;if(typeof req.body==='string')return req.body?JSON.parse(req.body):{};const chunks=[];let size=0;for await(const c of req){const b=Buffer.from(c);size+=b.length;if(size>limit)throw new Error('Payload too large');chunks.push(b);}const s=Buffer.concat(chunks).toString('utf8');return s?JSON.parse(s):{};}
async function bufferBody(req,limit=4_000_000){if(Buffer.isBuffer(req.body))return req.body;if(typeof req.body==='string')return Buffer.from(req.body);const chunks=[];let size=0;for await(const c of req){const b=Buffer.from(c);size+=b.length;if(size>limit)throw new Error('File too large for this deployment (4 MB max)');chunks.push(b);}return Buffer.concat(chunks);}
async function extractPdfText(buffer){const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=pdfjs.getDocument({data:new Uint8Array(buffer),disableWorker:true});const doc=await task.promise;const pages=[];for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n);const content=await page.getTextContent();const items=content.items||[];let line='',lastY=null;const lines=[];for(const item of items){const y=Math.round(item.transform?.[5]||0);if(lastY!==null&&Math.abs(y-lastY)>2){if(line.trim())lines.push(line.trim());line='';}line+=(line?' ':'')+String(item.str||'');lastY=y;}if(line.trim())lines.push(line.trim());pages.push(lines.join('\n'));}return pages.join('\n\n');}
async function extractText(buffer,contentType,filename){if(String(contentType).includes('text/plain')||filename.toLowerCase().endsWith('.txt'))return buffer.toString('utf8');if(!String(contentType).includes('pdf')&&!filename.toLowerCase().endsWith('.pdf'))throw new Error('Only PDF or TXT statements are accepted');const text=await extractPdfText(buffer);if(!text.trim())throw new Error('The PDF contains no extractable text and may require OCR.');return text;}
function newCopilotSession(){const now=new Date().toISOString();return {id:randomUUID(),title:'Nueva conversación',createdAt:now,updatedAt:now,messages:[]};}
function sessionSummary(s){return {id:s.id,title:s.title,createdAt:s.createdAt,updatedAt:s.updatedAt,messageCount:s.messages.length};}

module.exports=async function handler(req,res){
  try{
    const url=new URL(req.url,'https://pfos.local');const forwardedPath=url.searchParams.get('__path');if(forwardedPath){url.pathname='/api/'+String(forwardedPath).replace(/^\/+/, '');url.searchParams.delete('__path');}
    if(req.method==='GET'&&url.pathname==='/api/v1/health')return json(res,200,{ok:true,version:'0.8.0',storage:process.env.DATABASE_URL?'neon-postgres':'unconfigured',runtime:'vercel-node',statementExtraction:'pdfjs'});
    if(req.method==='GET'&&url.pathname==='/api/v1/auth/session')return json(res,200,{authenticated:isAuthenticated(req,process.env.SESSION_SECRET)});
    if(req.method==='POST'&&url.pathname==='/api/v1/auth/login'){
      const b=await jsonBody(req);if(!process.env.APP_PASSWORD||!process.env.SESSION_SECRET)throw new Error('Authentication is not configured');
      if(!secureComparePassword(String(b.password||''),process.env.APP_PASSWORD))return json(res,401,{error:{code:'UNAUTHORIZED',message:'Credenciales inválidas'}});
      return json(res,200,{authenticated:true},{'set-cookie':sessionCookie(process.env.SESSION_SECRET)});
    }
    if(req.method==='POST'&&url.pathname==='/api/v1/auth/logout')return json(res,200,{authenticated:false},{'set-cookie':clearCookie()});
    if(!isAuthenticated(req,process.env.SESSION_SECRET))return json(res,401,{error:{code:'UNAUTHORIZED',message:'Sesión requerida'}});
    assertOrigin(req);

    const store=new NeonStateStore(process.env.DATABASE_URL,process.env.APP_STATE_ID||'primary');
    const data=await store.load();
    const repo=makeRepository(store,data);
    const service=new FinanceService(repo);
    const copilot=new CopilotService(service,{apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL||'gpt-5.6-terra',reasoningEffort:process.env.OPENAI_REASONING_EFFORT||'medium',baseUrl:process.env.OPENAI_BASE_URL||'https://api.openai.com/v1'});
    const persistSession=async(session,event='copilot.session')=>{const i=data.copilotSessions.findIndex(x=>x.id===session.id);if(i<0)data.copilotSessions.unshift(session);else data.copilotSessions[i]=session;data.copilotSessions=data.copilotSessions.slice(0,50);await store.persist(event,{sessionId:session.id});};

    if(req.method==='GET'&&url.pathname==='/api/v1/bootstrap')return json(res,200,await service.bootstrap());
    if(req.method==='GET'&&url.pathname==='/api/v1/overview')return json(res,200,await service.overview(url.searchParams.get('asOf')||new Date().toISOString().slice(0,10)));
    if(req.method==='GET'&&url.pathname==='/api/v1/cards')return json(res,200,await service.listCards(url.searchParams.get('includeArchived')==='true'));
    if(req.method==='POST'&&url.pathname==='/api/v1/cards')return json(res,201,await service.createCard(await jsonBody(req)));
    const card=url.pathname.match(/^\/api\/v1\/cards\/([^/]+)$/);if(req.method==='GET'&&card)return json(res,200,await service.cardDashboard(card[1]));if(req.method==='PATCH'&&card)return json(res,200,await service.updateCard(card[1],await jsonBody(req)));if(req.method==='DELETE'&&card)return json(res,200,await service.archiveCard(card[1]));
    const restore=url.pathname.match(/^\/api\/v1\/cards\/([^/]+)\/restore$/);if(req.method==='POST'&&restore)return json(res,200,await service.restoreCard(restore[1]));
    if(req.method==='GET'&&url.pathname==='/api/v1/transactions')return json(res,200,await service.listTransactions());
    if(req.method==='POST'&&url.pathname==='/api/v1/transactions')return json(res,201,await service.createTransaction(await jsonBody(req)));
    const purchase=url.pathname.match(/^\/api\/v1\/cards\/([^/]+)\/project-purchase$/);if(req.method==='POST'&&purchase){const b=await jsonBody(req);return json(res,200,await service.projectPurchase({...b,cardId:purchase[1]}));}
    if(req.method==='GET'&&url.pathname==='/api/v1/debt-plans')return json(res,200,await service.listDebtPlans());
    const sim=url.pathname.match(/^\/api\/v1\/debt-plans\/([^/]+)\/simulate-extra-payment$/);if(req.method==='POST'&&sim){const b=await jsonBody(req);return json(res,200,await service.simulateExtraPayment(sim[1],Number(b.amount)));}
    if(req.method==='GET'&&url.pathname==='/api/v1/preferences')return json(res,200,await service.getPreferences());
    if(req.method==='PUT'&&url.pathname==='/api/v1/preferences')return json(res,200,await service.updatePreferences(await jsonBody(req)));
    if(req.method==='GET'&&url.pathname==='/api/v1/accounts')return json(res,200,await service.listAccounts(url.searchParams.get('includeArchived')==='true'));
    if(req.method==='POST'&&url.pathname==='/api/v1/accounts')return json(res,201,await service.createAccount(await jsonBody(req)));
    const account=url.pathname.match(/^\/api\/v1\/accounts\/([^/]+)$/);if(req.method==='PATCH'&&account)return json(res,200,await service.updateAccount(account[1],await jsonBody(req)));if(req.method==='DELETE'&&account)return json(res,200,await service.archiveAccount(account[1]));
    if(req.method==='GET'&&url.pathname==='/api/v1/goals')return json(res,200,await service.listGoals(url.searchParams.get('includeArchived')==='true'));
    if(req.method==='POST'&&url.pathname==='/api/v1/goals')return json(res,201,await service.createGoal(await jsonBody(req)));
    const goal=url.pathname.match(/^\/api\/v1\/goals\/([^/]+)$/);if(req.method==='PATCH'&&goal)return json(res,200,await service.updateGoal(goal[1],await jsonBody(req)));if(req.method==='DELETE'&&goal)return json(res,200,await service.archiveGoal(goal[1]));
    const goalContribution=url.pathname.match(/^\/api\/v1\/goals\/([^/]+)\/contributions$/);if(req.method==='POST'&&goalContribution){const b=await jsonBody(req);return json(res,201,await service.contributeToGoal(goalContribution[1],Number(b.amount),b.date,b.note));}
    if(req.method==='GET'&&url.pathname==='/api/v1/ui-preferences')return json(res,200,await service.getUiPreferences());
    if(req.method==='PUT'&&url.pathname==='/api/v1/ui-preferences')return json(res,200,await service.updateUiPreferences(await jsonBody(req)));
    if(req.method==='GET'&&url.pathname==='/api/v1/planning-summary')return json(res,200,await service.planningSummary(url.searchParams.get('asOf')||new Date().toISOString().slice(0,10)));
    if(req.method==='GET'&&url.pathname==='/api/v1/forecast')return json(res,200,await service.forecast({asOf:url.searchParams.get('asOf')||new Date().toISOString().slice(0,10),horizonMonths:url.searchParams.get('months')?Number(url.searchParams.get('months')):undefined,openingCash:url.searchParams.get('openingCash')?Number(url.searchParams.get('openingCash')):undefined,variableSpendTarget:url.searchParams.get('variable')?Number(url.searchParams.get('variable')):undefined}));
    if(req.method==='POST'&&url.pathname==='/api/v1/scenarios/simulate')return json(res,200,await service.simulateScenario(await jsonBody(req)));
    if(req.method==='GET'&&url.pathname==='/api/v1/recurring')return json(res,200,await service.listRecurring());
    if(req.method==='GET'&&url.pathname==='/api/v1/recurring/month')return json(res,200,await service.recurringForMonth(url.searchParams.get('month')||new Date().toISOString().slice(0,7)));
    const recurringOverride=url.pathname.match(/^\/api\/v1\/recurring\/([^/]+)\/overrides\/([^/]+)$/);if(req.method==='PUT'&&recurringOverride){const b=await jsonBody(req);return json(res,200,await service.setRecurringOverride(recurringOverride[1],decodeURIComponent(recurringOverride[2]),Number(b.amount),b.note));}
    if(req.method==='GET'&&url.pathname==='/api/v1/imports')return json(res,200,await service.listImports());
    if(req.method==='POST'&&url.pathname==='/api/v1/imports'){const cardId=url.searchParams.get('cardId');if(!cardId)throw new Error('cardId is required');const filename=url.searchParams.get('filename')||'statement.pdf';const buf=await bufferBody(req);const text=await extractText(buf,String(req.headers['content-type']||''),filename);await store.backup(`before import ${filename}`);return json(res,201,await service.createImport(cardId,filename,text));}
    const imp=url.pathname.match(/^\/api\/v1\/imports\/([^/]+)$/);if(req.method==='GET'&&imp)return json(res,200,await service.getImport(imp[1]));
    const resolve=url.pathname.match(/^\/api\/v1\/imports\/([^/]+)\/rows\/([^/]+)$/);if(req.method==='PATCH'&&resolve){const b=await jsonBody(req);return json(res,200,await service.resolveImportRow(resolve[1],resolve[2],b.action,b.transactionId));}
    const commit=url.pathname.match(/^\/api\/v1\/imports\/([^/]+)\/commit$/);if(req.method==='POST'&&commit){await store.backup(`before commit ${commit[1]}`);return json(res,200,await service.commitImport(commit[1]));}
    if(req.method==='GET'&&url.pathname==='/api/v1/copilot/status')return json(res,200,{...copilot.status(),privacy:'API key stays server-side. Chat history is stored in Postgres.'});
    if(req.method==='GET'&&url.pathname==='/api/v1/copilot/sessions')return json(res,200,data.copilotSessions.map(sessionSummary));
    if(req.method==='POST'&&url.pathname==='/api/v1/copilot/sessions'){const session=newCopilotSession();await persistSession(session,'copilot.created');return json(res,201,session);}
    const copilotSession=url.pathname.match(/^\/api\/v1\/copilot\/sessions\/([^/]+)$/);if(req.method==='GET'&&copilotSession){const session=data.copilotSessions.find(x=>x.id===copilotSession[1]);if(!session)throw new Error('Copilot session not found');return json(res,200,session);}if(req.method==='DELETE'&&copilotSession){const i=data.copilotSessions.findIndex(x=>x.id===copilotSession[1]);if(i<0)throw new Error('Copilot session not found');data.copilotSessions.splice(i,1);await store.persist('copilot.deleted',{sessionId:copilotSession[1]});return json(res,200,{deleted:true});}
    if(req.method==='POST'&&url.pathname==='/api/v1/copilot/chat'){const b=await jsonBody(req);const message=String(b.message||'').trim();if(!message)throw new Error('message is required');let session=b.sessionId?data.copilotSessions.find(x=>x.id===b.sessionId):undefined;if(!session)session=newCopilotSession();const history=session.messages.filter(m=>m.role==='user'||m.role==='assistant').slice(-12).map(m=>({role:m.role,content:m.content}));const now=new Date().toISOString();session.messages.push({id:randomUUID(),role:'user',content:message,createdAt:now});if(session.title==='Nueva conversación')session.title=message.replace(/\s+/g,' ').slice(0,52)+(message.length>52?'…':'');session.updatedAt=now;await persistSession(session,'copilot.user_message');const answer=await copilot.chat(history,message);const assistant={id:randomUUID(),role:'assistant',content:answer.content,createdAt:new Date().toISOString(),provider:answer.provider,model:answer.model,toolTrace:answer.toolTrace,warnings:answer.warnings};session.messages.push(assistant);session.updatedAt=assistant.createdAt;await persistSession(session,'copilot.assistant_message');return json(res,200,{session:sessionSummary(session),message:assistant,status:copilot.status()});}
    if(req.method==='GET'&&url.pathname==='/api/v1/reports/payment-month-spend')return json(res,200,{month:url.searchParams.get('month'),amount:await service.paymentMonthSpend(url.searchParams.get('month'))});
    if(req.method==='POST'&&url.pathname==='/api/v1/admin/backup')return json(res,201,await store.backup('manual API backup'));
    if(req.method==='GET'&&url.pathname==='/api/v1/admin/audit')return json(res,200,await store.recentAudit(Math.min(100,Number(url.searchParams.get('limit')||50))));
    return json(res,404,{error:{code:'NOT_FOUND',message:'Route not found'}});
  }catch(e){const msg=e?.message||String(e);const status=/Concurrent update/.test(msg)?409:/Origin rejected/.test(msg)?403:400;return json(res,status,{error:{code:status===409?'CONFLICT':status===403?'FORBIDDEN':'BAD_REQUEST',message:msg}});}
};
