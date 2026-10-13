import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const project = (x, y, z) => [780 + (x - y) * 30, 300 + (x + y) * 15 - z * 33];
const points = (a) => a.map((p) => p.join(",")).join(" ");
let stones = "";
for (let z = 0; z < 8; z++)
  for (let y = 0; y < 8 - z; y++)
    for (let x = 0; x < 8 - z; x++) {
      const xx = x + z / 2,
        yy = y + z / 2,
        a = project(xx, yy, z),
        b = project(xx + 0.96, yy, z),
        c = project(xx + 0.96, yy + 0.96, z),
        d = project(xx, yy + 0.96, z),
        down = (p) => [p[0], p[1] + 29];
      stones += `<polygon points="${points([d, c, down(c), down(d)])}" fill="#c49860"/><polygon points="${points([b, c, down(c), down(b)])}" fill="#966842"/><polygon points="${points([a, b, c, d])}" fill="#ead1a5"/>`;
    }
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#121310"/><rect x="32" y="32" width="1136" height="566" rx="14" fill="#171815"/><path d="m70 92 15-26 15 26Z" fill="#dfc8a4"/><text x="113" y="89" font-family="Arial,sans-serif" font-size="25" font-weight="bold" fill="#dfc8a4">PONZIRAMID</text><text x="68" y="254" font-family="Georgia,serif" font-size="86" font-weight="bold" letter-spacing="-3" fill="#f6efe1">Build your</text><text x="68" y="342" font-family="Georgia,serif" font-size="86" font-weight="bold" letter-spacing="-3" fill="#f6efe1">brick.</text><text x="72" y="405" font-family="Arial,sans-serif" font-size="24" fill="#b9ae99">An on-chain pyramid game.</text><rect x="72" y="456" width="209" height="56" rx="6" fill="#f1a35e"/><text x="176" y="492" text-anchor="middle" font-family="Arial,sans-serif" font-size="21" font-weight="bold" fill="#121310">Watch the crown</text><ellipse cx="780" cy="523" rx="270" ry="40" fill="#121310"/>${stones}<path d="m757 155-6-23 15 9 14-19 14 19 15-9-6 23Z" fill="none" stroke="#d8b675" stroke-width="3"/><path d="M69 550h1062" stroke="#393b31"/><text x="72" y="579" font-family="Arial,sans-serif" font-size="19" fill="#b9ae99">90% of each brick is refundable. 10% is not. Not an investment.</text></svg>`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await mkdir(new URL("../public/", import.meta.url), { recursive: true });
  await page.screenshot({
    path: new URL("../public/share.png", import.meta.url).pathname,
  });
  console.log("Generated 1200×630 local share image.");
} finally {
  await browser.close();
}
