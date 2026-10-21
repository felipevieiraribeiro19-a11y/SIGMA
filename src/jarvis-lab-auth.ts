import {initializeApp,getApps,getApp} from 'firebase/app';
import {
 getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged,
 setPersistence,browserSessionPersistence,type Auth,type User
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
 await setPersistence(instance,browserSessionPersistence);
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
export function readableLabAuthError(error:unknown){
 const code=(error as {code?:string})?.code;
 if(code==='auth/unauthorized-domain')
  return 'O domínio temporário precisa ser autorizado em Firebase Authentication → Settings → Authorized domains. Ainda não alterei essa configuração.';
 if(code==='auth/popup-blocked'||code==='auth/operation-not-supported-in-this-environment')
  return 'O navegador bloqueou o login em janela. Abra o laboratório em uma aba normal do Safari e tente novamente.';
 if(code==='auth/popup-closed-by-user')return 'Login cancelado.';
 return 'Não foi possível autenticar. Nenhum dado foi enviado ao SIGMA.';
}
