/**
 * ETAPA 14: Worker exclusivo do laboratório Jarvis.
 * Sem Firestore, Drive, Calendar, Tavily, gravação de mensagens ou ações.
 * Não reutilizar binding QUOTA nem publicar como sigma-cerebro.
 */
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {HttpError,validateMessages,quotaDecision} from './validation';
import {buildGeminiRequest} from './core/models';
// O laboratório possui identidade própria e não herda afirmações sobre
// histórico persistido do SIGMA principal.
const LAB_SYSTEM_IDENTITY = [
 'Você é SIGMA — Sistema Inteligente de Gestão, Monitoramento e Aprimoramento, um assistente pessoal geral inspirado no Jarvis.',
 'Converse naturalmente em português brasileiro, sem impor foco em concursos, finanças ou qualquer outro tema.',
 'Este é um laboratório experimental de conversa. As mensagens NÃO são salvas em banco e serão descartadas ao fechar/recarregar a página.',
 'Não há acesso à internet, Agenda, Drive, Firestore, memórias pessoais ou execução de tarefas por esta rota.',
 'Não diga que registrou, criou, enviou, apagou ou executou qualquer coisa; nenhuma ação externa está disponível.',
 'Se a pergunta depender de dados atuais, não alegue que verificou fontes em tempo real.',
 'Não solicite dados pessoais ou sensíveis para testes; prefira exemplos fictícios.'
].join(' ');

export interface LabChatEnv {
 FIREBASE_PROJECT_ID:string;
 ALLOWED_UID:string;
 ALLOWED_ORIGIN:string;
 LAB_CHAT_ENABLED:string;
 GEMINI_API_KEY?:string;
 GEMINI_MODEL:string;
 LAB_QUOTA:DurableObjectNamespace;
}
type Dependencies={
 verify?:(request:Request,env:LabChatEnv)=>Promise<string>;
 fetch?:typeof fetch;
};
const keys=createRemoteJWKSet(
 new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);
export async function verifyLabUser(request:Request,env:LabChatEnv):Promise<string>{
 const authorization=request.headers.get('Authorization');
 if(!authorization?.startsWith('Bearer '))throw new HttpError(401,'Faça login com Google no laboratório.');
 let payload;
 try{
  ({payload}=await jwtVerify(authorization.slice(7),keys,{
   algorithms:['RS256'],audience:env.FIREBASE_PROJECT_ID,
   issuer:'https://securetoken.google.com/'+env.FIREBASE_PROJECT_ID,
   requiredClaims:['exp','iat','sub','auth_time']
  }));
 }catch{throw new HttpError(401,'Sessão inválida ou expirada. Faça login novamente.');}
 if(typeof payload.sub!=='string'||payload.sub!==env.ALLOWED_UID||
  payload.email_verified!==true||
  (payload.firebase as {sign_in_provider?:string}|undefined)?.sign_in_provider!=='google.com')
  throw new HttpError(403,'Conta não autorizada neste laboratório.');
 return payload.sub;
}

export function makeLabChatWorker(deps:Dependencies={}){
 return {async fetch(request:Request,env:LabChatEnv):Promise<Response>{
  const requestId=crypto.randomUUID();
  const origin=request.headers.get('Origin');
  const headers:Record<string,string>={
   'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
   'X-Content-Type-Options':'nosniff','Vary':'Origin',
   'X-Request-Id':requestId
  };
  const reply=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers});
  try{
   // Não aceitar origem ausente, curingas ou origem de produção.
   if(!env.ALLOWED_ORIGIN||origin!==env.ALLOWED_ORIGIN)
    throw new HttpError(403,'Origem não autorizada.');
   headers['Access-Control-Allow-Origin']=origin;
   const path=new URL(request.url).pathname;
   if(path!=='/api/lab/chat')throw new HttpError(404,'Rota inexistente.');
   if(request.method==='OPTIONS'){
    return new Response(null,{status:204,headers:{
     ...headers,'Access-Control-Allow-Methods':'POST, OPTIONS',
     'Access-Control-Allow-Headers':'Authorization, Content-Type',
     'Access-Control-Max-Age':'600'
    }});
   }
   if(request.method!=='POST')throw new HttpError(405,'Método não permitido.');
   if(env.LAB_CHAT_ENABLED!=='true')
    throw new HttpError(503,'Conversa real ainda desativada no laboratório.');
   if(!env.FIREBASE_PROJECT_ID||!env.ALLOWED_UID||!env.LAB_QUOTA||
    !env.GEMINI_API_KEY||!env.GEMINI_MODEL)
    throw new HttpError(503,'Laboratório sem conexão segura configurada.');
   const uid=await(deps.verify||verifyLabUser)(request,env);
   if(uid!==env.ALLOWED_UID)throw new HttpError(403,'Conta não autorizada.');
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))
    throw new HttpError(415,'Envie mensagens JSON.');
   const reader=request.body?.getReader();
   if(!reader)throw new HttpError(400,'Mensagem ausente.');
   let bytes=0;const parts:Uint8Array[]=[];
   try{
    while(true){
     const {value,done}=await reader.read();if(done)break;
     bytes+=value.byteLength;
     if(bytes>26000){await reader.cancel();throw new HttpError(413,'Mensagem grande demais.');}
     parts.push(value);
    }
   }finally{reader.releaseLock();}
   const raw=new Uint8Array(bytes);let i=0;
   for(const part of parts){raw.set(part,i);i+=part.byteLength;}
   let data:unknown;
   try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(raw));}
   catch{throw new HttpError(400,'JSON inválido.');}
   const messages=validateMessages(data);
   // Cota independente da QUOTA usada em produção, por UID.
   const limit=await env.LAB_QUOTA.get(env.LAB_QUOTA.idFromName(uid))
    .fetch('https://lab-quota.internal/consume',{method:'POST'});
   if(limit.status===429)throw new HttpError(429,'Limite de testes atingido. Tente novamente depois.');
   if(!limit.ok)throw new HttpError(503,'Não foi possível controlar a cota do laboratório.');
   const model=buildGeminiRequest(env.GEMINI_MODEL,env.GEMINI_API_KEY,{
    systemInstruction:{parts:[{text:LAB_SYSTEM_IDENTITY}]},
    contents:messages.map(m=>({
     role:m.role==='assistant'?'model':'user',parts:[{text:m.text}]
    })),
    generationConfig:{maxOutputTokens:1100}
   },25000);
   const result=await(deps.fetch||fetch)(model.url,model.init);
   if(result.status===429)throw new HttpError(429,'Cota do Gemini esgotada no momento.');
   if(!result.ok)throw new HttpError(502,'Gemini indisponível neste teste.');
   const response=await result.json() as {candidates?:{content?:{parts?:{text?:string;thought?:boolean}[]}}[]};
   const answer=response.candidates?.[0]?.content?.parts?.filter(p=>!p.thought)
    .map(p=>p.text||'').join('').trim();
   if(!answer)throw new HttpError(502,'Gemini não retornou uma resposta em texto.');
   if(answer.length>12000)throw new HttpError(502,'Resposta grande demais.');
   return reply({text:answer,persisted:false,executed:false,provider:'gemini'});
  }catch(error){
   const status=error instanceof HttpError?error.status:503;
   console.log(JSON.stringify({requestId,status,environment:'jarvis-lab'}));
   return reply({error:error instanceof HttpError?error.message:'Serviço de testes indisponível.',requestId},status);
  }
 }};
}

/** Cota transacional local ao Worker LAB. Não usar a classe/namespace da produção. */
export class LabChatQuota {
 constructor(private readonly state:DurableObjectState){}
 async fetch(request:Request):Promise<Response>{
  if(request.method!=='POST'||new URL(request.url).pathname!=='/consume')
   return new Response(null,{status:404});
  const allowed=await this.state.storage.transaction(async tx=>{
   const previous=await tx.get<Parameters<typeof quotaDecision>[0]>('requests');
   const decision=quotaDecision(previous,Date.now(),15);
   // Menor limite de pico que o Worker principal.
   if(decision.state.minuteCount>4)return false;
   if(decision.allowed)await tx.put('requests',decision.state);
   return decision.allowed;
  });
  return new Response(null,{status:allowed?204:429});
 }
}
export default makeLabChatWorker();
