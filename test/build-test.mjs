import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [resolve(__dirname, "smoke.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2020",
  alias: { obsidian: resolve(__dirname, "mock-obsidian.ts") },
  outfile: resolve(__dirname, "smoke.mjs"),
  logLevel: "info",
});
