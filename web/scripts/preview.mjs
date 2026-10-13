import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
export async function serveExport(port = 0) {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../dist",
  );
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const p = decodeURIComponent(url.pathname);
      if (!p.startsWith("/preview/")) {
        res.writeHead(302, { Location: "/preview/" });
        res.end();
        return;
      }
      const rel = p.slice("/preview/".length) || "index.html";
      const file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep)) throw Error("Invalid path");
      if (!(await stat(file)).isFile()) throw Error("Missing");
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/preview/` };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await serveExport(Number(process.argv[2] || 4173));
  console.log(url);
}
