(function(){
  'use strict';
  const C=window.RevampCore,esc=C.escape,$=id=>document.getElementById(id);
  let takeoffDocument=null,selectedFile=null,takeoffAbort=null,aiAbort=null,draftTimer,lastAddedSignature='',undoRows=[];
  function notice(message){window.RevampUX.toast(message);}
  function status(message){if($('takeoffStatus')){$('takeoffStatus').textContent=message;$('takeoffStatus').setAttribute('role','status');}}
  function stage(id){if(typeof showCommandStage==='function')showCommandStage(id);}
  function updateSteps(n){document.querySelectorAll('.rx-takeoff-steps span').forEach((s,i)=>s.classList.toggle('current',i===n));}
  function draftKey(){const p=new URLSearchParams(location.search);return 'rx_estimate_'+(window.__currentUserId||'guest')+'_'+(p.get('job')||p.get('id')||p.get('room')||'new');}
  function snapshot(){return [...document.querySelectorAll('#estimateTable tbody tr')].map(tr=>[...tr.querySelectorAll('input')].map(i=>i.value));}
  function markDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>{if(window.RevampUX.save(draftKey(),{rows:snapshot(),notes:$('estimateNotes')?.value||'',saved:new Date().toISOString()})){if($('rxDraftStatus'))$('rxDraftStatus').textContent='Draft saved on this device · '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}},450);}
  function rowTools(){document.querySelectorAll('#estimateTable tbody tr').forEach(tr=>{if(tr.querySelector('.rx-remove-line'))return;const cell=document.createElement('td');const remove=document.createElement('button');remove.type='button';remove.className='rx-remove-line';remove.textContent='×';remove.setAttribute('aria-label','Remove estimate line');remove.onclick=()=>{undoRows.push(snapshot());tr.remove();recalcEstimate();markDraft();notice('Line removed. Use Undo to restore it.');};cell.append(remove);tr.append(cell);});}
  window.normalizeTakeoffItems=C.normalizeItems;
  window.renderTakeoffResults=function(data){
    latestTakeoffResult=data||{};const items=C.normalizeItems(data);const container=$('takeoffResults');if(!container)return;
    container.innerHTML=items.length?items.map((item,index)=>'<div class="takeoff-result-item"><div class="takeoff-result-top"><input aria-label="Include '+esc(item.name)+'" type="checkbox" class="takeoff-select" data-index="'+index+'" '+(item.qty!==null?'checked':'')+'><div><strong>'+esc(item.name)+'</strong><small>'+esc(item.notes)+'</small><div class="rx-row" style="margin-top:9px"><label for="rxQuantity'+index+'">Quantity</label><input class="rx-row-edit" id="rxQuantity'+index+'" type="number" min="0" step="0.01" data-quantity="'+index+'" value="'+(item.qty??'')+'" placeholder="Verify"><span>'+esc(item.unit)+'</span></div></div><span class="takeoff-confidence">'+esc(item.confidence)+'</span></div></div>').join(''):'No quantities were returned. Try a clearer plan or provide a known dimension.';
    container.querySelectorAll('[data-quantity]').forEach(input=>input.oninput=()=>{const index=Number(input.dataset.quantity);latestTakeoffResult.items[index].qty=input.value===''?null:C.quantity(input.value);delete latestTakeoffResult.items[index].quantity;input.setAttribute('aria-invalid',input.value===''||C.quantity(input.value)===null);});
    const notes=[...(data.warnings||[]),...(data.assumptions||[]),...(data.missing_info||[])];
    $('takeoffSummary').innerHTML='<strong>'+esc(data.summary||'Review each quantity before adding it to the estimate.')+'</strong>'+(data.sample?'<p>Illustrative sample results only. These are not measurements of your uploaded file.</p>':'')+(notes.length?'<ul>'+notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>':'')+'<p>Scale: '+(data.scale_found?'reported in the source; verify before use':'not confirmed')+' · '+items.length+' quantities</p>';
    updateSteps(2);
  };
  window.handleTakeoffFileChange=async function(event){
    takeoffAbort?.abort();latestTakeoffResult=null;$('takeoffResults').textContent='Prepare your plan, then run the takeoff.';$('takeoffSummary').textContent='Your findings and assumptions will appear here.';selectedFile=event.target.files?.[0]||null;takeoffDocument=null;
    if(!selectedFile)return;takeoffFileName=selectedFile.name;takeoffImageDataUrl='';
    if(selectedFile.size>30*1024*1024){status('Choose a file under 30 MB. Split large plan sets into smaller PDFs.');selectedFile=null;return;}
    status('Preparing '+selectedFile.name+'…');
    try{
      if(selectedFile.type==='application/pdf'||/\.pdf$/i.test(selectedFile.name)){
        await ensureRevampPdfJsLoaded();pdfjsLib.GlobalWorkerOptions.workerSrc='assets/vendor/pdf.worker.min.js';
        takeoffDocument=await pdfjsLib.getDocument({data:await selectedFile.arrayBuffer()}).promise;
        $('rxPageRange').value='1-'+Math.min(takeoffDocument.numPages,5);$('rxPageRange').disabled=false;$('rxPageHint').textContent=takeoffDocument.numPages+' pages in this PDF. Choose up to 20 per run.';
        takeoffImageDataUrl=await renderPage(1);
      }else if(/^image\/(png|jpeg|webp)$/i.test(selectedFile.type)){
        takeoffImageDataUrl=await imageFileToSafeDataUrl(selectedFile);$('rxPageRange').value='1';$('rxPageRange').disabled=true;$('rxPageHint').textContent='One image selected.';
      }else{throw new Error('Choose a PDF, JPG, PNG, or WebP. Export HEIC photos to JPG first.');}
      showTakeoffPreview(takeoffImageDataUrl);status(selectedFile.name+' is ready. Confirm the scale and scope before analyzing.');updateSteps(1);
    }catch(error){selectedFile=null;status('Could not open this file. '+error.message);}
  };
  async function renderPage(number){
    const page=await takeoffDocument.getPage(number);const original=page.getViewport({scale:1});const scale=Math.min(2,2200/Math.max(original.width,original.height));const viewport=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport}).promise;const image=canvas.toDataURL('image/jpeg',.86);canvas.width=canvas.height=0;page.cleanup();return image;
  }
  window.runAITakeoff=async function(){
    if(takeoffAbort)return;
    if(window.REVAMP_REVIEW){status('Live AI is not connected in this review. Your upload can be previewed; use “Try sample results” to test editing and estimating.');return;}
    if(!selectedFile||!takeoffImageDataUrl){status('Upload a readable plan or photo first.');$('takeoffFileInput')?.focus();return;}
    const button=$('rxRunTakeoff');let pages;
    try{pages=takeoffDocument?C.pageRange($('rxPageRange').value,takeoffDocument.numPages):[1];}catch(e){status(e.message);$('rxPageRange').focus();return;}
    takeoffAbort=new AbortController();const controller=takeoffAbort;button.disabled=true;$('rxCancelTakeoff').hidden=false;
    const combined={items:[],warnings:[],summary:'',scale_found:true,confidence:'review'};
    try{
      for(let offset=0;offset<pages.length;offset+=3){
        if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');const batch=pages.slice(offset,offset+3),images=[];
        for(const number of batch){status('Preparing page '+number+' · '+(offset+1)+' of '+pages.length+' selected pages');images.push({pageNumber:number,imageDataUrl:takeoffDocument?await renderPage(number):takeoffImageDataUrl});}
        status('Analyzing pages '+batch.join(', ')+'…');let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller.abort();},90000);
        let response;try{response=await fetch('/api/ai-takeoff',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({pages:images,context:getTakeoffProjectContext()})});}catch(e){if(timedOut)throw new Error('The request timed out. Try fewer pages.');throw e;}finally{clearTimeout(timeout);}
        const result=await response.json();if(!response.ok||result.error)throw new Error(result.error||'Could not analyze these pages. Try again.');
        combined.items.push(...(Array.isArray(result.items)?result.items:[]));combined.warnings.push(...(result.warnings||[]));combined.scale_found=combined.scale_found&&result.scale_found===true;combined.summary=[combined.summary,result.summary].filter(Boolean).join('\n');
      }
      combined.warnings=[...new Set(combined.warnings)];renderTakeoffResults(combined);status('Analysis complete. Verify quantities, remove repeated items, and add only what you need.');
    }catch(error){if(error.name==='AbortError'){status('Analysis cancelled. You can start again when ready.');}else{status('Analysis stopped: '+error.message);}if(combined.items.length){combined.warnings.push('Partial results only. One or more selected pages were not analyzed.');combined.summary='Partial analysis — review the missing pages before estimating.';renderTakeoffResults(combined);}}
    finally{takeoffAbort=null;button.disabled=false;$('rxCancelTakeoff').hidden=true;}
  };
  window.sendSelectedTakeoffToEstimate=function(){
    const items=C.normalizeItems(latestTakeoffResult);const selected=[...document.querySelectorAll('.takeoff-select:checked')].map(input=>items[Number(input.dataset.index)]);
    if(!selected.length){notice('Select at least one quantity first.');return;}
    if(selected.some(i=>i.qty===null||i.qty<=0)){notice('Enter a positive quantity for every selected line.');return;}
    undoRows.push(snapshot());selected.forEach(i=>addEstimateLine(i.name,i.qty,i.unit,i.unitCost,i.laborHours,i.laborRate));document.querySelectorAll('.takeoff-select').forEach(el=>el.checked=false);rowTools();markDraft();stage('smartCalculatorPanel');notice(selected.length+' quantities added. Review material prices and labor rates.');
  };
  const originalClear=window.clearTakeoffLab;window.clearTakeoffLab=function(){takeoffAbort?.abort();selectedFile=null;takeoffDocument?.destroy();takeoffDocument=null;originalClear();updateSteps(0);};
  window.addEstimateLine=function(item,qty,unit,unitCost,laborHours,laborRate){
    const tbody=document.querySelector('#estimateTable tbody');if(!tbody)return;
    const tr=document.createElement('tr');const values=[item??'New Item',qty??1,unit??'unit',unitCost??0,laborHours??0,laborRate??0];const classes=['','qty','','unitCost','laborHours','laborRate'];
    values.forEach((v,i)=>{const td=document.createElement('td');const input=document.createElement('input');input.className='table-input '+classes[i];input.type=[1,3,4,5].includes(i)?'number':'text';input.value=v;if(input.type==='number'){input.min='0';input.step=i===4?'0.25':'0.01';}input.setAttribute('aria-label',['Item','Quantity','Unit','Material price per unit','Labor hours','Hourly labor rate'][i]);td.append(input);tr.append(td);});
    const total=document.createElement('td');total.className='lineTotal';tr.append(total);tbody.append(tr);attachEstimateListeners();recalcEstimate();rowTools();markDraft();
  };
  window.addRow=function(){undoRows.push(snapshot());addEstimateLine('New item',1,'unit',0,0,0);};
  const oldSelect=window.selectCalculator;window.selectCalculator=function(type){
    const saved=window.RevampUX?.load('rx_calculator_'+type,{});oldSelect(type);
    document.querySelectorAll('#calculatorFields input').forEach(input=>{input.min='0';input.inputMode='decimal';if(saved&&saved[input.id]!==undefined)input.value=saved[input.id];input.setAttribute('aria-label',input.previousElementSibling?.textContent||input.id);});
    document.querySelectorAll('[data-rx-tool]').forEach(b=>b.classList.toggle('active',b.dataset.rxTool===type));window.calculateMaterials();
  };
  window.calculateMaterials=function(){
    const config=calculatorConfigs[activeCalculator]||calculatorConfigs.tile;let invalid=false;
    const values={};document.querySelectorAll('#calculatorFields input').forEach(input=>{const n=C.quantity(input.value);const isDenominator=/perBox|tileLength|tileWidth|spacing|coverage|sheet|boardWidth|rollWidth|rollLength|coatCoverage|bagYield/i.test(input.id);const bad=input.value===''||n===null||(isDenominator&&n===0);input.setAttribute('aria-invalid',bad);invalid=invalid||bad;values[input.id]=input.value;});
    if(invalid){lastCalcLineItem=null;$('calcResults').textContent='Enter valid dimensions. Sizes, spacing, and coverage must be greater than zero.';return false;}
    const metrics=config.calculate();if(metrics.some(item=>/Infinity|NaN/.test(String(item[1])))){lastCalcLineItem=null;$('calcResults').textContent='Check the dimensions and coverage values before calculating.';return false;}
    setCalcResults(metrics);try{localStorage.setItem('rx_calculator_'+activeCalculator,JSON.stringify(values));}catch{}return true;
  };
  window.pushCalcResultsToEstimate=function(){if(!calculateMaterials()||!lastCalcLineItem){notice('Check the calculator fields first.');return;}if(Number(lastCalcLineItem.qty)<=0){notice('Enter dimensions greater than zero.');return;}const signature=JSON.stringify(lastCalcLineItem);if(signature===lastAddedSignature&&Date.now()-(window.rxLastAdd||0)<1500)return;lastAddedSignature=signature;window.rxLastAdd=Date.now();undoRows.push(snapshot());const i=lastCalcLineItem;addEstimateLine(i.item,i.qty,i.unit,i.unitCost,i.laborHours,i.laborRate);notice('Added to your estimate. Review the suggested prices before sending.');$('calcEstimateTableWrap')?.scrollIntoView({behavior:'smooth',block:'center'});};
  window.sendAIMessage=async function(force=false){
    if(aiAbort)return;const input=$('aiChatInput');const request=input.value.trim()||(force?getFallbackJobPrompt():'');if(!request){input.focus();$('aiStatus').textContent='Describe the work or choose a suggested question below.';return;}
    if(window.REVAMP_REVIEW){$('aiStatus').textContent='Live AI is not connected in this review. Use the sample response to explore the workflow.';return;}
    aiAbort=new AbortController();const controller=aiAbort;const timeout=setTimeout(()=>controller.abort(),90000);$('aiSendBtn').disabled=true;$('aiEstimateBtn').disabled=true;$('rxCancelAI').hidden=false;$('aiStatus').textContent='Organizing your project notes…';
    try{
      const history=[...aiConversation.slice(-12),{role:'user',content:request}];const context=typeof getTakeoffProjectContext==='function'?getTakeoffProjectContext():{};
      const response=await fetch('/api/generate-estimate',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({description:request,context,conversation:history,estimate_lines:snapshot()})});const data=await response.json();if(!response.ok||data.error)throw new Error(data.error||'Please try again.');if(!data.result)throw new Error('The AI returned no text. Please try again.');
      addAIMessage('user',request);addAIMessage('assistant',data.result);aiConversation.push({role:'user',content:request},{role:'assistant',content:data.result});lastAIReply=data.result;input.value='';$('aiStatus').textContent='Ready for your review. Copy useful details to your proposal notes.';
    }catch(error){$('aiStatus').textContent=error.name==='AbortError'?'Request stopped or timed out. Your notes are still here; try again when ready.':'Could not finish: '+error.message;}finally{clearTimeout(timeout);aiAbort=null;$('aiSendBtn').disabled=false;$('aiEstimateBtn').disabled=false;$('rxCancelAI').hidden=true;}
  };
  function sampleTakeoff(){renderTakeoffResults({sample:true,summary:'Sample kitchen takeoff — demonstrates editing and transfer to an estimate.',scale_found:true,confidence:'sample',warnings:['Illustrative 14 × 12 ft room. These values do not come from your uploaded plan.','Check openings, layout, product coverage, and actual site dimensions.'],items:[{item:'Kitchen floor area',qty:168,unit:'sqft',notes:'14 ft × 12 ft. Net sample floor area.'},{item:'Floor material allowance with 10% waste',qty:184.8,unit:'sqft',notes:'Use instead of the net area if pricing material; do not double count.'},{item:'Baseboard before openings',qty:52,unit:'LF',notes:'2 × (14 + 12). Deduct doorways and cabinet runs.'}]});status('Sample results loaded. Select the lines you want, edit quantities, and add them to the estimate.');}
  function restoreRows(rows){const body=document.querySelector('#estimateTable tbody');body.textContent='';rows.forEach(v=>addEstimateLine(...v.slice(0,6)));rowTools();recalcEstimate();}
  function init(){
    document.body.classList.add('rx-room');document.body.classList.toggle('light-room',localStorage.getItem('revamplex_project_room_theme')!=='dark');
    if(typeof setProjectRoomTheme==='function')setProjectRoomTheme('light');
    const names={'3D Estimate Lab':'Trade calculators','AI Take-Off Lab':'Plan takeoff','AI Proposal Studio':'AI & proposals','Files + Evidence':'Files & photos','Live Room':'Messages & video','Approval Console':'Review & approve','Revamp Command Deck':'Your Project Room'};
    const oldBuild=window.buildCommandDeck;window.buildCommandDeck=function(){oldBuild();document.querySelectorAll('.command-title,.command-card strong').forEach(el=>{el.textContent=names[el.textContent]||el.textContent;});};if(typeof buildCommandDeck==='function')buildCommandDeck();
    const oldStage=window.showCommandStage;window.showCommandStage=function(id){oldStage(id);document.querySelectorAll('[data-command-target]').forEach(b=>b.setAttribute('aria-current',b.dataset.commandTarget===id?'step':'false'));const role=typeof getWorkspaceRole==='function'?getWorkspaceRole():'contractor';const next=id==='projectOverviewPanel'&&role==='homeowner'?['Review the proposals shared with you.','Review private bids','receivedBidsSection']:nextActions[id];const panel=$(id);if(panel&&next&&!panel.querySelector('.rx-next-action')){const n=document.createElement('div');n.className='rx-next-action';n.innerHTML='<span>'+esc(next[0])+'</span><button class="rx-button primary" type="button">'+esc(next[1])+' →</button>';n.querySelector('button').onclick=()=>stage(next[2]);panel.append(n);}if(id==='signaturePanel'&&typeof resizeSignatureCanvas==='function')resizeSignatureCanvas();};
    if($('takeoffLabPanel')){
      const panel=$('takeoffLabPanel');panel.querySelector('h3').textContent='From plans to clear quantities';const p=panel.querySelector('.panel-header p');if(p)p.textContent='Upload a plan, choose the pages and scope, then review every quantity before it enters your estimate.';
      const steps=document.createElement('div');steps.className='rx-takeoff-steps';steps.innerHTML='<span class="current">1 · Upload a plan</span><span>2 · Set scope & scale</span><span>3 · Review quantities</span><span>4 · Add to estimate</span>';panel.querySelector('.panel-header').after(steps);
      const file=$('takeoffFileInput');file.accept='.pdf,.jpg,.jpeg,.png,.webp';const zone=document.createElement('div');zone.className='rx-dropzone';file.before(zone);zone.innerHTML='<p><strong>Drop a plan here</strong><br>PDF, JPG, PNG, or WebP · up to 30 MB</p>';zone.append(file);zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragging');});zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragging');if(e.dataTransfer.files.length){file.files=e.dataTransfer.files;handleTakeoffFileChange({target:file});}});
      const pages=document.createElement('div');pages.innerHTML='<label for="rxPageRange">Pages to analyze</label><input id="rxPageRange" value="1" placeholder="1, 3-5" aria-describedby="rxPageHint"><small id="rxPageHint">Choose up to 20 pages per run. Images use page 1.</small>';zone.after(pages);
      const run=panel.querySelector('[onclick="runAITakeoff()"]');run.id='rxRunTakeoff';run.textContent='Analyze selected pages';
      const cancel=document.createElement('button');cancel.id='rxCancelTakeoff';cancel.type='button';cancel.className='btn btn-soft';cancel.textContent='Cancel analysis';cancel.hidden=true;cancel.onclick=()=>takeoffAbort?.abort();run.after(cancel);
      if(window.REVAMP_REVIEW){const sample=document.createElement('button');sample.className='btn btn-soft';sample.type='button';sample.textContent='Try sample results';sample.onclick=sampleTakeoff;run.after(sample);}
      $('takeoffStatus').setAttribute('aria-live','polite');
    }
    const calc=$('smartCalculatorPanel');if(calc){calc.querySelector('h3').textContent='Your trade. Your numbers.';const controls=document.createElement('div');controls.innerHTML='<input type="search" class="rx-tool-search" aria-label="Find a trade calculator" placeholder="Find a calculator: tile, paint, concrete…"><div class="rx-tool-grid">'+Object.entries(calculatorConfigs).map(([key,config])=>'<button type="button" data-rx-tool="'+esc(key)+'">'+esc(config.name.replace(' Calculator',''))+'</button>').join('')+'</div>';calc.querySelector('.panel-header').after(controls);controls.querySelector('input').oninput=e=>controls.querySelectorAll('button').forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(e.target.value.toLowerCase()));controls.querySelectorAll('button').forEach(b=>b.onclick=()=>{selectCalculator(b.dataset.rxTool);$('calculatorFields').scrollIntoView({block:'center',behavior:'smooth'});});
      const note=document.createElement('div');note.className='rx-calc-note';note.textContent='Quantities update as you type. Material prices and labor rates are editable planning allowances; confirm them for your project. Coverage varies by product.';$('calcResults').after(note);
      const toolbar=document.createElement('div');toolbar.className='rx-row';toolbar.style.margin='14px 0';toolbar.innerHTML='<button class="rx-button small" id="rxUndoEstimate" type="button">↶ Undo last change</button><button class="rx-button small" id="rxExportCSV" type="button">Export line items</button><span class="rx-draft-status" id="rxDraftStatus" role="status">Your draft saves on this device.</span>';$('calcEstimateTableWrap').before(toolbar);
      $('rxUndoEstimate').onclick=()=>{const rows=undoRows.pop();if(!rows)return notice('No changes to undo yet.');restoreRows(rows);markDraft();};$('rxExportCSV').onclick=()=>{const csv=[['Item','Quantity','Unit','Material unit cost','Labor hours','Hourly labor rate'],...snapshot()].map(row=>row.map(v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');downloadText(csv,'RevampLEX_Estimate.csv','text/csv');};
      calc.addEventListener('input',e=>{if(e.target.closest('#estimateTable')){if(e.target.type==='number'&&Number(e.target.value)<0)e.target.value='0';recalcEstimate();markDraft();}});$('estimateNotes')?.addEventListener('input',markDraft);rowTools();
      const draft=window.RevampUX.load(draftKey(),null);if(draft?.rows?.length){restoreRows(draft.rows);if($('estimateNotes'))$('estimateNotes').value=draft.notes||'';$('rxDraftStatus').textContent='Restored your draft from this device.';}selectCalculator('tile');
    }
    const ai=$('aiChatInput');if(ai){ai.placeholder='Describe the work, dimensions, materials, location, and what should be excluded…';const prompts=document.createElement('div');prompts.className='rx-ai-prompts';const suggestions=[['Build a scope','Organize this project into a clear scope of work, exclusions, assumptions, and questions to confirm.'],['Check what is missing','Review this project and list missing measurements, material choices, and details needed before pricing.'],['Review my estimate','Review my current line items for omissions, duplicate quantities, and unclear labor or material allowances.'],['Explain it to the homeowner','Explain this project scope in plain language for the homeowner without inventing prices or promises.']];prompts.innerHTML=suggestions.map(([name],i)=>'<button type="button" data-prompt="'+i+'">'+esc(name)+'</button>').join('');ai.before(prompts);prompts.querySelectorAll('button').forEach(b=>b.onclick=()=>{ai.value=suggestions[Number(b.dataset.prompt)][1]+'\n\nProject: '+($('jobTitle')?.textContent||'')+'\n'+(window.currentJob?.description||'');ai.focus();});
      const cancel=document.createElement('button');cancel.id='rxCancelAI';cancel.type='button';cancel.className='btn btn-soft';cancel.textContent='Cancel';cancel.hidden=true;cancel.onclick=()=>aiAbort?.abort();$('aiSendBtn').after(cancel);
      if(window.REVAMP_REVIEW){const sample=document.createElement('button');sample.type='button';sample.className='btn btn-soft';sample.textContent='Try sample response';sample.onclick=()=>{const reply='SAMPLE RESPONSE — not generated from your uploaded file.\n\nKitchen scope to review\n1. Protect adjoining surfaces and confirm appliance dimensions.\n2. Remove agreed finishes and dispose of debris.\n3. Prepare the substrate and install the selected flooring and backsplash.\n4. Coordinate cabinetry, lighting, and paint selections.\n5. Complete a joint walkthrough.\n\nConfirm before pricing: actual floor area, demolition extent, substrate condition, cabinet layout, electrical scope, finish selections, and permit responsibilities.\n\nAllowances and exclusions: enter supplier prices, local labor rates, unforeseen-condition allowances, and the agreed tax treatment. No final price is implied.';addAIMessage('assistant',reply);lastAIReply=reply;$('aiStatus').textContent='Sample response. You can copy it into proposal notes and edit it.';};$('aiEstimateBtn').after(sample);}
      $('aiStatus').setAttribute('role','status');
    }
    const target=new URLSearchParams(location.search).get('tool');const initial={takeoff:'takeoffLabPanel',calculators:'smartCalculatorPanel',ai:'estimateProposalPanel'}[target]||'projectOverviewPanel';stage(initial);
    if(window.REVAMP_REVIEW){const label=$('userEmail');if(label)label.textContent='Design review';document.querySelectorAll('a[href^="mailto:"]').forEach(a=>a.onclick=e=>{e.preventDefault();notice('Email invitations are disabled in the design review.');});}
  }
  function downloadText(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const nextActions={projectOverviewPanel:['Choose the next step for your project.','Open shared files','photoDocsPanel'],takeoffLabPanel:['Ready to price your reviewed quantities?','Build the estimate','smartCalculatorPanel'],smartCalculatorPanel:['Your quantities and pricing are ready for a final review.','Open AI & proposals','estimateProposalPanel'],estimateProposalPanel:['Check the scope, terms, and total before requesting approval.','Review approval','signaturePanel'],photoDocsPanel:['Keep decisions and questions with the project.','Open messages','videoChatPanel']};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(init,1100));
})();
