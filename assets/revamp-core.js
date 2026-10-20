(function(root){
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function pageRange(value,total){
    if(!Number.isInteger(total)||total<1) throw new Error('This PDF has no readable pages.');
    const result=new Set();
    for(const chunk of String(value||'1').split(',')){
      const match=chunk.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if(!match) throw new Error('Use page numbers such as 1, 3-5.');
      const first=Number(match[1]),last=Number(match[2]||first);
      if(first<1||last<first||last>total) throw new Error('Choose pages between 1 and '+total+'.');
      if(last-first>19) throw new Error('Analyze up to 20 pages at a time.');
      for(let n=first;n<=last;n++) result.add(n);
    }
    if(result.size>20) throw new Error('Analyze up to 20 pages at a time.');
    return [...result].sort((a,b)=>a-b);
  }
  function quantity(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;}
  function normalizeItems(data){
    return (Array.isArray(data?.items)?data.items:[]).map((item,index)=>({
      id:'takeoff-'+index,name:String(item.name||item.item||'Quantity to review'),
      qty:quantity(item.quantity??item.qty),unit:String(item.unit||'unit'),
      unitCost:quantity(item.suggested_material_unit_cost??item.unitCost)??0,
      laborHours:quantity(item.suggested_labor_hours??item.laborHours)??0,
      laborRate:quantity(item.suggested_labor_rate??item.laborRate)??0,
      confidence:String(item.confidence||data.confidence||'review'),
      notes:String(item.notes||'Verify against the drawing.'),page:item.page??item.pageNumber??null
    }));
  }
  const api={escape,pageRange,quantity,normalizeItems};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.RevampCore=api;
})(typeof window!=='undefined'?window:globalThis);
