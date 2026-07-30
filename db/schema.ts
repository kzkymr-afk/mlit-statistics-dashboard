import {
  blob,
  index,
  integer,
  primaryKey,
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
  sourceFileCount: integer("source_file_count").notNull().default(0),
  sheetCount: integer("sheet_count").notNull().default(0),
  numericCellCount: integer("numeric_cell_count").notNull().default(0),
  compressedBytes: integer("compressed_bytes").notNull().default(0),
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
