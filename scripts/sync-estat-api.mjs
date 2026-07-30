import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP_ID = process.env.ESTAT_APP_ID?.trim();
const API_BASE = "https://api.e-stat.go.jp/rest/3.0/app/json";
const targets = [
  { datasetId: "building-starts", statsCode: "00600120" },
  { datasetId: "orders-major50", statsCode: "00600130" },
];

if (!APP_ID) {
  process.stdout.write(
    "ESTAT_APP_IDが未設定のため、API棚卸しをスキップしました。\n",
  );
  process.exit(0);
}

async function requestJson(path, parameters) {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("lang", "J");
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      "user-agent": "MLITStatisticsPanel/1.0",
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`e-Stat API ${path} failed: ${response.status}`);
  }
  return response.json();
}

for (const target of targets) {
  const rawDir = resolve(ROOT, "data/raw/api", target.datasetId);
  const normalizedDir = resolve(ROOT, "data/normalized/api", target.datasetId);
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(normalizedDir, { recursive: true });
  const response = await requestJson("getStatsList", {
    statsCode: target.statsCode,
    searchKind: 1,
    limit: 100000,
  });
  writeFileSync(
    resolve(rawDir, "stats-list.json"),
    JSON.stringify(response, null, 2),
  );
  const result = response.GET_STATS_LIST?.DATALIST_INF;
  const entries = Array.isArray(result?.TABLE_INF)
    ? result.TABLE_INF
    : result?.TABLE_INF
      ? [result.TABLE_INF]
      : [];
  const annual = entries
    .filter((entry) => String(entry.CYCLE ?? "").includes("年"))
    .map((entry) => ({
      statsDataId: String(entry["@id"] ?? ""),
      statisticsName:
        typeof entry.STAT_NAME === "object"
          ? String(entry.STAT_NAME["$"] ?? "")
          : String(entry.STAT_NAME ?? ""),
      title:
        typeof entry.TITLE === "object"
          ? String(entry.TITLE["$"] ?? "")
          : String(entry.TITLE ?? ""),
      cycle: String(entry.CYCLE ?? ""),
      surveyDate: String(entry.SURVEY_DATE ?? ""),
      openDate: String(entry.OPEN_DATE ?? ""),
      updatedDate: String(entry.UPDATED_DATE ?? ""),
    }))
    .filter((entry) => entry.statsDataId);
  writeFileSync(
    resolve(normalizedDir, "annual-tables.json"),
    JSON.stringify(
      {
        datasetId: target.datasetId,
        statsCode: target.statsCode,
        fetchedAt: new Date().toISOString(),
        status: "mapping-pending",
        tables: annual,
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    `${target.datasetId}: ${annual.length} annual API tables discovered\n`,
  );
}
