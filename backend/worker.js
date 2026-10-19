export default { async fetch(request) { return new Response(JSON.stringify({error:'BACKEND_NOT_CONFIGURED'}), {status:503,headers:{'content-type':'application/json'}}); } };
