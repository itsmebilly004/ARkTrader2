-- Repair account balance access for the simulation app.
-- The frontend reads balances from public.accounts for the signed-in Supabase user.

alter table public.accounts enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.accounts to authenticated;
grant select, insert, update on public.users to authenticated;

drop policy if exists "Users can read own accounts" on public.accounts;
drop policy if exists "Users can view their own accounts" on public.accounts;
drop policy if exists "Users can insert own accounts" on public.accounts;
drop policy if exists "Users can insert their own accounts" on public.accounts;
drop policy if exists "Users can update own accounts" on public.accounts;
drop policy if exists "Users can update their own accounts" on public.accounts;

create policy "Users can read own accounts"
  on public.accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert own accounts"
  on public.accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own accounts"
  on public.accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.get_my_accounts()
returns setof public.accounts
language sql
security definer
set search_path = public
as $$
  select *
  from public.accounts
  where user_id = auth.uid()
  order by is_demo asc, created_at asc;
$$;

revoke all on function public.get_my_accounts() from public;
grant execute on function public.get_my_accounts() to authenticated;
