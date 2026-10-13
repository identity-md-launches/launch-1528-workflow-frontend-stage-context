import {
  parseAbi,
  encodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
  type Address,
} from "viem";
import type { PoolKey, Runtime } from "./config";
import { read, same, type Reader, type Transaction } from "./chain";
export const protocol = {
  token: parseAbi([
    "function allowance(address owner,address spender) view returns (uint256)",
    "function approve(address spender,uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
  ]),
  permit2: parseAbi([
    "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
    "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  ]),
  router: parseAbi([
    "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
  ]),
  quoter: parseAbi([
    "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
    "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
    "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut,uint256 gasEstimate)",
  ]),
};
export function tradeCurrencies(c: Runtime, buy: boolean) {
  const key = c.deployment.poolKey;
  if (!key) throw Error("This deployment has no attested trading pool.");
  const pair = same(key.currency0, c.token)
    ? key.currency1
    : same(key.currency1, c.token)
      ? key.currency0
      : undefined;
  if (!pair)
    throw Error("The attested pool does not contain the launch token.");
  const input = buy ? pair : c.token,
    output = buy ? c.token : pair;
  return { key, input, output, zeroForOne: same(input, key.currency0), pair };
}
export function minimumOutput(amount: bigint, bps: number) {
  if (!Number.isInteger(bps) || bps < 1 || bps > 500)
    throw Error("Slippage must be between 0.01% and 5%.");
  return (amount * BigInt(10000 - bps)) / 10000n;
}
export function encodeSwap(
  key: PoolKey,
  zeroForOne: boolean,
  input: Address,
  output: Address,
  amountIn: bigint,
  minOut: bigint,
  extended = false,
) {
  if (
    amountIn <= 0n ||
    amountIn >= 1n << 128n ||
    minOut <= 0n ||
    minOut >= 1n << 128n
  )
    throw Error("Swap amount is outside the supported range.");
  const tuple = extended
    ? "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)"
    : "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)";
  const values = {
    poolKey: key,
    zeroForOne,
    amountIn,
    amountOutMinimum: minOut,
    ...(extended ? { minHopPriceX36: 0n } : {}),
    hookData: "0x" as const,
  };
  const swap = encodeAbiParameters(parseAbiParameters(tuple), [values]);
  const settle = encodeAbiParameters(
    parseAbiParameters("address currency,uint256 amount"),
    [input, amountIn],
  );
  const take = encodeAbiParameters(
    parseAbiParameters("address currency,uint256 amount"),
    [output, minOut],
  );
  return encodeAbiParameters(
    parseAbiParameters("bytes actions,bytes[] params"),
    ["0x060c0f", [swap, settle, take]],
  );
}
export interface Quote {
  amountIn: bigint;
  amountOut: bigint;
  minOut: bigint;
  created: number;
  buy: boolean;
  bps: number;
  input: Address;
  output: Address;
  inputSymbol: string;
  outputSymbol: string;
  inputDecimals: number;
  outputDecimals: number;
}
export async function quoteTrade(
  r: Reader,
  c: Runtime,
  buy: boolean,
  amountIn: bigint,
  bps: number,
  account?: Address,
): Promise<Quote> {
  const { key, input, output, zeroForOne } = tradeCurrencies(c, buy);
  const net = c.deployment.network;
  if (amountIn <= 0n || amountIn >= 1n << 128n)
    throw Error("Enter a positive amount within the pool limit.");
  for (const address of [
    net.uniswapV4.quoter,
    net.uniswapV4.universalRouter,
    net.uniswapV4.permit2,
  ]) {
    const code = await r.getCode({ address });
    if (!code || code === "0x")
      throw Error("Trading contracts could not be verified on this network.");
  }
  const metadata = async (address: Address) =>
    address === zeroAddress
      ? {
          symbol: net.nativeCurrency.symbol,
          decimals: net.nativeCurrency.decimals,
        }
      : {
          symbol: await read<string>(r, address, protocol.token, "symbol"),
          decimals: await read<number>(r, address, protocol.token, "decimals"),
        };
  const [i, o, result] = await Promise.all([
    metadata(input),
    metadata(output),
    r.simulateContract({
      address: net.uniswapV4.quoter,
      abi: protocol.quoter,
      functionName: "quoteExactInputSingle",
      args: [
        { poolKey: key, zeroForOne, exactAmount: amountIn, hookData: "0x" },
      ],
      ...(account ? { account } : {}),
    }),
  ]);
  const amountOut = result.result[0];
  if (amountOut <= 0n) throw Error("No output is available at this amount.");
  return {
    amountIn,
    amountOut,
    minOut: minimumOutput(amountOut, bps),
    created: Date.now(),
    buy,
    bps,
    input,
    output,
    inputSymbol: i.symbol,
    outputSymbol: o.symbol,
    inputDecimals: i.decimals,
    outputDecimals: o.decimals,
  };
}
export async function nextSwapStep(
  r: Reader,
  c: Runtime,
  q: Quote,
  account: Address,
): Promise<{ label: string; tx: Transaction; final: boolean }> {
  if (Date.now() - q.created > 60_000)
    throw Error("This quote expired. Get a fresh quote.");
  const net = c.deployment.network.uniswapV4;
  const block = await r.getBlock();
  const deadline = block.timestamp + 300n;
  const balance =
    q.input === zeroAddress
      ? await r.getBalance({ address: account })
      : await read<bigint>(r, q.input, protocol.token, "balanceOf", [account]);
  if (balance < q.amountIn)
    throw Error(`Insufficient ${q.inputSymbol} balance.`);
  if (q.input !== zeroAddress) {
    const allowance = await read<bigint>(
      r,
      q.input,
      protocol.token,
      "allowance",
      [account, net.permit2],
    );
    if (allowance < q.amountIn)
      return {
        label: `Approve ${q.inputSymbol} to Permit2`,
        final: false,
        tx: {
          address: q.input,
          abi: protocol.token,
          functionName: "approve",
          args: [net.permit2, q.amountIn],
        },
      };
    const [amount, expiration] = await read<readonly [bigint, number, number]>(
      r,
      net.permit2,
      protocol.permit2,
      "allowance",
      [account, q.input, net.universalRouter],
    );
    if (amount < q.amountIn || BigInt(expiration) < deadline)
      return {
        label: "Approve Permit2 to router",
        final: false,
        tx: {
          address: net.permit2,
          abi: protocol.permit2,
          functionName: "approve",
          args: [
            q.input,
            net.universalRouter,
            q.amountIn,
            Number(block.timestamp + 1800n),
          ],
        },
      };
  }
  const { key, zeroForOne } = tradeCurrencies(c, q.buy);
  const input = encodeSwap(
    key,
    zeroForOne,
    q.input,
    q.output,
    q.amountIn,
    q.minOut,
    net.extendedSwapParams,
  );
  return {
    label: "Swap tokens",
    final: true,
    tx: {
      address: net.universalRouter,
      abi: protocol.router,
      functionName: "execute",
      args: ["0x10", [input], deadline],
      value: q.input === zeroAddress ? q.amountIn : 0n,
    },
  };
}
