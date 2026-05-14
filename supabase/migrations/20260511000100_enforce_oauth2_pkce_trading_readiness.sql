update public.sessions
set
  is_active = false,
  trading_authorized = false,
  trading_authorized_at = null,
  last_trading_error = 'Reconnect this Deriv account through OAuth2 PKCE.'
where
  token_source = 'legacy_authorize_token'
  or trading_adapter in ('legacyTradingAdapter', 'newOAuthTradingAdapter');

update public.sessions
set
  trading_adapter = null,
  trading_authorized = false,
  trading_authorized_at = null
where trading_adapter is not null
  and trading_adapter <> 'oauth2PkceTradingAdapter';

update public.sessions
set
  token_source = null,
  trading_authorized = false,
  trading_authorized_at = null
where token_source is not null
  and token_source <> 'oauth_access_token';

alter table public.sessions
  drop constraint if exists sessions_trading_adapter_check,
  add constraint sessions_trading_adapter_check
    check (trading_adapter is null or trading_adapter = 'oauth2PkceTradingAdapter');

alter table public.sessions
  drop constraint if exists sessions_token_source_check,
  add constraint sessions_token_source_check
    check (token_source is null or token_source = 'oauth_access_token');

notify pgrst, 'reload schema';
