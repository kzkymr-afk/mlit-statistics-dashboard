import { createHash, randomUUID } from "node:crypto";
import {
  constants as fsConstants,
  copyFileSync,
  existsSync,
  linkSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { relative, resolve } from "node:path";

import {
  buildValueLookup,
  normalizeObservation,
  seriesLabel,
} from "./lib/estat-normalize.mjs";
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
const DATABASE_PATH = resolve(
  ROOT,
  process.env.MLIT_SYSTEM_DATABASE_PATH ??
    "data/database/mlit-statistics-system.sqlite",
);
const BUILD_PATH = `${DATABASE_PATH}.nikkenren-building`;
const CATALOG_PATH = resolve(
  ROOT,
  "data/catalogs/nikkenren-group-orders.json",
);
const DATASET_ID = "nikkenren-group-orders";
const TABLE_ID = "nikkenren-group-orders-annual";
const SOURCE_ID = "nikkenren-excel:group-orders:2013-2025";

if (!existsSync(DATABASE_PATH)) {
  throw new Error(`正規化DBがありません: ${DATABASE_PATH}`);
}

const catalogBytes = readFileSync(CATALOG_PATH);
const catalog = JSON.parse(catalogBytes);
const fetchedAt = catalog.retrievedAt || new Date().toISOString();

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: ${actual} != ${expected}`);
  }
}

function validateCatalog() {
  assertEqual(catalog.datasetId, DATASET_ID, "データセットID");
  assertEqual(catalog.years.length, 13, "年度数");
  assertEqual(catalog.measures.length, 5, "指標数");
  assertEqual(catalog.groupCodes.length, 5, "グループ数");
  assertEqual(catalog.fiscalYearFrom, 2013, "開始年度");
  assertEqual(catalog.fiscalYearTo, 2025, "終了年度");

  for (const [index, year] of catalog.years.entries()) {
    assertEqual(year.fiscalYear, 2013 + index, "年度の連続性");
    assertEqual(year.groups.length, 5, `${year.fiscalYear}年度のグループ数`);
    assertEqual(
      new Set(year.groups.map((group) => group.group)).size,
      5,
      `${year.fiscalYear}年度のグループ重複`,
    );
    if (!Number.isInteger(year.memberCount) || year.memberCount <= 0) {
      throw new Error(`${year.fiscalYear}年度の会員社数が不正です。`);
    }
    for (const group of year.groups) {
      assertEqual(
        group.buildingTotal,
        group.domesticBuilding + group.overseasBuilding,
        `${year.fiscalYear}年度 第${group.group}グループ 建築全体`,
      );
      assertEqual(
        group.domesticBuilding,
        group.privateBuilding + group.publicBuilding + group.otherBuilding,
        `${year.fiscalYear}年度 第${group.group}グループ 国内建築`,
      );
    }
    for (const key of [
      "buildingTotal",
      "domesticBuilding",
      "privateBuilding",
      "publicBuilding",
      "otherBuilding",
      "overseasBuilding",
    ]) {
      assertEqual(
        year.groups.reduce((sum, group) => sum + group[key], 0),
        year.total[key],
        `${year.fiscalYear}年度 ${key} グループ合算`,
      );
    }
  }
}

function clearDataset(db) {
  const tableIds = db
    .prepare("SELECT id FROM statistical_tables WHERE dataset_id = ?")
    .all(DATASET_ID)
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
      db.prepare("DELETE FROM observation_sources WHERE table_id = ?").run(
        tableId,
      );
      db.prepare(
        `DELETE FROM dimension_values WHERE dimension_id IN
           (SELECT id FROM dimensions WHERE table_id = ?)`,
      ).run(tableId);
      db.prepare("DELETE FROM dimensions WHERE table_id = ?").run(tableId);
      db.prepare("DELETE FROM concept_mappings WHERE table_id = ?").run(
        tableId,
      );
      db.prepare("DELETE FROM statistical_tables WHERE id = ?").run(tableId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function dimensions() {
  return [
    {
      id: `${TABLE_ID}:tab`,
      tableId: TABLE_ID,
      apiKey: "tab",
      name: "受注区分",
      description: "原表の建築列から選択した5指標",
      sortOrder: 0,
      values: catalog.measures.map((measure, index) => ({
        code: measure.code,
        name: measure.name,
        level: 1,
        parentCode: "",
        unit: catalog.unit,
        sortOrder: index,
      })),
    },
    {
      id: `${TABLE_ID}:cat01`,
      tableId: TABLE_ID,
      apiKey: "cat01",
      name: "企業規模グループ",
      description: "日建連原表の第1グループから第5グループ",
      sortOrder: 1,
      values: catalog.groupCodes.map((group, index) => ({
        code: group,
        name: `第${group}グループ`,
        level: 1,
        parentCode: "",
        unit: "",
        sortOrder: index,
      })),
    },
    {
      id: `${TABLE_ID}:time`,
      tableId: TABLE_ID,
      apiKey: "time",
      name: "年度",
      description: "4月から翌年3月まで。括弧内は当該年度の集計対象社数。",
      sortOrder: 2,
      values: catalog.years.map((year, index) => ({
        code: `${year.fiscalYear}100000`,
        name: `${year.fiscalYear}年度（会員${year.memberCount}社）`,
        level: 1,
        parentCode: "",
        unit: "",
        sortOrder: index,
      })),
    },
  ];
}

const FIELD_BY_MEASURE = {
  "building-total": "buildingTotal",
  "domestic-building": "domesticBuilding",
  "overseas-building": "overseasBuilding",
  "private-building": "privateBuilding",
  "public-building": "publicBuilding",
};

function observations() {
  const rows = [];
  for (const measure of catalog.measures) {
    const field = FIELD_BY_MEASURE[measure.code];
    if (!field) throw new Error(`未対応の指標です: ${measure.code}`);
    for (const groupCode of catalog.groupCodes) {
      for (const year of catalog.years) {
        const group = year.groups.find((item) => item.group === groupCode);
        if (!group) {
          throw new Error(`${year.fiscalYear}年度 第${groupCode}グループがありません。`);
        }
        rows.push(
          normalizeObservation(
            {
              "@tab": measure.code,
              "@cat01": groupCode,
              "@time": `${year.fiscalYear}100000`,
              "@unit": catalog.unit,
              "@annotation": `集計対象: 日建連会員${year.memberCount}社`,
              $: String(group[field]),
            },
            TABLE_ID,
          ),
        );
      }
    }
  }
  return rows.sort(
    (left, right) =>
      left.seriesId.localeCompare(right.seriesId) ||
      left.timeCode.localeCompare(right.timeCode),
  );
}

validateCatalog();
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
    id: DATASET_ID,
    title: catalog.title,
    governmentStatisticsCode: "NIKKENREN",
    providedStatisticsId: "group-orders",
    sourceUrl: catalog.officialSourceUrl,
    fiscalYearFrom: catalog.fiscalYearFrom,
  });
  upsertStatisticalTable(
    db,
    DATASET_ID,
    {
      id: TABLE_ID,
      title: "企業規模別受注高（第1～第5グループ）",
      statisticsName: catalog.title,
      cycle: "年度次",
      surveyDate: String(catalog.fiscalYearTo),
      openDate: "",
      updatedDate: "",
      overallTotalNumber: 325,
    },
    fetchedAt,
    {
      sourceKind: "nikkenren-excel",
      sourceUrl: catalog.officialSourceUrl,
      registryStatus: "ready",
    },
  );

  const tableDimensions = dimensions();
  replaceDimensions(db, TABLE_ID, tableDimensions);
  upsertObservationSource(db, {
    id: SOURCE_ID,
    tableId: TABLE_ID,
    sourceUrl: catalog.officialSourceUrl,
    publishedAt: null,
    retrievedAt: fetchedAt,
    sourceKind: "nikkenren-excel",
    localPath: relative(ROOT, CATALOG_PATH),
    sha256: createHash("sha256").update(catalogBytes).digest("hex"),
  });

  const normalizedObservations = observations();
  const lookup = buildValueLookup(tableDimensions);
  const write = makeObservationWriter(db, {
    tableId: TABLE_ID,
    dimensions: tableDimensions,
    sourceId: SOURCE_ID,
    fetchedAt,
    timeCodes: tableDimensions
      .find((dimension) => dimension.apiKey === "time")
      .values.map((value) => value.code),
    seriesLabel: (coordinates) => seriesLabel(coordinates, lookup),
  });
  write(normalizedObservations);
  write.finish();
  finalizeTable(
    db,
    TABLE_ID,
    tableDimensions
      .find((dimension) => dimension.apiKey === "time")
      .values.map((value) => value.code),
  );

  db.prepare(
    `UPDATE ingestion_runs
        SET completed_at = ?, status = 'complete',
            table_count = 1, observation_count = ?
      WHERE id = ?`,
  ).run(new Date().toISOString(), normalizedObservations.length, runId);
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
    `nikkenren dataset: ${DATASET_ID}\n` +
      `table: ${TABLE_ID}\n` +
      `series: 25\n` +
      `observations: ${normalizedObservations.length}\n`,
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
