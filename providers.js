// Extend this server-only interface after explicit cost approval and provider tests.
// Never silently route a failed Gemini request to a paid provider.
export function getProvider(name='gemini') {
  if(name!=='gemini')throw Error('PROVIDER_NOT_ENABLED');
  return {async generate({model,key,payload,fetcher=fetch}) {
    return fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
      signal:AbortSignal.timeout(25000),body:JSON.stringify(payload)
    });
  }};
}
