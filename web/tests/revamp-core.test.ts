import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEther } from "viem";
import { shortAmount, tokenAmount, countdown } from "../src/format";
import { discoverBricks } from "../src/portfolio";
import type { Reader } from "../src/chain";
import type { Runtime } from "../src/config";
import abi from "../../docs/abi/Ponziramid.json";
test("ETH rounds to four decimals without changing integers or disguising small claims", () => {
  assert.equal(shortAmount(parseEther(".001061677811864495")), "0.0011");
  assert.equal(shortAmount(1n), "<0.0001");
  assert.equal(shortAmount(0n), "0");
  assert.equal(
    shortAmount(parseEther("999999999999999999.99995")),
    "1000000000000000000",
  );
  assert.equal(shortAmount(undefined), "…");
});
test("PONZIRAM uses compact two-decimal units", () => {
  assert.equal(tokenAmount(parseEther("652260721.579990978")), "652.26M");
  assert.equal(tokenAmount(parseEther("1000000")), "1M");
  assert.equal(tokenAmount(parseEther("300000")), "300K");
  assert.equal(tokenAmount(1n), "<0.01");
  assert.equal(tokenAmount(0n), "0");
});
test("Timer is padded and never negative", () => {
  assert.equal(countdown(86385n, 0n), "23:59:45");
  assert.equal(countdown(0n, 1n), "00:00:00");
  assert.equal(countdown(604800n, 0n), "168:00:00");
});
test("Discovery covers every block automatically, shrinking refusals without gaps", async () => {
  const calls: { fromBlock: bigint; toBlock: bigint }[] = [];
  const output: bigint[] = [];
  const reader = {
    getLogs: async (q: { fromBlock: bigint; toBlock: bigint }) => {
      if (q.toBlock - q.fromBlock > 1000n)
        throw Error("Provider range refusal");
      calls.push(q);
      return [
        {
          removed: false,
          args: { brickId: q.fromBlock },
          blockNumber: q.fromBlock,
        },
      ];
    },
  } as unknown as Reader;
  const runtime = {
    game: "0x1111111111111111111111111111111111111111",
    abis: { Ponziramid: abi },
  } as unknown as Runtime;
  let through = 0n;
  await discoverBricks(
    reader,
    runtime,
    "0x2222222222222222222222222222222222222222",
    100n,
    12500n,
    (next, items) => {
      through = next;
      output.push(...items.map((i) => i.id));
    },
    () => false,
  );
  assert.equal(calls[0].fromBlock, 100n);
  assert.equal(calls.at(-1)!.toBlock, 12500n);
  for (let i = 1; i < calls.length; i++)
    assert.equal(calls[i].fromBlock, calls[i - 1].toBlock + 1n);
  assert.equal(through, 12501n);
  assert.equal(output.length, calls.length);
});
test("Discovery cancellation stops further reads and publishes no late results", async () => {
  let cancelled = false,
    calls = 0,
    published = 0;
  const reader = {
    getLogs: async () => {
      calls++;
      cancelled = true;
      return [];
    },
  } as unknown as Reader;
  const runtime = {
    game: "0x1111111111111111111111111111111111111111",
    abis: { Ponziramid: abi },
  } as unknown as Runtime;
  await discoverBricks(
    reader,
    runtime,
    "0x2222222222222222222222222222222222222222",
    1n,
    50000n,
    () => published++,
    () => cancelled,
  );
  assert.equal(calls, 1);
  assert.equal(published, 0);
});
