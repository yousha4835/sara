
import { SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_TABLE } from './supabase-config.js';

const { createClient } = await import(
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
);

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'oriza-auth-session'
  }
});

function createLock(){
  document.documentElement.style.visibility='hidden';

  const box=document.createElement('div');
  box.id='orizaAuthLock';
  box.innerHTML=`
  <div class="oriza-lock-card">
    <div class="lock-icon">🔒</div>
    <h1>Private World</h1>
    <p>Only invited people can enter Sara.</p>
    <input id="orizaEmail" type="email" placeholder="Email">
    <input id="orizaPassword" type="password" placeholder="Password">
    <button id="orizaLogin">Enter</button>
    <small id="orizaAuthMsg"></small>
  </div>`;

  document.body.prepend(box);
  document.documentElement.style.visibility='visible';
  return box;
}

const lock=createLock();
const msg=lock.querySelector('#orizaAuthMsg');

async function authorized(user){
  const {data,error}=await sb
    .from(AUTH_TABLE)
    .select('active')
    .eq('user_id',user.id)
    .eq('active',true)
    .maybeSingle();

  console.log("Sara authorization:",{user:user.id,data,error});

  return !error && data?.active===true;
}

function unlock(){
  lock.remove();
  document.documentElement.classList.add('oriza-authorized');
  document.body.classList.remove('oriza-locked');
}

async function checkSession(){
  const {data:{session}}=await sb.auth.getSession();

  if(session?.user && await authorized(session.user)){
    unlock();
    return true;
  }

  document.body.classList.add('oriza-locked');
  return false;
}

lock.querySelector('#orizaLogin').onclick=async()=>{
  msg.textContent="Checking access...";

  const email=lock.querySelector('#orizaEmail').value.trim();
  const password=lock.querySelector('#orizaPassword').value;

  const {data,error}=await sb.auth.signInWithPassword({
    email,
    password
  });

  if(error){
    msg.textContent=error.message;
    return;
  }

  if(await authorized(data.user)){
    unlock();
  }else{
    await sb.auth.signOut();
    msg.textContent="Account not invited";
  }
};

sb.auth.onAuthStateChange(async(_,session)=>{
  if(session?.user){
    if(await authorized(session.user)){
      unlock();
    }else{
      await sb.auth.signOut();
    }
  }
});

window.orizaAuthClient=sb;

checkSession();
