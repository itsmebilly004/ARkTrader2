create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  loginid text,
  deriv_token text not null,
  is_demo boolean not null default false,
  is_virtual boolean,
  currency text,
  balance numeric,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists account_id text,
  add column if not exists loginid text,
  add column if not exists deriv_token text,
  add column if not exists is_demo boolean not null default false,
  add column if not exists is_virtual boolean,
  add column if not exists currency text,
  add column if not exists balance numeric,
  add column if not exists is_active boolean not null default true,
  add column if not exists expires_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

update public.sessions
set
  loginid = coalesce(loginid, account_id),
  is_virtual = coalesce(is_virtual, is_demo)
where loginid is null
   or is_virtual is null;

alter table public.sessions
  alter column user_id set not null,
  alter column account_id set not null,
  alter column deriv_token set not null,
  alter column is_demo set not null,
  alter column is_demo set default false,
  alter column is_active set not null,
  alter column is_active set default true,
  alter column created_at set not null,
  alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_attribute a1 on a1.attrelid = i.indrelid and a1.attnum = i.indkey[0]
    join pg_attribute a2 on a2.attrelid = i.indrelid and a2.attnum = i.indkey[1]
    where i.indrelid = 'public.sessions'::regclass
      and i.indisunique
      and i.indnatts = 2
      and a1.attname = 'user_id'
      and a2.attname = 'account_id'
  ) then
    alter table public.sessions
      add constraint sessions_user_id_account_id_key unique (user_id, account_id);
  end if;
end $$;

alter table public.sessions enable row level security;

drop policy if exists sessions_all_own on public.sessions;
create policy sessions_all_own on public.sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
