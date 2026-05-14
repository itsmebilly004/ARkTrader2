alter table public.sessions
  add column if not exists trading_authorized boolean not null default false,
  add column if not exists trading_adapter text,
  add column if not exists token_source text,
  add column if not exists trading_authorized_at timestamptz,
  add column if not exists last_trading_error text;

alter table public.sessions
  drop constraint if exists sessions_trading_adapter_check,
  add constraint sessions_trading_adapter_check
    check (trading_adapter is null or trading_adapter = 'oauth2PkceTradingAdapter');

alter table public.sessions
  drop constraint if exists sessions_token_source_check,
  add constraint sessions_token_source_check
    check (token_source is null or token_source = 'oauth_access_token');

notify pgrst, 'reload schema';
