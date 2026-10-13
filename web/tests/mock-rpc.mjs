// Test-only EIP-1193/JSON-RPC fixture. No keys, real signing or network broadcasts.
import { readFile } from "node:fs/promises";
import {
  decodeFunctionData,
  decodeAbiParameters,
  encodeFunctionResult,
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
  parseEther,
  toHex,
  zeroAddress,
} from "viem";
const root = new URL("../../", import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));
const c = await json("dist/imd-deployment.json");
const abis = {};
for (const name of ["LaunchToken", "Ponziramid", "StoneVault", "PonziRewards"])
  abis[name] = await json(`dist/abi/${name}.json`);
const game = c.contracts.find((x) => x.name === "Ponziramid").address,
  token = c.contracts.find((x) => x.name === "LaunchToken").address;
export const fixture = {
  game,
  token,
  vault: "0x1111111111111111111111111111111111111111",
  rewards: "0x2222222222222222222222222222222222222222",
  account: "0x3333333333333333333333333333333333333333",
  other: "0x4444444444444444444444444444444444444444",
  creator: "0x5555555555555555555555555555555555555555",
};
const provenance = await json("dist/launch-provenance.json");
const launch = provenance.deployments[0];
const hash = (n) => `0x${BigInt(n).toString(16).padStart(64, "0")}`;
const now = BigInt(Math.floor(Date.now() / 1000));
export function createMock() {
  const state = {
    chain: "0x1",
    accounts: [],
    funded: true,
    paused: false,
    finalized: false,
    roundId: 1n,
    block: BigInt(launch.blockNumber) + 10n,
    time: now,
    expires: now + 86400n,
    pharaoh: fixture.other,
    bricks: 5n,
    tomb: parseEther(".0034"),
    stone: parseEther(".0009"),
    credit: parseEther(".00004"),
    tokenBalance: parseEther("700000000"),
    rewardBalance: parseEther("700000000"),
    fundAllowance: 0n,
    tokenAllowance: 0n,
    permitAllowance: 0n,
    permitExpiration: 0,
    lastBuild: 0n,
    claimed: false,
    withdrawn: false,
    brickClaimed: false,
    zeroBrickClaim: false,
    reject: false,
    failSimulation: false,
    wrongCode: false,
    rpcFailure: false,
    unknownChain: false,
    requests: [],
    transactions: [],
    receiptDelay: 0,
  };
  const response = (abi, functionName, result) =>
    encodeFunctionResult({ abi, functionName, result });
  const round = () => ({
    startedAt: now - 100n,
    expiresAt: state.expires,
    nextPrice: parseEther(".001"),
    placedBricks: state.bricks,
    activeBricks: state.bricks - (state.withdrawn ? 1n : 0n),
    activeStone: parseEther(".0045"),
    dividendPerBrick: 1n,
    dividendsRemaining: 1n,
    tomb: state.tomb,
    pharaoh: state.pharaoh,
    finalized: state.finalized,
    diamondPool: state.finalized ? parseEther(".00136") : 0n,
    diamondRemaining: 0n,
    diamondClaimsRemaining: 0n,
  });
  const brick = (id) => ({
    player: id === 1n ? fixture.account : fixture.other,
    roundId: 1n,
    indexInRound: id - 1n,
    stone: parseEther(".0009"),
    startDividend: 0n,
    dividendsPaid: 0n,
    frozenDividend: 0n,
    withdrawn: id === 1n && state.withdrawn,
    exitedBeforeExpiry: state.withdrawn,
    diamondClaimed: state.brickClaimed,
  });
  const block = () => ({
    number: toHex(state.block),
    hash: hash(state.block),
    parentHash: hash(state.block - 1n),
    nonce: "0x0000000000000000",
    sha3Uncles: hash(0),
    logsBloom: `0x${"0".repeat(512)}`,
    transactionsRoot: hash(0),
    stateRoot: hash(0),
    receiptsRoot: hash(0),
    miner: zeroAddress,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x1",
    gasLimit: toHex(30000000),
    gasUsed: toHex(21000),
    timestamp: toHex(state.time),
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x1",
    mixHash: hash(0),
  });
  const transferLog = {
    address: token,
    topics: encodeEventTopics({
      abi: abis.LaunchToken,
      eventName: "Transfer",
      args: { from: fixture.other, to: fixture.creator },
    }),
    data: encodeAbiParameters(parseAbiParameters("uint256"), [
      parseEther("700000000") + 4270n,
    ]),
    blockNumber: toHex(BigInt(launch.blockNumber)),
    blockHash: hash(BigInt(launch.blockNumber)),
    transactionHash: launch.txHash,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
  const receipt = (txHash, launchReceipt = false) => ({
    transactionHash: txHash,
    transactionIndex: "0x0",
    blockHash: hash(launchReceipt ? BigInt(launch.blockNumber) : state.block),
    blockNumber: toHex(
      launchReceipt ? BigInt(launch.blockNumber) : state.block,
    ),
    from: fixture.account,
    to: launchReceipt
      ? fixture.other
      : state.transactions.find((t) => t.hash === txHash)?.to || game,
    cumulativeGasUsed: "0x5208",
    gasUsed: "0x5208",
    contractAddress: null,
    logs: launchReceipt ? [transferLog] : [],
    logsBloom: `0x${"0".repeat(512)}`,
    status: "0x1",
    effectiveGasPrice: "0x1",
    type: "0x2",
  });
  const findCall = (tx) => {
    const addr = tx.to?.toLowerCase();
    let abi =
      addr === game
        ? abis.Ponziramid
        : addr === token
          ? abis.LaunchToken
          : addr === fixture.vault
            ? abis.StoneVault
            : addr === fixture.rewards
              ? abis.PonziRewards
              : null;
    if (!abi) return null;
    try {
      return { abi, ...decodeFunctionData({ abi, data: tx.data }) };
    } catch {
      return null;
    }
  };
  async function rpc({ method, params = [] }) {
    state.requests.push({ method, params });
    if (
      state.rpcFailure &&
      !method.startsWith("wallet_") &&
      method !== "eth_requestAccounts" &&
      method !== "eth_accounts"
    )
      throw { code: -32005, message: "Mock RPC unavailable" };
    if (method === "eth_chainId") return state.chain;
    if (method === "eth_requestAccounts") {
      if (state.reject) {
        state.reject = false;
        throw { code: 4001, message: "User rejected" };
      }
      state.accounts = [fixture.account];
      return state.accounts;
    }
    if (method === "eth_accounts") return state.accounts;
    if (method === "wallet_switchEthereumChain") {
      if (state.reject) {
        state.reject = false;
        throw { code: 4001, message: "User rejected" };
      }
      if (state.unknownChain) throw { code: 4902, message: "Unknown chain" };
      state.chain = params[0].chainId;
      return null;
    }
    if (method === "wallet_addEthereumChain") {
      state.unknownChain = false;
      return null;
    }
    if (method === "eth_getCode")
      return state.wrongCode ? "0x" : "0x6001600055";
    if (method === "eth_blockNumber") return toHex(state.block);
    if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash")
      return block();
    if (method === "eth_getBalance")
      return params[0].toLowerCase() === fixture.vault
        ? toHex(parseEther("1"))
        : toHex(parseEther("10"));
    if (method === "eth_getTransactionCount") return "0x1";
    if (method === "eth_estimateGas") return "0x186a0";
    if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas")
      return "0x1";
    if (method === "eth_getTransactionReceipt") {
      if (params[0] === launch.txHash) return receipt(launch.txHash, true);
      if (state.receiptDelay > 0) {
        state.receiptDelay--;
        return null;
      }
      return receipt(params[0]);
    }
    if (method === "eth_getTransactionByHash") {
      const t = state.transactions.find((t) => t.hash === params[0]);
      return t
        ? {
            ...t,
            blockHash: hash(state.block),
            blockNumber: toHex(state.block),
            transactionIndex: "0x0",
            from: fixture.account,
            gas: "0x186a0",
            gasPrice: "0x1",
            nonce: "0x1",
            input: t.data,
            value: t.value || "0x0",
            type: "0x2",
            chainId: "0x1",
            v: "0x1",
            r: hash(1),
            s: hash(1),
          }
        : null;
    }
    if (method === "eth_getLogs") {
      const f = params[0];
      if (
        f.address?.toLowerCase() === game &&
        BigInt(f.fromBlock) <= BigInt(launch.blockNumber) + 1n &&
        BigInt(f.toBlock) >= BigInt(launch.blockNumber) + 1n
      ) {
        return [
          {
            address: game,
            topics: encodeEventTopics({
              abi: abis.Ponziramid,
              eventName: "BrickPlaced",
              args: { brickId: 1n, roundId: 1n, player: fixture.account },
            }),
            data: encodeAbiParameters(
              parseAbiParameters("uint256,uint256,uint256,uint256,uint256"),
              [
                0n,
                parseEther(".001"),
                parseEther(".0009"),
                parseEther(".0001"),
                state.expires,
              ],
            ),
            blockNumber: toHex(BigInt(launch.blockNumber) + 1n),
            blockHash: hash(BigInt(launch.blockNumber) + 1n),
            transactionHash: hash(11),
            transactionIndex: "0x0",
            logIndex: "0x0",
            removed: false,
          },
        ];
      }
      return [];
    }
    if (method === "eth_call") {
      const tx = params[0];
      const call = findCall(tx);
      if (call) {
        const { abi, functionName: f, args: a = [] } = call;
        let result;
        const addr = tx.to.toLowerCase();
        if (
          f === "build" ||
          f === "finalize" ||
          f === "withdrawStone" ||
          f === "claimBrickETH" ||
          f === "claimETH" ||
          f === "claim" ||
          f === "fund" ||
          f === "setPaused" ||
          f === "approve"
        ) {
          if (state.failSimulation)
            throw {
              code: 3,
              message: "execution reverted: Paused",
              data: "0x",
            };
          return f === "approve"
            ? response(abi, f, true)
            : f === "claim" ||
                f === "claimETH" ||
                f === "claimBrickETH" ||
                f === "build"
              ? response(abi, f, 1n)
              : "0x";
        }
        if (addr === game) {
          const values = {
            vault: fixture.vault,
            rewards: fixture.rewards,
            owner: fixture.creator,
            currentRound: state.roundId,
            quote: [
              state.roundId || 1n,
              parseEther(".001"),
              parseEther(".0009"),
              parseEther(".0001"),
            ],
            paused: state.paused,
            brickCount: state.bricks,
            nextTomb: 0n,
            rounds: round(),
            bricks: brick(f === "bricks" ? a[0] : 1n),
            ethCredit: state.credit,
            lastBuildAt: state.lastBuild,
            claimableBrickETH:
              state.brickClaimed || state.zeroBrickClaim
                ? [0n, 0n]
                : [parseEther(".00002"), 0n],
          };
          result = values[f];
        }
        if (addr === fixture.vault) {
          const values = {
            game,
            totalStone: parseEther(".0045"),
            stoneOf:
              f === "stoneOf" && a[0]?.toLowerCase() === fixture.account
                ? state.stone
                : 0n,
            deposits: [
              fixture.account,
              state.withdrawn ? 0n : parseEther(".0009"),
            ],
          };
          result = values[f];
        }
        if (addr === fixture.rewards) {
          const values = {
            game,
            token,
            committed: parseEther("1000000"),
            uncommitted: state.rewardBalance - parseEther("1000000"),
            isFunded: state.funded,
            canReserveRound: state.funded,
            INITIAL_FUNDING: parseEther("700000000"),
            ROUND_REWARD: parseEther("1000000"),
            claimable: state.claimed ? 0n : parseEther("140000"),
          };
          result = values[f];
        }
        if (addr === token) {
          const values = {
            symbol: "PONZIRAM",
            decimals: 18,
            totalSupply: parseEther("1000000000"),
            balanceOf:
              a[0]?.toLowerCase() === fixture.rewards
                ? state.rewardBalance
                : state.tokenBalance,
            allowance:
              a[1]?.toLowerCase() === fixture.rewards
                ? state.fundAllowance
                : state.tokenAllowance,
          };
          result = values[f];
        }
        if (result === undefined) throw Error(`Unhandled function ${f}`);
        return response(abi, f, result);
      }
      if (tx.to.toLowerCase() === c.network.uniswapV4.quoter)
        return encodeAbiParameters(parseAbiParameters("uint256,uint256"), [
          parseEther("250"),
          150000n,
        ]);
      if (tx.to.toLowerCase() === c.network.uniswapV4.permit2) {
        if (tx.data.startsWith("0x927da105"))
          return encodeAbiParameters(
            parseAbiParameters("uint160,uint48,uint48"),
            [state.permitAllowance, state.permitExpiration, 0],
          );
        return "0x";
      }
      if (tx.to.toLowerCase() === c.network.uniswapV4.universalRouter) {
        if (state.failSimulation)
          throw { code: 3, message: "Router simulation reverted" };
        return "0x";
      }
      throw Error(`Unhandled eth_call ${JSON.stringify(tx)}`);
    }
    if (method === "eth_sendTransaction") {
      if (state.reject) {
        state.reject = false;
        throw { code: 4001, message: "User rejected" };
      }
      const tx = params[0],
        call = findCall(tx);
      if (call) {
        const { functionName: f, args: a = [] } = call;
        if (f === "build") {
          state.bricks++;
          state.pharaoh = fixture.account;
          state.lastBuild = state.time;
          state.stone += parseEther(".0009");
        }
        if (f === "withdrawStone") {
          state.withdrawn = true;
          state.stone = 0n;
        }
        if (f === "claimBrickETH") state.brickClaimed = true;
        if (f === "claimETH") state.credit = 0n;
        if (f === "claim") state.claimed = true;
        if (f === "finalize") state.finalized = true;
        if (f === "setPaused") state.paused = a[0];
        if (f === "approve") {
          if (a[0].toLowerCase() === fixture.rewards)
            state.fundAllowance = a[1];
          else state.tokenAllowance = a[1];
        }
        if (f === "fund") {
          state.tokenBalance -= a[0];
          state.rewardBalance += a[0];
          state.funded = state.rewardBalance >= parseEther("700000000");
          state.fundAllowance = 0n;
        }
      }
      if (tx.to.toLowerCase() === c.network.uniswapV4.permit2) {
        const [t, spender, amount, expiration] = decodeAbiParameters(
          parseAbiParameters("address,address,uint160,uint48"),
          `0x${tx.data.slice(10)}`,
        );
        state.permitAllowance = amount;
        state.permitExpiration = expiration;
      }
      state.block++;
      state.time++;
      const h = hash(state.transactions.length + 1000);
      state.transactions.push({ ...tx, hash: h });
      return h;
    }
    throw Error(`Unhandled RPC method ${method}`);
  }
  return { state, rpc, config: c };
}
export async function installMock(context, mock, { wallet = true } = {}) {
  await context.route(
    /^https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,
    async (route) => {
      let input;
      try {
        input = route.request().postDataJSON();
      } catch {
        await route.abort();
        return;
      }
      const one = async (request) => {
        try {
          return {
            jsonrpc: "2.0",
            id: request.id,
            result:
              request.method === "eth_chainId"
                ? "0x1"
                : await mock.rpc(request),
          };
        } catch (e) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: e.code || -32000,
              message: e.message || String(e),
              ...(e.data ? { data: e.data } : {}),
            },
          };
        }
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(
          Array.isArray(input)
            ? await Promise.all(input.map(one))
            : await one(input),
        ),
      });
    },
  );
  if (wallet) {
    await context.exposeFunction("__mockRpc", async (request) => {
      try {
        return { result: await mock.rpc(request) };
      } catch (e) {
        return {
          error: { code: e.code || -32000, message: e.message || String(e) },
        };
      }
    });
    await context.addInitScript(() => {
      const listeners = {};
      window.ethereum = {
        request: async (args) => {
          const response = await window.__mockRpc(args);
          if (response.error) throw response.error;
          if (args.method === "wallet_switchEthereumChain")
            (listeners.chainChanged || []).forEach((fn) =>
              fn(args.params[0].chainId),
            );
          return response.result;
        },
        on: (event, fn) => {
          (listeners[event] ||= []).push(fn);
        },
        removeListener: (event, fn) => {
          listeners[event] = (listeners[event] || []).filter((x) => x !== fn);
        },
      };
      window.__emitWallet = (event, value) =>
        (listeners[event] || []).forEach((fn) => fn(value));
    });
  }
}
