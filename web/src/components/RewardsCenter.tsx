import { useEffect, useState } from "react";
import {
  Diamond,
  Gem,
  Layers3,
  Coins,
  ArrowUpRight,
  ChevronDown,
  Wallet,
} from "lucide-react";
import { type Address } from "viem";
import { read, recipientAddress, type Snapshot } from "../chain";
import type { Portfolio } from "../portfolio";
import { loadBrick, type OwnedBrick } from "../indexing";
import { Amount, type ActionContext } from "./common";
import { Button } from "./ui/button";
import { ClaimQueue, type QueuePlan } from "./ClaimQueue";
export function claimCount(p: Portfolio, s?: Snapshot) {
  return (
    p.bricks.filter((b) => b.deposit > 0n).length +
    p.bricks.filter((b) => b.dividends + b.diamond > 0n || b.canSettleDiamond)
      .length +
    p.rounds.filter((r) => r.amount > 0n).length +
    (s?.credit ? 1 : 0)
  );
}
export function BrickStatus({ b }: { b: OwnedBrick }) {
  return (
    <span
      className={`status-chip ${b.withdrawn ? "faded" : b.isPharaoh ? "gold" : b.finalized && !b.exitedBeforeExpiry ? "diamond" : ""}`}
    >
      {b.withdrawn
        ? "Withdrawn"
        : b.isPharaoh
          ? "Pharaoh"
          : b.finalized && !b.exitedBeforeExpiry
            ? "Diamond"
            : "Active"}
    </span>
  );
}
export function RewardsCenter({
  ctx,
  s,
  portfolio: p,
  connect,
  onBrick,
}: {
  ctx: ActionContext;
  s?: Snapshot;
  portfolio: Portfolio;
  connect: () => void;
  onBrick: (id: bigint) => void;
}) {
  const [plan, setPlan] = useState<QueuePlan>(),
    [recipient, setRecipient] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    setRecipient("");
    setPage(0);
  }, [ctx.account]);
  const recipientValue = recipientAddress(recipient, ctx.account);
  const earnings = p.bricks.reduce(
    (n, b) => n + b.dividends + b.diamond,
    s?.credit || 0n,
  );
  const tokens = p.rounds.reduce((n, r) => n + r.amount, 0n);
  const ethBricks = p.bricks.filter(
    (b) => b.dividends + b.diamond > 0n || b.canSettleDiamond,
  );
  const deposits = p.bricks.filter((b) => b.deposit > 0n);
  const count = claimCount(p, s);
  const canAct =
    ctx.ready &&
    !plan &&
    p.complete &&
    !p.scanning &&
    !ctx.busy &&
    !!recipientValue;
  const openQueue = (kind: "stone" | "eth" | "token") => {
    if (!ctx.account) {
      connect();
      return;
    }
    if (!s || !recipientValue) return;
    const recipient = recipientValue,
      account = ctx.account;
    if (kind === "stone")
      setPlan({
        title: "Withdraw Stone",
        description:
          "Before expiry, each withdrawal removes 10 minutes, stops future dividends and forfeits its diamond share. Mortar and gas are not refunded.",
        tasks: deposits.map((b) => ({
          id: `withdraw-${b.id}`,
          label: `Withdraw brick #${b.id}`,
          transaction: async () => {
            const fresh = await loadBrick(
              ctx.reader,
              ctx.runtime,
              s.vault,
              b.id,
            );
            return fresh.deposit
              ? {
                  address: s.vault,
                  abi: ctx.runtime.abis.StoneVault,
                  functionName: "withdrawStone",
                  args: [b.id, recipient],
                }
              : undefined;
          },
        })),
      });
    if (kind === "eth")
      setPlan({
        title: "Claim all ETH",
        description:
          "Collect brick dividends, eligible diamond rewards and credited ETH. Stone stays in the vault. Zero-value diamond settlement still costs gas.",
        tasks: [
          ...ethBricks.map((b) => ({
            id: `eth-${b.id}`,
            label: `Brick #${b.id}${b.dividends + b.diamond === 0n ? " · rounding settlement" : ""}`,
            transaction: async () => {
              const fresh = await loadBrick(
                ctx.reader,
                ctx.runtime,
                s.vault,
                b.id,
              );
              return fresh.dividends + fresh.diamond > 0n ||
                fresh.canSettleDiamond
                ? {
                    address: ctx.runtime.game,
                    abi: ctx.runtime.abis.Ponziramid,
                    functionName: "claimBrickETH",
                    args: [b.id, recipient],
                  }
                : undefined;
            },
          })),
          ...(s.credit
            ? [
                {
                  id: "eth-credit",
                  label: "Credited ETH",
                  transaction: async () => {
                    const n = await read<bigint>(
                      ctx.reader,
                      ctx.runtime.game,
                      ctx.runtime.abis.Ponziramid,
                      "ethCredit",
                      [account],
                    );
                    return n
                      ? {
                          address: ctx.runtime.game,
                          abi: ctx.runtime.abis.Ponziramid,
                          functionName: "claimETH",
                          args: [recipient],
                        }
                      : undefined;
                  },
                },
              ]
            : []),
        ],
      });
    if (kind === "token")
      setPlan({
        title: "Claim all PONZIRAM",
        description:
          "Collect rewards from your finished rounds. Each round needs one wallet confirmation.",
        tasks: p.rounds
          .filter((r) => r.amount > 0n)
          .map((r) => ({
            id: `token-${r.id}`,
            label: `Round ${r.id}`,
            transaction: async () => {
              const n = await read<bigint>(
                ctx.reader,
                s.rewards,
                ctx.runtime.abis.PonziRewards,
                "claimable",
                [r.id, account],
              );
              return n
                ? {
                    address: s.rewards,
                    abi: ctx.runtime.abis.PonziRewards,
                    functionName: "claim",
                    args: [r.id, recipient],
                  }
                : undefined;
            },
          })),
      });
  };
  return (
    <section id="rewards" className="panel rewards-panel">
      <div className="section-title">
        <div>
          <h2>
            Your rewards{" "}
            <span
              className="count-badge"
              aria-label={`${count} claimable items`}
            >
              {count}
            </span>
          </h2>
          <p className="muted">A little less buried treasure.</p>
        </div>
        <Gem size={24} />
      </div>
      <div className="reward-rows">
        <div className="reward-row">
          <span className="reward-icon">
            <Layers3 size={22} />
          </span>
          <div>
            <h3>Stone</h3>
            <p className="hint">Refundable principal</p>
          </div>
          <Amount value={ctx.account ? s?.stone : undefined} />
          <Button
            disabled={!!ctx.account && (!canAct || !deposits.length)}
            onClick={() => openQueue("stone")}
          >
            Withdraw
          </Button>
        </div>
        <div className="reward-row">
          <span className="reward-icon">
            <Diamond size={22} />
          </span>
          <div>
            <h3>ETH earned</h3>
            <p className="hint">Dividends + prizes</p>
          </div>
          <Amount value={ctx.account && p.complete ? earnings : undefined} />
          <Button
            disabled={
              !!ctx.account && (!canAct || (!ethBricks.length && !s?.credit))
            }
            onClick={() => openQueue("eth")}
          >
            Claim all <ArrowUpRight size={14} />
          </Button>
        </div>
        <div className="reward-row">
          <span className="reward-icon">
            <Coins size={22} />
          </span>
          <div>
            <h3>PONZIRAM</h3>
            <p className="hint">From finished rounds</p>
          </div>
          <Amount
            value={ctx.account && p.complete ? tokens : undefined}
            unit="PONZIRAM"
          />
          <Button
            disabled={!!ctx.account && (!canAct || !tokens)}
            onClick={() => openQueue("token")}
          >
            Claim all <ArrowUpRight size={14} />
          </Button>
        </div>
      </div>
      {!ctx.account ? (
        <div className="rewards-connect">
          <Wallet size={18} />
          <p>Connect to find your bricks and rewards automatically.</p>
          <button className="text-button" onClick={connect}>
            Connect <ArrowUpRight size={14} />
          </button>
        </div>
      ) : (
        <>
          <details className="recipient">
            <summary>
              Send to another address <ChevronDown size={14} />
            </summary>
            <label htmlFor="recipient">Recipient address</label>
            <input
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Defaults to your connected wallet"
              spellCheck={false}
              aria-invalid={!!recipient && !recipientValue}
            />
            {!!recipient && !recipientValue && (
              <p className="error">Enter a valid nonzero Ethereum address.</p>
            )}
          </details>
          <div className="bricks-heading">
            <h3>
              My bricks <span className="muted">{p.bricks.length}</span>
            </h3>
            <span className="hint" role="status">
              {p.scanning
                ? `Finding bricks${p.through ? " · block " + p.through.toLocaleString() : ""}…`
                : p.complete
                  ? "All rounds · up to date"
                  : "Discovery incomplete"}
            </span>
          </div>
          {p.error && (
            <div className="error" role="alert">
              Discovery incomplete. {p.error}{" "}
              <Button onClick={() => void p.refresh()}>Retry discovery</Button>
            </div>
          )}
          {p.complete && !p.bricks.length && (
            <p className="empty-copy">
              No bricks yet. Your first one starts with Build.
            </p>
          )}
          <div className="brick-table">
            <div className="brick-table-header">
              <span>Round / brick</span>
              <span>Stone</span>
              <span>ETH earned</span>
              <span>Status</span>
            </div>
            {p.bricks.slice(page * 8, page * 8 + 8).map((b) => (
              <div className="brick-table-row" key={b.id.toString()}>
                <button className="text-button" onClick={() => onBrick(b.id)}>
                  R{b.roundId.toString()} · #{b.id.toString()}{" "}
                  <ArrowUpRight size={13} />
                </button>
                <Amount value={b.deposit} />
                <Amount value={b.dividends + b.diamond} />
                <BrickStatus b={b} />
              </div>
            ))}
          </div>
          {p.bricks.length > 8 && (
            <div className="row-between">
              <Button disabled={!page} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="hint">
                Page {page + 1} of {Math.ceil(p.bricks.length / 8)}
              </span>
              <Button
                disabled={(page + 1) * 8 >= p.bricks.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
      <ClaimQueue
        ctx={ctx}
        plan={plan}
        onClose={() => setPlan(undefined)}
        onComplete={() => void p.refresh()}
      />
    </section>
  );
}
