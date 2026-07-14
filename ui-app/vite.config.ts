import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** Dev-only middleware: serve GET /artifacts/payload.json from the repo-root
 *  payload.json (written by `python3 build_ui.py`), so `npm run dev` runs
 *  against real data without any packing step. */
function payloadServer(): Plugin {
  const payloadPath = fileURLToPath(new URL("../payload.json", import.meta.url));
  return {
    name: "mrr-payload-server",
    configureServer(server) {
      server.middlewares.use("/artifacts/payload.json", (_req, res) => {
        if (!fs.existsSync(payloadPath)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end("payload.json not found - run `python3 build_ui.py` in the repo root first.");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        fs.createReadStream(payloadPath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSingleFile(), payloadServer()],
  build: {
    target: "es2019",
    // singlefile inlines everything; keep sourcemaps off for a lean artifact
    sourcemap: false,
  },
});
