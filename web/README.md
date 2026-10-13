# PONZIRAMID frontend

A static React/TypeScript interface for the deployed PONZIRAMID game and its attested Uniswap v4 pool. Read-only watching works without a wallet. Transactions use the visitor’s browser wallet; there is no backend, private key, private RPC credential or WalletConnect project ID.

## Install, build and preview

Use Node 22.12+ or Node 24 (worker: 24.21.0). From the repository root:

```sh
npm ci --prefix web
npm run typecheck --prefix web
npm test --prefix web
npm run build --prefix web
npm run verify --prefix web
node web/scripts/preview.mjs 4173
```

Open `http://127.0.0.1:4173/preview/`. The preview serves the **production export** under a subpath. `npm run dev --prefix web` first builds the verified deployment assets, then starts Vite with hot reload. Its development middleware serves the same generated manifest and ABI files from `dist/`; it adds no separate deployment map. Use the production preview for final validation.

`web/vite.config.ts` uses `base: './'` and exports to repository-root `dist/`. Hash/anchor navigation requires no rewrites. Host the entire `dist/` directory, including `imd-deployment.json`, `abi/`, `launch-provenance.json`, favicon and share image, over HTTPS (or localhost during development). Preserve trailing-slash directory entrypoints on gateways.

## The deployment source of truth

`dist/imd-deployment.json` is the **only runtime address, network, pool-key and attested ABI map**. `src/config.ts` fetches it and the referenced ABI arrays. It checks each loaded asset’s SHA-256 and the attested ABIs’ canonical Keccak-256 before constructing clients. `src/protocol.ts` contains protocol function interfaces only; every protocol address comes from the manifest’s unchanged `network.uniswapV4` block.

Reproducible build inputs are retained in `web/deployment-handoff.json` and `web/network-handoff.json`. These are build inputs, not a second configuration imported by the app. After Vite exports, `scripts/export-manifest.mjs`:

1. Reads `docs/abi/<Contract>.json` with `git show` at the exact deployed source commit.
2. Verifies recursively key-sorted, compact JSON ABI Keccak hashes against the handoff for the exact two attested contracts.
3. Copies all four raw implementation-derived ABI arrays. StoneVault and PonziRewards remain discovered children, not extra attested contract entries.
4. Copies chain, launch, source and attestation identifiers, the complete contract set, pool key, network and wallet-add parameters unchanged.
5. Writes the deployment transaction/block provenance asset, without additional addresses or RPC endpoints.
6. Inventories and SHA-256 hashes every exported file except the manifest itself, enforcing the 128-asset and per-file limits.

A full Git clone must contain source commit `e7a3968e3b4f655cc70d4d2ad6b67fc5c41f5f1f`. A shallow clone must fetch that source commit before rebuilding. Do not hand-edit the export; rebuilding replaces it and regenerates its manifest. `npm run verify --prefix web` independently compares the existing export with the handoffs, pinned ABI bytes and every current asset byte.

## Reads, identity and wallet behavior

- The app checks RPC chain ID and nonempty code at the two attested contracts, discovers `vault()`, `rewards()` and `owner()`, then verifies child code and immutable `game()`/`token()` bindings. These are runtime integration checks, not a claim of a bytecode audit.
- Configured public RPCs are tried in order, with an injected-wallet provider fallback only on the selected chain. The app polls the block number every 5 seconds while visible and refreshes its snapshot when the block changes. A manual refresh and confirmed transaction force a new read. Values older than 45 seconds or failed reads disable transaction controls.
- EIP-6963 announced browser wallets and EIP-1193 injected wallets are supported. Unknown-chain error 4902 triggers the exact supplied `wallet_addEthereumChain` parameters and a second switch attempt. Account/chain events reset wallet-dependent state.
- The allocation recipient is verified from the successful pinned deployment receipt: a unique launch-token transfer from the deployment factory for at least `INITIAL_FUNDING`. The actual allocation contains 4,270 minor units of pool rounding remainder beyond 700 million tokens. The app reads that recipient’s current balance; it does not assume that game owner and allocation recipient are the same wallet.
- Funding receipts are indexed from the discovered reward pool’s `Funded` events. Scans are bounded to 5,000 blocks and overlap 12 blocks on refresh for recent reorgs. Manual continuation is available for old history. A direct token transfer is not mislabeled as a `fund()` receipt.
- Wallet brick history is explicitly scanned in 5,000-block pages from deployment; no browser-local leaderboard is presented as shared data. Direct brick-ID lookup works across rounds without scanning the entire history. Displayed brick ownership, principal and earnings are reread from contracts. Ten loaded bricks are shown per page.
- The SVG derives bottom-up courses from the confirmed count, expanding the base past 204. It draws all individual bricks through 650; above that, a grouped overview and a current page of up to 64 recent individual bricks keep every new placement visible. Group size and the exact detail range are disclosed in the scene and its accessible description at every width. Overview scale/course positions can reflow. SVG work is bounded to 714 slots, and withdrawal-status reads to 650 (64 in grouped mode), using exact bigint indices. Historical refunds remain available by ID or scan.

## Actions and safeguards

Build shows the exact quoted price, refundable Stone, non-refundable Mortar and separate gas warning. The app checks pause, expiry, initial funding/new-round reservation, cooldown, consecutive Pharaoh and balance. It rechecks the round and price before simulation; the contract’s expected arguments protect against a price race.

Stone withdrawals target **StoneVault**, with one whole-brick refund per transaction, even during a pause or after expiry. Brick ETH, credited ETH and per-round PONZI rewards have separate claim controls. An eligible finalized zero-wei diamond share can still be settled, with an explicit gas/zero-payout notice. Validated nonzero alternate recipients are supported. Owner-only pause/resume controls follow the live owner getter. Every write is simulated before wallet signing and remains locked through its receipt; submitted hashes remain in session transaction history. If receipt confirmation becomes unknown, a receipt-only retry is offered instead of resubmitting the action. A successful replacement confirms the action only when its destination, calldata and value still match the requested transaction. Cancellation and different replacements settle the original history entry and skip action-success callbacks; their receipt remains linked.

Permanent funding uses an exact ERC-20 approval and a separate `fund(amount)` transaction. The UI requires acknowledgment of irreversibility. The verified creator’s first deposit must use their entire current balance; donors may supply any positive affordable amount. No funding transaction was sent by this worker.

Trading uses the copied pool key, including its initialization hook. Quotes call `quoteExactInputSingle` with `simulateContract`. Swaps use Universal Router `execute`, command `0x10`, actions `0x060c0f`, integer slippage, a 60-second quote lifetime and a five-minute deadline. Native input sends exact ETH and needs no approval. ERC-20 input performs token → Permit2, then Permit2 → router approvals only when fresh allowance/expiry reads require them, with zero transaction value. The extended six-field tuple is supported when the manifest network enables it. Each step is separate and each execute is simulated. Direction, amount, slippage, account, chain or provider changes invalidate pending quote/allowance requests. Responses from older requests are discarded, and quote identity/expiry is checked again after transaction preparation and simulation. Form controls lock while an approval or swap is being submitted. No USD value is invented.

## Validation and evidence

```sh
# Browser dependencies on a normal development machine:
cd web
npx playwright install --with-deps chromium webkit
npm run test:browser
npm run test:revision
# Read-only live checks, without a wallet or broadcasts:
node tests/live-read.mjs
```

The browser suite owns a temporary HTTP server and closes it at completion. It uses mocked EIP-1193/JSON-RPC responses, never a private key or funded account. Evidence is written to `docs/frontend-evidence/`. Test fixture addresses are isolated in `web/tests/` and are never bundled as deployment data.

The worker additionally ran the supplied taste probe against `dist/`, mobile/desktop browser inspection, live code/binding/funding reads and a live quote. See [frontend validation](../docs/FRONTEND_VALIDATION.md), [implemented design](../docs/DESIGN.md), [browser results](../docs/frontend-evidence/browser-results.json) and [live observations](../docs/frontend-evidence/live-read.json). The revision reproduction record and 15 focused regression scenarios are in [revision validation](../docs/REVISION_VALIDATION.md). These are worker observations, not independent certification or publication checks.

The share image is committed in `web/public/share.png` and copied to the export. Regenerate it with `node web/scripts/generate-share.mjs` from the repository root after installing Chromium, then rebuild. The unknown future hosting URL means Open Graph asset paths remain relative.

## Scope and delivery

All new deliverables are under `web/`, `dist/` and `docs/`. `web/.gitignore` is the one explicitly budgeted ignore file and excludes dependencies/caches recursively. No dependency archives, browser binaries, package caches, submodules or `node_modules` belong in the submission. Root configuration and deployed Solidity are unchanged. The requested root `DESIGN.md` is provided as `docs/DESIGN.md` because the overriding write budget forbids root file edits. Publishing, IPFS pinning and site naming belong to the publisher.
