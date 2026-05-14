export const DERIV_OAUTH_CLIENT_ID = "33dF8d2wwjIpeFDBvNkln";
export const DERIV_REDIRECT_URI = "https://www.arktradershub.com/deriv-callback";
export const DERIV_OAUTH_AUTHORIZE_ENDPOINT = "https://auth.deriv.com/oauth2/auth";
export const DERIV_OAUTH_TOKEN_ENDPOINT = "https://auth.deriv.com/oauth2/token";
export const DERIV_API_BASE_URL = "https://api.derivws.com";
export const DERIV_OAUTH_SCOPE = "trade account_manage";

// Legacy direct-token OAuth flow (older Deriv accounts that don't use OAuth2 PKCE).
// Tokens come back in the redirect query (token1/acct1/cur1/...) and are used directly
// against the public WebSocket with `authorize { authorize: <token> }`.
export const DERIV_LEGACY_APP_ID = "133647";
export const DERIV_LEGACY_REDIRECT_URI = "https://www.arktradershub.com/redirect";
export const DERIV_LEGACY_AUTHORIZE_ENDPOINT = "https://oauth.deriv.com/oauth2/authorize";
export const DERIV_LEGACY_WEBSOCKET_URL = "wss://ws.derivws.com/websockets/v3";
