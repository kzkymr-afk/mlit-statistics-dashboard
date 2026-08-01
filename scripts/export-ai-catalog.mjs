import { resolve } from "node:path";

import { exportAiCatalog } from "./lib/export-ai-catalog.mjs";

const root = resolve(import.meta.dirname, "..");
const result = exportAiCatalog(
  resolve(root, process.env.MLIT_SYSTEM_PUBLIC_DIR || "public/system"),
);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
