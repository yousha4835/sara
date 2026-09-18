SARA SUPABASE — RPC CHAT FIX

1. Run oriza-master-schema.sql in Supabase SQL Editor (safe to rerun).
2. Replace the entire website with this folder.
3. Hard-refresh Ctrl+F5.
4. Test chat logged out first.

Chat writes now use oriza_send_chat_message RPC instead of direct table INSERT.

ADMIN RLS FIX: is_oriza_admin() now validates auth.uid() against auth.users using a SECURITY DEFINER helper.
