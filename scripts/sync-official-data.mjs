import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadOfficialStatistics } from "../lib/official-statistics.ts";

const destination = fileURLToPath(
  new URL("../data/snapshots/official-snapshot.json", import.meta.url),
);
const payload = await loadOfficialStatistics();
payload.metadata.mode = "snapshot";
await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  `synced monthly=${payload.monthly.length} prefectures=${payload.prefectures.length} latest=${payload.metadata.surveyPeriod}`,
);
