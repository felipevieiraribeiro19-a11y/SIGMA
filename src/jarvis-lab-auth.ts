import {initializeApp,getApps,getApp} from 'firebase/app';
import {
 getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged,
 setPersistence,browserSessionPersistence,inMemoryPersistence,type Auth,type User
} from 'firebase/auth';

/**
 * Firebase WEB client configuration is public, not a service-account key.
 * This module uses Authentication ONLY (no Firestore, Cloudflare, Drive or Calendar).
 * Login on a Hosting preview URL requires that exact domain be authorized in Firebase Auth.
 */
const labFirebaseWebConfig={
 apiKey:'AIzaSyATKvVBCZ18LzCGo_n4_JfakKALQiF-DIE',
 authDomain:'sigma-61328.firebaseapp.com',
 projectId:'sigma-61328',
 appId:'1:428047765465:web:115213b786cf0a151b13c8'
};
let auth:Auth|undefined;
export async function prepareLabAuth(onUser:(user:User|null)=>void):Promise<()=>void>{
 const app=getApps().length?getApp():initializeApp(labFirebaseWebConfig);
 const instance=getAuth(app);
 try{
  await setPersistence(instance,browserSessionPersistence);
 }catch(error){
  // Embedded browsers may forbid Web Storage. Use volatile memory only in this case.
  if((error as {code?:string})?.code!=='auth/web-storage-unsupported')throw error;
  await setPersistence(instance,inMemoryPersistence);
 }
 auth=instance;
 return onAuthStateChanged(instance,onUser);
}
export async function loginLab():Promise<void>{
 if(!auth)throw Error('A autenticação do laboratório ainda não está pronta.');
 const provider=new GoogleAuthProvider();
 provider.setCustomParameters({prompt:'select_account'});
 await signInWithPopup(auth,provider);
}
export async function logoutLab():Promise<void>{
 if(auth)await signOut(auth);
}
/** Public, non-sensitive codes only. Never display tokens, raw provider errors or emails. */
export function readableLabAuthError(error:unknown){
 const raw=(error as {code?:unknown})?.code;
 const code=typeof raw==='string'&&/^auth\/[a-z0-9-]{1,70}$/.test(raw)?raw:'auth/unknown';
 switch(code){
  case 'auth/unauthorized-domain':
   return 'Domínio temporário não autorizado no Firebase Authentication. Código: '+code+'. É necessário autorizar este endereço em Firebase Authentication → Settings → Authorized domains.';
  case 'auth/popup-blocked':
  case 'auth/operation-not-supported-in-this-environment':
  case 'auth/web-storage-unsupported':
   return 'O navegador bloqueou o login Google. Abra esta página diretamente no Safari (fora do ChatGPT) e tente novamente. Código: '+code;
  case 'auth/popup-closed-by-user':
   return 'A janela do login Google foi fechada antes da conclusão. Código: '+code;
  case 'auth/cancelled-popup-request':
   return 'Uma tentativa de login interrompeu a outra. Toque apenas uma vez e tente novamente. Código: '+code;
  case 'auth/network-request-failed':
   return 'Falha de conexão com o Google. Confira sua internet e tente no Safari. Código: '+code;
  case 'auth/operation-not-allowed':
   return 'O provedor Google precisa estar habilitado no Firebase Authentication. Código: '+code;
  case 'auth/too-many-requests':
   return 'Muitas tentativas de login. Aguarde o desbloqueio do Firebase. Código: '+code;
  case 'auth/invalid-api-key':
   return 'Configuração da autenticação Firebase inválida. Código: '+code;
  case 'auth/internal-error':
   return 'O Firebase falhou ao autenticar. Abra diretamente no Safari e tente novamente. Código: '+code;
  default:
   return 'Falha de autenticação Google. Abra no Safari e informe somente este código (sem compartilhar dados pessoais): '+code;
 }
}
