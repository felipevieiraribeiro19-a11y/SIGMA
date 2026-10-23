/** SIGMA LAB OAuth server-side: strict scopes, one-time state + PKCE. No browser refresh tokens. */
import {HttpError} from '../validation';
export const GOOGLE_LAB_SCOPES={
 calendar:['https://www.googleapis.com/auth/calendar.events.readonly'],
 drive_metadata:['https://www.googleapis.com/auth/drive.metadata.readonly'],
 drive_content:['https://www.googleapis.com/auth/drive.readonly']
} as const;
export type ScopePreset=keyof typeof GOOGLE_LAB_SCOPES;
const scopes=(preset:ScopePreset):string[]=>[...GOOGLE_LAB_SCOPES[preset]];
export function validPreset(value:unknown):ScopePreset{
 if(value!=='calendar'&&value!=='drive_metadata'&&value!=='drive_content')
  throw new HttpError(400,'Permissão Google desconhecida.');
 return value;
}
export const utf8=(value:string)=>new TextEncoder().encode(value);
export const b64url=(bytes:Uint8Array):string=>btoa(String.fromCharCode(...bytes))
 .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export function randomUrl(bytes=32):string{
 const nonce=new Uint8Array(bytes);crypto.getRandomValues(nonce);return b64url(nonce);
}
export async function challenge(verifier:string):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',utf8(verifier));
 return b64url(new Uint8Array(digest));
}
export function oauthConfig(env:{GOOGLE_OAUTH_CLIENT_ID?:string;GOOGLE_OAUTH_CLIENT_SECRET?:string;
 GOOGLE_OAUTH_REDIRECT_URI?:string;GOOGLE_OAUTH_ENCRYPTION_KEY?:string}){
 const clientId=env.GOOGLE_OAUTH_CLIENT_ID||'';
 const secret=env.GOOGLE_OAUTH_CLIENT_SECRET||'';
 const redirectUri=env.GOOGLE_OAUTH_REDIRECT_URI||'';
 const key=env.GOOGLE_OAUTH_ENCRYPTION_KEY||'';
 let url:URL;
 try{url=new URL(redirectUri);}catch{throw new HttpError(503,'OAuth ainda não configurado no laboratório.');}
 if(!clientId.endsWith('.apps.googleusercontent.com')||secret.length<10||url.protocol!=='https:'||
   url.username||url.password||url.search||url.hash||
   url.pathname!=='/api/lab/oauth/callback'||key.length<42)
  throw new HttpError(503,'OAuth ainda não configurado no laboratório.');
 return {clientId,secret,redirectUri,key};
}
export function googleAuthorizeUrl(clientId:string,redirectUri:string,state:string,verifierChallenge:string,preset:ScopePreset){
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 const params=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,
  response_type:'code',scope:scopes(preset).join(' '),access_type:'offline',
  prompt:'consent',state,code_challenge:verifierChallenge,code_challenge_method:'S256'});
 url.search=params.toString();
 return url.toString();
}
export type TokenReply={access_token:string;refresh_token?:string;expires_in?:number;
 scope?:string;token_type?:string;error?:string};
export async function exchangeGoogleCode(
 code:string,verifier:string,env:ReturnType<typeof oauthConfig>,transport:typeof fetch=fetch
):Promise<TokenReply>{
 if(code.length<8||code.length>4096||/[\x00-\x1f]/.test(code))
  throw new HttpError(400,'Código de autorização inválido.');
 const body=new URLSearchParams({code,client_id:env.clientId,client_secret:env.secret,
  redirect_uri:env.redirectUri,grant_type:'authorization_code',code_verifier:verifier});
 let response:Response;
 try{response=await transport('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:body.toString(),signal:AbortSignal.timeout(10000)
 });}catch{throw new HttpError(502,'Não foi possível concluir a autorização Google.');}
 const data=await response.json().catch(()=>null) as TokenReply|null;
 if(!response.ok||!data||typeof data.access_token!=='string'||
    typeof data.refresh_token!=='string'||data.refresh_token.length<10)
  throw new HttpError(502,'O Google não retornou acesso offline. Reconecte e autorize novamente.');
 return data;
}
export function confirmScopes(granted:string|undefined,preset:ScopePreset){
 const actual=new Set((granted||'').split(/\s+/).filter(Boolean));
 if(!scopes(preset).every(x=>actual.has(x)))
  throw new HttpError(403,'O Google não concedeu a permissão solicitada.');
}
export function noStore(data:unknown,status=200):Response{
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',
  'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
