create table if not exists oriza_authorized_users (
 id bigint generated always as identity primary key,
 user_id uuid unique not null references auth.users(id) on delete cascade,
 active boolean default true
);

alter table oriza_authorized_users enable row level security;

create policy "users can check own access" on oriza_authorized_users
for select using (auth.uid() = user_id);
