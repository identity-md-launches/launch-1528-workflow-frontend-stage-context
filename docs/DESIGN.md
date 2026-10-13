# PONZIRAMID implemented design

This document is in `docs/` to respect the explicit write budget; a root `DESIGN.md` would be outside that budget. It describes the final source, rather than an aspirational redesign.

## Overview

PONZIRAMID is an on-chain game interface for spectators and players. Its visual idea is a limestone pyramid under a floating crown, next to the exact terms of one brick. Ink-black panels, warm stone text, desert orange for the main action and restrained gold for the crown follow the approved brief. There is no marketing section before the game.

The hierarchy is product → scene and transaction terms → personal custody/claims → public funding → trading/rules → verification. On phones the scene is compact so the wallet button, game state and Build action remain in the first screen. Unavailable chain data is labeled, never substituted with example numbers.

## Colors

All reusable UI colors are semantic CSS custom properties in `web/src/style.css:2`. Primitive values and their roles:

| Semantic token | Value | Role |
| --- | --- | --- |
| `--bg` | `#121310` | Page and input background |
| `--surface` | `#171815` | Main game and content panels |
| `--surface-raised` | `#20211c` | Hover/selection and network notices |
| `--text` | `#f6efe1` | Main text |
| `--muted` | `#b9ae99` | Labels, explanatory text, secondary controls |
| `--border` | `#393b31` | Structural dividers and outlined controls |
| `--accent` / `--accent-hover` | `#f1a35e` / `#ffc087` | Primary Build/connect action |
| `--on-accent` | `#121310` | Text on the orange action |
| `--focus` | `#dfc8a4` | Two-pixel keyboard focus ring, four-pixel offset |
| `--success` | `#a9c7a0` | Confirmed state, with text |
| `--error` | `#f4aba4` | Persistent errors, with explanatory text |
| `--gold` | `#d8b675` | Crown illustration |

The SVG uses limestone face colors `#ead1a5`, `#c49860`, `#966842` and subdued withdrawn faces. Its ghost slots are explicitly a blueprint; only the chain-confirmed count fills them. This is an intentionally dark product; no unused theme toggle is offered. Measured contrast evidence and remaining limitations belong to `FRONTEND_VALIDATION.md` and the probe result.

## Typography

The UI requests `Avenir Next, Avenir, Segoe UI, sans-serif`; the headline requests `Georgia, Times New Roman, serif`. These are system stacks, with no external font requests, downloads or claims that a particular device font is installed. Weights are 400, 600 and 700. The main headline is the heaviest text.

Six token sizes are used: small 14px, body 16px, subheading 20px, statistic 24px, heading/timer 36px, desktop display 48px. The main headline becomes 36px below 1100px. Mobile input text stays 16px. Body line-height is 1.5; headings are 1.2, and multiline rule text is 1.65. Headline tracking is −0.045em; ordinary prose has natural spacing. Numbers use tabular figures. Critical amounts and addresses wrap with `overflow-wrap`, rather than ellipsis or clipping. The desktop Tomb has an abbreviated overview alongside the exact value. Mobile suppresses that duplicate overview and keeps the exact, selectable amount in the existing stat space.

`NOT FUNDED` is deliberately uppercase because the approved brief requires that exact visible label. It is the recorded exception to the probe’s content-casing rule, not a reusable heading style.

## Layout

`site-header`, `main` and `footer` share a 1280px maximum width, 40px desktop inline padding, 24px below 1100px and 16px below 660px (12px below 360px). Repeated spacing is based on 4/8px steps: 8px inside small controls, 12/16px within groups, 20/24px between groups, 28px panel padding on desktop.

The desktop arena has 1.25:1 scene/control columns. At 850px it uses equal columns; below 660px it stacks a compact 96px scene above the build terms. The full Pharaoh address reserves a separate copy-button slot. This avoids the mobile address pushing Build below the fold. Below 360px the timer and some statistical grids stack to preserve reflow. Supporting panels use two columns until 660px, then a single document flow. Contract-address grids also collapse. There is no fixed bottom action or sticky overlay covering content.

Actual checks covered 320, 390, 660, 850 and 1440 CSS pixels, with long balances and full addresses. At 390×844 the live primary action occupied y=683–731 in the recorded initial-round state; the mocked active-round screenshot also shows the full action in the first screen. Browser-native zoom and physical-device testing were not performed.

## Elevation & Depth

UI surfaces are flat tonal layers. Structural borders divide the arena, forms and expanded sections; no panel combines a drop shadow and border. Depth belongs to the three projected faces of each pyramid brick. The share image is generated from the same geometric idea, not a claimed live game snapshot.

## Shapes

The arena and content panels use 12px radii, controls/inputs 6px and transaction history 8px. The pyramid is built from square isometric courses, with stable indices when a brick’s Stone is withdrawn. The count determines the bottom-up courses: the minimum base grows from eight to twelve bricks per side as needed (including 204 → 205). At more than 650 bricks the scene groups the overview in powers of 64 and enlarges the current page of up to 64 recent individual bricks. The visible caption and accessible image description state the group size and exact detail range, on mobile as well as desktop. Course positions reflow when the base or overview scale changes. SVG work stays within 650 overview slots plus 64 detail slots; per-brick withdrawal reads cover the individual bricks currently shown. These display bounds do not limit the contract or historical refund access.

## Components

| Component/source | Use and behavior |
| --- | --- |
| `components/ui/button.tsx` | shadcn-style Radix Slot/CVA button; default orange, outline and ghost variants; native disabled state; 46px standard target; keyboard focus; 150ms color/press feedback |
| `components/common.tsx:AddressView` | Full checksummed, wrapping address; explorer link, copy button and copy-failure guidance |
| `components/common.tsx:Stat` | Semantic `dt`/`dd` pair with optional unit and descriptive detail inside the definition |
| `components/common.tsx:TxAction` | Per-action simulation/signing/receipt state; locks, rejection/revert handling, cancellation/different-replacement outcomes, receipt-only retry after unknown confirmation, explorer link |
| `components/Pyramid.tsx` | Count-derived isometric courses, bounded large-round overview/recent-brick detail; dark withdrawn individual faces; animated crown, pause control and reduced-motion support |
| `components/WalletPanel.tsx` | Principal/credited ETH, paginated brick discovery, direct historical lookup, refund/claim controls and validated alternate recipient |
| `components/FundingPanel.tsx` | Public balances, initial funding gate, creator receipt identity, permanent funding disclosure and separate approval/deposit steps |
| `components/SwapPanel.tsx` | Native direction controls, labeled amount/slippage inputs, request-scoped quotes and allowance steps, minimum receive, rate and sequential approval/swap control |
| Native `details`/`summary` | Optional explanations and owner/funding forms; platform keyboard behavior without custom focus traps |

Page-level state is in `App.tsx`; wallet/polling lifecycle is in `hooks.ts`. `chain.ts` owns verified reads and transaction prerequisites. App transaction history preserves receipt links when a completed action’s panel changes. Shared controls use native labels and persistent `role=alert`/`role=status` text. The timer is a timer role with announcements off, so it does not interrupt a screen reader every second.

Only the crown animates continuously, every four seconds; its pause button remains visible. Motion is opted in under `prefers-reduced-motion: no-preference`; reduced motion removes it and button transforms. No `transition: all` or page-load entrance animation is used.

## Do’s and don’ts

- Start another surface from `.panel`, `.section-title`, `.stats` and existing form controls. Keep consequential instructions beside the action they explain.
- Keep only the main game action filled orange. Use neutral outlined controls for claims, approvals and secondary work.
- Reuse semantic tokens and the six-size scale. Preserve readable, complete amounts and addresses.
- Keep principal, earned ETH, prize allocation and permanent token funding distinct. Do not turn “unavailable” into zero or silently round a transaction value.
- Use the manifest and runtime-loaded ABI for integration. Never add a competing address or chain map to a component.
- Do not add a hero above the game, nested card decoration, fake player activity or guaranteed-value language.
- Retain the precise economic and owner-pause disclosures when changing copy.

Design guidance: Jakub Krehel’s Better Interface (MIT), pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation method: Paul Bakaus’s Impeccable (Apache-2.0), pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. Notices are retained in `docs/licenses/better-interface-LICENSE.txt`. The Ethereum UX reference attribution is in `docs/licenses/eth-frontend-ux-LICENSE.txt`.
