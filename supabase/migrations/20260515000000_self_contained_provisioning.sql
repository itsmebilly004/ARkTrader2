-- Self-contained user provisioning.
-- Replaces handle_new_user() so every new Supabase auth user automatically gets:
--   1. A public.users profile row
--   2. A public.user_settings row
--   3. A real (paper) trading account with USD 10,000 starting balance
--   4. A demo trading account with USD 10,000 starting balance
--
-- Re-run safe: uses idempotent CREATE OR REPLACE + ON CONFLICT clauses.

-- Make sure public.accounts exists with the schema the app expects.
create table if not exists public.accounts (
  id           uuid          primary key default gen_random_uuid(),
  user_id      uuid          not null references auth.users(id) on delete cascade,
  loginid      text          not null,
  account_type text          not null default 'real',
  currency     text          not null default 'USD',
  balance      numeric(15,2) not null default 10000.00,
  is_demo      boolean       not null default false,
  is_virtual   boolean       not null default false,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now(),
  unique (user_id, loginid)
);

alter table public.accounts enable row level security;

drop policy if exists "Users can view their own accounts" on public.accounts;
drop policy if exists "Users can insert their own accounts" on public.accounts;
drop policy if exists "Users can update their own accounts" on public.accounts;

create policy "Users can view their own accounts"
  on public.accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own accounts"
  on public.accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own accounts"
  on public.accounts for update
  using (auth.uid() = user_id);

create or replace function public.update_accounts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists accounts_updated_at on public.accounts;
create trigger accounts_updated_at
  before update on public.accounts
  for each row execute function public.update_accounts_updated_at();

-- Auto-provisioning trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hex          text := replace(new.id::text, '-', '');
  v_real_loginid text := 'ROT' || substr(v_hex, 1, 8);
  v_demo_loginid text := 'DOT' || substr(v_hex, 9, 8);
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email      = excluded.email,
        updated_at = now();

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.accounts
    (user_id, loginid,        account_type, currency, balance,   is_demo, is_virtual)
  values
    (new.id,  v_real_loginid, 'real',       'USD',    10000.00,  false,   false)
  on conflict (user_id, loginid) do nothing;

  insert into public.accounts
    (user_id, loginid,        account_type, currency, balance,   is_demo, is_virtual)
  values
    (new.id,  v_demo_loginid, 'demo',       'USD',    10000.00,  true,    true)
  on conflict (user_id, loginid) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: provision rows for any existing auth user that doesn't yet have them.
insert into public.users (id, email)
select u.id, u.email
from auth.users u
left join public.users p on p.id = u.id
where p.id is null;

insert into public.user_settings (user_id)
select u.id
from auth.users u
left join public.user_settings s on s.user_id = u.id
where s.user_id is null;

insert into public.accounts (user_id, loginid, account_type, currency, balance, is_demo, is_virtual)
select u.id,
       'ROT' || substr(replace(u.id::text, '-', ''), 1, 8),
       'real',
       'USD',
       10000.00,
       false,
       false
from auth.users u
left join public.accounts a
  on a.user_id = u.id and a.is_demo = false
where a.id is null
on conflict (user_id, loginid) do nothing;

insert into public.accounts (user_id, loginid, account_type, currency, balance, is_demo, is_virtual)
select u.id,
       'DOT' || substr(replace(u.id::text, '-', ''), 9, 8),
       'demo',
       'USD',
       10000.00,
       true,
       true
from auth.users u
left join public.accounts a
  on a.user_id = u.id and a.is_demo = true
where a.id is null
on conflict (user_id, loginid) do nothing;
