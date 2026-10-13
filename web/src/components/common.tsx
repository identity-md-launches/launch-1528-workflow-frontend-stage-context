import { useState, useRef, type ReactNode } from "react";
import { Check, Copy, ExternalLink, LoaderCircle } from "lucide-react";
import { getAddress, type Address, type Hex } from "viem";
import { Button } from "./ui/button";
import {
  errorText,
  transact,
  type Provider,
  type Reader,
  type Transaction,
} from "../chain";
import type { Runtime } from "../config";
export function AddressView({
  address,
  explorer,
  label,
}: {
  address: Address;
  explorer: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const full = getAddress(address);
  return (
    <div className="address-view">
      {label && <span className="muted">{label}</span>}
      <a
        href={`${explorer}/address/${full}`}
        target="_blank"
        rel="noreferrer"
        className="address"
        aria-label={`${label || "Address"} ${full} on explorer`}
      >
        {full}
        <ExternalLink size={13} aria-hidden="true" />
      </a>
      <Button
        variant="ghost"
        size="small"
        aria-label={`Copy ${label || "address"}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(full);
            setCopied(true);
            setError("");
          } catch {
            setError("Select and copy the address above.");
          }
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </Button>
      {error && <span role="status">{error}</span>}
    </div>
  );
}
export function Stat({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
}) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        {value}
        {unit && <span className="unit"> {unit}</span>}
        {detail && <span className="stat-detail">{detail}</span>}
      </dd>
    </div>
  );
}
export interface ActionContext {
  runtime: Runtime;
  reader: Reader;
  provider?: Provider;
  account?: Address;
  ready: boolean;
  busy: string;
  setBusy: (name: string) => void;
  refresh: () => Promise<void>;
  recordTransaction: (
    id: string,
    label: string,
    stage: string,
    hash: Hex,
  ) => void;
}
export function TxAction({
  ctx,
  id,
  label,
  disabled = false,
  getTransaction,
  onConfirmed,
  primary = false,
  hint,
}: {
  ctx: ActionContext;
  id: string;
  label: string;
  disabled?: boolean;
  getTransaction: () => Promise<Transaction> | Transaction;
  onConfirmed?: () => void;
  primary?: boolean;
  hint?: string;
}) {
  const [stage, setStage] = useState(""),
    [hash, setHash] = useState<Hex>(),
    [error, setError] = useState(""),
    [needsReceipt, setNeedsReceipt] = useState(false),
    [checkingReceipt, setCheckingReceipt] = useState(false);
  const lock = useRef(false);
  const running = ctx.busy === id;
  const send = async () => {
    if (
      lock.current ||
      needsReceipt ||
      ctx.busy ||
      !ctx.ready ||
      !ctx.account ||
      !ctx.provider
    )
      return;
    lock.current = true;
    ctx.setBusy(id);
    setError("");
    setHash(undefined);
    setStage("Preparing");
    let submitted: Hex | undefined;
    try {
      const tx = await getTransaction();
      await transact(
        ctx.reader,
        ctx.runtime,
        ctx.provider,
        ctx.account,
        tx,
        (s, h) => {
          setStage(s);
          if (h) {
            submitted = h;
            setHash(h);
            ctx.recordTransaction(id, label, s, h);
          }
        },
      );
      await ctx.refresh();
      onConfirmed?.();
    } catch (e) {
      setError(errorText(e));
      setStage("");
      if (submitted) {
        const reverted = errorText(e).includes("Transaction reverted");
        setNeedsReceipt(!reverted);
        ctx.recordTransaction(
          id,
          label,
          reverted ? "Reverted" : "Confirmation unknown",
          submitted,
        );
      }
    } finally {
      lock.current = false;
      ctx.setBusy("");
    }
  };
  const checkReceipt = async () => {
    if (!hash || checkingReceipt) return;
    setCheckingReceipt(true);
    try {
      const receipt = await ctx.reader.getTransactionReceipt({ hash });
      setNeedsReceipt(false);
      setError(
        receipt.status === "success"
          ? ""
          : "Transaction reverted. Refresh and review before trying again.",
      );
      setStage(receipt.status === "success" ? "Confirmed" : "Reverted");
      ctx.recordTransaction(
        id,
        label,
        receipt.status === "success" ? "Confirmed" : "Reverted",
        hash,
      );
      await ctx.refresh();
      if (receipt.status === "success") onConfirmed?.();
    } catch {
      setError(
        "Confirmation is still unavailable. Check the explorer and try checking again; this action will not be submitted twice.",
      );
    } finally {
      setCheckingReceipt(false);
    }
  };
  return (
    <div className="tx-action">
      <Button
        variant={primary ? "default" : "outline"}
        disabled={disabled || needsReceipt || !ctx.ready || !!ctx.busy}
        onClick={() => void send()}
        aria-describedby={hint ? `${id}-hint` : undefined}
      >
        {running && <LoaderCircle className="spinner" size={17} />}{" "}
        {running ? `${label}: ${stage.toLowerCase()}…` : label}
      </Button>
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      <div className="action-status" role="status">
        {!running && stage === "Confirmed" && (
          <span className="success">Transaction confirmed. </span>
        )}
        {hash && (
          <a
            href={`${ctx.runtime.deployment.network.explorer}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction <ExternalLink size={13} />
          </a>
        )}
      </div>
      {needsReceipt && (
        <Button disabled={checkingReceipt} onClick={() => void checkReceipt()}>
          {checkingReceipt ? "Checking receipt…" : "Check transaction receipt"}
        </Button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
          {hash && " Check the transaction receipt before trying again."}
        </p>
      )}
    </div>
  );
}
