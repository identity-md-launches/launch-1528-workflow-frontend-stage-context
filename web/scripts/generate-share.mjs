import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const art = await readFile(
  new URL("../public/art/desert-noir.webp", import.meta.url),
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<html><body style="margin:0;background:#10120f;color:#eeeade;font-family:Arial,sans-serif"><div style="position:relative;width:1200px;height:630px;overflow:hidden"><img src="data:image/webp;base64,${art.toString("base64")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.6"/><div style="position:absolute;inset:0;background:linear-gradient(90deg,#10120fe8 0%,#10120f88 58%,transparent)"></div><div style="position:relative;padding:50px 60px"><div style="font-weight:bold;font-size:24px;letter-spacing:-1px;color:#e8b969">▲ PONZIRAMID.</div><h1 style="margin:90px 0 10px;font-size:80px;line-height:1;letter-spacing:-4px">Build a brick.</h1><div style="font:italic 72px Georgia,serif;color:#e8b969;letter-spacing:-3px">Heavy is the crown.</div><p style="font-size:23px;color:#cac4b0;margin-top:28px">An on-chain pyramid game. Last builder takes the throne.</p><div style="margin-top:65px;color:#cac4b0;font-size:18px">90% refundable. 10% at risk. No profit promises.</div></div></div></body></html>`,
  );
  await page.screenshot({
    path: new URL("../public/share.png", import.meta.url).pathname,
  });
  console.log("Generated original 1200×630 share card.");
} finally {
  await browser.close();
}
