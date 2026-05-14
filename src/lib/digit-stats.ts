export type DigitStats = {
  counts: number[];
  latest: number | null;
  percentages: number[];
};

export function lastDigitFromPrice(price: number) {
  if (!Number.isFinite(price)) return null;
  const text = price.toFixed(2);
  const digit = Number(text.slice(-1));
  return Number.isInteger(digit) && digit >= 0 && digit <= 9 ? digit : null;
}

export function digitsFromPrices(prices: number[], limit?: number) {
  const digits = prices.map(lastDigitFromPrice).filter((digit): digit is number => digit != null);
  if (typeof limit === "number" && limit > 0 && digits.length > limit) {
    return digits.slice(-limit);
  }
  return digits;
}

export function calculateDigitStats(digits: number[]): DigitStats {
  const counts = Array.from({ length: 10 }, () => 0);
  for (const digit of digits) counts[digit] += 1;
  const total = Math.max(digits.length, 1);
  return {
    counts,
    latest: digits.at(-1) ?? null,
    percentages: counts.map((count) => (count / total) * 100),
  };
}
