import { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL } from './supabase-config.js';

const { createClient } = await import(
'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
);

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth:{
    persistSession:true,
    autoRefreshToken:true,
    storageKey:'oriza-auth-session'
  }
});

// IMPORTANT:
// Do not redirect here.
// Admin page contains its own admin login form.
// Redirecting here caused the page to flash and return to homepage
// before admin login could happen.

window.orizaAdminClient = sb;
window.orizaAdminEmail = ADMIN_EMAIL;
