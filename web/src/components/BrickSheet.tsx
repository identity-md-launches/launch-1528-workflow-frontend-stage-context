import { useEffect, useState } from "react";
import { Crown, Layers3 } from "lucide-react";
import { loadBrick, type OwnedBrick } from "../indexing";
import { errorText, same, type Snapshot } from "../chain";
import { Amount, AddressView, TxAction, type ActionContext } from "./common";
import { BrickStatus } from "./RewardsCenter";
import { Dialog } from "./ui/overlays";
export function BrickSheet({
  id,
  onClose,
  ctx,
  s,
}: {
  id?: bigint;
  onClose: () => void;
  ctx: ActionContext;
  s?: Snapshot;
}) {
  const [brick, setBrick] = useState<OwnedBrick>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setBrick((previous) => (previous?.id === id ? previous : undefined));
    setError("");
    if (id !== undefined && s)
      void loadBrick(ctx.reader, ctx.runtime, s.vault, id, s.block)
        .then((b) => {
          if (active) setBrick(b);
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    return () => {
      active = false;
    };
  }, [id, s?.block, ctx.reader, ctx.runtime]);
  return (
    <Dialog
      open={id !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Brick #${id ?? ""}`}
      description={
        brick
          ? `Round ${brick.roundId} · a little piece of the pyramid.`
          : "Reading verified brick details…"
      }
      sheet
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {brick && (
        <>
          <div className="sheet-brick" aria-hidden="true">
            {brick.isPharaoh ? <Crown size={54} /> : <Layers3 size={54} />}
          </div>
          <BrickStatus b={brick} />
          <AddressView
            label="Builder"
            address={brick.player}
            explorer={ctx.runtime.deployment.network.explorer}
          />
          <dl className="sheet-stats">
            <div>
              <dt>Stone held</dt>
              <dd>
                <Amount value={brick.deposit} />
              </dd>
            </div>
            <div>
              <dt>Dividends available</dt>
              <dd>
                <Amount value={brick.dividends} />
              </dd>
            </div>
            <div>
              <dt>Diamond available</dt>
              <dd>
                <Amount value={brick.diamond} />
              </dd>
            </div>
          </dl>
          {same(brick.player, ctx.account) && (
            <>
              <p className="hint">
                Before expiry, withdrawing stops dividends, forfeits diamond
                eligibility and removes 10 minutes. Mortar and gas are not
                refunded.
              </p>
              <TxAction
                ctx={ctx}
                id={`sheet-withdraw-${id}`}
                label="Withdraw this Stone"
                disabled={!brick.deposit}
                getTransaction={() => ({
                  address: s!.vault,
                  abi: ctx.runtime.abis.StoneVault,
                  functionName: "withdrawStone",
                  args: [id!, ctx.account!],
                })}
              />
              <a href="#rewards" className="standalone-link" onClick={onClose}>
                Collect earnings in Rewards →
              </a>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
