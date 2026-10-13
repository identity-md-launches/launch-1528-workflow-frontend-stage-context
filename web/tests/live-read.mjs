// Live checks are read-only; supply LOCAL_RPC when the worker provides a relay.
import { readFile } from "node:fs/promises";
if (!process.env.LOCAL_RPC) {
  const manifest = JSON.parse(
    await readFile(
      new URL("../../dist/imd-deployment.json", import.meta.url),
      "utf8",
    ),
  );
  process.env.LOCAL_RPC = manifest.network.rpcUrls[0];
}
await import("./revamp-live.mjs");
