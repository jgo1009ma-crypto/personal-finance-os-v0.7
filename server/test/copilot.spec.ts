import {CopilotService,FinanceService,InMemoryFinanceRepository} from '../src';

async function run(){
  const finance=new FinanceService(new InMemoryFinanceRepository());
  const copilot=new CopilotService(finance,{});
  const status=copilot.status();
  if(status.provider!=='local'||status.configured)throw new Error('expected local fallback without API key');

  const debt=await copilot.chat([],'¿Cuánta deuda total tengo y cuál es mi utilización?');
  if(!debt.content.includes('$132,933.51'))throw new Error('local copilot should use overview debt');
  if(!debt.toolTrace.some(t=>t.name==='get_financial_overview'))throw new Error('overview tool trace missing');

  const flow=await copilot.chat([],'¿Cómo se ve mi flujo de los próximos meses?');
  if(!flow.toolTrace.some(t=>t.name==='get_cash_flow_forecast'))throw new Error('forecast tool trace missing');
  if(!flow.content.includes('forecast'))throw new Error('forecast answer missing');

  const interest=await copilot.chat([],'¿Qué deuda cara tengo?');
  if(!interest.toolTrace.some(t=>t.name==='list_debt_plans'))throw new Error('debt tool trace missing');
  if(!interest.content.includes('APR'))throw new Error('interest answer missing APR');

  // OpenAI Responses orchestration is tested without a real network call.
  const originalFetch=globalThis.fetch;const requests:any[]=[];let n=0;
  globalThis.fetch=(async (_url:any,init:any)=>{
    requests.push(JSON.parse(String(init.body)));n++;
    const payload=n===1
      ? {id:'resp_1',model:'gpt-5.6-terra',output:[{type:'reasoning',id:'rs_1',summary:[]},{type:'function_call',id:'fc_1',call_id:'call_1',name:'get_financial_overview',arguments:'{"as_of":"2026-09-25"}'}]}
      : {id:'resp_2',model:'gpt-5.6-terra',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Tienes $132,933.51 de deuda registrada.\n\nDatos consultados: Overview.'}]}]};
    return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
  }) as typeof fetch;
  try{
    const ai=new CopilotService(finance,{apiKey:'test-key',model:'gpt-5.6-terra',reasoningEffort:'medium'});
    const answer=await ai.chat([],'¿Cuánta deuda tengo?');
    if(answer.provider!=='openai'||answer.toolTrace[0]?.name!=='get_financial_overview')throw new Error('OpenAI tool loop failed');
    if(requests.length!==2)throw new Error('expected two Responses API calls');
    if(requests[0].store!==false||requests[0].parallel_tool_calls!==false)throw new Error('privacy/determinism request flags missing');
    if(!requests[0].tools.every((t:any)=>t.strict===true))throw new Error('all copilot tools should use strict mode');
    if(!requests[1].input.some((x:any)=>x.type==='function_call_output'))throw new Error('tool output not returned to model');
    if(!requests[1].input.some((x:any)=>x.type==='reasoning'))throw new Error('reasoning item should be preserved across tool calls');
  }finally{globalThis.fetch=originalFetch;}
  console.log('copilot.spec: ok');
}
run();
