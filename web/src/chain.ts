import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  fallback,
  http,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  isAddress,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
  type EIP1193Provider,
} from "viem";
import type { Runtime } from "./config";
export type Provider = EIP1193Provider & {
  on?: (event: string, fn: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, fn: (...args: unknown[]) => void) => void;
  providers?: Provider[];
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export const same = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export function makeReader(runtime: Runtime, provider?: Provider) {
  const n = runtime.deployment.network;
  const chain = defineChain({
    id: runtime.deployment.chainId,
    name: n.name,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: { default: { name: n.name, url: n.explorer } },
  });
  return createPublicClient({
    chain,
    transport: fallback(
      [
        ...n.rpcUrls.map((url) =>
          http(url, {
            timeout: 8000,
            retryCount: 0,
            batch: { wait: 25, batchSize: 60 },
          }),
        ),
        ...(provider ? [custom(provider, { retryCount: 0 })] : []),
      ],
      { retryCount: 0 },
    ),
    pollingInterval: 5000,
  });
}
export type Reader = ReturnType<typeof makeReader>;
export interface Round {
  startedAt: bigint;
  expiresAt: bigint;
  nextPrice: bigint;
  placedBricks: bigint;
  activeBricks: bigint;
  activeStone: bigint;
  dividendPerBrick: bigint;
  dividendsRemaining: bigint;
  tomb: bigint;
  pharaoh: Address;
  finalized: boolean;
  diamondPool: bigint;
  diamondRemaining: bigint;
  diamondClaimsRemaining: bigint;
}
export interface Brick {
  player: Address;
  roundId: bigint;
  indexInRound: bigint;
  stone: bigint;
  startDividend: bigint;
  dividendsPaid: bigint;
  frozenDividend: bigint;
  withdrawn: boolean;
  exitedBeforeExpiry: boolean;
  diamondClaimed: boolean;
}
export interface Bindings {
  vault: Address;
  rewards: Address;
  owner: Address;
}
export interface Snapshot extends Bindings {
  block: bigint;
  timestamp: bigint;
  loadedAt: number;
  roundId: bigint;
  round: Round;
  quote: readonly [bigint, bigint, bigint, bigint];
  paused: boolean;
  brickCount: bigint;
  nextTomb: bigint;
  rewardBalance: bigint;
  committed: bigint;
  uncommitted: bigint;
  funded: boolean;
  canReserve: boolean;
  initialFunding: bigint;
  roundReward: bigint;
  vaultBalance: bigint;
  totalStone: bigint;
  symbol: string;
  decimals: number;
  creator?: Address;
  creatorBalance?: bigint;
  creatorIssue?: string;
  stone?: bigint;
  credit?: bigint;
  balance?: bigint;
  tokenBalance?: bigint;
  lastBuild?: bigint;
  fundAllowance?: bigint;
  rewardClaim?: bigint;
}
export const read = <T>(
  r: Reader,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
  blockNumber?: bigint,
) =>
  r.readContract({
    address,
    abi,
    functionName,
    args,
    blockNumber,
  }) as Promise<T>;
export async function verifyBindings(r: Reader, c: Runtime): Promise<Bindings> {
  if ((await r.getChainId()) !== c.deployment.chainId)
    throw Error("RPC returned the wrong chain. Transactions are disabled.");
  const codes = await Promise.all(
    c.deployment.contracts.map((x) => r.getCode({ address: x.address })),
  );
  if (codes.some((code) => !code || code === "0x"))
    throw Error(
      "Deployed contract code could not be verified. Transactions are disabled.",
    );
  const [vault, rewards, owner] = await Promise.all(
    ["vault", "rewards", "owner"].map((f) =>
      read<Address>(r, c.game, c.abis.Ponziramid, f),
    ),
  );
  const [vg, rg, token, ...childCodes] = await Promise.all([
    read<Address>(r, vault, c.abis.StoneVault, "game"),
    read<Address>(r, rewards, c.abis.PonziRewards, "game"),
    read<Address>(r, rewards, c.abis.PonziRewards, "token"),
    r.getCode({ address: vault }),
    r.getCode({ address: rewards }),
  ]);
  if (
    !same(vg, c.game) ||
    !same(rg, c.game) ||
    !same(token, c.token) ||
    childCodes.some((code) => !code || code === "0x")
  )
    throw Error(
      "Custody bindings could not be verified. Transactions are disabled.",
    );
  return { vault, rewards, owner };
}
export async function discoverCreator(
  r: Reader,
  c: Runtime,
  initialFunding: bigint,
): Promise<Address> {
  const receipt = await r.getTransactionReceipt({ hash: c.deploymentTx });
  if (receipt.status !== "success" || receipt.blockNumber !== c.deploymentBlock)
    throw Error("Deployment receipt did not match the handoff.");
  const recipients = new Set<Address>();
  for (const log of receipt.logs) {
    if (!same(log.address, c.token)) continue;
    try {
      const e = decodeEventLog({
        abi: c.abis.LaunchToken,
        data: log.data,
        topics: log.topics,
      });
      const a = e.args as unknown as {
        from: Address;
        to: Address;
        value: bigint;
      };
      if (
        e.eventName === "Transfer" &&
        a.value >= initialFunding &&
        same(a.from, receipt.to || undefined) &&
        a.from !== zeroAddress &&
        a.to !== zeroAddress
      )
        recipients.add(getAddress(a.to));
    } catch {
      /* Unrelated event. */
    }
  }
  if (recipients.size !== 1)
    throw Error(
      "The allocation recipient could not be uniquely verified from the deployment receipt.",
    );
  return [...recipients][0];
}
export async function loadSnapshot(
  r: Reader,
  c: Runtime,
  b: Bindings,
  account?: Address,
  creator?: Address,
): Promise<Snapshot> {
  const block = await r.getBlock();
  if (block.number === null) throw Error("Confirmed block unavailable.");
  const bn = block.number;
  const g = <T>(f: string, a: readonly unknown[] = []) =>
    read<T>(r, c.game, c.abis.Ponziramid, f, a, bn);
  const rw = <T>(f: string, a: readonly unknown[] = []) =>
    read<T>(r, b.rewards, c.abis.PonziRewards, f, a, bn);
  const token = <T>(f: string, a: readonly unknown[] = []) =>
    read<T>(r, c.token, c.abis.LaunchToken, f, a, bn);
  const v = <T>(f: string, a: readonly unknown[] = []) =>
    read<T>(r, b.vault, c.abis.StoneVault, f, a, bn);
  const [
    roundId,
    quote,
    paused,
    brickCount,
    nextTomb,
    rewardBalance,
    committed,
    uncommitted,
    funded,
    canReserve,
    initialFunding,
    roundReward,
    vaultBalance,
    totalStone,
    symbol,
    decimals,
  ] = await Promise.all([
    g<bigint>("currentRound"),
    g<Snapshot["quote"]>("quote"),
    g<boolean>("paused"),
    g<bigint>("brickCount"),
    g<bigint>("nextTomb"),
    token<bigint>("balanceOf", [b.rewards]),
    rw<bigint>("committed"),
    rw<bigint>("uncommitted"),
    rw<boolean>("isFunded"),
    rw<boolean>("canReserveRound"),
    rw<bigint>("INITIAL_FUNDING"),
    rw<bigint>("ROUND_REWARD"),
    r.getBalance({ address: b.vault, blockNumber: bn }),
    v<bigint>("totalStone"),
    token<string>("symbol"),
    token<number>("decimals"),
  ]);
  const round = await g<Round>("rounds", [roundId]);
  const s: Snapshot = {
    ...b,
    block: bn,
    timestamp: block.timestamp,
    loadedAt: Date.now(),
    roundId,
    round,
    quote,
    paused,
    brickCount,
    nextTomb,
    rewardBalance,
    committed,
    uncommitted,
    funded,
    canReserve,
    initialFunding,
    roundReward,
    vaultBalance,
    totalStone,
    symbol,
    decimals,
    creator,
  };
  if (creator) s.creatorBalance = await token<bigint>("balanceOf", [creator]);
  if (account) {
    [
      s.stone,
      s.credit,
      s.balance,
      s.tokenBalance,
      s.lastBuild,
      s.fundAllowance,
      s.rewardClaim,
    ] = await Promise.all([
      v<bigint>("stoneOf", [account]),
      g<bigint>("ethCredit", [account]),
      r.getBalance({ address: account, blockNumber: bn }),
      token<bigint>("balanceOf", [account]),
      g<bigint>("lastBuildAt", [account]),
      token<bigint>("allowance", [account, b.rewards]),
      rw<bigint>("claimable", [roundId, account]),
    ]);
  }
  return s;
}
export function buildReason(
  s: Snapshot | undefined,
  account: Address | undefined,
  now: bigint,
): string | undefined {
  if (!s) return "Waiting for verified contract state.";
  if (s.paused)
    return "Building is paused by the owner. Refunds and claims remain open.";
  const freshRound = s.roundId === 0n || s.round.finalized;
  if (!freshRound && now >= s.round.expiresAt)
    return "The clock has expired. Finalize this round before building.";
  if (freshRound && !s.funded)
    return "NOT FUNDED: the initial reward deposit is still required.";
  if (freshRound && !s.canReserve)
    return "A new round needs more uncommitted reward tokens.";
  if (!freshRound && same(s.round.pharaoh, account))
    return "You are Pharaoh. Another wallet must build before you can build again.";
  if (account && s.lastBuild && now < s.lastBuild + 60n)
    return `Your next build is available in ${s.lastBuild + 60n - now}s.`;
  if (account && s.balance !== undefined && s.balance <= s.quote[1])
    return "You need enough ETH for this brick and gas.";
}
const errorMessages: Record<string, string> = {
  Paused: "Building is paused. Stone withdrawals and claims remain available.",
  StaleRound: "The round changed. Refresh and review the new price.",
  IncorrectPrice:
    "Another brick changed the price. Refresh and review the new quote.",
  RoundExpired: "This round expired. Finalize it before building.",
  Cooldown: "Wait 60 seconds between your builds.",
  ConsecutivePharaoh: "Another player must build before you can build again.",
  InitialFundingRequired: "The initial reward funding is incomplete.",
  InsufficientUncommittedTokens:
    "The reward pool needs more uncommitted tokens.",
  NothingToClaim: "No ETH is available for this claim.",
  AlreadyClaimed: "This reward has already been claimed.",
  NotParticipant: "This wallet did not participate in that round.",
  RoundNotFinalized: "Finalize the expired round before claiming tokens.",
  TransferFailed:
    "The recipient rejected the transfer. Your credit is preserved; try another recipient.",
  AlreadyWithdrawn: "Stone for this brick was already withdrawn.",
  NotDepositor: "Connect the wallet that owns this brick.",
  NotBrickOwner: "Connect the wallet that owns this brick.",
  OnlyOwner: "Only the game owner can change the pause setting.",
  NotExpired: "This round has not expired yet.",
  InsufficientAllowance: "Approve the required amount first.",
};
export function errorText(error: unknown): string {
  let e = error as {
    code?: number;
    message?: string;
    shortMessage?: string;
    data?: { errorName?: string };
    cause?: unknown;
  };
  for (let i = 0; e && i < 8; i++, e = e.cause as typeof e) {
    if (e.code === 4001 || /user rejected|user denied/i.test(e.message || ""))
      return "Request declined in your wallet. Nothing was submitted.";
    if (e.data?.errorName && errorMessages[e.data.errorName])
      return errorMessages[e.data.errorName];
    for (const [name, text] of Object.entries(errorMessages))
      if ((e.message || "").includes(name)) return text;
  }
  const msg =
    (error as { shortMessage?: string; message?: string })?.shortMessage ||
    (error as Error)?.message ||
    "Unable to complete the request. Check your connection and retry.";
  return msg.length > 240
    ? "Unable to complete the request. Check your connection, balance and wallet, then retry."
    : msg;
}
export async function switchNetwork(provider: Provider, c: Runtime) {
  const chainId = `0x${c.deployment.chainId.toString(16)}` as Hex;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    const e = error as {
      code?: number;
      message?: string;
      data?: { originalError?: { code?: number } };
    };
    if (
      (e.code === 4902 ||
        e.data?.originalError?.code === 4902 ||
        /unknown chain|unrecognized chain|not added/i.test(e.message || "")) &&
      c.deployment.walletAddChain
    ) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [c.deployment.walletAddChain],
      });
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId }],
      });
    } else throw error;
  }
}
export interface Transaction {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}
export async function transact(
  r: Reader,
  c: Runtime,
  p: Provider,
  account: Address,
  tx: Transaction,
  onStatus: (stage: string, hash?: Hex, replaces?: Hex) => void,
  validate?: () => void,
) {
  validate?.();
  if (
    Number(await p.request({ method: "eth_chainId" })) !== c.deployment.chainId
  )
    throw Error(`Switch your wallet to ${c.deployment.network.name}.`);
  const accounts = await p.request({ method: "eth_accounts" });
  if (!same(accounts[0], account))
    throw Error("Wallet changed. Review the action again.");
  onStatus("Simulating");
  await r.simulateContract({ ...tx, args: tx.args || [], account });
  validate?.();
  const wallet = createWalletClient({ chain: r.chain, transport: custom(p) });
  const data = encodeFunctionData({
    abi: tx.abi,
    functionName: tx.functionName,
    args: tx.args || [],
  });
  onStatus("Confirm in wallet");
  const hash = await wallet.sendTransaction({
    account,
    chain: r.chain,
    to: tx.address,
    data,
    value: tx.value || 0n,
  });
  onStatus("Waiting for confirmation", hash);
  let outcome: "Confirmed" | "Cancelled" | "Replaced" = "Confirmed";
  const receipt = await r.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 180_000,
    onReplaced: ({ reason, transaction, replacedTransaction }) => {
      // A mined cancellation/different call does not establish action success.
      // Compare with the requested payload as well as viem's replacement reason.
      const matches =
        same(transaction.to ?? undefined, tx.address) &&
        transaction.input.toLowerCase() === data.toLowerCase() &&
        transaction.value === (tx.value || 0n);
      outcome =
        matches && reason !== "cancelled"
          ? "Confirmed"
          : reason === "cancelled"
            ? "Cancelled"
            : "Replaced";
      onStatus("Replacement mined", transaction.hash, replacedTransaction.hash);
    },
  });
  if (outcome !== "Confirmed") {
    onStatus(outcome, receipt.transactionHash);
    return { receipt, outcome };
  }
  if (receipt.status !== "success")
    throw Error(
      "Transaction reverted. No action was completed. Refresh before retrying.",
    );
  onStatus("Confirmed", receipt.transactionHash);
  return { receipt, outcome };
}
export function recipientAddress(
  value: string,
  account?: Address,
): Address | undefined {
  const v = value.trim();
  if (!v) return account;
  return isAddress(v) && v.toLowerCase() !== zeroAddress
    ? getAddress(v)
    : undefined;
}
