import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Crown,
  ArrowUpRight,
  RefreshCw,
  Layers3,
  ShieldCheck,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { zeroAddress, type Hex } from "viem";
import { useGame, useRuntime, useWallet } from "./hooks";
import { buildReason, read, same, type Brick } from "./chain";
import { amount, countdown, shortAmount } from "./format";
import { Button } from "./components/ui/button";
import {
  AddressView,
  Stat,
  TxAction,
  type ActionContext,
} from "./components/common";
import { Pyramid } from "./components/Pyramid";
import { WalletPanel } from "./components/WalletPanel";
import { FundingPanel } from "./components/FundingPanel";
import { SwapPanel } from "./components/SwapPanel";
function Game() {
  const [transactions, setTransactions] = useState<
    { id: string; label: string; stage: string; hash: Hex }[]
  >([]);
  const recordTransaction = useCallback(
    (id: string, label: string, stage: string, hash: Hex) =>
      setTransactions((prev) =>
        [
          { id, label, stage, hash },
          ...prev.filter((t) => t.hash !== hash),
        ].slice(0, 6),
      ),
    [],
  );
  const { runtime, error: configError } = useRuntime();
  const wallet = useWallet(runtime);
  const correctChain = wallet.chainId === runtime?.deployment.chainId;
  const game = useGame(
    runtime,
    correctChain ? wallet.provider : undefined,
    wallet.account,
  );
  const s = game.snapshot;
  const [busy, setBusy] = useState(""),
    [now, setNow] = useState(Date.now()),
    [withdrawn, setWithdrawn] = useState<Set<number>>(new Set()),
    [sceneError, setSceneError] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let active = true;
    setWithdrawn(new Set());
    setSceneError(false);
    if (!s || !runtime || !game.reader || s.round.placedBricks === 0n) return;
    const first = s.brickCount - s.round.placedBricks + 1n;
    const count = Number(
      s.round.placedBricks > 204n ? 204n : s.round.placedBricks,
    );
    Promise.all(
      Array.from({ length: count }, (_, i) =>
        read<Brick>(
          game.reader!,
          runtime.game,
          runtime.abis.Ponziramid,
          "bricks",
          [first + BigInt(i)],
          s.block,
        ),
      ),
    )
      .then((bricks) => {
        if (active)
          setWithdrawn(
            new Set(
              bricks
                .filter((b) => b.withdrawn)
                .map((b) => Number(b.indexInRound)),
            ),
          );
      })
      .catch(() => {
        if (active) setSceneError(true);
      });
    return () => {
      active = false;
    };
  }, [s?.block, s?.round.placedBricks, game.reader, runtime]);
  const chainNow = s
    ? s.timestamp + BigInt(Math.max(0, Math.floor((now - s.loadedAt) / 1000)))
    : 0n;
  const stale = !!s && now - s.loadedAt > 45_000;
  const unavailable = !!game.error || stale;
  const reason = buildReason(s, wallet.account, chainNow);
  const expired =
    !!s &&
    s.roundId > 0n &&
    !s.round.finalized &&
    chainNow >= s.round.expiresAt;
  const ctx = useMemo<ActionContext | undefined>(
    () =>
      runtime && game.reader
        ? {
            runtime,
            reader: game.reader,
            provider: wallet.provider,
            account: wallet.account,
            ready:
              !!wallet.account &&
              correctChain &&
              game.verified &&
              !!s &&
              !unavailable,
            busy,
            setBusy,
            refresh: game.refresh,
            recordTransaction,
          }
        : undefined,
    [
      runtime,
      game.reader,
      wallet.provider,
      wallet.account,
      correctChain,
      game.verified,
      s,
      unavailable,
      busy,
      game.refresh,
      recordTransaction,
    ],
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to game
      </a>
      <header className="site-header">
        <a href="#main" className="brand" aria-label="PONZIRAMID home">
          <svg viewBox="0 0 36 32" aria-hidden="true">
            <path d="m2 29 16-27 16 27Z" fill="currentColor" />
            <path d="M18 2v27h16" fill="#a7713d" />
            <path d="M7 21h22M12 12h12" stroke="#171815" strokeWidth="1.5" />
          </svg>
          <span>PONZIRAMID</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#your-stone">Your Stone</a>
          <a href="#funding">Reward pool</a>
          <a href="#rules">How to play</a>
        </nav>
        <div className="wallet-control">
          {wallet.options.length > 1 && (
            <select
              aria-label="Choose wallet"
              value={wallet.selected}
              onChange={(e) => wallet.setSelected(Number(e.target.value))}
            >
              {wallet.options.map((o, i) => (
                <option value={i} key={i}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          <Button
            className="wallet-button"
            disabled={wallet.busy || !!busy}
            onClick={() =>
              wallet.account ? wallet.disconnect() : void wallet.connect()
            }
          >
            {wallet.busy
              ? "Opening wallet…"
              : wallet.account
                ? "Disconnect wallet"
                : "Connect wallet"}
            <ArrowUpRight size={16} />
          </Button>
        </div>
      </header>
      <main id="main">
        <div className="game-header">
          <div>
            <h1>Build your brick.</h1>
            <p>An on-chain pyramid. A crown on borrowed time.</p>
          </div>
          <div className="network-label">
            <span
              className={`status-dot ${s && !unavailable ? "online" : ""}`}
              aria-hidden="true"
            />
            {runtime?.deployment.network.name || "Connecting"} ·{" "}
            {s && !unavailable
              ? "Live on chain"
              : game.loading
                ? "Reading chain"
                : "Read unavailable"}
          </div>
        </div>
        {configError && (
          <div className="error banner" role="alert">
            {configError}
            <Button onClick={() => location.reload()}>Reload deployment</Button>
          </div>
        )}
        {wallet.error && (
          <p className="error banner" role="alert">
            {wallet.error}
          </p>
        )}
        {wallet.account && !correctChain && (
          <div className="network-warning" role="status">
            <span>
              Wrong network. Connect to {runtime?.deployment.network.name} to
              transact.
            </span>
            <Button
              disabled={wallet.busy}
              onClick={() => void wallet.switchChain()}
            >
              Switch to {runtime?.deployment.network.name}
            </Button>
          </div>
        )}
        <section className="arena" aria-label="Pyramid game">
          <div className="scene-column">
            <div className="round-line">
              <span>
                {s
                  ? s.roundId === 0n
                    ? "First round awaits"
                    : `Round ${s.roundId.toString()}`
                  : "Round unavailable"}
              </span>
              <span>
                {s
                  ? s.paused
                    ? "Building paused"
                    : s.roundId === 0n
                      ? "Awaiting first brick"
                      : s.round.finalized
                        ? "Finalized"
                        : expired
                          ? "Ready to finalize"
                          : "Round open"
                  : "Watching without a wallet"}
              </span>
            </div>
            <Pyramid
              count={s?.round.placedBricks}
              withdrawn={withdrawn}
              loading={game.loading && !s}
              statusesUnavailable={sceneError}
            />
            {sceneError && (
              <p className="error scene-error" role="status">
                Brick statuses unavailable. Refresh to retry.
              </p>
            )}
            <div className="pharaoh-line">
              <Crown size={19} />
              <span>Pharaoh</span>
              {s && s.round.pharaoh !== zeroAddress ? (
                <AddressView
                  address={s.round.pharaoh}
                  explorer={runtime!.deployment.network.explorer}
                />
              ) : (
                <strong>{s ? "The next builder" : "Unconfirmed"}</strong>
              )}
            </div>
          </div>
          <div className="build-column">
            <div className="timer-block">
              <span>Time until the crown settles</span>
              <div
                className="timer"
                role="timer"
                aria-live="off"
                aria-label="Time remaining"
              >
                {s
                  ? s.roundId === 0n
                    ? "Not started"
                    : s.round.finalized
                      ? "Round ended"
                      : countdown(s.round.expiresAt, chainNow)
                  : "--:--:--"}
              </div>
              <span className="hint">
                Each brick resets 24h · Maximum 7 days
              </span>
            </div>
            <dl className="stats two arena-stats">
              <Stat
                label={s?.round.finalized ? "Tomb allocated" : "ETH Tomb"}
                value={shortAmount(s?.round.tomb)}
                unit="ETH"
                detail={
                  s && (
                    <span title={amount(s.round.tomb)}>
                      Exact: {amount(s.round.tomb)} ETH
                    </span>
                  )
                }
              />
              <Stat
                label="PONZI per round"
                value={shortAmount(s?.roundReward, s?.decimals)}
                detail={s?.symbol || "Token rewards"}
              />
            </dl>
            <div className="build-terms">
              <div className="price-line">
                <h2>Your next brick</h2>
                <strong>
                  {amount(s?.quote[1])} <span>ETH</span>
                </strong>
              </div>
              <dl className="compact-dl">
                <div>
                  <dt>
                    <span className="stone-mark" />
                    Stone <span className="muted">· refundable</span>
                  </dt>
                  <dd>{amount(s?.quote[2])} ETH</dd>
                </div>
                <div>
                  <dt>
                    <span className="mortar-mark" />
                    Mortar <span className="muted">· not refundable</span>
                  </dt>
                  <dd>{amount(s?.quote[3])} ETH</dd>
                </div>
              </dl>
              <p className="hint">Gas is additional and not refundable.</p>
              {!wallet.account ? (
                <Button
                  className="main-action"
                  variant="default"
                  disabled={wallet.busy}
                  onClick={() => void wallet.connect()}
                >
                  Connect wallet to build <Layers3 size={18} />
                </Button>
              ) : !correctChain ? (
                <Button
                  className="main-action"
                  variant="default"
                  disabled={wallet.busy}
                  onClick={() => void wallet.switchChain()}
                >
                  Switch to {runtime?.deployment.network.name}
                </Button>
              ) : (
                ctx && (
                  <TxAction
                    ctx={ctx}
                    id="build"
                    label="Build a brick"
                    primary
                    disabled={!!reason}
                    getTransaction={async () => {
                      const q = await read<
                        readonly [bigint, bigint, bigint, bigint]
                      >(
                        ctx.reader,
                        runtime!.game,
                        runtime!.abis.Ponziramid,
                        "quote",
                      );
                      if (q[0] !== s!.quote[0] || q[1] !== s!.quote[1]) {
                        void game.refresh();
                        throw Error(
                          "The price or round changed. Review the refreshed quote before building.",
                        );
                      }
                      return {
                        address: runtime!.game,
                        abi: runtime!.abis.Ponziramid,
                        functionName: "build",
                        args: [q[0], q[1]],
                        value: q[1],
                      };
                    }}
                  />
                )
              )}
              <p className="build-reason" role="status">
                {unavailable
                  ? "Live state unavailable. Refresh to verify before building."
                  : reason ||
                    "One brick per wallet per minute. No consecutive Pharaoh builds."}
              </p>
              {s && s.roundId > 0n && ctx && (
                <TxAction
                  ctx={ctx}
                  id="finalize"
                  label="Finalize round"
                  disabled={!expired}
                  getTransaction={() => ({
                    address: runtime!.game,
                    abi: runtime!.abis.Ponziramid,
                    functionName: "finalize",
                  })}
                  hint="Anyone can finalize. This allocates the prizes; players claim separately."
                />
              )}
            </div>
          </div>
        </section>
        <p className="game-disclaimer">
          A game. 90% of every brick is refundable, 10% is not. Prizes come from
          other players' fees. Not an investment.
        </p>
        <div className="sync-line">
          <span>
            {s
              ? `Read at block ${s.block.toLocaleString()}${stale ? " · stale" : ""}`
              : "No chain values are being assumed."}
          </span>
          <Button
            variant="ghost"
            disabled={game.loading}
            onClick={() => void game.refresh()}
          >
            <RefreshCw size={15} />
            {game.loading ? "Reading…" : "Refresh state"}
          </Button>
        </div>
        {transactions.length > 0 && (
          <aside className="transaction-feed" aria-label="Recent transactions">
            <h2>Recent transactions</h2>
            <ul>
              {transactions.map((t) => (
                <li key={t.hash}>
                  <span>
                    {t.label}: {t.stage.toLowerCase()}.
                  </span>{" "}
                  <a
                    href={`${runtime!.deployment.network.explorer}/tx/${t.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View receipt <ExternalLink size={14} />
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}
        {game.error && (
          <p className="error rpc-error" role="alert">
            Live reads unavailable. {game.error} Retry, or connect a wallet on{" "}
            {runtime?.deployment.network.name} to use its provider.
          </p>
        )}
        {ctx && (
          <>
            <div className="content-grid">
              <WalletPanel
                ctx={ctx}
                s={s}
                connect={() => void wallet.connect()}
              />
              <FundingPanel ctx={ctx} s={s} creatorError={game.creatorError} />
            </div>
            <div className="content-grid">
              <SwapPanel ctx={ctx} s={s} />
              <section id="rules" className="panel rules">
                <div className="section-title">
                  <h2>The rules are set in stone.</h2>
                  <Layers3 size={22} />
                </div>
                <details open>
                  <summary>
                    Build, earn, outlast <ChevronDown size={16} />
                  </summary>
                  <p>
                    The first brick costs 0.001 ETH. Each placed brick raises
                    the next price by 0.5%, using the contract’s integer
                    arithmetic. The latest builder becomes Pharaoh.
                  </p>
                  <p>
                    Of each brick’s 10% Mortar: 50% goes equally to earlier
                    active bricks, 40% to the Tomb and 10% to the owner.
                    Unallocated fractions follow the contract’s rounding rules.
                  </p>
                </details>
                <details>
                  <summary>
                    When the clock runs out <ChevronDown size={16} />
                  </summary>
                  <p>
                    Anyone can finalize. The Tomb allocates 40% to Pharaoh, 40%
                    to eligible bricks in proportion to Stone, and 20% to the
                    next round. Players claim their prizes.
                  </p>
                  <p>
                    Each funded round reserves 1,000,000 PONZI rewards: 30% to
                    Pharaoh and 70% equally to distinct participants. Pharaoh
                    also gets a participation share. The on-chain symbol is
                    PONZIRAM.
                  </p>
                </details>
                <details>
                  <summary>
                    Withdraw whenever you want <ChevronDown size={16} />
                  </summary>
                  <p>
                    Stone is 90% of your brick’s price, held in a separate,
                    non-upgradeable vault. Withdraw it at any time, even during
                    a pause, without settlement or new deposits.
                  </p>
                  <p>
                    Before expiry, a withdrawal stops that brick earning, keeps
                    earned ETH, forfeits its diamond share and subtracts 10
                    minutes. At or after expiry, its diamond eligibility is
                    frozen. Participation token claims remain eligible. Failed
                    transfers preserve credit.
                  </p>
                </details>
                <details>
                  <summary>
                    Understand the game’s risks <ChevronDown size={16} />
                  </summary>
                  <p>
                    Multiple wallets, bots and transaction ordering can
                    influence results. A coordinated bank run can end the round
                    quickly. This game does not promise bot-proof fairness,
                    profit or token value.
                  </p>
                  <p>
                    The owner can pause building while the timer continues. An
                    owner who builds then pauses can prevent challengers and win
                    rewards. Refunds, claims and finalization stay open. The
                    owner cannot withdraw anyone else’s Stone or permanent token
                    funding.
                  </p>
                </details>
                <div className="trust-line">
                  <ShieldCheck size={18} />
                  <span>Stone never pays prizes. Only Mortar does.</span>
                </div>
              </section>
            </div>
            <section className="panel verification">
              <h2>Verify the contracts</h2>
              <p className="muted">
                Configuration and ABIs load from this export’s deployment
                manifest. Child contracts are discovered from immutable game
                getters.
              </p>
              <div className="contract-grid">
                {runtime!.deployment.contracts.map((c) => (
                  <AddressView
                    key={c.name}
                    address={c.address}
                    explorer={runtime!.deployment.network.explorer}
                    label={c.name}
                  />
                ))}
                {s && (
                  <>
                    <AddressView
                      address={s.vault}
                      explorer={runtime!.deployment.network.explorer}
                      label="StoneVault"
                    />
                    <AddressView
                      address={s.rewards}
                      explorer={runtime!.deployment.network.explorer}
                      label="PonziRewards"
                    />
                    <AddressView
                      address={s.owner}
                      explorer={runtime!.deployment.network.explorer}
                      label="Game owner"
                    />
                  </>
                )}
              </div>
              <dl className="stats two">
                <Stat
                  label="Vault ETH backing"
                  value={amount(s?.vaultBalance)}
                  unit="ETH"
                />
                <Stat
                  label="Total refundable Stone"
                  value={amount(s?.totalStone)}
                  unit="ETH"
                />
              </dl>
              <p
                className={
                  s && s.vaultBalance >= s.totalStone ? "success" : "muted"
                }
              >
                {s
                  ? s.vaultBalance >= s.totalStone
                    ? "Vault backing covers its Stone ledger."
                    : "Vault backing is below its Stone ledger. Verify on the explorer."
                  : "Vault solvency read unavailable."}
              </p>
              <div className="links-row">
                <a href="./imd-deployment.json">
                  Deployment manifest <ExternalLink size={14} />
                </a>
                <a
                  href={`${runtime!.deployment.network.explorer}/tx/${runtime!.deploymentTx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Deployment receipt <ExternalLink size={14} />
                </a>
              </div>
              {s && same(wallet.account, s.owner) && (
                <details className="disclosure">
                  <summary>Owner controls</summary>
                  <p>
                    Pausing stops new builds only. The timer, refunds, claims
                    and finalization continue.
                  </p>
                  <TxAction
                    ctx={ctx}
                    id="pause"
                    label={s.paused ? "Resume building" : "Pause building"}
                    getTransaction={() => ({
                      address: runtime!.game,
                      abi: runtime!.abis.Ponziramid,
                      functionName: "setPaused",
                      args: [!s.paused],
                    })}
                  />
                </details>
              )}
            </section>
          </>
        )}
      </main>
      <footer>
        <a href="#main" className="footer-brand">
          PONZIRAMID
        </a>
        <span>Built on chain. Played at your own risk.</span>
        <a href="#rules">
          Read the rules <ArrowUpRight size={14} />
        </a>
      </footer>
    </>
  );
}
export default function App() {
  return <Game />;
}
