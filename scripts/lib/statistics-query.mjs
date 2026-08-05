import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  compactText,
  fiscalYearFromTimeCode,
  seriesIdFor,
} from "./estat-normalize.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
export const DEFAULT_DATABASE_PATH = resolve(
  ROOT,
  process.env.MLIT_SYSTEM_DATABASE_PATH ??
    "data/database/mlit-statistics-system.sqlite",
);

const DEFAULT_VALUE_LIMIT = 100;
const MAX_VALUE_LIMIT = 2_000;
const DEFAULT_SEARCH_LIMIT = 30;
const MAX_SEARCH_LIMIT = 200;

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function likePattern(value) {
  return `%${String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")}%`;
}

function normalizeSelectionInput(selections) {
  if (!selections || typeof selections !== "object" || Array.isArray(selections)) {
    throw new Error("selections は {分類キー: コードまたは名称} で指定してください。");
  }
  return Object.fromEntries(
    Object.entries(selections)
      .map(([key, value]) => [compactText(key), compactText(value)])
      .filter(([key, value]) => key && value),
  );
}

function rowToDataset(row) {
  return {
    id: row.id,
    title: row.title,
    governmentStatisticsCode: row.governmentStatisticsCode,
    providedStatisticsId: row.providedStatisticsId,
    sourceUrl: row.sourceUrl,
    fiscalYearFrom: row.fiscalYearFrom,
    tableCount: row.tableCount,
  };
}

function rowToTable(row) {
  return {
    id: row.id,
    datasetId: row.datasetId,
    datasetTitle: row.datasetTitle,
    title: row.title,
    statisticsName: row.statisticsName,
    cycle: row.cycle,
    surveyDate: row.surveyDate,
    openDate: row.openDate,
    updatedDate: row.updatedDate,
    sourceKind: row.sourceKind,
    sourceUrl: row.sourceUrl,
    registryStatus: row.registryStatus,
    fetchedAt: row.fetchedAt,
  };
}

function parseTimeBoundary(raw, timeValues, side) {
  const value = compactText(raw);
  if (!value) return null;
  const exact = timeValues.find(
    (item) => item.code === value || compactText(item.name) === value,
  );
  if (exact) return exact.code;
  if (/^\d{4}$/.test(value)) {
    const matches = timeValues
      .filter((item) => item.code.startsWith(value))
      .map((item) => item.code)
      .sort();
    if (matches.length) return side === "from" ? matches[0] : matches.at(-1);
  }
  const partial = timeValues.filter(
    (item) =>
      item.code.includes(value) || compactText(item.name).includes(value),
  );
  if (partial.length === 1) return partial[0].code;
  throw new Error(
    `時間境界「${value}」を一意に特定できません。時間コード、完全な期間名、または4桁年を指定してください。`,
  );
}

// ビット位置は取込時のallowedTimeCodes（fiscal_year_from以降の時間コードを
// 昇順に並べた列）に対応する。全時間軸ではない点に注意。
function decodeTimeMask(hexMask, timeCodes) {
  if (!hexMask) return new Set();
  const mask = BigInt(`0x${hexMask}`);
  return new Set(
    timeCodes.filter((_, index) => (mask & (1n << BigInt(index))) !== 0n),
  );
}

function csvSafeName(value) {
  return compactText(value).replace(/[\u0000-\u001f]/g, " ");
}

export class StatisticsQueryEngine {
  constructor(databasePath = DEFAULT_DATABASE_PATH) {
    this.databasePath = resolve(databasePath);
    if (!existsSync(this.databasePath)) {
      throw new Error(`正規化DBがありません: ${this.databasePath}`);
    }
    this.db = new DatabaseSync(this.databasePath, { readOnly: true });
  }

  close() {
    this.db.close();
  }

  listDatasets() {
    return this.db
      .prepare(
        `SELECT d.id, d.title,
                d.government_statistics_code AS governmentStatisticsCode,
                d.provided_statistics_id AS providedStatisticsId,
                d.source_url AS sourceUrl,
                d.fiscal_year_from AS fiscalYearFrom,
                COUNT(t.id) AS tableCount
           FROM datasets d
           LEFT JOIN statistical_tables t ON t.dataset_id = d.id
          GROUP BY d.id
          ORDER BY d.title, d.id`,
      )
      .all()
      .map(rowToDataset);
  }

  searchTables({ query = "", datasetId = "", cycle = "", limit } = {}) {
    const clauses = ["t.registry_status = 'ready'"];
    const parameters = [];
    const terms = compactText(query).split(" ").filter(Boolean);
    for (const term of terms) {
      const pattern = likePattern(term);
      clauses.push(
        `(t.id LIKE ? ESCAPE '\\' OR t.title LIKE ? ESCAPE '\\' OR ` +
          `t.statistics_name LIKE ? ESCAPE '\\' OR d.title LIKE ? ESCAPE '\\')`,
      );
      parameters.push(pattern, pattern, pattern, pattern);
    }
    if (datasetId) {
      clauses.push("t.dataset_id = ?");
      parameters.push(compactText(datasetId));
    }
    if (cycle) {
      clauses.push("t.cycle = ?");
      parameters.push(compactText(cycle));
    }
    parameters.push(
      boundedInteger(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT),
    );
    return this.db
      .prepare(
        `SELECT t.id, t.dataset_id AS datasetId, d.title AS datasetTitle,
                t.title, t.statistics_name AS statisticsName, t.cycle,
                t.survey_date AS surveyDate, t.open_date AS openDate,
                t.updated_date AS updatedDate, t.source_kind AS sourceKind,
                t.source_url AS sourceUrl,
                t.registry_status AS registryStatus,
                t.fetched_at AS fetchedAt
           FROM statistical_tables t
           JOIN datasets d ON d.id = t.dataset_id
          WHERE ${clauses.join(" AND ")}
          ORDER BY d.title, t.title, t.id
          LIMIT ?`,
      )
      .all(...parameters)
      .map(rowToTable);
  }

  #getTable(tableId) {
    const row = this.db
      .prepare(
        `SELECT t.id, t.dataset_id AS datasetId, d.title AS datasetTitle,
                t.title, t.statistics_name AS statisticsName, t.cycle,
                t.survey_date AS surveyDate, t.open_date AS openDate,
                t.updated_date AS updatedDate, t.source_kind AS sourceKind,
                t.source_url AS sourceUrl,
                t.registry_status AS registryStatus,
                t.fetched_at AS fetchedAt
           FROM statistical_tables t
           JOIN datasets d ON d.id = t.dataset_id
          WHERE t.id = ?`,
      )
      .get(compactText(tableId));
    if (!row) throw new Error(`統計表ID「${tableId}」は登録されていません。`);
    return rowToTable(row);
  }

  #dimensions(tableId) {
    return this.db
      .prepare(
        `SELECT id, api_key AS apiKey, name, description,
                sort_order AS sortOrder
           FROM dimensions
          WHERE table_id = ?
          ORDER BY sort_order, api_key`,
      )
      .all(tableId);
  }

  #dimensionValues(dimensionId, { search = "", limit = MAX_VALUE_LIMIT } = {}) {
    const maximum = boundedInteger(limit, DEFAULT_VALUE_LIMIT, MAX_VALUE_LIMIT);
    const normalizedSearch = compactText(search);
    const where = normalizedSearch
      ? "WHERE dimension_id = ? AND (code LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')"
      : "WHERE dimension_id = ?";
    const parameters = normalizedSearch
      ? [dimensionId, likePattern(normalizedSearch), likePattern(normalizedSearch)]
      : [dimensionId];
    const values = this.db
      .prepare(
        `SELECT code, name, level, parent_code AS parentCode, unit,
                sort_order AS sortOrder
           FROM dimension_values
          ${where}
          ORDER BY sort_order, code
          LIMIT ?`,
      )
      .all(...parameters, maximum);
    const count = this.db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM dimension_values
          ${where}`,
      )
      .get(...parameters).count;
    return { values, count, truncated: count > values.length };
  }

  #coordinatesForSeries(seriesId) {
    return Object.fromEntries(
      this.db
        .prepare(
          `SELECT d.api_key AS apiKey, sd.value_code AS valueCode
             FROM series_dimensions sd
             JOIN dimensions d ON d.id = sd.dimension_id
            WHERE sd.series_id = ?
            ORDER BY d.sort_order, d.api_key`,
        )
        .all(seriesId)
        .map((item) => [item.apiKey, item.valueCode]),
    );
  }

  #suggestedSelection(tableId, dimensions) {
    const selection = {};
    for (const dimension of dimensions.filter((item) => item.apiKey !== "time")) {
      const values = this.#dimensionValues(dimension.id, { limit: MAX_VALUE_LIMIT }).values;
      const preferred =
        values.find((value) =>
          dimension.apiKey === "area"
            ? /^(全国|全地域|計)$/.test(value.name)
            : /^(総数|総計|合計|計|全体|すべて)$/.test(value.name),
        ) ?? values[0];
      if (preferred) selection[dimension.apiKey] = preferred.code;
    }
    const preferredSeriesId = seriesIdFor(tableId, selection);
    if (this.db.prepare("SELECT 1 FROM series WHERE id = ?").get(preferredSeriesId)) {
      return selection;
    }
    const fallback = this.db
      .prepare("SELECT id FROM series WHERE table_id = ? LIMIT 1")
      .get(tableId);
    return fallback ? this.#coordinatesForSeries(fallback.id) : selection;
  }

  getTableSchema({ tableId, dimension = "", valueSearch = "", limit } = {}) {
    const table = this.#getTable(tableId);
    const allDimensions = this.#dimensions(table.id);
    const dimensionFilter = compactText(dimension);
    const selectedDimensions = dimensionFilter
      ? allDimensions.filter(
          (item) => item.apiKey === dimensionFilter || item.id === dimensionFilter,
        )
      : allDimensions;
    if (dimensionFilter && selectedDimensions.length === 0) {
      throw new Error(
        `分類「${dimensionFilter}」はありません。利用可能: ${allDimensions.map((item) => item.apiKey).join(", ")}`,
      );
    }
    const valueLimit = boundedInteger(limit, DEFAULT_VALUE_LIMIT, MAX_VALUE_LIMIT);
    const dimensions = selectedDimensions.map((item) => ({
      ...item,
      ...this.#dimensionValues(item.id, {
        search: valueSearch,
        limit: valueLimit,
      }),
    }));
    const suggestedSelection = this.#suggestedSelection(table.id, allDimensions);
    return {
      schemaVersion: "1.0",
      table,
      dimensions,
      suggestedSelection,
      usage: {
        selectionRule:
          "time以外の全分類を、codeまたは一意なnameで指定します。AI処理ではcodeを推奨します。",
        timeBoundaryRule:
          "from/toは時間コード、完全な期間名、または4桁年を指定できます。",
      },
    };
  }

  #resolveDimensionValue(dimension, requestedValue) {
    const requested = compactText(requestedValue);
    const exact = this.db
      .prepare(
        `SELECT code, name, level, parent_code AS parentCode, unit,
                sort_order AS sortOrder
           FROM dimension_values
          WHERE dimension_id = ? AND (code = ? OR name = ?)
          ORDER BY CASE WHEN code = ? THEN 0 ELSE 1 END, sort_order
          LIMIT 2`,
      )
      .all(dimension.id, requested, requested, requested);
    if (exact.length === 1 || exact.some((item) => item.code === requested)) {
      return exact.find((item) => item.code === requested) ?? exact[0];
    }
    const partial = this.#dimensionValues(dimension.id, {
      search: requested,
      limit: 12,
    });
    if (partial.count === 1) return partial.values[0];
    const candidates = partial.values
      .map((item) => `${item.code}=${item.name}`)
      .join(", ");
    throw new Error(
      `分類「${dimension.apiKey}」の値「${requested}」を一意に特定できません。` +
        (candidates ? ` 候補: ${candidates}` : " 候補はありません。"),
    );
  }

  querySeries({ tableId, selections, from = "", to = "", label = "" } = {}) {
    const table = this.#getTable(tableId);
    const dimensions = this.#dimensions(table.id);
    const nonTimeDimensions = dimensions.filter((item) => item.apiKey !== "time");
    const timeDimension = dimensions.find((item) => item.apiKey === "time");
    if (!timeDimension) throw new Error(`統計表「${table.id}」に時間軸がありません。`);
    const requestedSelections = normalizeSelectionInput(selections);
    const knownKeys = new Set(nonTimeDimensions.map((item) => item.apiKey));
    const unknownKeys = Object.keys(requestedSelections).filter((key) => !knownKeys.has(key));
    if (unknownKeys.length) {
      throw new Error(
        `存在しない分類キーです: ${unknownKeys.join(", ")}。利用可能: ${[...knownKeys].join(", ")}`,
      );
    }
    const missingKeys = nonTimeDimensions
      .map((item) => item.apiKey)
      .filter((key) => !requestedSelections[key]);
    if (missingKeys.length) {
      throw new Error(
        `次の分類指定が必要です: ${missingKeys.join(", ")}。get_table_schemaでコードを確認してください。`,
      );
    }
    const resolvedDimensions = nonTimeDimensions.map((dimension) => ({
      dimension: {
        id: dimension.id,
        apiKey: dimension.apiKey,
        name: dimension.name,
      },
      value: this.#resolveDimensionValue(
        dimension,
        requestedSelections[dimension.apiKey],
      ),
    }));
    const coordinates = Object.fromEntries(
      resolvedDimensions.map((item) => [item.dimension.apiKey, item.value.code]),
    );
    const seriesId = seriesIdFor(table.id, coordinates);
    const series = this.db
      .prepare(
        `SELECT id, table_id AS tableId, label, unit,
                first_time_code AS firstTimeCode,
                last_time_code AS lastTimeCode,
                CASE WHEN time_mask_text IS NOT NULL
                  THEN time_mask_text ELSE printf('%x', time_mask) END AS timeMaskHex,
                observation_count AS observationCount, status
           FROM series
          WHERE id = ?`,
      )
      .get(seriesId);
    if (!series) {
      throw new Error(
        `指定した分類の組み合わせに系列がありません（系列ID: ${seriesId}）。分類コードを確認してください。`,
      );
    }

    const timeValueResult = this.#dimensionValues(timeDimension.id, {
      limit: MAX_VALUE_LIMIT,
    });
    const timeValues = timeValueResult.values.sort((left, right) =>
      left.code.localeCompare(right.code),
    );
    if (timeValueResult.truncated) {
      throw new Error(
        `時間軸が${MAX_VALUE_LIMIT.toLocaleString("ja-JP")}件以上あります。安全のため処理を中止しました。`,
      );
    }
    const fromCode = parseTimeBoundary(from, timeValues, "from");
    const toCode = parseTimeBoundary(to, timeValues, "to");
    if (fromCode && toCode && fromCode > toCode) {
      throw new Error(`開始時点 ${fromCode} は終了時点 ${toCode} より後です。`);
    }
    const fiscalYearFloor =
      this.db
        .prepare("SELECT fiscal_year_from AS fiscalYearFrom FROM datasets WHERE id = ?")
        .get(table.datasetId)?.fiscalYearFrom ?? null;
    const maskTimeCodes = timeValues
      .map((item) => item.code)
      .filter((code) => {
        const fiscalYear = fiscalYearFromTimeCode(code);
        return (
          fiscalYear !== null &&
          (fiscalYearFloor === null || fiscalYear >= fiscalYearFloor)
        );
      })
      .sort();
    const availableCodes = decodeTimeMask(series.timeMaskHex, maskTimeCodes);
    const selectedTimes = timeValues.filter(
      (item) =>
        availableCodes.has(item.code) &&
        (!fromCode || item.code >= fromCode) &&
        (!toCode || item.code <= toCode),
    );
    const observationRows = this.db
      .prepare(
        `SELECT o.time_code AS timeCode, o.value,
                o.numeric_value AS numericValue, o.unit, o.annotation,
                o.status, o.source_id AS sourceId, o.fetched_at AS fetchedAt
           FROM observations o
          WHERE o.series_id = ?
          ORDER BY o.time_code`,
      )
      .all(series.id);
    const observationByTime = new Map(
      observationRows.map((item) => [item.timeCode, item]),
    );
    const sources = this.db
      .prepare(
        `SELECT id AS sourceId, source_kind AS sourceKind,
                source_url AS sourceUrl, local_path AS localPath,
                sha256, published_at AS publishedAt,
                retrieved_at AS retrievedAt
           FROM observation_sources
          WHERE table_id = ?
          ORDER BY retrieved_at DESC, id`,
      )
      .all(table.id);
    const defaultSource = sources[0] ?? null;
    const observations = selectedTimes.map((time) => {
      const stored = observationByTime.get(time.code);
      if (stored) {
        return {
          timeCode: time.code,
          timeLabel: time.name,
          value: stored.value,
          numericValue: stored.numericValue,
          unit: stored.unit ?? series.unit,
          annotation: stored.annotation,
          status: stored.status,
          sourceId: stored.sourceId,
          fetchedAt: stored.fetchedAt,
          implicitNumericZero: false,
        };
      }
      return {
        timeCode: time.code,
        timeLabel: time.name,
        value: "0",
        numericValue: 0,
        unit: series.unit,
        annotation: null,
        status: "confirmed_value",
        sourceId: defaultSource?.sourceId ?? null,
        fetchedAt: defaultSource?.retrievedAt ?? table.fetchedAt,
        implicitNumericZero: true,
      };
    });
    const resolvedLabel =
      csvSafeName(label) ||
      resolvedDimensions.map((item) => item.value.name).join(" / ") ||
      series.label;
    return {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      table,
      query: {
        tableId: table.id,
        selections: coordinates,
        requestedSelections,
        from: fromCode,
        to: toCode,
      },
      series: {
        id: series.id,
        label: resolvedLabel,
        registeredLabel: series.label,
        unit: series.unit,
        firstTimeCode: series.firstTimeCode,
        lastTimeCode: series.lastTimeCode,
        observationCount: observations.length,
        dimensions: resolvedDimensions.map((item) => ({
          ...item.dimension,
          code: item.value.code,
          valueName: item.value.name,
          level: item.value.level,
          parentCode: item.value.parentCode,
        })),
      },
      observations,
      sources,
      warnings: observations.length
        ? []
        : ["指定期間に公表済みの観測値がありません。"],
    };
  }
}

export function withStatisticsQueryEngine(callback, databasePath = DEFAULT_DATABASE_PATH) {
  const engine = new StatisticsQueryEngine(databasePath);
  try {
    return callback(engine);
  } finally {
    engine.close();
  }
}
