import {FinanceService} from './finance-service';
import {ScenarioRequest} from './contracts';

export type CopilotProvider='openai'|'local';
export interface CopilotHistoryMessage {role:'user'|'assistant';content:string;}
export interface CopilotToolTrace {name:string;arguments:Record<string,unknown>;durationMs:number;summary:string;}
export interface CopilotAnswer {content:string;provider:CopilotProvider;model:string;toolTrace:CopilotToolTrace[];warnings:string[];}

export interface CopilotConfig {
  apiKey?:string;
  model?:string;
  reasoningEffort?:'none'|'low'|'medium'|'high'|'xhigh'|'max';
  baseUrl?:string;
  maxToolRounds?:number;
}

const isoToday=()=>new Date().toISOString().slice(0,10);
const money=(n:number)=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(n||0);
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

function tool(name:string,description:string,properties:Record<string,unknown>,required:string[]){
  return {type:'function',name,description,parameters:{type:'object',properties,required,additionalProperties:false},strict:true};
}
const nullable=(schema:Record<string,unknown>)=>({...schema,type:[schema.type as string,'null']});

export class CopilotService {
  private readonly apiKey?:string;
  private readonly model:string;
  private readonly effort:'none'|'low'|'medium'|'high'|'xhigh'|'max';
  private readonly baseUrl:string;
  private readonly maxToolRounds:number;
  constructor(private readonly finance:FinanceService,config:CopilotConfig={}){
    this.apiKey=config.apiKey;
    this.model=config.model||'gpt-5.6-terra';
    this.effort=config.reasoningEffort||'medium';
    this.baseUrl=(config.baseUrl||'https://api.openai.com/v1').replace(/\/$/,'');
    this.maxToolRounds=config.maxToolRounds||8;
  }

  status(){return {provider:this.apiKey?'openai':'local',configured:Boolean(this.apiKey),model:this.apiKey?this.model:'local-finance-engine',reasoningEffort:this.apiKey?this.effort:null,readOnly:true};}

  private tools(){return [
    tool('get_financial_overview','Obtiene el resumen financiero actual. Úsalo para deuda total, utilización, gasto fijo, pago de próximos estados y flujo mensual antes de variables.',{
      as_of:{type:'string',description:'Fecha YYYY-MM-DD para el resumen.'}
    },['as_of']),
    tool('get_cash_flow_forecast','Obtiene proyección diaria y mensual de caja con supuestos configurados. Úsalo para preguntas de liquidez, cuánto se puede gastar, meses difíciles y fondo de emergencia.',{
      as_of:{type:'string',description:'Fecha inicial YYYY-MM-DD.'},
      horizon_months:nullable({type:'integer',description:'Horizonte 1 a 36 meses; null usa preferencias.'}),
      opening_cash:nullable({type:'number',description:'Saldo líquido inicial; null usa preferencias.'}),
      variable_spend_target:nullable({type:'number',description:'Presupuesto variable mensual; null usa preferencias.'})
    },['as_of','horizon_months','opening_cash','variable_spend_target']),
    tool('list_cards','Lista tarjetas y su estado básico. Úsalo antes de get_card cuando no conozcas el card_id.',{
      include_archived:{type:'boolean',description:'Incluir tarjetas archivadas.'}
    },['include_archived']),
    tool('get_card','Obtiene dashboard de una tarjeta: saldo vivo, utilización, siguiente pago proyectado y movimientos.',{
      card_id:{type:'string',description:'ID exacto de la tarjeta.'}
    },['card_id']),
    tool('list_debt_plans','Lista deudas que generan intereses con tasa, principal, pago programado y pagos restantes.',{},[]),
    tool('simulate_extra_payment','Calcula ahorro de intereses e IVA al abonar anticipadamente a una deuda concreta.',{
      plan_id:{type:'string',description:'ID exacto del plan de deuda.'},amount:{type:'number',description:'Abono extraordinario en MXN, mayor a cero.'}
    },['plan_id','amount']),
    tool('simulate_scenario','Compara baseline contra un escenario de compra, abono a deuda y/o ingreso extraordinario. Los objetos pueden ser null.',{
      as_of:{type:'string',description:'Fecha base YYYY-MM-DD.'},
      horizon_months:{type:'integer',description:'Horizonte en meses, 1 a 36.'},
      purchase:{type:['object','null'],properties:{card_id:{type:'string'},date:{type:'string'},amount:{type:'number'},description:{type:'string'},financing:{type:'string',enum:['regular','msi']},installments:{type:['integer','null']}},required:['card_id','date','amount','description','financing','installments'],additionalProperties:false},
      extra_debt_payment:{type:['object','null'],properties:{plan_id:{type:'string'},date:{type:'string'},amount:{type:'number'}},required:['plan_id','date','amount'],additionalProperties:false},
      one_time_income:{type:['object','null'],properties:{date:{type:'string'},amount:{type:'number'},label:{type:'string'}},required:['date','amount','label'],additionalProperties:false}
    },['as_of','horizon_months','purchase','extra_debt_payment','one_time_income']),
    tool('get_recurring_month','Obtiene gastos recurrentes efectivos de un mes, incluyendo overrides específicos como CFE o croquetas.',{
      month:{type:'string',description:'Mes YYYY-MM.'}
    },['month']),
    tool('search_transactions','Busca movimientos registrados por texto, tarjeta y rango. Úsalo para preguntas de comercios/categorías concretas.',{
      query:{type:['string','null'],description:'Texto libre como Uber, Amazon, Supermercado; null no filtra texto.'},
      card_id:{type:['string','null'],description:'ID de tarjeta; null todas.'},
      date_from:{type:['string','null'],description:'YYYY-MM-DD o null.'},
      date_to:{type:['string','null'],description:'YYYY-MM-DD o null.'},
      limit:{type:'integer',description:'Máximo de registros, 1 a 100.'}
    },['query','card_id','date_from','date_to','limit']),
    tool('get_payment_month_spend','Calcula gasto que se desembolsa en un mes según ciclos de tarjeta y MSI, excluyendo pagos como gasto nuevo.',{
      month:{type:'string',description:'Mes YYYY-MM.'}
    },['month']),
    tool('get_preferences','Obtiene supuestos de planeación: saldo inicial, gasto variable, fondo de emergencia y umbrales.',{},[])
  ];}

  private async executeTool(name:string,args:any):Promise<any>{
    switch(name){
      case 'get_financial_overview': return this.finance.overview(args.as_of||isoToday());
      case 'get_cash_flow_forecast': return this.finance.forecast({asOf:args.as_of||isoToday(),horizonMonths:args.horizon_months??undefined,openingCash:args.opening_cash??undefined,variableSpendTarget:args.variable_spend_target??undefined});
      case 'list_cards': return this.finance.listCards(Boolean(args.include_archived));
      case 'get_card': return this.finance.cardDashboard(args.card_id);
      case 'list_debt_plans': return this.finance.listDebtPlans();
      case 'simulate_extra_payment': return this.finance.simulateExtraPayment(args.plan_id,Number(args.amount));
      case 'simulate_scenario': {
        const req:ScenarioRequest={asOf:args.as_of||isoToday(),horizonMonths:clamp(Number(args.horizon_months||12),1,36)};
        if(args.purchase) req.purchase={cardId:args.purchase.card_id,date:args.purchase.date,amount:Number(args.purchase.amount),description:args.purchase.description,financing:args.purchase.financing,installments:args.purchase.installments??undefined};
        if(args.extra_debt_payment) req.extraDebtPayment={planId:args.extra_debt_payment.plan_id,date:args.extra_debt_payment.date,amount:Number(args.extra_debt_payment.amount)};
        if(args.one_time_income) req.oneTimeIncome={date:args.one_time_income.date,amount:Number(args.one_time_income.amount),label:args.one_time_income.label};
        return this.finance.simulateScenario(req);
      }
      case 'get_recurring_month': return this.finance.recurringForMonth(args.month);
      case 'search_transactions': {
        const cards=await this.finance.listCards(true);const names=new Map(cards.map(c=>[c.id,c.name]));let rows=await this.finance.listTransactions();
        const q=String(args.query||'').trim().toLowerCase();if(q)rows=rows.filter(t=>(t.description+' '+(t.category||'')+' '+(names.get(t.cardId)||'')).toLowerCase().includes(q));
        if(args.card_id)rows=rows.filter(t=>t.cardId===args.card_id);if(args.date_from)rows=rows.filter(t=>t.date>=args.date_from);if(args.date_to)rows=rows.filter(t=>t.date<=args.date_to);
        rows=rows.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,clamp(Number(args.limit||50),1,100));
        return {count:rows.length,transactions:rows.map(t=>({...t,cardName:names.get(t.cardId)||t.cardId}))};
      }
      case 'get_payment_month_spend': return {month:args.month,amount:await this.finance.paymentMonthSpend(args.month)};
      case 'get_preferences': return this.finance.getPreferences();
      default: throw new Error(`Unknown copilot tool: ${name}`);
    }
  }

  private digest(name:string,result:any){
    if(name==='get_financial_overview')return `Resumen: deuda ${money(result.totalDebt)}, deuda con interés ${money(result.interestBearingDebt)}, utilización ${result.creditUtilization}%`;
    if(name==='get_cash_flow_forecast')return `Forecast: cierre ${money(result.forecast?.metrics?.endingCash)}, mínimo ${money(result.forecast?.metrics?.minimumCash)}, días negativos ${result.forecast?.metrics?.negativeDays}`;
    if(name==='list_cards')return `${result.length} tarjetas`;
    if(name==='get_card')return `${result.card?.name}: saldo ${money(result.currentBalance)}, utilización ${result.utilization}%`;
    if(name==='list_debt_plans')return `${result.length} planes con interés`;
    if(name==='simulate_extra_payment')return `Ahorro ${money(result.interestAndTaxSaved)}, ${result.paymentsSaved} pagos menos`;
    if(name==='simulate_scenario')return `Δ saldo final ${money(result.deltas?.endingCash)}, ahorro interés ${money(result.deltas?.interestAndTaxSaved)}`;
    if(name==='get_recurring_month')return `${result.length} recurrentes del mes`;
    if(name==='search_transactions')return `${result.count} movimientos encontrados`;
    if(name==='get_payment_month_spend')return `Desembolso de compras: ${money(result.amount)}`;
    if(name==='get_preferences')return `Supuestos: variable ${money(result.variableSpendTarget)}, efectivo inicial ${money(result.openingCash)}`;
    return name;
  }

  private instructions(){return `Eres el Copiloto Financiero de Personal Finance OS. Respondes en español salvo que el usuario escriba principalmente en otro idioma.

REGLAS DE EXACTITUD:
- Para cualquier afirmación cuantitativa o específica sobre las finanzas del usuario, usa las herramientas disponibles en este turno. No inventes saldos, fechas, tasas, gastos ni proyecciones.
- La matemática financiera la hacen las herramientas; tú explicas el resultado.
- Distingue datos oficiales/reconciliados, derivados, estimados y supuestos cuando sea relevante.
- Si falta un dato clave, dilo claramente. No rellenes huecos con suposiciones silenciosas.
- Si el usuario pregunta "cuánto puedo gastar", consulta forecast y explica el criterio usado, especialmente saldo mínimo, fechas de nómina y presupuesto variable.
- Si compara pagar deuda vs conservar liquidez, usa simulaciones y describe ambos efectos: intereses y caja.
- No trates pagos de tarjeta como gasto nuevo.
- Liverpool corta el día 27 y se paga el día 27 del mes siguiente; no apliques el día 30 genérico.

SEGURIDAD Y CONTROL:
- Este copiloto es de SOLO LECTURA. Nunca afirma haber creado, borrado, pagado o modificado nada. Para cambios, indica que deben hacerse en el módulo correspondiente de la app.
- No solicites ni muestres PAN completo, CVV, contraseñas o claves bancarias.

ESTILO:
- Sé claro, práctico y compacto. Da primero la conclusión y luego las cifras que la sostienen.
- Cuando uses herramientas, termina con una línea breve "Datos consultados:" enumerando las fuentes internas usadas (por ejemplo: Overview, Forecast 12 meses, BBVA).
- Si el forecast contiene warnings o assumptions relevantes para la pregunta, menciónalos.
Fecha del sistema: ${isoToday()}.`}

  private extractText(response:any){
    if(typeof response?.output_text==='string'&&response.output_text.trim())return response.output_text.trim();
    const parts:string[]=[];for(const item of response?.output||[]){if(item?.type==='message')for(const c of item.content||[]){if(c?.type==='output_text'&&c.text)parts.push(c.text);else if(typeof c?.text==='string')parts.push(c.text);}}
    return parts.join('\n').trim();
  }

  async chat(history:CopilotHistoryMessage[],message:string):Promise<CopilotAnswer>{
    const clean=message.trim();if(!clean)throw new Error('El mensaje no puede estar vacío');
    if(!this.apiKey)return this.localChat(history,clean);
    const trace:CopilotToolTrace[]=[];const warnings:string[]=[];
    const input:any[]=[...history.slice(-12).map(m=>({role:m.role,content:m.content})),{role:'user',content:clean}];
    let rounds=0;
    while(rounds++<this.maxToolRounds){
      const payload:any={model:this.model,instructions:this.instructions(),input,tools:this.tools(),parallel_tool_calls:false,store:false,reasoning:{effort:this.effort}};
      const response=await this.openAI(payload);input.push(...(response.output||[]));
      const calls=(response.output||[]).filter((x:any)=>x.type==='function_call');
      if(!calls.length){const content=this.extractText(response)||'No pude producir una respuesta textual.';return {content,provider:'openai',model:response.model||this.model,toolTrace:trace,warnings};}
      for(const call of calls){let args:any={};try{args=call.arguments?JSON.parse(call.arguments):{};}catch{args={};warnings.push(`Argumentos inválidos en ${call.name}.`);}const t0=Date.now();let result:any;try{result=await this.executeTool(call.name,args);}catch(e:any){result={error:e?.message||String(e)};warnings.push(`${call.name}: ${result.error}`);}trace.push({name:call.name,arguments:args,durationMs:Date.now()-t0,summary:this.digest(call.name,result)});input.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)});}
    }
    warnings.push('Se alcanzó el límite de rondas de herramientas.');
    return {content:'Pude consultar los datos, pero la conversación alcanzó el límite de análisis de esta ejecución. Reformula la pregunta de forma más concreta.',provider:'openai',model:this.model,toolTrace:trace,warnings};
  }

  private async openAI(body:any){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),60_000);
    try{
      const r=await fetch(`${this.baseUrl}/responses`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${this.apiKey}`},body:JSON.stringify(body),signal:controller.signal});
      const text=await r.text();let payload:any;try{payload=JSON.parse(text);}catch{payload={raw:text};}
      if(!r.ok)throw new Error(payload?.error?.message||`OpenAI API ${r.status}`);return payload;
    }finally{clearTimeout(timer);}
  }

  private async localChat(_history:CopilotHistoryMessage[],message:string):Promise<CopilotAnswer>{
    const q=message.toLowerCase();const trace:CopilotToolTrace[]=[];const call=async(name:string,args:any)=>{const t0=Date.now();const result=await this.executeTool(name,args);trace.push({name,arguments:args,durationMs:Date.now()-t0,summary:this.digest(name,result)});return result;};
    let content:string;
    if(/inter[eé]s|abono|pagar.*bbva|pagar.*nu|deuda cara/.test(q)){
      const plans=await call('list_debt_plans',{});const ordered=[...plans].sort((a:any,b:any)=>b.apr-a.apr);content=ordered.length?`Tus deudas con interés, ordenadas por tasa, son: ${ordered.map((p:any)=>`${p.name} ${(p.apr*100).toFixed(1)}% APR, principal ${money(p.principal)}`).join('; ')}. Para calcular un abono extraordinario exacto, escribe el monto que quieres aplicar.`:'No hay planes con interés registrados.';
    }else if(/deuda|saldo total|utilizaci/.test(q)){
      const o=await call('get_financial_overview',{as_of:isoToday()});content=`Tu deuda registrada es ${money(o.totalDebt)}. De ella, ${money(o.interestBearingDebt)} genera intereses y la utilización global es ${o.creditUtilization.toFixed(1)}%. Tus gastos fijos netos equivalentes son ${money(o.monthlyFixedNet)} al mes.`;
    }else if(/flujo|cash|puedo gastar|liquidez|quincena|meses? siguientes/.test(q)){
      const f=await call('get_cash_flow_forecast',{as_of:isoToday(),horizon_months:null,opening_cash:null,variable_spend_target:null});const m=f.forecast.metrics;const warning=f.forecast.warnings?.[0]?` Advertencia del forecast: ${f.forecast.warnings[0]}`:'';content=`Con los supuestos actuales, el forecast termina en ${money(m.endingCash)} y el punto mínimo es ${money(m.minimumCash)}${m.minimumCashDate?` el ${m.minimumCashDate}`:''}. ${m.negativeDays?`Hay ${m.negativeDays} días proyectados bajo cero.`:'No hay días proyectados bajo cero.'}${warning} Para una recomendación de gasto concreta, indica monto y fecha y el Simulador puede compararlo contra el baseline.`;
    }else if(/recurrent|suscrip|cfe|luz|croqueta|gasto fijo/.test(q)){
      const month=isoToday().slice(0,7),rows=await call('get_recurring_month',{month});const total=rows.reduce((s:number,r:any)=>s+r.amount,0);content=`Para ${month} hay ${rows.length} reglas recurrentes y cargos efectivos por ${money(total)} antes de considerar cómo se difieren los cargos domiciliados en tarjeta. Los overrides mensuales ya se respetan.`;
    }else{
      const o=await call('get_financial_overview',{as_of:isoToday()});content=`El copiloto local está activo sin conexión a un modelo externo. Puedo resolver consultas estructuradas de deuda, flujo, recurrentes y tarjetas con el motor financiero. Hoy tienes ${money(o.totalDebt)} de deuda registrada y ${money(o.interestBearingDebt)} con intereses. Para conversación más flexible, configura OPENAI_API_KEY.`;
    }
    return {content:content+`\n\nDatos consultados: ${trace.map(t=>t.name).join(', ')}.`,provider:'local',model:'local-finance-engine',toolTrace:trace,warnings:['Modo local: interpretación de lenguaje limitada; los cálculos provienen del motor financiero.']};
  }
}
