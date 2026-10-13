import { formatUnits, parseUnits } from "viem";
export const amount = (n: bigint | undefined, decimals = 18) =>
  n === undefined ? "Unavailable" : formatUnits(n, decimals);
function rounded(n: bigint, decimals: number, places: number) {
  if (decimals <= places) return formatUnits(n, decimals);
  const step = 10n ** BigInt(decimals - places);
  const r = (n + step / 2n) / step;
  return formatUnits(r, places);
}
export const shortAmount = (n: bigint | undefined, decimals = 18) => {
  if (n === undefined) return "…";
  if (n > 0n && n * 10000n < 10n ** BigInt(decimals)) return "<0.0001";
  return rounded(n, decimals, 4);
};
export const tokenAmount = (n: bigint | undefined, decimals = 18) => {
  if (n === undefined) return "…";
  for (const [exponent, suffix] of [
    [12, "T"],
    [9, "B"],
    [6, "M"],
    [3, "K"],
  ] as const)
    if (n >= 10n ** BigInt(decimals + exponent))
      return rounded(n, decimals + exponent, 2) + suffix;
  if (n > 0n && n * 100n < 10n ** BigInt(decimals)) return "<0.01";
  return rounded(n, decimals, 2);
};
export const shortAddress = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
export function parseAmount(value: string, decimals = 18) {
  if (!/^\d+(\.\d+)?$/.test(value.trim()))
    throw Error("Enter a positive decimal amount.");
  if ((value.split(".")[1]?.length || 0) > decimals)
    throw Error(`Use at most ${decimals} decimal places.`);
  const n = parseUnits(value.trim(), decimals);
  if (n <= 0n) throw Error("Enter an amount greater than zero.");
  return n;
}
export function countdown(expires: bigint, now: bigint) {
  const s = expires > now ? expires - now : 0n;
  return [s / 3600n, (s % 3600n) / 60n, s % 60n]
    .map((n) => n.toString().padStart(2, "0"))
    .join(":");
}
