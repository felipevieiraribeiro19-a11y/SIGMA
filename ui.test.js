import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {Window} from 'happy-dom';import * as core from '../public/core.js';
test('interface: login, revisão, gravação, duplicação e limpeza de conta (SDK isolado)',async()=>{
 const w=new Window({url:'https://jarbas.test/#chat'});w.document.write(fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8').replace(/<script[^>]*>.*?<\/script>/gs,''));
 let authCallback;const stored=new Map(), writes=[];const ref=(db,...parts)=>({parts,key:parts.join('/')});
 const api={...core,window:w,document:w.document,location:w.location,confirm:()=>true,FormData:w.FormData,SpeechSynthesisUtterance:class{},firebaseConfig:{},secureApiBaseUrl:'https://worker.test',initializeApp:()=>({}),getAuth:()=>({}),getFirestore:()=>({}),GoogleAuthProvider:class{},signInWithPopup:async()=>{},signOut:async()=>{},onAuthStateChanged:(a,cb)=>authCallback=cb,collection:ref,doc:ref,query:(r,...args)=>({...r,args}),orderBy:()=>null,limit:()=>null,startAfter:()=>null,serverTimestamp:()=>({seconds:1792370000}),Timestamp:{fromMillis:n=>({seconds:n/1000})},getDoc:async r=>({data:()=>stored.get(r.key)}),getDocs:async r=>{const docs=[...stored].filter(([k])=>k.startsWith(r.key+'/')).map(([k,v])=>({id:k.split('/').at(-1),data:()=>v}));return {docs,size:docs.length};},setDoc:async(r,x)=>{stored.set(r.key,x);writes.push(r.key);},updateDoc:async(r,x)=>stored.set(r.key,{...stored.get(r.key),...x}),runTransaction:async(db,fn)=>fn({get:async r=>({exists:()=>stored.has(r.key)}),set:(r,x)=>{stored.set(r.key,x);writes.push(r.key);}})};
 const code=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'');new Function(...Object.keys(api),code)(...Object.values(api));
 await authCallback({uid:'test-user',email:'test@example.com',displayName:'Teste'});assert.equal(w.document.getElementById('workspace').hidden,false);
 const input=w.document.getElementById('prompt');input.value='Gastei R$ 45 de combustível.';w.document.getElementById('chatForm').onsubmit({preventDefault(){}});
 assert.equal(writes.length,0,'proposta não deve gravar automaticamente');const first=w.document.querySelector('#proposals button');first.click();await new Promise(r=>setTimeout(r,0));
 const form=w.document.getElementById('editForm');assert.equal(form.elements.amount.value,'45');const submit=form.querySelector('button[type=submit]');await form.onsubmit({preventDefault(){},target:form,submitter:submit});assert.equal(writes.length,1);assert.equal([...stored.values()].find(x=>x.amount)?.amount,45);
 first.click();await new Promise(r=>setTimeout(r,0));await form.onsubmit({preventDefault(){},target:form,submitter:submit});assert.equal(writes.length,1,'duplicata não deve gravar');

 // Study record and memory controls use the same user-scoped persistence.
 input.value='Hoje estudei duas horas de Contabilidade, acertei 18 de 25 questões';
 w.document.getElementById('chatForm').onsubmit({preventDefault(){}});
 w.document.querySelector('#proposals button').click();await new Promise(r=>setTimeout(r,0));
 assert.equal(form.elements.subject.value,'Contabilidade');
 await form.onsubmit({preventDefault(){},target:form,submitter:submit});
 assert.ok([...stored].some(([key,x])=>key.startsWith('users/test-user/studies/')&&x.minutes===120&&x.correct===18));
 assert.equal(w.document.getElementById('useMemory').checked,false);
 w.document.getElementById('useMemory').checked=true;
 await w.document.getElementById('settingsForm').onsubmit({preventDefault(){}});
 assert.equal(stored.get('users/test-user/settings/profile').useMemory,true);
 assert.equal(stored.get('users/test-user/settings/profile').useHistory,false);
 await authCallback(null);assert.equal(w.document.getElementById('workspace').hidden,true);assert.equal(input.value,'');assert.equal(w.document.getElementById('proposals').children.length,0);await w.happyDOM.abort();
});
