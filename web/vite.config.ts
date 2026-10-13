import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFile } from "node:fs/promises";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "serve-verified-deployment-in-development",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const pathname = request.url?.split("?")[0] || "";
          if (
            !/^\/(imd-deployment\.json|launch-provenance\.json|abi\/[A-Za-z0-9]+\.json)$/.test(
              pathname,
            )
          )
            return next();
          try {
            const content = await readFile(
              new URL(`../dist${pathname}`, import.meta.url),
            );
            response.setHeader("Content-Type", "application/json");
            response.setHeader("Cache-Control", "no-store");
            response.end(content);
          } catch {
            response.statusCode = 503;
            response.end(
              "Run the production build to generate deployment assets.",
            );
          }
        });
      },
    },
  ],
  build: { outDir: "../dist", emptyOutDir: true, assetsInlineLimit: 0 },
  server: { host: "0.0.0.0" },
});
