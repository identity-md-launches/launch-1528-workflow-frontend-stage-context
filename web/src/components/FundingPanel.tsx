import { useEffect, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { formatUnits } from "viem";
import { Button } from "./ui/button";
import { AddressView, Stat, TxAction, type ActionContext } from "./common";
import { errorText, read, same, type Snapshot } from "../chain";
import { scanFunding, type FundingEvent } from "../indexing";
import { amount, parseAmount } from "../format";
export function FundingPanel({
  ctx,
  s,
  creatorError,
}: {
  ctx: ActionContext;
  s?: Snapshot;
  creatorError: string;
}) {
  const [value, setValue] = useState(""),
    [accepted, setAccepted] = useState(false),
    [events, setEvents] = useState<FundingEvent[]>([]),
    [next, setNext] = useState(ctx.runtime.deploymentBlock),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  let n = 0n;
  try {
    n = parseAmount(value, s?.decimals);
  } catch {
    /* inline message when the field has a value */
  }
  const approvalNeeded = n > 0n && (s?.fundAllowance ?? 0n) < n;
  const isCreator = same(ctx.account, s?.creator);
  const incomplete = s && !s.funded;
  useEffect(() => {
    setAccepted(false);
  }, [value, ctx.account]);
  const scan = async () => {
    if (!s || busy) return;
    setBusy(true);
    setError("");
    try {
      const from =
        next > ctx.runtime.deploymentBlock + 12n
          ? next - 12n
          : ctx.runtime.deploymentBlock;
      const page = await scanFunding(
        ctx.reader,
        ctx.runtime,
        s.rewards,
        from,
        s.block,
      );
      setEvents((prev) => [
        ...prev.filter((e) => e.block < from),
        ...page.events,
      ]);
      setNext(page.next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (s) void scan();
  }, [s?.block, s?.rewards]);
  return (
    <section id="funding" className="panel">
      <div className="section-title">
        <h2>Nothing kept in the shadows</h2>
        <ShieldCheck size={23} aria-hidden="true" />
      </div>
      <p className="muted">
        Permanent rewards. Public balances. Verify every deposit.
      </p>
      <div className={`funding-state ${s?.funded ? "success" : ""}`}>
        {s
          ? s.funded
            ? "Initial funding reached"
            : "NOT FUNDED"
          : "Funding status unavailable"}
      </div>
      <dl className="stats two">
        <Stat
          label="Reward pool balance"
          value={amount(s?.rewardBalance, s?.decimals)}
          unit={s?.symbol}
        />
        <Stat
          label="Committed to players"
          value={amount(s?.committed, s?.decimals)}
          unit={s?.symbol}
        />
        <Stat
          label="Uncommitted rewards"
          value={amount(s?.uncommitted, s?.decimals)}
          unit={s?.symbol}
        />
        <Stat
          label="Creator’s current balance"
          value={amount(s?.creatorBalance, s?.decimals)}
          unit={s?.symbol}
          detail="Target: 0 after the creator’s full deposit"
        />
      </dl>
      <p className="hint">
        Initial funding threshold: {amount(s?.initialFunding, s?.decimals)}{" "}
        {s?.symbol}. This gate is permanent once reached; later reward payouts
        can reduce the balance.
      </p>
      {s?.creator ? (
        <AddressView
          address={s.creator}
          explorer={ctx.runtime.deployment.network.explorer}
          label="Allocation recipient, verified from deployment receipt"
        />
      ) : (
        <p className="hint">
          {creatorError || "Allocation recipient verification is pending."}
        </p>
      )}
      <div className="subsection">
        <h3>Funding receipts</h3>
        {events.length === 0 ? (
          <p>
            {busy
              ? "Checking confirmed deposits…"
              : next > (s?.block || 0n) && s
                ? "No fund() deposit found in the scanned history."
                : "No funding transaction verified yet. Continue scanning to check later blocks."}
          </p>
        ) : (
          <ul className="receipt-list">
            {events.map((e, i) => (
              <li key={`${e.hash}-${e.logIndex}-${i}`}>
                <a
                  href={`${ctx.runtime.deployment.network.explorer}/tx/${e.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {same(e.funder, s?.creator)
                    ? "Creator deposit"
                    : "Reward deposit"}
                  : {amount(e.amount, s?.decimals)} {s?.symbol}{" "}
                  <ExternalLink size={14} />
                </a>
                <span className="hint">Block {e.block.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
        <Button
          disabled={busy || !s || next > (s?.block || 0n)}
          onClick={() => void scan()}
        >
          {busy ? "Scanning funding…" : "Scan next funding blocks"}
        </Button>
        <p className="hint">
          Verified from the reward pool’s Funded events.{" "}
          {next > ctx.runtime.deploymentBlock
            ? `Scanned through block ${(next - 1n).toLocaleString()}.`
            : ""}{" "}
          Direct token transfers do not emit Funded.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <details className="disclosure">
        <summary>Fund the reward pool</summary>
        <p>
          Deposits are permanent. Tokens can only leave as verified player
          rewards. There is no refund, admin withdrawal or recovery.
        </p>
        <p className="hint">
          The creator must approve, then deposit the entire allocation balance
          in one funding transaction.
        </p>
        <label htmlFor="fund-amount">
          Deposit amount ({s?.symbol || "token"})
        </label>
        <input
          id="fund-amount"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0.0"
        />
        {value && n === 0n && (
          <p className="error">
            Enter a positive amount with at most {s?.decimals || 18} decimals.
          </p>
        )}
        <Button
          disabled={!s?.tokenBalance}
          onClick={() => setValue(formatUnits(s!.tokenBalance!, s!.decimals))}
        >
          Use entire wallet balance
        </Button>
        <p className="hint">
          Wallet balance: {amount(s?.tokenBalance, s?.decimals)} {s?.symbol}
        </p>
        {approvalNeeded ? (
          <TxAction
            ctx={ctx}
            id="fund-approve"
            label="Approve reward deposit"
            disabled={!s || !n || n > (s.tokenBalance || 0n)}
            getTransaction={() => ({
              address: ctx.runtime.token,
              abi: ctx.runtime.abis.LaunchToken,
              functionName: "approve",
              args: [s!.rewards, n],
            })}
            hint="Step 1: allow the reward pool to spend this exact amount. This does not deposit tokens."
          />
        ) : (
          <>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              I understand this deposit cannot be withdrawn.
            </label>
            <TxAction
              ctx={ctx}
              id="fund-deposit"
              label="Fund permanently"
              disabled={!s || !n || !accepted || n > (s.tokenBalance || 0n)}
              getTransaction={async () => {
                if (isCreator && incomplete) {
                  const balance = await read<bigint>(
                    ctx.reader,
                    ctx.runtime.token,
                    ctx.runtime.abis.LaunchToken,
                    "balanceOf",
                    [ctx.account!],
                  );
                  if (n !== balance)
                    throw Error(
                      "For the initial creator deposit, use your entire current token balance.",
                    );
                }
                return {
                  address: s!.rewards,
                  abi: ctx.runtime.abis.PonziRewards,
                  functionName: "fund",
                  args: [n],
                };
              }}
              hint="Step 2: transfer the approved tokens permanently into player rewards."
            />
          </>
        )}
      </details>
    </section>
  );
}
