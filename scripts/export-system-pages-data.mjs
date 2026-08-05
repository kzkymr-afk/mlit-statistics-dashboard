import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

import { exportAiCatalog } from "./lib/export-ai-catalog.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DATABASE_PATH = resolve(
  ROOT,
  process.env.MLIT_SYSTEM_DATABASE_PATH ??
    "data/database/mlit-statistics-system.sqlite",
);
const OUTPUT_DIR = resolve(
  ROOT,
  process.env.MLIT_SYSTEM_PUBLIC_DIR ?? "public/system",
);
const BUILD_DIR = `${OUTPUT_DIR}.building`;
const MAX_GITHUB_FILE_BYTES = 25 * 1024 * 1024;
const MAX_RELEASE_ASSET_BYTES = 2 * 1024 * 1024 * 1024;
const BUNDLE_PREFIX_LENGTH = 2;
const EXTERNAL_SHARD_DIR = process.env.MLIT_SYSTEM_SHARD_DIR
  ? resolve(ROOT, process.env.MLIT_SYSTEM_SHARD_DIR)
  : "";
const SHARD_OUTPUT_DIR =
  EXTERNAL_SHARD_DIR || resolve(OUTPUT_DIR, "shards");
const SHARD_BUILD_DIR = EXTERNAL_SHARD_DIR
  ? `${SHARD_OUTPUT_DIR}.building`
  : resolve(BUILD_DIR, "shards");
const SERIES_ASSET_BASE_URL = (
  process.env.MLIT_SERIES_ASSET_BASE_URL || "system/shards"
).replace(/\/$/, "");
const ONLY_DATASET_IDS = (
  process.env.MLIT_SYSTEM_ONLY_DATASET?.trim() ?? ""
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!existsSync(DATABASE_PATH)) {
  throw new Error(
    `正規化DBがありません: ${DATABASE_PATH}\n` +
      "先に ESTAT_APP_ID を設定して npm run sync:estat-api を実行してください。",
  );
}

if (ONLY_DATASET_IDS.length > 0 && EXTERNAL_SHARD_DIR) {
  throw new Error(
    "データセット差分生成と外部分割ディレクトリは同時に指定できません。",
  );
}
if (existsSync(BUILD_DIR)) rmSync(BUILD_DIR, { recursive: true });
if (ONLY_DATASET_IDS.length > 0) {
  if (!existsSync(OUTPUT_DIR)) {
    throw new Error(
      "差分生成の基になる公開データがありません。先に全体生成が必要です。",
    );
  }
}
mkdirSync(BUILD_DIR, { recursive: true });
mkdirSync(SHARD_BUILD_DIR, { recursive: true });
if (EXTERNAL_SHARD_DIR) {
  if (existsSync(SHARD_BUILD_DIR)) {
    rmSync(SHARD_BUILD_DIR, { recursive: true });
  }
  mkdirSync(SHARD_BUILD_DIR, { recursive: true });
}

function writeBuffer(path, value) {
  const target = resolve(BUILD_DIR, path);
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) unlinkSync(target);
  writeFileSync(target, value);
  if (statSync(target).size > MAX_GITHUB_FILE_BYTES) {
    throw new Error(
      `GitHub Pages用ファイルが25MiBを超えました: ${target}`,
    );
  }
}

function writeJson(path, value) {
  writeBuffer(path, Buffer.from(`${JSON.stringify(value)}\n`));
}

function writeGzipJson(path, value) {
  writeBuffer(
    path,
    gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 }),
  );
}

function writeShard(datasetId, prefix, value) {
  const target = resolve(
    SHARD_BUILD_DIR,
    `${datasetId}-${prefix}.json.gz`,
  );
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) unlinkSync(target);
  writeFileSync(
    target,
    gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 }),
  );
  const maximumBytes = EXTERNAL_SHARD_DIR
    ? MAX_RELEASE_ASSET_BYTES
    : MAX_GITHUB_FILE_BYTES;
  if (statSync(target).size > maximumBytes) {
    throw new Error(
      `公開用系列ファイルが${EXTERNAL_SHARD_DIR ? "2GiB" : "25MiB"}を超えました: ${target}`,
    );
  }
}

function publicPath(path) {
  return `system/${relative(BUILD_DIR, resolve(BUILD_DIR, path)).replaceAll("\\", "/")}`;
}

const db = new DatabaseSync(DATABASE_PATH, { readOnly: true });
const existingCatalog =
  ONLY_DATASET_IDS.length > 0
    ? JSON.parse(readFileSync(resolve(OUTPUT_DIR, "catalog.json"), "utf8"))
    : null;
if (ONLY_DATASET_IDS.length > 0) {
  for (const datasetId of ONLY_DATASET_IDS) {
    const knownDataset = db
      .prepare("SELECT 1 FROM datasets WHERE id = ?")
      .get(datasetId);
    if (!knownDataset) {
      throw new Error(`未登録のデータセットです: ${datasetId}`);
    }
  }
}
const datasetRows = db
  .prepare(
    `SELECT id, title,
            government_statistics_code AS governmentStatisticsCode,
            provided_statistics_id AS providedStatisticsId,
            source_url AS sourceUrl, fiscal_year_from AS fiscalYearFrom
       FROM datasets
      ${ONLY_DATASET_IDS.length > 0
        ? `WHERE id IN (${ONLY_DATASET_IDS.map(() => "?").join(", ")})`
        : ""}
      ORDER BY title`,
  )
  .all(...ONLY_DATASET_IDS);
const datasets = existingCatalog
  ? [
      ...existingCatalog.datasets.filter(
        (dataset) => !ONLY_DATASET_IDS.includes(dataset.id),
      ),
      ...datasetRows,
    ].toSorted((left, right) => left.title.localeCompare(right.title, "ja"))
  : datasetRows;
const tableRows = db
  .prepare(
    `SELECT t.id, t.dataset_id AS datasetId, t.title,
            t.statistics_name AS statisticsName, t.cycle,
            t.survey_date AS surveyDate, t.open_date AS openDate,
            t.updated_date AS updatedDate, t.source_kind AS sourceKind,
            t.source_url AS sourceUrl, t.registry_status AS registryStatus,
            COUNT(s.id) AS seriesCount,
            COALESCE(SUM(s.observation_count), 0) AS observationCount
       FROM statistical_tables t
       LEFT JOIN series s ON s.table_id = t.id
      ${ONLY_DATASET_IDS.length > 0
        ? `WHERE t.dataset_id IN (${ONLY_DATASET_IDS.map(() => "?").join(", ")})`
        : ""}
      GROUP BY t.id
      ORDER BY t.dataset_id, t.title, t.id`,
  )
  .all(...ONLY_DATASET_IDS);
const tables = existingCatalog
  ? [
      ...existingCatalog.tables.filter(
        (table) => !ONLY_DATASET_IDS.includes(table.datasetId),
      ),
      ...tableRows,
    ].toSorted(
      (left, right) =>
        left.datasetId.localeCompare(right.datasetId) ||
        left.title.localeCompare(right.title, "ja") ||
        left.id.localeCompare(right.id),
    )
  : tableRows;
const sourceRows = db
  .prepare(
    `SELECT os.table_id AS tableId, os.id AS sourceId,
            os.source_url AS sourceUrl, os.published_at AS publishedAt,
            os.retrieved_at AS retrievedAt
       FROM observation_sources os
       LEFT JOIN statistical_tables t ON t.id = os.table_id
      ${ONLY_DATASET_IDS.length > 0
        ? `WHERE t.dataset_id IN (${ONLY_DATASET_IDS.map(() => "?").join(", ")})`
        : ""}
      ORDER BY os.table_id`,
  )
  .all(...ONLY_DATASET_IDS);
const sourceEntries = sourceRows.map((source) => [
      source.tableId,
      {
        sourceId: source.sourceId,
        sourceUrl: source.sourceUrl,
        publishedAt: source.publishedAt,
        retrievedAt: source.retrievedAt,
      },
    ]);
const staleSourceTableIds = new Set(
  (existingCatalog?.tables ?? [])
    .filter((table) => ONLY_DATASET_IDS.includes(table.datasetId))
    .map((table) => table.id),
);
const sources = {
  ...Object.fromEntries(
    Object.entries(existingCatalog?.sources ?? {}).filter(
      ([tableId]) => !staleSourceTableIds.has(tableId),
    ),
  ),
  ...Object.fromEntries(sourceEntries),
};

const dimensionStatement = db.prepare(
  `SELECT id, api_key AS apiKey, name, description, sort_order AS sortOrder
     FROM dimensions
    WHERE table_id = ?
    ORDER BY sort_order, api_key`,
);
const dimensionValueStatement = db.prepare(
  `SELECT code, name, level, parent_code AS parentCode, unit,
          sort_order AS sortOrder
     FROM dimension_values
    WHERE dimension_id = ?
    ORDER BY sort_order, code`,
);
const seriesExistsStatement = db.prepare(
  "SELECT 1 FROM series WHERE id = ?",
);
const fallbackSeriesStatement = db.prepare(
  `SELECT id
     FROM series
    WHERE table_id = ?
    ORDER BY observation_count DESC, id
    LIMIT 1`,
);
const seriesCoordinatesStatement = db.prepare(
  `SELECT d.api_key AS apiKey, sd.value_code AS valueCode
     FROM series_dimensions sd
     JOIN dimensions d ON d.id = sd.dimension_id
    WHERE sd.series_id = ?`,
);
const seriesProjection = `
  SELECT substr(s.id, 1, ?) AS prefix, s.id AS seriesId,
         t.dataset_id AS datasetId, s.unit,
         CASE
           WHEN s.time_mask_text IS NOT NULL
             THEN 'x' || s.time_mask_text
           ELSE 'x' || printf('%x', s.time_mask)
         END AS timeMask,
         o.time_code AS timeCode, o.value, o.numeric_value AS numericValue,
         o.annotation, o.status`;
const seriesRowsStatement = db.prepare(
  ONLY_DATASET_IDS.length > 0
    ? `${seriesProjection}
         FROM statistical_tables t
              INDEXED BY statistical_tables_dataset_idx
         JOIN series s
              INDEXED BY series_table_idx
           ON s.table_id = t.id
         LEFT JOIN observations o ON o.series_id = s.id
        WHERE t.dataset_id IN (${ONLY_DATASET_IDS.map(() => "?").join(", ")})
        ORDER BY s.id, o.time_code`
    : `${seriesProjection}
         FROM series s
              INDEXED BY sqlite_autoindex_series_1
         CROSS JOIN statistical_tables t ON t.id = s.table_id
         LEFT JOIN observations o ON o.series_id = s.id
        ORDER BY s.id, o.time_code`,
);

const tableIndex = [];
for (const table of tables) {
  const dimensions = dimensionStatement.all(table.id).map((dimension) => ({
    ...dimension,
    values: dimensionValueStatement.all(dimension.id),
  }));
  const metaPath = `tables/${table.id}/meta.json.gz`;
  if (
    ONLY_DATASET_IDS.length > 0 &&
    !ONLY_DATASET_IDS.includes(table.datasetId) &&
    existsSync(resolve(OUTPUT_DIR, metaPath))
  ) {
    tableIndex.push({
      ...table,
      metaUrl: publicPath(metaPath),
    });
    continue;
  }
  let defaultSelection = Object.fromEntries(
    dimensions
      .filter((dimension) => dimension.apiKey !== "time")
      .map((dimension) => {
        const preferred =
          dimension.values.find((value) =>
            dimension.apiKey === "area"
              ? /^(全国|全地域|計)$/.test(value.name)
              : /^(総数|総計|合計|計|全体|すべて)$/.test(value.name),
          ) ?? dimension.values[0];
        return [dimension.apiKey, preferred?.code ?? ""];
      }),
  );
  const identity = Object.entries(defaultSelection)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\u001f");
  const preferredSeriesId = createHash("sha256")
    .update(`${table.id}\u001f${identity}`)
    .digest("hex")
    .slice(0, 32);
  if (!seriesExistsStatement.get(preferredSeriesId)) {
    const fallbackSeries = fallbackSeriesStatement.get(table.id);
    defaultSelection = fallbackSeries
      ? Object.fromEntries(
          seriesCoordinatesStatement
            .all(fallbackSeries.id)
            .map((coordinate) => [
              coordinate.apiKey,
              coordinate.valueCode,
            ]),
        )
      : defaultSelection;
  }
  writeGzipJson(metaPath, {
    schemaVersion: 2,
    table,
    dimensions,
    defaultSelection,
    implicitNumericZero: true,
    seriesBundlePrefixLength: BUNDLE_PREFIX_LENGTH,
    seriesBundleUrlTemplate:
      `${SERIES_ASSET_BASE_URL}/${table.datasetId}-{prefix}.json.gz`,
  });

  tableIndex.push({
    ...table,
    metaUrl: publicPath(metaPath),
  });
}

let bundleCount = 0;
let currentPrefix = "";
let currentSeriesId = "";
let currentDatasetId = "";
let currentSeries = null;
let datasetBundles = new Map();
let processedPrefixCount = 0;
let processedSeriesCount = 0;
const exportStartedAt = Date.now();

function ensureDatasetBundle(datasetId) {
  if (!datasetBundles.has(datasetId)) {
    datasetBundles.set(datasetId, {
      series: {},
    });
  }
  return datasetBundles.get(datasetId);
}

function flushSeries() {
  if (!currentSeries) return;
  ensureDatasetBundle(currentDatasetId).series[currentSeriesId] =
    currentSeries;
  processedSeriesCount += 1;
  currentSeries = null;
}

function flushPrefix() {
  flushSeries();
  if (!currentPrefix) return;
  for (const [datasetId, bundle] of datasetBundles) {
    writeShard(datasetId, currentPrefix, {
      schemaVersion: 2,
      datasetId,
      prefix: currentPrefix,
      series: bundle.series,
    });
    bundleCount += 1;
  }
  datasetBundles = new Map();
  processedPrefixCount += 1;
  if (processedPrefixCount % 16 === 0) {
    const elapsedMinutes = (Date.now() - exportStartedAt) / 60_000;
    process.stdout.write(
      `公開データ変換: ${processedPrefixCount}/256 ` +
        `(${processedSeriesCount.toLocaleString("ja-JP")}系列、` +
        `${elapsedMinutes.toFixed(1)}分)\n`,
    );
  }
}

const seriesRows = ONLY_DATASET_IDS.length > 0
  ? seriesRowsStatement.iterate(BUNDLE_PREFIX_LENGTH, ...ONLY_DATASET_IDS)
  : seriesRowsStatement.iterate(BUNDLE_PREFIX_LENGTH);
for (const row of seriesRows) {
  if (row.prefix !== currentPrefix) {
    flushPrefix();
    currentPrefix = row.prefix;
    currentSeriesId = "";
  }
  if (row.seriesId !== currentSeriesId) {
    flushSeries();
    currentSeriesId = row.seriesId;
    currentDatasetId = row.datasetId;
    // IDは辞書キー、名称は選択中の分類、暗黙0はメタ情報、
    // 出典はカタログに一度だけ置く。1,700万超の系列で同じ情報を
    // 繰り返さず、Pagesの容量と通信量を抑える。
    currentSeries = [row.unit, row.timeMask, []];
    ensureDatasetBundle(row.datasetId);
  }
  if (row.timeCode !== null) {
    currentSeries[2].push([
      row.timeCode,
      row.numericValue,
      row.numericValue === null ? row.value : null,
      row.annotation,
      row.status === "confirmed_value" ? null : row.status,
    ]);
  }
}
flushPrefix();

const generatedAt = new Date().toISOString();
writeJson("catalog.json", {
  schemaVersion: 2,
  generatedAt,
  source: "estat-normalized-sqlite",
  datasets,
  tables: tableIndex,
  sources,
});
db.close();
if (ONLY_DATASET_IDS.length > 0) {
  const outputShardDir = resolve(OUTPUT_DIR, "shards");
  for (const fileName of readdirSync(outputShardDir)) {
    if (
      ONLY_DATASET_IDS.some((datasetId) =>
        fileName.startsWith(`${datasetId}-`),
      ) &&
      fileName.endsWith(".json.gz")
    ) {
      unlinkSync(resolve(outputShardDir, fileName));
    }
  }
  cpSync(BUILD_DIR, OUTPUT_DIR, { recursive: true, force: true });
  rmSync(BUILD_DIR, { recursive: true });
  exportAiCatalog(OUTPUT_DIR);
} else {
  exportAiCatalog(BUILD_DIR);
  if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true });
  renameSync(BUILD_DIR, OUTPUT_DIR);
}
if (EXTERNAL_SHARD_DIR) {
  if (existsSync(SHARD_OUTPUT_DIR)) {
    rmSync(SHARD_OUTPUT_DIR, { recursive: true });
  }
  renameSync(SHARD_BUILD_DIR, SHARD_OUTPUT_DIR);
}
process.stdout.write(
  `system pages data: ${OUTPUT_DIR}\n` +
    `series shards: ${SHARD_OUTPUT_DIR}\n` +
    `updated dataset: ${ONLY_DATASET_IDS.join(",") || "all"}\n` +
    `tables: ${tableIndex.length}\n` +
    `series bundles: ${bundleCount}\n`,
);
