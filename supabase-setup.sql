-- ArkTrader Hub — Supabase database setup
-- Run this entire script in the Supabase SQL Editor (https://supabase.com/dashboard/project/fqjezgxidmdgjaqvzoto/sql)

-- ─── Enable UUID extension ────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── users ───────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can read own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.users for insert
  with check (auth.uid() = id);

-- ─── accounts (balance table) ─────────────────────────────────────────────────
create table if not exists public.accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  loginid      text not null,
  account_type text not null default 'real',
  currency     text not null default 'USD',
  balance      numeric not null default 0,
  is_demo      boolean not null default false,
  is_virtual   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, loginid)
);

alter table public.accounts enable row level security;

create policy "Users can read own accounts"
  on public.accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert own accounts"
  on public.accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own accounts"
  on public.accounts for update
  using (auth.uid() = user_id);

-- ─── trades ──────────────────────────────────────────────────────────────────
create table if not exists public.trades (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  symbol              text not null,
  trade_type          text not null,
  stake               numeric not null,
  payout              numeric,
  profit_loss         numeric,
  entry_spot          numeric,
  exit_spot           numeric,
  duration            text,
  status              text not null default 'open',
  deriv_contract_id   text,
  created_at          timestamptz not null default now(),
  closed_at           timestamptz
);

alter table public.trades enable row level security;

create policy "Users can read own trades"
  on public.trades for select
  using (auth.uid() = user_id);

create policy "Users can insert own trades"
  on public.trades for insert
  with check (auth.uid() = user_id);

create policy "Users can update own trades"
  on public.trades for update
  using (auth.uid() = user_id);

-- ─── bots ────────────────────────────────────────────────────────────────────
create table if not exists public.bots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  strategy    jsonb not null default '{}',
  status      text not null default 'stopped',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.bots enable row level security;

create policy "Users can manage own bots"
  on public.bots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── user_settings ───────────────────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id                 uuid primary key references public.users(id) on delete cascade,
  theme                   text,
  default_stake           numeric,
  max_stake               numeric,
  daily_loss_limit        numeric,
  max_consecutive_losses  integer,
  default_duration        text,
  preferred_symbol        text,
  default_demo            boolean,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can manage own settings"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── watchlist ───────────────────────────────────────────────────────────────
create table if not exists public.watchlist (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.users(id) on delete cascade,
  symbol    text not null,
  added_at  timestamptz not null default now(),
  unique (user_id, symbol)
);

alter table public.watchlist enable row level security;

create policy "Users can manage own watchlist"
  on public.watchlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── sessions (kept for compatibility, no longer actively used) ───────────────
create table if not exists public.sessions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  account_id            text not null,
  loginid               text,
  deriv_token           text not null default '',
  currency              text,
  balance               numeric,
  is_demo               boolean not null default false,
  is_virtual            boolean,
  is_active             boolean not null default true,
  expires_at            timestamptz,
  token_source          text,
  trading_adapter       text,
  trading_authorized    boolean not null default false,
  trading_authorized_at timestamptz,
  last_trading_error    text,
  created_at            timestamptz not null default now(),
  unique (user_id, account_id)
);

alter table public.sessions enable row level security;

create policy "Users can manage own sessions"
  on public.sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Auto-provision user profile + accounts on signup ────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  hex_id text;
  real_loginid text;
  demo_loginid text;
begin
  -- Insert profile row
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  -- Derive deterministic account IDs from UUID
  hex_id := replace(new.id::text, '-', '');
  real_loginid := 'ROT' || upper(substr(hex_id, 1, 8));
  demo_loginid := 'DOT' || upper(substr(hex_id, 9, 8));

  -- Insert real account with 0 balance
  insert into public.accounts (user_id, loginid, account_type, currency, balance, is_demo, is_virtual)
  values (new.id, real_loginid, 'real', 'USD', 0, false, false)
  on conflict (user_id, loginid) do nothing;

  -- Insert demo account with 0 balance
  insert into public.accounts (user_id, loginid, account_type, currency, balance, is_demo, is_virtual)
  values (new.id, demo_loginid, 'demo', 'USD', 0, true, true)
  on conflict (user_id, loginid) do nothing;

  return new;
end;
$$;

-- Drop and recreate the trigger to ensure it's up to date
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Enable Realtime for live balance updates ─────────────────────────────────
alter publication supabase_realtime add table public.accounts;
alter publication supabase_realtime add table public.trades;
