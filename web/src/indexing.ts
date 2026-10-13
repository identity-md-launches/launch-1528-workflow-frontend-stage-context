import { getAbiItem, type Address, type Hex, type AbiEvent } from "viem";
import type { Runtime } from "./config";
import { read, type Brick, type Reader, type Round } from "./chain";
export interface OwnedBrick extends Brick {
  id: bigint;
  deposit: bigint;
  dividends: bigint;
  diamond: bigint;
  canSettleDiamond: boolean;
}
export async function loadBrick(
  r: Reader,
  c: Runtime,
  vault: Address,
  id: bigint,
): Promise<OwnedBrick> {
  const [brick, deposit, claim] = await Promise.all([
    read<Brick>(r, c.game, c.abis.Ponziramid, "bricks", [id]),
    read<readonly [Address, bigint]>(r, vault, c.abis.StoneVault, "deposits", [
      id,
    ]),
    read<readonly [bigint, bigint]>(
      r,
      c.game,
      c.abis.Ponziramid,
      "claimableBrickETH",
      [id],
    ),
  ]);
  const round = await read<Round>(r, c.game, c.abis.Ponziramid, "rounds", [
    brick.roundId,
  ]);
  return {
    ...brick,
    id,
    deposit: deposit[1],
    dividends: claim[0],
    diamond: claim[1],
    canSettleDiamond:
      round.finalized && !brick.exitedBeforeExpiry && !brick.diamondClaimed,
  };
}
export async function scanBricks(
  r: Reader,
  c: Runtime,
  account: Address,
  from: bigint,
  to: bigint,
) {
  const end = from + 4999n < to ? from + 4999n : to;
  const logs = await r.getLogs({
    address: c.game,
    event: getAbiItem({
      abi: c.abis.Ponziramid,
      name: "BrickPlaced",
    }) as AbiEvent,
    args: { player: account },
    fromBlock: from,
    toBlock: end,
  });
  const ids = logs.map(
    (log) => (log as unknown as { args: { brickId: bigint } }).args.brickId,
  );
  return { ids, next: end + 1n };
}
export interface FundingEvent {
  hash: Hex;
  funder: Address;
  amount: bigint;
  block: bigint;
  logIndex: number;
}
export async function scanFunding(
  r: Reader,
  c: Runtime,
  rewards: Address,
  from: bigint,
  to: bigint,
) {
  const end = from + 4999n < to ? from + 4999n : to;
  const logs = await r.getLogs({
    address: rewards,
    event: getAbiItem({ abi: c.abis.PonziRewards, name: "Funded" }) as AbiEvent,
    fromBlock: from,
    toBlock: end,
  });
  return {
    events: logs.map((log) => {
      const e = log as unknown as {
        transactionHash: Hex;
        blockNumber: bigint;
        logIndex: number;
        args: { funder: Address; amount: bigint };
      };
      return {
        hash: e.transactionHash,
        funder: e.args.funder,
        amount: e.args.amount,
        block: e.blockNumber,
        logIndex: e.logIndex,
      };
    }),
    next: end + 1n,
  };
}
