import { TMDB_API_KEY } from './tmdb-config.js';

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  ADMIN_EMAIL,
  SITE_IMAGE_BUCKET,
  CHAT_MEDIA_BUCKET
} from './supabase-config.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const TABLES = {
  timeline:'oriza_timeline', moments:'oriza_moments', letters:'oriza_letters', gallery:'oriza_gallery',
  wishes:'oriza_wishes', chat:'oriza_chat_messages', movies:'oriza_movie_watchlist', food:'oriza_food_wishlist',
  love:'oriza_love_responses', compliments:'oriza_compliments', miss:'oriza_miss_pings', congrats:'oriza_congrats_page'
};

let supabase = null;
let currentUser = null;
let realtimeChannel = null;
let presenceChannel = null;
let mediaRecorder = null;
let voiceChunks = [];
let latest = {timeline:[],moments:[],letters:[],gallery:[],chat:[],movies:[],wishes:[],compliments:[],miss:[],congrats:null,food:[],love:[]};

const LOCAL = {
  letters:'orizaLocalLettersV2', gallery:'orizaLocalGalleryV2', chat:'orizaLocalChatV2',
  movies:'orizaLocalMoviesV2', wishes:'orizaLocalWishesV2'
};
const FALLBACK_COMPLIMENTS = [
  'Your smile feels like the safest place in the world.',
  'You make ordinary days feel like a soft little movie.',
  'I love how your existence makes my heart calm.',
  'You are my favorite notification, my favorite thought, my favorite person.'
];

function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(s=''){return escapeHtml(s).replace(/`/g,'&#96;')}
function localRead(k, fallback=[]){try{return JSON.parse(localStorage.getItem(k)||'null')||fallback}catch{return fallback}}
function localWrite(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function toast(msg, ms=2200){let t=$('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.append(t)}t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),ms)}
function isAdmin(){return Boolean(currentUser?.email && currentUser.email.toLowerCase()===ADMIN_EMAIL.toLowerCase())}
function actor(){return isAdmin()?'Yousha':'Sara'}
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function filenameSafe(name='file'){return name.replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,90)||'file'}

async function getSupabase(){
  if(supabase) return supabase;
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try{
    const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
    return supabase;
  }catch(err){console.error('Supabase client error:',err);toast(`Supabase error: ${err.message||'client unavailable'}`);return null}
}

async function initAuth(){
  const sb=await getSupabase(); if(!sb) return;
  const {data,error}=await sb.auth.getSession();
  if(error) console.warn('Auth session check failed:', error);
  currentUser=data?.session?.user||null;

  // Keep both authorized identities:
  // - Admin account = Yousha
  // - Sara account = Sara
  // Presence and chat identity are selected dynamically.
  // Do not remove non-admin sessions.
  applyAdminUI();

  sb.auth.onAuthStateChange(async (_e,session)=>{
    // Keep both accounts logged in.
    // Admin account = Yousha, invited user account = Sara.
    // Do NOT sign out non-admin users here.
    currentUser=session?.user||null;
    applyAdminUI();
    updatePresence();
    renderHomeMagic();
  });
}
function applyAdminUI(){
  document.body.classList.toggle('admin-mode',isAdmin());
  $$('.admin-only').forEach(el=>el.hidden=!isAdmin());
  $$('.admin-status').forEach(el=>el.textContent=isAdmin()?`Signed in as ${currentUser.email}`:'Admin sign-in required');
}

function lanterns(){const root=$('.lantern-layer');if(!root||root.children.length)return;for(let i=0;i<24;i++){const s=document.createElement('span');s.className='lantern';s.style.left=`${Math.random()*100}%`;s.style.animationDelay=`-${Math.random()*18}s`;s.style.setProperty('--dur',`${13+Math.random()*14}s`);root.append(s)}}
function navActive(){const p=document.body.dataset.page;$$('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===p))}
function tilt(){if(matchMedia('(pointer:coarse)').matches)return;$$('[data-tilt]').forEach(el=>{el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.transform=`translateY(-4px) perspective(900px) rotateX(${-y*3}deg) rotateY(${x*4}deg)`});el.addEventListener('pointerleave',()=>el.style.transform='')})}
function setupMusic(){const btn=$('#headerMusic');if(!btn)return;const audio=new Audio('assets/music.mp3');audio.loop=true;audio.volume=.38;let on=false;btn.addEventListener('click',async()=>{try{if(on){audio.pause();on=false;btn.textContent='♪';toast('Music paused')}else{await audio.play();on=true;btn.textContent='Ⅱ';toast('Music playing')}}catch{toast('Tap again to start the music')}})}
function updateHeroTime(){const el=$('#heroTime');if(!el)return;const paint=()=>el.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});paint();setInterval(paint,30000)}

async function checkWholeSiteState(){
  if(document.body.dataset.page==='admin') return false;
  const sb=await getSupabase(); if(!sb) return false;
  const {data}=await sb.from(TABLES.congrats).select('*').eq('id',1).maybeSingle();
  latest.congrats=data||null;
  if(false && data?.self_destruct_at && new Date(data.self_destruct_at)<=new Date()){
    document.body.innerHTML=`<main class="site-gone"><div class="glass gone-card"><div class="eyebrow">The lanterns are quiet</div><h1>Goodbye, Sara</h1><p>The 24-hour countdown ended and the public site is now hidden.</p></div></main>`;
    return true;
  }
  return false;
}

async function loadTimeline(){
  const sb=await getSupabase();if(!sb){latest.timeline=[];renderHomeTimeline();renderAdminTimeline();return}
  const {data,error}=await sb.from(TABLES.timeline).select('*').order('date',{ascending:true}).order('created_at',{ascending:true});
  if(error){console.error('Memory Lane sync error:',error);return}
  latest.timeline=data||[];renderHomeTimeline();renderAdminTimeline();
}
function renderHomeTimeline(){
  const root=$('#homeMemoryLane');if(!root)return;const arr=latest.timeline;
  if(!arr.length){root.innerHTML='<div class="home-story-empty">Our first memory will glow here.</div>';return}
  root.innerHTML=arr.map((item,i)=>{
    const when=item.date?new Date(item.date):null;
    const date=when&&!Number.isNaN(when.getTime())?when.toLocaleDateString([],{day:'2-digit',month:'short',year:'numeric'}):'A little while ago';
    return `<article class="memory-node ${i%2?'memory-right':'memory-left'}"><span class="memory-dot" aria-hidden="true"></span><div class="memory-card glass"><time>${escapeHtml(date)}</time><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></div></article>`;
  }).join('');
}
function renderAdminTimeline(){
  const root=$('#adminTimelineList');if(!root)return;
  root.innerHTML=latest.timeline.map(x=>`<div class="admin-row"><div><strong>${escapeHtml(x.title)}</strong><small>${x.date?new Date(x.date).toLocaleString():''}</small></div><div class="admin-inline-actions"><button data-edit-timeline="${x.id}">Edit</button><button data-admin-del-timeline="${x.id}">Delete</button></div></div>`).join('')||'<div class="empty-state">No Memory Lane chapters yet</div>';
  $$('[data-edit-timeline]',root).forEach(b=>b.onclick=()=>{const x=latest.timeline.find(v=>String(v.id)===b.dataset.editTimeline);if(!x)return;editingTimelineId=x.id;$('#adminTimelineTitle').value=x.title||'';$('#adminTimelineText').value=x.text||'';$('#adminTimelineDate').value=x.date?String(x.date).slice(0,10):'';$('#adminTimelineForm button').textContent='Update Memory';});
  $$('[data-admin-del-timeline]',root).forEach(b=>b.onclick=async()=>{if(!confirm('Delete this memory?'))return;const sb=await getSupabase();const {error}=await sb.from(TABLES.timeline).delete().eq('id',b.dataset.adminDelTimeline);if(error)toast(error.message);else loadTimeline();});
}

async function loadMoments(){
  const sb=await getSupabase();if(!sb){latest.moments=[];renderHomeMoments();renderAdminMoments();return}
  const {data,error}=await sb.from(TABLES.moments).select('*').order('date',{ascending:false}).order('created_at',{ascending:false});
  if(error){console.error('Moments sync error:',error);return}
  latest.moments=data||[];renderHomeMoments();renderAdminMoments();
}
function renderHomeMoments(){
  const root=$('#homeMomentsGrid');if(!root)return;const arr=latest.moments.slice(0,6);
  if(!arr.length){root.innerHTML='<div class="home-story-empty">Our little moments will appear here.</div>';return}
  root.innerHTML=arr.map((item,i)=>{const date=item.date?new Date(`${item.date}T12:00:00`).toLocaleDateString([],{day:'2-digit',month:'short',year:'numeric'}):'';const image=item.image?`<div class="moment-visual"><img src="${escapeAttr(item.image)}" alt="${escapeAttr(item.title)}" loading="lazy"></div>`:`<div class="moment-visual moment-visual-empty"><span>${i%3===0?'✦':i%3===1?'♡':'☾'}</span></div>`;return `<article class="home-moment-card glass" data-tilt>${image}<div class="home-moment-copy"><time>${escapeHtml(date)}</time><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></div></article>`}).join('');
  tilt();
}
function renderAdminMoments(){
  const root=$('#adminMomentsList');if(!root)return;
  root.innerHTML=latest.moments.map(x=>`<div class="admin-row"><div><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.date||'')}</small></div><div class="admin-inline-actions"><button data-edit-moment="${x.id}">Edit</button><button data-admin-del-moment="${x.id}">Delete</button></div></div>`).join('')||'<div class="empty-state">No moments yet</div>';
  $$('[data-edit-moment]',root).forEach(b=>b.onclick=()=>{const x=latest.moments.find(v=>String(v.id)===b.dataset.editMoment);if(!x)return;editingMomentId=x.id;$('#adminMomentTitle').value=x.title||'';$('#adminMomentText').value=x.text||'';$('#adminMomentDate').value=x.date||'';$('#adminMomentImage').value=x.image||'';$('#adminMomentForm button').textContent='Update Moment';});
  $$('[data-admin-del-moment]',root).forEach(b=>b.onclick=async()=>{if(!confirm('Delete this moment?'))return;const sb=await getSupabase();const {error}=await sb.from(TABLES.moments).delete().eq('id',b.dataset.adminDelMoment);if(error)toast(error.message);else loadMoments();});
}

async function loadLetters(){
  const sb=await getSupabase();
  if(!sb){latest.letters=localRead(LOCAL.letters,[]);return renderLetters()}
  const {data,error}=await sb.from(TABLES.letters).select('*').order('date',{ascending:false}).order('created_at',{ascending:false});
  if(error){toast('Letters could not sync');return} latest.letters=data||[];renderLetters();renderAdminLetters();
}
function renderLetters(){
  const list=$('#lettersList'),paper=$('#letterPaper'); if(!list||!paper)return;
  const arr=latest.letters;
  if(!arr.length){list.innerHTML='<div class="empty-state">No letters yet.</div>';paper.innerHTML='<h2>For Sara</h2><p>Your first letter will appear here.</p>';return}
  list.innerHTML=arr.map((l,i)=>`<button class="list-item ${i===0?'active':''}" data-letter-index="${i}"><strong>${escapeHtml(l.title)}</strong><span>${escapeHtml(l.date||'')}</span></button>`).join('');
  const show=i=>{const l=arr[i];paper.innerHTML=`<h2>${escapeHtml(l.title)}</h2><small>${escapeHtml(l.date||'')}</small><p>${escapeHtml(l.body)}</p>`;$$('[data-letter-index]',list).forEach((b,j)=>b.classList.toggle('active',j===i))};show(0);
  list.onclick=e=>{const b=e.target.closest('[data-letter-index]');if(b)show(+b.dataset.letterIndex)};
}
async function submitLetter(e){e.preventDefault();const title=$('#letterTitle')?.value.trim(),body=$('#letterBody')?.value.trim();if(!title||!body)return;const sb=await getSupabase();if(!sb){const arr=localRead(LOCAL.letters,[]);arr.unshift({id:crypto.randomUUID(),title,body,date:new Date().toISOString().slice(0,10)});localWrite(LOCAL.letters,arr);latest.letters=arr;renderLetters();e.target.reset();return}if(!isAdmin()){toast('Admin sign-in required');return}const {error}=await sb.from(TABLES.letters).insert({title,body,date:new Date().toISOString().slice(0,10)});if(error)return toast(error.message);e.target.reset();await loadLetters();toast('Letter saved')}

async function loadGallery(){
  const sb=await getSupabase();if(!sb){latest.gallery=localRead(LOCAL.gallery,[]);renderGallery();setupGalleryLightbox();return}
  const {data,error}=await sb.from(TABLES.gallery).select('*').order('created_at',{ascending:false});if(error){toast('Gallery could not sync');return}latest.gallery=data||[];renderGallery();setupGalleryLightbox();renderAdminGallery();
}
function renderGallery(){const grid=$('#galleryGrid');if(!grid)return;const arr=latest.gallery;grid.innerHTML=arr.length?arr.map(p=>`<article class="photo-card"><img class="gallery-click-image" data-full="${escapeAttr(p.image)}" src="${escapeAttr(p.image)}" alt="${escapeAttr(p.title||'Memory')}" loading="lazy"><div class="caption">${escapeHtml(p.title||'A little memory')}</div></article>`).join(''):'<div class="upload-card" style="grid-column:1/-1"><div><h3>No Sara photos yet</h3><p>The gallery is ready for this new chapter.</p></div></div>'}

function setupGalleryLightbox(){
  const grid=$('#galleryGrid');
  if(!grid || grid.dataset.lightboxReady)return;
  grid.dataset.lightboxReady='true';
  grid.addEventListener('click',e=>{
    const img=e.target.closest('.gallery-click-image');
    if(!img)return;
    const box=document.createElement('div');
    box.className='oriza-lightbox';
    box.innerHTML=`<button class="lightbox-close">×</button><img src="${img.dataset.full}" alt="Gallery image">`;
    document.body.appendChild(box);
    const close=()=>box.remove();
    box.addEventListener('click',ev=>{if(ev.target===box||ev.target.classList.contains('lightbox-close'))close()});
    document.addEventListener('keydown',function esc(ev){if(ev.key==='Escape'){close();document.removeEventListener('keydown',esc)}});
  });
}
async function uploadGalleryFile(file,caption=''){
  const sb=await getSupabase(); if(!sb) throw new Error('Supabase is required for shared gallery uploads.'); if(!isAdmin()) throw new Error('Admin sign-in required.');
  const path=`gallery/${Date.now()}-${filenameSafe(file.name)}`; const {error:upErr}=await sb.storage.from(SITE_IMAGE_BUCKET).upload(path,file,{upsert:false});if(upErr)throw upErr;
  const {data:urlData}=sb.storage.from(SITE_IMAGE_BUCKET).getPublicUrl(path);const image=urlData.publicUrl;
  const {error}=await sb.from(TABLES.gallery).insert({title:caption||'A little memory',image,storage_path:path});if(error){await sb.storage.from(SITE_IMAGE_BUCKET).remove([path]);throw error}await loadGallery();return image;
}
function setupGalleryUpload(){const input=$('#photoInput');if(!input)return;input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file)return;try{await uploadGalleryFile(file,$('#photoCaption')?.value.trim());toast('Photo added');input.value='';if($('#photoCaption'))$('#photoCaption').value=''}catch(e){toast(e.message)}})}

async function loadChat(){
  const sb=await getSupabase();if(!sb){latest.chat=localRead(LOCAL.chat,[]);return renderChat()}
  const {data,error}=await sb.from(TABLES.chat).select('*').order('created_at',{ascending:true}).limit(250);if(error){console.error('Chat sync error:',error);toast(`Chat sync error: ${error.message}`);return}latest.chat=data||[];renderChat();
}
function mediaMarkup(m){if(m.message_type==='image')return `<a href="${escapeAttr(m.media_url)}" target="_blank"><img class="chat-media-image" src="${escapeAttr(m.media_url)}" alt="${escapeAttr(m.media_name||'Photo')}"></a>`;if(m.message_type==='audio')return `<audio class="chat-media-audio" controls src="${escapeAttr(m.media_url)}"></audio>`;if(m.message_type==='video')return `<video class="chat-media-video" controls src="${escapeAttr(m.media_url)}"></video>`;if(m.message_type==='file')return `<a class="chat-file-link" href="${escapeAttr(m.media_url)}" target="_blank">📎 ${escapeHtml(m.media_name||'Open file')}</a>`;return ''}
function renderChat(){
  const log=$('#chatLog');if(!log)return;const arr=latest.chat;log.innerHTML=arr.length?arr.map(m=>{const mine=m.sender===actor();const recent=new Date(m.created_at||Date.now())>new Date(Date.now()-15*60*1000);const canDelete=isAdmin()||(mine&&recent);return `<div class="bubble ${mine?'me':'them'} chat-bubble-row" data-chat-id="${m.id||''}"><strong class="bubble-sender">${escapeHtml(m.sender||'')}</strong>${mediaMarkup(m)}${m.message?`<div>${escapeHtml(m.message).replace(/\n/g,'<br>')}</div>`:''}<time>${new Date(m.created_at||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>${canDelete&&m.id?`<button class="unsend-btn" data-unsend="${m.id}">Unsend</button>`:''}</div>`}).join(''):'<div class="empty-state">No messages yet.</div>';log.scrollTop=log.scrollHeight;
  $$('[data-unsend]',log).forEach(b=>b.onclick=()=>deleteChatMessage(b.dataset.unsend));
}
async function sendChatText(text){const sb=await getSupabase();if(!sb){const arr=localRead(LOCAL.chat,[]);arr.push({id:crypto.randomUUID(),sender:actor(),message:text,message_type:'text',created_at:new Date().toISOString()});localWrite(LOCAL.chat,arr);latest.chat=arr;renderChat();return}const {error}=await sb.rpc('oriza_send_chat_message',{p_sender:actor(),p_message:text,p_message_type:'text',p_media_url:null,p_media_path:null,p_media_name:null,p_media_mime:null,p_media_size:null});if(error)throw error}
async function uploadChatMedia(file,type,caption=''){
  const sb=await getSupabase();if(!sb)throw new Error('Supabase is required for media.');
  const folder=actor().toLowerCase();const path=`${folder}/${Date.now()}-${filenameSafe(file.name||`${type}.webm`)}`;const {error:upErr}=await sb.storage.from(CHAT_MEDIA_BUCKET).upload(path,file,{contentType:file.type||undefined});if(upErr)throw upErr;
  const {data:urlData}=sb.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(path);const {error}=await sb.rpc('oriza_send_chat_message',{p_sender:actor(),p_message:caption||'',p_message_type:type,p_media_url:urlData.publicUrl,p_media_path:path,p_media_name:file.name||`${type}.webm`,p_media_mime:file.type||null,p_media_size:file.size||0});if(error){await sb.storage.from(CHAT_MEDIA_BUCKET).remove([path]);throw error}
}
async function deleteChatMessage(id){const sb=await getSupabase();if(!sb)return;const msg=latest.chat.find(x=>x.id===id);const {error}=await sb.rpc('oriza_delete_chat_message',{p_id:id});if(error)return toast(error.message);if(msg?.media_path)await sb.storage.from(CHAT_MEDIA_BUCKET).remove([msg.media_path]);}
function setupChat(){
  const form=$('#chatForm');form?.addEventListener('submit',async e=>{e.preventDefault();const i=$('#chatInput');const t=i.value.trim();if(!t)return;try{await sendChatText(t);i.value=''}catch(err){toast(err.message)}});
  $('#chatMediaInput')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;let type=f.type.startsWith('image/')?'image':f.type.startsWith('audio/')?'audio':f.type.startsWith('video/')?'video':'file';try{await uploadChatMedia(f,type,$('#chatInput')?.value.trim()||'');if($('#chatInput'))$('#chatInput').value='';e.target.value='';toast('Sent')}catch(err){toast(err.message)}});
  $('#chatPhotoBtn')?.addEventListener('click',()=>$('#chatMediaInput')?.click());
  $('#chatVoiceBtn')?.addEventListener('click',toggleVoiceRecording);
}
async function toggleVoiceRecording(){
  const btn=$('#chatVoiceBtn');if(mediaRecorder?.state==='recording'){mediaRecorder.stop();if(btn)btn.textContent='🎙 Voice';return}
  try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});voiceChunks=[];mediaRecorder=new MediaRecorder(stream);mediaRecorder.ondataavailable=e=>{if(e.data.size)voiceChunks.push(e.data)};mediaRecorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(voiceChunks,{type:mediaRecorder.mimeType||'audio/webm'});const file=new File([blob],`voice-${Date.now()}.webm`,{type:blob.type});try{await uploadChatMedia(file,'audio',$('#chatInput')?.value.trim()||'');if($('#chatInput'))$('#chatInput').value='';toast('Voice message sent')}catch(e){toast(e.message)}};mediaRecorder.start();if(btn)btn.textContent='■ Stop';setTimeout(()=>{if(mediaRecorder?.state==='recording')mediaRecorder.stop()},60000)}catch(e){toast('Microphone permission is required')}
}

async function loadMovies(){const sb=await getSupabase();if(!sb){latest.movies=localRead(LOCAL.movies,[]);return renderMovies()}const {data,error}=await sb.from(TABLES.movies).select('*').order('added_at',{ascending:false});if(error)return toast('Movies could not sync');latest.movies=data||[];renderMovies()}

function renderMovies(){
const grid=$('#movieGrid');if(!grid)return;
const arr=latest.movies;
grid.innerHTML=arr.length?arr.map((m,i)=>`
<article class="movie-card glass">
${m.poster?`<img class="movie-poster" src="${m.poster}" alt="">`:''}
<h3>${escapeHtml(m.title)}</h3>
<p>${escapeHtml(m.note||m.overview||'')}</p>
<div class="meta">${m.status==='watched'?'Watched ✦':'To watch'}</div>
<div class="movie-actions">
<button class="ghost" data-watch="${m.id||i}">${m.status==='watched'?'Mark planned':'✓ Watched'}</button>
<button class="ghost" data-del-movie="${m.id||i}">Remove</button>
</div></article>`).join(''):'<div class="empty-state" style="grid-column:1/-1">No movies yet.</div>';
$$('[data-watch]',grid).forEach(b=>b.onclick=()=>toggleMovie(b.dataset.watch));
$$('[data-del-movie]',grid).forEach(b=>b.onclick=()=>deleteMovie(b.dataset.delMovie))
}

async function searchTMDB(q){
 if(!q || q.length<2)return [];
 const r=await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}`);
 const j=await r.json();
 return (j.results||[]).slice(0,8);
}

let editingTimelineId=null;
let editingMomentId=null;
let selectedMovie=null;
function setupMovieSearch(){
 const input=$('#movieTitle'), box=$('#tmdbResults');
 if(!input||!box)return;
 input.addEventListener('input',async()=>{
   selectedMovie=null;
   try{
   const query=input.value.trim();
   if(query.length<2){ box.innerHTML=''; return; }
   const results=await searchTMDB(query);
   box.innerHTML=results.map(m=>`
   <div class="tmdb-item" data-id="${m.id}">
    ${m.poster_path?`<img src="https://image.tmdb.org/t/p/w92${m.poster_path}">`:''}
    <div><b>${escapeHtml(m.title)}</b><span>${m.release_date?.slice(0,4)||''}</span></div>
   </div>`).join('');
   }catch(err){
     console.error('TMDB search failed:',err);
     box.innerHTML='<div class="tmdb-error">Movie search unavailable</div>';
   }
   $$('.tmdb-item',box).forEach(el=>el.onclick=()=>{
     const m=results.find(x=>String(x.id)===el.dataset.id);
     selectedMovie=m;
     input.value=m.title;
     box.innerHTML='';
   });
 });
 $('#addSelectedMovie')?.addEventListener('click',async()=>{
   if(!selectedMovie && !input.value.trim())return;
   const m=selectedMovie;
   await addMovie(input.value.trim(), $('#movieNote')?.value.trim()||'', m?.poster_path?`https://image.tmdb.org/t/p/w500${m.poster_path}`:'');
   input.value=''; selectedMovie=null;
   loadMovies();
 });
}


function setupMovies(){
  setupMovieSearch();
}

async function addMovie(title,note,poster=''){
const sb=await getSupabase();
if(!sb){const arr=localRead(LOCAL.movies,[]);arr.unshift({id:crypto.randomUUID(),title,note,poster,status:'planned'});localWrite(LOCAL.movies,arr);latest.movies=arr;renderMovies();return}
const {error}=await sb.from(TABLES.movies).insert({
 title,
 note,
 status:'planned',
 poster
});
if(error){
 console.error('Movie insert failed:', error);
 toast(`Could not add movie: ${error.message}`);
 throw error;
}
toast('Movie added to wishlist ✦');
}

async function loadWishes(){const sb=await getSupabase();if(!sb){latest.wishes=localRead(LOCAL.wishes,[]);return renderWishes()}const {data,error}=await sb.from(TABLES.wishes).select('*').order('created_at',{ascending:false}).limit(100);if(error)return toast('Wishes could not sync');latest.wishes=data||[];renderWishes();renderAdminWishes()}
function renderWishes(){const root=$('#wishList');if(!root)return;root.innerHTML=latest.wishes.length?latest.wishes.map(w=>`<div class="wish-item">${escapeHtml(w.wish||w.text)}<time>${new Date(w.created_at||Date.now()).toLocaleString()}</time></div>`).join(''):'<div class="empty-state">No wish lanterns yet.</div>'}
function setupWishes(){$('#wishForm')?.addEventListener('submit',async e=>{e.preventDefault();const i=$('#wishInput'),t=i?.value.trim();if(!t)return;const sb=await getSupabase();if(!sb){const arr=localRead(LOCAL.wishes,[]);arr.unshift({text:t,created_at:new Date().toISOString()});localWrite(LOCAL.wishes,arr);latest.wishes=arr;renderWishes();i.value='';return}const {error}=await sb.from(TABLES.wishes).insert({wish:t});if(error)return toast(error.message);i.value='';toast('Your lantern is in the sky ✨')})}


async function loadFood(){const sb=await getSupabase();if(!sb)return;const {data,error}=await sb.from(TABLES.food).select('*').order('added_at',{ascending:false});if(error)return toast('Food wishlist could not sync');latest.food=data||[];renderFood();renderAdminFood()}
function renderFood(){const root=$('#foodGrid');if(!root)return;root.innerHTML=latest.food.length?latest.food.map(x=>`<article class="movie-card glass food-card"><h3>${escapeHtml(x.name)}</h3><p>${escapeHtml(x.note||x.category||'A little craving')}</p><div class="meta">${x.status==='got_it'?'Got it ✦':'Craving'}</div>${x.image?`<img class="food-thumb" src="${escapeAttr(x.image)}" alt="${escapeAttr(x.name)}">`:''}</article>`).join(''):'<div class="empty-state" style="grid-column:1/-1">No cravings yet.</div>'}
function setupFood(){$('#foodForm')?.addEventListener('submit',async e=>{e.preventDefault();const name=$('#foodName')?.value.trim(),note=$('#foodNote')?.value.trim();if(!name)return;const sb=await getSupabase();if(!sb)return toast('Supabase is required for the shared food list');const {error}=await sb.from(TABLES.food).insert({name,note,status:'craving'});if(error)return toast(error.message);e.target.reset();toast('Craving added')})}
function renderAdminFood(){const r=$('#adminFoodList');if(!r)return;r.innerHTML=latest.food.map(x=>`<div class="admin-row"><div><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.status)}</small></div><div class="admin-inline-actions"><button data-food-got="${x.id}">${x.status==='got_it'?'Craving':'Got it'}</button><button data-food-del="${x.id}">Delete</button></div></div>`).join('')||'<div class="empty-state">No food wishlist items</div>';$$('[data-food-got]',r).forEach(b=>b.onclick=async()=>{const sb=await getSupabase();const x=latest.food.find(v=>v.id===b.dataset.foodGot);const next=x.status==='got_it'?'craving':'got_it';await sb.from(TABLES.food).update({status:next,got_at:next==='got_it'?new Date().toISOString():null}).eq('id',x.id)});$$('[data-food-del]',r).forEach(b=>b.onclick=async()=>{const sb=await getSupabase();await sb.from(TABLES.food).delete().eq('id',b.dataset.foodDel)})}

async function loadCompliments(){const sb=await getSupabase();if(!sb){latest.compliments=FALLBACK_COMPLIMENTS.map((text,i)=>({id:i,text}));return}const {data}=await sb.from(TABLES.compliments).select('*').eq('is_active',true).order('created_at');latest.compliments=data?.length?data:FALLBACK_COMPLIMENTS.map((text,i)=>({id:i,text}));renderAdminCompliments()}
async function loadMiss(){const sb=await getSupabase();if(!sb)return;const {data}=await sb.from(TABLES.miss).select('*').eq('local_day',todayKey()).order('created_at');latest.miss=data||[];renderHomeMagic()}
function missCounts(){return {y:latest.miss.filter(x=>x.actor==='Yousha').length,m:latest.miss.filter(x=>x.actor==='Sara').length}}
function renderHomeMagic(){const c=missCounts();if($('#missMiniCount'))$('#missMiniCount').textContent=`Y ${c.y} · M ${c.m}`;const who=actor();if($('#homeActor'))$('#homeActor').textContent=who;const missBtn=$('#missYouBtn');if(missBtn){missBtn.title=`Send an I miss you ping as ${who}`;missBtn.setAttribute('aria-label',`Send I miss you as ${who}`)}const b=$('#birthdayMini');if(b){const now=new Date();let target=new Date(now.getFullYear(),3,20);if(now>new Date(now.getFullYear(),3,20,23,59,59))target=new Date(now.getFullYear()+1,3,20);const days=Math.max(0,Math.ceil((target-now)/86400000));b.textContent=now.getMonth()===3&&now.getDate()===20?'Happy Birthday ♡':`${days}d to birthday`}}
async function sendMiss(){const sb=await getSupabase();if(!sb)return toast('Supabase is needed for live I miss you');const btn=$('#missYouBtn');const who=actor();if(btn){btn.disabled=true;btn.classList.add('sending')}const {error}=await sb.from(TABLES.miss).insert({actor:who,local_day:todayKey()});if(btn){btn.disabled=false;btn.classList.remove('sending')}if(error)return toast(error.message);await loadMiss();presenceChannel?.send({type:'broadcast',event:'thinking',payload:{actor:who}});toast(`${who} sent a little heart ♡`)}
function showCompliment(){const list=latest.compliments.length?latest.compliments:FALLBACK_COMPLIMENTS.map(text=>({text}));const text=list[Math.floor(Math.random()*list.length)].text;const out=$('#fixedComplimentPop')||$('#complimentPop');if(out){out.textContent=text;out.classList.add('show');setTimeout(()=>out.classList.remove('show'),4500)}else toast(text,4200)}
function setupBirthdayTicker(){renderHomeMagic();setInterval(renderHomeMagic,60000)}

async function setupPresence(){const sb=await getSupabase();if(!sb)return;presenceChannel=sb.channel('oriza-live-room',{config:{presence:{key:crypto.randomUUID()},broadcast:{self:false}}});presenceChannel.on('presence',{event:'sync'},()=>renderPresence());presenceChannel.on('broadcast',{event:'thinking'},({payload})=>{if(payload?.actor!==actor())showHeartPing(payload.actor)});await presenceChannel.subscribe(async status=>{if(status==='SUBSCRIBED')await updatePresence()})}
async function updatePresence(){if(!presenceChannel)return;await presenceChannel.track({actor:actor(),at:new Date().toISOString()})}
function renderPresence(){if(!presenceChannel)return;const states=presenceChannel.presenceState();const actors=Object.values(states).flat().map(x=>x.actor);const other=actor()==='Sara'?'Yousha':'Sara';const el=$('#presencePill');if(el){const online=actors.includes(other);el.textContent=online?`${other} is here ✦`:`${other} is away`;el.classList.toggle('online',online)}}
function showHeartPing(from){const d=document.createElement('div');d.className='heart-ping';d.innerHTML=`<div>♡</div><span>${escapeHtml(from)} misses you</span>`;document.body.append(d);setTimeout(()=>d.remove(),2800)}

async function saveLove(answer){const sb=await getSupabase();if(sb)await sb.from(TABLES.love).insert({answer})}
function setupLoveModal(){const modal=$('#loveModal');$('#loveGemBtn')?.addEventListener('click',()=>modal?.classList.add('open'));$$('[data-love-answer]').forEach(b=>b.addEventListener('click',async()=>{await saveLove(b.dataset.loveAnswer);toast(b.dataset.loveAnswer==='yes'?'I knew it ♡':'I will keep the lantern on.');modal?.classList.remove('open')}));$('[data-close-love]')?.addEventListener('click',()=>modal?.classList.remove('open'))}


async function loadLoveResponses(){const sb=await getSupabase();if(!sb||!isAdmin())return;const {data}=await sb.from(TABLES.love).select('*').order('created_at',{ascending:false}).limit(100);latest.love=data||[];renderAdminLove()}
function renderAdminLove(){const r=$('#adminLoveList');if(!r)return;r.innerHTML=latest.love.map(x=>`<div class="admin-row"><div><strong>${x.answer==='yes'?'Yes ♡':'No'}</strong><small>${new Date(x.created_at).toLocaleString()}</small></div><button data-love-del="${x.id}">Delete</button></div>`).join('')||'<div class="empty-state">No answers yet</div>';$$('[data-love-del]',r).forEach(b=>b.onclick=async()=>{const sb=await getSupabase();await sb.from(TABLES.love).delete().eq('id',b.dataset.loveDel)})}

async function loadCongrats(){
  const sb=await getSupabase();
  if(sb){
    const {data}=await sb.from(TABLES.congrats).select('*').eq('id',1).maybeSingle();
    latest.congrats=data||null;
  }
  renderCongrats();
  renderAdminCongrats();
}

function getBirthdayTarget(){
  const now=new Date();
  const isBirthday=now.getMonth()===3 && now.getDate()===20;
  let target=new Date(now.getFullYear(),3,20,0,0,0,0);
  if(now>new Date(now.getFullYear(),3,20,23,59,59,999)) target=new Date(now.getFullYear()+1,3,20,0,0,0,0);
  return {now,target,isBirthday};
}

function formatBirthdayCountdown(ms){
  ms=Math.max(0,ms);
  const days=Math.floor(ms/86400000);
  const hours=Math.floor((ms%86400000)/3600000);
  const minutes=Math.floor((ms%3600000)/60000);
  const seconds=Math.floor((ms%60000)/1000);
  return {days,hours,minutes,seconds,text:`${days}d ${String(hours).padStart(2,'0')}h ${String(minutes).padStart(2,'0')}m ${String(seconds).padStart(2,'0')}s`};
}

let birthdayCountdownTimer=null;
function renderBirthdayLocked(){
  const title=$('#congratsTitle');
  const msg=$('#congratsMessage');
  const eyebrow=$('#congratsEyebrow');
  const keep=$('#keepBtn');
  const countdown=$('#birthdayCountdown');
  const daysEl=$('#birthdayDaysLeft');
  const liveEl=$('#birthdayLiveCountdown');
  if(eyebrow) eyebrow.textContent='Birthday locked';
  if(title) title.textContent='A surprise is waiting ♡';
  if(msg) msg.textContent='This will open only on Sara’s birthday.';
  if(keep) keep.hidden=true;
  if(countdown) countdown.hidden=false;
  const tick=()=>{
    const {target,isBirthday}=getBirthdayTarget();
    if(isBirthday){
      if(birthdayCountdownTimer) clearInterval(birthdayCountdownTimer);
      renderCongrats();
      return;
    }
    const left=formatBirthdayCountdown(target-new Date());
    if(daysEl) daysEl.textContent=`${left.days} day${left.days===1?'':'s'} left to open`;
    if(liveEl) liveEl.textContent=left.text;
  };
  tick();
  if(birthdayCountdownTimer) clearInterval(birthdayCountdownTimer);
  birthdayCountdownTimer=setInterval(tick,1000);
}

function renderCongrats(){
  if(document.body.dataset.page!=='congrats')return;
  const {isBirthday}=getBirthdayTarget();
  if(!isBirthday){
    renderBirthdayLocked();
    return;
  }
  if(birthdayCountdownTimer){clearInterval(birthdayCountdownTimer);birthdayCountdownTimer=null;}
  const d=latest.congrats;
  if($('#congratsEyebrow')) $('#congratsEyebrow').textContent='A little celebration';
  if($('#congratsTitle')) $('#congratsTitle').textContent=d?.title||'Congratulations, Sara';
  if($('#congratsMessage')) $('#congratsMessage').textContent=d?.message||'A little celebration made especially for you.';
  if($('#birthdayCountdown')) $('#birthdayCountdown').hidden=true;
  if($('#keepBtn')) $('#keepBtn').hidden=false;
}

function setupCongrats(){
  if(document.body.dataset.page!=='congrats')return;
  renderCongrats();
  $('#keepBtn')?.addEventListener('click',async()=>{
    const sb=await getSupabase();
    if(sb)await sb.rpc('oriza_set_congrats_choice',{p_choice:'keep'});
    toast('Kept ♡')
  });
  if(getBirthdayTarget().isBirthday) setupFireworks();
}

function setupFireworks(){const root=$('#fireworks');if(!root||root.children.length)return;for(let i=0;i<36;i++){const s=document.createElement('i');s.style.left=`${Math.random()*100}%`;s.style.top=`${Math.random()*75}%`;s.style.animationDelay=`${Math.random()*2}s`;root.append(s)}}

async function subscribeRealtime(){const sb=await getSupabase();if(!sb)return;realtimeChannel=sb.channel('oriza-db-live');const map={
  [TABLES.timeline]:loadTimeline,[TABLES.moments]:loadMoments,[TABLES.letters]:loadLetters,[TABLES.gallery]:loadGallery,[TABLES.movies]:loadMovies,[TABLES.wishes]:loadWishes,[TABLES.food]:loadFood,[TABLES.compliments]:loadCompliments,[TABLES.miss]:loadMiss,[TABLES.congrats]:loadCongrats
};Object.entries(map).forEach(([table,fn])=>realtimeChannel.on('postgres_changes',{event:'*',schema:'public',table},fn));realtimeChannel.on('postgres_changes',{event:'*',schema:'public',table:TABLES.chat},payload=>{if(payload.eventType==='INSERT'&&document.body.dataset.page!=='chat'&&payload.new?.sender!==actor())toast(`${payload.new.sender}: ${String(payload.new.message||'sent media').slice(0,80)}`);loadChat()});realtimeChannel.subscribe();}


async function uploadMomentFile(file){
  const sb=await getSupabase();
  if(!sb) throw new Error('Supabase is required for image upload.');
  if(!isAdmin()) throw new Error('Admin sign-in required.');

  const path=`moments/${Date.now()}-${filenameSafe(file.name)}`;
  const {error:upErr}=await sb.storage.from(SITE_IMAGE_BUCKET).upload(path,file,{upsert:false});
  if(upErr) throw upErr;

  const {data:urlData}=sb.storage.from(SITE_IMAGE_BUCKET).getPublicUrl(path);
  return {url:urlData.publicUrl,path};
}

async function setupAdmin(){if(document.body.dataset.page!=='admin')return;
  $('#adminMomentFile')?.addEventListener('change',async e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const preview=$('#adminMomentPreview');
    if(preview){
      preview.src=URL.createObjectURL(file);
      preview.style.display='block';
    }
  });
const sb=await getSupabase();if(!sb){$('#adminMessage').textContent='Supabase client could not load.';return}
  $('#loginForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=$('#adminEmail').value.trim().toLowerCase(),password=$('#adminPassword').value;
    if(email!==ADMIN_EMAIL.toLowerCase()) return toast(`Use the admin email: ${ADMIN_EMAIL}`,3500);
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error) return toast(`Admin login failed: ${error.message}`,3500);
    if(data?.user?.email?.toLowerCase()!==ADMIN_EMAIL.toLowerCase()){
      await sb.auth.signOut();
      return toast('This account is not authorized as the Sara site admin.',3500);
    }
    const {data:adminStatus,error:adminStatusError}=await sb.rpc('oriza_admin_status');
    if(adminStatusError || !adminStatus?.is_admin){
      await sb.auth.signOut();
      return toast(`Database admin check failed${adminStatus?.email ? ` for ${adminStatus.email}` : ''}. Run the latest master SQL.`,5000);
    }
    location.reload();
  });
  $('#logoutBtn')?.addEventListener('click',async()=>{await sb.auth.signOut();location.reload()});
  $('#adminLogin').hidden=isAdmin();$('#adminPanel').hidden=!isAdmin();
  $('#adminTimelineForm')?.addEventListener('submit',async e=>{e.preventDefault();const title=$('#adminTimelineTitle').value.trim(),text=$('#adminTimelineText').value.trim(),date=$('#adminTimelineDate').value;if(!title||!text)return;const payload={title,text,date:date||new Date().toISOString().slice(0,10)};let error;if(editingTimelineId){({error}=await sb.from(TABLES.timeline).update(payload).eq('id',editingTimelineId));editingTimelineId=null;}else{({error}=await sb.from(TABLES.timeline).insert(payload));}if(error)return toast(error.message);e.target.reset();e.target.querySelector('button').textContent='Add Memory';toast('Memory updated');loadTimeline();});
  $('#adminMomentForm')?.addEventListener('submit',async e=>{e.preventDefault();const title=$('#adminMomentTitle').value.trim(),text=$('#adminMomentText').value.trim(),date=$('#adminMomentDate').value;
    if(!title||!text)return;
    let image=$('#adminMomentImage').value.trim();
    const file=$('#adminMomentFile')?.files?.[0];
    if(file){
      try{
        const uploaded=await uploadMomentFile(file);
        image=uploaded.url;
      }catch(err){
        return toast(err.message);
      }
    }
    const payload={title,text,date:date||new Date().toISOString().slice(0,10),image:image||null};
    let error;if(editingMomentId){({error}=await sb.from(TABLES.moments).update(payload).eq('id',editingMomentId));editingMomentId=null;}else{({error}=await sb.from(TABLES.moments).insert(payload));}if(error)return toast(error.message);e.target.reset();e.target.querySelector('button').textContent='Add Moment';toast('Moment updated');loadMoments();});
  $('#adminLetterForm')?.addEventListener('submit',async e=>{e.preventDefault();const title=$('#adminLetterTitle').value.trim(),body=$('#adminLetterBody').value.trim();if(!title||!body)return;const {error}=await sb.from(TABLES.letters).insert({title,body,date:new Date().toISOString().slice(0,10)});if(error)return toast(error.message);e.target.reset();toast('Letter saved')});
  $('#adminGalleryInput')?.addEventListener('change',async e=>{
    const files=[...e.target.files];
    if(!files.length)return;
    const caption=$('#adminGalleryCaption').value.trim();
    const input=e.target;
    let uploaded=0;
    try{
      toast(`Uploading ${files.length} photos...`);
      for(const file of files){
        await uploadGalleryFile(file,caption);
        uploaded++;
      }
      input.value='';
      $('#adminGalleryCaption').value='';
      toast(`${uploaded} photos uploaded ✦`);
    }catch(err){
      toast(`Uploaded ${uploaded}/${files.length}. ${err.message}`);
    }
  });
  $('#adminComplimentForm')?.addEventListener('submit',async e=>{e.preventDefault();const text=$('#adminCompliment').value.trim();if(!text)return;const {error}=await sb.from(TABLES.compliments).insert({text});if(error)return toast(error.message);e.target.reset();toast('Compliment added')});
  $('#adminCongratsForm')?.addEventListener('submit',async e=>{e.preventDefault();const payload={title:$('#adminCongratsTitle').value.trim(),message:$('#adminCongratsMessage').value.trim(),is_active:$('#adminCongratsActive').checked,updated_at:new Date().toISOString()};const {error}=await sb.from(TABLES.congrats).update(payload).eq('id',1);if(error)return toast(error.message);toast('Celebration updated')});
}
function renderAdminLetters(){const r=$('#adminLettersList');if(!r)return;r.innerHTML=latest.letters.map(x=>`<div class="admin-row"><div><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.date||'')}</small></div><button data-admin-del-letter="${x.id}">Delete</button></div>`).join('')||'<div class="empty-state">No letters</div>';$$('[data-admin-del-letter]',r).forEach(b=>b.onclick=async()=>{const sb=await getSupabase();if(confirm('Delete this letter?'))await sb.from(TABLES.letters).delete().eq('id',b.dataset.adminDelLetter)})}
function renderAdminGallery(){const r=$('#adminGalleryList');if(!r)return;r.innerHTML=latest.gallery.map(x=>`<div class="admin-row"><div><strong>${escapeHtml(x.title||'Photo')}</strong><small>${escapeHtml(x.storage_path||'')}</small></div><button data-admin-del-gallery="${x.id}">Delete</button></div>`).join('')||'<div class="empty-state">No photos</div>';$$('[data-admin-del-gallery]',r).forEach(b=>b.onclick=async()=>{const sb=await getSupabase();const x=latest.gallery.find(v=>v.id===b.dataset.adminDelGallery);if(confirm('Delete this photo?')){await sb.from(TABLES.gallery).delete().eq('id',b.dataset.adminDelGallery);if(x?.storage_path)await sb.storage.from(SITE_IMAGE_BUCKET).remove([x.storage_path])}})}
function renderAdminWishes(){const r=$('#adminWishesList');if(!r)return;r.innerHTML=latest.wishes.map(x=>`<div class="admin-row"><span>${escapeHtml(x.wish)}</span><button data-admin-del-wish="${x.id}">Delete</button></div>`).join('')||'<div class="empty-state">No wishes</div>';$$('[data-admin-del-wish]',r).forEach(b=>b.onclick=async()=>{const sb=await getSupabase();await sb.from(TABLES.wishes).delete().eq('id',b.dataset.adminDelWish)})}
function renderAdminCompliments(){const r=$('#adminComplimentsList');if(!r)return;r.innerHTML=latest.compliments.filter(x=>typeof x.id==='string').map(x=>`<div class="admin-row"><span>${escapeHtml(x.text)}</span><button data-admin-del-comp="${x.id}">Delete</button></div>`).join('')||'<div class="empty-state">No custom compliments</div>';$$('[data-admin-del-comp]',r).forEach(b=>b.onclick=async()=>{const sb=await getSupabase();await sb.from(TABLES.compliments).delete().eq('id',b.dataset.adminDelComp)})}
function renderAdminCongrats(){if(!latest.congrats)return;if($('#adminCongratsTitle'))$('#adminCongratsTitle').value=latest.congrats.title||'';if($('#adminCongratsMessage'))$('#adminCongratsMessage').value=latest.congrats.message||'';if($('#adminCongratsActive'))$('#adminCongratsActive').checked=latest.congrats.is_active!==false;}

function wireCommonForms(){
  $('#letterForm')?.addEventListener('submit',submitLetter);setupGalleryUpload();setupChat();setupMovies();setupWishes();setupFood();setupLoveModal();
  $('#missYouBtn')?.addEventListener('click',sendMiss);$('#complimentBtn')?.addEventListener('click',showCompliment);
}

async function loadForPage(){const p=document.body.dataset.page;const tasks=[];if(['home','admin'].includes(p))tasks.push(loadTimeline(),loadMoments());if(['home','letters','admin'].includes(p))tasks.push(loadLetters());if(['home','gallery','admin'].includes(p))tasks.push(loadGallery());if(p==='chat')tasks.push(loadChat());if(p==='movies')tasks.push(loadMovies());if(['wishes','admin'].includes(p))tasks.push(loadWishes());if(['food','admin'].includes(p))tasks.push(loadFood());if(['home','admin'].includes(p))tasks.push(loadCompliments(),loadMiss());if(p==='admin')tasks.push(loadLoveResponses());if(['congrats','admin'].includes(p))tasks.push(loadCongrats());await Promise.all(tasks)}

async function boot(){
  lanterns();navActive();setupMobileNav();tilt();updateHeroTime();setupMusic();await initAuth();if(await checkWholeSiteState())return;applyAdminUI();wireCommonForms();setupBirthdayTicker();setupCongrats();await loadForPage();await setupPresence();await subscribeRealtime();await setupAdmin();renderHomeMagic();
}

function setupMobileNav(){
  const header=$('.site-header');
  const nav=header?.querySelector('.nav');
  if(!header||!nav||header.querySelector('.mobile-nav-toggle'))return;
  const toggle=document.createElement('button');
  toggle.className='mobile-nav-toggle';
  toggle.type='button';
  toggle.setAttribute('aria-label','Open navigation');
  toggle.setAttribute('aria-expanded','false');
  toggle.innerHTML='<span></span><span></span><span></span>';
  header.append(toggle);
  const scrim=document.createElement('button');
  scrim.className='nav-scrim';
  scrim.type='button';
  scrim.setAttribute('aria-label','Close navigation');
  document.body.append(scrim);
  const close=()=>{document.body.classList.remove('nav-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation')};
  const open=()=>{document.body.classList.add('nav-open');toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Close navigation')};
  toggle.addEventListener('click',()=>document.body.classList.contains('nav-open')?close():open());
  scrim.addEventListener('click',close);
  nav.addEventListener('click',e=>{if(e.target.closest('a'))close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  window.addEventListener('resize',()=>{if(window.innerWidth>760)close()},{passive:true});
}
document.addEventListener('DOMContentLoaded',boot);