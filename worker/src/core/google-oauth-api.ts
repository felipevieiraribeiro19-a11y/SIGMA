/** Authenticated OAuth entrypoints plus Google's unauthenticated one-time callback. */
import {HttpError} from '../validation';
import {challenge,confirmScopes,exchangeGoogleCode,googleAuthorizeUrl,noStore,
 oauthConfig,randomUrl,validPreset,type ScopePreset} from './google-oauth';
import {validGoogleToken,type Provider} from './sigma-connectors';

export interface LabGoogleOauthEnv{
 GOOGLE_OAUTH_ENABLED?:string;
 GOOGLE_OAUTH_CLIENT_ID?:string;
 GOOGLE_OAUTH_CLIENT_SECRET?:string;
 GOOGLE_OAUTH_ENCRYPTION_KEY?:string;
 GOOGLE_OAUTH_REDIRECT_URI?:string;
 GOOGLE_OAUTH_VAULT?:DurableObjectNamespace;
 ALLOWED_ORIGIN:string;
}
const internal=async(stub:DurableObjectStub,path:string,method='GET',body?:unknown)=>{
 const response=await stub.fetch('https://sigma-oauth.internal'+path,{
  method,headers:{'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 const value=await response.json() as Record<string,unknown>;
 if(!response.ok)throw new HttpError(response.status,
  typeof value.error==='string'?value.error:'Cofre OAuth indisponível.');
 return value;
};
const bound=(env:LabGoogleOauthEnv,uid:string):DurableObjectStub=>{
 if(env.GOOGLE_OAUTH_ENABLED!=='true'||!env.GOOGLE_OAUTH_VAULT)
  throw new HttpError(503,'Conexão Google permanente ainda desativada no laboratório.');
 return env.GOOGLE_OAUTH_VAULT.get(env.GOOGLE_OAUTH_VAULT.idFromName(uid));
};

/**
 * Preset do cofre para cada conector. Drive usa apenas metadados nesta etapa:
 * leitura de conteúdo continua fora até decisão explícita.
 */
/** Notion não usa OAuth do Google: fica fora do mapa. */
type GoogleProvider=Exclude<Provider,'notion'>;
const PRESET_BY_PROVIDER:Record<GoogleProvider,ScopePreset>={
 calendar:'calendar',drive:'drive_metadata',tasks:'calendar'
};
/**
 * Resolve o token Google de uma requisição autenticada.
 * 1. Cabeçalho X-Google-Token tem prioridade: o fluxo efêmero anterior não muda.
 * 2. Sem cabeçalho, usa o access token renovado pelo cofre (autorização única).
 * Devolve '' quando o cofre está desligado ou a conta nunca conectou, para que o
 * chamador siga com a mensagem atual de "conecte sua conta".
 */
export async function resolveGoogleToken(
 request:Request,env:LabGoogleOauthEnv,uid:string,provider:GoogleProvider
):Promise<string>{
 const header=request.headers.get('X-Google-Token');
 if(header!==null)return validGoogleToken(header);
 if(env.GOOGLE_OAUTH_ENABLED!=='true'||!env.GOOGLE_OAUTH_VAULT)return '';
 const stub=env.GOOGLE_OAUTH_VAULT.get(env.GOOGLE_OAUTH_VAULT.idFromName(uid));
 try{
  const value=await internal(stub,'/access','POST',{preset:PRESET_BY_PROVIDER[provider]});
  const token=value.accessToken;
  return typeof token==='string'&&token.length>=5?token:'';
 }catch(error){
  if(error instanceof HttpError&&error.status===401)
   throw new HttpError(401,'Sua conexão Google precisa ser reconectada no painel de integrações.');
  return '';
 }
}
export async function handleAuthenticatedGoogleOAuth(
 request:Request,env:LabGoogleOauthEnv,uid:string
):Promise<Response>{
 const path=new URL(request.url).pathname;
 const stub=bound(env,uid);
 if(path==='/api/lab/oauth/status'&&request.method==='GET')
  return noStore(await internal(stub,'/status'));
 if(path==='/api/lab/oauth/start'&&request.method==='POST'){
  const body=await request.text();
  if(body.length>100)throw new HttpError(413,'Pedido de conexão inválido.');
  let input:unknown;try{input=JSON.parse(body);}catch{throw new HttpError(400,'JSON inválido.');}
  const preset=validPreset((input as {preset?:unknown})?.preset);
  const config=oauthConfig(env),nonce=randomUrl(),verifier=randomUrl();
  const state=uid+'.'+nonce;
  await internal(stub,'/start','POST',{uid,nonce,verifier,preset});
  const authorizeUrl=googleAuthorizeUrl(config.clientId,config.redirectUri,
   state,await challenge(verifier),preset);
  return noStore({authorizationUrl:authorizeUrl,preset});
 }
 if(path==='/api/lab/oauth/disconnect'&&request.method==='POST'){
  const body=await request.text();
  if(body.length>100)throw new HttpError(413,'Pedido de desconexão inválido.');
  let input:unknown;try{input=JSON.parse(body);}catch{throw new HttpError(400,'JSON inválido.');}
  const preset=validPreset((input as {preset?:unknown})?.preset);
  return noStore(await internal(stub,'/disconnect','POST',{preset}));
 }
 throw new HttpError(405,'Rota ou método OAuth inválido.');
}
const callbackResult=(env:LabGoogleOauthEnv,success:boolean):Response=>{
 let target:URL;
 try{target=new URL(env.ALLOWED_ORIGIN);}catch{throw new HttpError(503,'Destino OAuth inválido.');}
 if(target.protocol!=='https:'||target.pathname!=='/'||target.search||target.hash||
  target.username||target.password)
  throw new HttpError(503,'Destino OAuth inválido.');
 target.searchParams.set('sigma_oauth',success?'connected':'error');
 return new Response(null,{status:303,headers:{
  Location:target.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'
 }});
};
/** Public callback requires exact matching high-entropy state; no Firebase bearer on Google redirect. */
export async function handleGoogleOAuthCallback(
 request:Request,env:LabGoogleOauthEnv,transport:typeof fetch=fetch
):Promise<Response>{
 if(request.method!=='GET')return noStore({error:'Método inválido.'},405);
 try{
  const url=new URL(request.url);
  // Only the configured fixed callback may be used.
  const config=oauthConfig(env);
  if(url.origin+url.pathname!==config.redirectUri)throw new HttpError(400,'Retorno OAuth inválido.');
  const state=url.searchParams.get('state')||'';
  const match=/^([A-Za-z0-9_-]{1,128})\.([A-Za-z0-9_-]{40,60})$/.exec(state);
  if(!match)throw new HttpError(400,'Autorização Google sem estado válido.');
  const [,uid,nonce]=match;
  const stub=bound(env,uid);
  const pending=await internal(stub,'/consume','POST',{uid,nonce}) as {
   verifier:string;preset:ScopePreset
  };
  if(url.searchParams.has('error'))return callbackResult(env,false);
  const code=url.searchParams.get('code')||'';
  const token=await exchangeGoogleCode(code,pending.verifier,config,transport);
  confirmScopes(token.scope,pending.preset);
  await internal(stub,'/save','POST',{uid,preset:pending.preset,
   refreshToken:token.refresh_token,scopes:token.scope});
  return callbackResult(env,true);
 }catch{
  // Never expose OAuth code, state, verifier, token or upstream error to the browser.
  return callbackResult(env,false);
 }
}
