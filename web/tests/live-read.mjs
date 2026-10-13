// Read-only production smoke test. Does not install a wallet or send any transaction.
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  encodeFunctionData,
  decodeFunctionResult,
  decodeEventLog,
  encodeEventTopics,
} from "viem";
import assert from "node:assert/strict";
import { serveExport } from "../scripts/preview.mjs";
const root = new URL("../../", import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));
const manifest = await json("dist/imd-deployment.json"),
  provenance = await json("dist/launch-provenance.json");
const abis = {};
for (const name of ["LaunchToken", "Ponziramid", "StoneVault", "PonziRewards"])
  abis[name] = await json(`dist/abi/${name}.json`);
const game = manifest.contracts.find((x) => x.name === "Ponziramid").address,
  token = manifest.contracts.find((x) => x.name === "LaunchToken").address;
const launch = provenance.deployments.find((x) => x.name === "LaunchToken");
const { server, url } = await serveExport();
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const errors = [],
  localFailures = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.url().startsWith(url) && r.status() >= 400)
    localFailures.push({ url: r.url(), status: r.status() });
});
const output = new URL("docs/frontend-evidence/", root);
await mkdir(output, { recursive: true });
const evidence = {
  kind: "Read-only live chain observations from the production export; no wallet or transaction broadcast",
  at: new Date().toISOString(),
  chainId: manifest.chainId,
  sourceCommit: manifest.sourceCommit,
};
try {
  await page.goto(url);
  await page
    .getByText("Read at block", { exact: false })
    .waitFor({ timeout: 45000 });
  const rpc = async (method, params = []) => {
    const r = await page.evaluate(
      async ({ url, method, params }) => {
        return (
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          })
        ).json();
      },
      { url: manifest.network.rpcUrls[0], method, params },
    );
    if (r.error) throw Error(r.error.message);
    return r.result;
  };
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
  evidence.rpc = manifest.network.rpcUrls[0];
  evidence.observedChainId = Number(await rpc("eth_chainId"));
  assert.equal(evidence.observedChainId, manifest.chainId);
  evidence.blockNumber = Number(BigInt(await rpc("eth_blockNumber")));
  const [vault, rewards, owner, quote, roundId, paused] = await Promise.all(
    ["vault", "rewards", "owner", "quote", "currentRound", "paused"].map((f) =>
      call(game, "Ponziramid", f),
    ),
  );
  evidence.bindings = {
    game,
    token,
    vault,
    rewards,
    owner,
    vaultGame: await call(vault, "StoneVault", "game"),
    rewardsGame: await call(rewards, "PonziRewards", "game"),
    rewardsToken: await call(rewards, "PonziRewards", "token"),
  };
  assert.equal(evidence.bindings.vaultGame.toLowerCase(), game);
  assert.equal(evidence.bindings.rewardsGame.toLowerCase(), game);
  assert.equal(evidence.bindings.rewardsToken.toLowerCase(), token);
  evidence.code = [];
  for (const [name, address] of Object.entries({
    LaunchToken: token,
    Ponziramid: game,
    StoneVault: vault,
    PonziRewards: rewards,
  })) {
    const code = await rpc("eth_getCode", [address, "latest"]);
    assert(code.length > 2);
    evidence.code.push({
      name,
      address,
      bytes: (code.length - 2) / 2,
      sha256: createHash("sha256")
        .update(Buffer.from(code.slice(2), "hex"))
        .digest("hex"),
    });
  }
  const initialFunding = await call(rewards, "PonziRewards", "INITIAL_FUNDING");
  const receipt = await rpc("eth_getTransactionReceipt", [launch.txHash]);
  assert.equal(receipt.status, "0x1");
  assert.equal(Number(BigInt(receipt.blockNumber)), launch.blockNumber);
  const transfers = receipt.logs
    .filter((x) => x.address.toLowerCase() === token)
    .map((log) => {
      try {
        return decodeEventLog({
          abi: abis.LaunchToken,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        return null;
      }
    })
    .filter(
      (x) =>
        x?.eventName === "Transfer" &&
        x.args.from.toLowerCase() === receipt.to.toLowerCase() &&
        x.args.value >= initialFunding,
    );
  assert.equal(transfers.length, 1);
  const creator = transfers[0].args.to;
  evidence.deploymentReceipt = {
    hash: launch.txHash,
    blockNumber: launch.blockNumber,
    status: "success",
    allocationRecipient: creator,
    allocationMinorUnits: transfers[0].args.value,
  };
  evidence.game = {
    roundId,
    paused,
    quoteWei: {
      roundId: quote[0],
      price: quote[1],
      stone: quote[2],
      mortar: quote[3],
    },
  };
  evidence.funding = {
    initialFunding,
    initialFundingReached: await call(rewards, "PonziRewards", "isFunded"),
    rewardBalance: await call(token, "LaunchToken", "balanceOf", [rewards]),
    committed: await call(rewards, "PonziRewards", "committed"),
    uncommitted: await call(rewards, "PonziRewards", "uncommitted"),
    creatorBalance: await call(token, "LaunchToken", "balanceOf", [creator]),
  };
  evidence.vault = {
    totalStone: await call(vault, "StoneVault", "totalStone"),
    balance: BigInt(await rpc("eth_getBalance", [vault, "latest"])),
  };
  assert(evidence.vault.balance >= evidence.vault.totalStone);
  const end = Math.min(evidence.blockNumber, launch.blockNumber + 4999);
  const logs = await rpc("eth_getLogs", [
    {
      address: rewards,
      fromBlock: `0x${launch.blockNumber.toString(16)}`,
      toBlock: `0x${end.toString(16)}`,
      topics: encodeEventTopics({
        abi: abis.PonziRewards,
        eventName: "Funded",
      }),
    },
  ]);
  evidence.fundingHistory = {
    fromBlock: launch.blockNumber,
    toBlock: end,
    completeThroughObservation: end === evidence.blockNumber,
    transactionHashes: logs.map((x) => x.transactionHash),
  };
  await page.getByLabel("You pay (ETH)", { exact: true }).fill("0.001");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#trade .quote-result") ||
      document.querySelector("#trade [role=alert]"),
    null,
    { timeout: 30000 },
  );
  evidence.liveQuote = {
    input: "0.001 ETH",
    renderedResult: await page.locator("#trade").innerText(),
    broadcast: false,
  };
  for (const width of [320, 390, 850, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert(dimensions.scrollWidth <= dimensions.width);
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: new URL(`live-${width}.png`, output).pathname,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page
    .getByRole("button", { name: "Connect wallet to build", exact: true })
    .boundingBox();
  assert(box.y + box.height <= 844);
  evidence.primaryActionAt390 = box;
  evidence.renderedFunding = await page.locator("#funding").innerText();
  evidence.consoleErrors = errors;
  evidence.localFailures = localFailures;
  assert.deepEqual(errors, []);
  assert.deepEqual(localFailures, []);
  await writeFile(
    new URL("live-read.json", output),
    JSON.stringify(
      evidence,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ) + "\n",
  );
  console.log(
    `Live read checks passed at chain ${evidence.observedChainId}, block ${evidence.blockNumber}. ${logs.length} funding events. No transactions broadcast.`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
