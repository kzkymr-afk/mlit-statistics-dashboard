import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import {
  BUILDBASE_DATASET_ID,
  BUILDBASE_SOURCE_ID,
  BUILDBASE_SOURCE_URL,
  BUILDBASE_TABLE_ID,
  buildBuildBaseDimensions,
  buildBuildBaseObservations,
  loadBuildBaseCompanyData,
} from "./lib/buildbase-company-data.mjs";
import {
  finalizeTable,
  makeObservationWriter,
  openStatisticsDatabase,
  replaceDimensions,
  upsertDataset,
  upsertObservationSource,
  upsertStatisticalTable,
} from "./lib/statistics-system-db.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const BUILDBASE_ROOT = resolve(
  process.env.BUILDBASE_ROOT ??
    resolve(ROOT, "../../Materials/2026-06_有報自動抽出/yuho_auto_extract"),
);
const BUILDBASE_EXPORT_PATH = resolve(
  process.env.BUILDBASE_EXPORT_PATH ??
    resolve(BUILDBASE_ROOT, "data/exports/mlit_company_data.json"),
);
const DATABASE_PATH = resolve(
  ROOT,
  process.env.MLIT_SYSTEM_DATABASE_PATH ??
    "data/database/mlit-statistics-system.sqlite",
);
const CATALOG_PATH = resolve(ROOT, "data/catalogs/buildbase-company-data.json");
const syncStartedAt = Date.now();

function markProgress(label) {
  const seconds = ((Date.now() - syncStartedAt) / 1000).toFixed(1);
  process.stdout.write(`[BuildBase同期 ${seconds}s] ${label}\n`);
}

function refreshBuildBaseExport() {
  if (process.env.BUILDBASE_SKIP_EXPORT_REFRESH === "1") return;
  const virtualPython = resolve(BUILDBASE_ROOT, ".venv/bin/python");
  const command = existsSync(virtualPython) ? virtualPython : "python3";
  const result = spawnSync(
    command,
    [
      "-m",
      "yuho_auto_extract",
      "export-mlit",
      "--output",
      BUILDBASE_EXPORT_PATH,
    ],
    {
      cwd: BUILDBASE_ROOT,
      env: {
        ...process.env,
        PYTHONPATH: resolve(BUILDBASE_ROOT, "src"),
        PYTHONPYCACHEPREFIX:
          process.env.PYTHONPYCACHEPREFIX || "/private/tmp/yuho-pycache",
      },
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `BuildBase公開データの生成に失敗しました。\n${result.stderr || result.stdout}`,
    );
  }
}

function clearBuildBaseSeries(db) {
  db.prepare(
    `DELETE FROM observations WHERE series_id IN
       (SELECT id FROM series WHERE table_id = ?)`,
  ).run(BUILDBASE_TABLE_ID);
  db.prepare(
    `DELETE FROM series_dimensions WHERE series_id IN
       (SELECT id FROM series WHERE table_id = ?)`,
  ).run(BUILDBASE_TABLE_ID);
  db.prepare("DELETE FROM series WHERE table_id = ?").run(BUILDBASE_TABLE_ID);
  db.prepare(
    `DELETE FROM dimension_values WHERE dimension_id IN
       (SELECT id FROM dimensions WHERE table_id = ?)`,
  ).run(BUILDBASE_TABLE_ID);
}

function writeCatalog(data) {
  const catalog = {
    schemaVersion: 1,
    datasetId: BUILDBASE_DATASET_ID,
    tableId: BUILDBASE_TABLE_ID,
    title: "ゼネコン21社 会社別主要指標（売上高・利益・受注・人員等）",
    source: "BuildBase MLIT export",
    sourceUpdatedAt: data.sourceUpdatedAt,
    sourceHash: data.sourceHash,
    fiscalYearFrom: data.fiscalYears[0],
    fiscalYearTo: data.fiscalYears.at(-1),
    companyCount: data.companies.length,
    companyYearCount: data.companyYearCount,
    fieldCount: data.fields.length,
    cellCount: data.cells.length,
    statusCounts: data.statusCounts,
    buildingUseFieldCount: data.buildingUseFieldCount,
    buildingUseCompanyCount: data.buildingUseCompanyCount,
    buildingUseFilledCount: data.buildingUseFilledCount,
    factbookBuildingUseFilledCount: data.factbookBuildingUseFilledCount,
    buildingUseFiscalYearFrom: data.buildingUseFiscalYearFrom,
    buildingUseFiscalYearTo: data.buildingUseFiscalYearTo,
  };
  mkdirSync(dirname(CATALOG_PATH), { recursive: true });
  writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
}

if (!existsSync(DATABASE_PATH)) {
  throw new Error(`正規化DBがありません: ${DATABASE_PATH}`);
}

refreshBuildBaseExport();
markProgress("公開データ生成完了");
const data = loadBuildBaseCompanyData(BUILDBASE_EXPORT_PATH);
const catalog = writeCatalog(data);
const dimensions = buildBuildBaseDimensions(data);
const { observations, seriesLabel } = buildBuildBaseObservations(data, dimensions);
const fetchedAt = data.sourceUpdatedAt;
markProgress("公開データ検証完了");

const db = openStatisticsDatabase(DATABASE_PATH);
markProgress("正規化DB接続完了");
const runId = randomUUID();
let committed = false;

try {
  db.exec("BEGIN IMMEDIATE");
  db.prepare(
    `INSERT INTO ingestion_runs(id, started_at, status)
     VALUES (?, ?, 'running')`,
  ).run(runId, fetchedAt);
  clearBuildBaseSeries(db);
  markProgress("旧BuildBaseデータ削除完了");
  upsertDataset(db, {
    id: BUILDBASE_DATASET_ID,
    title: catalog.title,
    governmentStatisticsCode: "BUILDBASE",
    providedStatisticsId: "company-annual",
    sourceUrl: BUILDBASE_SOURCE_URL,
    fiscalYearFrom: catalog.fiscalYearFrom,
  });
  upsertStatisticalTable(
    db,
    BUILDBASE_DATASET_ID,
    {
      id: BUILDBASE_TABLE_ID,
      title: "会社別主要指標（売上高・利益・受注・人員等）",
      statisticsName: catalog.title,
      cycle: "年度次",
      surveyDate: String(catalog.fiscalYearTo),
      openDate: "",
      updatedDate: fetchedAt.slice(0, 10),
      overallTotalNumber: catalog.cellCount,
    },
    fetchedAt,
    {
      sourceKind: "buildbase-public-disclosures",
      sourceUrl: BUILDBASE_SOURCE_URL,
      registryStatus: "ready",
    },
  );
  replaceDimensions(db, BUILDBASE_TABLE_ID, dimensions, {
    manageTransaction: false,
  });
  upsertObservationSource(db, {
    id: BUILDBASE_SOURCE_ID,
    tableId: BUILDBASE_TABLE_ID,
    sourceUrl: BUILDBASE_SOURCE_URL,
    publishedAt: null,
    retrievedAt: fetchedAt,
    sourceKind: "buildbase-public-disclosures",
    localPath: null,
    sha256: createHash("sha256")
      .update(readFileSync(CATALOG_PATH))
      .digest("hex"),
  });
  const timeCodes = dimensions
    .find((dimension) => dimension.apiKey === "time")
    .values.map((value) => value.code);
  const write = makeObservationWriter(db, {
    tableId: BUILDBASE_TABLE_ID,
    dimensions,
    sourceId: BUILDBASE_SOURCE_ID,
    fetchedAt,
    timeCodes,
    seriesLabel,
    manageTransactions: false,
  });
  write(observations);
  write.finish();
  markProgress("新BuildBaseデータ書込完了");
  finalizeTable(db, BUILDBASE_TABLE_ID, timeCodes);
  db.prepare(
    `UPDATE ingestion_runs
        SET completed_at = ?, status = 'complete',
            table_count = 1, observation_count = ?
      WHERE id = ?`,
  ).run(new Date().toISOString(), observations.length, runId);
  db.exec("COMMIT");
  committed = true;
  db.close();
  markProgress("差替え確定");
  process.stdout.write(
    `BuildBase dataset: ${BUILDBASE_DATASET_ID}\n` +
      `companies: ${catalog.companyCount}\n` +
      `fields: ${catalog.fieldCount}\n` +
      `company years: ${catalog.companyYearCount}\n` +
      `cells: ${catalog.cellCount}\n` +
      `filled: ${catalog.statusCounts.filled}\n` +
      `not disclosed: ${catalog.statusCounts.not_applicable}\n` +
      `publication pending: ${catalog.statusCounts.publication_pending}\n` +
      `factbook building-use values: ${catalog.factbookBuildingUseFilledCount}\n`,
  );
} catch (error) {
  if (!committed) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The transaction may already have been rolled back by SQLite.
    }
    try {
      db.prepare(
        `INSERT INTO ingestion_runs(
           id, started_at, completed_at, status, error
         ) VALUES (?, ?, ?, 'failed', ?)`,
      ).run(
        runId,
        fetchedAt,
        new Date().toISOString(),
        String(error?.stack ?? error),
      );
    } catch {
      // Preserve the original error.
    }
  }
  try {
    db.close();
  } catch {
    // Preserve the original error.
  }
  throw error;
}
