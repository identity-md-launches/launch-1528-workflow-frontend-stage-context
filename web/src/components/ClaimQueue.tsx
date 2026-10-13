import { useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { Check, Circle, ExternalLink, LoaderCircle } from "lucide-react";
import { Dialog } from "./ui/overlays";
import { Button } from "./ui/button";
import type { ActionContext } from "./common";
import { errorText, transact, type Transaction } from "../chain";
export interface QueueTask {
  id: string;
  label: string;
  transaction: () => Promise<Transaction | undefined>;
}
export interface QueuePlan {
  title: string;
  description: string;
  tasks: QueueTask[];
}
export function ClaimQueue({
  ctx,
  plan,
  onClose,
  onComplete,
}: {
  ctx: ActionContext;
  plan?: QueuePlan;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false),
    [done, setDone] = useState(0),
    [stage, setStage] = useState(""),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false),
    [unknown, setUnknown] = useState<Hex>(),
    [hash, setHash] = useState<Hex>();
  const stop = useRef(false),
    lock = useRef(false),
    current = useRef(ctx);
  current.current = ctx;
  const startAccount = useRef(ctx.account);
  useEffect(() => {
    setOpen(!!plan);
    setDone(0);
    setStage("");
    setError("");
    setUnknown(undefined);
    setHash(undefined);
    stop.current = false;
    startAccount.current = ctx.account;
  }, [plan]);
  const valid = () => {
    if (
      current.current.account !== startAccount.current ||
      current.current.chainId !== ctx.runtime.deployment.chainId
    )
      throw Error(
        "Wallet or network changed. Close this queue and review your rewards again.",
      );
  };
  const run = async () => {
    if (!plan || lock.current || unknown || !ctx.ready || ctx.busy) return;
    lock.current = true;
    stop.current = false;
    setRunning(true);
    ctx.setBusy("reward-queue");
    setError("");
    let submitted: Hex | undefined;
    let pendingReceipt = false;
    try {
      for (let i = done; i < plan.tasks.length; i++) {
        valid();
        if (stop.current) break;
        const task = plan.tasks[i];
        submitted = undefined;
        setHash(undefined);
        setStage("Checking claim");
        const tx = await task.transaction();
        valid();
        if (tx) {
          const result = await transact(
            ctx.reader,
            ctx.runtime,
            ctx.provider!,
            ctx.account!,
            tx,
            (s, h, replaces) => {
              setStage(s);
              if (h) {
                submitted = h;
                setHash(h);
                ctx.recordTransaction(task.id, task.label, s, h, replaces);
              }
            },
            valid,
          );
          if (result.outcome !== "Confirmed")
            throw Error(
              `${result.outcome}. This action was not completed. Review before continuing.`,
            );
        }
        setDone(i + 1);
        await current.current.refresh();
        onComplete();
      }
      setStage(
        stop.current
          ? "Paused after the confirmed transaction."
          : "Queue complete",
      );
    } catch (e) {
      const message = errorText(e);
      setError(message);
      setStage("Queue stopped");
      if (submitted && !/reverted|Cancelled|Replaced/.test(message)) {
        pendingReceipt = true;
        setUnknown(submitted);
        ctx.recordTransaction(
          "reward-queue",
          plan.title,
          "Confirmation unknown",
          submitted,
        );
      }
    } finally {
      lock.current = false;
      setRunning(false);
      ctx.setBusy(pendingReceipt ? "reward-queue-pending" : "");
    }
  };
  const check = async () => {
    if (!unknown || lock.current) return;
    lock.current = true;
    setRunning(true);
    try {
      const receipt = await ctx.reader.getTransactionReceipt({ hash: unknown });
      if (receipt.status === "success") {
        setDone((d) => d + 1);
        setError("");
        setStage("Confirmed. Continue the remaining queue.");
      } else {
        setError("Transaction reverted. Review before retrying.");
      }
      setUnknown(undefined);
      ctx.setBusy("");
      ctx.recordTransaction(
        "reward-queue",
        plan!.title,
        receipt.status === "success" ? "Confirmed" : "Reverted",
        receipt.transactionHash,
      );
      await current.current.refresh();
      onComplete();
    } catch {
      setError(
        "Receipt still unavailable. Check Etherscan, then check again. No duplicate will be submitted.",
      );
    } finally {
      lock.current = false;
      setRunning(false);
    }
  };
  return (
    <>
      {plan && !open && (
        <div className="queue-resume">
          <span>
            {plan.title} · {done}/{plan.tasks.length} complete
            {unknown ? " · receipt pending" : ""}
          </span>
          <Button onClick={() => setOpen(true)}>Resume rewards queue</Button>
        </div>
      )}
      <Dialog
        open={!!plan && open}
        onOpenChange={(value) => {
          if (!value) {
            if (!running && !unknown) onClose();
            else {
              stop.current = true;
              setOpen(false);
            }
          }
        }}
        title={plan?.title || "Rewards"}
        description={plan?.description}
      >
        {plan && (
          <>
            <p className="queue-count">
              {done} of {plan.tasks.length} transactions confirmed
            </p>
            <ol className="queue-list">
              {plan.tasks.map((task, i) => (
                <li key={task.id} className={i < done ? "success" : ""}>
                  {i < done ? (
                    <Check size={18} />
                  ) : running && i === done ? (
                    <LoaderCircle className="spinner" size={18} />
                  ) : (
                    <Circle size={18} />
                  )}
                  <span>{task.label}</span>
                  <span className="hint">
                    {i < done
                      ? "Done"
                      : i === done
                        ? stage || "Ready"
                        : "Queued"}
                  </span>
                </li>
              ))}
            </ol>
            <div role="status">
              {running && <p>{stage}…</p>}
              {done === plan.tasks.length && (
                <p className="success">
                  All done. Your rewards are on their way home.
                </p>
              )}
            </div>
            {hash && (
              <a
                href={`${ctx.runtime.deployment.network.explorer}/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
                className="standalone-link"
              >
                View transaction <ExternalLink size={14} />
              </a>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {unknown ? (
              <Button disabled={running} onClick={() => void check()}>
                Check transaction receipt
              </Button>
            ) : running ? (
              <Button
                onClick={() => {
                  stop.current = true;
                  setStage("Stopping after this transaction");
                }}
              >
                Stop after this transaction
              </Button>
            ) : done < plan.tasks.length ? (
              <Button
                variant="default"
                disabled={
                  !ctx.ready ||
                  !!ctx.busy ||
                  ctx.account !== startAccount.current
                }
                onClick={() => void run()}
              >
                {done
                  ? "Continue remaining claims"
                  : `Confirm ${plan.tasks.length} transaction${plan.tasks.length === 1 ? "" : "s"}`}
              </Button>
            ) : (
              <Button onClick={onClose}>Done</Button>
            )}
            <p className="hint">
              One wallet confirmation per item. Gas is additional. You can stop
              between transactions.
            </p>
          </>
        )}
      </Dialog>
    </>
  );
}
