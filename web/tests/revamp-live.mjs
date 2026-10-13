// Read-only checks against Ethereum. LOCAL_RPC is supplied only by the worker, never built into dist.
import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { serveExport } from "../scripts/preview.mjs";
import {
  createPublicClient,
  http,
  decodeFunctionResult,
  encodeFunctionData,
} from "viem";
const endpoint = process.env.LOCAL_RPC;
if (!endpoint) throw Error("Set LOCAL_RPC to the worker-provided endpoint.");
const output = new URL("../../docs/revamp-evidence/", import.meta.url);
await mkdir(output, { recursive: true });
const manifest = JSON.parse(
  await readFile(
    new URL("../../dist/imd-deployment.json", import.meta.url),
    "utf8",
  ),
);
const abis = {};
for (const name of ["Ponziramid", "LaunchToken", "StoneVault", "PonziRewards"])
  abis[name] = JSON.parse(
    await readFile(
      new URL(`../../dist/abi/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const { server, url } = await serveExport(),
  browser = await chromium.launch();
const evidence = {
  at: new Date().toISOString(),
  kind: "Live Ethereum, read-only, no injected wallet, no signatures or broadcasts",
  source: manifest.network.rpcUrls[0],
  errors: [],
  checks: [],
};
const rpc = async (method, params = []) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const result = await response.json();
  if (result.error) throw Error(result.error.message);
  return result.result;
};
try {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  // Same production URLs and bytes; the worker's endpoint performs the network request during this read-only test.
  await c.route(
    /^https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,
    async (route) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: route.request().postData(),
      });
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: await response.text(),
      });
    },
  );
  const p = await c.newPage();
  p.on("pageerror", (e) => evidence.errors.push(e.message));
  await p.goto(url);
  await p
    .locator(".under-arena")
    .getByRole("button", { name: /Block/ })
    .waitFor({ timeout: 45000 });
  await p.waitForFunction(()=>{const text=document.querySelector('.activity')?.textContent;return text && !text.includes('Reading recent events');},null,{timeout:30000});
  assert(!(await p.locator('.activity').innerText()).includes('Activity unavailable'));
  evidence.chainId = Number(await rpc("eth_chainId"));
  assert.equal(evidence.chainId, 1);
  evidence.block = Number(BigInt(await rpc("eth_blockNumber")));
  const game = manifest.contracts.find((c) => c.name === "Ponziramid").address,
    token = manifest.contracts.find((c) => c.name === "LaunchToken").address;
  const call = async (address, name, functionName, args = []) =>
    decodeFunctionResult({
      abi: abis[name],
      functionName,
      data: await rpc("eth_call", [
        {
          to: address,
          data: encodeFunctionData({ abi: abis[name], functionName, args }),
        },
        "latest",
      ]),
    });
  const [vault, rewards, round, quote, paused] = await Promise.all(
    ["vault", "rewards", "currentRound", "quote", "paused"].map((f) =>
      call(game, "Ponziramid", f),
    ),
  );
  evidence.bindings = { game, token, vault, rewards };
  evidence.round = round;
  evidence.quote = quote;
  evidence.paused = paused;
  for (const [name, address] of Object.entries({
    Ponziramid: game,
    LaunchToken: token,
    StoneVault: vault,
    PonziRewards: rewards,
  })) {
    const code = await rpc("eth_getCode", [address, "latest"]);
    assert(code.length > 2);
    evidence.checks.push({ name, codeBytes: (code.length - 2) / 2 });
  }
  assert.equal((await call(vault, "StoneVault", "game")).toLowerCase(), game);
  assert.equal(
    (await call(rewards, "PonziRewards", "game")).toLowerCase(),
    game,
  );
  assert.equal(
    (await call(rewards, "PonziRewards", "token")).toLowerCase(),
    token,
  );
  evidence.funded = await call(rewards, "PonziRewards", "isFunded");
  evidence.rewardBalance = await call(token, "LaunchToken", "balanceOf", [
    rewards,
  ]);
  evidence.activity = await p.locator(".activity").innerText();
  evidence.hero = await p.locator(".status-strip").innerText();
  await p.locator("#swap-amount").fill("0.001");
  await p.getByRole("button", { name: "Get quote", exact: true }).click();
  await p
    .getByText("Estimated receive", { exact: true })
    .waitFor({ timeout: 30000 });
  evidence.swapQuote = await p.locator(".quote-result").innerText();
  for (const width of [390, 1440]) {
    await p.setViewportSize({ width, height: 844 });
    await p.evaluate(() => {
      scrollTo(0, 0);
      document.querySelector(".page-scroll").scrollTo(0, 0);
    });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({
      path: new URL(`live-${width}.webp`, output).pathname,
      type: "webp",
      quality: 85,
      fullPage: true,
    });
    if (width === 390) {
      const box = await p.locator(".main-action").boundingBox(),
        bar = await p.locator(".mobile-bar").boundingBox();
      evidence.firstScreenBuild = { box, bar };
      assert(box.y + box.height <= bar.y);
    }
  }
  assert.deepEqual(evidence.errors, []);
  evidence.passed = true;
} catch (e) {
  evidence.passed = false;
  evidence.failure = e.stack;
  process.exitCode = 1;
  console.error(e.stack);
} finally {
  await browser.close();
  server.close();
  await writeFile(
    new URL("live-read.json", output),
    JSON.stringify(
      evidence,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
  console.log(
    JSON.stringify(
      evidence,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
}
