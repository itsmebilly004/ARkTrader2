create table if not exists public.accounts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  loginid     text        not null,
  account_type text       not null default 'real',
  currency    text        not null default 'USD',
  balance     numeric(15,2) not null default 10000.00,
  is_demo     boolean     not null default false,
  is_virtual  boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(user_id, loginid)
);

alter table public.accounts enable row level security;

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
