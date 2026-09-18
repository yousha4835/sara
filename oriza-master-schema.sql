-- ============================================================
-- ORIZA LOVE SITE — FRESH SUPABASE MASTER SCHEMA
-- Project: https://vtqyikdqkomgxmziklum.supabase.co
-- Admin: 2024000000167@seu.edu.bd
--
-- Run this ONE file once in Supabase -> SQL Editor.
-- It creates every Oriza table, RLS policy, Storage bucket,
-- function, seed row, grant and Realtime publication entry.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- ADMIN IDENTITY
-- ============================================================
create or replace function public.is_oriza_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as u
    where u.id = (select auth.uid())
      and lower(coalesce(u.email, '')) = lower('2024000000167@seu.edu.bd')
  );
$$;

revoke all on function public.is_oriza_admin() from public;
grant execute on function public.is_oriza_admin() to anon, authenticated;

-- Diagnostic helper used by the admin page after login. It only exposes
-- the currently authenticated user's own identity and the result of the
-- admin check, never other auth.users rows.
create or replace function public.oriza_admin_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'email', (select u.email from auth.users as u where u.id = auth.uid()),
    'is_admin', public.is_oriza_admin()
  );
$$;

revoke all on function public.oriza_admin_status() from public;
grant execute on function public.oriza_admin_status() to authenticated;

-- ============================================================
-- TABLES
-- ============================================================
create table if not exists public.oriza_timeline (
  id uuid primary key default gen_random_uuid(),
  date timestamptz,
  title text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.oriza_moments (
  id uuid primary key default gen_random_uuid(),
  date date,
  title text not null,
  text text not null,
  image text,
  created_at timestamptz not null default now()
);

create table if not exists public.oriza_letters (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  title text not null check (char_length(title) between 1 and 220),
  body text not null check (char_length(body) between 1 and 12000),
  created_at timestamptz not null default now()
);

create table if not exists public.oriza_gallery (
  id uuid primary key default gen_random_uuid(),
  title text,
  image text not null,
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.oriza_wishes (
  id uuid primary key default gen_random_uuid(),
  wish text not null check (char_length(wish) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.oriza_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender text not null check (sender in ('Oriza','Yousha')),
  message text not null default '',
  message_type text not null default 'text'
    check (message_type in ('text','image','audio','video','file')),
  media_url text,
  media_path text,
  media_name text,
  media_mime text,
  media_size bigint,
  created_at timestamptz not null default now(),
  constraint oriza_chat_payload_check check (
    (message_type='text' and char_length(message) between 1 and 900)
    or
    (
      message_type<>'text'
      and media_url is not null
      and media_path is not null
      and coalesce(media_size,0) between 0 and 15728640
      and char_length(message)<=900
    )
  )
);
create index if not exists oriza_chat_created_idx
  on public.oriza_chat_messages(created_at);
alter table public.oriza_chat_messages replica identity full;

create table if not exists public.oriza_movie_watchlist (
  id uuid primary key default gen_random_uuid(),
  tmdb_id bigint,
  title text not null check (char_length(title) between 1 and 300),
  overview text,
  poster_path text,
  release_date text,
  vote_average numeric default 0,
  note text,
  status text not null default 'planned' check (status in ('planned','watched')),
  added_at timestamptz not null default now(),
  watched_at timestamptz
);
create unique index if not exists oriza_movie_tmdb_unique
  on public.oriza_movie_watchlist(tmdb_id) where tmdb_id is not null;
alter table public.oriza_movie_watchlist replica identity full;

create table if not exists public.oriza_food_wishlist (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  image text,
  source text not null default 'Manual',
  external_id text,
  category text,
  note text,
  status text not null default 'craving' check (status in ('craving','got_it')),
  added_at timestamptz not null default now(),
  got_at timestamptz
);
create unique index if not exists oriza_food_external_unique
  on public.oriza_food_wishlist(source,external_id) where external_id is not null;

create table if not exists public.oriza_love_responses (
  id uuid primary key default gen_random_uuid(),
  answer text not null check (answer in ('yes','no')),
  created_at timestamptz not null default now()
);

create table if not exists public.oriza_compliments (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 1 and 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.oriza_miss_pings (
  id uuid primary key default gen_random_uuid(),
  actor text not null check (actor in ('Oriza','Yousha')),
  local_day text not null check (local_day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  created_at timestamptz not null default now()
);
create index if not exists oriza_miss_day_idx
  on public.oriza_miss_pings(local_day,created_at desc);
create index if not exists oriza_miss_actor_day_idx
  on public.oriza_miss_pings(actor,local_day);

create table if not exists public.oriza_congrats_page (
  id integer primary key default 1 check (id=1),
  title text not null default 'Congratulations, Oriza',
  message text not null default 'A little celebration made especially for you.',
  is_active boolean not null default true,
  self_destruct_at timestamptz,
  choice text not null default 'pending'
    check (choice in ('pending','keep','self_destruct_opened','self_destruct_confirmed')),
  choice_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.oriza_congrats_page(id,title,message,is_active)
values (1,'Congratulations, Oriza','A little celebration made especially for you.',true)
on conflict(id) do nothing;
alter table public.oriza_congrats_page replica identity full;

-- ============================================================
-- ENABLE RLS
-- ============================================================
alter table public.oriza_timeline enable row level security;
alter table public.oriza_moments enable row level security;
alter table public.oriza_letters enable row level security;
alter table public.oriza_gallery enable row level security;
alter table public.oriza_wishes enable row level security;
alter table public.oriza_chat_messages enable row level security;
alter table public.oriza_movie_watchlist enable row level security;
alter table public.oriza_food_wishlist enable row level security;
alter table public.oriza_love_responses enable row level security;
alter table public.oriza_compliments enable row level security;
alter table public.oriza_miss_pings enable row level security;
alter table public.oriza_congrats_page enable row level security;

-- Remove Oriza policies on rerun without touching unrelated project policies.
do $$
declare r record;
begin
  for r in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public' and tablename like 'oriza_%'
  loop
    execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

-- ============================================================
-- CONTENT POLICIES
-- Public site may read. Only the exact admin account may edit.
-- ============================================================
create policy "oriza timeline read"
  on public.oriza_timeline for select to anon,authenticated using (true);
create policy "oriza timeline admin"
  on public.oriza_timeline for all to authenticated
  using (public.is_oriza_admin()) with check (public.is_oriza_admin());

create policy "oriza moments read"
  on public.oriza_moments for select to anon,authenticated using (true);
create policy "oriza moments admin"
  on public.oriza_moments for all to authenticated
  using (public.is_oriza_admin()) with check (public.is_oriza_admin());

create policy "oriza letters read"
  on public.oriza_letters for select to anon,authenticated using (true);
create policy "oriza letters admin"
  on public.oriza_letters for all to authenticated
  using (public.is_oriza_admin()) with check (public.is_oriza_admin());

create policy "oriza gallery read"
  on public.oriza_gallery for select to anon,authenticated using (true);
create policy "oriza gallery admin"
  on public.oriza_gallery for all to authenticated
  using (public.is_oriza_admin()) with check (public.is_oriza_admin());

-- Wishes: shared visitor feature.
create policy "oriza wishes read"
  on public.oriza_wishes for select to anon,authenticated using (true);
create policy "oriza wishes insert"
  on public.oriza_wishes for insert to anon,authenticated with check (true);
create policy "oriza wishes admin delete"
  on public.oriza_wishes for delete to authenticated using (public.is_oriza_admin());

-- ============================================================
-- CHAT POLICIES
-- Reliability rule:
--   * anyone using the public client may send as Oriza
--   * ONLY the configured admin may send as Yousha
-- This intentionally permits the admin session to also insert a Oriza row,
-- preventing the old authenticated-session/RLS mismatch from occurring.
-- ============================================================
create policy "oriza chat read"
  on public.oriza_chat_messages for select to anon,authenticated using (true);

create policy "oriza chat insert"
  on public.oriza_chat_messages for insert to anon,authenticated
  with check (
    sender='Oriza'
    or (sender='Yousha' and public.is_oriza_admin())
  );

create policy "oriza chat delete"
  on public.oriza_chat_messages for delete to anon,authenticated
  using (
    public.is_oriza_admin()
    or (sender='Oriza' and created_at > now()-interval '15 minutes')
  );

-- ============================================================
-- RELIABLE CHAT RPC
-- Direct browser INSERT can be affected by stale/auth role state.
-- These SECURITY DEFINER functions validate the sender explicitly,
-- then perform the write server-side while RLS remains enabled.
-- ============================================================
create or replace function public.oriza_send_chat_message(
  p_sender text,
  p_message text default '',
  p_message_type text default 'text',
  p_media_url text default null,
  p_media_path text default null,
  p_media_name text default null,
  p_media_mime text default null,
  p_media_size bigint default null
)
returns public.oriza_chat_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.oriza_chat_messages%rowtype;
begin
  if p_sender not in ('Oriza','Yousha') then
    raise exception 'Invalid sender';
  end if;

  if p_sender = 'Yousha' and not public.is_oriza_admin() then
    raise exception 'Only the configured admin can send as Yousha' using errcode = '42501';
  end if;

  if p_message_type not in ('text','image','audio','video','file') then
    raise exception 'Invalid message type';
  end if;

  insert into public.oriza_chat_messages(
    sender,message,message_type,media_url,media_path,media_name,media_mime,media_size
  ) values (
    p_sender,coalesce(p_message,''),p_message_type,p_media_url,p_media_path,p_media_name,p_media_mime,p_media_size
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.oriza_send_chat_message(text,text,text,text,text,text,text,bigint) from public;
grant execute on function public.oriza_send_chat_message(text,text,text,text,text,text,text,bigint) to anon,authenticated;

create or replace function public.oriza_delete_chat_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.oriza_chat_messages;
begin
  select * into v_msg from public.oriza_chat_messages where id=p_id;
  if not found then return; end if;

  if not (public.is_oriza_admin() or (v_msg.sender='Oriza' and v_msg.created_at > now()-interval '15 minutes')) then
    raise exception 'This message can no longer be unsent' using errcode='42501';
  end if;

  delete from public.oriza_chat_messages where id=p_id;
end;
$$;

revoke all on function public.oriza_delete_chat_message(uuid) from public;
grant execute on function public.oriza_delete_chat_message(uuid) to anon,authenticated;

-- Movie night: shared watchlist.
create policy "oriza movies read"
  on public.oriza_movie_watchlist for select to anon,authenticated using (true);
create policy "oriza movies insert"
  on public.oriza_movie_watchlist for insert to anon,authenticated
  with check (status in ('planned','watched'));
create policy "oriza movies update"
  on public.oriza_movie_watchlist for update to anon,authenticated
  using (true) with check (status in ('planned','watched'));
create policy "oriza movies delete"
  on public.oriza_movie_watchlist for delete to anon,authenticated using (true);

-- Food: shared additions, admin completion/removal.
create policy "oriza food read"
  on public.oriza_food_wishlist for select to anon,authenticated using (true);
create policy "oriza food insert"
  on public.oriza_food_wishlist for insert to anon,authenticated
  with check (status='craving');
create policy "oriza food admin update"
  on public.oriza_food_wishlist for update to authenticated
  using (public.is_oriza_admin()) with check (public.is_oriza_admin());
create policy "oriza food admin delete"
  on public.oriza_food_wishlist for delete to authenticated using (public.is_oriza_admin());

-- Love answer: visitors answer, admin reviews.
create policy "oriza love insert"
  on public.oriza_love_responses for insert to anon,authenticated
  with check (answer in ('yes','no'));
create policy "oriza love admin read"
  on public.oriza_love_responses for select to authenticated using (public.is_oriza_admin());
create policy "oriza love admin delete"
  on public.oriza_love_responses for delete to authenticated using (public.is_oriza_admin());

-- Compliments.
create policy "oriza compliments read"
  on public.oriza_compliments for select to anon,authenticated
  using (is_active or public.is_oriza_admin());
create policy "oriza compliments admin"
  on public.oriza_compliments for all to authenticated
  using (public.is_oriza_admin()) with check (public.is_oriza_admin());

-- I miss you counter: Oriza is public; only admin may claim Yousha.
create policy "oriza miss read"
  on public.oriza_miss_pings for select to anon,authenticated using (true);
create policy "oriza miss insert"
  on public.oriza_miss_pings for insert to anon,authenticated
  with check (
    actor='Oriza'
    or (actor='Yousha' and public.is_oriza_admin())
  );
create policy "oriza miss admin delete"
  on public.oriza_miss_pings for delete to authenticated using (public.is_oriza_admin());

-- Celebration state.
create policy "oriza congrats read"
  on public.oriza_congrats_page for select to anon,authenticated using (true);
create policy "oriza congrats admin"
  on public.oriza_congrats_page for all to authenticated
  using (public.is_oriza_admin()) with check (public.is_oriza_admin());

-- ============================================================
-- PUBLIC CELEBRATION RPCs
-- ============================================================
create or replace function public.oriza_set_congrats_choice(p_choice text)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_choice not in ('keep','self_destruct_opened') then
    raise exception 'invalid choice';
  end if;
  update public.oriza_congrats_page
  set choice=p_choice,choice_at=now(),updated_at=now()
  where id=1;
end $$;

create or replace function public.oriza_schedule_self_destruct()
returns timestamptz
language plpgsql
security definer
set search_path=public
as $$
declare target timestamptz;
begin
  target:=now()+interval '24 hours';
  update public.oriza_congrats_page
  set choice='self_destruct_confirmed',choice_at=now(),self_destruct_at=target,updated_at=now()
  where id=1;
  return target;
end $$;

revoke all on function public.oriza_set_congrats_choice(text) from public;
revoke all on function public.oriza_schedule_self_destruct() from public;
grant execute on function public.oriza_set_congrats_choice(text) to anon,authenticated;
grant execute on function public.oriza_schedule_self_destruct() to anon,authenticated;

-- ============================================================
-- STORAGE
-- ============================================================
insert into storage.buckets(id,name,public)
values ('oriza-site-images','oriza-site-images',true)
on conflict(id) do update set public=true;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'oriza-chat-media','oriza-chat-media',true,15728640,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav',
    'video/mp4','video/webm','video/quicktime',
    'application/pdf','text/plain'
  ]::text[]
)
on conflict(id) do update
set public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

-- Remove only policies created for these Oriza buckets.
drop policy if exists "oriza storage site read" on storage.objects;
drop policy if exists "oriza storage site insert" on storage.objects;
drop policy if exists "oriza storage site update" on storage.objects;
drop policy if exists "oriza storage site delete" on storage.objects;
drop policy if exists "oriza storage chat read" on storage.objects;
drop policy if exists "oriza storage chat insert" on storage.objects;
drop policy if exists "oriza storage chat delete" on storage.objects;

create policy "oriza storage site read"
  on storage.objects for select to anon,authenticated
  using (bucket_id='oriza-site-images');
create policy "oriza storage site insert"
  on storage.objects for insert to authenticated
  with check (bucket_id='oriza-site-images' and public.is_oriza_admin());
create policy "oriza storage site update"
  on storage.objects for update to authenticated
  using (bucket_id='oriza-site-images' and public.is_oriza_admin())
  with check (bucket_id='oriza-site-images' and public.is_oriza_admin());
create policy "oriza storage site delete"
  on storage.objects for delete to authenticated
  using (bucket_id='oriza-site-images' and public.is_oriza_admin());

create policy "oriza storage chat read"
  on storage.objects for select to anon,authenticated
  using (bucket_id='oriza-chat-media');

-- oriza/* is always permitted; yousha/* requires the real admin.
create policy "oriza storage chat insert"
  on storage.objects for insert to anon,authenticated
  with check (
    bucket_id='oriza-chat-media'
    and (
      lower(coalesce((storage.foldername(name))[1],''))='oriza'
      or (
        lower(coalesce((storage.foldername(name))[1],''))='yousha'
        and public.is_oriza_admin()
      )
    )
  );

create policy "oriza storage chat delete"
  on storage.objects for delete to anon,authenticated
  using (
    bucket_id='oriza-chat-media'
    and (
      public.is_oriza_admin()
      or (
        lower(coalesce((storage.foldername(name))[1],''))='oriza'
        and created_at > now()-interval '15 minutes'
      )
    )
  );

-- ============================================================
-- GRANTS
-- RLS above remains the actual access controller.
-- ============================================================
grant usage on schema public to anon,authenticated;

grant select on
  public.oriza_timeline,
  public.oriza_moments,
  public.oriza_letters,
  public.oriza_gallery,
  public.oriza_wishes,
  public.oriza_chat_messages,
  public.oriza_movie_watchlist,
  public.oriza_food_wishlist,
  public.oriza_compliments,
  public.oriza_miss_pings,
  public.oriza_congrats_page
  to anon,authenticated;

grant insert on
  public.oriza_wishes,
  public.oriza_chat_messages,
  public.oriza_movie_watchlist,
  public.oriza_food_wishlist,
  public.oriza_love_responses,
  public.oriza_miss_pings
  to anon,authenticated;

grant update,delete on public.oriza_movie_watchlist to anon,authenticated;
grant delete on public.oriza_chat_messages to anon,authenticated;

grant all on
  public.oriza_timeline,
  public.oriza_moments,
  public.oriza_letters,
  public.oriza_gallery,
  public.oriza_compliments,
  public.oriza_congrats_page
  to authenticated;
grant select,delete on public.oriza_love_responses to authenticated;
grant delete on public.oriza_wishes,public.oriza_miss_pings to authenticated;
grant update,delete on public.oriza_food_wishlist to authenticated;

-- ============================================================
-- SEED COMPLIMENTS
-- ============================================================
insert into public.oriza_compliments(text)
select v.text
from (values
  ('Your smile feels like the safest place in the world.'),
  ('You make ordinary days feel like a soft little movie.'),
  ('I love how your existence makes my heart calm.'),
  ('You are my favorite notification, my favorite thought, my favorite person.'),
  ('Even when the day is heavy, thinking of you makes it lighter.'),
  ('You somehow make the world feel warmer just by being in it.'),
  ('If I could bottle one feeling, it would be the peace I feel around you.')
) as v(text)
where not exists (select 1 from public.oriza_compliments);

-- ============================================================
-- REALTIME POSTGRES CHANGES
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'oriza_timeline','oriza_moments','oriza_letters','oriza_gallery','oriza_wishes',
    'oriza_chat_messages','oriza_movie_watchlist','oriza_food_wishlist',
    'oriza_love_responses','oriza_compliments','oriza_miss_pings','oriza_congrats_page'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
exception when undefined_object then
  raise notice 'supabase_realtime publication was not available yet; enable Realtime in the dashboard if needed.';
end $$;

-- ============================================================
-- END OF THE ONE MASTER SQL
-- ============================================================
