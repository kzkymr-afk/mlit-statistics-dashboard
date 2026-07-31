import {
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const datasets = sqliteTable("datasets", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  governmentStatisticsCode: text("government_statistics_code").notNull(),
  providedStatisticsId: text("provided_statistics_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  fiscalYearFrom: integer("fiscal_year_from").notNull(),
  fiscalYearTo: integer("fiscal_year_to").notNull(),
});

export const tableGroups = sqliteTable(
  "table_groups",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => datasets.id),
    title: text("title").notNull(),
  },
  (table) => [index("table_groups_dataset_idx").on(table.datasetId)],
);

export const sourceFiles = sqliteTable(
  "source_files",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => datasets.id),
    groupId: text("group_id")
      .notNull()
      .references(() => tableGroups.id),
    fiscalYear: integer("fiscal_year").notNull(),
    title: text("title").notNull(),
    variantLabel: text("variant_label").notNull().default(""),
    sourceKind: text("source_kind").notNull(),
    sourceStatus: text("source_status").notNull(),
    localPath: text("local_path"),
    sourcePage: text("source_page").notNull(),
    downloadUrl: text("download_url").notNull(),
    releaseDate: text("release_date").notNull(),
    sha256: text("sha256").notNull(),
  },
  (table) => [
    index("source_files_dataset_group_year_idx").on(
      table.datasetId,
      table.groupId,
      table.fiscalYear,
    ),
  ],
);

/**
 * 表のセルを1件ずつSQLite行にすると数十GB規模になるため、シート単位の
 * JSONをgzip圧縮したBLOBで保持する。公開時に80行ずつの静的JSONへ展開する。
 */
export const sheetPayloads = sqliteTable(
  "sheet_payloads",
  {
    sourceFileId: text("source_file_id")
      .notNull()
      .references(() => sourceFiles.id),
    sheetIndex: integer("sheet_index").notNull(),
    name: text("name").notNull(),
    rowCount: integer("row_count").notNull(),
    columnCount: integer("column_count").notNull(),
    unit: text("unit"),
    payloadGzip: blob("payload_gzip", { mode: "buffer" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceFileId, table.sheetIndex] }),
  ],
);

/**
 * グラフ用の年度系列を一定件数ごとにまとめたgzip BLOB。
 * 1つのセルを選んだときに必要な束だけを配信できる。
 */
export const seriesBundles = sqliteTable(
  "series_bundles",
  {
    datasetId: text("dataset_id")
      .notNull()
      .references(() => datasets.id),
    groupId: text("group_id")
      .notNull()
      .references(() => tableGroups.id),
    sheetIndex: integer("sheet_index").notNull(),
    prefix: text("prefix").notNull(),
    seriesCount: integer("series_count").notNull(),
    payloadGzip: blob("payload_gzip", { mode: "buffer" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.datasetId, table.groupId, table.sheetIndex, table.prefix],
    }),
  ],
);

export const ingestionRuns = sqliteTable("ingestion_runs", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  status: text("status").notNull(),
  tableCount: integer("table_count").notNull().default(0),
  observationCount: integer("observation_count").notNull().default(0),
  error: text("error"),
});

export const sourceMappings = sqliteTable(
  "source_mappings",
  {
    datasetId: text("dataset_id").notNull(),
    groupId: text("group_id").notNull(),
    sourceKind: text("source_kind").notNull(),
    apiTableId: text("api_table_id"),
    status: text("status").notNull(),
    checkedAt: text("checked_at"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("source_mappings_dataset_group_source_idx").on(
      table.datasetId,
      table.groupId,
      table.sourceKind,
    ),
  ],
);

/**
 * ここから下が統計システムの正本。
 *
 * Excelの行列位置ではなく、e-Statが持つ統計表・分類コード・時間コードを
 * そのまま保持する。上のsheetPayloads/seriesBundlesは旧Excelビューアとの
 * 移行期間だけ残し、この層から分析用スナップショットを生成する。
 */
export const statisticalTables = sqliteTable(
  "statistical_tables",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => datasets.id),
    title: text("title").notNull(),
    statisticsName: text("statistics_name").notNull(),
    cycle: text("cycle").notNull(),
    surveyDate: text("survey_date"),
    openDate: text("open_date"),
    updatedDate: text("updated_date"),
    totalNumber: integer("total_number"),
    sourceKind: text("source_kind").notNull(),
    sourceUrl: text("source_url").notNull(),
    registryStatus: text("registry_status").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    index("statistical_tables_dataset_idx").on(table.datasetId),
    index("statistical_tables_title_idx").on(table.title),
  ],
);

export const dimensions = sqliteTable(
  "dimensions",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => statisticalTables.id),
    apiKey: text("api_key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    uniqueIndex("dimensions_table_api_key_idx").on(
      table.tableId,
      table.apiKey,
    ),
  ],
);

export const dimensionValues = sqliteTable(
  "dimension_values",
  {
    dimensionId: text("dimension_id")
      .notNull()
      .references(() => dimensions.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    level: integer("level"),
    parentCode: text("parent_code"),
    unit: text("unit"),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.dimensionId, table.code] }),
    index("dimension_values_name_idx").on(table.name),
  ],
);

export const statisticalConcepts = sqliteTable(
  "statistical_concepts",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => datasets.id),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    aliasesJson: text("aliases_json").notNull().default("[]"),
    defaultUnit: text("default_unit"),
    status: text("status").notNull(),
  },
  (table) => [
    index("statistical_concepts_dataset_category_idx").on(
      table.datasetId,
      table.category,
    ),
  ],
);

export const conceptMappings = sqliteTable(
  "concept_mappings",
  {
    id: text("id").primaryKey(),
    conceptId: text("concept_id")
      .notNull()
      .references(() => statisticalConcepts.id),
    tableId: text("table_id")
      .notNull()
      .references(() => statisticalTables.id),
    selectorJson: text("selector_json").notNull(),
    sourceKind: text("source_kind").notNull(),
    status: text("status").notNull(),
    reviewedAt: text("reviewed_at"),
    note: text("note"),
  },
  (table) => [
    index("concept_mappings_concept_idx").on(table.conceptId),
    index("concept_mappings_table_idx").on(table.tableId),
  ],
);

export const series = sqliteTable(
  "series",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => statisticalTables.id),
    label: text("label").notNull(),
    unit: text("unit"),
    firstTimeCode: text("first_time_code"),
    lastTimeCode: text("last_time_code"),
    timeMask: integer("time_mask").notNull().default(0),
    observationCount: integer("observation_count").notNull().default(0),
    status: text("status").notNull(),
  },
  (table) => [
    index("series_table_idx").on(table.tableId),
    index("series_label_idx").on(table.label),
  ],
);

export const seriesDimensions = sqliteTable(
  "series_dimensions",
  {
    seriesId: text("series_id")
      .notNull()
      .references(() => series.id),
    dimensionId: text("dimension_id")
      .notNull()
      .references(() => dimensions.id),
    valueCode: text("value_code").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.seriesId, table.dimensionId],
    }),
    index("series_dimensions_value_idx").on(
      table.dimensionId,
      table.valueCode,
    ),
  ],
);

export const observationSources = sqliteTable(
  "observation_sources",
  {
    id: text("id").primaryKey(),
    sourceKind: text("source_kind").notNull(),
    tableId: text("table_id").references(() => statisticalTables.id),
    sourceUrl: text("source_url").notNull(),
    localPath: text("local_path"),
    sha256: text("sha256"),
    publishedAt: text("published_at"),
    retrievedAt: text("retrieved_at").notNull(),
  },
  (table) => [index("observation_sources_table_idx").on(table.tableId)],
);

export const observations = sqliteTable(
  "observations",
  {
    seriesId: text("series_id")
      .notNull()
      .references(() => series.id),
    timeCode: text("time_code").notNull(),
    value: text("value"),
    numericValue: real("numeric_value"),
    unit: text("unit"),
    annotation: text("annotation"),
    status: text("status").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => observationSources.id),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.seriesId, table.timeCode] }),
    index("observations_time_idx").on(table.timeCode),
  ],
);
