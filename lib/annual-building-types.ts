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
