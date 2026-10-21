import { initializeApp } from 'firebase/app';
import {encodeMedia} from './media';
import { getAuth, GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence, type User, type Auth } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
export type Config={firebase:{apiKey:string;authDomain:string;projectId:string;appId:string};apiBaseUrl:string;environment:string};
export type Message={role:'user'|'assistant';text:string};
let auth:Auth|undefined;let db:Firestore|undefined;
export async function bootstrap(onUser:(user:User|null)=>void){
 const response=await fetch('/config.json',{cache:'no-store'});if(!response.ok)throw Error('Não foi possível carregar a configuração.');
 const config:Config=await response.json();
 if(config.firebase && Object.values(config.firebase).every(v=>typeof v==='string'&&v.length>0)){
  const app=initializeApp(config.firebase);auth=getAuth(app);db=getFirestore(app);await setPersistence(auth,browserLocalPersistence);onAuthStateChanged(auth,onUser);
 }
 return config;
}
export function login(){if(!auth)throw Error('O login Google ainda precisa ser conectado ao novo projeto Firebase.');return signInWithPopup(auth,new GoogleAuthProvider());}
export async function logout(){if(auth)await signOut(auth);}
export async function verifyDatabase(user:User){if(!db)throw Error('Banco não configurado.');const ref=doc(db,'users',user.uid,'settings','app');const snap=await getDoc(ref);if(!snap.exists())await setDoc(ref,{timezone:'America/Sao_Paulo',updatedAt:serverTimestamp()});return true;}
export async function sendChat(config:Config,user:User,messages:Message[],signal:AbortSignal,turnId:string,attachment?:File,googleToken?:string){
 if(!config.apiBaseUrl)throw Error('O backend ainda não está conectado. Nenhuma mensagem foi enviada à IA.');
 const url=new URL(config.apiBaseUrl);if(url.protocol!=='https:'&&url.hostname!=='localhost')throw Error('A conexão do backend precisa usar HTTPS.');
 const [token,media]=await Promise.all([user.getIdToken(),attachment?encodeMedia(attachment):Promise.resolve(undefined)]);
 const response=await fetch(`${config.apiBaseUrl.replace(/\/$/,'')}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-Turn-Id':turnId,...(googleToken?{'X-Google-Token':googleToken}:{})},body:JSON.stringify({messages,...(media?{attachment:media}:{})}),signal});
 const data=await response.json().catch(()=>({error:'Resposta inválida do servidor.'}));
 if(!response.ok)throw Error(data.error||'Não foi possível conversar com o SIGMA.');
 if(typeof data.text!=='string'||!data.text.trim())throw Error('A IA não retornou uma resposta de texto.');
 if(data.saved!==true)throw Error('O backend não confirmou o salvamento. Atualize o Worker antes de usar a memória.');
 return data.text as string;
}
export function readableError(error:unknown){const code=(error as {code?:string})?.code;if(code==='auth/popup-closed-by-user')return 'Login cancelado. Você pode tentar novamente.';if(code==='auth/popup-blocked')return 'Permita a janela de login no navegador e tente novamente.';if(code==='auth/unauthorized-domain')return 'Este endereço precisa ser autorizado no Firebase para permitir o login Google.';if(code==='permission-denied')return 'Acesso ao banco negado. Confira o usuário autorizado e as regras do projeto.';return error instanceof Error?error.message:'Algo deu errado. Tente novamente.';}

export type Turn={id:string;userText:string;assistantText:string;createdAt:string};
export async function loadHistory(config:Config,user:User):Promise<Turn[]>{
 if(!config.apiBaseUrl)throw Error('Backend não configurado.');
 const r=await fetch(`${config.apiBaseUrl.replace(/\/$/,'')}/api/history`,{headers:{Authorization:`Bearer ${await user.getIdToken()}`},cache:'no-store'});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível recuperar o histórico.');return data.turns;
}

// ── Google Agenda e Drive (somente leitura) ───────────────────────────────
// O token do Google fica só na memória desta aba: não vai para o Firestore,
// não é registrado em log e expira sozinho em cerca de 1 hora. O SIGMA não
// tem permissão de escrita na agenda nem nos arquivos.
export const GOOGLE_SCOPES=['https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/drive.metadata.readonly'];

export type GoogleData={agenda:{summary:string;start:string}[];materiais:{name:string;modifiedTime:string}[];expired:boolean;errors:string[]};

export async function connectGoogle():Promise<string>{
 if(!auth?.currentUser)throw Error('Entre com sua conta Google antes de conectar a Agenda e o Drive.');
 const provider=new GoogleAuthProvider();
 for(const scope of GOOGLE_SCOPES)provider.addScope(scope);
 const result=await reauthenticateWithPopup(auth.currentUser,provider);
 const token=GoogleAuthProvider.credentialFromResult(result)?.accessToken;
 if(!token)throw Error('O Google não devolveu o acesso. Tente novamente e autorize Agenda e Drive na janela exibida.');
 return token;
}

export async function loadAgenda(config:Config,user:User,googleToken:string):Promise<GoogleData>{
 if(!config.apiBaseUrl)throw Error('Backend não configurado.');
 const response=await fetch(`${config.apiBaseUrl.replace(/\/$/,'')}/api/agenda`,{headers:{Authorization:`Bearer ${await user.getIdToken()}`,'X-Google-Token':googleToken},cache:'no-store'});
 const data=await response.json().catch(()=>({error:'Resposta inválida do servidor.'}));
 if(!response.ok)throw Error(data.error||'Não foi possível ler a Agenda e o Drive.');
 return data as GoogleData;
}
