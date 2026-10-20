(function(){
  'use strict';
  const C=window.RevampCore,esc=C.escape;
  let projects=[],category='all',savedOnly=new URLSearchParams(location.search).has('saved'),query='',db;
  const read=(k,d)=>window.RevampUX.load(k,d),write=(k,v)=>window.RevampUX.save(k,v);
  function bookmarks(){return read('rx_saved_ideas',[]);}
  function safeImage(url){try{const u=new URL(url,location.href);if(['https:','http:','blob:'].includes(u.protocol)&&(!window.REVAMP_REVIEW||!u.hostname.endsWith('supabase.co')))return u.href;}catch{}return 'images/jobs/kitchen.jpg';}
  function getClient(){if(!db&&window.supabase&&window.REVAMP_CONFIG)db=window.supabase.createClient(window.REVAMP_CONFIG.url,window.REVAMP_CONFIG.key);return db;}
  async function user(){return (await getClient()?.auth.getUser())?.data?.user;}
  async function fetchProjects(){
    const client=getClient();if(!client)return [];
    const {data,error}=await client.from('jobs').select('id,title,trade,city,description,activity_photo_url,contractor_used,budget,reveal_price,price_visible,share_activity,activity_public,public_showcase,created_at').or('share_activity.eq.true,activity_public.eq.true,public_showcase.eq.true').order('created_at',{ascending:false}).limit(200);
    if(error)throw new Error('Project inspiration could not load. Please try again.');
    return (data||[]).filter(j=>j.share_activity===true||j.activity_public===true||j.public_showcase===true).map(j=>({
      id:String(j.id),title:j.activity_title||j.title||'A community project',trade:j.trade||'Renovation',category:/kitchen/i.test(j.trade)?'Kitchen':/bath/i.test(j.trade)?'Bathroom':/deck|landscap|patio|porch|fenc|pool/i.test(j.trade)?'Outdoor':'Interior',
      city:String(j.city||'Local project').replace(/\d{1,6}\s+\S+.*/, 'Local project'),description:j.description||'A project shared for inspiration.',image:safeImage(j.activity_photo_url||j.image_url||j.image||'images/jobs/kitchen.jpg'),
      author:j.contractor_used||j.contractor_name||'ReVampLEX community',budget:(j.reveal_price||j.price_visible)?j.budget:null,sample:!!window.REVAMP_REVIEW
    }));
  }
  function render(){
    const grid=document.getElementById('rxCommunityGrid')||document.getElementById('rxHomeStories');if(!grid)return;
    const saved=bookmarks(),likes=read('rx_review_likes',[]),home=grid.id==='rxHomeStories';
    let visible=projects.filter(p=>(category==='all'||p.category===category)&&(!savedOnly||saved.some(s=>s.id===p.id))&&(!query||(p.title+' '+p.trade+' '+p.city).toLowerCase().includes(query)));
    if(home)visible=visible.slice(0,3);
    grid.innerHTML=visible.length?visible.map(p=>'<article class="rx-story"><div class="rx-story-image"><img loading="lazy" src="'+esc(p.image)+'" alt="'+esc(p.title)+'"><span class="rx-pill">'+esc(p.sample?'SAMPLE · '+p.category:p.category)+'</span><button class="rx-save" data-save="'+esc(p.id)+'" aria-label="Save '+esc(p.title)+'" aria-pressed="'+saved.some(s=>s.id===p.id)+'">'+(saved.some(s=>s.id===p.id)?'♥':'♡')+'</button></div><div class="rx-story-body"><p>'+esc(p.city)+' · '+esc(p.trade)+'</p><h3>'+esc(p.title)+'</h3><p>'+esc(p.budget?'Shared budget: '+p.budget:'A new perspective on a familiar space.')+'</p><div class="rx-story-footer"><span class="rx-author"><span class="rx-avatar">'+esc(p.author.slice(0,2).toUpperCase())+'</span>'+esc(p.author)+'</span><button data-like="'+esc(p.id)+'" aria-pressed="'+likes.includes(p.id)+'" aria-label="Like '+esc(p.title)+'">♡ <span data-like-count="'+esc(p.id)+'">'+(p.likes||0)+'</span></button><button data-comment="'+esc(p.id)+'" aria-label="Comments on '+esc(p.title)+'">◯</button><button data-share="'+esc(p.id)+'" aria-label="Share '+esc(p.title)+'">↗</button></div></div></article>').join(''):'<div class="rx-empty"><strong>'+(savedOnly?'Your inspiration board starts here.':'No projects match just yet.')+'</strong><p>'+(savedOnly?'Tap a heart on any project to save it.':'Try another category or share a project from the map.')+'</p></div>';
    document.querySelectorAll('.rx-board-count').forEach(el=>el.textContent=saved.length);
    const savedBtn=document.getElementById('rxSavedToggle');if(savedBtn)savedBtn.setAttribute('aria-pressed',savedOnly);
    const status=document.getElementById('rxCommunityStatus');if(status)status.textContent=(window.REVAMP_REVIEW?'Sample projects for your review · ':'')+visible.length+' ideas'+(savedOnly?' in your saved collection':' to explore');
  }
  async function reactions(){
    if(window.REVAMP_REVIEW){const likes=read('rx_review_likes',[]);projects.forEach(p=>p.likes=likes.includes(p.id)?1:0);return;}
    const client=getClient();if(!client||!projects.length)return;
    const {data,error}=await client.from('community_reactions').select('job_id,user_id').in('job_id',projects.map(p=>p.id));
    if(!error){projects.forEach(p=>p.likes=(data||[]).filter(r=>String(r.job_id)===p.id).length);const u=await user();write('rx_review_likes',(data||[]).filter(r=>r.user_id===u?.id).map(r=>String(r.job_id)));}
  }
  async function like(id){
    const p=projects.find(x=>x.id===id);if(!p)return;
    const likes=read('rx_review_likes',[]),has=likes.includes(id);
    if(!window.REVAMP_REVIEW){const u=await user();if(!u)return window.RevampUX.toast('Sign in from the map to join the conversation.');const q=has?getClient().from('community_reactions').delete().eq('job_id',id).eq('user_id',u.id):getClient().from('community_reactions').insert({job_id:id,user_id:u.id});const {error}=await q;if(error)return window.RevampUX.toast('Reactions are not available yet. Please try again later.');}
    write('rx_review_likes',has?likes.filter(x=>x!==id):[...likes,id]);p.likes=Math.max(0,(p.likes||0)+(has?-1:1));render();
  }
  async function comments(id){
    const p=projects.find(x=>x.id===id);if(!p)return;
    const el=window.RevampUX.dialog(p.title,'<p class="rx-muted" style="font-size:13px">'+esc(p.city)+' · '+esc(p.trade)+'</p><img src="'+esc(p.image)+'" alt="'+esc(p.title)+'" style="width:100%;max-height:260px;object-fit:cover;border-radius:10px"><p style="font-size:13px">'+esc(p.description)+'</p><div id="rxComments" aria-live="polite">Loading comments…</div><form id="rxCommentForm"><label for="rxCommentBody">Join the conversation</label><textarea id="rxCommentBody" maxlength="1200" required placeholder="Ask a question or share what inspires you…"></textarea><button class="rx-button primary" type="submit">Post comment</button></form><p class="rx-muted" style="font-size:11px">'+(window.REVAMP_REVIEW?'Review comments stay in this browser.':'Comments are public. Keep private details in your Project Room.')+'</p>');
    const list=el.querySelector('#rxComments');let rows=[];
    if(window.REVAMP_REVIEW)rows=read('rx_comments_'+id,[]);else{const {data,error}=await getClient().from('community_comments').select('*').eq('job_id',id).order('created_at',{ascending:true}).limit(100);if(error){list.textContent='Comments are not available yet.';el.querySelector('form').hidden=true;return;}rows=data||[];}
    const draw=()=>list.innerHTML=rows.length?rows.map(r=>'<div class="rx-comment"><small>'+esc(r.display_name||'Community member')+'</small>'+esc(r.body)+'</div>').join(''):'<p class="rx-muted" style="font-size:12px">Be the first to start a conversation.</p>';draw();
    el.querySelector('form').onsubmit=async e=>{e.preventDefault();const body=el.querySelector('textarea').value.trim();if(!body)return;const button=el.querySelector('[type=submit]');button.disabled=true;try{const u=await user();if(!u)throw new Error('Sign in from the map to comment.');const row={job_id:id,user_id:u.id,display_name:window.REVAMP_REVIEW?'You · design review':'Community member',body,created_at:new Date().toISOString()};if(window.REVAMP_REVIEW){rows.push(row);if(!write('rx_comments_'+id,rows))return;}else{const {error}=await getClient().from('community_comments').insert(row);if(error)throw new Error('Your comment could not be saved. Please try again.');rows.push(row);}el.querySelector('textarea').value='';draw();}catch(error){window.RevampUX.toast(error.message);}finally{button.disabled=false;}};
  }
  async function init(){
    document.querySelectorAll('[data-role]').forEach(button=>button.onclick=()=>{const contractor=button.dataset.role==='contractor';document.querySelectorAll('[data-role]').forEach(b=>b.setAttribute('aria-pressed',b===button));document.getElementById('rxHeroTitle').innerHTML=contractor?'Great projects.<br>Local connections.<br><em>Room to grow.</em>':'Big ideas.<br>Local expertise.<br><em>A place to begin.</em>';document.getElementById('rxHeroDescription').textContent=contractor?'Find your next project, show what makes your work special, and manage the details in one place. More time for the work you love.':"Find the right people, explore what's possible, and bring your next home project to life. Together, from the first idea to the final detail.";const form=document.querySelector('.rx-search-form');let view=form.querySelector('[name=view]');if(!view){view=document.createElement('input');view.type='hidden';view.name='view';form.append(view);}view.value=button.dataset.role;form.querySelector('[name=q]').placeholder=contractor?'Search projects by trade or town…':'What are you planning? Kitchen, deck, tile…';});
    document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.setAttribute('aria-pressed',x===b));render();});
    const search=document.getElementById('rxCommunitySearch');if(search)search.oninput=()=>{query=search.value.trim().toLowerCase();render();};
    const saved=document.getElementById('rxSavedToggle');if(saved)saved.onclick=()=>{savedOnly=!savedOnly;render();};
    document.addEventListener('click',async e=>{const b=e.target.closest('[data-save],[data-like],[data-comment],[data-share]');if(!b)return;if(b.dataset.save){const id=b.dataset.save,p=projects.find(p=>p.id===id),current=bookmarks(),has=current.some(s=>s.id===id);if(write('rx_saved_ideas',has?current.filter(s=>s.id!==id):[...current,p])){render();window.RevampUX.toast(has?'Removed from your saved ideas.':'Saved to your inspiration board on this device.');}}if(b.dataset.like){b.disabled=true;try{await like(b.dataset.like);}finally{b.disabled=false;}}if(b.dataset.comment)comments(b.dataset.comment);if(b.dataset.share){const url=new URL('community.html',location.href);url.searchParams.set('project',b.dataset.share);try{if(navigator.share){await navigator.share({title:'ReVampLEX project inspiration',url:url.href});}else{await navigator.clipboard.writeText(url.href);window.RevampUX.toast('Project link copied'+(window.REVAMP_REVIEW?' · this preview is private.':'.'));}}catch(err){if(err.name!=='AbortError')window.RevampUX.dialog('Project link','<label for="rxShareUrl">Copy this link</label><input id="rxShareUrl" readonly value="'+esc(url.href)+'">');}}});
    try{projects=await fetchProjects();await reactions();render();const selected=new URLSearchParams(location.search).get('project');if(selected&&projects.some(p=>p.id===selected))comments(selected);}catch(err){const target=document.getElementById('rxCommunityGrid')||document.getElementById('rxHomeStories');if(target)target.innerHTML='<div class="rx-empty">'+esc(err.message)+' <a href="'+esc(location.pathname)+'">Try again</a></div>';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
