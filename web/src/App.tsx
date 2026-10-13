import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Crown,
  Layers3,
  Sun,
  Moon,
  RefreshCw,
  ChevronDown,
  ShieldCheck,
  ExternalLink,
  Gem,
} from "lucide-react";
import { zeroAddress, type Hex } from "viem";
import { useGame, useRuntime, useWallet } from "./hooks";
import { buildReason, read, same } from "./chain";
import { countdown, shortAmount } from "./format";
import { usePortfolio } from "./portfolio";
import { Button } from "./components/ui/button";
import {
  Amount,
  AddressView,
  Stat,
  TxAction,
  type ActionContext,
} from "./components/common";
import { WalletButton } from "./components/WalletButton";
import { Pyramid } from "./components/Pyramid";
import { Activity } from "./components/Activity";
import { BrickSheet } from "./components/BrickSheet";
import { RewardsCenter, claimCount } from "./components/RewardsCenter";
import { HowItWorks, Term } from "./components/HowItWorks";
import { FundingPanel } from "./components/FundingPanel";
import { SwapPanel } from "./components/SwapPanel";
function Logo() {
  return (
    <svg viewBox="0 0 36 32" aria-hidden="true">
      <path
        d="M3 29h30v-6H28v-6h-5v-6h-5V5h-1v6h-5v6H7v6H3Z"
        fill="currentColor"
      />
      <path
        d="M3 23h25M7 17h16M12 11h6M17 17v6M10 23v6M24 23v6"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="1.4"
      />
    </svg>
  );
}
export default function App() {
  const { runtime, error: configError } = useRuntime(),
    wallet = useWallet(runtime);
  const correctChain = wallet.chainId === runtime?.deployment.chainId;
  const game = useGame(
      runtime,
      correctChain ? wallet.provider : undefined,
      wallet.account,
    ),
    s = game.snapshot;
  const [busy, setBusy] = useState(""),
    [now, setNow] = useState(Date.now()),
    [selectedBrick, setSelectedBrick] = useState<bigint>();
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("ponziramid-theme") === "sun"
        ? "sun"
        : "obsidian";
    } catch {
      return "obsidian";
    }
  });
  const [transactions, setTransactions] = useState<
    { id: string; label: string; stage: string; hash: Hex }[]
  >([]);
  const recordTransaction = useCallback(
    (id: string, label: string, stage: string, hash: Hex, replaces?: Hex) =>
      setTransactions((prev) =>
        [
          { id, label, stage, hash },
          ...prev.filter((t) => t.hash !== hash && t.hash !== replaces),
        ].slice(0, 8),
      ),
    [],
  );
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("ponziramid-theme", theme);
    } catch {
      /* Theme works without storage. */
    }
  }, [theme]);
  const chainNow = s
    ? s.timestamp + BigInt(Math.max(0, Math.floor((now - s.loadedAt) / 1000)))
    : 0n;
  const stale = !!s && now - s.loadedAt > 45000,
    unavailable = !!game.error || stale;
  const reason = buildReason(s, wallet.account, chainNow);
  const expired =
    !!s &&
    s.roundId > 0n &&
    !s.round.finalized &&
    chainNow >= s.round.expiresAt;
  const portfolio = usePortfolio(game.reader, runtime, s, wallet.account);
  const ctx = useMemo<ActionContext | undefined>(
    () =>
      runtime && game.reader
        ? {
            runtime,
            reader: game.reader,
            provider: wallet.provider,
            account: wallet.account,
            chainId: wallet.chainId,
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
      wallet.chainId,
      correctChain,
      game.verified,
      s,
      unavailable,
      busy,
      game.refresh,
      recordTransaction,
    ],
  );
  const connect = () => wallet.setOpen(true);
  const status = s
    ? s.paused
      ? "Building paused"
      : s.roundId === 0n
        ? "First round awaits"
        : s.round.finalized
          ? "Round finalized"
          : expired
            ? "Ready to finalize"
            : "Round open"
    : "Reading Ethereum";
  return (
    <>
      <div className="page-scroll">
        <a className="skip-link" href="#main">
          Skip to game
        </a>
        <header className="site-header">
          <a className="brand" href="#main" aria-label="PONZIRAMID home">
            <Logo />
            <span>
              PONZIRAMID<span className="brand-dot">.</span>
            </span>
          </a>
          <nav aria-label="Main navigation">
            <a href="#build">The pyramid</a>
            <a href="#rewards">My rewards</a>
            <a href="#how-it-works">How it works</a>
            <a href="#trade">
              Trade <ArrowUpRight size={13} />
            </a>
          </nav>
          <div className="header-tools">
            <button
              className="theme-toggle icon-button"
              onClick={() => setTheme(theme === "sun" ? "obsidian" : "sun")}
              aria-label={
                theme === "sun"
                  ? "Switch to Obsidian dark theme"
                  : "Switch to Sun Club light theme"
              }
              title={theme === "sun" ? "Obsidian" : "Sun Club"}
            >
              {theme === "sun" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <WalletButton
              wallet={wallet}
              s={s}
              explorer={
                runtime?.deployment.network.explorer || "https://etherscan.io"
              }
              locked={!!busy}
            />
          </div>
        </header>
        <main id="main">
          <div className="hero-heading">
            <div>
              <h1>Build a brick.</h1>
              <p className="hero-accent">
                <em>Heavy is the crown.</em>
              </p>
              <p>An on-chain pyramid game. Last builder takes the throne.</p>
            </div>
            <div className="hero-aside">
              <span className="live-label">
                <i className={`live-dot ${unavailable ? "offline" : ""}`} />
                {unavailable ? "Read unavailable" : "Ethereum mainnet"}
              </span>
              <span className="hero-aside-note">
                A game of timing.
                <br />
                And questionable alliances.
              </span>
            </div>
          </div>
          {configError && (
            <div className="banner error" role="alert">
              {configError}
              <Button onClick={() => location.reload()}>Reload</Button>
            </div>
          )}
          {wallet.account && !correctChain && (
            <div className="banner network-warning" role="alert">
              <span>Wrong network. Switch to Ethereum to play.</span>
              <Button
                disabled={wallet.busy}
                onClick={() => void wallet.switchChain()}
              >
                Switch to Ethereum
              </Button>
            </div>
          )}
          {wallet.error && !wallet.open && (
            <p className="banner error" role="alert">
              {wallet.error}
            </p>
          )}
          <section
            id="build"
            className="arena"
            aria-label="Live pyramid and build"
          >
            <div className="status-strip">
              <span>
                <i className="live-dot" />
                <strong>Round {s ? s.roundId.toString() : "…"}</strong>
              </span>
              <span>
                <Layers3 size={15} />
                {s ? s.round.placedBricks.toLocaleString() : "…"} bricks
              </span>
              <span className="status-pharaoh">
                <Crown size={16} />
                {s && s.round.pharaoh !== zeroAddress ? (
                  <AddressView
                    address={s.round.pharaoh}
                    explorer={runtime!.deployment.network.explorer}
                  />
                ) : (
                  <span>No Pharaoh yet</span>
                )}
              </span>
              <span className="status-time" role="timer" aria-live="off">
                {s
                  ? s.roundId === 0n
                    ? "Not started"
                    : s.round.finalized
                      ? "Finalized"
                      : countdown(s.round.expiresAt, chainNow)
                  : "--:--:--"}
              </span>
              <span>
                Tomb <Amount value={s?.round.tomb} />
              </span>
              <span className="status-next">
                Next <Amount value={s?.quote[1]} />
              </span>
            </div>
            <div className="arena-body">
              <Pyramid
                s={s}
                runtime={runtime}
                reader={game.reader}
                account={wallet.account}
                onBrick={setSelectedBrick}
              />
              <div className="action-column">
                <div className="build-box">
                  <div className="build-title">
                    <h2>Make your move</h2>
                    <span className="status-chip">{status}</span>
                  </div>
                  <div className="next-price">
                    <span className="hint">Your next brick</span>
                    <Amount value={s?.quote[1]} />
                  </div>
                  <div className="build-breakdown">
                    <div>
                      <Term name="Stone" />
                      <strong>90% back to you</strong>
                      <Amount value={s?.quote[2]} />
                    </div>
                    <div>
                      <Term name="Mortar" />
                      <strong>10% fuels the game</strong>
                      <Amount value={s?.quote[3]} />
                    </div>
                  </div>
                  {!wallet.account ? (
                    <Button
                      variant="default"
                      className="main-action"
                      onClick={connect}
                    >
                      <Layers3 size={18} />
                      Build a brick <ArrowRight size={18} />
                    </Button>
                  ) : !correctChain ? (
                    <Button
                      variant="default"
                      className="main-action"
                      disabled={wallet.busy}
                      onClick={() => void wallet.switchChain()}
                    >
                      Switch to Ethereum <ArrowRight size={18} />
                    </Button>
                  ) : (
                    ctx && (
                      <TxAction
                        ctx={ctx}
                        id="build"
                        label={`Build · ${shortAmount(s?.quote[1])} ETH`}
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
                              "Price or round changed. Review the refreshed quote before building.",
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
                      ? "Live state unavailable. Refresh before building."
                      : reason?.replace(
                          "NOT FUNDED: the initial reward deposit is still required.",
                          "Waiting for the initial reward funding.",
                        ) || "Gas extra; 60s cooldown, no repeat turns."}
                  </p>
                  {expired && ctx && (
                    <TxAction
                      ctx={ctx}
                      id="finalize"
                      label="Finalize round"
                      getTransaction={() => ({
                        address: runtime!.game,
                        abi: runtime!.abis.Ponziramid,
                        functionName: "finalize",
                      })}
                      hint="Anyone can finalize, then players claim."
                    />
                  )}
                </div>
                <Activity runtime={runtime} reader={game.reader} s={s} />
              </div>
            </div>
          </section>
          <div className="under-arena">
            <p>
              90% refundable, 10% at risk; no profit promises.{" "}
              <a href="#rules">
                Know the rules <ArrowUpRight size={12} />
              </a>
            </p>
            <button
              className="text-button"
              disabled={game.loading}
              onClick={() => void game.refresh()}
            >
              <RefreshCw className={game.loading ? "spinner" : ""} size={13} />
              {s
                ? `Block ${s.block.toLocaleString()}${stale ? " · stale" : ""}`
                : "Refresh state"}
            </button>
          </div>
          {game.error && (
            <p className="banner error" role="alert">
              Live reads unavailable. {game.error} Use Refresh to retry.
            </p>
          )}
          {ctx ? (
            <>
              <RewardsCenter
                ctx={ctx}
                s={s}
                portfolio={portfolio}
                connect={connect}
                onBrick={setSelectedBrick}
              />
              {selectedBrick !== undefined && (
                <BrickSheet
                  id={selectedBrick}
                  onClose={() => setSelectedBrick(undefined)}
                  ctx={ctx}
                  s={s}
                />
              )}
            </>
          ) : (
            <section id="rewards" className="panel">
              <h2>Your rewards</h2>
              <p>Loading the verified game…</p>
            </section>
          )}
          {transactions.length > 0 && (
            <details className="transaction-history">
              <summary>
                Recent transactions{" "}
                <span className="count-badge">{transactions.length}</span>
                <ChevronDown size={16} />
              </summary>
              <ul>
                {transactions.map((t) => (
                  <li key={t.hash}>
                    <span>
                      {t.label} · {t.stage}
                    </span>
                    <a
                      href={`${runtime!.deployment.network.explorer}/tx/${t.hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Receipt <ExternalLink size={14} />
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <HowItWorks price={s?.quote[1]} />
          <div className="trade-section">
            <div className="trade-story">
              <span className="coin-symbol" aria-hidden="true">
                <Logo />
              </span>
              <h2>
                Keep a little
                <br /> <em>sand in your wallet.</em>
              </h2>
              <p>
                PONZIRAM is the game’s token.
                <br /> Trade it on the same Ethereum pool.
              </p>
              <a className="standalone-link" href="#transparency">
                Follow the money <ArrowUpRight size={16} />
              </a>
            </div>
            {ctx && <SwapPanel ctx={ctx} s={s} />}
          </div>
          <details id="transparency" className="transparency">
            <summary>
              <span>
                <ShieldCheck size={21} />
                <strong>Nothing kept in the shadows.</strong>
              </span>
              <span>
                Contracts & backing <ChevronDown size={18} />
              </span>
            </summary>
            <div className="transparency-body">
              <dl className="transparency-stats">
                <Stat
                  label="Reward pool"
                  value={<Amount value={s?.rewardBalance} unit="PONZIRAM" />}
                />
                <Stat
                  label="Reserved for rounds"
                  value={<Amount value={s?.committed} unit="PONZIRAM" />}
                />
                <Stat
                  label="Vault backing"
                  value={<Amount value={s?.vaultBalance} />}
                />
                <Stat
                  label="Refundable Stone"
                  value={<Amount value={s?.totalStone} />}
                />
              </dl>
              <p
                className={
                  s && s.vaultBalance >= s.totalStone ? "success" : "muted"
                }
              >
                {s
                  ? s.vaultBalance >= s.totalStone
                    ? "Vault backing covers all refundable Stone."
                    : "Vault backing is below its ledger. Verify on Etherscan."
                  : "Awaiting a verified vault read."}
              </p>
              <div className="contract-grid">
                {runtime?.deployment.contracts.map((c) => (
                  <AddressView
                    key={c.name}
                    label={c.name}
                    address={c.address}
                    explorer={runtime.deployment.network.explorer}
                  />
                ))}
                {s && runtime && (
                  <>
                    <AddressView
                      label="StoneVault"
                      address={s.vault}
                      explorer={runtime.deployment.network.explorer}
                    />
                    <AddressView
                      label="PonziRewards"
                      address={s.rewards}
                      explorer={runtime.deployment.network.explorer}
                    />
                    <AddressView
                      label="Game owner"
                      address={s.owner}
                      explorer={runtime.deployment.network.explorer}
                    />
                  </>
                )}
              </div>
              <div className="links-row">
                <a href="./imd-deployment.json">
                  Deployment manifest <ExternalLink size={14} />
                </a>
                {runtime && (
                  <a
                    href={`${runtime.deployment.network.explorer}/tx/${runtime.deploymentTx}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Deployment receipt <ExternalLink size={14} />
                  </a>
                )}
              </div>
              {ctx && (
                <FundingPanel
                  ctx={ctx}
                  s={s}
                  creatorError={game.creatorError}
                />
              )}{" "}
              {ctx && s && same(wallet.account, s.owner) && (
                <details>
                  <summary>
                    Owner controls <ChevronDown size={15} />
                  </summary>
                  <p>
                    Pausing stops builds. The clock, refunds, claims and
                    finalization continue.
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
            </div>
          </details>
        </main>
        <footer>
          <a className="brand" href="#main">
            <Logo />
            PONZIRAMID.
          </a>
          <span>touch sand responsibly</span>
          <a href="#rules">
            A game. Not an investment. <ArrowUpRight size={13} />
          </a>
        </footer>
      </div>
      <nav className="mobile-bar" aria-label="Quick actions">
        <a href="#build">
          <Layers3 size={19} />
          Build
        </a>
        <a href="#rewards">
          <Gem size={19} />
          Rewards{" "}
          <span className="count-badge">{claimCount(portfolio, s)}</span>
        </a>
      </nav>
    </>
  );
}
