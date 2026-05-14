export type DerivAccountLike = Record<string, unknown> & {
  account_id?: string | null;
  loginid?: string | null;
  login_id?: string | null;
  accountId?: string | null;
  id?: string | null;
  currency?: string | null;
  balance?: string | number | { amount?: string | number } | null;
  deriv_token?: string | null;
  is_demo?: boolean | string | number | null;
  is_virtual?: boolean | string | number | null;
  account_type?: string | null;
  category?: string | null;
  type?: string | null;
  status?: string | null;
};

export type DerivAccountType = "demo" | "real" | "unknown";
export type DerivAccountPrefix = "DOT" | "ROT" | "VRTC" | "VRT" | "VR" | "CR";
export type DerivAccountPlacement = "demoAccounts" | "realAccounts" | "excluded";

export type DerivAccountClassification = {
  type: DerivAccountType;
  normalizedType: DerivAccountType;
  reason: string;
  detectedPrefix: DerivAccountPrefix | null;
  matchedAccountId: string | null;
  finalTabPlacement: DerivAccountPlacement;
};

export type DerivAccountNormalizeOptions = {
  /**
   * Kept for call-site compatibility. Prefix rules are authoritative and this
   * option no longer affects account type classification.
   */
  trustVirtualFlags?: boolean;
};

export type NormalizedDerivAccount = {
  account_id: string;
  loginid: string;
  type: DerivAccountType;
  normalizedType: DerivAccountType;
  label: string;
  currency: string | null;
  balance: number;
  deriv_token?: string | null;
  is_demo: boolean;
  is_virtual: boolean;
  account_type: string | null;
  classification_reason: string;
  detected_prefix: DerivAccountPrefix | null;
  final_tab_placement: DerivAccountPlacement;
  status?: string;
};

const DEMO_PREFIXES = ["DOT", "VRTC", "VRT", "VR"] as const;
const REAL_PREFIXES = ["ROT", "CR"] as const;
const DERIV_PREFIXES = ["VRTC", "DOT", "ROT", "VRT", "VR", "CR"] as const;

const CURRENCY_LABELS: Record<string, string> = {
  AUD: "Australian Dollar",
  BTC: "Bitcoin",
  ETH: "Ethereum",
  EUR: "Euro",
  GBP: "British Pound",
  LTC: "Litecoin",
  USD: "US Dollar",
  USDC: "USD Coin",
  USDT: "Tether",
};

export function stringFrom(...values: unknown[]) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function booleanFrom(value: unknown) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

export function numberFrom(value: unknown) {
  const raw =
    typeof value === "object" && value !== null && "amount" in value
      ? (value as { amount?: unknown }).amount
      : value;
  if (raw == null || raw === "") return 0;
  const number = Number(raw);
  return Number.isFinite(number) ? number : 0;
}

export function accountLoginId(account: DerivAccountLike) {
  const ids = accountIdentityIds(account);
  const derivId = ids.find(isKnownDerivAccountId);
  const tokenId = ids.find(isTokenAccountId);
  return (
    derivId ??
    tokenId ??
    stringFrom(account.loginid, account.account_id, account.login_id, account.accountId, account.id)
  );
}

function accountIdentityIds(account: DerivAccountLike) {
  return [account.loginid, account.account_id, account.login_id, account.accountId, account.id]
    .map((value) =>
      String(value ?? "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
}

function detectAccountPrefix(id: string): DerivAccountPrefix | null {
  return (DERIV_PREFIXES.find((prefix) => id.startsWith(prefix)) ??
    null) as DerivAccountPrefix | null;
}

function isDemoAccountId(id: string) {
  const prefix = detectAccountPrefix(id);
  return Boolean(prefix && DEMO_PREFIXES.includes(prefix as (typeof DEMO_PREFIXES)[number]));
}

function isRealAccountId(id: string) {
  const prefix = detectAccountPrefix(id);
  return Boolean(prefix && REAL_PREFIXES.includes(prefix as (typeof REAL_PREFIXES)[number]));
}

function isKnownDerivAccountId(id: string) {
  return Boolean(detectAccountPrefix(id));
}

function isTokenAccountId(id: string) {
  return /^(USDT|TRC20|BTC|ETH|LTC|USDC|UST)/.test(id);
}

function tabPlacement(type: DerivAccountType): DerivAccountPlacement {
  if (type === "demo") return "demoAccounts";
  if (type === "real") return "realAccounts";
  return "excluded";
}

function classification(
  type: DerivAccountType,
  reason: string,
  detectedPrefix: DerivAccountPrefix | null,
  matchedAccountId: string | null,
): DerivAccountClassification {
  return {
    type,
    normalizedType: type,
    reason,
    detectedPrefix,
    matchedAccountId,
    finalTabPlacement: tabPlacement(type),
  };
}

function classifyDerivAccount(account: DerivAccountLike): DerivAccountClassification {
  const accountIds = accountIdentityIds(account);
  const virtualFlag = booleanFrom(account.is_virtual);
  const demoFlag = booleanFrom(account.is_demo);
  const prefixMatches = accountIds
    .map((accountId) => ({
      accountId,
      prefix: detectAccountPrefix(accountId),
    }))
    .filter((match): match is { accountId: string; prefix: DerivAccountPrefix } =>
      Boolean(match.prefix),
    );
  const demoPrefix = prefixMatches.find((match) => isDemoAccountId(match.accountId));
  const realPrefix = prefixMatches.find((match) => isRealAccountId(match.accountId));

  if (demoPrefix && realPrefix) {
    return classification(
      "unknown",
      `conflicting Deriv account prefixes ${demoPrefix.prefix}/${realPrefix.prefix}`,
      demoPrefix.prefix,
      demoPrefix.accountId,
    );
  }

  if (demoPrefix) {
    return classification(
      "demo",
      `demo account id prefix ${demoPrefix.prefix}`,
      demoPrefix.prefix,
      demoPrefix.accountId,
    );
  }

  if (realPrefix) {
    return classification(
      "real",
      `real account id prefix ${realPrefix.prefix}`,
      realPrefix.prefix,
      realPrefix.accountId,
    );
  }

  if (virtualFlag === true || demoFlag === true) {
    return classification("demo", "Deriv virtual/demo account flag", null, accountIds[0] ?? null);
  }

  if (virtualFlag === false || demoFlag === false) {
    return classification("real", "Deriv non-virtual account flag", null, accountIds[0] ?? null);
  }

  return classification("unknown", "no recognized Deriv account id prefix", null, null);
}

export function getDerivAccountPrefix(account: DerivAccountLike) {
  return classifyDerivAccount(account).detectedPrefix;
}

export function hasDerivAccountPrefix(account: DerivAccountLike, prefix: DerivAccountPrefix) {
  return accountIdentityIds(account).some((accountId) => detectAccountPrefix(accountId) === prefix);
}

export function getDerivAccountType(
  account: DerivAccountLike,
  _options: DerivAccountNormalizeOptions = {},
) {
  return classifyDerivAccount(account).normalizedType;
}

export function isDemoAccount(
  account: DerivAccountLike,
  options: DerivAccountNormalizeOptions = {},
) {
  return getDerivAccountType(account, options) === "demo";
}

export function isRealAccount(
  account: DerivAccountLike,
  options: DerivAccountNormalizeOptions = {},
) {
  return getDerivAccountType(account, options) === "real";
}

export function isUnknownAccount(
  account: DerivAccountLike,
  options: DerivAccountNormalizeOptions = {},
) {
  return getDerivAccountType(account, options) === "unknown";
}

export function normalizeDerivAccount(
  account: DerivAccountLike,
  _options: DerivAccountNormalizeOptions = {},
) {
  const accountId = accountLoginId(account);
  if (!accountId) return null;

  const classification = classifyDerivAccount(account);
  const demo = classification.normalizedType === "demo";
  const real = classification.normalizedType === "real";
  const currency = stringFrom(account.currency, demo ? "USD" : "") || null;
  const label = demo
    ? "Demo"
    : real
      ? (CURRENCY_LABELS[currency ?? ""] ?? currency ?? "Real")
      : "Unknown";
  const normalized = {
    ...account,
    account_id: accountId,
    loginid: accountId,
    type: classification.normalizedType,
    normalizedType: classification.normalizedType,
    label,
    classification_reason: classification.reason,
    currency,
    balance: numberFrom(account.balance),
    is_demo: demo,
    is_virtual: demo,
    account_type: stringFrom(account.account_type, account.category, account.type) || null,
    detected_prefix: classification.detectedPrefix,
    final_tab_placement: classification.finalTabPlacement,
    status: stringFrom(account.status, "active"),
  } satisfies NormalizedDerivAccount & DerivAccountLike;

  console.info("[Deriv Accounts] normalized account placement", {
    raw_account_id: stringFrom(account.account_id, account.accountId, account.id),
    raw_loginid: stringFrom(account.loginid, account.login_id),
    normalized_account_id: normalized.account_id,
    detected_prefix: normalized.detected_prefix,
    normalizedType: normalized.normalizedType,
    final_tab_placement: normalized.final_tab_placement,
    forced_is_demo: normalized.is_demo,
    forced_is_virtual: normalized.is_virtual,
    classification_reason: normalized.classification_reason,
  });

  return normalized;
}
