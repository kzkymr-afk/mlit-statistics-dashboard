import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  constants as fsConstants,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
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
const DATABASE_PATH = resolve(
  ROOT,
  process.env.MLIT_SYSTEM_DATABASE_PATH ??
    "data/database/mlit-statistics-system.sqlite",
);
const BUILD_PATH = `${DATABASE_PATH}.buildbase-building`;
const CATALOG_PATH = resolve(ROOT, "data/catalogs/buildbase-company-data.json");

function refreshCompletionReport() {
  if (process.env.BUILDBASE_SKIP_COMPLETION_REFRESH === "1") return;
  const virtualPython = resolve(BUILDBASE_ROOT, ".venv/bin/python");
  const command = existsSync(virtualPython) ? virtualPython : "python3";
  const result = spawnSync(
    command,
    ["-m", "yuho_auto_extract", "company-completion-report"],
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
      `BuildBase完成度レポートの更新に失敗しました。\n${result.stderr || result.stdout}`,
    );
  }
}

function clearDataset(db) {
  const tableIds = db
    .prepare("SELECT id FROM statistical_tables WHERE dataset_id = ?")
    .all(BUILDBASE_DATASET_ID)
    .map((row) => row.id);
  db.exec("BEGIN");
  try {
    for (const tableId of tableIds) {
      db.prepare(
        `DELETE FROM observations WHERE series_id IN
           (SELECT id FROM series WHERE table_id = ?)`,
      ).run(tableId);
      db.prepare(
        `DELETE FROM series_dimensions WHERE series_id IN
           (SELECT id FROM series WHERE table_id = ?)`,
      ).run(tableId);
      db.prepare("DELETE FROM series WHERE table_id = ?").run(tableId);
      db.prepare("DELETE FROM observation_sources WHERE table_id = ?").run(tableId);
      db.prepare(
        `DELETE FROM dimension_values WHERE dimension_id IN
           (SELECT id FROM dimensions WHERE table_id = ?)`,
      ).run(tableId);
      db.prepare("DELETE FROM dimensions WHERE table_id = ?").run(tableId);
      db.prepare("DELETE FROM concept_mappings WHERE table_id = ?").run(tableId);
      db.prepare("DELETE FROM statistical_tables WHERE id = ?").run(tableId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function writeCatalog(data) {
  const catalog = {
    schemaVersion: 1,
    datasetId: BUILDBASE_DATASET_ID,
    tableId: BUILDBASE_TABLE_ID,
    title: "ゼネコン21社 会社別主要指標（売上高・利益・受注・人員等）",
    source: "BuildBase final master",
    sourceUpdatedAt: data.sourceUpdatedAt,
    sourceHash: data.sourceHash,
    fiscalYearFrom: data.fiscalYears[0],
    fiscalYearTo: data.fiscalYears.at(-1),
    companyCount: data.companies.length,
    companyYearCount: data.companyYearCount,
    fieldCount: data.fields.length,
    cellCount: data.cells.length,
    statusCounts: data.statusCounts,
  };
  mkdirSync(dirname(CATALOG_PATH), { recursive: true });
  writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
}

if (!existsSync(DATABASE_PATH)) {
  throw new Error(`正規化DBがありません: ${DATABASE_PATH}`);
}

refreshCompletionReport();
const data = loadBuildBaseCompanyData(BUILDBASE_ROOT);
const catalog = writeCatalog(data);
const dimensions = buildBuildBaseDimensions(data);
const { observations, seriesLabel } = buildBuildBaseObservations(data, dimensions);
const fetchedAt = data.sourceUpdatedAt;

if (existsSync(BUILD_PATH)) rmSync(BUILD_PATH);
copyFileSync(DATABASE_PATH, BUILD_PATH, fsConstants.COPYFILE_FICLONE);
const db = openStatisticsDatabase(BUILD_PATH);
const runId = randomUUID();
db.prepare(
  `INSERT INTO ingestion_runs(id, started_at, status)
   VALUES (?, ?, 'running')`,
).run(runId, fetchedAt);

try {
  clearDataset(db);
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
  replaceDimensions(db, BUILDBASE_TABLE_ID, dimensions);
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
  });
  write(observations);
  write.finish();
  finalizeTable(db, BUILDBASE_TABLE_ID, timeCodes);
  db.prepare(
    `UPDATE ingestion_runs
        SET completed_at = ?, status = 'complete',
            table_count = 1, observation_count = ?
      WHERE id = ?`,
  ).run(new Date().toISOString(), observations.length, runId);
  db.exec("PRAGMA optimize");
  db.close();

  const previousPath = `${DATABASE_PATH}.previous`;
  const pendingPreviousPath = `${previousPath}.${runId}.linking`;
  try {
    linkSync(DATABASE_PATH, pendingPreviousPath);
    renameSync(pendingPreviousPath, previousPath);
  } catch {
    if (existsSync(pendingPreviousPath)) rmSync(pendingPreviousPath);
    copyFileSync(DATABASE_PATH, previousPath);
  }
  renameSync(BUILD_PATH, DATABASE_PATH);
  process.stdout.write(
    `BuildBase dataset: ${BUILDBASE_DATASET_ID}\n` +
      `companies: ${catalog.companyCount}\n` +
      `fields: ${catalog.fieldCount}\n` +
      `company years: ${catalog.companyYearCount}\n` +
      `cells: ${catalog.cellCount}\n` +
      `filled: ${catalog.statusCounts.filled}\n` +
      `not disclosed: ${catalog.statusCounts.not_applicable}\n` +
      `publication pending: ${catalog.statusCounts.publication_pending}\n`,
  );
} catch (error) {
  try {
    db.prepare(
      `UPDATE ingestion_runs
          SET completed_at = ?, status = 'failed', error = ?
        WHERE id = ?`,
    ).run(new Date().toISOString(), String(error?.stack ?? error), runId);
    db.close();
  } catch {
    // Preserve the original error.
  }
  if (existsSync(BUILD_PATH)) rmSync(BUILD_PATH);
  throw error;
}
