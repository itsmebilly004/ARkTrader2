alter table public.sessions
  add column if not exists loginid text,
  add column if not exists is_virtual boolean;

update public.sessions
set
  loginid = coalesce(loginid, account_id),
  is_virtual = coalesce(is_virtual, is_demo)
where loginid is null
   or is_virtual is null;
