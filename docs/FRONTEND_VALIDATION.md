# Frontend worker validation

Status: complete for the frontend write scope, subject to the explicit limitations below. This is a worker’s reproducible validation record, not independent certification. No deployment, publication, IPFS pin, mainnet signature or broadcast was performed.

## Scope and acceptance coverage

| Requirement | Result / implementation |
| --- | --- |
| Frontend source, lockfile and root static export | `web/`, `web/package-lock.json`, `dist/index.html` and locally bundled runtime assets; Vite relative base and one-page anchor navigation |
| Attested runtime configuration | The app fetches `dist/imd-deployment.json` and its ABI paths; pinned implementation ABI canonical Keccak hashes verified during export; runtime loaded assets checked with SHA-256 |
| Exact handoff contract set, pool key and network | Two attested entries only; children discovered from getters; unchanged five-field pool key, network and wallet-add parameters; all other exported files inventoried |
| Wallet connection / wrong chain | EIP-6963 and injected EIP-1193 connectors; account and chain events; unknown chain → exact add-chain request → switch again; no invented WalletConnect ID |
| Watching without a wallet | Live public reads, funding status, timer, Pharaoh, Tomb, token reserve and code/binding verification |
| Build | Exact quote and integer amounts; Stone/Mortar/gas shown separately; funding, reservation, pause, expiry, cooldown, consecutive-builder and balance gates; fresh quote check plus simulation |
| Withdraw / claims | Direct vault refunds; separate per-brick ETH, credited ETH and historical per-round token claims; optional validated recipient; no forced settlement before refund |
| Finalization and owner actions | Permissionless finalize at expiry, owner-only pause/resume controls; no invented setup transaction |
| Permanent funding and transparency | Exact approval then acknowledged irreversible deposit; full-balance initial creator deposit; reward balance, committed/uncommitted, creator balance and indexed funding receipt links |
| Trading | Native buy and token sell; supplied v4 quoter/router/Permit2; copied hook/key; separate allowance steps, integer slippage, minimum output, deadlines and pre-sign simulation |
| Transaction observability | Per-action stage and lock; receipt/explorer links; persistent session history; receipt-only retry when confirmation is unknown; rejection/revert guidance |
| Mobile and metadata | Product/action on 390px first screen; no horizontal overflow at tested widths; title, description, favicon, Open Graph title and actual 1200×630 PNG |
| Design documentation | `docs/DESIGN.md`; root `DESIGN.md` conflicts with the overriding write budget, so no root file was created |
| Preserved deployed source | Solidity, original ABI source exports, Foundry configuration, root lockfiles, `lib/` and `.github/` unchanged; existing contract-stage validation remains in `docs/VALIDATION.md` |
| Publisher-stage checks | After this worker: source publishing, IPFS pinning/naming, fixed/named asset checks and control-plane RPC checks. No claim those have run. |

The workflow’s contract solvency, reentrancy, funding invariants and economics tests belong to the already-deployed source stage. This assignment did not modify contracts or rerun/relabel those tests as frontend evidence.

## Executed checks

- `npm run typecheck --prefix web`: strict TypeScript check.
- `npm test --prefix web`: 12 passing core tests: integer precision, slippage bounds, standard/extended v4 encoding, reversed currency order, funding/reservation gates, pause/expiry/cooldown/consecutive builder/balance, recipient validity, add-chain retry/rejection and error/countdown handling.
- `npm run build --prefix web`: successful Vite production build with post-export manifest/ABI verification. The approximately 601 kB main JS chunk produces Vite’s informational 500 kB chunk warning; its gzip estimate is approximately 188 kB. No runtime dependency was removed to conceal that warning.
- `npm run verify --prefix web`: exact handoff fields, allowed manifest keys, pinned raw ABI bytes/canonical hashes, asset inventory and every final SHA-256.
- `npm run test:browser --prefix web`: 22/22 scenarios passed in Chromium and WebKit, production files at `/preview/`, mocked wallet/RPC interactions. Exact scenario names and outcomes are in `frontend-evidence/browser-results.json`; fixtures are in `web/tests/mock-rpc.mjs` and never enter the production bundle.
- `node web/tests/live-read.mjs`: live, read-only chain/code/binding/funding checks and a real quoter simulation. Results are in `frontend-evidence/live-read.json`.
- `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste`: supplied probe against the export at 320, 390 and 1440, plus reduced motion. All 15 applicable checks pass; the sole casing flag is the expressly required `NOT FUNDED` text. The probe result is retained as `frontend-evidence/taste-summary.json` without relying on temporary scratch files.
- Axe WCAG A/AA scan of disconnected and connected expanded-form states: zero automated violations. See `frontend-evidence/accessibility.json`; this is not a screen-reader test or a full accessibility certification.

The worker used Playwright 1.64.0, Chromium 156 and WebKit 27.2. Browser binaries and Ubuntu runtime libraries were downloaded under `/tmp/`, outside the submission. WebKit’s packaged launcher overwrote `LD_LIBRARY_PATH`; its temporary wrapper was adjusted to retain that path, and the missing Mesa software renderer was supplied under `/tmp/`. These environment repairs changed no repository build files or deployed contracts. A standard developer machine can use `npx playwright install --with-deps chromium webkit` from `web/`.

### Browser coverage

The browser suite checks responsive widths 320, 390, 660, 850 and 1440; long balance/address reflow; main-action first-screen bounds; no-wallet guidance; wrong chain and exact add-chain parameters; Build simulation and exact value; rejection; simulation revert; paused/unfunded gating with refunds still available; historical brick scanning and lookup; recipient validation; brick/credited ETH claims; finalization and historical token claims; zero-value diamond rounding settlement; wallet changes while a receipt is pending; permanent-funding approval/acknowledgment/deposit; native swaps and two-step token approvals; account changes; owner pause/resume; pending-receipt locks; RPC failure/recovery; ABI tamper rejection; keyboard skip navigation; and reduced motion. WebKit independently exercises build/refund and reflow. No private key or real signing is involved.

Screenshots were viewed, not just saved:

- `frontend-evidence/live-390.png` and `live-1440.png`: actual live chain, initial unfunded round.
- `frontend-evidence/mock-chromium-390.png` and `mock-chromium-1440.png`: explicitly mocked active-round fixture, including a full Pharaoh address.
- `frontend-evidence/mock-webkit-390.png`: WebKit after mocked confirmed actions.
- `frontend-evidence/keyboard-focus-390.png`: inspected real keyboard focus on Connect wallet, 2px solid `rgb(223, 200, 164)` with no overflow.
- `frontend-evidence/dev-check.json`: Vite development middleware serves the exact export manifest and ABIs and renders the mocked read state.

The live initial-round Build/connect button is fully visible at 390×844; recorded coordinates are in the live JSON. The active-round screenshot also keeps the action above that fold. No sideways scroll was observed at 320 or 390.

## Live deployment observations

Read-only evidence records the exact UTC time and block. At block **26,181,996** on chain **1**:

- Nonempty code: LaunchToken 1,722 bytes; Ponziramid 7,044; discovered StoneVault 1,564; discovered PonziRewards 4,859. Both child `game()` getters and the rewards `token()` getter match the handoff.
- Current round: 0; paused: false. Quote: 0.001 ETH = 0.0009 refundable Stone + 0.0001 non-refundable Mortar.
- Reward balance, committed rewards, uncommitted rewards, vault ETH and vault Stone ledger: all 0.
- Initial funding gate: 700,000,000 PONZIRAM; not yet reached.
- Creator allocation receipt: [deployment transaction](https://etherscan.io/tx/0xe01dde1b26e3b0e98dac7e1c2bed7e2b4db82a9b8e8c0a8178afda49fe68ed09), block 26,181,772. The unique allocation transfer is `700000000000000000000004270` minor units, to `0x0A5b0e232d47541eB503bC862a9DB2672b8fBa24`. The small remainder explains why matching exactly 700 million would incorrectly hide the creator’s balance.
- The creator’s current balance remained **700000000.00000000000000427 PONZIRAM**. It was not represented as zero.
- **Funding transaction hash: none observed.** The complete range from deployment through the recorded block contained no `Funded` events. This is an absence observation at a block, not a fabricated transaction or a promise about later activity.
- A read-only quote of 0.001 ETH returned 13332.31691164713942646 PONZIRAM, minimum 13265.655327088903729327 at 0.5% slippage. This transient observation is test evidence, not a hardcoded price or value guarantee.

Initial terminal RPC requests returned HTTP 403. Chromium requests from the served production app succeeded. The evidence accurately reflects that distinction; no new RPC endpoint was substituted.

## Better Interface review

All six pinned domains were read and applied during implementation. The one visual idea is a warm stone pyramid and crown beside the cost of a brick.

| Domain | Coverage and findings |
| --- | --- |
| Accessibility — Checked | Native controls, labels, semantic headings/statistics, skip link, visible focus, error/status regions, timer announcements off, reduced motion and a crown pause control. Axe and keyboard checks executed; manual assistive-technology sessions not performed. |
| Layout — Checked | Production mobile/desktop screenshots, 320/390 reflow, long addresses/balances, first-screen action bounds and expanded forms. Native 200% zoom and physical devices untested. |
| Writing — Checked | Price/refund/fee distinctions, irreversible funding consent, actual on-chain token symbol, stale/empty/error states, exact required home disclaimer and explicit owner/bot/ordering risks. No promised profit or invented USD value. |
| Typography — Checked | Six token sizes, three weights, system serif/sans pairing, tabular numeric values, 16px inputs, full wrapping critical values. Probe confirmed type/spacing thresholds. Actual installed font choice is device-dependent. |
| Colors — Checked | Semantic token roles; rendered probe contrast passes; success/errors also use words. Dark-only follows the brief. No unsupported claim about image/gradient contrast or a light theme. |
| UI — Checked | Action states, approvals, persistent receipts, native disclosures, consistent button variants, flat surfaces and reduced motion. No automatic modal or unnecessary decorative animation. Slow-motion animation-panel replay not performed. |

### Findings fixed and rechecked

| Severity / source | Reproduction and impact | Fix and evidence |
| --- | --- | --- |
| High — `web/src/style.css:1121` mobile Pharaoh/address rules | At 390×844 with a full Pharaoh address, the initial active-round Build box ended at y≈850, below the first screen. | Compact scene/header spacing and reserve copy-button space beside the wrapping address. Final browser bound assertion and active-round screenshot pass. |
| High — `web/src/components/common.tsx:58` (`Stat`) | Axe flagged the helper description as an invalid `div` alongside a `dt`/`dd` group. | Description moved inside `dd`. Final disconnected/connected Axe violations are empty. |
| Medium — `web/src/components/common.tsx:96`, `web/src/App.tsx:440` | A successful finalize/fund could change its panel and remove the receipt link. | Added persistent session transaction history; retained swap completion/disabled state and finalize control. Final transaction-flow tests pass. |
| Medium — `web/src/chain.ts:172` (`discoverCreator`) | Live creator allocation included 4,270 minor units beyond the immutable threshold; exact-amount matching left its identity unavailable. | Require a unique verified token transfer from the deployment factory for at least the gate. Actual receipt and current balance are now shown. |
| Medium — `web/src/hooks.ts:138` (`useGame`) | A forced post-receipt refresh could collide with an already-running poll and return before allowance data refreshed. | Forced refresh waits for the poll then rereads; generation cleanup prevents an old account’s refresh from replacing the new account’s state. Approval tests pass. |
| Medium — `web/src/components/common.tsx:96` (`TxAction`) | A submitted transaction whose receipt becomes unavailable must not invite immediate duplicate submission. | Preserve hash, lock that action and offer a receipt-only check. Pending-lock behavior is browser-tested; long provider outages/replacements remain live-wallet limitations. |
| Medium — `web/src/indexing.ts:11`, `web/src/components/WalletPanel.tsx:15` | A finalized diamond share can be zero wei but still needs a claim to settle rounding. | Read the round’s finalization and brick settlement flags, allow a zero-value settlement, and disclose that gas still applies. Dedicated browser test confirms it cannot be repeated. |
| Medium — `web/src/hooks.ts:138` | A receipt arriving after an account change must not refresh the previous wallet’s balances into the new wallet view. | Refresh callbacks check the current reader/account scope; a pending-receipt account-change test verifies the new wallet’s zero Stone remains zero. |
| Brief exception — `web/src/components/FundingPanel.tsx:79` | Probe flags uppercase `NOT FUNDED`. | Retained exactly because the approved brief says the website “shows NOT FUNDED.” All other probe checks pass. |

## Limitations

- No actual wallet signed, no funds were spent and no real build/refund/claim/funding/swap was broadcast. Live router execution, wallet-specific hardware UX, real gas estimation, transaction replacement/cancellation and prolonged receipt outages were not end-to-end tested with funds.
- Browser automation is not a physical iPhone, a screen-reader session or native browser zoom. Cross-browser mobile viewport and keyboard checks are the evidence actually obtained. Any remaining Axe `incomplete` checks are recorded as such rather than counted as passes.
- The chain was unfunded during validation. Funding is the creator/donor’s action through the provided controls; the worker cannot and did not perform it.
- The pyramid viewport renders the first 204 indexed slots. All round bricks remain counted; historical refunds/claims are accessible through direct IDs and paginated scans. Large histories require manual continuation, and provider log limits can require retry. A 12-block funding overlap handles recent reorgs, not arbitrary deep reorg indexing; a reload re-reads on-chain state.
- The app accepts checksummed/valid hex recipients and displays checksummed addresses. ENS lookups are not implemented because no resolver configuration is supplied. No WalletConnect project ID is supplied, so browser-wallet connectors are used.
- Absolute Open Graph URLs depend on the publisher’s final gateway/name. The image is present and relative paths work under the tested subpath; social-platform unfurling has not been tested after publication.
- No claim is made that an independent contract audit or the later control-plane publication checks ran in this frontend assignment.

## Submission integrity

`frontend-evidence/submission-audit.json` records the final path audit, source/export counts and size measurement. `frontend-evidence/taste-summary.json`, browser results and live observations are committed deliverables, unlike temporary `test/scratch/` tooling. `web/.gitignore` is the sole ignore-file edit allowed by the assignment and excludes dependency/cache directories at every nesting level. The final export is below 1 MiB, well inside both the submission and HTTP-check budgets. Both the full-tree Git bundle and the submission delta were verified below 1.2 MiB (the hard submission limit is 8 MiB). The worker’s Git metadata is read-only, so bundle assembly uses an isolated scratch checkout; the publisher captures the allowed working-tree deliverables.
