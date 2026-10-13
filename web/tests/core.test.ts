import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
  parseEther,
  type Address,
} from "viem";
import {
  buildReason,
  recipientAddress,
  switchNetwork,
  errorText,
  type Snapshot,
  type Provider,
} from "../src/chain";
import { encodeSwap, minimumOutput, tradeCurrencies } from "../src/protocol";
import { parseAmount, countdown } from "../src/format";
import type { Runtime, PoolKey } from "../src/config";
import deployment from "../deployment-handoff.json";
import network from "../network-handoff.json";
const key = deployment.poolKey as PoolKey;
const fixtureAddress = "0x1111111111111111111111111111111111111111" as Address;
const runtime = {
  token: deployment.contracts[0].address,
  deployment: { ...deployment, ...network },
} as unknown as Runtime;
const state = () =>
  ({
    roundId: 1n,
    round: {
      finalized: false,
      expiresAt: 1000n,
      pharaoh: "0x2222222222222222222222222222222222222222",
    },
    funded: true,
    canReserve: true,
    paused: false,
    quote: [1n, 100n, 90n, 10n],
    balance: 1000n,
    lastBuild: 0n,
  }) as unknown as Snapshot;
test("amounts preserve every wei and reject overprecision/negative/exponent", () => {
  assert.equal(parseAmount("0.001000000000000001"), 1000000000000001n);
  for (const value of ["-1", "1e3", "0", "0.0000000000000000001"])
    assert.throws(() => parseAmount(value));
  assert.equal(parseAmount("1.234567", 6), 1234567n);
});
test("slippage uses integer rounding and enforces bounds", () => {
  assert.equal(minimumOutput(10001n, 50), 9950n);
  assert.throws(() => minimumOutput(1n, 0));
  assert.throws(() => minimumOutput(1n, 501));
});
test("standard Uniswap input contains exact attested pool, actions and amounts", () => {
  const out = encodeSwap(
    key,
    true,
    key.currency0,
    key.currency1,
    parseEther(".1"),
    99n,
  );
  const [actions, params] = decodeAbiParameters(
    parseAbiParameters("bytes actions,bytes[] params"),
    out,
  );
  assert.equal(actions, "0x060c0f");
  assert.equal(params.length, 3);
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
    ),
    params[0],
  );
  assert.equal(swap.poolKey.hooks.toLowerCase(), key.hooks);
  assert.equal(swap.poolKey.fee, key.fee);
  assert.equal(swap.poolKey.tickSpacing, key.tickSpacing);
  assert.equal(swap.amountIn, parseEther(".1"));
  assert.equal(swap.amountOutMinimum, 99n);
  assert.equal(swap.zeroForOne, true);
  assert.deepEqual(
    decodeAbiParameters(parseAbiParameters("address,uint256"), params[1]),
    [zeroAddress, parseEther(".1")],
  );
});
test("extended router tuple adds the zero hop price before hookData", () => {
  const out = encodeSwap(
    key,
    false,
    key.currency1,
    key.currency0,
    100n,
    2n,
    true,
  );
  const [, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    out,
  );
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      "((address,address,uint24,int24,address),bool,uint128,uint128,uint256,bytes)",
    ),
    params[0],
  );
  assert.equal(swap[4], 0n);
  assert.equal(swap[5], "0x");
});
test("buy/sell direction follows currencies in supplied key", () => {
  assert.equal(tradeCurrencies(runtime, true).input, zeroAddress);
  assert.equal(tradeCurrencies(runtime, false).input, runtime.token);
  const reverse = {
    ...runtime,
    deployment: {
      ...runtime.deployment,
      poolKey: { ...key, currency0: runtime.token, currency1: fixtureAddress },
    },
  };
  assert.equal(tradeCurrencies(reverse, true).zeroForOne, false);
  assert.equal(tradeCurrencies(reverse, false).zeroForOne, true);
});
test("idle is not expired, unfunded and depleted new rounds cannot build", () => {
  const s = state();
  s.roundId = 0n;
  assert.equal(buildReason(s, fixtureAddress, 2000n), undefined);
  s.funded = false;
  assert.match(buildReason(s, fixtureAddress, 2000n)!, /NOT FUNDED/);
  s.funded = true;
  s.canReserve = false;
  assert.match(buildReason(s, fixtureAddress, 2000n)!, /uncommitted/);
});
test("an already reserved round does not require another reward reservation", () => {
  const s = state();
  s.canReserve = false;
  assert.equal(buildReason(s, fixtureAddress, 500n), undefined);
});
test("pause, expiry, cooldown, consecutive Pharaoh and balance are gated", () => {
  let s = state();
  s.paused = true;
  assert.match(buildReason(s, fixtureAddress, 500n)!, /paused/);
  s = state();
  assert.match(buildReason(s, fixtureAddress, 1000n)!, /Finalize/);
  s = state();
  s.lastBuild = 450n;
  assert.match(buildReason(s, fixtureAddress, 500n)!, /10s/);
  s = state();
  s.round.pharaoh = fixtureAddress;
  assert.match(buildReason(s, fixtureAddress, 500n)!, /Another wallet/);
  s = state();
  s.balance = 100n;
  assert.match(buildReason(s, fixtureAddress, 500n)!, /gas/);
});
test("recipient cannot be zero or invalid; default uses connected account", () => {
  assert.equal(recipientAddress("", fixtureAddress), fixtureAddress);
  assert.equal(recipientAddress(zeroAddress, fixtureAddress), undefined);
  assert.equal(recipientAddress("bad", fixtureAddress), undefined);
});
test("unknown chain triggers exact addChain and retries switch", async () => {
  const requests: unknown[] = [];
  const p = {
    request: async (x: { method: string }) => {
      requests.push(x);
      if (requests.length === 1) throw { code: 4902 };
    },
  } as unknown as Provider;
  await switchNetwork(p, runtime);
  assert.deepEqual(requests, [
    { method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] },
    { method: "wallet_addEthereumChain", params: [network.walletAddChain] },
    { method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] },
  ]);
});
test("switch rejection does not add a chain", async () => {
  let calls = 0;
  await assert.rejects(() =>
    switchNetwork(
      {
        request: async () => {
          calls++;
          throw { code: 4001 };
        },
      } as unknown as Provider,
      runtime,
    ),
  );
  assert.equal(calls, 1);
});
test("custom errors are actionable and countdown never goes negative", () => {
  assert.match(
    errorText({ cause: { data: { errorName: "TransferFailed" } } }),
    /credit is preserved/,
  );
  assert.match(errorText({ code: 4001 }), /Nothing was submitted/);
  assert.equal(countdown(10n, 20n), "00:00:00");
  assert.equal(countdown(3661n, 0n), "01:01:01");
});

test("pyramid capacity grows past 204 and bounds individual geometry/status reads", async () => {
  const { pyramidLayout, sceneBrickIndices } = await import("../src/pyramid");
  for (const count of [
    0n,
    1n,
    204n,
    205n,
    285n,
    286n,
    650n,
    651n,
    704n,
    705n,
    41600n,
    41601n,
    2n ** 256n - 1n,
  ]) {
    const layout = pyramidLayout(count);
    const indices = sceneBrickIndices(count);
    const capacity =
      (layout.side * (layout.side + 1) * (2 * layout.side + 1)) / 6;
    assert(layout.units <= capacity);
    assert(capacity <= 650);
    assert(indices.length <= (layout.grouped ? 64 : 650));
    assert.equal(new Set(indices).size, indices.length);
    if (count) assert.equal(indices.at(-1), count - 1n);
    if (!layout.grouped) assert.equal(indices.length, Number(count));
    if (layout.grouped) assert.equal(indices[0] % 64n, 0n);
  }
  assert.equal(pyramidLayout(204n).side, 8);
  assert.equal(pyramidLayout(205n).side, 9);
  assert.equal(pyramidLayout(205n).units, 205);
  assert.equal(sceneBrickIndices(651n)[0], 640n);
});
