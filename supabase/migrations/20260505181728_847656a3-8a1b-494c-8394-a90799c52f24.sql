-- 1. users profile
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  deriv_user_id text unique,
  deriv_account text,
  deriv_currency text default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.users enable row level security;
create policy "users_select_own" on public.users for select using (auth.uid() = id);
create policy "users_insert_own" on public.users for insert with check (auth.uid() = id);
create policy "users_update_own" on public.users for update using (auth.uid() = id);

-- 2. sessions (Deriv OAuth tokens, one per linked Deriv account)
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deriv_token text not null,
  account_id text not null,
  currency text,
  balance numeric,
  is_demo boolean not null default false,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, account_id)
);
alter table public.sessions enable row level security;
create policy "sessions_all_own" on public.sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. trades
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deriv_contract_id text,
  symbol text not null,
  trade_type text not null,
  stake numeric not null,
  payout numeric,
  profit_loss numeric,
  status text not null default 'open',
  duration text,
  entry_spot numeric,
  exit_spot numeric,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
alter table public.trades enable row level security;
create policy "trades_all_own" on public.trades for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. watchlist
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  added_at timestamptz not null default now(),
  unique (user_id, symbol)
);
alter table public.watchlist enable row level security;
create policy "watchlist_all_own" on public.watchlist for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, deriv_user_id, deriv_account)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'deriv_account_id',
    new.raw_user_meta_data ->> 'deriv_account_id'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();