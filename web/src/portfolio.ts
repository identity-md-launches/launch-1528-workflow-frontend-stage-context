import { useCallback, useEffect, useRef, useState } from "react";
import { getAbiItem, type AbiEvent, type Address } from "viem";
import { errorText, read, same, type Reader, type Snapshot } from "./chain";
import type { Runtime } from "./config";
import { loadBrick, type OwnedBrick } from "./indexing";
export interface RoundClaim {
  id: bigint;
  amount: bigint;
}
interface Located {
  id: bigint;
  block: bigint;
}
// Serial, bounded log requests; a provider range refusal narrows the range.
export async function discoverBricks(
  r: Reader,
  c: Runtime,
  account: Address,
  from: bigint,
  to: bigint,
  onProgress: (next: bigint, items: Located[]) => void,
  cancelled: () => boolean,
) {
  let cursor = from,
    span = 5000n;
  while (cursor <= to && !cancelled()) {
    const end = cursor + span - 1n < to ? cursor + span - 1n : to;
    let logs;
    try {
      logs = await r.getLogs({
        address: c.game,
        event: getAbiItem({
          abi: c.abis.Ponziramid,
          name: "BrickPlaced",
        }) as AbiEvent,
        args: { player: account },
        fromBlock: cursor,
        toBlock: end,
      });
    } catch (e) {
      if (span > 100n) {
        span = span / 2n;
        continue;
      }
      throw e;
    }
    if (cancelled()) return;
    const items = logs
      .filter((l) => !l.removed)
      .map((l) => {
        const x = l as unknown as {
          args: { brickId: bigint };
          blockNumber: bigint;
        };
        return { id: x.args.brickId, block: x.blockNumber };
      });
    cursor = end + 1n;
    onProgress(cursor, items);
  }
}
export async function mapLimit<T, R>(
  items: T[],
  fn: (value: T) => Promise<R>,
  limit = 8,
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        output[i] = await fn(items[i]);
      }
    }),
  );
  return output;
}
export function usePortfolio(
  reader: Reader | undefined,
  runtime: Runtime | undefined,
  s: Snapshot | undefined,
  account: Address | undefined,
) {
  const [bricks, setBricks] = useState<OwnedBrick[]>([]),
    [rounds, setRounds] = useState<RoundClaim[]>([]),
    [scanning, setScanning] = useState(false),
    [error, setError] = useState(""),
    [through, setThrough] = useState<bigint>(),
    [complete, setComplete] = useState(false);
  const generation = useRef(0),
    lock = useRef(false),
    located = useRef<Located[]>([]),
    next = useRef<bigint | undefined>(undefined),
    latest = useRef(s);
  latest.current = s;
  useEffect(() => {
    generation.current++;
    lock.current = false;
    located.current = [];
    next.current = undefined;
    setBricks([]);
    setRounds([]);
    setError("");
    setThrough(undefined);
    setComplete(false);
    setScanning(false);
    return () => {
      generation.current++;
    };
  }, [reader, runtime, account]);
  const refresh = useCallback(async () => {
    const state = latest.current;
    if (!state || !reader || !runtime || !account || lock.current) return;
    const gen = generation.current;
    const cancelled = () => gen !== generation.current;
    lock.current = true;
    setScanning(true);
    setError("");
    try {
      const from =
        next.current && next.current > runtime.deploymentBlock + 12n
          ? next.current - 12n
          : runtime.deploymentBlock;
      let found = located.current.filter((i) => i.block < from);
      await discoverBricks(
        reader,
        runtime,
        account,
        from,
        state.block,
        (cursor, items) => {
          found.push(...items);
          if (!cancelled()) setThrough(cursor - 1n);
        },
        cancelled,
      );
      if (cancelled()) return;
      const unique = [...new Set(found.map((x) => x.id))].sort((a, b) =>
        a > b ? -1 : 1,
      );
      const all = (
        await mapLimit(unique, (id) =>
          loadBrick(reader, runtime, state.vault, id, state.block),
        )
      ).filter((b) => same(b.player, account));
      const roundIds = [
        ...new Set(all.filter((b) => b.finalized).map((b) => b.roundId)),
      ];
      const claims = await mapLimit(roundIds, async (id) => ({
        id,
        amount: await read<bigint>(
          reader,
          state.rewards,
          runtime.abis.PonziRewards,
          "claimable",
          [id, account],
          state.block,
        ),
      }));
      if (cancelled()) return;
      located.current = found;
      next.current = state.block + 1n;
      setBricks(all);
      setRounds(claims);
      setComplete(true);
    } catch (e) {
      if (!cancelled()) {
        setError(errorText(e));
        setComplete(false);
      }
    } finally {
      if (!cancelled()) {
        lock.current = false;
        setScanning(false);
        if (latest.current?.block !== state.block)
          queueMicrotask(() => void refresh());
      }
    }
  }, [reader, runtime, account]);
  useEffect(() => {
    void refresh();
  }, [refresh, s?.block]);
  return { bricks, rounds, scanning, error, through, complete, refresh };
}
export type Portfolio = ReturnType<typeof usePortfolio>;
