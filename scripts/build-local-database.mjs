import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

import XLSX from "xlsx";

import {
  cleanText,
  displayText,
  inferUnit,
  readGrid,
  semanticLabel,
} from "./lib/annual-grid.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DATABASE_PATH = resolve(
  ROOT,
  process.env.MLIT_DATABASE_PATH ?? "data/database/mlit-statistics.sqlite",
);
const BUILD_PATH = `${DATABASE_PATH}.building`;
const CATALOG_PATHS = [
  "data/catalogs/building-annual.json",
  "data/catalogs/orders-major50-annual.json",
];
const MANIFEST_PATHS = [
  "data/normalized/building-starts/annual/manifest.json",
  "data/normalized/construction-orders-major-50/annual/manifest.json",
];
const GZIP_OPTIONS = { level: 6 };
const SERIES_PER_BUNDLE = 5_000;

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

function gzipJson(value) {
  return gzipSync(Buffer.from(JSON.stringify(value)), GZIP_OPTIONS);
}

function makeSearchText(cells) {
  return cleanText(
    cells
      .filter((cell) => cell !== null && cell !== undefined)
      .map(String)
      .join(" "),
  ).toLowerCase();
}

function fallbackRowLabel(row, index) {
  const text = row
    .filter((cell) => typeof cell === "string")
    .map(displayText)
    .filter(Boolean)
    .slice(0, 6)
    .join(" / ");
  return text || `行 ${index + 1}`;
}

function uniqueStrings(values) {
  const output = [];
  for (const value of values) {
    const text = typeof value === "string" ? displayText(value) : "";
    if (text && output.at(-1) !== text) output.push(text);
  }
  return output;
}

function labelsForSheet(rows, columnCount) {
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const numericRowIndex = rows.findIndex(
      (row) =>
        typeof row[columnIndex] === "number" &&
        Number.isFinite(row[columnIndex]),
    );
    if (numericRowIndex >= 0) {
      const headings = [];
      for (
        let rowIndex = Math.max(0, numericRowIndex - 12);
        rowIndex < numericRowIndex;
        rowIndex += 1
      ) {
        const value = rows[rowIndex]?.[columnIndex];
        if (typeof value !== "string") continue;
        const text = displayText(value);
        if (text && !/^※/.test(text) && headings.at(-1) !== text) {
          headings.push(text);
        }
      }
      if (headings.length) return headings.slice(-4).join(" / ");
    }
    for (const row of rows.slice(0, 30).reverse()) {
      const value = row[columnIndex];
      if (typeof value === "string" && displayText(value)) {
        return displayText(value);
      }
    }
    return `列 ${columnIndex + 1}`;
  });
}

function sourceFileRecord(catalogRecord, localRecord, datasetId) {
  return {
    id: catalogRecord.statInfId,
    datasetId,
    groupId: catalogRecord.groupId,
    fiscalYear: catalogRecord.fiscalYear,
    title: catalogRecord.title,
    variantLabel: catalogRecord.variantLabel ?? "",
    sourceKind: "excel",
    sourceStatus: "complete",
    localPath: localRecord.localPath,
    sourcePage: catalogRecord.sourcePage,
    downloadUrl: catalogRecord.downloadUrl,
    releaseDate: catalogRecord.releaseDate,
    sha256: catalogRecord.sha256,
  };
}

function pointsForSeries(series, fiscalYearFrom, fiscalYearTo) {
  return Array.from(
    { length: fiscalYearTo - fiscalYearFrom + 1 },
    (_, index) => {
      const fiscalYear = fiscalYearFrom + index;
      const entry = series.pointsByYear.get(fiscalYear);
      return {
        fiscalYear,
        value: entry?.value ?? null,
        sourceFileIds: entry?.sourceFileIds ?? [],
      };
    },
  );
}

function seriesBundleKey(id) {
  return Math.floor(Number.parseInt(id, 36) / SERIES_PER_BUNDLE).toString(36);
}

mkdirSync(dirname(DATABASE_PATH), { recursive: true });
if (existsSync(BUILD_PATH)) rmSync(BUILD_PATH);

const catalogs = CATALOG_PATHS.map(readJson);
const manifests = MANIFEST_PATHS.map(readJson);
const manifestRecordById = new Map(
  manifests.flatMap((manifest) =>
    manifest.files.map((record) => [record.statInfId, record]),
  ),
);

const db = new DatabaseSync(BUILD_PATH);
db.exec(`
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;
  PRAGMA temp_store = MEMORY;
  PRAGMA foreign_keys = ON;
  PRAGMA page_size = 65536;

  CREATE TABLE datasets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    government_statistics_code TEXT NOT NULL,
    provided_statistics_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    fiscal_year_from INTEGER NOT NULL,
    fiscal_year_to INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE table_groups (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(id),
    title TEXT NOT NULL
  ) STRICT;
  CREATE INDEX table_groups_dataset_idx ON table_groups(dataset_id);

  CREATE TABLE source_files (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(id),
    group_id TEXT NOT NULL REFERENCES table_groups(id),
    fiscal_year INTEGER NOT NULL,
    title TEXT NOT NULL,
    variant_label TEXT NOT NULL DEFAULT '',
    source_kind TEXT NOT NULL,
    source_status TEXT NOT NULL,
    local_path TEXT,
    source_page TEXT NOT NULL,
    download_url TEXT NOT NULL,
    release_date TEXT NOT NULL,
    sha256 TEXT NOT NULL
  ) STRICT;
  CREATE INDEX source_files_dataset_group_year_idx
    ON source_files(dataset_id, group_id, fiscal_year);

  CREATE TABLE sheet_payloads (
    source_file_id TEXT NOT NULL REFERENCES source_files(id),
    sheet_index INTEGER NOT NULL,
    name TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    column_count INTEGER NOT NULL,
    unit TEXT,
    payload_gzip BLOB NOT NULL,
    PRIMARY KEY (source_file_id, sheet_index)
  ) STRICT;

  CREATE TABLE series_bundles (
    dataset_id TEXT NOT NULL REFERENCES datasets(id),
    group_id TEXT NOT NULL REFERENCES table_groups(id),
    sheet_index INTEGER NOT NULL,
    prefix TEXT NOT NULL,
    series_count INTEGER NOT NULL,
    payload_gzip BLOB NOT NULL,
    PRIMARY KEY (dataset_id, group_id, sheet_index, prefix)
  ) STRICT;

  CREATE TABLE ingestion_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL,
    source_file_count INTEGER NOT NULL DEFAULT 0,
    sheet_count INTEGER NOT NULL DEFAULT 0,
    numeric_cell_count INTEGER NOT NULL DEFAULT 0,
    compressed_bytes INTEGER NOT NULL DEFAULT 0,
    error TEXT
  ) STRICT;

  CREATE TABLE source_mappings (
    dataset_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    api_table_id TEXT,
    status TEXT NOT NULL,
    checked_at TEXT,
    note TEXT,
    UNIQUE (dataset_id, group_id, source_kind)
  ) STRICT;
`);

const insertDataset = db.prepare(`
  INSERT INTO datasets (
    id, title, government_statistics_code, provided_statistics_id,
    source_url, fiscal_year_from, fiscal_year_to
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertGroup = db.prepare(`
  INSERT INTO table_groups (id, dataset_id, title) VALUES (?, ?, ?)
`);
const insertFile = db.prepare(`
  INSERT INTO source_files (
    id, dataset_id, group_id, fiscal_year, title, variant_label,
    source_kind, source_status, local_path, source_page, download_url,
    release_date, sha256
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertSheet = db.prepare(`
  INSERT INTO sheet_payloads (
    source_file_id, sheet_index, name, row_count, column_count, unit,
    payload_gzip
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertBundle = db.prepare(`
  INSERT INTO series_bundles (
    dataset_id, group_id, sheet_index, prefix, series_count, payload_gzip
  ) VALUES (?, ?, ?, ?, ?, ?)
`);
const insertRun = db.prepare(`
  INSERT INTO ingestion_runs (
    id, started_at, status, source_file_count, sheet_count,
    numeric_cell_count, compressed_bytes
  ) VALUES (?, ?, 'running', 0, 0, 0, 0)
`);
const updateRun = db.prepare(`
  UPDATE ingestion_runs
     SET completed_at = ?, status = ?, source_file_count = ?,
         sheet_count = ?, numeric_cell_count = ?, compressed_bytes = ?,
         error = ?
   WHERE id = ?
`);
const insertMapping = db.prepare(`
  INSERT INTO source_mappings (
    dataset_id, group_id, source_kind, api_table_id, status, checked_at, note
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const runId = randomUUID();
const startedAt = new Date().toISOString();
insertRun.run(runId, startedAt);
const totalSourceFiles = catalogs.reduce(
  (sum, catalog) => sum + catalog.records.length,
  0,
);

let sourceFileCount = 0;
let sheetCount = 0;
let numericCellCount = 0;
let compressedBytes = 0;

try {
  for (const catalog of catalogs) {
    insertDataset.run(
      catalog.datasetId,
      catalog.title,
      catalog.governmentStatisticsCode,
      catalog.providedStatisticsId,
      catalog.sourceUrl,
      catalog.fiscalYearFrom,
      catalog.fiscalYearTo,
    );
    for (const group of catalog.groups) {
      insertGroup.run(group.id, catalog.datasetId, group.title);
      insertMapping.run(
        catalog.datasetId,
        group.id,
        "excel",
        null,
        "complete",
        catalog.fetchedAt,
        "e-Stat掲載Excelを取得し、圧縮DBへ正規化済み",
      );
      insertMapping.run(
        catalog.datasetId,
        group.id,
        "estat-api",
        null,
        "mapping-pending",
        null,
        "ESTAT_APP_ID設定後に統計表IDを照合。未収録項目はExcelを継続利用",
      );
    }
  }

  for (const catalog of catalogs) {
    for (const group of catalog.groups) {
      const groupRecords = catalog.records
        .filter((record) => record.groupId === group.id)
        .sort(
          (left, right) =>
            left.fiscalYear - right.fiscalYear ||
            left.statInfId.localeCompare(right.statInfId),
        );
      const seriesBySheet = new Map();

      db.exec("BEGIN");
      try {
        for (const catalogRecord of groupRecords) {
          const localRecord = manifestRecordById.get(catalogRecord.statInfId);
          if (!localRecord?.localPath) {
            throw new Error(
              `Excelの保存先が見つかりません: ${catalogRecord.statInfId}`,
            );
          }
          const workbookPath = resolve(ROOT, localRecord.localPath);
          if (!existsSync(workbookPath)) {
            throw new Error(`Excelがありません: ${workbookPath}`);
          }
          const file = sourceFileRecord(
            catalogRecord,
            localRecord,
            catalog.datasetId,
          );
          insertFile.run(
            file.id,
            file.datasetId,
            file.groupId,
            file.fiscalYear,
            file.title,
            file.variantLabel,
            file.sourceKind,
            file.sourceStatus,
            file.localPath,
            file.sourcePage,
            file.downloadUrl,
            file.releaseDate,
            file.sha256,
          );
          sourceFileCount += 1;

          const workbook = XLSX.readFile(workbookPath, {
            cellDates: true,
            dense: false,
          });
          for (
            let sheetIndex = 0;
            sheetIndex < workbook.SheetNames.length;
            sheetIndex += 1
          ) {
            const name = workbook.SheetNames[sheetIndex];
            const { rows, rowCount, columnCount } = readGrid(
              workbook.Sheets[name],
            );
            const unit = inferUnit(rows);
            const columnLabels = labelsForSheet(rows, columnCount);
            const occurrences = new Map();
            const sheetState = seriesBySheet.get(sheetIndex) ?? {
              seriesMap: new Map(),
              idByIdentity: new Map(),
              semanticCache: new Map(),
            };
            seriesBySheet.set(sheetIndex, sheetState);
            const { seriesMap, idByIdentity, semanticCache } = sheetState;
            const semantic = (label) => {
              const cached = semanticCache.get(label);
              if (cached !== undefined) return cached;
              const value = semanticLabel(label);
              semanticCache.set(label, value);
              return value;
            };
            const headingHistory = Array.from(
              { length: columnCount },
              () => [],
            );
            let recentRowLabel = "";

            const payloadRows = rows.map((cells, rowIndex) => {
              const numericColumns = [];
              for (let index = 0; index < cells.length; index += 1) {
                if (
                  typeof cells[index] === "number" &&
                  Number.isFinite(cells[index])
                ) {
                  numericColumns.push(index);
                }
              }
              const firstNumericColumn = numericColumns[0] ?? -1;
              const directParts =
                firstNumericColumn >= 0
                  ? uniqueStrings(cells.slice(0, firstNumericColumn))
                  : [];
              const displayRowLabel =
                directParts.join(" / ") ||
                recentRowLabel ||
                fallbackRowLabel(cells, rowIndex);
              if (directParts.length) recentRowLabel = displayRowLabel;
              const seriesIds = cells.map((cell, columnIndex) => {
                if (typeof cell !== "number" || !Number.isFinite(cell)) {
                  return null;
                }
                numericCellCount += 1;
                const cellRowLabel = displayRowLabel;
                const cellColumnLabel =
                  uniqueStrings(
                    headingHistory[columnIndex].map((entry) => entry.text),
                  )
                    .slice(-4)
                    .join(" / ") || columnLabels[columnIndex];
                const occurrenceKey = `${semantic(cellRowLabel)}\u001f${semantic(cellColumnLabel)}`;
                const occurrence = occurrences.get(occurrenceKey) ?? 0;
                occurrences.set(occurrenceKey, occurrence + 1);
                const identity = `${occurrenceKey}\u001f${occurrence}`;
                let id = idByIdentity.get(identity);
                if (!id) {
                  // IDはグループ・シート内で一意ならよい。短い連番にすると、
                  // 数千万セルでランダムな24文字ハッシュを重複保持せずに済む。
                  id = idByIdentity.size.toString(36);
                  idByIdentity.set(identity, id);
                }
                let series = seriesMap.get(id);
                if (!series) {
                  series = {
                    id,
                    label: `${cellRowLabel}｜${cellColumnLabel}`,
                    rowLabel: cellRowLabel,
                    columnLabel: cellColumnLabel,
                    unit,
                    pointsByYear: new Map(),
                  };
                  seriesMap.set(id, series);
                }
                const point =
                  series.pointsByYear.get(catalogRecord.fiscalYear) ?? {
                    value: 0,
                    sourceFileIds: [],
                  };
                point.value += cell;
                if (!point.sourceFileIds.includes(catalogRecord.statInfId)) {
                  point.sourceFileIds.push(catalogRecord.statInfId);
                }
                series.pointsByYear.set(catalogRecord.fiscalYear, point);
                return id;
              });
              for (let columnIndex = 0; columnIndex < cells.length; columnIndex += 1) {
                const value = cells[columnIndex];
                if (typeof value !== "string") continue;
                const text = displayText(value);
                if (!text || /^※/.test(text)) continue;
                const history = headingHistory[columnIndex];
                history.push({ rowIndex, text });
                while (
                  history.length > 0 &&
                  history[0].rowIndex < rowIndex - 11
                ) {
                  history.shift();
                }
              }
              return {
                index: rowIndex,
                rowLabel: displayRowLabel,
                cells,
                searchText: makeSearchText(cells),
                seriesIds,
              };
            });
            const payload = gzipJson({
              schemaVersion: 1,
              sourceFileId: catalogRecord.statInfId,
              sheetIndex,
              name,
              rowCount,
              columnCount,
              columnLabels,
              unit,
              rows: payloadRows,
            });
            insertSheet.run(
              catalogRecord.statInfId,
              sheetIndex,
              name,
              rowCount,
              columnCount,
              unit,
              payload,
            );
            sheetCount += 1;
            compressedBytes += payload.byteLength;
          }
          process.stdout.write(
            `[${sourceFileCount}/${totalSourceFiles}] ` +
              `${catalog.datasetId} ${catalogRecord.fiscalYear} ${catalogRecord.title}\n`,
          );
        }

        for (const [sheetIndex, sheetState] of seriesBySheet) {
          const { seriesMap } = sheetState;
          const seriesByPrefix = new Map();
          for (const series of seriesMap.values()) {
            const prefix = seriesBundleKey(series.id);
            const bundle = seriesByPrefix.get(prefix) ?? {};
            bundle[series.id] = {
              id: series.id,
              label: series.label,
              rowLabel: series.rowLabel,
              columnLabel: series.columnLabel,
              unit: series.unit,
              points: pointsForSeries(
                series,
                catalog.fiscalYearFrom,
                catalog.fiscalYearTo,
              ),
            };
            seriesByPrefix.set(prefix, bundle);
          }
          for (const [prefix, series] of seriesByPrefix) {
            const payload = gzipJson({
              schemaVersion: 1,
              datasetId: catalog.datasetId,
              groupId: group.id,
              sheetIndex,
              series,
            });
            insertBundle.run(
              catalog.datasetId,
              group.id,
              sheetIndex,
              prefix,
              Object.keys(series).length,
              payload,
            );
            compressedBytes += payload.byteLength;
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      seriesBySheet.clear();
      if (global.gc) global.gc();
    }
  }

  updateRun.run(
    new Date().toISOString(),
    "complete",
    sourceFileCount,
    sheetCount,
    numericCellCount,
    compressedBytes,
    null,
    runId,
  );
  db.exec("PRAGMA optimize");
  db.close();

  if (existsSync(DATABASE_PATH)) {
    const backupPath = `${DATABASE_PATH}.previous`;
    copyFileSync(DATABASE_PATH, backupPath);
  }
  renameSync(BUILD_PATH, DATABASE_PATH);
  process.stdout.write(
    [
      `database: ${DATABASE_PATH}`,
      `files: ${sourceFileCount}`,
      `sheets: ${sheetCount}`,
      `numeric cells: ${numericCellCount}`,
      `compressed payloads: ${Math.round(compressedBytes / 1_000_000)} MB`,
      `sqlite: ${Math.round(statSync(DATABASE_PATH).size / 1_000_000)} MB`,
      "",
    ].join("\n"),
  );
} catch (error) {
  try {
    updateRun.run(
      new Date().toISOString(),
      "failed",
      sourceFileCount,
      sheetCount,
      numericCellCount,
      compressedBytes,
      error instanceof Error ? error.stack ?? error.message : String(error),
      runId,
    );
  } finally {
    db.close();
  }
  throw error;
}
