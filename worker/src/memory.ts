import {HttpError} from './validation';
export type Turn={id:string;userText:string;assistantText:string;createdAt:string};
export function memoryStore(project:string,uid:string,token:string,transport:typeof fetch=fetch){
 const root=`projects/${project}/databases/(default)/documents`;
 const parent=`${root}/users/${encodeURIComponent(uid)}`;
 const headers={'Authorization':token,'Content-Type':'application/json'};
 async function call(path:string,body:unknown){const r=await transport(`https://firestore.googleapis.com/v1/${path}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new HttpError(503,'Não foi possível acessar a memória no Firebase. Confira a conexão e as permissões.');return r.json() as Promise<any>}
 return {
 async recent():Promise<Turn[]>{const rows=await call(`${parent}:runQuery`,{structuredQuery:{from:[{collectionId:'turns'}],orderBy:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'}],limit:100}});if(!Array.isArray(rows))throw new HttpError(503,'Resposta inválida da memória.');return rows.filter(r=>r.document).map(r=>{const d=r.document;return {id:d.name.split('/').pop(),userText:d.fields.userText.stringValue,assistantText:d.fields.assistantText.stringValue,createdAt:d.fields.createdAt.timestampValue}}).reverse()},
 async save(id:string,userText:string,assistantText:string){await call(`${root}:commit`,{writes:[{update:{name:`${parent}/turns/${id}`,fields:{userText:{stringValue:userText},assistantText:{stringValue:assistantText}}},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}],currentDocument:{exists:false}}]})}
 }
}
