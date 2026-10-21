// Execute ONLY inside local Firebase Emulator. No live Firebase project or user data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,getDocs} from 'firebase/firestore';

const projectId='sigma-jarvis-memory-test';
const rules=readFileSync('firestore.memory.rules.candidate','utf8');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore Emulator must be running. Refusing to access production.');
const env=await initializeTestEnvironment({
 projectId,
 firestore:{host:'127.0.0.1',port:8081,rules}
});
const ownerEmail='felipevieiraribeiro19@gmail.com';
const goodClaims={email:ownerEmail,email_verified:true,firebase:{sign_in_provider:'google.com'}};
const user=env.authenticatedContext('owner_fictional',goodClaims);
const intruder=env.authenticatedContext('other_fictional',{email:'outsider@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}});
const wrongOwnerEmail=env.authenticatedContext('owner_fictional',{...goodClaims,email:'outsider@example.test'});
const anonymous=env.unauthenticatedContext();
const path='users/owner_fictional/personalMemories/fictional_001';
const sample={
 ownerUid:'owner_fictional',kind:'preference',content:'Exemplo completamente fictício',
 revision:1,schemaVersion:1,verification:'confirmed',retention:'until-deleted',
 createdAt:new Date('2026-10-21T12:00:00Z'),updatedAt:new Date('2026-10-21T12:00:00Z'),
 provenance:[{sourceId:'turn_fake_001',sourceKind:'conversation',observedAt:new Date('2026-10-21T12:00:00Z')}]
};
let failures=0;
async function check(name,operation){
 try{await operation();console.log('PASS '+name);}
 catch(error){failures++;console.error('FAIL '+name, String(error).slice(0,500));}
}
try{
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),path),sample);
 });
 await check('verified owner can read dedicated memory',()=>assertSucceeds(getDoc(doc(user.firestore(),path))));
 await check('other user cannot read',()=>assertFails(getDoc(doc(intruder.firestore(),path))));
 await check('anonymous cannot read',()=>assertFails(getDoc(doc(anonymous.firestore(),path))));
 await check('user with wrong owner email cannot read',()=>assertFails(getDoc(doc(wrongOwnerEmail.firestore(),path))));
 await check('owner can query own memories',()=>assertSucceeds(getDocs(collection(user.firestore(),'users/owner_fictional/personalMemories'))));
 await check('other user cannot query owner memories',()=>assertFails(getDocs(collection(intruder.firestore(),'users/owner_fictional/personalMemories'))));
 await check('owner direct create is rejected despite valid data',()=>assertFails(setDoc(doc(user.firestore(),'users/owner_fictional/personalMemories/fictional_002'),sample)));
 await check('owner direct update is rejected despite valid revision',()=>assertFails(updateDoc(doc(user.firestore(),path),{content:'Conteúdo adulterado',revision:2})));
 await check('owner direct deletion rejected',()=>assertFails(deleteDoc(doc(user.firestore(),path))));
 await check('owner cannot replace memory with tombstone',()=>assertFails(setDoc(doc(user.firestore(),path),{deleted:true,revision:2})));
 await check('owner cannot rewrite existing memory by setDoc',()=>assertFails(setDoc(doc(user.firestore(),path),sample)));
 await check('other user direct create rejected',()=>assertFails(setDoc(doc(intruder.firestore(),'users/other_fictional/personalMemories/fictional_003'),sample)));
 await check('legacy chat conversation read still allowed',async()=>{
  await env.withSecurityRulesDisabled(async ctx=>{
   await setDoc(doc(ctx.firestore(),'users/owner_fictional/turns/fictional_turn'),{
    userText:'Pergunta fictícia',assistantText:'Resposta fictícia',createdAt:new Date()
   });
  });
  await assertSucceeds(getDoc(doc(user.firestore(),'users/owner_fictional/turns/fictional_turn')));
 });
 await check('unknown collections remain private',()=>assertFails(getDoc(doc(user.firestore(),'users/owner_fictional/arbitrary/secret'))));
 if(failures)throw new Error(failures+' Firestore Rules checks failed.');
 console.log('All 14 memory security emulator checks passed.');
}finally{
 await env.cleanup();
}
