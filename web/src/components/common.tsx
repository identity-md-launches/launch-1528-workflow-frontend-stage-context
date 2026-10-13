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
import { amount, shortAmount, tokenAmount, shortAddress } from "../format";
import { HoverCard } from "./ui/overlays";
export function CopyButton({
  value,
  label = "Copy exact value",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setFailed(false);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
      {failed && <span role="status">Select the value to copy.</span>}
    </>
  );
}
export function Amount({
  value,
  unit = "ETH",
  decimals = 18,
}: {
  value?: bigint;
  unit?: string;
  decimals?: number;
}) {
  if (value === undefined)
    return <span className="amount-placeholder muted">… {unit}</span>;
  const exact = amount(value, decimals);
  return (
    <HoverCard
      label={`Exact ${unit} amount`}
      content={
        <div className="exact-value">
          <span>
            {exact} {unit}
          </span>
          <CopyButton value={exact} />
        </div>
      }
    >
      <span className="numeric">
        {unit === "ETH"
          ? shortAmount(value, decimals)
          : tokenAmount(value, decimals)}{" "}
        <span className="unit">{unit}</span>
      </span>
    </HoverCard>
  );
}
export function AddressView({
  address,
  explorer,
  label,
}: {
  address: Address;
  explorer: string;
  label?: string;
}) {
  const full = getAddress(address);
  return (
    <span className="address-view">
      {label && <span className="address-label">{label}</span>}
      <HoverCard
        label={`Show full ${label || "address"}`}
        content={
          <div className="exact-value">
            <span>{full}</span>
            <CopyButton value={full} />
          </div>
        }
      >
        {shortAddress(full)}
      </HoverCard>
      <CopyButton value={full} label={`Copy ${label || "address"}`} />
      <a
        className="icon-button"
        href={`${explorer}/address/${full}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`View ${label || "address"} on Etherscan`}
      >
        <ExternalLink size={14} />
      </a>
    </span>
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
  chainId?: number;
  ready: boolean;
  busy: string;
  setBusy: (name: string) => void;
  refresh: () => Promise<void>;
  recordTransaction: (
    id: string,
    label: string,
    stage: string,
    hash: Hex,
    replaces?: Hex,
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
  validate,
}: {
  ctx: ActionContext;
  id: string;
  label: string;
  disabled?: boolean;
  getTransaction: () => Promise<Transaction> | Transaction;
  onConfirmed?: () => void;
  primary?: boolean;
  hint?: string;
  validate?: () => void;
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
      const result = await transact(
        ctx.reader,
        ctx.runtime,
        ctx.provider,
        ctx.account,
        tx,
        (s, h, replaces) => {
          setStage(s);
          if (h) {
            submitted = h;
            setHash(h);
            ctx.recordTransaction(id, label, s, h, replaces);
          }
        },
        validate,
      );
      await ctx.refresh();
      if (result.outcome === "Confirmed") onConfirmed?.();
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
        {!running && (stage === "Cancelled" || stage === "Replaced") && (
          <span>
            {stage === "Replaced"
              ? `${label}: replaced by a different transaction. Review its receipt; the requested action was not confirmed. `
              : id === "build"
                ? "Build cancelled. No brick was placed. "
                : `${label}: cancelled. The requested action was not completed. `}
          </span>
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
