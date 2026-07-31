import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { EStatApiClient } from "./lib/estat-api-client.mjs";
import {
  buildValueLookup,
  fiscalYearFromTimeCode,
  normalizeMetaInfo,
  normalizeObservation,
  normalizeSimpleStatsDataCsv,
  normalizeStatsList,
  seriesLabel,
  statsDataTotalNumber,
  statsDataValues,
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
const APP_ID = process.env.ESTAT_APP_ID?.trim();
const DATABASE_PATH = resolve(
  ROOT,
  "data/database/mlit-statistics-system.sqlite",
);
const BUILD_PATH = `${DATABASE_PATH}.building`;
const API_PAGE_SIZE = 100_000;
const API_FETCH_CONCURRENCY = 3;
const API_TABLE_REGISTRY = JSON.parse(
  readFileSync(
    resolve(ROOT, "data/catalogs/estat-api-table-registry.json"),
    "utf8",
  ),
);
const INVENTORY_ONLY = process.argv.includes("--inventory-only");
const RESUME = process.argv.includes("--resume");
const tableArgumentIndex = process.argv.indexOf("--table");
const ONLY_TABLE_ID =
  tableArgumentIndex >= 0 ? process.argv[tableArgumentIndex + 1] : "";
const datasetArgumentIndex = process.argv.indexOf("--dataset");
const ONLY_DATASET_ID =
  datasetArgumentIndex >= 0
    ? process.argv[datasetArgumentIndex + 1]
    : "";

const targets = [
  {
    id: "building-starts",
    title: "建築着工統計",
    governmentStatisticsCode: "00600120",
    providedStatisticsId: "000001016965",
    sourceUrl:
      "https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00600120&tstat=000001016965&cycle=8&tclass1val=0",
    fiscalYearFrom: 2013,
    matches(entry) {
      return /年/.test(entry.cycle);
    },
  },
  {
    id: "orders-major50",
    title: "受注動態（大手50社）",
    governmentStatisticsCode: "00600130",
    providedStatisticsId: "000001015811",
    sourceUrl:
      "https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00600130&tstat=000001015811&cycle=8&tclass1=000001015812&tclass2val=0",
    fiscalYearFrom: 2013,
    matches(entry) {
      return /年/.test(entry.cycle);
    },
  },
];

if (!APP_ID) {
  throw new Error(
    "ESTAT_APP_IDが未設定です。Excelビューアへのフォールバックは行いません。" +
      "e-Stat APIのアプリケーションIDを設定して再実行してください。",
  );
}

function saveJson(path, value) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function saveText(path, value) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, value);
}

function tableJsonDataPath(targetId, tableId, page) {
  return resolve(
    ROOT,
    "data/raw/api",
    targetId,
    tableId,
    `data-${String(page).padStart(4, "0")}.json`,
  );
}

function tableCsvDataPath(targetId, tableId, page) {
  return resolve(
    ROOT,
    "data/raw/api",
    targetId,
    tableId,
    `data-${String(page).padStart(4, "0")}.csv`,
  );
}

function cachedTableDataPath(targetId, tableId, page) {
  const csvPath = tableCsvDataPath(targetId, tableId, page);
  if (existsSync(csvPath)) return csvPath;
  const jsonPath = tableJsonDataPath(targetId, tableId, page);
  return existsSync(jsonPath) ? jsonPath : "";
}

function readCachedDataPage(path) {
  if (path.endsWith(".csv")) {
    return normalizeSimpleStatsDataCsv(readFileSync(path, "utf8"));
  }
  const body = JSON.parse(readFileSync(path, "utf8"));
  return {
    totalNumber: statsDataTotalNumber(body),
    values: statsDataValues(body),
  };
}

if (existsSync(BUILD_PATH) && !RESUME) rmSync(BUILD_PATH);
if (RESUME && !existsSync(BUILD_PATH) && existsSync(DATABASE_PATH)) {
  copyFileSync(DATABASE_PATH, BUILD_PATH);
}
const db = openStatisticsDatabase(BUILD_PATH);
db.exec(`
  DROP INDEX IF EXISTS observations_time_idx;
  DROP INDEX IF EXISTS series_label_idx;
  DROP INDEX IF EXISTS series_dimensions_value_idx;
`);
const client = new EStatApiClient({ appId: APP_ID });
const runId = randomUUID();
const startedAt = new Date().toISOString();
db.prepare(
  `UPDATE ingestion_runs
      SET completed_at = COALESCE(completed_at, ?),
          status = 'interrupted',
          error = COALESCE(error, 'Previous ingestion process did not complete.')
    WHERE status = 'running'`,
).run(startedAt);
db.prepare(
  `INSERT INTO ingestion_runs(id, started_at, status)
   VALUES (?, ?, 'running')`,
).run(runId, startedAt);

let tableCount = 0;
let observationCount = 0;

function clearTableData(tableId) {
  db.exec("BEGIN");
  try {
    db.prepare(
      `DELETE FROM observations
        WHERE series_id IN (
          SELECT id FROM series WHERE table_id = ?
        )`,
    ).run(tableId);
    db.prepare(
      `DELETE FROM series_dimensions
        WHERE series_id IN (
          SELECT id FROM series WHERE table_id = ?
        )`,
    ).run(tableId);
    db.prepare("DELETE FROM series WHERE table_id = ?").run(tableId);
    db.prepare(
      "DELETE FROM observation_sources WHERE table_id = ?",
    ).run(tableId);
    db.prepare(
      `DELETE FROM dimension_values
        WHERE dimension_id IN (
          SELECT id FROM dimensions WHERE table_id = ?
        )`,
    ).run(tableId);
    db.prepare("DELETE FROM dimensions WHERE table_id = ?").run(
      tableId,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function backfillTableTimeMasks({
  target,
  table,
  dimensions,
  allowedTimeCodes,
  fetchedAt,
}) {
  db.prepare(
    `UPDATE series
        SET time_mask = 0,
            observation_count = 0,
            first_time_code = NULL,
            last_time_code = NULL
      WHERE table_id = ?`,
  ).run(table.id);
  const valueLookup = buildValueLookup(dimensions);
  const writeTimeMasks = makeObservationWriter(db, {
    tableId: table.id,
    dimensions,
    sourceId: "",
    fetchedAt,
    timeCodes: allowedTimeCodes,
    storeObservationValues: false,
    writeSeriesMetadata: false,
    seriesLabel: (coordinates) =>
      seriesLabel(coordinates, valueLookup),
  });
  const seriesCache = { identity: "", seriesId: "" };
  let page = 1;
  let pagePath = cachedTableDataPath(target.id, table.id, page);
  if (!pagePath) {
    throw new Error(
      `${table.id}: 年度マスク再構築用の原本ページがありません。`,
    );
  }
  while (pagePath) {
    const dataPage = readCachedDataPage(pagePath);
    const observations = dataPage.values
      .map((value) =>
        normalizeObservation(value, table.id, seriesCache),
      )
      .filter((observation) => {
        const fiscalYear = fiscalYearFromTimeCode(
          observation.timeCode,
        );
        return (
          observation.timeCode &&
          (fiscalYear === null ||
            fiscalYear >= target.fiscalYearFrom)
        );
      });
    writeTimeMasks(observations);
    page += 1;
    pagePath = cachedTableDataPath(target.id, table.id, page);
  }
  writeTimeMasks.finish();
  finalizeTable(db, table.id, allowedTimeCodes);
}

try {
  for (const target of targets) {
    if (ONLY_DATASET_ID && target.id !== ONLY_DATASET_ID) continue;
    upsertDataset(db, target);
    const inventoryResponse = await client.statsList({
      statsCode: target.governmentStatisticsCode,
      searchKind: 1,
      explanationGetFlg: "Y",
      limit: 100_000,
    });
    const rawInventoryPath = resolve(
      ROOT,
      "data/raw/api",
      target.id,
      "stats-list.json",
    );
    saveJson(rawInventoryPath, inventoryResponse.body);

    const registeredTableIds =
      API_TABLE_REGISTRY.datasets?.[target.id]?.tableIds ?? [];
    const discovered = Array.from(
      new Map(
        normalizeStatsList(inventoryResponse.body)
          .filter(
            (entry) =>
              target.matches(entry) &&
              (registeredTableIds.length === 0 ||
                registeredTableIds.includes(entry.id)) &&
              (!ONLY_TABLE_ID || entry.id === ONLY_TABLE_ID),
          )
          .map((entry) => [entry.id, entry]),
      ).values(),
    );
    if (discovered.length === 0) {
      throw new Error(
        `${target.title}: 条件に合うe-Stat DB統計表が見つかりませんでした。`,
      );
    }

    const registry = {
      schemaVersion: 2,
      datasetId: target.id,
      governmentStatisticsCode: target.governmentStatisticsCode,
      fetchedAt: new Date().toISOString(),
      sourceKind: "estat-api",
      status: INVENTORY_ONLY ? "inventory" : "ingesting",
      tables: [],
    };

    for (const table of discovered) {
      const fetchedAt = new Date().toISOString();
      const existingTable = db
        .prepare(
          `SELECT updated_date, registry_status
             FROM statistical_tables
            WHERE id = ?`,
        )
        .get(table.id);
      const metaResponse = await client.metaInfo(table.id);
      saveJson(
        resolve(
          ROOT,
          "data/raw/api",
          target.id,
          table.id,
          "meta.json",
        ),
        metaResponse.body,
      );
      const dimensions = normalizeMetaInfo(metaResponse.body, table.id);
      const allowedTimeCodes =
        dimensions
          .find((dimension) => dimension.apiKey === "time")
          ?.values.filter((value) => {
            const fiscalYear = fiscalYearFromTimeCode(value.code);
            return (
              fiscalYear !== null &&
              fiscalYear >= target.fiscalYearFrom
            );
          })
          .map((value) => value.code) ?? [];
      if (allowedTimeCodes.length === 0) {
        process.stdout.write(
          `[${target.id}] ${table.id} skipped: no time codes since FY${target.fiscalYearFrom}\n`,
        );
        continue;
      }
      const sameTableVersion =
        RESUME &&
        existingTable &&
        (existingTable.updated_date || "") ===
          (table.updatedDate || "");
      if (
        RESUME &&
        existingTable &&
        !sameTableVersion &&
        !INVENTORY_ONLY
      ) {
        clearTableData(table.id);
      }
      upsertStatisticalTable(db, target.id, table, fetchedAt);
      replaceDimensions(db, table.id, dimensions);
      const tableRegistry = {
        ...table,
        dimensionCount: dimensions.length,
        dimensions: dimensions.map((dimension) => ({
          apiKey: dimension.apiKey,
          name: dimension.name,
          valueCount: dimension.values.length,
        })),
        observationCount: 0,
        timeCodeCount: allowedTimeCodes.length,
      };

      if (!INVENTORY_ONLY) {
        if (
          sameTableVersion &&
          existingTable.registry_status === "ready"
        ) {
          const missingTimeMasks = Number(
            db
              .prepare(
                `SELECT COUNT(*) AS count
                   FROM series
                  WHERE table_id = ? AND time_mask = 0`,
              )
              .get(table.id)?.count ?? 0,
          );
          if (missingTimeMasks > 0) {
            process.stdout.write(
              `[${target.id}] ${table.id} rebuilding yearly masks\n`,
            );
            backfillTableTimeMasks({
              target,
              table,
              dimensions,
              allowedTimeCodes,
              fetchedAt,
            });
          }
          const resumedCount = Number(
            db
              .prepare(
                `SELECT COALESCE(SUM(observation_count), 0) AS count
                   FROM series
                  WHERE table_id = ?`,
              )
              .get(table.id)?.count ?? 0,
          );
          tableRegistry.observationCount = resumedCount;
          observationCount += resumedCount;
          registry.tables.push(tableRegistry);
          tableCount += 1;
          process.stdout.write(
            `[${target.id}] ${table.id} resumed: ` +
              `${resumedCount.toLocaleString("ja-JP")} observations\n`,
          );
          continue;
        }

        const sourceId = `estat-api:${table.id}:${table.updatedDate || "current"}`;
        const sourceUrl = `https://www.e-stat.go.jp/dbview?sid=${encodeURIComponent(table.id)}`;
        upsertObservationSource(db, {
          id: sourceId,
          tableId: table.id,
          sourceUrl,
          publishedAt: table.updatedDate || table.openDate,
          retrievedAt: fetchedAt,
        });
        const valueLookup = buildValueLookup(dimensions);
        const writeObservations = makeObservationWriter(db, {
          tableId: table.id,
          dimensions,
          sourceId,
          fetchedAt,
          timeCodes: allowedTimeCodes,
          seriesLabel: (coordinates) =>
            seriesLabel(coordinates, valueLookup),
        });

        let newlyFetchedObservationCount = 0;
        let highestCachedPage = 0;
        if (sameTableVersion) {
          while (
            cachedTableDataPath(
              target.id,
              table.id,
              highestCachedPage + 1,
            )
          ) {
            highestCachedPage += 1;
          }
        }

        const timeFilter = { cdTime: allowedTimeCodes.join(",") };
        const seriesCache = { identity: "", seriesId: "" };
        const processDataPage = (
          dataResponse,
          writeMode,
        ) => {
          const observations = dataResponse.values
            .map((value) =>
              normalizeObservation(value, table.id, seriesCache),
            )
            .filter((observation) => {
              if (!observation.timeCode) return false;
              const fiscalYear = fiscalYearFromTimeCode(
                observation.timeCode,
              );
              return fiscalYear === null || fiscalYear >= target.fiscalYearFrom;
            });
          // 既存ページのうち最後より前は、前回処理でコミット済み。
          // 最後のページだけは保存直後に中断した可能性があるため再投入する。
          if (writeMode !== "skip") {
            writeObservations(observations, {
              replaceExisting: writeMode === "upsert",
            });
          }
          if (writeMode === "insert") {
            newlyFetchedObservationCount += observations.length;
          }
          return observations.length;
        };

        let firstDataResponse;
        if (highestCachedPage > 0) {
          firstDataResponse = readCachedDataPage(
            cachedTableDataPath(target.id, table.id, 1),
          );
          const lastCachedResponse =
            highestCachedPage === 1
              ? firstDataResponse
              : readCachedDataPage(
                  cachedTableDataPath(
                    target.id,
                    table.id,
                    highestCachedPage,
                  ),
                );
          // 最後の保存ページだけは、保存直後に中断した可能性がある。
          processDataPage(lastCachedResponse, "upsert");
        } else {
          const firstCsvResponse = await client.statsDataCsv(
            table.id,
            1,
            API_PAGE_SIZE,
            timeFilter,
          );
          saveText(
            tableCsvDataPath(target.id, table.id, 1),
            firstCsvResponse.text,
          );
          firstDataResponse = normalizeSimpleStatsDataCsv(
            firstCsvResponse.text,
          );
          processDataPage(firstDataResponse, "insert");
        }

        const totalNumber = firstDataResponse.totalNumber;
        if (totalNumber === null) {
          throw new Error(
            `${table.id}: e-Stat応答にTOTAL_NUMBERがありません。`,
          );
        }
        const totalPages = Math.ceil(totalNumber / API_PAGE_SIZE);
        const firstUncachedPage = Math.max(highestCachedPage + 1, 2);
        const pageStates = new Map();
        for (
          let page = firstUncachedPage;
          page <= totalPages;
          page += 1
        ) {
          let resolvePage;
          let rejectPage;
          const promise = new Promise((resolvePromise, rejectPromise) => {
            resolvePage = resolvePromise;
            rejectPage = rejectPromise;
          });
          pageStates.set(page, {
            promise,
            resolve: resolvePage,
            reject: rejectPage,
          });
        }
        let nextPageToFetch = firstUncachedPage;
        let processedThrough = firstUncachedPage - 1;
        const fetchWorkers = Array.from(
          {
            length: Math.min(
              API_FETCH_CONCURRENCY,
              Math.max(0, totalPages - firstUncachedPage + 1),
            ),
          },
          async () => {
            while (nextPageToFetch <= totalPages) {
              const page = nextPageToFetch;
              nextPageToFetch += 1;
              try {
                const csvResponse = await client.statsDataCsv(
                  table.id,
                  1 + (page - 1) * API_PAGE_SIZE,
                  API_PAGE_SIZE,
                  timeFilter,
                );
                pageStates.get(page).resolve(csvResponse);
                while (
                  page - processedThrough >
                  API_FETCH_CONCURRENCY * 2
                ) {
                  await new Promise((resolvePause) =>
                    setTimeout(resolvePause, 25),
                  );
                }
              } catch (error) {
                pageStates.get(page).reject(error);
                return;
              }
            }
          },
        );
        for (
          let page = firstUncachedPage;
          page <= totalPages;
          page += 1
        ) {
          const csvResponse = await pageStates.get(page).promise;
          saveText(
            tableCsvDataPath(target.id, table.id, page),
            csvResponse.text,
          );
          const dataResponse = normalizeSimpleStatsDataCsv(
            csvResponse.text,
          );
          processDataPage(dataResponse, "insert");
          processedThrough = page;
          pageStates.delete(page);
        }
        await Promise.all(fetchWorkers);
        writeObservations.finish();
        if (highestCachedPage > 0) {
          backfillTableTimeMasks({
            target,
            table,
            dimensions,
            allowedTimeCodes,
            fetchedAt,
          });
        } else {
          finalizeTable(db, table.id, allowedTimeCodes);
        }
        if (highestCachedPage > 0) {
          const resumedCount = Number(
            db
              .prepare(
                `SELECT COALESCE(SUM(observation_count), 0) AS count
                   FROM series
                  WHERE table_id = ?`,
              )
              .get(table.id)?.count ?? 0,
          );
          observationCount += resumedCount;
          tableRegistry.observationCount = resumedCount;
        } else {
          observationCount += newlyFetchedObservationCount;
          tableRegistry.observationCount =
            newlyFetchedObservationCount;
        }
      }

      registry.tables.push(tableRegistry);
      tableCount += 1;
      process.stdout.write(
        `[${target.id}] ${table.id} ${table.title}: ` +
          `${tableRegistry.observationCount.toLocaleString("ja-JP")} observations\n`,
      );
    }

    registry.status = INVENTORY_ONLY ? "inventory" : "ready";
    saveJson(
      resolve(
        ROOT,
        "data/normalized/api",
        target.id,
        "registry.json",
      ),
      registry,
    );
  }

  db.prepare(
    `UPDATE ingestion_runs
        SET completed_at = ?, status = 'complete',
            table_count = ?, observation_count = ?
      WHERE id = ?`,
  ).run(new Date().toISOString(), tableCount, observationCount, runId);
  db.exec(`
    CREATE INDEX IF NOT EXISTS observations_time_idx
      ON observations(time_code);
    CREATE INDEX IF NOT EXISTS series_label_idx
      ON series(label);
    CREATE INDEX IF NOT EXISTS series_dimensions_value_idx
      ON series_dimensions(dimension_id, value_code);
  `);
  db.exec("PRAGMA optimize");
  db.close();

  if (existsSync(DATABASE_PATH)) {
    copyFileSync(DATABASE_PATH, `${DATABASE_PATH}.previous`);
  }
  renameSync(BUILD_PATH, DATABASE_PATH);
  process.stdout.write(
    `system database: ${DATABASE_PATH}\n` +
      `tables: ${tableCount}\n` +
      `observations since FY2013: ${observationCount}\n`,
  );
} catch (error) {
  try {
    db.prepare(
      `UPDATE ingestion_runs
          SET completed_at = ?, status = 'failed',
              table_count = ?, observation_count = ?, error = ?
        WHERE id = ?`,
    ).run(
      new Date().toISOString(),
      tableCount,
      observationCount,
      String(error),
      runId,
    );
    db.close();
  } catch {
    // 元の例外を優先する。
  }
  throw error;
}
