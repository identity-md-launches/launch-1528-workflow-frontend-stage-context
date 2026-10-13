// Keep every plotted brick individually inspectable, including on a narrow phone.
// Page arithmetic stays bigint so a large on-chain count cannot overflow Number.
export function pyramidPage(count: bigint, page = 0n) {
  const pages = count > 0n ? (count + 35n) / 36n : 1n;
  const current = page < 0n ? 0n : page >= pages ? pages - 1n : page;
  const offset = current * 36n;
  return {
    side: 8,
    pages,
    current,
    offset,
    visible: Number(count - offset > 36n ? 36n : count - offset),
  };
}
