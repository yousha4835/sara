-- Run this if the previous policy was not created correctly

drop policy if exists "users can check own access" on public.oriza_authorized_users;

create policy "users can check own access"
on public.oriza_authorized_users
for select
to authenticated
using (auth.uid() = user_id);
