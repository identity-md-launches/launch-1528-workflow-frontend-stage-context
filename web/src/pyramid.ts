// Keep both SVG work and per-brick status reads bounded. Large rounds use an
// overview plus a magnified, bottom-up page of recent individual bricks.
export const DETAIL_LIMIT = 650n; // 1² + … + 12²
export const RECENT_PAGE = 64n;
const capacity = (side: number) => (side * (side + 1) * (2 * side + 1)) / 6;
export function pyramidLayout(count = 0n) {
  const grouped = count > DETAIL_LIMIT;
  let groupSize = 1n;
  while ((count + groupSize - 1n) / groupSize > DETAIL_LIMIT) groupSize *= 64n;
  const units = Number((count + groupSize - 1n) / groupSize);
  let side = 8;
  while (capacity(side) < units) side++;
  const detailStart = grouped ? ((count - 1n) / RECENT_PAGE) * RECENT_PAGE : 0n;
  const detailCount = Number(count - detailStart);
  return { grouped, groupSize, units, side, detailStart, detailCount };
}
export function sceneBrickIndices(count: bigint) {
  const { detailStart, detailCount } = pyramidLayout(count);
  return Array.from({ length: detailCount }, (_, i) => detailStart + BigInt(i));
}
