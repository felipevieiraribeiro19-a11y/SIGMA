import assert from 'node:assert/strict';
const api=process.env.SIGMA_CHAT_LAB_URL;
if(!api?.startsWith('http://127.0.0.1:'))throw Error('Somente runtime local');
const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const res=await fetch(api+'/api/lab/chat',{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
 body:JSON.stringify({messages:[{role:'user',text:'texto fictício'}]})
});
assert.equal(res.status,503);
assert.equal(res.headers.get('Access-Control-Allow-Origin'),origin);
assert.equal((await res.json()).error,'Conversa real ainda desativada no laboratório.');
const blocked=await fetch(api+'/api/lab/chat',{
 method:'POST',headers:{Origin:'https://sigma-61328.web.app','Content-Type':'application/json'},
 body:'{}'
});
assert.equal(blocked.status,403);
assert.equal(blocked.headers.get('Access-Control-Allow-Origin'),null);
const options=await fetch(api+'/api/lab/chat',{method:'OPTIONS',headers:{Origin:origin}});
assert.equal(options.status,204);
assert.match(options.headers.get('Access-Control-Allow-Methods')||'',/POST/);
const invalidPath=await fetch(api+'/api/chat',{method:'POST',headers:{Origin:origin}});
assert.equal(invalidPath.status,404);
console.log('CHAT_LAB_HTTP_TESTS_PASSED');
