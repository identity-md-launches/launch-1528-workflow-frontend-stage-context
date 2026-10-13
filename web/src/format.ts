import { formatUnits, parseUnits } from "viem";
export const amount = (n: bigint | undefined, decimals = 18) =>
  n === undefined ? "Unavailable" : formatUnits(n, decimals);
export const shortAmount = (n: bigint | undefined, decimals = 18) => {
  if (n === undefined) return "Unavailable";
  const s = formatUnits(n, decimals);
  const [a, b] = s.split(".");
  return `${BigInt(a).toLocaleString("en-US")}${b ? `.${b.slice(0, 6)}` : ""}${b && b.length > 6 ? "…" : ""}`;
};
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
  const hours = s / 3600n,
    minutes = (s % 3600n) / 60n,
    seconds = s % 60n;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
