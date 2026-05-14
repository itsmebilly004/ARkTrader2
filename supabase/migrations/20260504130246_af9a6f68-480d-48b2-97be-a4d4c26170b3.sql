
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

-- User settings
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_demo boolean not null default true,
  daily_loss_limit numeric not null default 50,
  max_stake numeric not null default 25,
  max_consecutive_losses int not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "settings_select_own" on public.user_settings for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.user_settings for update using (auth.uid() = user_id);

-- Trigger after both tables exist
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Deriv accounts
create table public.deriv_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deriv_account_id text not null,
  currency text,
  balance numeric default 0,
  is_demo boolean not null default true,
  api_token text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, deriv_account_id)
);
alter table public.deriv_accounts enable row level security;
create policy "deriv_select_own" on public.deriv_accounts for select using (auth.uid() = user_id);
create policy "deriv_insert_own" on public.deriv_accounts for insert with check (auth.uid() = user_id);
create policy "deriv_update_own" on public.deriv_accounts for update using (auth.uid() = user_id);
create policy "deriv_delete_own" on public.deriv_accounts for delete using (auth.uid() = user_id);

-- Trades
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_id text,
  market text not null,
  trade_type text not null,
  stake numeric not null,
  payout numeric,
  profit numeric default 0,
  result text check (result in ('win','loss','open','cancelled')) default 'open',
  is_demo boolean not null default true,
  bot_id uuid,
  created_at timestamptz not null default now()
);
create index trades_user_id_idx on public.trades(user_id, created_at desc);
alter table public.trades enable row level security;
create policy "trades_select_own" on public.trades for select using (auth.uid() = user_id);
create policy "trades_insert_own" on public.trades for insert with check (auth.uid() = user_id);
create policy "trades_update_own" on public.trades for update using (auth.uid() = user_id);

-- Bots
create table public.bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Bot',
  strategy text not null,
  market text not null default 'R_100',
  stake numeric not null default 1,
  martingale boolean not null default false,
  martingale_factor numeric not null default 2,
  take_profit numeric,
  stop_loss numeric,
  max_trades int not null default 20,
  status text not null default 'stopped' check (status in ('running','stopped','error')),
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bots enable row level security;
create policy "bots_select_own" on public.bots for select using (auth.uid() = user_id);
create policy "bots_insert_own" on public.bots for insert with check (auth.uid() = user_id);
create policy "bots_update_own" on public.bots for update using (auth.uid() = user_id);
create policy "bots_delete_own" on public.bots for delete using (auth.uid() = user_id);

-- Bot logs
create table public.bot_logs (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid references public.trades(id) on delete set null,
  outcome text,
  profit numeric default 0,
  message text,
  created_at timestamptz not null default now()
);
create index bot_logs_bot_id_idx on public.bot_logs(bot_id, created_at desc);
alter table public.bot_logs enable row level security;
create policy "bot_logs_select_own" on public.bot_logs for select using (auth.uid() = user_id);
create policy "bot_logs_insert_own" on public.bot_logs for insert with check (auth.uid() = user_id);
