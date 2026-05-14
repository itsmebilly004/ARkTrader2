-- Widen sessions.token_source and sessions.trading_adapter CHECK constraints so
-- that legacy direct-token Deriv accounts can be persisted alongside the new
-- OAuth2 PKCE accounts. The legacy flow has its own Deriv app_id and returns
-- tokens directly in the OAuth redirect (no code exchange).
--
-- Permitted values after this migration:
--   token_source     : NULL | 'oauth_access_token' | 'deriv_legacy_token'
--   trading_adapter  : NULL | 'oauth2PkceTradingAdapter' | 'legacyDirectTokenAdapter'
--
-- New-flow rows are untouched. This is purely additive.

alter table public.sessions
  drop constraint if exists sessions_trading_adapter_check,
  add constraint sessions_trading_adapter_check
    check (
      trading_adapter is null
      or trading_adapter = 'oauth2PkceTradingAdapter'
      or trading_adapter = 'legacyDirectTokenAdapter'
    );

alter table public.sessions
  drop constraint if exists sessions_token_source_check,
  add constraint sessions_token_source_check
    check (
      token_source is null
      or token_source = 'oauth_access_token'
      or token_source = 'deriv_legacy_token'
    );

notify pgrst, 'reload schema';
