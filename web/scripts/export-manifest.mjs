import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { keccak256, toBytes, isAddress } from "viem";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = async (p) =>
  JSON.parse(await readFile(path.join(root, p), "utf8"));
const handoff = await read("web/deployment-handoff.json"),
  chain = await read("web/network-handoff.json");
const canonical = (x) =>
  Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, canonical(x[k])]),
        )
      : x;
const abiHash = (x) =>
  keccak256(toBytes(JSON.stringify(canonical(x)))).slice(2);
const sha = (x) => createHash("sha256").update(x).digest("hex");
assert.equal(handoff.version, 1);
assert.equal(handoff.chainId, chain.network.chainId);
assert.match(handoff.sourceCommit, /^[a-f0-9]{40}$/);
assert.match(handoff.attestationHash, /^[a-f0-9]{64}$/);
const checking = process.argv.includes("--check");
const expected = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts: handoff.contracts.map((c) => ({
    name: c.name,
    address: c.address,
    abiHash: c.abiHash,
    abiPath: `abi/${c.name}.json`,
  })),
  assets: [],
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  network: chain.network,
  ...(chain.walletAddChain ? { walletAddChain: chain.walletAddChain } : {}),
};
await mkdir(path.join(root, "dist/abi"), { recursive: true });
const names = [
  ...new Set([
    ...handoff.contracts.map((c) => c.name),
    "StoneVault",
    "PonziRewards",
  ]),
];
for (const name of names) {
  assert.match(name, /^[A-Za-z][A-Za-z0-9]*$/);
  const bytes = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:docs/abi/${name}.json`],
    { cwd: root },
  );
  const abi = JSON.parse(bytes);
  assert(Array.isArray(abi));
  const declared = handoff.contracts.find((c) => c.name === name);
  if (declared) {
    assert(isAddress(declared.address));
    assert.equal(
      abiHash(abi),
      declared.abiHash,
      `${name} canonical ABI binding`,
    );
  }
  const target = path.join(root, "dist/abi", `${name}.json`);
  if (checking)
    assert.deepEqual(await readFile(target), bytes, `${name} pinned ABI bytes`);
  else await writeFile(target, bytes);
}
// Receipt/block evidence is derived from the handoff; it contains no independent addresses or RPCs.
const provenance = {
  sourceCommit: handoff.sourceCommit,
  deployments: handoff.contracts.map(({ name, txHash, blockNumber }) => ({
    name,
    txHash,
    blockNumber,
  })),
};
if (checking)
  assert.deepEqual(await read("dist/launch-provenance.json"), provenance);
else
  await writeFile(
    path.join(root, "dist/launch-provenance.json"),
    JSON.stringify(provenance, null, 2) + "\n",
  );
async function walk(dir = "") {
  const result = [];
  for (const entry of await readdir(path.join(root, "dist", dir), {
    withFileTypes: true,
  })) {
    const rel = path.posix.join(dir, entry.name);
    assert(!entry.isSymbolicLink(), "No symlink assets");
    if (entry.isDirectory()) result.push(...(await walk(rel)));
    else if (rel !== "imd-deployment.json") result.push(rel);
  }
  return result;
}
let total = 0;
for (const file of (await walk()).sort()) {
  assert(!file.split("/").includes(".."));
  const bytes = await readFile(path.join(root, "dist", file));
  assert(bytes.length <= 8388608);
  total += bytes.length;
  expected.assets.push({ path: file, sha256: sha(bytes) });
}
assert(expected.assets.length <= 128);
assert(
  total < 8 * 1024 * 1024,
  "Export must leave room in the 8 MiB submission budget",
);
const target = path.join(root, "dist/imd-deployment.json");
if (checking)
  assert.deepEqual(
    await read("dist/imd-deployment.json"),
    expected,
    "Manifest matches handoff and final asset bytes",
  );
else await writeFile(target, JSON.stringify(expected, null, 2) + "\n");
console.log(
  `${checking ? "Verified" : "Generated"} manifest: ${expected.contracts.length} attested contracts, ${names.length} pinned ABIs, ${expected.assets.length} assets, ${total} asset bytes. Pool key/network copied unchanged.`,
);
