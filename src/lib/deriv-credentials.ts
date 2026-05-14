// Generates a deterministic email + password for a Deriv account so we can
// transparently create / sign into a Supabase user without the trader ever
// seeing a password screen. The credentials are derived from the Deriv
// account id (a stable identifier returned by Deriv OAuth).
//
// The synthetic email uses a domain we control so it never conflicts with a
// real inbox. Password contains 24 chars derived via SubtleCrypto.

const SUFFIX = "arktradershub.com";
// Per-app salt — does not need to be secret, only stable.
const SALT = "ark-trader-hub::v1::";

function bufToHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function derivCredentials(derivAccountId: string) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(SALT + derivAccountId));
  const hex = bufToHex(hash);
  return {
    email: `${derivAccountId.toLowerCase()}@${SUFFIX}`,
    // 24 chars, mixes case and digits for Supabase password rules.
    password: `Dx!${hex.slice(0, 20)}A1`,
  };
}
