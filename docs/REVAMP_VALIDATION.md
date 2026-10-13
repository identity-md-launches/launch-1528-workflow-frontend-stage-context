# PONZIRAMID revamp validation

**Implementation and static export are complete. Required real-wallet signing validation remains unperformed.** This is a worker's check record, not independent certification. No contract changes, deployments, real signatures, fund transfers, publication or domain changes were performed. The publisher consumes `dist/` for the existing URL.

## What changed

| Before | After |
| --- | --- |
| Full addresses and long decimal balances | Four-decimal ETH, compact PONZIRAM, copyable exact values on demand; shortened addresses with Copy/Etherscan |
| Wallet chooser plus separate connection action | One wallet Dialog, detected injected wallets and WalletConnect; balance/network account menu |
| Brick ID input and manual block scans | Automatic deployment-to-tip wallet discovery across every round, bounded retries and honest progress/errors |
| Claims spread across several forms | One three-row Rewards center with totals, item count, queued withdrawals and two Claim all flows |
| Small, incomplete-looking pyramid | Full stepped outline, bottom-up bricks, gold ownership, cracks, animated crown and detail Sheet |
| Long open explanations and large funding panels | Money-flow graphic, strategy icons, timeline, short collapsed rules and collapsed transparency |
| One muted dark theme | Obsidian and Sun Club, original frog Pharaoh/desert adventurer/cat art, local grotesk fonts and share card |

Both “before” and “after” comparison screenshots use the same deterministic active-round fixture (five bricks), **not real players or balances**. The before images capture the supplied original production export. The after images capture the revised export. Mobile after images show the first screen of the new independent scrolling viewport; desktop images show the full page. Live-chain captures are separately labeled and naturally vary as chain state changes.

| View | Before | After |
| --- | --- | --- |
| Phone, 390px | [Previous page](revamp-evidence/before-390.webp) | [First screen](revamp-evidence/first-screen-390.webp) |
| Desktop, 1440px | [Previous page](revamp-evidence/before-1440.webp) | [Revised page](revamp-evidence/after-1440.webp) |
| Light theme | Previously absent | [Sun Club phone](revamp-evidence/sun-club-390.webp), [desktop](revamp-evidence/sun-club-1440.webp) |
| Connected interactions | Previously separate forms | [Rewards/list](revamp-evidence/rewards-390.webp), [brick Sheet](revamp-evidence/brick-sheet-390.webp) |
| Live Ethereum | Historical evidence retained separately | [Phone](revamp-evidence/live-390.webp), [desktop](revamp-evidence/live-1440.webp) |

The original artwork, final dark/light desktop and phone screenshots, before phone screen, Rewards screen, brick Sheet and 1200×630 share image were visually inspected. No reference images were present in the supplied workspace; original art follows the written mood rather than reproducing NFT artwork.

## Executed checks

| Check | Actual result |
| --- | --- |
| `npm run build --prefix web` | Pass: TypeScript, Vite production build, pinned ABI/manifest export. 16 inventoried assets; approximately 2.39 MB before manifest. |
| Clean install/rebuild in an isolated clone | Both lockfiles installed with `npm ci --offline` from the npm cache (addons with `--legacy-peer-deps`); TypeScript and Vite/export succeeded without network dependencies; all 17 export files match the final build byte-for-byte. |
| `npm run typecheck --prefix web` | Pass, strict TypeScript. |
| `npm run verify --prefix web` | Pass: both attested ABI hashes, four pinned ABI byte arrays, unchanged addresses/network/pool key, all export SHA-256 hashes. |
| `npm test --prefix web` | 13/13 core tests pass, including bigint amounts, slippage/encoding, gates, chain switching and bounded pyramid pages. |
| `web/node_modules/.bin/tsx --test web/tests/revamp-core.test.ts` | 5/5 new tests pass: ETH rounding/tiny values, token compaction, timers, complete adaptive event ranges and cancellation. |
| `RUN_WEBKIT=1 node web/tests/revamp.mjs` | 23/23 browser scenarios pass against the production export at `/preview/`; deterministic RPC + EIP-1193 wallet. |
| `node web/tests/walletconnect.mjs` | Pass: real WalletConnect relay creation and pairing QR on the allowlisted origin, then cancellation. No wallet paired or signed. No pairing URI/key is saved in evidence. |
| `LOCAL_RPC=<worker-endpoint> node web/tests/revamp-live.mjs` | Pass: real mainnet reads, code and child bindings, current round/quote/reward pool, live activity, real swap quote, mobile/desktop export. No wallet installed or transaction sent. |
| Pinned `taste.mjs --out test/scratch/taste` | 14/16 automated checks pass. The two remaining flags are reviewed exceptions below. |
| Axe WCAG A/AA | Zero automated violations in both themes and the connected brick Sheet. Not a screen-reader audit. |
| Protected paths, export and bundle | Recorded in [submission-audit.json](revamp-evidence/submission-audit.json). Existing configurations, package manifests/lockfiles and contract dependencies unchanged. |

[Build and clean-install record](revamp-evidence/build-checks.json), [detailed interaction results](revamp-evidence/interaction-results.json), [Axe results](revamp-evidence/accessibility.json), [WalletConnect check](revamp-evidence/walletconnect.json), [live observations](revamp-evidence/live-read.json), [design probe](revamp-evidence/taste-summary.json).

The browser suite exercises widths 320, 390, 700, 900 and 1440 in Chromium, including connected layouts. WebKit checks 320, 390 and 1440 with connection, discovery and the ETH queue. The primary Build button is fully above the bottom bar at 390×844; the live evidence records the measured rectangles. All eight expanded rule items fit within two lines at 390. No horizontal overflow, local asset failures or unhandled page errors were observed in the tested states.

Wallet simulation coverage includes three owned bricks across three rounds and 12,500 blocks, provider range refusal/recovery, exact mainnet Build calldata/value, a Sheet refund, three queued refunds, four queued ETH claims, two finished-round token claims, wallet rejection/retry, wrong-chain add/switch, pause with refunds still available, swap quote/execution, simulation failure, account changes, unknown receipt recovery without duplicate submission, zero-value diamond settlement, latest/manual pyramid pagination, and exact-value touch/keyboard navigation. Test fixture addresses exist only in tests and labeled screenshots, never in runtime configuration.

Vite reports informational >500 kB chunks (main approximately 708 kB, lazy WalletConnect approximately 512 kB) and removes one upstream `ox` annotation. WalletConnect loads only when selected. No required dependency was removed to hide a warning. The existing build scripts/configuration were not changed.

Playwright's supplied browser MCP transport returned `Transport closed`; local Playwright was used instead. Chromium 156 and WebKit 27.2 ran headlessly. Missing WebKit system libraries were extracted under `/tmp/`, and its temporary launcher was adjusted to preserve `LD_LIBRARY_PATH`. No repository dependency or system install was modified for this workaround. Normal machines can use `playwright install --with-deps chromium webkit`.

## Better Interface review

The pinned workflow and core principles of all six domains were read and applied during implementation. The idea is a playable gold stone pyramid framed by original dark-desert art. Build and Rewards govern the hierarchy; detailed rules and funding stay behind disclosures.

| Domain | Coverage | Evidence / limitation |
| --- | --- | --- |
| Accessibility | Checked | Native buttons/links/labels, keyboard focus, dialog trap/Escape/return, text-and-icon states, reduced motion and Axe. Manual screen readers and physical assistive technology were not used. |
| Layout | Checked | Mobile/desktop rendered inspection, 320px reflow, connected balances, modal/Sheet states, first-screen Build and independent bottom-bar viewport row. Physical devices and native 200% zoom are untested. |
| Writing | Checked | Consistent Stone/Mortar/Tomb terms, compact disclosures, short rule items, visible withdrawal/zero-settlement consequences, honest empty/error states. All original required risk categories remain. |
| Typography | Checked | Local 400/600/700 grotesk fonts; serif-italic accent; six-token scale, numeric alignment, 16px inputs and exact-value disclosure. Georgia varies with the device. |
| Colors | Checked | Obsidian/Sun Club semantic tokens; automated rendered contrast passes. The taste probe cannot measure 18 text boxes over images/gradients; those are not claimed as measured passes. |
| UI | Checked | Hover/press/focus, Dialog/Sheet/menu, touch exact values, keyboard Copy/focus return, loading, empty, stale, rejected, receipt pending, confirmed and retry states; crown pause and reduced motion. No slow-motion animation-panel or actual hardware-wallet review. |

### Findings corrected and rechecked

| Severity / source | Observed finding | Correction and result |
| --- | --- | --- |
| High — `web/src/style.css:2593` (`.page-scroll`, `.mobile-bar`) | The original mobile bottom bar covered the lower part of Build. | Separate viewport rows for scrolling content and persistent navigation. Final first-screen bounds and probe show no covered text/control. |
| High — `web/src/style.css:2550` (`.pyramid-brick`) | Mobile bricks were only 19px tall and crowded. | 24px height, fixed eight-tier/36-slot pages. Final target check passes; every plotted brick remains selectable. |
| Medium — `web/src/components/common.tsx:46` and `.reward-row` | Undefined balances auto-placed the action into a third row, creating large blank rows. | Explicit placeholder class and shared grid position. Disconnected screenshot and reflow checks pass. |
| Medium — `web/src/components/BrickSheet.tsx:23` | Refresh after a refund temporarily unmounted the action, hiding its confirmation. | Preserve the current brick while rereading the same ID. Sheet receipt regression passes. |
| High — `web/src/components/ClaimQueue.tsx:115` | A receipt timeout must never enable blind duplicate submission. | Preserve hash, lock writes, offer receipt-only check and resumable queue. Forced timeout test submits exactly four intended calls, without duplication. |
| Medium — `web/src/portfolio.ts:78` | Manual scans/ID inputs could not provide complete historical totals. | Automatic full range discovery, adaptive chunks, cancellation, recent reorg replacement and atomic totals. Multi-round/range-refusal tests pass. |
| Medium — `web/src/components/Activity.tsx:34` | A deployment-wide recent activity request could stay loading under the game's event volume. | Limit live feed to the latest 64 blocks and filter supported events. Live-read evidence contains actual claim/withdrawal events. |
| Medium — `web/src/components/ui/overlays.tsx:30` | Controlled overlays needed explicit focus return without a Radix trigger wrapper. | Capture the activating element, restore it on close, fall back to the wallet control. Keyboard dialog test passes. |
| Medium — `web/src/components/ui/overlays.tsx:134` | Escape dismissed an exact-value card before its Copy button could return keyboard focus. | Handle Radix’s `onEscapeKeyDown` directly, return focus and close. Keyboard regression now passes; touch opening also passes. |
| Medium — `web/src/components/HowItWorks.tsx` | Explanations were too long for two-line rules; probe found stacked short slogans. | Eight concise collapsed items, one short risk note and visual flow/timeline. Expanded-rule measurement and final slogans check pass. |

### Reviewed probe exceptions

- **`eyebrows`: false positive.** At 390px the probe calls the header's bordered **Connect button** an eyebrow above the heading. It is the required wallet action, located in the standard header utility position; it is not a decorative kicker label. Retained after visual/keyboard inspection.
- **`chrome`: explicit brief override.** The task requests “rounded cards with thin outlines and soft offset shadows”. The arena, Rewards and Trade deliberately use both. The decorative stone plinth also has depth. The probe confirms no nested cards and no gradient text.

The complete current deliverable measured about 7.68 MB uncompressed and its self-contained current-tree Git bundle about 4.25 MB, below the 8,388,608-byte cap. No cache/dependency directories or submodules are included. A full-history bundle audit was unavailable because the supplied ancestor history contains a missing Git object; the audit records that limitation and does not modify this repository’s Git metadata.

No unresolved applicable high/medium design defects were observed in the checked states. The probe's 14/16 count is preserved, not relabeled as 16/16.

## Limits and completion boundary

No actual Rabby/MetaMask/mobile wallet paired and signed. Real mainnet build, withdraw, ETH/token claims and swap execution remain **untested with a real wallet**; browser fixtures establish UI/call behavior only. No keys were available, requested, read or substituted. The public WalletConnect project ID was used as supplied.

The live data report is a point-in-time observation, not a fixture or promise of the current round. Mainnet was funded and, on the recorded run, paused by its owner; the UI correctly showed the paused reason. A refreshed live quote was obtained without signing.

Large histories may take time to scan. A provider that cannot serve even small historical ranges yields an explicit incomplete/retry state; the site cannot guarantee archival RPC availability. The recent overlap handles shallow reorgs; reload rescans full history. Queues/history are session state, and a browser reload does not persist a pending receipt lock. Physical phones, real wallet-specific prompts, native zoom, deep reorgs, prolonged outages and post-publication social unfurling were not tested.

Hosting/publication happens after review. The same URL has not been manually republished by this worker. The useful frontend deliverable is ready; the real-wallet acceptance check and publisher step remain outside the validation performed here.
