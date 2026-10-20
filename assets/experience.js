(function(){
  'use strict';
  const esc=window.RevampCore.escape;
  const page=location.pathname.split('/').pop()||'index.html';
  const role=()=>localStorage.getItem('rx_review_role')||localStorage.getItem('revamplex_role')||'homeowner';
  const room=()=>window.REVAMP_REVIEW?'project-room.html?job=1001&mode='+role():'dashboard.html?section=project_rooms';
  function toast(message){let el=document.getElementById('rxToast');if(!el){el=document.createElement('div');el.id='rxToast';el.className='rx-toast';el.setAttribute('role','status');document.body.append(el);}el.textContent=message;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,4300);}
  function load(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
  function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{toast('Your browser could not save this. Please check available storage.');return false;}}
  function dialog(title,content){const old=document.querySelector('.rx-dialog');old?.remove();const el=document.createElement('dialog');el.className='rx-dialog';el.innerHTML='<button class="rx-close" aria-label="Close dialog">×</button><h2>'+esc(title)+'</h2>'+content;document.body.append(el);el.querySelector('.rx-close').onclick=()=>el.close();el.addEventListener('click',e=>{if(e.target===el)el.close();});el.addEventListener('close',()=>el.remove());el.showModal();return el;}
  window.RevampUX={toast,load,save,dialog,room,role};
  function setup(){
    document.body.classList.add('rx-experience');
    document.body.classList.add(page==='map.html'?'rx-map':page==='project-room.html'?'rx-room':page==='dashboard.html'?'rx-dashboard':'rx-support');
    const navigation=document.createElement('nav');navigation.className='rx-nav';navigation.setAttribute('aria-label','Main navigation');
    navigation.innerHTML='<a class="rx-brand" href="index.html" aria-label="ReVampLEX home"><img src="revamplex-logo.png" alt="ReVampLEX"></a><div class="rx-links">'+[
      ['index.html','Discover'],['map.html','Explore the map'],['community.html','Inspiration'],[room(),'My projects']
    ].map(([href,label])=>'<a href="'+href+'" '+(page===href.split('?')[0]?'aria-current="page"':'')+'>'+label+'</a>').join('')+'</div><div class="rx-nav-action"><a class="rx-button primary" href="map.html?action=post">＋ Start a project</a><a class="rx-avatar" href="dashboard.html" aria-label="My account">'+(window.REVAMP_REVIEW?'DE':'ME')+'</a></div>';
    document.body.prepend(navigation);
    const skip=document.createElement('a');skip.className='rx-skip';skip.href='#rxMain';skip.textContent='Skip to content';document.body.prepend(skip);
    const main=document.querySelector('main,.app-shell,.container,#app');if(main&&!document.getElementById('rxMain'))main.id=main.id||'rxMain';if(main?.id)skip.href='#'+main.id;
    if(window.REVAMP_REVIEW){
      const bar=document.createElement('div');bar.className='rx-review-bar';bar.innerHTML='<strong>PRIVATE DESIGN REVIEW</strong><span>Sample data · changes stay in this browser · live site unchanged</span><label>Try as <select aria-label="Preview role"><option value="homeowner">Homeowner</option><option value="contractor">Contractor</option></select></label><button type="button" id="rxReviewHelp">What can I test?</button>';document.body.prepend(bar);
      bar.querySelector('select').value=role();bar.querySelector('select').onchange=e=>{localStorage.setItem('rx_review_role',e.target.value);localStorage.setItem('revamplex_role',e.target.value);const url=new URL(location.href);url.searchParams.set('mode',e.target.value);url.searchParams.set('view',e.target.value);location.href=url;};
      document.getElementById('rxReviewHelp').onclick=()=>dialog('Your design review','<p>Explore both roles using the selector above.</p><ul><li>Browse and filter the map, or switch to a full project list.</li><li>Save ideas, react to projects, and try comments.</li><li>Open My projects for the sample Project Room.</li><li>Try every trade calculator, edit quantities, and export a proposal.</li><li>Upload a plan to preview it. Choose “Try sample results” to explore the takeoff workflow.</li></ul><div class="rx-notice">Live AI, outgoing notifications, payments, invitations, and video calls are not connected in this review. Nothing here changes a real customer record. Sample AI output is labeled.</div><button class="rx-button" id="rxResetReview">Reset my review data</button>');
      document.addEventListener('click',e=>{if(e.target.id==='rxResetReview'){if(confirm('Reset only your saved design-review data?')){Object.keys(localStorage).filter(k=>/^(rx_|revamp|revamplex)/.test(k)).forEach(k=>localStorage.removeItem(k));sessionStorage.clear();location.href='index.html';}}});
    }
    document.querySelectorAll('[data-room-link]').forEach(a=>a.href=room());
    if(page==='map.html')setupMap();
    if(page==='dashboard.html')setupDashboard();
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.modal.active').forEach(m=>m.classList.remove('active'));document.querySelectorAll('.modal.show').forEach(m=>m.classList.remove('show'));}});
    document.querySelectorAll('img').forEach(img=>{if(!img.closest('.rx-brand,.rx-hero-photo'))img.loading='lazy';if(!img.alt)img.alt='Project photo';});
    document.querySelectorAll('input,textarea,select').forEach(el=>{if(!el.id)return;const label=el.parentElement?.querySelector('label');if(label&&!label.htmlFor)label.htmlFor=el.id;});
  }
  function setupMap(){
    const intro=document.createElement('div');intro.className='rx-map-intro';intro.innerHTML='<div><p class="rx-kicker">YOUR NEIGHBORHOOD. YOUR NEXT PROJECT.</p><h1>'+(role()==='contractor'?'Find your next great project.':'Great work starts close to home.')+'</h1><p>Discover local expertise and projects. Exact addresses stay private during discovery.</p></div><div class="rx-row"><button class="rx-button small" id="rxMapView" aria-pressed="true">Map view</button><button class="rx-button small" id="rxListView" aria-pressed="false">List view</button></div>';document.getElementById('app').before(intro);
    const toggle=list=>{document.body.classList.toggle('rx-list-mode',list);document.getElementById('rxMapView').setAttribute('aria-pressed',!list);document.getElementById('rxListView').setAttribute('aria-pressed',list);const done=document.getElementById('rxViewMapResults');if(done)done.textContent=list?'View results':'View map';if(!list)requestAnimationFrame(()=>{try{map.invalidateSize({pan:false});}catch{}});};
    document.getElementById('rxMapView').onclick=()=>toggle(false);document.getElementById('rxListView').onclick=()=>toggle(true);
    const input=document.getElementById('searchInput');if(input){input.placeholder='Search a trade, town, or project…';input.setAttribute('aria-label','Search contractors and projects');}
    const params=new URLSearchParams(location.search);if(params.get('q')&&input){input.value=params.get('q');input.dispatchEvent(new Event('input',{bubbles:true}));}
    const clear=document.createElement('button');clear.className='rx-button small';clear.textContent='Clear filters';clear.type='button';clear.onclick=()=>{input.value='';document.getElementById('tradeFilter').value='all';document.getElementById('distanceFilter').value='100';document.getElementById('ratingFilter').value='0';if(typeof applyFilters==='function')applyFilters();};document.querySelector('.filter-row')?.append(clear);
    setupMapControls(clear);
    if(window.REVAMP_REVIEW){document.getElementById('welcomeOverlay')?.remove();}
    setupPostWizard();
    if(params.get('action')==='post')setTimeout(()=>document.getElementById('postJobBtn')?.click(),500);
    requestAnimationFrame(()=>{try{map.invalidateSize({pan:false});}catch{}});
    const theme=document.getElementById('themeToggleBtn');if(theme){theme.textContent='Map style';theme.title='Switch map light / dark style';}
  }
  function setupMapControls(clear){
    const app=document.getElementById('app');
    const topbar=app?.querySelector('.topbar');
    if(!topbar)return;
    // Move the existing controls so their filters, account actions, and listeners stay intact.
    const controls=document.createElement('details');controls.className='rx-map-controls';controls.id='rxMapControls';
    const summary=document.createElement('summary');summary.setAttribute('aria-controls','rxMapFilterPanel');
    summary.innerHTML='<span class="rx-map-controls-label">Search &amp; filters</span><span class="rx-map-filter-count" aria-live="polite">No filters</span><span class="rx-map-chevron" aria-hidden="true">⌄</span>';
    const panel=document.createElement('div');panel.id='rxMapFilterPanel';panel.className='rx-map-filter-panel';
    const footer=document.createElement('div');footer.className='rx-map-filter-actions';
    const done=document.createElement('button');done.type='button';done.className='rx-button primary';done.id='rxViewMapResults';done.textContent='View map';
    footer.append(done);panel.append(topbar,footer);controls.append(summary,panel);app.before(controls);
    const close=()=>{controls.open=false;summary.focus({preventScroll:true});};
    done.onclick=()=>{close();const target=document.body.classList.contains('rx-list-mode')?document.querySelector('.map-results-section'):app;target?.scrollIntoView({block:'start',behavior:'auto'});};
    controls.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
    const input=document.getElementById('searchInput');
    input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();done.click();}});
    const defaults={searchInput:'',tradeFilter:'all',distanceFilter:'100',ratingFilter:'0'};
    const updateSummary=()=>{const count=Object.entries(defaults).filter(([id,value])=>(document.getElementById(id)?.value||'').trim()!==value).length;summary.querySelector('.rx-map-filter-count').textContent=count?count+' active':'No filters';};
    for(const [id,label] of Object.entries({tradeFilter:'Trade',distanceFilter:'Distance',ratingFilter:'Minimum rating'}))document.getElementById(id)?.setAttribute('aria-label',label);
    controls.addEventListener('input',updateSummary);controls.addEventListener('change',updateSummary);clear.addEventListener('click',updateSummary);updateSummary();
  }
  function setupPostWizard(){
    const modal=document.getElementById('jobModal');if(!modal)return;
    const fields=[...modal.querySelectorAll('.modal-grid>.field,.modal-grid>.activity-share-box')];
    const groups=[['jobTitle','jobTrade','jobDescription'],['jobBudget','jobCity','jobMaxBids'],['jobShareActivity','jobActivityPhoto']];
    let step=0;const progress=document.createElement('div');progress.className='rx-wizard-progress';modal.querySelector('.modal-head').after(progress);
    const back=document.createElement('button');back.className='modal-btn secondary';back.type='button';back.textContent='Back';
    const next=document.createElement('button');next.className='modal-btn primary';next.type='button';next.textContent='Continue →';
    const actions=modal.querySelector('.modal-actions');actions.prepend(back,next);const submit=document.getElementById('submitJobBtn');
    const sharing=document.getElementById('jobShareActivity');if(sharing)sharing.checked=false;
    const show=()=>{progress.innerHTML=['1 · Your project','2 · Budget & location','3 · Sharing preferences'].map((s,i)=>'<span class="'+(i===step?'active':'')+'">'+s+'</span>').join('');fields.forEach(f=>f.classList.toggle('rx-step-hidden',!groups[step].some(id=>f.querySelector('#'+id))));back.hidden=step===0;next.hidden=step===2;submit.hidden=step!==2;modal.querySelector('.modal-card').scrollTop=0;};
    next.onclick=()=>{const required=step===0?['jobTitle','jobTrade','jobDescription']:['jobCity'];for(const id of required){const el=document.getElementById(id);if(!el.value.trim()){el.setCustomValidity('Please fill this in to continue.');el.reportValidity();el.addEventListener('input',()=>el.setCustomValidity(''),{once:true});return;}}step=Math.min(2,step+1);show();};
    back.onclick=()=>{step=Math.max(0,step-1);show();};show();
  }
  function setupDashboard(){
    const container=document.querySelector('.container');if(!container)return;
    const intro=document.createElement('div');intro.className='rx-dashboard-intro';intro.innerHTML='<p class="rx-kicker">MY REVAMPLEX</p><h1>Your work, beautifully organized.</h1><p>Projects, conversations, documents, and your reputation. All in one place.</p><div class="rx-row" style="margin-top:18px"><a class="rx-button primary" href="'+room()+'">Open Project Rooms →</a><a class="rx-button" href="map.html">Explore the map</a><a class="rx-button" href="community.html?saved=1">My saved ideas</a></div>';container.prepend(intro);
    document.querySelectorAll('.dash-card[onclick]').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
