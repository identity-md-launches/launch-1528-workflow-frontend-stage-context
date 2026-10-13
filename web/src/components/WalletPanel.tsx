import { useEffect, useState } from "react";
import { Wallet, ArrowUpRight } from "lucide-react";
import { type Address } from "viem";
import { Button } from "./ui/button";
import { AddressView, Stat, TxAction, type ActionContext } from "./common";
import {
  errorText,
  read,
  recipientAddress,
  same,
  type Snapshot,
} from "../chain";
import { loadBrick, scanBricks, type OwnedBrick } from "../indexing";
import { amount } from "../format";
export function WalletPanel({
  ctx,
  s,
  connect,
}: {
  ctx: ActionContext;
  s?: Snapshot;
  connect: () => void;
}) {
  const [recipient, setRecipient] = useState(""),
    [brickInput, setBrickInput] = useState(""),
    [ids, setIds] = useState<bigint[]>([]),
    [bricks, setBricks] = useState<OwnedBrick[]>([]),
    [page, setPage] = useState(0),
    [next, setNext] = useState(ctx.runtime.deploymentBlock),
    [scanning, setScanning] = useState(false),
    [error, setError] = useState(""),
    [roundInput, setRoundInput] = useState(""),
    [claim, setClaim] = useState<bigint>(),
    [claimError, setClaimError] = useState("");
  const account = ctx.account;
  const recipientValue = recipientAddress(recipient, account);
  const roundId = /^[1-9]\d*$/.test(roundInput)
    ? BigInt(roundInput)
    : undefined;
  useEffect(() => {
    setIds([]);
    setBricks([]);
    setPage(0);
    setNext(ctx.runtime.deploymentBlock);
    setRecipient("");
    setError("");
    setClaim(undefined);
  }, [account, ctx.runtime.deploymentBlock]);
  useEffect(() => {
    if (s && s.roundId > 0n && !roundInput) setRoundInput(s.roundId.toString());
  }, [s, roundInput]);
  useEffect(() => {
    let cancelled = false;
    if (!s || !account || !roundId) {
      setClaim(undefined);
      return;
    }
    setClaim(undefined);
    read<bigint>(
      ctx.reader,
      s.rewards,
      ctx.runtime.abis.PonziRewards,
      "claimable",
      [roundId, account],
    )
      .then((x) => {
        if (!cancelled) {
          setClaim(x);
          setClaimError("");
        }
      })
      .catch((e) => {
        if (!cancelled) setClaimError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [ctx.reader, ctx.runtime, account, roundId, s?.block, s?.rewards]);
  useEffect(() => {
    let cancelled = false;
    if (!s || !account) return;
    Promise.all(
      ids
        .slice(page * 10, page * 10 + 10)
        .map((id) => loadBrick(ctx.reader, ctx.runtime, s.vault, id)),
    )
      .then((x) => {
        if (!cancelled) setBricks(x.filter((b) => same(b.player, account)));
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [ids, page, ctx.reader, ctx.runtime, s?.block, s?.vault, account]);
  const scan = async () => {
    if (!s || !account || scanning) return;
    setScanning(true);
    setError("");
    try {
      const found = await scanBricks(
        ctx.reader,
        ctx.runtime,
        account,
        next,
        s.block,
      );
      setIds((prev) =>
        [...new Set([...prev, ...found.ids])].sort((a, b) => (a < b ? -1 : 1)),
      );
      setNext(found.next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setScanning(false);
    }
  };
  const lookup = async () => {
    if (!s || !account) return;
    setError("");
    try {
      if (!/^[1-9]\d*$/.test(brickInput))
        throw Error("Enter a valid brick ID.");
      const b = await loadBrick(
        ctx.reader,
        ctx.runtime,
        s.vault,
        BigInt(brickInput),
      );
      if (!same(b.player, account))
        throw Error(
          "This brick belongs to a different wallet or does not exist.",
        );
      setIds((prev) => [b.id, ...prev.filter((id) => id !== b.id)]);
      setPage(0);
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <section id="your-stone" className="panel wallet-panel">
      <div className="section-title">
        <h2>Your place in the pyramid</h2>
        <Wallet size={22} aria-hidden="true" />
      </div>
      {!account ? (
        <div className="empty-state">
          <p>
            Connect to see your bricks, withdraw Stone and collect earned
            rewards.
          </p>
          <Button onClick={connect}>
            Connect wallet to view your Stone <ArrowUpRight size={16} />
          </Button>
        </div>
      ) : (
        <>
          <AddressView
            address={account}
            explorer={ctx.runtime.deployment.network.explorer}
            label="Connected wallet"
          />
          <dl className="stats two">
            <Stat
              label="Your refundable Stone"
              value={amount(s?.stone)}
              unit="ETH"
            />
            <Stat
              label="Your credited ETH"
              value={amount(s?.credit)}
              unit="ETH"
            />
          </dl>
          <p className="hint">
            Your earned ETH in loaded bricks:{" "}
            {amount(
              bricks.reduce((sum, b) => sum + b.dividends + b.diamond, 0n),
            )}{" "}
            ETH. Brick earnings are listed separately below. Stone comes from
            the vault ledger; it is never an estimate of prizes.
          </p>
          <details className="disclosure">
            <summary>Send refunds or claims to another address</summary>
            <label htmlFor="recipient">Recipient address</label>
            <input
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="Leave blank to use your connected wallet"
              aria-invalid={!!recipient && !recipientValue}
            />
            {recipient && !recipientValue && (
              <p className="error">
                Enter a valid, nonzero Ethereum address. ENS names are not
                accepted here.
              </p>
            )}
            <p className="hint">
              Only your connected wallet can claim. An alternate recipient can
              receive a refund if your wallet rejects ETH.
            </p>
          </details>
          <TxAction
            ctx={ctx}
            id="claim-credit"
            label="Claim ETH"
            disabled={!s?.credit || !recipientValue}
            getTransaction={() => ({
              address: ctx.runtime.game,
              abi: ctx.runtime.abis.Ponziramid,
              functionName: "claimETH",
              args: [recipientValue!],
            })}
            hint="Collect credited Pharaoh prizes or owner Mortar fees. This leaves Stone untouched."
          />
          <div className="subsection">
            <h3>Your bricks</h3>
            <div className="inline-form">
              <label htmlFor="brick-id">Look up a brick ID</label>
              <div className="input-row">
                <input
                  id="brick-id"
                  inputMode="numeric"
                  value={brickInput}
                  onChange={(e) => setBrickInput(e.target.value)}
                  placeholder="Brick ID"
                />
                <Button disabled={!s} onClick={() => void lookup()}>
                  Load brick
                </Button>
              </div>
            </div>
            <Button
              disabled={!s || scanning || next > (s?.block || 0n)}
              onClick={() => void scan()}
            >
              {scanning
                ? "Scanning confirmed events…"
                : next === ctx.runtime.deploymentBlock
                  ? "Find my bricks"
                  : "Scan next blocks"}
            </Button>
            <p className="hint">
              Scans 5,000 blocks at a time from deployment.{" "}
              {next > ctx.runtime.deploymentBlock
                ? `Scanned through block ${(next - 1n).toLocaleString()}. ${ids.length} owned bricks found.`
                : "Use a brick ID for immediate access to any historical refund."}
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {!bricks.length && (
              <p className="empty-copy">
                No bricks loaded. Find your bricks or enter an ID above.
              </p>
            )}
            <div className="brick-list">
              {bricks.map((b) => (
                <article className="brick-row" key={b.id.toString()}>
                  <div className="row-between">
                    <h3>Brick #{b.id.toString()}</h3>
                    <span className="muted">
                      Round {b.roundId.toString()} ·{" "}
                      {b.withdrawn ? "Stone withdrawn" : "Stone held"}
                    </span>
                  </div>
                  <dl className="compact-dl">
                    <div>
                      <dt>Refundable Stone</dt>
                      <dd>{amount(b.deposit)} ETH</dd>
                    </div>
                    <div>
                      <dt>Earned ETH</dt>
                      <dd>{amount(b.dividends + b.diamond)} ETH</dd>
                    </div>
                  </dl>
                  <TxAction
                    ctx={ctx}
                    id={`withdraw-${b.id}`}
                    label="Withdraw Stone"
                    disabled={b.deposit === 0n || !recipientValue}
                    getTransaction={() => ({
                      address: s!.vault,
                      abi: ctx.runtime.abis.StoneVault,
                      functionName: "withdrawStone",
                      args: [b.id, recipientValue!],
                    })}
                    hint="Full Stone refund. Before expiry: stop earning, forfeit this brick’s diamond share and subtract 10 minutes. Mortar and gas are not refunded."
                  />
                  <TxAction
                    ctx={ctx}
                    id={`brick-eth-${b.id}`}
                    label="Claim brick ETH"
                    disabled={
                      (b.dividends + b.diamond === 0n && !b.canSettleDiamond) ||
                      !recipientValue
                    }
                    hint={
                      b.dividends + b.diamond === 0n && b.canSettleDiamond
                        ? "This claim pays 0 ETH and settles this brick’s finalized rounding share. Gas still applies."
                        : undefined
                    }
                    getTransaction={() => ({
                      address: ctx.runtime.game,
                      abi: ctx.runtime.abis.Ponziramid,
                      functionName: "claimBrickETH",
                      args: [b.id, recipientValue!],
                    })}
                  />
                </article>
              ))}
            </div>
            {ids.length > 10 && (
              <div className="row-between">
                <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Previous bricks
                </Button>
                <span>Page {page + 1}</span>
                <Button
                  disabled={(page + 1) * 10 >= ids.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next bricks
                </Button>
              </div>
            )}
          </div>
          <div className="subsection">
            <h3>Claim PONZI rewards</h3>
            <p className="hint">
              Paid in {s?.symbol || "the launch token"}. Claim each finalized
              round separately. Claims never expire.
            </p>
            <label htmlFor="reward-round">Round ID</label>
            <input
              id="reward-round"
              value={roundInput}
              onChange={(e) => setRoundInput(e.target.value)}
              inputMode="numeric"
            />
            <p>
              Available:{" "}
              <strong>
                {amount(claim, s?.decimals)} {s?.symbol}
              </strong>
            </p>
            {claimError && (
              <p className="error" role="alert">
                {claimError}
              </p>
            )}
            <TxAction
              ctx={ctx}
              id="claim-token"
              label="Claim PONZI"
              disabled={!claim || !recipientValue || !roundId}
              getTransaction={() => ({
                address: s!.rewards,
                abi: ctx.runtime.abis.PonziRewards,
                functionName: "claim",
                args: [roundId!, recipientValue!],
              })}
            />
          </div>
        </>
      )}
    </section>
  );
}
