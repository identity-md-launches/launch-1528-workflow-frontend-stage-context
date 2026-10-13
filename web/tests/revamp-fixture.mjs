// Deterministic simulation only. Never bundled into dist and never signs a transaction.
import { createMock, fixture } from "./mock-rpc.mjs";
import { readFile } from "node:fs/promises";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  parseEther,
  toHex,
} from "viem";
const root = new URL("../../", import.meta.url);
const abis = {};
for (const n of ["Ponziramid", "StoneVault", "PonziRewards"])
  abis[n] = JSON.parse(
    await readFile(new URL(`dist/abi/${n}.json`, root), "utf8"),
  );
const provenance = JSON.parse(
  await readFile(new URL("dist/launch-provenance.json", root), "utf8"),
);
const start = BigInt(provenance.deployments[0].blockNumber);
const txhash = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0");
export function createPortfolioMock() {
  const base = createMock(),
    state = base.state;
  state.block = start + 12500n;
  state.roundId = 3n;
  state.bricks = 12n;
  state.stone = parseEther(".0027");
  state.finalized = false;
  const owned = [
    { id: 1n, round: 1n, block: start + 1n },
    { id: 5n, round: 2n, block: start + 6001n },
    { id: 9n, round: 3n, block: start + 12001n },
  ];
  const withdrawn = new Set(),
    claimedBricks = new Set(),
    claimedRounds = new Set();
  const original = base.rpc;
  const rpc = async (request) => {
    const { method, params = [] } = request;
    if (
      method === "eth_getLogs" &&
      params[0].address?.toLowerCase() === fixture.game
    ) {
      state.requests.push(request);
      if (state.rpcFailure) throw Error("Fixture RPC unavailable");
      const f = params[0];
      if (
        f.topics?.[3] &&
        !String(f.topics[3]).toLowerCase().endsWith(fixture.account.slice(2))
      )
        return [];
      if (
        state.rejectWideRange &&
        BigInt(f.toBlock) - BigInt(f.fromBlock) > 500n
      )
        throw Error("Range too wide");
      return owned
        .filter(
          (b) => b.block >= BigInt(f.fromBlock) && b.block <= BigInt(f.toBlock),
        )
        .map((b) => ({
          address: fixture.game,
          topics: encodeEventTopics({
            abi: abis.Ponziramid,
            eventName: "BrickPlaced",
            args: { brickId: b.id, roundId: b.round, player: fixture.account },
          }),
          data: encodeAbiParameters(
            parseAbiParameters("uint256,uint256,uint256,uint256,uint256"),
            [
              0n,
              parseEther(".001061677811864495"),
              parseEther(".000955510030678046"),
              parseEther(".000106167781186449"),
              state.expires,
            ],
          ),
          blockNumber: toHex(b.block),
          blockHash: txhash(b.block),
          transactionHash: txhash(b.id + 10n),
          transactionIndex: "0x0",
          logIndex: "0x0",
          removed: false,
        }));
    }
    if (method === "eth_call") {
      const tx = params[0],
        name =
          tx.to.toLowerCase() === fixture.game
            ? "Ponziramid"
            : tx.to.toLowerCase() === fixture.vault
              ? "StoneVault"
              : tx.to.toLowerCase() === fixture.rewards
                ? "PonziRewards"
                : null;
      if (name) {
        let f, a;
        try {
          const call = decodeFunctionData({ abi: abis[name], data: tx.data });
          f = call.functionName;
          a = call.args || [];
        } catch {}
        let result;
        if (f === "quote")
          result = [
            3n,
            parseEther(".001061677811864495"),
            parseEther(".000955510030678046"),
            parseEther(".000106167781186449"),
          ];
        if (f === "rounds")
          result = {
            startedAt: state.time - 100n,
            expiresAt: a[0] < 3n ? state.time - 10n : state.expires,
            nextPrice: parseEther(".001061677811864495"),
            placedBricks: 4n,
            activeBricks: 4n,
            activeStone: parseEther(".0036"),
            dividendPerBrick: 1n,
            dividendsRemaining: 1n,
            tomb: state.tomb,
            pharaoh: fixture.other,
            finalized: a[0] < 3n || state.finalized,
            diamondPool: 0n,
            diamondRemaining: 0n,
            diamondClaimsRemaining: 0n,
          };
        if (f === "bricks") {
          const id = a[0],
            b = owned.find((b) => b.id === id);
          result = {
            player: b ? fixture.account : fixture.other,
            roundId: b ? b.round : (id - 1n) / 4n + 1n,
            indexInRound: (id - 1n) % 4n,
            stone: parseEther(".0009"),
            startDividend: 0n,
            dividendsPaid: 0n,
            frozenDividend: 0n,
            withdrawn: withdrawn.has(id.toString()),
            exitedBeforeExpiry: withdrawn.has(id.toString()),
            diamondClaimed: claimedBricks.has(id.toString()),
          };
        }
        if (f === "deposits")
          result = [
            fixture.account,
            withdrawn.has(a[0].toString()) ? 0n : parseEther(".0009"),
          ];
        if (f === "claimableBrickETH")
          result = claimedBricks.has(a[0].toString())
            ? [0n, 0n]
            : [parseEther(".0002"), 0n];
        if (f === "claimable")
          result =
            a[0] < 3n && !claimedRounds.has(a[0].toString())
              ? parseEther("350000")
              : 0n;
        if (result !== undefined)
          return encodeFunctionResult({
            abi: abis[name],
            functionName: f,
            result,
          });
      }
    }
    if (method === "eth_sendTransaction") {
      const before = state.transactions.length,
        result = await original(request);
      if (state.transactions.length > before) {
        const tx = params[0],
          name =
            tx.to.toLowerCase() === fixture.game
              ? "Ponziramid"
              : tx.to.toLowerCase() === fixture.vault
                ? "StoneVault"
                : tx.to.toLowerCase() === fixture.rewards
                  ? "PonziRewards"
                  : null;
        if (name) {
          const { functionName: f, args: a = [] } = decodeFunctionData({
            abi: abis[name],
            data: tx.data,
          });
          if (f === "withdrawStone") {
            withdrawn.add(a[0].toString());
            state.stone = BigInt(3 - withdrawn.size) * parseEther(".0009");
          }
          if (f === "claimBrickETH") claimedBricks.add(a[0].toString());
          if (f === "claim") claimedRounds.add(a[0].toString());
        }
      }
      return result;
    }
    return original(request);
  };
  return { ...base, rpc, owned, withdrawn, claimedBricks, claimedRounds };
}
export { abis };
