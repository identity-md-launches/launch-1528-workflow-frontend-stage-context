import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, ExternalLink } from "lucide-react";
import { zeroAddress } from "viem";
import { Button } from "./ui/button";
import { TxAction, type ActionContext } from "./common";
import { errorText, read, type Snapshot } from "../chain";
import {
  nextSwapStep,
  protocol,
  quoteTrade,
  tradeCurrencies,
  type Quote,
} from "../protocol";
import { amount, parseAmount } from "../format";
export function SwapPanel({ ctx, s }: { ctx: ActionContext; s?: Snapshot }) {
  const [buy, setBuy] = useState(true),
    [input, setInput] = useState(""),
    [bps, setBps] = useState("50"),
    [quoted, setQuoted] = useState<{
      value: Quote;
      scope: object;
      request: number;
    }>(),
    [step, setStep] = useState<Awaited<ReturnType<typeof nextSwapStep>>>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [pairMeta, setPairMeta] = useState<{ symbol: string; decimals: number }>(),
    [clock, setClock] = useState(Date.now()),
    [completed, setCompleted] = useState(false);
  const scope = useMemo(
    () => ({}),
    [
      buy,
      input,
      bps,
      ctx.account,
      ctx.chainId,
      ctx.provider,
      ctx.reader,
      ctx.runtime,
    ],
  );
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const quote = quoted?.scope === scope ? quoted.value : undefined;
  const isCurrent = (request: number) =>
    currentScope.current === scope && generation.current === request;
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let active = true;
    try {
      const { pair } = tradeCurrencies(ctx.runtime, true);
      if (pair === zeroAddress)
        setPairMeta(ctx.runtime.deployment.network.nativeCurrency);
      else
        Promise.all([
          read<string>(ctx.reader, pair, protocol.token, "symbol"),
          read<number>(ctx.reader, pair, protocol.token, "decimals"),
        ])
          .then(([symbol, decimals]) => {
            if (active) setPairMeta({ symbol, decimals });
          })
          .catch((e) => active && setError(errorText(e)));
    } catch (e) {
      setError(errorText(e));
    }
    return () => {
      active = false;
    };
  }, [ctx.runtime, ctx.reader]);
  useEffect(() => {
    generation.current++;
    setQuoted(undefined);
    setStep(undefined);
    setError("");
    setCompleted(false);
    setLoading(false);
    return () => {
      generation.current++;
    };
  }, [scope]);
  const updateStep = async (q: Quote, request: number) => {
    if (ctx.account) {
      try {
        const next = await nextSwapStep(
          ctx.reader,
          ctx.runtime,
          q,
          ctx.account,
        );
        if (isCurrent(request)) setStep(next);
      } catch (e) {
        if (isCurrent(request)) {
          setStep(undefined);
          setError(errorText(e));
        }
      }
    }
  };
  const getQuote = async () => {
    if (!s || !pairMeta) return;
    const request = ++generation.current;
    setLoading(true);
    setCompleted(false);
    setQuoted(undefined);
    setStep(undefined);
    setError("");
    try {
      const n = parseAmount(input, buy ? pairMeta.decimals : s.decimals);
      const q = await quoteTrade(
        ctx.reader,
        ctx.runtime,
        buy,
        n,
        Number(bps),
        ctx.account,
      );
      if (!isCurrent(request)) return;
      setQuoted({ value: q, scope, request });
      await updateStep(q, request);
    } catch (e) {
      if (isCurrent(request)) setError(errorText(e));
    } finally {
      if (isCurrent(request)) setLoading(false);
    }
  };
  const expired = !!quote && clock - quote.created > 60_000;
  return (
    <section id="trade" className="panel">
      <div className="section-title">
        <h2>Trade {s?.symbol || "the token"}</h2>
        <ArrowDownUp size={22} aria-hidden="true" />
      </div>
      <p className="muted">
        The attested Uniswap v4 pool. Trading is separate from the game.
      </p>
      <div className="segmented" role="group" aria-label="Trade direction">
        <Button
          disabled={ctx.busy === "swap"}
          aria-pressed={buy}
          onClick={() => setBuy(true)}
        >
          Buy {s?.symbol || "token"}
        </Button>
        <Button
          disabled={ctx.busy === "swap"}
          aria-pressed={!buy}
          onClick={() => setBuy(false)}
        >
          Sell {s?.symbol || "token"}
        </Button>
      </div>
      <label htmlFor="swap-amount">
        You pay (
        {buy ? pairMeta?.symbol || "paired currency" : s?.symbol || "token"})
      </label>
      <input
        id="swap-amount"
        disabled={ctx.busy === "swap"}
        inputMode="decimal"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="0.0"
      />
      <label htmlFor="slippage">Maximum slippage</label>
      <select
        id="slippage"
        disabled={ctx.busy === "swap"}
        value={bps}
        onChange={(e) => setBps(e.target.value)}
      >
        <option value="10">0.1%</option>
        <option value="50">0.5%</option>
        <option value="100">1%</option>
        <option value="300">3%</option>
      </select>
      <p className="hint">
        Pool fee:{" "}
        {ctx.runtime.deployment.poolKey
          ? ctx.runtime.deployment.poolKey.fee / 10000
          : "Unavailable"}
        %. Gas is additional. No guaranteed token value. USD context is
        unavailable.
      </p>
      <Button
        disabled={!s || loading || !pairMeta || !!ctx.busy}
        onClick={() => void getQuote()}
      >
        {loading ? "Simulating quote…" : "Get quote"}
      </Button>
      {quote && (
        <div className="quote-result">
          <dl className="compact-dl">
            <div>
              <dt>Estimated receive</dt>
              <dd>
                {amount(quote.amountOut, quote.outputDecimals)}{" "}
                {quote.outputSymbol}
              </dd>
            </div>
            <div>
              <dt>Minimum receive</dt>
              <dd>
                {amount(quote.minOut, quote.outputDecimals)}{" "}
                {quote.outputSymbol}
              </dd>
            </div>
            <div>
              <dt>Rate for this amount</dt>
              <dd>
                {amount(quote.amountIn, quote.inputDecimals)}{" "}
                {quote.inputSymbol} →{" "}
                {amount(quote.amountOut, quote.outputDecimals)}{" "}
                {quote.outputSymbol}
              </dd>
            </div>
          </dl>
          <p className="hint">
            {completed
              ? "Swap confirmed. Get a new quote to trade again."
              : expired
                ? "Quote expired. Get a new quote."
                : "Quote valid for 60 seconds. Swap deadline: 5 minutes."}
          </p>
          {!ctx.account && (
            <p className="hint">
              Connect a wallet to review approvals and swap.
            </p>
          )}
          {step && (
            <TxAction
              ctx={ctx}
              id="swap"
              label={step.label}
              disabled={expired || completed}
              validate={() => {
                if (
                  !quoted ||
                  !isCurrent(quoted.request) ||
                  Date.now() - quote.created > 60_000
                )
                  throw Error(
                    "Trade changed or quote expired. Get a new quote before signing.",
                  );
              }}
              getTransaction={async () => {
                const fresh = await nextSwapStep(
                  ctx.reader,
                  ctx.runtime,
                  quote,
                  ctx.account!,
                );
                if (
                  !quoted ||
                  !isCurrent(quoted.request) ||
                  fresh.label !== step.label
                )
                  throw Error(
                    "Approval status changed. Get a new quote to review the next step.",
                  );
                return fresh.tx;
              }}
              onConfirmed={() => {
                if (!quoted || !isCurrent(quoted.request)) return;
                if (step.final) {
                  setCompleted(true);
                } else void updateStep(quote, quoted.request);
              }}
              hint={
                step.final
                  ? `Swap ${amount(quote.amountIn, quote.inputDecimals)} ${quote.inputSymbol} for at least ${amount(quote.minOut, quote.outputDecimals)} ${quote.outputSymbol}.`
                  : "Exact-amount permission only. Each approval is a separate transaction; then refresh the quote if it expires."
              }
            />
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <a
        className="standalone-link"
        href={`${ctx.runtime.deployment.network.explorer}/address/${ctx.runtime.deployment.network.uniswapV4.poolManager}`}
        target="_blank"
        rel="noreferrer"
      >
        View configured pool manager <ExternalLink size={14} />
      </a>
    </section>
  );
}
