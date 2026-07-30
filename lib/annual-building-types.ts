export type AnnualCatalogGroup = {
  id: string;
  title: string;
  tableNumbers: string[];
  fiscalYears: number[];
  recordCount: number;
};

export type AnnualCatalogRecord = {
  fiscalYear: number;
  fiscalYearLabel: string;
  tableNumber: string;
  title: string;
  baseTitle: string;
  variantLabel: string;
  groupId: string;
  statInfId: string;
  fileId: string;
  releaseCount: number;
  releaseDate: string;
  bytes: number;
  sha256: string;
  sourcePage: string;
  downloadUrl: string;
};

export type AnnualCatalog = {
  datasetId: string;
  title: string;
  organization: string;
  governmentStatisticsCode: string;
  providedStatisticsId: string;
  sourceUrl: string;
  fiscalYearFrom: number;
  fiscalYearTo: number;
  fetchedAt: string;
  fileCount: number;
  totalBytes: number;
  groups: AnnualCatalogGroup[];
  records: AnnualCatalogRecord[];
};

export type TableCell = string | number | boolean | null;

export type TableRow = {
  index: number;
  cells: TableCell[];
  rowLabel: string;
  series?: Array<StaticSeriesReference | null>;
};

export type AnnualTablePayload = {
  record: AnnualCatalogRecord;
  sheetName: string;
  sheetNames: string[];
  rows: TableRow[];
  columnLabels: string[];
  rowCount: number;
  columnCount: number;
  matchingRowCount: number;
  offset: number;
  limit: number;
  query: string;
};

export type CellDescriptor = {
  sourceStatInfId: string;
  rowIndex: number;
  columnIndex: number;
  rowLabel: string;
  columnLabel: string;
};

export type AnnualValuePayload = {
  statInfId: string;
  fiscalYear: number;
  variantLabel: string;
  value: number | null;
  matchedRowIndex: number | null;
  matchedColumnIndex: number | null;
};

export type StaticSeriesReference = {
  id: string;
  bundleUrl: string | null;
};

export type StaticSheetSummary = {
  sheetIndex: number;
  name: string;
  rowCount: number;
  columnCount: number;
  unit: string | null;
  pageSize: number;
  pageCount: number;
  metaUrl: string;
};

export type StaticTableIndexEntry = AnnualCatalogRecord & {
  datasetId: string;
  sourceKind: string;
  sourceStatus: string;
  sheets: StaticSheetSummary[];
};

export type StaticDataManifest = {
  schemaVersion: number;
  snapshotId: string;
  generatedAt: string;
  source: string;
  tables: StaticTableIndexEntry[];
};

export type StaticTableMeta = StaticSheetSummary & {
  schemaVersion: number;
  record: StaticTableIndexEntry;
  columnLabels: string[];
  searchUrl: string;
  pageUrlTemplate: string;
};

export type StaticTablePage = {
  schemaVersion: number;
  statInfId: string;
  sheetIndex: number;
  pageIndex: number;
  pageSize: number;
  rows: TableRow[];
};

export type StaticSeriesPayload = {
  id: string;
  label: string;
  rowLabel: string;
  columnLabel: string;
  unit: string | null;
  points: Array<{
    fiscalYear: number;
    value: number | null;
    sourceFileIds: string[];
  }>;
};

export type StaticSeriesBundle = {
  schemaVersion: number;
  datasetId: string;
  groupId: string;
  sheetIndex: number;
  series: Record<string, StaticSeriesPayload>;
};
