
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const { createClient } = await import(
'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
);

const sb = createClient(
 SUPABASE_URL,
 SUPABASE_ANON_KEY,
 {auth:{persistSession:true, autoRefreshToken:true, storageKey:'oriza-auth-session'}}
);

document.querySelector('#orizaLogout')?.addEventListener('click', async()=>{
 await sb.auth.signOut({scope:'local'});
 localStorage.clear();
 sessionStorage.clear();
 window.location.replace('index.html');
});
