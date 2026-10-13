import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Amount, AddressView, TxAction, type ActionContext } from "./common";
import { read, same, type Snapshot } from "../chain";
import { amount, parseAmount } from "../format";
import { Button } from "./ui/button";
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
    [accepted, setAccepted] = useState(false);
  let n = 0n;
  try {
    n = parseAmount(value, s?.decimals);
  } catch {
    /* Label supplies valid input guidance. */
  }
  const approvalNeeded = n > 0n && (s?.fundAllowance || 0n) < n;
  return (
    <details id="funding">
      <summary>
        Reward funding{" "}
        <span className="status-chip">
          {s ? (s.funded ? "Funded" : "Not funded") : "Reading"}
        </span>
        <ChevronDown size={16} />
      </summary>
      <p className="hint">
        Initial gate: <Amount value={s?.initialFunding} unit="PONZIRAM" />. New
        rounds reserve 1M each.
      </p>
      {s?.creator && (
        <>
          <AddressView
            address={s.creator}
            explorer={ctx.runtime.deployment.network.explorer}
            label="Creator allocation recipient"
          />
          <p>
            Creator balance: <Amount value={s.creatorBalance} unit="PONZIRAM" />
          </p>
        </>
      )}
      {creatorError && (
        <p className="hint">
          Creator allocation could not be verified. Refresh the page to retry.
        </p>
      )}
      <p className="hint">
        Funding is permanent and cannot be withdrawn. Anyone can donate; the
        creator should deposit their full balance.
      </p>
      <label htmlFor="fund-amount">PONZIRAM to donate</label>
      <div className="input-row">
        <input
          id="fund-amount"
          value={value}
          inputMode="decimal"
          placeholder="1000000"
          onChange={(e) => {
            setValue(e.target.value);
            setAccepted(false);
          }}
        />
        <Button
          disabled={!s?.tokenBalance}
          onClick={() => {
            setValue(amount(s?.tokenBalance));
            setAccepted(false);
          }}
        >
          Use full balance
        </Button>
      </div>
      {value && !n && <p className="error">Enter a positive token amount.</p>}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        I understand this donation is permanent.
      </label>
      <TxAction
        ctx={ctx}
        id="fund"
        label={approvalNeeded ? "Approve donation" : "Fund reward pool"}
        disabled={!n || !accepted || n > (s?.tokenBalance || 0n)}
        getTransaction={async () => {
          if (!s) throw Error("Wait for verified funding data.");
          if (same(ctx.account, s.creator) && !s.funded) {
            const full = await read<bigint>(
              ctx.reader,
              ctx.runtime.token,
              ctx.runtime.abis.LaunchToken,
              "balanceOf",
              [ctx.account!],
            );
            if (n !== full)
              throw Error(
                "The first creator deposit must use the full current token balance.",
              );
          }
          return approvalNeeded
            ? {
                address: ctx.runtime.token,
                abi: ctx.runtime.abis.LaunchToken,
                functionName: "approve",
                args: [s.rewards, n],
              }
            : {
                address: s.rewards,
                abi: ctx.runtime.abis.PonziRewards,
                functionName: "fund",
                args: [n],
              };
        }}
        hint="Approval and funding are separate transactions."
      />
    </details>
  );
}
