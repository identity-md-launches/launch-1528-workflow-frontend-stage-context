import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const origin = "https://ponziram.sites.imd.fun";
const root = path.resolve(new URL("../../dist/", import.meta.url).pathname);
const browser = await chromium.launch();
const report = {
  at: new Date().toISOString(),
  kind: "Real WalletConnect relay handshake with production-origin browser routing; no wallet pairing, no signing, no transaction broadcast",
};
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.route(origin + "/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const file = path.resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(root + "/")) return route.abort();
    try {
      const contentType =
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".json": "application/json",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".webp": "image/webp",
          ".woff2": "font/woff2",
        }[path.extname(file)] || "application/octet-stream";
      await route.fulfill({
        status: 200,
        contentType,
        body: await readFile(file),
      });
    } catch {
      await route.fulfill({ status: 404, body: "Missing file" });
    }
  });
  const p = await context.newPage();
  await p.goto(origin);
  await p.locator(".wallet-button").click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: /WalletConnect/ })
    .click();
  await p
    .getByRole("img", { name: "WalletConnect pairing QR code" })
    .waitFor({ timeout: 45000 });
  assert(
    await p
      .getByText("Scan to approve the connection.", { exact: true })
      .isVisible(),
  );
  report.passed = true;
  report.qrDisplayed = true;
  await p.getByRole("button", { name: "Close dialog" }).click();
  assert.equal(await p.getByRole("dialog").count(), 0);
  report.cancelClosed = true;
} catch (e) {
  report.passed = false;
  report.error = String(e.message).replace(
    /wc:[^\s]+/g,
    "[pairing URI redacted]",
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    new URL("../../docs/revamp-evidence/walletconnect.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(report);
}
