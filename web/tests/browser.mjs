import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  parseEther,
  decodeFunctionData,
  parseAbi,
  decodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { serveExport } from "../scripts/preview.mjs";
import { createMock, installMock, fixture } from "./mock-rpc.mjs";
const output = fileURLToPath(
  new URL("../../docs/frontend-evidence/", import.meta.url),
);
await mkdir(output, { recursive: true });
const { server, url } = await serveExport();
const results = [];
const browsers = [];
const wait = async (page, fn) =>
  page.waitForFunction(fn, null, { timeout: 15000 });
const test = async (name, fn) => {
  if (
    process.env.TEST_FILTER &&
    !new RegExp(process.env.TEST_FILTER).test(name)
  )
    return;
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, durationMs: Date.now() - start });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({
      name,
      passed: false,
      error: e.message,
      durationMs: Date.now() - start,
    });
    console.error(`FAIL ${name}: ${e.stack}`);
  }
};
async function setup(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const mock = createMock();
  Object.assign(mock.state, options.state || {});
  await installMock(context, mock, { wallet: options.wallet !== false });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("heading", { name: "Build your brick." }).waitFor();
  await page
    .getByText("Read at block", { exact: false })
    .waitFor({ timeout: 20000 });
  return { context, page, mock, errors };
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Disconnect wallet", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Build a brick", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    document.querySelector("#your-stone")?.innerText.includes("0.0009 ETH"),
  );
}
try {
  const chrome = await chromium.launch({ headless: true });
  browsers.push(chrome);
  await test("Chromium: 320/390/660/850/1440 export reflow and first-screen primary action", async () => {
    const { page, context, errors } = await setup(chrome);
    for (const width of [320, 390, 660, 850, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert(dimensions.scroll <= dimensions.width, JSON.stringify(dimensions));
      if (width === 390) {
        const box = await page
          .getByRole("button", { name: "Connect wallet to build" })
          .boundingBox();
        assert(
          box.y + box.height <= 844,
          `Build below fold: ${JSON.stringify(box)}`,
        );
        await page.screenshot({
          path: output + "mock-chromium-390.png",
          fullPage: false,
        });
      }
      if (width === 1440)
        await page.screenshot({
          path: output + "mock-chromium-1440.png",
          fullPage: false,
        });
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
  await test("No wallet: connect explains installation, read-only values remain visible", async () => {
    const { context, page } = await setup(chrome, { wallet: false });
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "No browser wallet detected" })
      .waitFor();
    assert(await page.getByText("Live on chain", { exact: false }).isVisible());
    await context.close();
  });
  await test("Wrong chain: add unknown chain with exact network handoff, switch, enable build", async () => {
    const { context, page, mock } = await setup(chrome);
    mock.state.chain = "0xaa36a7";
    mock.state.unknownChain = true;
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page.getByText("Wrong network.", { exact: false }).waitFor();
    await page
      .getByRole("button", { name: "Switch to Ethereum", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Build a brick", exact: true })
      .waitFor();
    await wait(
      page,
      () => !document.querySelector(".build-terms .tx-action button")?.disabled,
    );
    const add = mock.state.requests.find(
      (x) => x.method === "wallet_addEthereumChain",
    );
    assert.deepEqual(add.params[0], mock.config.walletAddChain);
    assert.equal(
      mock.state.requests.filter(
        (x) => x.method === "wallet_switchEthereumChain",
      ).length,
      2,
    );
    await context.close();
  });
  await test("Build: simulation before signature, exact price/round/value, confirmed state, consecutive lock", async () => {
    const { context, page, mock, errors } = await setup(chrome);
    await connect(page);
    await page
      .getByRole("button", { name: "Build a brick", exact: true })
      .click();
    await page.getByText("Transaction confirmed.", { exact: false }).waitFor();
    assert.equal(mock.state.transactions.length, 1);
    const tx = mock.state.transactions[0];
    assert.equal(BigInt(tx.value), parseEther(".001"));
    assert.equal(tx.to.toLowerCase(), fixture.game);
    const lastCall = mock.state.requests.findIndex(
      (x) => x.method === "eth_sendTransaction",
    );
    assert(
      mock.state.requests
        .slice(0, lastCall)
        .some((x) => x.method === "eth_call" && x.params[0].data === tx.data),
    );
    await page.getByText("You are Pharaoh.", { exact: false }).waitFor();
    assert(
      await page
        .getByRole("button", { name: "Build a brick", exact: true })
        .isDisabled(),
    );
    assert.deepEqual(errors, []);
    await context.close();
  });
  await test("Wallet rejection: persistent error, no submission, primary action unlocks", async () => {
    const { context, page, mock } = await setup(chrome);
    await connect(page);
    mock.state.reject = true;
    await page
      .getByRole("button", { name: "Build a brick", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Request declined" })
      .waitFor();
    assert.equal(mock.state.transactions.length, 0);
    assert(
      await page
        .getByRole("button", { name: "Build a brick", exact: true })
        .isEnabled(),
    );
    await context.close();
  });
  await test("Simulation failure: decoded error prevents wallet submission", async () => {
    const { context, page, mock } = await setup(chrome);
    await connect(page);
    mock.state.failSimulation = true;
    await page
      .getByRole("button", { name: "Build a brick", exact: true })
      .click();
    await page.getByRole("alert").filter({ hasText: "paused" }).waitFor();
    assert.equal(mock.state.transactions.length, 0);
    await context.close();
  });
  await test("Unfunded initial round and owner pause gate Build without blocking refunds", async () => {
    const { context, page, mock } = await setup(chrome, {
      state: { funded: false, roundId: 0n, paused: true },
    });
    await connect(page);
    assert(
      await page
        .getByRole("button", { name: "Build a brick", exact: true })
        .isDisabled(),
    );
    await page.getByLabel("Look up a brick ID").fill("1");
    await page.getByRole("button", { name: "Load brick", exact: true }).click();
    await page
      .getByRole("button", { name: "Withdraw Stone", exact: true })
      .waitFor();
    assert(
      await page
        .getByRole("button", { name: "Withdraw Stone", exact: true })
        .isEnabled(),
    );
    await page
      .getByRole("button", { name: "Withdraw Stone", exact: true })
      .click();
    await page.getByText("Transaction confirmed.", { exact: false }).waitFor();
    assert.equal(mock.state.transactions[0].to.toLowerCase(), fixture.vault);
    assert(mock.state.withdrawn);
    await context.close();
  });
  await test("Historical brick scan, refund recipient validation, per-brick ETH and credited ETH claims", async () => {
    const { context, page, mock } = await setup(chrome);
    await connect(page);
    await page
      .getByRole("button", { name: "Find my bricks", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Brick #1", exact: true })
      .waitFor();
    await page
      .getByText("Send refunds or claims to another address", { exact: true })
      .click();
    await page
      .getByLabel("Recipient address")
      .fill("0x0000000000000000000000000000000000000000");
    assert(
      await page
        .getByRole("button", { name: "Withdraw Stone", exact: true })
        .isDisabled(),
    );
    await page.getByLabel("Recipient address").fill(fixture.other);
    await page
      .getByRole("button", { name: "Claim brick ETH", exact: true })
      .click();
    await page
      .getByText("Transaction confirmed.", { exact: false })
      .first()
      .waitFor();
    assert(mock.state.brickClaimed);
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Claim brick ETH",
      );
      return button?.disabled;
    });
    await page.getByRole("button", { name: "Claim ETH", exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector("#your-stone")
        ?.innerText.includes("Your credited ETH\n0 ETH"),
    );
    assert.equal(mock.state.credit, 0n);
    await context.close();
  });
  await test("Finalize expired round and claim one historical token reward, preventing repeat claim", async () => {
    const { context, page, mock } = await setup(chrome);
    await connect(page);
    mock.state.expires = mock.state.time - 1n;
    mock.state.block++;
    await page
      .getByRole("button", { name: "Refresh state", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Finalize round", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Finalize round", exact: true })
      .click();
    await page
      .getByText("Transaction confirmed.", { exact: false })
      .first()
      .waitFor();
    assert(mock.state.finalized);
    await page
      .getByRole("button", { name: "Claim PONZI", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector("#claim-token-hint") ||
        [...document.querySelectorAll("#your-stone button")].some(
          (b) => b.textContent.trim() === "Claim PONZI" && b.disabled,
        ),
    );
    assert(mock.state.claimed);
    await context.close();
  });
  await test("Permanent funding: exact approval is separate, acknowledgment required, deposit confirmed", async () => {
    const { context, page, mock } = await setup(chrome);
    await connect(page);
    await page.getByText("Fund the reward pool", { exact: true }).click();
    await page
      .getByLabel("Deposit amount (PONZIRAM)", { exact: true })
      .fill("100");
    await page
      .getByRole("button", { name: "Approve reward deposit", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Fund permanently", exact: true })
      .waitFor();
    assert(
      await page
        .getByRole("button", { name: "Fund permanently", exact: true })
        .isDisabled(),
    );
    await page
      .getByLabel("I understand this deposit cannot be withdrawn.")
      .check();
    await page
      .getByRole("button", { name: "Fund permanently", exact: true })
      .click();
    await page
      .getByText("Fund permanently: confirmed.", { exact: true })
      .waitFor();
    assert.equal(mock.state.transactions.length, 2);
    assert.equal(mock.state.transactions[0].to.toLowerCase(), fixture.token);
    assert.equal(mock.state.transactions[1].to.toLowerCase(), fixture.rewards);
    await context.close();
  });
  await test("Native swap: quote is eth_call, no approvals, exact network router and pool key", async () => {
    const { context, page, mock } = await setup(chrome);
    await connect(page);
    await page.getByLabel("You pay (ETH)", { exact: true }).fill("0.01");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await page
      .getByRole("button", { name: "Swap tokens", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Swap tokens", exact: true })
      .click();
    await page.getByText("Transaction confirmed.", { exact: false }).waitFor();
    assert.equal(mock.state.transactions.length, 1);
    const tx = mock.state.transactions[0];
    assert.equal(
      tx.to.toLowerCase(),
      mock.config.network.uniswapV4.universalRouter,
    );
    assert.equal(BigInt(tx.value), parseEther(".01"));
    const decoded = decodeFunctionData({
      abi: parseAbi([
        "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
      ]),
      data: tx.data,
    });
    assert.equal(decoded.args[0], "0x10");
    const [actions, params] = decodeAbiParameters(
      parseAbiParameters("bytes,bytes[]"),
      decoded.args[1][0],
    );
    assert.equal(actions, "0x060c0f");
    const [swap] = decodeAbiParameters(
      parseAbiParameters(
        "((address,address,uint24,int24,address),bool,uint128,uint128,bytes)",
      ),
      params[0],
    );
    assert.equal(swap[0][4].toLowerCase(), mock.config.poolKey.hooks);
    assert.equal(swap[3], parseEther("248.75"));
    await context.close();
  });
  await test("Token sale: exact ERC20 to Permit2, Permit2 to router, then zero-value execute", async () => {
    const { context, page, mock } = await setup(chrome);
    await connect(page);
    await page
      .getByRole("button", { name: "Sell PONZIRAM", exact: true })
      .click();
    await page.getByLabel("You pay (PONZIRAM)", { exact: true }).fill("10");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await page
      .getByRole("button", { name: "Approve PONZIRAM to Permit2", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Approve PONZIRAM to Permit2", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Approve Permit2 to router", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Approve Permit2 to router", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Swap tokens", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Swap tokens", exact: true })
      .click();
    await page
      .getByText("Swap confirmed. Get a new quote to trade again.", {
        exact: true,
      })
      .waitFor();
    assert.equal(mock.state.transactions.length, 3);
    assert.equal(mock.state.transactions[0].to.toLowerCase(), fixture.token);
    assert.equal(
      mock.state.transactions[1].to.toLowerCase(),
      mock.config.network.uniswapV4.permit2,
    );
    assert.equal(BigInt(mock.state.transactions[2].value), 0n);
    await context.close();
  });
  await test("Keyboard flow, reduced motion, long values and account-change reset", async () => {
    const { context, page, mock } = await setup(chrome);
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent),
      "Skip to game",
    );
    await page.keyboard.press("Enter");
    await connect(page);
    await page
      .getByText("Send refunds or claims to another address", { exact: true })
      .click();
    await page.getByLabel("Recipient address").fill(fixture.other);
    mock.state.accounts = [fixture.other];
    await page.evaluate(
      (a) => window.__emitWallet("accountsChanged", [a]),
      fixture.other,
    );
    await page.waitForFunction(
      () => document.querySelector("#recipient").value === "",
    );
    mock.state.tokenBalance = 10n ** 50n;
    mock.state.block++;
    await page
      .getByRole("button", { name: "Refresh state", exact: true })
      .click();
    await page.waitForTimeout(400);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      );
    }
    assert.equal(
      await page
        .locator(".scene-crown")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await context.close();
  });
  await test("Missing deployed code is a visible failure and keeps transaction controls disabled", async () => {
    const context = await chrome.newContext();
    const mock = createMock();
    mock.state.wrongCode = true;
    await installMock(context, mock);
    const page = await context.newPage();
    await page.goto(url);
    await page
      .getByRole("alert")
      .filter({ hasText: "contract code could not be verified" })
      .waitFor();
    assert.equal(mock.state.transactions.length, 0);
    await context.close();
  });
  await test("Owner controls follow the connected owner and pause only new builds", async () => {
    const { context, page, mock } = await setup(chrome);
    await connect(page);
    assert.equal(
      await page.getByText("Owner controls", { exact: true }).count(),
      0,
    );
    mock.state.accounts = [fixture.creator];
    await page.evaluate(
      (a) => window.__emitWallet("accountsChanged", [a]),
      fixture.creator,
    );
    await page.getByText("Owner controls", { exact: true }).click();
    await page
      .getByRole("button", { name: "Pause building", exact: true })
      .click();
    await page
      .getByText("Pause building: confirmed.", { exact: true })
      .waitFor();
    assert(mock.state.paused);
    assert(
      await page
        .getByRole("button", { name: "Build a brick", exact: true })
        .isDisabled(),
    );
    await page
      .getByRole("button", { name: "Resume building", exact: true })
      .click();
    await page
      .getByText("Resume building: confirmed.", { exact: true })
      .waitFor();
    assert(!mock.state.paused);
    await context.close();
  });
  await test("A finalized zero-value diamond share can still settle rounding", async () => {
    const { context, page, mock } = await setup(chrome, {
      state: { finalized: true, zeroBrickClaim: true },
    });
    await connect(page);
    await page.getByLabel("Look up a brick ID").fill("1");
    await page.getByRole("button", { name: "Load brick", exact: true }).click();
    await page.getByText("This claim pays 0 ETH", { exact: false }).waitFor();
    await page
      .getByRole("button", { name: "Claim brick ETH", exact: true })
      .click();
    await page
      .getByText("Claim brick ETH: confirmed.", { exact: true })
      .waitFor();
    assert(mock.state.brickClaimed);
    // Confirmation is reported before the refreshed per-brick read completes.
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Claim brick ETH",
      );
      return button?.disabled;
    });
    assert(
      await page
        .getByRole("button", { name: "Claim brick ETH", exact: true })
        .isDisabled(),
    );
    await context.close();
  });
  await test("Account changes during pending receipts cannot restore the old wallet balance", async () => {
    const { context, page, mock } = await setup(chrome);
    await connect(page);
    mock.state.receiptDelay = 3;
    await page
      .getByRole("button", { name: "Build a brick", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Build a brick: waiting for confirmation/ })
      .waitFor();
    mock.state.accounts = [fixture.other];
    await page.evaluate(
      (a) => window.__emitWallet("accountsChanged", [a]),
      fixture.other,
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#your-stone .stat dd")?.textContent === "0 ETH",
    );
    mock.state.receiptDelay = 0;
    // Receipt watchers retry on new blocks, as a real chain would produce.
    mock.state.block++;
    mock.state.time++;
    await page
      .getByText("Build a brick: confirmed.", { exact: true })
      .waitFor();
    await page.waitForTimeout(400);
    assert.equal(
      await page.locator("#your-stone .stat dd").first().innerText(),
      "0 ETH",
    );
    await context.close();
  });
  await test("Pending receipt holds action locks until chain confirmation", async () => {
    const { context, page, mock } = await setup(chrome);
    await connect(page);
    mock.state.receiptDelay = 2;
    await page
      .getByRole("button", { name: "Build a brick", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Build a brick: waiting for confirmation/ })
      .waitFor();
    assert(
      await page
        .getByRole("button", {
          name: /Build a brick: waiting for confirmation/,
        })
        .isDisabled(),
    );
    assert.equal(mock.state.transactions.length, 1);
    mock.state.receiptDelay = 0;
    await page
      .getByText("Build a brick: confirmed.", { exact: true })
      .waitFor();
    assert.equal(mock.state.transactions.length, 1);
    await context.close();
  });
  await test("RPC failure is recoverable without inventing state", async () => {
    const { context, page, mock } = await setup(chrome);
    await connect(page);
    mock.state.rpcFailure = true;
    await page
      .getByRole("button", { name: "Refresh state", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Live reads unavailable" })
      .waitFor();
    assert(
      await page
        .getByRole("button", { name: "Build a brick", exact: true })
        .isDisabled(),
    );
    mock.state.rpcFailure = false;
    await page
      .getByRole("button", { name: "Refresh state", exact: true })
      .click();
    await page.waitForFunction(() => !document.querySelector(".rpc-error"));
    assert(
      await page
        .getByRole("button", { name: "Build a brick", exact: true })
        .isEnabled(),
    );
    await context.close();
  });
  await test("ABI asset tampering is rejected before RPC or wallet actions", async () => {
    const context = await chrome.newContext();
    const mock = createMock();
    await installMock(context, mock);
    await context.route("**/abi/LaunchToken.json", (route) =>
      route.fulfill({ contentType: "application/json", body: "[]" }),
    );
    const page = await context.newPage();
    await page.goto(url);
    await page
      .getByRole("alert")
      .filter({ hasText: "Asset verification failed" })
      .waitFor();
    assert.equal(mock.state.transactions.length, 0);
    assert(!mock.state.requests.some((x) => x.method === "eth_getCode"));
    await context.close();
  });
  await test("Automated accessibility: disconnected and connected expanded forms", async () => {
    const { context, page } = await setup(chrome);
    const before = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    await connect(page);
    await page.getByText("Fund the reward pool", { exact: true }).click();
    await page
      .getByText("Send refunds or claims to another address", { exact: true })
      .click();
    const after = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    await writeFile(
      output + "accessibility.json",
      JSON.stringify(
        {
          disconnected: before.violations,
          connected: after.violations,
          incomplete: after.incomplete.map((x) => ({
            id: x.id,
            description: x.description,
          })),
        },
        null,
        2,
      ) + "\n",
    );
    assert.deepEqual(
      before.violations.map((x) => ({
        id: x.id,
        impact: x.impact,
        nodes: x.nodes.map((n) => n.target),
      })),
      [],
    );
    assert.deepEqual(
      after.violations.map((x) => ({
        id: x.id,
        impact: x.impact,
        nodes: x.nodes.map((n) => n.target),
      })),
      [],
    );
    await context.close();
  });
  await test("WebKit: mobile rendering, wallet build, refund and reduced motion", async () => {
    const browser = await webkit.launch({ headless: true });
    browsers.push(browser);
    const { context, page, mock, errors } = await setup(browser);
    await connect(page);
    await page
      .getByRole("button", { name: "Build a brick", exact: true })
      .click();
    await page.getByText("Transaction confirmed.", { exact: false }).waitFor();
    assert.equal(mock.state.transactions.length, 1);
    await page.getByLabel("Look up a brick ID").fill("1");
    await page.getByRole("button", { name: "Load brick", exact: true }).click();
    await page
      .getByRole("button", { name: "Withdraw Stone", exact: true })
      .click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim() === "Withdraw Stone" && b.disabled,
      ),
    );
    assert(mock.state.withdrawn);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: output + "mock-webkit-390.png" });
    assert.deepEqual(errors, []);
    await context.close();
  });
} finally {
  for (const b of browsers) await b.close();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(
    output + "browser-results.json",
    JSON.stringify(
      {
        kind: "Worker-run mocked browser validation; no real transactions",
        at: new Date().toISOString(),
        results,
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `${results.filter((x) => x.passed).length}/${results.length} browser scenarios passed`,
);
if (results.some((x) => !x.passed)) process.exitCode = 1;
