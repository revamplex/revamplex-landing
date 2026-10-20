export const cleanText=(value,max=1000)=>typeof value==='string'?value.slice(0,max):value==null?'':String(value).slice(0,max);
export function readAIText(data){if(typeof data?.output_text==='string')return data.output_text;return (data?.output||[]).flatMap(item=>item.content||[]).filter(c=>typeof c.text==='string').map(c=>c.text).join('\n').trim();}
export async function callAI(payload){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),80000);
  try{const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok){const error=new Error('Upstream AI request failed');error.status=response.status===429?429:502;error.publicMessage=response.status===429?'The AI service is busy. Wait a moment and try again.':'The AI service could not complete the request. Please try again.';throw error;}if(data.status==='incomplete'){const error=new Error('Incomplete output');error.publicMessage='The response was incomplete. Try fewer pages or a shorter request.';throw error;}return data;}catch(error){if(error.name==='AbortError'){error.status=504;error.publicMessage='The AI request timed out. Try fewer pages or a shorter request.';}throw error;}finally{clearTimeout(timeout);}
}
export function normalizeTakeoff(data){
  if(!data||typeof data!=='object'||!Array.isArray(data.items))return null;
  const numberOrNull=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
  const items=data.items.slice(0,250).map(i=>({item:cleanText(i.item||i.name||'Quantity to review',500),qty:numberOrNull(i.qty??i.quantity),unit:cleanText(i.unit||'unit',40),trade:cleanText(i.trade,150),page:numberOrNull(i.page),notes:cleanText(i.notes,2000),confidence:['low','medium','high'].includes(i.confidence)?i.confidence:'review'}));
  return {summary:cleanText(data.summary,6000),scale_found:data.scale_found===true,confidence:['low','medium','high'].includes(data.confidence)?data.confidence:'low',items,warnings:(Array.isArray(data.warnings)?data.warnings:[]).map(w=>cleanText(w,1500)).slice(0,30)};
}
