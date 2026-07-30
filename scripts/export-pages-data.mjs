import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const ROOT = resolve(import.meta.dirname, "..");
const DATABASE_PATH = resolve(
  ROOT,
  process.env.MLIT_DATABASE_PATH ?? "data/database/mlit-statistics.sqlite",
);
const OUTPUT_DIR = resolve(
  ROOT,
  process.env.MLIT_PUBLIC_DATA_DIR ?? "public/data",
);
const PAGE_SIZE = 80;
const MAX_GITHUB_FILE_BYTES = 25 * 1024 * 1024;
const GZIP_OPTIONS = { level: 6 };
const SERIES_PER_BUNDLE = 5_000;

if (!existsSync(DATABASE_PATH)) {
  throw new Error(
    `ローカルDBがありません: ${DATABASE_PATH}\n先に npm run db:build-local を実行してください。`,
  );
}

if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true });
mkdirSync(OUTPUT_DIR, { recursive: true });

const db = new DatabaseSync(DATABASE_PATH, { readOnly: true });
const catalogs = [
  JSON.parse(
    readFileSync(resolve(ROOT, "data/catalogs/building-annual.json"), "utf8"),
  ),
  JSON.parse(
    readFileSync(
      resolve(ROOT, "data/catalogs/orders-major50-annual.json"),
      "utf8",
    ),
  ),
];
const catalogRecordById = new Map(
  catalogs.flatMap((catalog) =>
    catalog.records.map((record) => [
      record.statInfId,
      { ...record, datasetId: catalog.datasetId },
    ]),
  ),
);

function gzipJson(value) {
  return gzipSync(Buffer.from(JSON.stringify(value)), GZIP_OPTIONS);
}

function writeBuffer(path, value) {
  const target = resolve(OUTPUT_DIR, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
  if (statSync(target).size > MAX_GITHUB_FILE_BYTES) {
    throw new Error(
      `GitHub Pages用ファイルが25MiBを超えました: ${target}`,
    );
  }
}

function writeJson(path, value) {
  writeBuffer(path, Buffer.from(JSON.stringify(value)));
}

function writeGzipJson(path, value) {
  writeBuffer(path, gzipJson(value));
}

function publicPath(path) {
  return `data/${relative(OUTPUT_DIR, resolve(OUTPUT_DIR, path)).replaceAll("\\", "/")}`;
}

function bundlePath(datasetId, groupId, sheetIndex, seriesId) {
  const bundleKey = Math.floor(
    Number.parseInt(seriesId, 36) / SERIES_PER_BUNDLE,
  ).toString(36);
  return `${datasetId}/series/${groupId}/${sheetIndex}/${bundleKey}.json.gz`;
}

const datasets = db
  .prepare(
    `SELECT id, title, government_statistics_code AS governmentStatisticsCode,
            provided_statistics_id AS providedStatisticsId,
            source_url AS sourceUrl, fiscal_year_from AS fiscalYearFrom,
            fiscal_year_to AS fiscalYearTo
       FROM datasets ORDER BY id`,
  )
  .all();
const groups = db
  .prepare(
    `SELECT id, dataset_id AS datasetId, title
       FROM table_groups ORDER BY dataset_id, title`,
  )
  .all();
const files = db
  .prepare(
    `SELECT id AS statInfId, dataset_id AS datasetId, group_id AS groupId,
            fiscal_year AS fiscalYear, title, variant_label AS variantLabel,
            source_kind AS sourceKind, source_status AS sourceStatus,
            source_page AS sourcePage, download_url AS downloadUrl,
            release_date AS releaseDate, sha256
       FROM source_files
      ORDER BY dataset_id, group_id, fiscal_year DESC, id`,
  )
  .all();

const filesByGroup = new Map();
for (const file of files) {
  const key = `${file.datasetId}:${file.groupId}`;
  const current = filesByGroup.get(key) ?? [];
  current.push(file);
  filesByGroup.set(key, current);
}

let bundleCount = 0;
let seriesCount = 0;
const bundleRows = db
  .prepare(
    `SELECT dataset_id AS datasetId, group_id AS groupId,
            sheet_index AS sheetIndex, prefix, series_count AS seriesCount,
            payload_gzip AS payloadGzip
       FROM series_bundles
      ORDER BY dataset_id, group_id, sheet_index, prefix`,
  )
  .iterate();

for (const bundle of bundleRows) {
  const path = `${bundle.datasetId}/series/${bundle.groupId}/${bundle.sheetIndex}/${bundle.prefix}.json.gz`;
  writeBuffer(path, Buffer.from(bundle.payloadGzip));
  bundleCount += 1;
  seriesCount += bundle.seriesCount;
}

const sheetStatement = db.prepare(`
  SELECT sheet_index AS sheetIndex, name, row_count AS rowCount,
         column_count AS columnCount, unit, payload_gzip AS payloadGzip
    FROM sheet_payloads
   WHERE source_file_id = ?
   ORDER BY sheet_index
`);

const tableIndex = [];
let pageCountTotal = 0;
for (const file of files) {
  const catalogRecord = catalogRecordById.get(file.statInfId);
  if (!catalogRecord) {
    throw new Error(`カタログに統計表がありません: ${file.statInfId}`);
  }
  const sheetRows = sheetStatement.all(file.statInfId);
  const sheetSummaries = [];
  for (const sheet of sheetRows) {
    const payload = JSON.parse(gunzipSync(sheet.payloadGzip).toString("utf8"));
    const basePath = `${file.datasetId}/tables/${file.statInfId}/${sheet.sheetIndex}`;
    const pageCount = Math.ceil(payload.rows.length / PAGE_SIZE);
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const rows = payload.rows
        .slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)
        .map((row) => ({
          index: row.index,
          rowLabel: row.rowLabel,
          cells: row.cells,
          series: row.seriesIds.map((id) =>
            id
              ? {
                  id,
                  bundleUrl: publicPath(
                    bundlePath(
                      file.datasetId,
                      file.groupId,
                      sheet.sheetIndex,
                      id,
                    ),
                  ),
                }
              : null,
          ),
        }));
      writeGzipJson(`${basePath}/page-${pageIndex}.json.gz`, {
        schemaVersion: 1,
        statInfId: file.statInfId,
        sheetIndex: sheet.sheetIndex,
        pageIndex,
        pageSize: PAGE_SIZE,
        rows,
      });
      pageCountTotal += 1;
    }

    writeGzipJson(`${basePath}/search.json.gz`, {
      schemaVersion: 1,
      rows: payload.rows.map((row) => ({
        index: row.index,
        text: row.searchText,
      })),
    });
    const metaPath = `${basePath}/meta.json.gz`;
    const summary = {
      sheetIndex: sheet.sheetIndex,
      name: sheet.name,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      unit: sheet.unit,
      pageSize: PAGE_SIZE,
      pageCount,
      metaUrl: publicPath(metaPath),
    };
    writeGzipJson(metaPath, {
      schemaVersion: 1,
      record: {
        ...catalogRecord,
        sourceKind: file.sourceKind,
        sourceStatus: file.sourceStatus,
        sheets: [],
      },
      ...summary,
      columnLabels: payload.columnLabels,
      searchUrl: publicPath(`${basePath}/search.json.gz`),
      pageUrlTemplate: publicPath(`${basePath}/page-{page}.json.gz`),
    });
    sheetSummaries.push(summary);
  }
  tableIndex.push({
    ...catalogRecord,
    sourceKind: file.sourceKind,
    sourceStatus: file.sourceStatus,
    sheets: sheetSummaries,
  });
}

const groupPayload = groups.map((group) => ({
  ...group,
  fiscalYears: Array.from(
    new Set(
      (filesByGroup.get(`${group.datasetId}:${group.id}`) ?? []).map(
        (file) => file.fiscalYear,
      ),
    ),
  ).sort((left, right) => left - right),
}));
const generatedAt = new Date().toISOString();
writeJson("manifest.json", {
  schemaVersion: 1,
  snapshotId: generatedAt.replaceAll(/[-:.TZ]/g, "").slice(0, 14),
  generatedAt,
  source: "local-normalized-sqlite",
  datasets,
  groups: groupPayload,
  tables: tableIndex,
});

db.close();
process.stdout.write(
  [
    `pages data: ${OUTPUT_DIR}`,
    `tables: ${tableIndex.length}`,
    `pages: ${pageCountTotal}`,
    `series: ${seriesCount}`,
    `bundles: ${bundleCount}`,
    "",
  ].join("\n"),
);
