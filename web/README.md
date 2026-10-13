# PONZIRAMID website

The desert-noir frontend for the existing Ethereum deployment. `dist/` is the production static export; no contracts, addresses, token supply or on-chain deployments are changed. The network publisher replaces the existing site's export after review.

## Install, rebuild and preview

Use Node 22.12+ and npm. From the repository root:

```sh
npm ci --prefix web
npm ci --prefix web/addons --legacy-peer-deps
npm run typecheck --prefix web
npm run build --prefix web
npm run verify --prefix web
node web/scripts/preview.mjs 4173
```

Open `http://127.0.0.1:4173/preview/`. This serves the actual production export at a subpath. `npm run dev --prefix web` builds its deployment assets first, then starts Vite. All runtime assets are bundled locally and the unchanged Vite configuration uses `base: './'`. Publish the entire `dist/` directory with a trailing-slash entrypoint; no server routing, backend or secret configuration is needed.

The existing `web/package.json`, `web/package-lock.json`, TypeScript/Vite configuration and contract dependencies are preserved. New wallet/UI dependencies have their own manifest and lockfile in `web/addons/`. **Use `--legacy-peer-deps` for that second install** so Radix shares the parent's existing React instance. Installing a second React instance breaks hooks. No registry mirror or package archive is required or included. Once both lockfiles have been installed, the build/typecheck use no network.

The exporter reads ABIs with `git show` at source commit `e7a3968e3b4f655cc70d4d2ad6b67fc5c41f5f1f`, so a full clone must retain that commit. It verifies both attested canonical ABI hashes, preserves the handoff's addresses/network/pool key, copies all four ABI files and SHA-256 hashes the final export. The runtime verifies those assets, mainnet chain ID, deployed code and child contract bindings before enabling writes. `npm run verify --prefix web` checks the export without changing it.

## Wallets and actions

- One Connect control opens a shadcn-style Radix Dialog. EIP-6963/injected Rabby, MetaMask and other injected wallets appear when installed. WalletConnect uses the supplied public Reown project ID `3947504ee7f39ad210074c117aa8784c`, a lazy-loaded Universal Provider and a locally rendered QR code. The public project ID is not a private credential. The allowlisted site origin is `https://ponziram.sites.imd.fun`.
- The connected chip shows a deterministic blockie, shortened address, ETH balance and network badge. Its menu copies the address, opens Etherscan or disconnects. Wrong-network actions use the exact handoff's add/switch parameters.
- Connecting automatically indexes **all** `BrickPlaced(player)` events from the deployment block across all rounds. Requests start at 5,000 blocks and shrink on provider refusals. Recent 12-block overlaps are replaced, IDs are deduplicated and every brick's ownership/deposit/earnings and finished-round rewards are reread. The UI marks discovery incomplete on failure and offers Retry; it never represents a partial scan as a complete total. No ID input or manual scan continuation is needed. Eight bricks appear per list page; totals include the entire completed scan.
- Stone Withdraw queues each eligible vault refund after showing the early-exit consequences. ETH Claim all queues `claimBrickETH` per eligible brick, then `claimETH` for credited prizes/fees. PONZIRAM Claim all queues `claim(roundId, recipient)` for finished owned rounds. Each queue rereads eligibility, simulates each action, checks the current wallet/network, waits for a receipt and shows progress. An eligible zero-value diamond settlement is retained with a gas warning. Alternate nonzero recipients remain supported.
- Rejection stops the queue without skipping an item. Stop pauses after the current transaction. An unknown receipt locks writes and offers a receipt-only check; the queue can be tucked away and resumed without resubmission. Confirmed receipts remain in the session history. Browser reloads do not preserve an unfinished queue; review the wallet/explorer before initiating another pending action after reload.
- Build uses integer amounts, a fresh round/price check and simulation. Pause, funding, round expiry, cooldown, consecutive Pharaoh and balance gates are retained. Anyone can finalize an expired round. Owner pause controls and irreversible reward funding remain inside collapsed Transparency.
- The existing Uniswap v4 trade path is retained: fresh quotes, bounded slippage, minimum received, 60-second quote lifetime, five-minute deadline, token/Permit2 approval steps and simulation. A quoted amount is rounded for display; its exact value can be opened and copied. User-entered transaction amounts are never rounded internally.

## Live data and display

Public endpoints come only from the unchanged handoff, with a correctly connected wallet as fallback. Snapshots poll every five seconds while visible; failed or 45-second-old reads disable writes. Live activity reads the most recent 64 blocks to keep event payloads bounded. It never substitutes example players or random activity.

The pyramid is a complete eight-tier outline filled bottom-up, with up to 36 individually selectable bricks per page. It follows the latest page, including the Pharaoh, until you browse another page; Latest restores following. Yours glow gold, withdrawals have cracks, and the last brick has a pausable crown. Each selection opens a Sheet with live details. Historical wallet bricks remain accessible through the automatic list.

ETH displays at most four decimal places; nonzero amounts below that precision display `<0.0001`, not zero. PONZIRAM uses compact two-decimal units. Hover, focus or tap opens exact values with Copy; Arrow Down moves keyboard focus into an amount's copy control and Escape returns. All transaction arguments retain exact bigint precision. Timers use `HH:MM:SS`; addresses are shortened with full value, Copy and Etherscan access.

Obsidian is the default theme, Sun Club the light option. The mobile bottom bar occupies its own viewport row while the page scrolls above it. It cannot cover Build or Rewards. Original generated artwork, fonts and the share card are local. Regenerate the share image with `node web/scripts/generate-share.mjs` after installing Chromium, then rebuild.

## Checks

```sh
npm test --prefix web
web/node_modules/.bin/tsx --test web/tests/revamp-core.test.ts
# Install browser binaries/system libraries on a normal development machine:
cd web
npx playwright install --with-deps chromium webkit
cd ..
RUN_WEBKIT=1 node web/tests/revamp.mjs
node web/tests/walletconnect.mjs
# Optional worker-side live reads through a supplied public/worker RPC:
LOCAL_RPC=<supplied-endpoint> node web/tests/revamp-live.mjs
```

`npm run test:browser --prefix web` runs this current suite; `npm run test:revision --prefix web` runs its focused transaction/network regressions. The former layout’s selectors have been retired. It uses deterministic RPC and EIP-1193 fixtures, never keys or real signing. It checks mobile/desktop layout, dialogs, automatic multi-round discovery, exact quotes/build encoding, refunds, ETH/token queues, rejected requests, wrong network, simulation failures, account changes, pending receipts, zero-value settlements, both themes, reduced motion and automated accessibility. WebKit independently exercises connection, discovery and the ETH queue.

See [current validation and screenshots](../docs/REVAMP_VALIDATION.md), [design system](../DESIGN.md) and [machine results](../docs/revamp-evidence/interaction-results.json). Live chain reads and WalletConnect QR/relay creation were checked separately. **No real signing wallet was available; no mainnet build, withdrawal, claim, funding or swap was signed or broadcast.** Physical devices, hardware-wallet UX, manual screen readers and actual paired mobile-wallet sessions remain untested. The publisher, not this worker, updates the URL.
