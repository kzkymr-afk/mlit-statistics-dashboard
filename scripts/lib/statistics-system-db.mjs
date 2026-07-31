import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 2;

export function openStatisticsDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS system_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      government_statistics_code TEXT NOT NULL,
      provided_statistics_id TEXT,
      source_url TEXT NOT NULL,
      fiscal_year_from INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS statistical_tables (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES datasets(id),
      title TEXT NOT NULL,
      statistics_name TEXT NOT NULL,
      cycle TEXT NOT NULL,
      survey_date TEXT,
      open_date TEXT,
      updated_date TEXT,
      total_number INTEGER,
      source_kind TEXT NOT NULL,
      source_url TEXT NOT NULL,
      registry_status TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS statistical_tables_dataset_idx
      ON statistical_tables(dataset_id);
    CREATE INDEX IF NOT EXISTS statistical_tables_title_idx
      ON statistical_tables(title);

    CREATE TABLE IF NOT EXISTS dimensions (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL REFERENCES statistical_tables(id),
      api_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL,
      UNIQUE(table_id, api_key)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS dimension_values (
      dimension_id TEXT NOT NULL REFERENCES dimensions(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      level INTEGER,
      parent_code TEXT,
      unit TEXT,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY(dimension_id, code)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS dimension_values_name_idx
      ON dimension_values(name);

    CREATE TABLE IF NOT EXISTS statistical_concepts (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES datasets(id),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      default_unit TEXT,
      status TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS concept_mappings (
      id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL REFERENCES statistical_concepts(id),
      table_id TEXT NOT NULL REFERENCES statistical_tables(id),
      selector_json TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      reviewed_at TEXT,
      note TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS concept_mappings_concept_idx
      ON concept_mappings(concept_id);

    CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL REFERENCES statistical_tables(id),
      label TEXT NOT NULL,
      unit TEXT,
      first_time_code TEXT,
      last_time_code TEXT,
      time_mask INTEGER NOT NULL DEFAULT 0,
      time_mask_text TEXT,
      observation_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS series_table_idx ON series(table_id);

    CREATE TABLE IF NOT EXISTS series_dimensions (
      series_id TEXT NOT NULL REFERENCES series(id),
      dimension_id TEXT NOT NULL REFERENCES dimensions(id),
      value_code TEXT NOT NULL,
      PRIMARY KEY(series_id, dimension_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS observation_sources (
      id TEXT PRIMARY KEY,
      source_kind TEXT NOT NULL,
      table_id TEXT REFERENCES statistical_tables(id),
      source_url TEXT NOT NULL,
      local_path TEXT,
      sha256 TEXT,
      published_at TEXT,
      retrieved_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS observation_sources_table_idx
      ON observation_sources(table_id);

    CREATE TABLE IF NOT EXISTS observations (
      series_id TEXT NOT NULL REFERENCES series(id),
      time_code TEXT NOT NULL,
      value TEXT,
      numeric_value REAL,
      unit TEXT,
      annotation TEXT,
      status TEXT NOT NULL,
      source_id TEXT NOT NULL REFERENCES observation_sources(id),
      fetched_at TEXT NOT NULL,
      PRIMARY KEY(series_id, time_code)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS ingestion_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      table_count INTEGER NOT NULL DEFAULT 0,
      observation_count INTEGER NOT NULL DEFAULT 0,
      error TEXT
    ) STRICT;
  `);
  const seriesColumns = db
    .prepare("PRAGMA table_info(series)")
    .all()
    .map((column) => column.name);
  if (!seriesColumns.includes("time_mask")) {
    db.exec(
      "ALTER TABLE series ADD COLUMN time_mask INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!seriesColumns.includes("time_mask_text")) {
    db.exec("ALTER TABLE series ADD COLUMN time_mask_text TEXT");
  }
  db.prepare(
    `INSERT INTO system_meta(key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(String(SCHEMA_VERSION));
  return db;
}

export function upsertDataset(db, dataset) {
  db.prepare(
    `INSERT INTO datasets (
       id, title, government_statistics_code, provided_statistics_id,
       source_url, fiscal_year_from
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       government_statistics_code = excluded.government_statistics_code,
       provided_statistics_id = excluded.provided_statistics_id,
       source_url = excluded.source_url,
       fiscal_year_from = excluded.fiscal_year_from`,
  ).run(
    dataset.id,
    dataset.title,
    dataset.governmentStatisticsCode,
    dataset.providedStatisticsId ?? null,
    dataset.sourceUrl,
    dataset.fiscalYearFrom,
  );
}

export function upsertStatisticalTable(
  db,
  datasetId,
  table,
  fetchedAt,
  {
    sourceKind = "estat-api",
    sourceUrl = `https://www.e-stat.go.jp/dbview?sid=${encodeURIComponent(table.id)}`,
    registryStatus = "discovered",
  } = {},
) {
  db.prepare(
    `INSERT INTO statistical_tables (
       id, dataset_id, title, statistics_name, cycle, survey_date,
       open_date, updated_date, total_number, source_kind, source_url,
       registry_status, fetched_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       dataset_id = excluded.dataset_id,
       title = excluded.title,
       statistics_name = excluded.statistics_name,
       cycle = excluded.cycle,
       survey_date = excluded.survey_date,
       open_date = excluded.open_date,
       updated_date = excluded.updated_date,
       total_number = excluded.total_number,
       source_kind = excluded.source_kind,
       source_url = excluded.source_url,
       registry_status = excluded.registry_status,
       fetched_at = excluded.fetched_at`,
  ).run(
    table.id,
    datasetId,
    table.title,
    table.statisticsName,
    table.cycle,
    table.surveyDate || null,
    table.openDate || null,
    table.updatedDate || null,
    table.overallTotalNumber || null,
    sourceKind,
    sourceUrl,
    registryStatus,
    fetchedAt,
  );
}

export function replaceDimensions(db, tableId, dimensions) {
  const insertDimension = db.prepare(
    `INSERT INTO dimensions (
       id, table_id, api_key, name, description, sort_order
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       sort_order = excluded.sort_order`,
  );
  const insertValue = db.prepare(
    `INSERT INTO dimension_values (
       dimension_id, code, name, level, parent_code, unit, sort_order
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(dimension_id, code) DO UPDATE SET
       name = excluded.name,
       level = excluded.level,
       parent_code = excluded.parent_code,
       unit = excluded.unit,
       sort_order = excluded.sort_order`,
  );
  db.exec("BEGIN");
  try {
    for (const dimension of dimensions) {
      insertDimension.run(
        dimension.id,
        tableId,
        dimension.apiKey,
        dimension.name,
        dimension.description || null,
        dimension.sortOrder,
      );
      for (const value of dimension.values) {
        insertValue.run(
          dimension.id,
          value.code,
          value.name,
          value.level,
          value.parentCode || null,
          value.unit || null,
          value.sortOrder,
        );
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function upsertObservationSource(
  db,
  {
    id,
    tableId,
    sourceUrl,
    publishedAt,
    retrievedAt,
    sourceKind = "estat-api",
    localPath = null,
    sha256 = null,
  },
) {
  db.prepare(
    `INSERT INTO observation_sources (
       id, source_kind, table_id, source_url, local_path, sha256,
       published_at, retrieved_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source_kind = excluded.source_kind,
       source_url = excluded.source_url,
       local_path = excluded.local_path,
       sha256 = excluded.sha256,
       published_at = excluded.published_at,
       retrieved_at = excluded.retrieved_at`,
  ).run(
    id,
    sourceKind,
    tableId,
    sourceUrl,
    localPath,
    sha256,
    publishedAt || null,
    retrievedAt,
  );
}

export function makeObservationWriter(
  db,
  {
    tableId,
    dimensions,
    sourceId,
    fetchedAt,
    seriesLabel,
    timeCodes = [],
    storeObservationValues = true,
    writeSeriesMetadata = true,
  },
) {
  // e-Statは同じ系列の各時点を連続して返す。直前と同じ系列なら
  // 系列・軸情報を書き直さず、観測値だけを保存する。
  let lastSeriesId = "";
  const sortedTimeCodes = [...timeCodes].sort();
  const usesVariableLengthMask = sortedTimeCodes.length > 62;
  const timeBitByCode = new Map(
    sortedTimeCodes.map((timeCode, index) => [
      timeCode,
      1n << BigInt(index),
    ]),
  );
  let currentTimeMask = 0n;
  let currentFirstTimeCode = "";
  let currentLastTimeCode = "";
  const insertSeries = db.prepare(
    `INSERT INTO series (
       id, table_id, label, unit, first_time_code, last_time_code,
       time_mask, observation_count, status
     ) VALUES (?, ?, ?, ?, NULL, NULL, 0, 0, 'active')
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       unit = excluded.unit`,
  );
  const updateSeriesTimeMask = db.prepare(
    `UPDATE series
        SET time_mask = time_mask | ?,
            first_time_code = CASE
              WHEN first_time_code IS NULL OR ? < first_time_code THEN ?
              ELSE first_time_code
            END,
            last_time_code = CASE
              WHEN last_time_code IS NULL OR ? > last_time_code THEN ?
              ELSE last_time_code
            END
      WHERE id = ?`,
  );
  const readSeriesVariableMask = db.prepare(
    `SELECT time_mask_text AS timeMaskText
       FROM series
      WHERE id = ?`,
  );
  const updateSeriesVariableMask = db.prepare(
    `UPDATE series
        SET time_mask_text = ?,
            observation_count = ?,
            first_time_code = CASE
              WHEN first_time_code IS NULL OR ? < first_time_code THEN ?
              ELSE first_time_code
            END,
            last_time_code = CASE
              WHEN last_time_code IS NULL OR ? > last_time_code THEN ?
              ELSE last_time_code
            END
      WHERE id = ?`,
  );
  const insertSeriesDimension = db.prepare(
    `INSERT INTO series_dimensions(series_id, dimension_id, value_code)
     VALUES (?, ?, ?)
     ON CONFLICT(series_id, dimension_id) DO UPDATE SET
       value_code = excluded.value_code`,
  );
  const insertObservation = db.prepare(
    `INSERT INTO observations (
       series_id, time_code, value, numeric_value, unit, annotation,
       status, source_id, fetched_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const upsertObservation = db.prepare(
    `INSERT INTO observations (
       series_id, time_code, value, numeric_value, unit, annotation,
       status, source_id, fetched_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(series_id, time_code) DO UPDATE SET
       value = excluded.value,
       numeric_value = excluded.numeric_value,
       unit = excluded.unit,
       annotation = excluded.annotation,
       status = excluded.status,
       source_id = excluded.source_id,
       fetched_at = excluded.fetched_at`,
  );
  const dimensionIdByApiKey = new Map(
    dimensions.map((dimension) => [dimension.apiKey, dimension.id]),
  );

  const flushSeriesState = () => {
    if (!lastSeriesId || currentTimeMask === 0n) return;
    if (usesVariableLengthMask) {
      const existingMaskText =
        readSeriesVariableMask.get(lastSeriesId)?.timeMaskText;
      const existingMask = existingMaskText
        ? BigInt(`0x${existingMaskText}`)
        : 0n;
      const mergedMask = existingMask | currentTimeMask;
      const observationCount = mergedMask
        .toString(2)
        .replaceAll("0", "").length;
      updateSeriesVariableMask.run(
        mergedMask.toString(16),
        observationCount,
        currentFirstTimeCode,
        currentFirstTimeCode,
        currentLastTimeCode,
        currentLastTimeCode,
        lastSeriesId,
      );
    } else {
      updateSeriesTimeMask.run(
        currentTimeMask,
        currentFirstTimeCode,
        currentFirstTimeCode,
        currentLastTimeCode,
        currentLastTimeCode,
        lastSeriesId,
      );
    }
    currentTimeMask = 0n;
    currentFirstTimeCode = "";
    currentLastTimeCode = "";
  };

  const write = (observations, { replaceExisting = false } = {}) => {
    const observationStatement = replaceExisting
      ? upsertObservation
      : insertObservation;
    db.exec("BEGIN");
    try {
      for (const observation of observations) {
        if (observation.seriesId !== lastSeriesId) {
          flushSeriesState();
          if (writeSeriesMetadata) {
            insertSeries.run(
              observation.seriesId,
              tableId,
              seriesLabel(observation.coordinates),
              observation.unit || null,
            );
            for (const [apiKey, code] of Object.entries(
              observation.coordinates,
            )) {
              const dimensionId = dimensionIdByApiKey.get(apiKey);
              if (!dimensionId || !code) continue;
              insertSeriesDimension.run(
                observation.seriesId,
                dimensionId,
                code,
              );
            }
          }
          lastSeriesId = observation.seriesId;
        }
        const timeBit = timeBitByCode.get(observation.timeCode) ?? 0n;
        currentTimeMask |= timeBit;
        if (
          !currentFirstTimeCode ||
          observation.timeCode < currentFirstTimeCode
        ) {
          currentFirstTimeCode = observation.timeCode;
        }
        if (
          !currentLastTimeCode ||
          observation.timeCode > currentLastTimeCode
        ) {
          currentLastTimeCode = observation.timeCode;
        }
        if (!storeObservationValues) continue;
        // 公表された0は原本JSONに残し、正規DBでは系列の既定値として
        // 暗黙保持する。非0、欠測、秘匿、注記付き値は行として保存する。
        if (
          observation.numericValue === 0 &&
          !observation.annotation
        ) {
          continue;
        }
        observationStatement.run(
          observation.seriesId,
          observation.timeCode,
          observation.rawValue || null,
          observation.numericValue,
          observation.unit || null,
          observation.annotation || null,
          observation.status,
          observation.sourceId || sourceId,
          fetchedAt,
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  write.finish = () => {
    db.exec("BEGIN");
    try {
      flushSeriesState();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  return write;
}

export function finalizeTable(db, tableId, timeCodes = []) {
  const sortedTimeCodes = [...timeCodes].sort();
  if (sortedTimeCodes.length > 0 && sortedTimeCodes.length <= 62) {
    const bitCountExpression = sortedTimeCodes
      .map((_, index) => `((time_mask >> ${index}) & 1)`)
      .join(" + ");
    db.prepare(
      `UPDATE series
          SET observation_count = ${bitCountExpression}
        WHERE table_id = ?`,
    ).run(tableId);
  } else if (sortedTimeCodes.length === 0) {
    db.prepare(
      `UPDATE series
          SET first_time_code = (
                SELECT MIN(time_code) FROM observations
                 WHERE observations.series_id = series.id
              ),
              last_time_code = (
                SELECT MAX(time_code) FROM observations
                 WHERE observations.series_id = series.id
              ),
              observation_count = (
                SELECT COUNT(*) FROM observations
                 WHERE observations.series_id = series.id
              )
        WHERE table_id = ?`,
    ).run(tableId);
  }
  db.prepare(
    `UPDATE statistical_tables
        SET registry_status = 'ready'
      WHERE id = ?`,
  ).run(tableId);
}
