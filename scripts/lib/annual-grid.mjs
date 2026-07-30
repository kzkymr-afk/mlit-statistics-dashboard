import { createHash } from "node:crypto";

import * as XLSX from "xlsx";

export function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[‐‑‒–—―]/g, "-")
    .trim();
}

export function displayText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function semanticLabel(value) {
  const noise = new Set([
    "",
    "***",
    "民間等",
    "非製造業",
    "民",
    "非",
    "製",
    "造",
    "業",
    "百万円",
    "%",
    "％",
  ]);
  return String(value ?? "")
    .split("/")
    .map(cleanText)
    .filter((part) => !noise.has(part))
    .map((part) => part.replace(/^単位[:：]?/, ""))
    .filter(Boolean)
    .join("/");
}

function serializableCell(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mergeKey(row, column) {
  return `${row}:${column}`;
}

export function readGrid(sheet) {
  const reference = sheet["!ref"];
  if (!reference) return { rows: [], rowCount: 0, columnCount: 0 };

  const range = XLSX.utils.decode_range(reference);
  const rowCount = range.e.r + 1;
  const columnCount = range.e.c + 1;
  const mergedValues = new Map();

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

function uniqueParts(parts) {
  const output = [];
  for (const part of parts) {
    if (part && output.at(-1) !== part) output.push(part);
  }
  return output;
}

export function rowLabel(rows, rowIndex, columnIndex) {
  const row = rows[rowIndex] ?? [];
  const directParts = uniqueParts(
    row
      .slice(0, columnIndex)
      .filter((value) => typeof value === "string")
      .map(displayText)
      .filter(Boolean),
  );
  if (directParts.length) return directParts.join(" / ");

  for (
    let cursor = rowIndex - 1;
    cursor >= Math.max(0, rowIndex - 8);
    cursor -= 1
  ) {
    const parts = uniqueParts(
      (rows[cursor] ?? [])
        .slice(0, columnIndex)
        .filter((value) => typeof value === "string")
        .map(displayText)
        .filter(Boolean),
    );
    if (parts.length) return parts.join(" / ");
  }
  return `行 ${rowIndex + 1}`;
}

export function columnLabel(rows, rowIndex, columnIndex) {
  const parts = [];
  for (
    let cursor = rowIndex - 1;
    cursor >= Math.max(0, rowIndex - 12);
    cursor -= 1
  ) {
    const value = rows[cursor]?.[columnIndex];
    if (typeof value !== "string") continue;
    const text = displayText(value);
    if (!text || /^※/.test(text)) continue;
    parts.unshift(text);
    if (parts.length >= 4) break;
  }
  const compact = uniqueParts(parts);
  return compact.length ? compact.join(" / ") : `列 ${columnIndex + 1}`;
}

export function seriesId({
  datasetId,
  groupId,
  sheetIndex,
  row,
  column,
  occurrence,
}) {
  const semanticRow = semanticLabel(row) || cleanText(row);
  const semanticColumn = semanticLabel(column) || cleanText(column);
  return createHash("sha256")
    .update(
      [datasetId, groupId, sheetIndex, semanticRow, semanticColumn, occurrence].join(
        "\u001f",
      ),
    )
    .digest("hex")
    .slice(0, 24);
}

export function inferUnit(rows) {
  for (const row of rows.slice(0, 30)) {
    for (const value of row) {
      if (typeof value !== "string") continue;
      const match = displayText(value).match(
        /(?:単位[:：]?\s*)?(百万円|千円|円|棟|戸|件|人|社|㎡|m2|m²|％|%)/,
      );
      if (match) return match[1].replace("%", "％");
    }
  }
  return null;
}
