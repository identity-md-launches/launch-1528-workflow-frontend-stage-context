# PONZIRAMID design system

## Overview

An Ethereum pyramid game for people watching the round, building, withdrawing principal and claiming rewards. The visual idea is a playable golden stone pyramid framed by original desert-noir character art. Live data and the Build control are the first screen; detailed mechanics and contract information unfold below.

The requested crypto voice appears in the artwork and a few short lines: “gm, Pharaoh.”, “Heavy is the crown.” and “touch sand responsibly”. Transaction consequences and errors use plain language. All displayed players, bricks, prices and activity come from chain reads; there is no production demo mode.

## Colors

Canonical tokens are in `web/src/style.css`. The root is Obsidian; `[data-theme="sun"]` selects Sun Club.

| Token / purpose | Obsidian | Sun Club |
| --- | --- | --- |
| `--bg` page | `#10120f` | `#f4efdf` |
| `--surface` cards | `#191c17` | `#fff9eb` |
| `--surface-raised` overlays | `#20241d` | `#ede4cf` |
| `--surface-soft` low emphasis fills | `#24271f` | `#e7ddc7` |
| `--text` primary text | `#eeeade` | `#292c22` |
| `--muted` secondary text | `#acae9e` | `#656553` |
| `--line` outlines and separators | `#35392c` | `#c9c0a9` |
| `--accent` primary action / game identity | `#e8b969` | `#924629` |
| `--accent-hover` primary hover | `#f5ca83` | `#a35030` |
| `--accent-ink` filled-button label | `#211a0e` | `#fff9eb` |
| `--positive` confirmed / covered states | `#a6cf9a` | `#39662d` |
| `--danger` errors | `#f1a694` | `#9c3124` |
| `--focus` keyboard ring | `#f3cd85` | `#914126` |

Color also has words/icons: Withdrawn, Pharaoh, Diamond, error text and check marks. The illustrated scene deliberately retains its dark palette in both themes. Contrast measurement and image-background limitations are in the validation record, not inferred from token names.

## Typography

`Space Grotesk`, with Arial/sans-serif fallback, provides UI and grotesk headlines. Local WOFF2 files at `web/src/assets/fonts/space-{400,600,700}.woff2` supply the three used weights. Georgia/Times New Roman is the serif-italic accent; it uses the device's serif font. Body line height is 1.55 and headings approximately 1.1. Headings balance wrapping; prose uses pretty wrapping. Bigints format into tabular numeric text.

The six size tokens are `--sm:13px`, `--base:16px`, `--lg:20px`, `--xl:28px`, `--display:40px`, `--hero:64px`. At 1150px the hero becomes 40px. At 700px display becomes 28px and section headings 20px; the hero remains 40px, falling to 28px below 370px. Form inputs remain 16px at every width. No seventh ad-hoc type size is needed. Headline tracking is −.055em, serif accent −.045em; smaller labels use normal tracking.

## Layout

Header, main and footer share a 1320px maximum and 32px horizontal gutters, reduced to 24px at 1150px and 16px at 700px. Spacing follows a 4px basis, chiefly 8/12/16/20/24/32px. Section spacing is 48–64px on desktop and 32–40px on mobile.

Order: hero/Build and activity → Rewards with My bricks → visual money flow, strategy, timeline and collapsed rules → compact Trade → collapsed Transparency. The desktop arena uses 1.7fr/1fr columns; 900px and 1150px rules adapt its proportions. At 700px it stacks scene then Build, and the header navigation collapses. Mobile `.page-scroll` fills available viewport height above a separate persistent Build/Rewards navigation row. The bar includes the bottom safe area and never overlays scrolling content. Anchor navigation scrolls the appropriate container.

Rewards use aligned rows, with amounts and actions on the right; on mobile each row keeps the action beside a two-line label/amount group. My bricks shows eight rows per page; the entire discovered history determines totals. Tables turn into two-column compact rows on phones. Rules use two columns on desktop, one on mobile. The swap's illustrated introduction moves above its form on mobile. Transparency statistics use four columns, then two. Contracts wrap instead of clipping their full values.

## Elevation & Depth

Cards use the brief's thin 1px outlines and soft offset `--shadow`: `0 5px 0 #090b0840` in Obsidian, `0 5px 0 #50402110` in Sun Club. This combination is intentional and overrides the design probe's general no-border-plus-shadow rule. Radix overlays use a translucent black backdrop, subtle blur and a 24px/100px shadow. Layer order: mobile bar 40; menus/hover cards 70; modal backdrop 80; dialog/sheet 90; skip link 100.

Bricks use shallow stone shading; gold identifies the wallet's bricks and cracks identify withdrawn Stone. The crown floats only when motion is allowed and the scene's Pause control is off. No random decorative animation runs.

## Shapes

Major surfaces have 20px radii (16px on mobile); buttons 10px; menus 12px; badges 5–6px. Pyramid bricks have 3px corners (2px mobile). The stepped pyramid always has eight tiers and 36 selectable positions; its full outlined silhouette distinguishes unbuilt space from existing bricks. Larger rounds page through actual individual bricks, starting at the latest page, with explicit position labels.

## Components

- `components/ui/button.tsx`: existing shadcn Button composition using Radix Slot/CVA; default primary, outline and ghost variants. Most buttons are at least 44px tall; mobile Build is 46px. Desktop primary Build is 52px.
- `components/ui/overlays.tsx`: shadcn-style Radix Dialog, right-side Sheet and HoverCard composition. Modals trap focus, support Escape and restore focus. Exact-value hover cards also open on tap/focus; Arrow Down reaches Copy. Menus use Radix keyboard navigation. Overlays inherit the selected theme.
- `components/common.tsx`: `Amount` applies four-place ETH / compact token formatting, preserves tiny nonzero values, and exposes exact copyable values. `AddressView` shortens addresses with full-value access, Copy and Etherscan. `TxAction` retains simulation, receipt, rejection and replacement handling.
- `WalletButton.tsx`: one wallet dialog, detected wallet options, WalletConnect QR, deterministic blockie, balance/network chip and account menu. No dropdown plus separate Connect sequence.
- `Pyramid.tsx`, `BrickSheet.tsx`, `Activity.tsx`: original local scene plus live interactive bricks, details and a bounded recent event feed. Loading and unavailable states say what is known; no invented live data.
- `RewardsCenter.tsx`, `ClaimQueue.tsx`: three total/action rows, automatic historical list and a sequential progress dialog. Pending receipt locks prevent duplicate writes. A hidden pending queue has a Resume control. Early withdrawal and zero-value settlement consequences appear before approval.
- `HowItWorks.tsx`: amount flow, three strategy icons, five-step round timeline, one-sentence terms and collapsed short rules. `SwapPanel.tsx` retains the existing contract path with compact values. `FundingPanel.tsx` retains explicit permanent-donation acknowledgment inside Transparency.

States include loading, disconnected, empty, wrong network, incomplete discovery, stale RPC, disabled, preparing, wallet confirmation, receipt pending, confirmed, rejected, reverted, replaced and retry. Errors persist near their action. Timers have `aria-live="off"`; action progress uses status regions.

Hover/press changes use explicit properties with 150ms timing. Press scale is .96. Motion is opt-in under `prefers-reduced-motion: no-preference`; reduced motion disables transitions, infinite crown/spinner motion and smooth scrolling. The theme switch does not add a global page-color animation.

## Do's and Don'ts

Reuse `Amount`, `AddressView`, the overlay primitives and existing semantic colors. Keep transaction inputs as bigint and disclose exact values on demand. Give new actions labels, focus states, loading/error states and one clear primary emphasis. Keep shared layout edges and the mobile bar's separate viewport row.

Do not add sample balances/activity, expose rounded amounts as transaction arguments, ask players for brick IDs, replace the pinned contracts or put private credentials in this static site. Keep new runtime assets local and record genuine browser limitations. Keep the Space Grotesk license in `docs/licenses/Space-Grotesk-OFL.txt` (SIL OFL); pinned Better Interface/Impeccable attribution remains in `docs/licenses/better-interface-LICENSE.txt`.
