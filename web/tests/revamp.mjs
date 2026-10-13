import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { parseEther, decodeFunctionData } from "viem";
import { serveExport } from "../scripts/preview.mjs";
import { createMock, installMock, fixture } from "./mock-rpc.mjs";
import { createPortfolioMock, abis } from "./revamp-fixture.mjs";
const output = new URL("../../docs/revamp-evidence/", import.meta.url);
await mkdir(output, { recursive: true });
const { server, url } = await serveExport();
const browser = await chromium.launch();
const results = [],
  contexts = [];
const test = async (name, fn) => {
  if (
    process.env.TEST_FILTER &&
    !new RegExp(process.env.TEST_FILTER).test(name)
  )
    return;
  try {
    await fn();
    results.push({ name, passed: true });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, passed: false, error: e.stack });
    console.error("FAIL", name, e.message);
  }
};
async function setup({
  rich = false,
  state = {},
  wallet = true,
  width = 390,
  b = browser,
  shortReceiptTimeout = false,
  touch = false,
} = {}) {
  const c = await b.newContext({
    viewport: { width, height: 844 },
    reducedMotion: "reduce",
    hasTouch: touch,
  });
  contexts.push(c);
  if (shortReceiptTimeout)
    await c.addInitScript(() => {
      const original = window.setTimeout;
      window.setTimeout = (fn, delay, ...args) =>
        original(fn, delay === 180000 ? 1600 : delay, ...args);
    });
  const mock = rich ? createPortfolioMock() : createMock();
  Object.assign(mock.state, state);
  await installMock(c, mock, { wallet });
  const p = await c.newPage();
  const errors = [],
    failed = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("response", (r) => {
    if (r.url().startsWith(url) && r.status() >= 400) failed.push(r.url());
  });
  await p.goto(url);
  await p
    .locator(".under-arena")
    .getByRole("button", { name: /Block/ })
    .waitFor({ timeout: 20000 });
  await p.waitForFunction(() => document.fonts.status === "loaded");
  return { p, c, mock, errors, failed };
}
async function connect(p) {
  await p.locator(".wallet-button").click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: /Browser wallet/ })
    .click();
  await p.locator(".wallet-chip").waitFor();
  await p
    .getByText("All rounds · up to date", { exact: true })
    .waitFor({ timeout: 20000 });
  await p.waitForFunction(
    () => !document.querySelector("#rewards .reward-row .button")?.disabled,
  );
}
async function queue(p, row, title) {
  await p.locator(".reward-row").nth(row).locator("button.button").click();
  await p.getByRole("dialog", { name: title }).waitFor();
  await p.getByRole("button", { name: /Confirm \d+ transaction/ }).click();
  await p
    .getByText("All done. Your rewards are on their way home.", { exact: true })
    .waitFor({ timeout: 30000 });
}
const calls = (mock) =>
  mock.state.transactions.map((tx) => {
    const name =
      tx.to.toLowerCase() === fixture.game
        ? "Ponziramid"
        : tx.to.toLowerCase() === fixture.vault
          ? "StoneVault"
          : tx.to.toLowerCase() === fixture.rewards
            ? "PonziRewards"
            : null;
    return name
      ? decodeFunctionData({ abi: abis[name], data: tx.data })
      : { functionName: "other", args: [] };
  });
try {
  await test("Responsive production export: 320, 390, 700, 900, 1440; first-screen Build visible", async () => {
    const { p, errors, failed } = await setup();
    for (const width of [320, 390, 700, 900, 1440]) {
      await p.setViewportSize({ width, height: 844 });
      await p.evaluate(() => {
        scrollTo(0, 0);
        document.querySelector(".page-scroll").scrollTo(0, 0);
      });
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overflow at ${width}`,
      );
      if (width === 390) {
        const box = await p.locator(".main-action").boundingBox(),
          bar = await p.locator(".mobile-bar").boundingBox();
        assert(box.y + box.height <= bar.y, JSON.stringify({ box, bar }));
        assert(
          await p
            .getByRole("heading", { name: "Build a brick.", exact: true })
            .isVisible(),
        );
        await p.screenshot({
          path: new URL("after-390.webp", output).pathname,
          type: "webp",
          quality: 85,
          fullPage: true,
        });
        await p.screenshot({
          path: new URL("first-screen-390.webp", output).pathname,
          type: "webp",
          quality: 90,
        });
      }
      if (width === 1440)
        await p.screenshot({
          path: new URL("after-1440.webp", output).pathname,
          type: "webp",
          quality: 85,
          fullPage: true,
        });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
  });
  await test("Single wallet dialog, focus trap, Escape restoration, no-wallet help", async () => {
    const { p } = await setup({ wallet: false });
    await p.locator(".wallet-button").focus();
    await p.keyboard.press("Enter");
    const d = p.getByRole("dialog", { name: "gm, Pharaoh." });
    await d.waitFor();
    assert(await d.getByText(/Rabby and MetaMask/).isVisible());
    assert(await d.getByRole("button", { name: /WalletConnect/ }).isVisible());
    for (let i = 0; i < 6; i++) await p.keyboard.press("Tab");
    assert(
      await p.evaluate(() => !!document.activeElement.closest("[role=dialog]")),
    );
    await p.keyboard.press("Escape");
    await d.waitFor({ state: "hidden" });
    assert(
      await p
        .locator(".wallet-button")
        .evaluate((el) => el === document.activeElement),
    );
  });
  await test("Auto discovery: 3 bricks across 3 rounds and 12,500 blocks, adaptive ranges, no ID input", async () => {
    const { p, mock } = await setup({
      rich: true,
      state: { rejectWideRange: true },
    });
    await connect(p);
    assert.equal(await p.locator(".brick-table-row").count(), 3);
    assert.equal(await p.locator("#brick-id").count(), 0);
    assert.match(await p.locator("#rewards").innerText(), /700K PONZIRAM/);
    const logs = mock.state.requests.filter(
      (r) => r.method === "eth_getLogs" && r.params[0].topics?.[3],
    );
    assert(logs.length > 5);
    const last = logs.at(-1).params[0];
    assert.equal(BigInt(last.toBlock), mock.state.block);
    await p.screenshot({
      path: new URL("connected-390.webp", output).pathname,
      type: "webp",
      quality: 85,
      fullPage: true,
    });
  });
  await test("Rounded ETH, compact tokens, tap exact value and copy control", async () => {
    const { p } = await setup({ rich: true, touch: true });
    assert.match(await p.locator(".next-price").innerText(), /0.0011 ETH/);
    assert(
      !(await p.locator("body").innerText()).includes("0.001061677811864495"),
    );
    await p.locator(".next-price .info-trigger").tap();
    await p.getByText("0.001061677811864495 ETH", { exact: true }).waitFor();
    assert(
      await p
        .getByRole("button", { name: "Copy exact value", exact: true })
        .isVisible(),
    );
    await p.keyboard.press("Escape");
  });
  await test("Pyramid follows latest page, supports manual browsing and resumes following", async () => {
    const { p, mock, errors } = await setup({
      state: { bricks: 100n },
      width: 320,
    });
    await p
      .getByRole("button", { name: "Brick #100, Pharaoh", exact: true })
      .waitFor();
    assert.equal(await p.locator(".pyramid-brick.filled").count(), 28);
    assert.equal(await p.locator(".pyramid-brick.unbuilt").count(), 8);
    await p
      .locator(".pyramid-pagination")
      .getByRole("button", { name: "Previous", exact: true })
      .click();
    await p.getByText("Bricks 37–72", { exact: true }).waitFor();
    assert.equal(await p.locator(".pyramid-brick.filled").count(), 36);
    mock.state.block++;
    mock.state.bricks = 101n;
    await p.waitForTimeout(5500);
    assert(await p.getByText("Bricks 37–72", { exact: true }).isVisible());
    await p
      .locator(".pyramid-pagination")
      .getByRole("button", { name: "Latest", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Brick #101, Pharaoh", exact: true })
      .waitFor();
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
  });
  await test("Exact-value keyboard card reaches Copy and returns focus with Escape", async () => {
    const { p } = await setup({ rich: true });
    const trigger = p.locator(".next-price .info-trigger");
    await trigger.focus();
    await p.keyboard.press("ArrowDown");
    await p.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Copy exact value",
    );
    await p.keyboard.press("Escape");
    assert(await trigger.evaluate((el) => document.activeElement === el));
    await p
      .getByText("0.001061677811864495 ETH", { exact: true })
      .waitFor({ state: "hidden" });
  });
  await test("Build simulates and submits exact mainnet contract call/value", async () => {
    const { p, mock } = await setup({ rich: true });
    await connect(p);
    await p
      .locator(".build-box")
      .getByRole("button", { name: /Build ·/ })
      .click();
    await p
      .getByText("Transaction confirmed.", { exact: false })
      .waitFor({ timeout: 20000 });
    const tx = mock.state.transactions.at(-1);
    assert.equal(tx.to.toLowerCase(), fixture.game);
    assert.equal(BigInt(tx.value), parseEther(".001061677811864495"));
    const call = calls(mock).at(-1);
    assert.equal(call.functionName, "build");
    assert.deepEqual(call.args, [3n, parseEther(".001061677811864495")]);
  });
  await test("Brick Sheet shows details and withdraws owned Stone", async () => {
    const { p, mock } = await setup();
    await connect(p);
    await p.getByRole("button", { name: /Brick #1, yours/ }).click();
    const d = p.getByRole("dialog", { name: "Brick #1" });
    await d.waitFor();
    await d.getByText("Stone held", { exact: true }).waitFor();
    await d.getByRole("button", { name: "Withdraw this Stone" }).click();
    await d
      .getByText("Transaction confirmed.", { exact: false })
      .waitFor({ timeout: 20000 });
    assert.equal(calls(mock).at(-1).functionName, "withdrawStone");
    assert.equal(calls(mock).at(-1).args[1].toLowerCase(), fixture.account);
  });
  await test("Rewards Withdraw confirms risk then queues 3 refunds", async () => {
    const { p, mock } = await setup({ rich: true });
    await connect(p);
    await queue(p, 0, "Withdraw Stone");
    assert.deepEqual(
      calls(mock).map((c) => c.functionName),
      ["withdrawStone", "withdrawStone", "withdrawStone"],
    );
    assert.equal(mock.withdrawn.size, 3);
  });
  await test("ETH Claim all queues each brick then claimETH; progress and receipts retained", async () => {
    const { p, mock } = await setup({ rich: true });
    await connect(p);
    await queue(p, 1, "Claim all ETH");
    assert.deepEqual(
      calls(mock).map((c) => c.functionName),
      ["claimBrickETH", "claimBrickETH", "claimBrickETH", "claimETH"],
    );
    assert.match(
      await p.getByRole("dialog").innerText(),
      /4 of 4 transactions confirmed/,
    );
    await p.getByRole("button", { name: "Done", exact: true }).click();
    assert.equal(await p.locator(".transaction-history li").count(), 4);
  });
  await test("PONZIRAM Claim all queues only finished owned rounds", async () => {
    const { p, mock } = await setup({ rich: true });
    await connect(p);
    await queue(p, 2, "Claim all PONZIRAM");
    assert.deepEqual(
      calls(mock).map((c) => [c.functionName, c.args[0]]),
      [
        ["claim", 2n],
        ["claim", 1n],
      ],
    );
    assert.equal(mock.claimedRounds.size, 2);
  });
  await test("Rejected Build reports no submission and can retry", async () => {
    const { p, mock } = await setup();
    await connect(p);
    mock.state.reject = true;
    await p
      .locator(".build-box")
      .getByRole("button", { name: /Build ·/ })
      .click();
    await p
      .getByText("Request declined in your wallet. Nothing was submitted.", {
        exact: true,
      })
      .waitFor();
    assert.equal(mock.state.transactions.length, 0);
    await p
      .locator(".build-box")
      .getByRole("button", { name: /Build ·/ })
      .click();
    await p
      .getByText("Transaction confirmed.", { exact: false })
      .waitFor({ timeout: 20000 });
    assert.equal(mock.state.transactions.length, 1);
  });
  await test("Rejected claim queue stops safely; retry does not skip an item", async () => {
    const { p, mock } = await setup({ rich: true });
    await connect(p);
    mock.state.reject = true;
    await p.locator(".reward-row").nth(1).locator("button.button").click();
    await p.getByRole("button", { name: "Confirm 4 transactions" }).click();
    await p
      .getByRole("dialog")
      .getByText(/Request declined/)
      .waitFor();
    assert.equal(mock.state.transactions.length, 0);
    await p.getByRole("button", { name: "Confirm 4 transactions" }).click();
    await p
      .getByText("All done. Your rewards are on their way home.", {
        exact: true,
      })
      .waitFor({ timeout: 30000 });
    assert.equal(mock.state.transactions.length, 4);
  });
  await test("Wrong network banner, exact add/switch, restored ready state", async () => {
    const { p, mock } = await setup({
      state: { chain: "0xa", unknownChain: true },
    });
    await p.locator(".wallet-button").click();
    await p.getByRole("button", { name: /Browser wallet/ }).click();
    await p
      .getByText("Wrong network. Switch to Ethereum to play.", { exact: true })
      .waitFor();
    await p
      .getByRole("button", { name: "Switch to Ethereum", exact: true })
      .first()
      .click();
    await p
      .locator(".build-box")
      .getByRole("button", { name: /Build ·/ })
      .waitFor();
    assert.equal(mock.state.chain, "0x1");
    assert(
      mock.state.requests.some((r) => r.method === "wallet_addEthereumChain"),
    );
  });
  await test("Pause gates Build but refunds stay available", async () => {
    const { p, mock } = await setup({ state: { paused: true } });
    await connect(p);
    assert(
      await p
        .locator(".build-box")
        .getByRole("button", { name: /Build ·/ })
        .isDisabled(),
    );
    assert(
      await p
        .locator(".reward-row")
        .nth(0)
        .locator("button.button")
        .isEnabled(),
    );
    await queue(p, 0, "Withdraw Stone");
    assert.equal(calls(mock).at(-1).functionName, "withdrawStone");
  });
  await test("Swap quote, minimum received, buy simulation and transaction", async () => {
    const { p, mock } = await setup();
    await connect(p);
    await p.locator("#swap-amount").fill("0.001");
    await p.getByRole("button", { name: "Get quote", exact: true }).click();
    await p.getByText("Estimated receive", { exact: true }).waitFor();
    await p.locator("#trade").getByRole("button", { name: /Swap/ }).click();
    await p
      .locator("#trade")
      .getByText("Transaction confirmed.", { exact: false })
      .waitFor({ timeout: 20000 });
    assert.equal(
      mock.state.transactions.at(-1).to.toLowerCase(),
      mock.config.network.uniswapV4.universalRouter,
    );
  });
  await test("Simulation failure prevents submission", async () => {
    const { p, mock } = await setup();
    await connect(p);
    mock.state.failSimulation = true;
    await p
      .locator(".build-box")
      .getByRole("button", { name: /Build ·/ })
      .click();
    await p.locator(".build-box [role=alert]").waitFor();
    assert.equal(mock.state.transactions.length, 0);
  });
  await test("Wallet account changes clear old bricks and disable old queue", async () => {
    const { p, mock } = await setup({ rich: true });
    await connect(p);
    await p.locator(".reward-row").nth(1).locator("button.button").click();
    mock.state.accounts = [fixture.other];
    await p.evaluate(
      (account) => window.__emitWallet("accountsChanged", [account]),
      fixture.other,
    );
    await p.waitForFunction(() =>
      document.querySelector(".wallet-chip")?.innerText.includes("0x4444"),
    );
    assert(
      await p
        .getByRole("button", { name: "Confirm 4 transactions" })
        .isDisabled(),
    );
    await p.getByRole("button", { name: "Close dialog" }).click();
    await p
      .getByText("No bricks yet. Your first one starts with Build.", {
        exact: true,
      })
      .waitFor({ timeout: 20000 });
  });
  await test("Themes, reduced motion, keyboard focus and automated axe checks", async () => {
    const { p } = await setup();
    await p.locator(".wallet-button").focus();
    assert.equal(
      await p
        .locator(".wallet-button")
        .evaluate((el) => getComputedStyle(el).outlineStyle),
      "solid",
    );
    await p.screenshot({
      path: new URL("focus-390.webp", output).pathname,
      type: "webp",
      quality: 85,
    });
    const scans = [];
    for (const theme of ["obsidian", "sun"]) {
      if (theme === "sun")
        await p
          .getByRole("button", { name: "Switch to Sun Club light theme" })
          .click();
      await p
        .getByRole("heading", { name: "Build a brick.", exact: true })
        .scrollIntoViewIfNeeded();
      const result = await new AxeBuilder({ page: p })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      scans.push({ theme, violations: result.violations });
      assert.deepEqual(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
      if (theme === "sun") {
        await p.screenshot({
          path: new URL("sun-club-390.webp", output).pathname,
          type: "webp",
          quality: 85,
          fullPage: true,
        });
        await p.setViewportSize({ width: 1440, height: 1000 });
        await p.screenshot({
          path: new URL("sun-club-1440.webp", output).pathname,
          type: "webp",
          quality: 85,
          fullPage: true,
        });
      }
    }
    assert.equal(
      await p.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                a.playState === "running" &&
                a.effect?.getComputedTiming().iterations === Infinity,
            ).length,
      ),
      0,
    );
    await writeFile(
      new URL("accessibility.json", output),
      JSON.stringify(scans, null, 2),
    );
  });
  await test("Connected header, rewards and all rule items reflow at 320/390/1440", async () => {
    const { p } = await setup({ rich: true });
    await connect(p);
    for (const width of [320, 390, 1440]) {
      await p.setViewportSize({ width, height: 844 });
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.match(await p.locator(".wallet-chip").innerText(), /10 ETH/);
      assert.match(await p.locator(".wallet-chip").innerText(), /Ethereum/);
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p
      .locator("#rewards")
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await p.screenshot({
      path: new URL("rewards-390.webp", output).pathname,
      type: "webp",
      quality: 85,
    });
    await p.locator(".brick-table-row .text-button").first().click();
    await p
      .getByRole("dialog")
      .getByText("Stone held", { exact: true })
      .waitFor();
    const axe = await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    assert.deepEqual(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
    );
    await p.screenshot({
      path: new URL("brick-sheet-390.webp", output).pathname,
      type: "webp",
      quality: 85,
    });
    await p.getByRole("button", { name: "Close dialog" }).click();
    await p
      .locator("#rules details")
      .evaluateAll((items) => items.forEach((el) => (el.open = true)));
    const lines = await p.locator("#rules details p").evaluateAll((items) =>
      items.map((el) => ({
        text: el.textContent,
        lines:
          el.getBoundingClientRect().height /
          parseFloat(getComputedStyle(el).lineHeight),
      })),
    );
    assert(
      lines.every((x) => x.lines <= 2.1),
      JSON.stringify(lines),
    );
  });
  await test("Unknown receipt blocks duplicate claims and can resume after a receipt-only check", async () => {
    const { p, mock } = await setup({ rich: true, shortReceiptTimeout: true });
    await connect(p);
    mock.state.receiptDelay = 1000;
    await p.locator(".reward-row").nth(1).locator("button.button").click();
    await p.getByRole("button", { name: "Confirm 4 transactions" }).click();
    await p
      .getByRole("button", { name: "Check transaction receipt" })
      .waitFor({ timeout: 15000 });
    assert.equal(mock.state.transactions.length, 1);
    await p.getByRole("button", { name: "Close dialog" }).click();
    await p.getByRole("button", { name: "Resume rewards queue" }).waitFor();
    assert(
      await p
        .locator(".reward-row")
        .nth(1)
        .locator("button.button")
        .isDisabled(),
    );
    await p.getByRole("button", { name: "Resume rewards queue" }).click();
    mock.state.receiptDelay = 0;
    await p.getByRole("button", { name: "Check transaction receipt" }).click();
    await p.getByRole("button", { name: "Continue remaining claims" }).click();
    await p
      .getByText("All done. Your rewards are on their way home.", {
        exact: true,
      })
      .waitFor({ timeout: 30000 });
    assert.equal(mock.state.transactions.length, 4);
  });
  await test("Zero-value finalized diamond settlement remains claimable", async () => {
    const { p, mock } = await setup({
      state: { finalized: true, zeroBrickClaim: true, credit: 0n },
    });
    await connect(p);
    await queue(p, 1, "Claim all ETH");
    assert.deepEqual(
      calls(mock).map((c) => c.functionName),
      ["claimBrickETH"],
    );
  });
  if (process.env.RUN_WEBKIT)
    await test("WebKit mobile: connect, discovery, ETH queue, and no overflow", async () => {
      const wk = await webkit.launch();
      try {
        const { p } = await setup({ b: wk, rich: true });
        await connect(p);
        await queue(p, 1, "Claim all ETH");
        await p.getByRole("button", { name: "Done", exact: true }).click();
        for (const width of [320, 390, 1440]) {
          await p.setViewportSize({ width, height: 844 });
          assert(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
        }
        await p.screenshot({
          path: new URL("webkit-1440.webp", output).pathname,
          type: "webp",
          quality: 80,
          fullPage: true,
        });
      } finally {
        await wk.close();
      }
    });
} finally {
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
  server.close();
  await writeFile(
    new URL(process.env.REVAMP_REPORT || "interaction-results.json", output),
    JSON.stringify(
      {
        kind: "Mock EIP-1193 wallet and deterministic RPC; no real signing",
        at: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );
}
if (results.some((r) => !r.passed)) process.exitCode = 1;
