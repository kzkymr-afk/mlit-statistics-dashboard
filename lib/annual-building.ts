import * as XLSX from "xlsx";

import catalogJson from "@/data/catalogs/building-annual.json";
import type {
  AnnualCatalog,
  AnnualCatalogRecord,
  AnnualTablePayload,
  AnnualValuePayload,
  CellDescriptor,
  TableCell,
} from "@/lib/annual-building-types";

export const annualCatalog = catalogJson as AnnualCatalog;

const recordById = new Map(
  annualCatalog.records.map((record) => [record.statInfId, record]),
);
const workbookCache = new Map<string, Promise<XLSX.WorkBook>>();

function cleanText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[‐‑‒–—―]/g, "-")
    .trim();
}

function displayText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function serializableCell(value: unknown): TableCell {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isNumeric(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mergeKey(row: number, column: number) {
  return `${row}:${column}`;
}

function readGrid(sheet: XLSX.WorkSheet) {
  const reference = sheet["!ref"];
  if (!reference) {
    return { rows: [] as TableCell[][], rowCount: 0, columnCount: 0 };
  }

  const range = XLSX.utils.decode_range(reference);
  const rowCount = range.e.r + 1;
  const columnCount = range.e.c + 1;
  const mergedValues = new Map<string, TableCell>();

  for (const merge of sheet["!merges"] ?? []) {
    const startAddress = XLSX.utils.encode_cell(merge.s);
    const startValue = serializableCell(sheet[startAddress]?.v);
    if (startValue === null) continue;
    for (let row = merge.s.r; row <= merge.e.r; row += 1) {
      for (let column = merge.s.c; column <= merge.e.c; column += 1) {
        mergedValues.set(mergeKey(row, column), startValue);
      }
    }
  }

  const rows = Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: columnCount }, (_, column) => {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      return (
        serializableCell(sheet[address]?.v) ??
        mergedValues.get(mergeKey(row, column)) ??
        null
      );
    }),
  );

  return { rows, rowCount, columnCount };
}

function uniqueParts(parts: string[]) {
  const output: string[] = [];
  for (const part of parts) {
    if (part && output.at(-1) !== part) output.push(part);
  }
  return output;
}

function rowLabel(rows: TableCell[][], rowIndex: number, columnIndex: number) {
  const row = rows[rowIndex] ?? [];
  const directParts = uniqueParts(
    row
      .slice(0, columnIndex)
      .filter((value) => typeof value === "string")
      .map(displayText)
      .filter(Boolean),
  );
  if (directParts.length) return directParts.join(" / ");

  for (let rowCursor = rowIndex - 1; rowCursor >= Math.max(0, rowIndex - 8); rowCursor -= 1) {
    const parts = uniqueParts(
      (rows[rowCursor] ?? [])
        .slice(0, columnIndex)
        .filter((value) => typeof value === "string")
        .map(displayText)
        .filter(Boolean),
    );
    if (parts.length) return parts.join(" / ");
  }
  return `行 ${rowIndex + 1}`;
}

function columnLabel(
  rows: TableCell[][],
  rowIndex: number,
  columnIndex: number,
) {
  const parts: string[] = [];
  for (
    let rowCursor = rowIndex - 1;
    rowCursor >= Math.max(0, rowIndex - 12);
    rowCursor -= 1
  ) {
    const value = rows[rowCursor]?.[columnIndex];
    if (typeof value !== "string") continue;
    const text = displayText(value);
    if (!text || /^※/.test(text)) continue;
    parts.unshift(text);
    if (parts.length >= 4) break;
  }
  const compact = uniqueParts(parts);
  return compact.length ? compact.join(" / ") : `列 ${columnIndex + 1}`;
}

function findCell(
  rows: TableCell[][],
  descriptor: CellDescriptor,
  trustCoordinates = false,
): { value: number; row: number; column: number } | null {
  const sameValue = rows[descriptor.rowIndex]?.[descriptor.columnIndex];
  if (trustCoordinates && isNumeric(sameValue)) {
    return {
      value: sameValue,
      row: descriptor.rowIndex,
      column: descriptor.columnIndex,
    };
  }
  if (isNumeric(sameValue)) {
    const sameRow = cleanText(
      rowLabel(rows, descriptor.rowIndex, descriptor.columnIndex),
    );
    const sameColumn = cleanText(
      columnLabel(rows, descriptor.rowIndex, descriptor.columnIndex),
    );
    if (
      (!cleanText(descriptor.rowLabel) ||
        sameRow === cleanText(descriptor.rowLabel)) &&
      (!cleanText(descriptor.columnLabel) ||
        sameColumn === cleanText(descriptor.columnLabel))
    ) {
      return {
        value: sameValue,
        row: descriptor.rowIndex,
        column: descriptor.columnIndex,
      };
    }
  }

  const wantedRow = cleanText(descriptor.rowLabel);
  const wantedColumn = cleanText(descriptor.columnLabel);
  for (let row = 0; row < rows.length; row += 1) {
    if (!rows[row]?.some(isNumeric)) continue;
    const candidateColumns = rows[row]
      .map((value, column) => ({ value, column }))
      .filter(({ value }) => isNumeric(value));
    for (const candidate of candidateColumns) {
      if (
        wantedRow === cleanText(rowLabel(rows, row, candidate.column)) &&
        wantedColumn === cleanText(columnLabel(rows, row, candidate.column))
      ) {
        return {
          value: candidate.value as number,
          row,
          column: candidate.column,
        };
      }
    }
  }
  return null;
}

function getRecord(statInfId: string) {
  const record = recordById.get(statInfId);
  if (!record) throw new Error("目録にない統計ファイルです。");
  return record;
}

async function fetchWorkbook(record: AnnualCatalogRecord) {
  const cached = workbookCache.get(record.statInfId);
  if (cached) return cached;

  const request = (async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(record.downloadUrl, {
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; MLITStatisticsPanel/1.0; +https://www.e-stat.go.jp/)",
          },
          cache: "force-cache",
        });
        if (!response.ok) {
          throw new Error(
            `e-StatからExcelを取得できませんでした（${response.status}）。`,
          );
        }
        const bytes = await response.arrayBuffer();
        const signature = new TextDecoder()
          .decode(bytes.slice(0, 32))
          .toLowerCase();
        if (signature.includes("<html") || signature.includes("<!doctype")) {
          throw new Error("e-StatがExcelではなく案内ページを返しました。");
        }
        return XLSX.read(new Uint8Array(bytes), {
          type: "array",
          cellDates: false,
          dense: false,
        });
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await new Promise((resolveDelay) =>
            setTimeout(resolveDelay, attempt * 500),
          );
        }
      }
    }
    throw lastError;
  })();

  if (workbookCache.size >= 3) {
    const oldestKey = workbookCache.keys().next().value;
    if (oldestKey) workbookCache.delete(oldestKey);
  }
  workbookCache.set(record.statInfId, request);
  try {
    return await request;
  } catch (error) {
    workbookCache.delete(record.statInfId);
    throw error;
  }
}

function selectSheet(workbook: XLSX.WorkBook, requestedSheet?: string) {
  const sheetName =
    requestedSheet && workbook.SheetNames.includes(requestedSheet)
      ? requestedSheet
      : workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excelに表示できるシートがありません。");
  return { sheetName, sheet: workbook.Sheets[sheetName] };
}

export async function loadAnnualTable(options: {
  statInfId: string;
  sheetName?: string;
  offset?: number;
  limit?: number;
  query?: string;
}): Promise<AnnualTablePayload> {
  const record = getRecord(options.statInfId);
  const workbook = await fetchWorkbook(record);
  const { sheetName, sheet } = selectSheet(workbook, options.sheetName);
  const { rows, rowCount, columnCount } = readGrid(sheet);
  const limit = Math.min(Math.max(options.limit ?? 80, 20), 200);
  const query = displayText(options.query ?? "");
  const normalizedQuery = cleanText(query);
  const matchingIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      normalizedQuery
        ? row.some((cell) => cleanText(cell).includes(normalizedQuery))
        : true,
    )
    .map(({ index }) => index);
  const offset = Math.min(
    Math.max(options.offset ?? 0, 0),
    Math.max(0, matchingIndexes.length - 1),
  );
  const pageIndexes = matchingIndexes.slice(offset, offset + limit);
  const sampleRow =
    pageIndexes.find((index) => rows[index]?.some(isNumeric)) ??
    matchingIndexes.find((index) => rows[index]?.some(isNumeric)) ??
    0;

  return {
    record,
    sheetName,
    sheetNames: workbook.SheetNames,
    rows: pageIndexes.map((index) => ({
      index,
      cells: rows[index] ?? [],
      rowLabel: rowLabel(
        rows,
        index,
        Math.max(
          1,
          (rows[index] ?? []).findIndex((value) => isNumeric(value)),
        ),
      ),
    })),
    columnLabels: Array.from({ length: columnCount }, (_, column) =>
      columnLabel(rows, sampleRow, column),
    ),
    rowCount,
    columnCount,
    matchingRowCount: matchingIndexes.length,
    offset,
    limit,
    query,
  };
}

export async function loadAnnualValue(options: {
  statInfId: string;
  sheetName?: string;
  descriptor: CellDescriptor;
}): Promise<AnnualValuePayload> {
  const record = getRecord(options.statInfId);
  const workbook = await fetchWorkbook(record);
  const { sheet } = selectSheet(workbook, options.sheetName);
  const { rows } = readGrid(sheet);
  const match = findCell(
    rows,
    options.descriptor,
    record.statInfId === options.descriptor.sourceStatInfId,
  );

  return {
    statInfId: record.statInfId,
    fiscalYear: record.fiscalYear,
    variantLabel: record.variantLabel,
    value: match?.value ?? null,
    matchedRowIndex: match?.row ?? null,
    matchedColumnIndex: match?.column ?? null,
  };
}
