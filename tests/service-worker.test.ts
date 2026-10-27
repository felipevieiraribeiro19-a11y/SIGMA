import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function harness(offline=false){
 const handlers:any={},stored=new Map<string,Response>(),calls:string[]=[];
 const cache={match:async(k:any)=>stored.get(typeof k==='string'?k:new URL(k.url).pathname)?.clone(),put:async(k:any,r:Response)=>{stored.set(typeof k==='string'?k:new URL(k.url).pathname,r.clone())}};
 const context={URL,Response,AbortSignal,Set,Promise,self:{location:{origin:'https://sigma.test'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name:string,fn:any)=>handlers[name]=fn},caches:{open:async()=>cache,match:cache.match},fetch:async(input:any)=>{const path=typeof input==='string'?input:new URL(input.url).pathname;calls.push(path);if(offline)throw Error('offline');return new Response(path==='/'?'<html>new<script src="/assets/new.js"></script></html>':path.endsWith('.html')?'<html>orb</html>':'asset',{headers:{'Content-Type':path==='/'||path.endsWith('.html')?'text/html':'text/javascript'}})}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 return {handlers,stored,calls,async fetch(path:string){let response:any;const waits:Promise<any>[]=[];handlers.fetch({request:{method:'GET',url:'https://sigma.test'+path,mode:'navigate'},respondWith:(r:any)=>response=r,waitUntil:(p:any)=>waits.push(p)});const result=await response;await Promise.all(waits);return result;}};
}
test('online navigation returns fresh HTML and saves its assets',async()=>{const h=harness();h.stored.set('/',new Response('old'));assert.match(await(await h.fetch('/')).text(),/new/);assert.ok(h.stored.has('/assets/new.js'));});
test('offline orb uses its own HTML instead of app shell',async()=>{const h=harness(true);h.stored.set('/',new Response('app'));h.stored.set('/sigma-orb.html',new Response('orb'));assert.equal(await(await h.fetch('/sigma-orb.html')).text(),'orb');assert.equal(await(await h.fetch('/')).text(),'app');});
test('config and auth helper are never intercepted or cached',async()=>{const h=harness();assert.equal(await h.fetch('/config.json'),undefined);assert.equal(await h.fetch('/__/auth/handler'),undefined);assert.equal(h.calls.length,0);});
test('install precaches independent orb and hashed assets',async()=>{const h=harness();let done:any;h.handlers.install({waitUntil:(p:any)=>done=p});await done;assert.ok(h.stored.has('/sigma-orb.html'));assert.ok(h.stored.has('/assets/new.js'));});
