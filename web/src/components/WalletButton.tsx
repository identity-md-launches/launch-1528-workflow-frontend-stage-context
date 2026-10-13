import {
  Wallet,
  ChevronDown,
  ExternalLink,
  LogOut,
  Wifi,
  ArrowUpRight,
} from "lucide-react";
import type { useWallet } from "../hooks";
import type { Snapshot } from "../chain";
import { shortAddress, shortAmount } from "../format";
import { Button } from "./ui/button";
import { Dialog, DropdownMenu as M } from "./ui/overlays";
import { Amount, CopyButton } from "./common";
export function Blockie({ address }: { address: string }) {
  let seed = 0;
  for (const c of address.toLowerCase())
    seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const cells = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      if (seed % 3) {
        cells.push(
          <rect key={`${x}-${y}`} x={x * 5} y={y * 5} width="5" height="5" />,
        );
        if (x !== 2)
          cells.push(
            <rect
              key={`${4 - x}-${y}`}
              x={(4 - x) * 5}
              y={y * 5}
              width="5"
              height="5"
            />,
          );
      }
    }
  return (
    <svg viewBox="0 0 25 25" className="blockie" aria-hidden="true">
      {cells}
    </svg>
  );
}
export function WalletButton({
  wallet,
  s,
  explorer,
  locked,
}: {
  wallet: ReturnType<typeof useWallet>;
  s?: Snapshot;
  explorer: string;
  locked: boolean;
}) {
  return (
    <>
      {wallet.account ? (
        <M.Root>
          <M.Trigger asChild>
            <Button className="wallet-chip" disabled={locked}>
              <Blockie address={wallet.account} />
              <span className="wallet-chip-address">
                {shortAddress(wallet.account)}
              </span>
              <span className="wallet-chip-balance">
                {shortAmount(s?.balance)} ETH
              </span>
              <span
                className="network-badge"
                aria-label={
                  wallet.chainId === 1 ? "Ethereum network" : "Wrong network"
                }
              >
                {wallet.chainId === 1 ? "Ethereum" : "Switch"}
              </span>
              <ChevronDown size={14} />
            </Button>
          </M.Trigger>
          <M.Portal>
            <M.Content className="wallet-menu" sideOffset={10} align="end">
              <div className="wallet-summary">
                <strong>Connected wallet</strong>
                <Amount value={s?.balance} />
                <span className="hint">
                  {wallet.chainId === 1 ? "Ethereum mainnet" : "Wrong network"}
                </span>
              </div>
              <M.Item
                className="menu-item"
                onSelect={() =>
                  void navigator.clipboard
                    .writeText(wallet.account!)
                    .catch(() => wallet.setOpen(true))
                }
              >
                Copy address
              </M.Item>
              <M.Item asChild>
                <a
                  className="menu-item"
                  href={`${explorer}/address/${wallet.account}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Etherscan <ExternalLink size={16} />
                </a>
              </M.Item>
              <M.Item
                className="menu-item"
                onSelect={() => void wallet.disconnect()}
              >
                Disconnect <LogOut size={16} />
              </M.Item>
            </M.Content>
          </M.Portal>
        </M.Root>
      ) : (
        <Button className="wallet-button" onClick={() => wallet.setOpen(true)}>
          <Wallet size={16} />
          Connect
        </Button>
      )}
      <Dialog
        open={wallet.open}
        onOpenChange={wallet.setOpen}
        title="gm, Pharaoh."
        description="Choose a wallet to enter the pyramid."
      >
        <div className="wallet-options">
          {wallet.options.map((o, i) => (
            <Button
              key={i}
              disabled={wallet.busy}
              onClick={() => void wallet.connect(o.provider)}
            >
              <span className="wallet-glyph">
                <Wallet size={22} />
              </span>
              <span>
                {o.name}
                <small>Installed</small>
              </span>
              <ArrowUpRight size={18} />
            </Button>
          ))}
          {!wallet.options.length && (
            <p className="hint">
              Rabby and MetaMask appear here when installed. On mobile, use
              WalletConnect.
            </p>
          )}
          <Button
            disabled={wallet.busy}
            onClick={() => void wallet.connectWC()}
          >
            <span className="wallet-glyph wc">
              <Wifi size={24} />
            </span>
            <span>
              WalletConnect<small>Scan with your mobile wallet</small>
            </span>
            <ArrowUpRight size={18} />
          </Button>
        </div>
        {wallet.busy && (
          <p role="status">
            {wallet.uri ? "Scan to approve the connection." : "Opening wallet…"}
          </p>
        )}
        {wallet.qr && (
          <div className="qr-wrap">
            <img
              src={wallet.qr}
              alt="WalletConnect pairing QR code"
              width="288"
              height="288"
            />
            <div className="row-between">
              <a href={wallet.uri}>Open in wallet</a>
              <CopyButton value={wallet.uri} label="Copy pairing link" />
            </div>
          </div>
        )}
        {wallet.error && (
          <p className="error" role="alert">
            {wallet.error}
          </p>
        )}
        <p className="wallet-note">
          Connecting does not move funds. Every action needs your approval.
        </p>
      </Dialog>
    </>
  );
}
