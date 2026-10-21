/** Provedores são selecionados pelo servidor. Nunca recebem segredo do navegador. */
export type ModelProviderId='gemini'|'openai'|'anthropic'|'deepseek'|'local';
export type ProviderStatus='connected'|'planned';
export type ModelProviderDescriptor={id:ModelProviderId;name:string;status:ProviderStatus;notes:string};
export const DEFAULT_PROVIDER:ModelProviderId='gemini';
export function listModelProviders():ModelProviderDescriptor[]{
 return [
  {id:'gemini',name:'Google Gemini',status:'connected',notes:'Único provedor ativo na fase de fundação'},
  {id:'openai',name:'OpenAI',status:'planned',notes:'Exige implementação e credencial de API próprias'},
  {id:'anthropic',name:'Anthropic Claude',status:'planned',notes:'Exige implementação e credencial de API próprias'},
  {id:'deepseek',name:'DeepSeek',status:'planned',notes:'Exige implementação e credencial de API próprias'},
  {id:'local',name:'Modelo local',status:'planned',notes:'Depende de infraestrutura compatível e recursos disponíveis'}
 ];
}
export function buildGeminiRequest(
 model:string,key:string,body:unknown,timeoutMs:number
):{url:string;init:RequestInit}{
 if(!model||!key)throw new Error('Provedor Gemini não configurado.');
 const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';
 return {url,init:{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:AbortSignal.timeout(timeoutMs),body:JSON.stringify(body)}};
}
