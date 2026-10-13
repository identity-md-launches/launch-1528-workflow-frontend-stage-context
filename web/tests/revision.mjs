// Focused regressions for the four independently reported revision findings.
// Every chain/wallet response is mocked; no transaction is broadcast.
import { chromium } from "playwright";
import { toFunctionSelector } from "viem";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { serveExport } from "../scripts/preview.mjs";
import { createMock, installMock, fixture } from "./mock-rpc.mjs";
const output = fileURLToPath(
  new URL("../../docs/frontend-evidence/", import.meta.url),
);
await mkdir(output, { recursive: true });
const { server, url } = await serveExport();
const browser = await chromium.launch({ headless: true });
const results = [];
const contexts = [];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const test = async (name, fn) => {
  if (
    process.env.TEST_FILTER &&
    !new RegExp(process.env.TEST_FILTER).test(name)
  )
    return;
  const start = Date.now();
  try {
    const evidence = await fn();
    results.push({
      name,
      passed: true,
      durationMs: Date.now() - start,
      ...evidence,
    });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, passed: false, error: e.stack });
    console.error(`FAIL ${name}: ${e.stack}`);
  } finally {
    for (const c of contexts.splice(0)) await c.close();
  }
};
async function setup(mock = createMock()) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  contexts.push(context);
  await installMock(context, mock);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByText("Read at block", { exact: false }).waitFor();
  return { page, mock, errors };
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.querySelector("#your-stone")?.innerText.includes("0.0009 ETH"),
  );
}
async function refresh(page, mock) {
  mock.state.block++;
  await page
    .getByRole("button", { name: "Refresh state", exact: true })
    .click();
  await page
    .getByText(`Read at block ${mock.state.block.toLocaleString()}`, {
      exact: false,
    })
    .waitFor();
}
async function noOverflow(page) {
  assert(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
    "horizontal overflow",
  );
}
function holdRpc(mock, predicate) {
  const rpc = mock.rpc;
  let release, reached;
  let holding = true;
  const gate = new Promise((r) => (release = r)),
    hit = new Promise((r) => (reached = r));
  mock.rpc = async (req) => {
    if (holding && predicate(req)) {
      reached();
      await gate;
    }
    return rpc(req);
  };
  return {
    hit,
    release: () => {
      holding = false;
      release();
    },
  };
}
const quoter = (mock) => (r) =>
  r.method === "eth_call" &&
  r.params[0].to.toLowerCase() === mock.config.network.uniswapV4.quoter;
const allowance = (r) =>
  r.method === "eth_call" &&
  r.params[0].to.toLowerCase() === fixture.token &&
  r.params[0].data.startsWith("0xdd62ed3e");
async function settle(page) {
  await page.waitForTimeout(400);
}
try {
  await test("Pyramid grows at 204→205, course/LOD/page boundaries and huge counts; reads/rendering bounded", async () => {
    const mock = createMock();
    mock.state.bricks = 204n;
    const { page, errors } = await setup(mock);
    let previous;
    const states = [];
    for (const count of [
      204n,
      205n,
      285n,
      286n,
      650n,
      651n,
      703n,
      704n,
      705n,
      41600n,
      41601n,
      10n ** 30n,
      10n ** 30n + 1n,
    ]) {
      mock.state.bricks = count;
      const beforeRequests = mock.state.requests.length;
      await refresh(page, mock);
      await page
        .getByText(`${count.toLocaleString()} confirmed bricks`, {
          exact: true,
        })
        .waitFor();
      const detailCount =
        count <= 650n ? Number(count) : Number(((count - 1n) % 64n) + 1n);
      await page.waitForFunction(
        (n) => document.querySelectorAll(".confirmed-brick").length === n,
        detailCount,
      );
      await settle(page);
      const svg = await page.locator(".pyramid").evaluate((el) => {
        const copy = el.cloneNode(true);
        copy.removeAttribute("aria-label");
        return copy.outerHTML;
      });
      const hash = digest(svg);
      if (previous)
        assert.notEqual(
          hash,
          previous,
          "count changed without geometry changing",
        );
      previous = hash;
      assert(
        (await page.locator(".pyramid g").count()) <= 714,
        "unbounded SVG",
      );
      const latest = page.locator(
        `.confirmed-brick[data-index="${count - 1n}"]`,
      );
      assert(await latest.isVisible(), "latest confirmed brick missing");
      const indexCalls = mock.state.requests
        .slice(beforeRequests)
        .filter(
          (r) =>
            r.method === "eth_call" &&
            r.params[0].data.startsWith(toFunctionSelector("bricks(uint256)")),
        );
      assert(indexCalls.length <= detailCount, "unbounded status reads");
      const caption = page.locator(".scene-caption");
      if (count > 650n) {
        assert(
          await caption.isVisible(),
          "representation limit hidden on mobile",
        );
        assert.match(await caption.innerText(), /Overview: up to/);
        assert.match(
          await page.locator(".pyramid").getAttribute("aria-label"),
          /enlarged below/,
        );
      }
      await noOverflow(page);
      if ([204n, 205n, 651n, 705n].includes(count)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: output + `revision-pyramid-${count}-390.png`,
        });
        const box = await page
          .getByRole("button", { name: "Connect wallet to build", exact: true })
          .boundingBox();
        assert(
          box.y + box.height <= 844,
          `Build below fold at ${count}: ${JSON.stringify(box)}`,
        );
      }
      states.push({
        count: String(count),
        detailCount,
        svgHash: hash,
        brickStatusCalls: indexCalls.length,
      });
    }
    // A withdrawal changes shading at the corresponding absolute round index.
    mock.state.bricks = 205n;
    mock.state.withdrawn = true;
    await refresh(page, mock);
    await page.waitForFunction(
      () =>
        document
          .querySelector('.confirmed-brick[data-index="0"] polygon')
          ?.getAttribute("fill") === "#635c4f",
    );
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(page);
    }
    assert.deepEqual(errors, []);
    return { states };
  });
  for (const field of [
    "direction+amount+slippage",
    "amount",
    "slippage",
    "account",
    "chain",
    "change-and-restore",
  ]) {
    await test(`Pending quote discarded after ${field} changes`, async () => {
      const mock = createMock();
      const hold = holdRpc(mock, quoter(mock));
      const { page } = await setup(mock);
      await connect(page);
      await page.getByLabel("You pay (ETH)", { exact: true }).fill("0.001");
      await page
        .getByRole("button", { name: "Get quote", exact: true })
        .click();
      await hold.hit;
      if (field === "direction+amount+slippage") {
        await page
          .getByRole("button", { name: "Sell PONZIRAM", exact: true })
          .click();
        await page
          .getByLabel("You pay (PONZIRAM)", { exact: true })
          .fill("250");
        await page.getByLabel("Maximum slippage").selectOption("10");
      } else if (field === "amount")
        await page.locator("#swap-amount").fill("0.002");
      else if (field === "slippage")
        await page.getByLabel("Maximum slippage").selectOption("10");
      else if (field === "account") {
        mock.state.accounts = [fixture.other];
        await page.evaluate(
          (a) => window.__emitWallet("accountsChanged", [a]),
          fixture.other,
        );
      } else if (field === "chain") {
        mock.state.chain = "0xaa36a7";
        await page.evaluate(() =>
          window.__emitWallet("chainChanged", "0xaa36a7"),
        );
        await page.getByText("Wrong network.", { exact: false }).waitFor();
      } else {
        await page.locator("#swap-amount").fill("0.002");
        await page.locator("#swap-amount").fill("0.001");
      }
      hold.release();
      await settle(page);
      assert.equal(
        await page.locator(".quote-result").count(),
        0,
        "stale quote was restored",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Swap tokens", exact: true })
          .count(),
        0,
      );
      assert.equal(mock.state.transactions.length, 0);
      if (field === "direction+amount+slippage") {
        await page
          .getByRole("button", { name: "Get quote", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: "Approve PONZIRAM to Permit2",
            exact: true,
          })
          .waitFor();
        assert.match(
          await page.locator(".quote-result").innerText(),
          /250 PONZIRAM → 250 ETH/,
        );
        assert.match(
          await page.locator(".quote-result").innerText(),
          /249.75 ETH/,
        );
        await page.screenshot({ path: output + "revision-quote-390.png" });
      }
    });
  }
  await test("A late allowance response cannot enable the previous approval under a new quote", async () => {
    const mock = createMock();
    const { page } = await setup(mock);
    await connect(page);
    await page
      .getByRole("button", { name: "Sell PONZIRAM", exact: true })
      .click();
    await page.locator("#swap-amount").fill("250");
    const hold = holdRpc(mock, allowance);
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await hold.hit;
    await page
      .getByRole("button", { name: "Buy PONZIRAM", exact: true })
      .click();
    await page.locator("#swap-amount").fill("0.002");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await page
      .getByRole("button", { name: "Swap tokens", exact: true })
      .waitFor();
    hold.release();
    await settle(page);
    assert.equal(
      await page
        .getByRole("button", {
          name: "Approve PONZIRAM to Permit2",
          exact: true,
        })
        .count(),
      0,
    );
    assert(
      await page
        .getByRole("button", { name: "Swap tokens", exact: true })
        .isEnabled(),
    );
    assert.match(
      await page.locator(".quote-result").innerText(),
      /0.002 ETH → 250 PONZIRAM/,
    );
    assert.equal(mock.state.transactions.length, 0);
  });
  for (const replacement of [
    "cancelled",
    "different destination",
    "different calldata",
    "different value",
    "repriced",
  ]) {
    await test(`Mined replacement: ${replacement} has truthful status and a single settled history entry`, async () => {
      const mock = createMock(),
        rpc = mock.rpc;
      const originalHash = `0x${"a".repeat(64)}`,
        replacementHash = `0x${"b".repeat(64)}`;
      let transaction;
      mock.rpc = async (req) => {
        if (req.method === "eth_sendTransaction") {
          mock.state.transactions.push({
            ...req.params[0],
            hash: originalHash,
          });
          mock.state.block++;
          transaction = await rpc({
            method: "eth_getTransactionByHash",
            params: [originalHash],
          });
          return originalHash;
        }
        if (
          req.method === "eth_getTransactionReceipt" &&
          req.params[0] === originalHash
        )
          return null;
        if (
          req.method === "eth_getBlockByNumber" &&
          req.params[1] &&
          transaction
        ) {
          const tx = { ...transaction, hash: replacementHash };
          if (replacement === "cancelled")
            Object.assign(tx, {
              to: fixture.account,
              input: "0x",
              value: "0x0",
            });
          if (replacement === "different destination") tx.to = fixture.other;
          if (replacement === "different calldata") tx.input = "0x";
          if (replacement === "different value") tx.value = "0x1";
          if (replacement === "repriced") {
            tx.gasPrice = "0x2";
            mock.state.bricks = 6n;
            mock.state.pharaoh = fixture.account;
          }
          return { ...(await rpc(req)), transactions: [tx] };
        }
        return rpc(req);
      };
      const { page } = await setup(mock);
      await connect(page);
      await page
        .getByRole("button", { name: "Build a brick", exact: true })
        .click();
      const stage =
        replacement === "repriced"
          ? "confirmed"
          : replacement === "cancelled"
            ? "cancelled"
            : "replaced";
      await page
        .getByText(`Build a brick: ${stage}.`, { exact: true })
        .waitFor();
      assert.equal(await page.locator(".transaction-feed li").count(), 1);
      assert.equal(
        await page.locator(".transaction-feed a").getAttribute("href"),
        `${mock.config.network.explorer}/tx/${replacementHash}`,
      );
      assert.doesNotMatch(
        await page.locator(".transaction-feed").innerText(),
        /waiting|pending|unknown/,
      );
      if (replacement !== "repriced") {
        await page
          .getByText(
            stage === "cancelled"
              ? "Build cancelled. No brick was placed."
              : "Build a brick: replaced by a different transaction.",
            { exact: false },
          )
          .waitFor();
        assert.equal(
          await page
            .getByText("Transaction confirmed.", { exact: false })
            .count(),
          0,
        );
        assert.equal(
          await page
            .getByRole("button", {
              name: "Check transaction receipt",
              exact: true,
            })
            .count(),
          0,
        );
        assert.equal(mock.state.bricks, 5n);
      } else
        await page.getByText("You are Pharaoh.", { exact: false }).waitFor();
      if (replacement === "cancelled") {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: output + "revision-cancel-390.png" });
      }
    });
  }
  await test("Cancelled swap skips its success callback and remains available for review", async () => {
    const mock = createMock(),
      rpc = mock.rpc;
    const a = `0x${"c".repeat(64)}`,
      b = `0x${"d".repeat(64)}`;
    let tx;
    mock.rpc = async (req) => {
      if (req.method === "eth_sendTransaction") {
        mock.state.transactions.push({ ...req.params[0], hash: a });
        mock.state.block++;
        tx = await rpc({ method: "eth_getTransactionByHash", params: [a] });
        return a;
      }
      if (req.method === "eth_getTransactionReceipt" && req.params[0] === a)
        return null;
      if (req.method === "eth_getBlockByNumber" && req.params[1] && tx)
        return {
          ...(await rpc(req)),
          transactions: [
            { ...tx, hash: b, to: fixture.account, input: "0x", value: "0x0" },
          ],
        };
      return rpc(req);
    };
    const { page } = await setup(mock);
    await connect(page);
    await page.locator("#swap-amount").fill("0.001");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await page
      .getByRole("button", { name: "Swap tokens", exact: true })
      .click();
    await page.getByText("Swap tokens: cancelled.", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByText("Swap confirmed. Get a new quote to trade again.", {
          exact: true,
        })
        .count(),
      0,
    );
    assert(
      await page
        .getByRole("button", { name: "Swap tokens", exact: true })
        .isEnabled(),
    );
    assert.equal(mock.state.transactions.length, 1);
  });
  await test("Full Tomb value is visible, selectable and wrapped at 320/390/1440; Build stays on mobile first screen", async () => {
    const mock = createMock();
    mock.state.tomb = 459121056326344n;
    const { page } = await setup(mock);
    const boxes = [];
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(page);
      const exact = page.locator(".tomb-exact");
      assert(await exact.isVisible());
      assert.equal(
        await exact.innerText(),
        `${width < 660 ? "" : "Exact: "}0.000459121056326344 ETH`,
      );
      assert.notEqual(
        await exact.evaluate((el) => getComputedStyle(el).userSelect),
        "none",
      );
      if (width < 660)
        assert(!(await page.locator(".tomb-overview").isVisible()));
      const box = await page
        .getByRole("button", { name: "Connect wallet to build", exact: true })
        .boundingBox();
      boxes.push({ width, action: box });
      if (width === 390) {
        assert(box.y + box.height <= 844);
        await page.screenshot({ path: output + "revision-tomb-390.png" });
      }
    }
    mock.state.bricks = 651n;
    await page.setViewportSize({ width: 390, height: 844 });
    await refresh(page, mock);
    const combined = await page
      .getByRole("button", { name: "Connect wallet to build", exact: true })
      .boundingBox();
    assert(
      combined.y + combined.height <= 844,
      "Large-round detail plus full Tomb pushes Build below the fold",
    );
    boxes.push({
      width: 390,
      state: "651 bricks and full Tomb",
      action: combined,
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: output + "revision-pyramid-tomb-390.png" });
    mock.state.tomb = 2n ** 256n - 1n;
    await refresh(page, mock);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(page);
      assert(await page.locator(".tomb-exact").isVisible());
    }
    return { boxes };
  });
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    output + "revision-results.json",
    JSON.stringify(
      {
        kind: "Worker-run mocked Chromium regressions; no broadcasts",
        at: new Date().toISOString(),
        results,
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  `${results.filter((r) => r.passed).length}/${results.length} revision scenarios passed`,
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
