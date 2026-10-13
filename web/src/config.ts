import {
  keccak256,
  toBytes,
  type Abi,
  type Address,
  type Hex,
  isAddress,
} from "viem";
export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}
export interface Deployment {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  poolKey?: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
    pairToken?: { address: Address; symbol: string; decimals: number };
    otherPairTokens?: { address: Address; symbol: string; decimals: number }[];
  };
  walletAddChain?: {
    chainId: Hex;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
}
export interface Runtime {
  deployment: Deployment;
  abis: Record<string, Abi>;
  token: Address;
  game: Address;
  deploymentBlock: bigint;
  deploymentTx: Hex;
}
export const canonical = (x: unknown): unknown =>
  Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, canonical((x as Record<string, unknown>)[k])]),
        )
      : x;
export const canonicalAbiHash = (abi: Abi) =>
  keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
const safePath = (p: string) =>
  p.length > 0 &&
  !p.startsWith("/") &&
  !p.includes(":") &&
  !p.split("/").some((x) => x === ".." || x === "." || !x);
async function asset<T>(manifest: Deployment, path: string): Promise<T> {
  if (!safePath(path)) throw Error("Unsafe deployment asset path.");
  const item = manifest.assets.find((a) => a.path === path);
  if (!item) throw Error(`Missing declared asset: ${path}`);
  const res = await fetch(new URL(path, new URL("./", location.href)), {
    cache: "no-cache",
  });
  if (!res.ok) throw Error(`Unable to load ${path}.`);
  const bytes = await res.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== item.sha256)
    throw Error(
      `Asset verification failed: ${path}. Reload the published site.`,
    );
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
export async function loadRuntime(): Promise<Runtime> {
  const r = await fetch(new URL("./imd-deployment.json", location.href), {
    cache: "no-cache",
  });
  if (!r.ok)
    throw Error(
      "The deployment manifest could not be loaded. Reload to retry.",
    );
  const d = (await r.json()) as Deployment;
  if (
    d.version !== 1 ||
    !d.network ||
    d.chainId !== d.network.chainId ||
    d.contracts.length !== 2 ||
    !d.assets.length
  )
    throw Error("Invalid deployment configuration.");
  const allowed = [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
    "contracts",
    "assets",
    "poolKey",
    "network",
    "walletAddChain",
  ];
  if (Object.keys(d).some((k) => !allowed.includes(k)))
    throw Error("Unexpected deployment configuration field.");
  const abis: Record<string, Abi> = {};
  for (const c of d.contracts) {
    if (!isAddress(c.address)) throw Error("Invalid contract address.");
    abis[c.name] = await asset<Abi>(d, c.abiPath);
    if (canonicalAbiHash(abis[c.name]) !== c.abiHash)
      throw Error(`${c.name} ABI verification failed.`);
  }
  for (const name of ["StoneVault", "PonziRewards"])
    abis[name] = await asset<Abi>(d, `abi/${name}.json`);
  const p = await asset<{
    sourceCommit: string;
    deployments: { name: string; txHash: Hex; blockNumber: number }[];
  }>(d, "launch-provenance.json");
  const game = d.contracts.find((c) => c.name === "Ponziramid"),
    token = d.contracts.find((c) => c.name === "LaunchToken"),
    receipt = p.deployments.find((c) => c.name === "LaunchToken");
  if (!game || !token || !receipt || p.sourceCommit !== d.sourceCommit)
    throw Error("Incomplete attested deployment.");
  return {
    deployment: d,
    abis,
    token: token.address,
    game: game.address,
    deploymentBlock: BigInt(receipt.blockNumber),
    deploymentTx: receipt.txHash,
  };
}
