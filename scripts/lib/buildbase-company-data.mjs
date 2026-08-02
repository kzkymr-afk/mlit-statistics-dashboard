import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildValueLookup,
  normalizeObservation,
  parseCsvRows,
  seriesLabel,
} from "./estat-normalize.mjs";

export const BUILDBASE_DATASET_ID = "buildbase-company-comparison";
export const BUILDBASE_TABLE_ID = "buildbase-company-annual";
export const BUILDBASE_SOURCE_ID = "buildbase:public-company-disclosures";
export const BUILDBASE_SOURCE_URL =
  "https://kzkymr-afk.github.io/mlit-statistics-dashboard/buildbase-data/";

const INPUT_FILES = {
  companies: "config/company_master.csv",
  fields: "config/field_definition.csv",
  years: "config/company_year_master.csv",
  values: "data/final/final_master_wide.csv",
  audit: "data/final/final_master_long.csv",
  completion: "data/reports/company_completion_report.csv",
};

function csvRecords(path) {
  const rows = parseCsvRows(readFileSync(path, "utf8"));
  const header = rows.shift() ?? [];
  return rows
    .filter((row) => row.some((value) => value !== ""))
    .map((row) =>
      Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""])),
    );
}

function inputPaths(root) {
  return Object.fromEntries(
    Object.entries(INPUT_FILES).map(([key, path]) => [key, resolve(root, path)]),
  );
}

function ensureInputs(paths) {
  for (const [name, path] of Object.entries(paths)) {
    try {
      statSync(path);
    } catch {
      throw new Error(`BuildBaseの${name}入力がありません: ${path}`);
    }
  }
}

function statusAnnotation(status) {
  if (status === "not_applicable") {
    return "有価証券報告書・公式ファクトブック・決算説明資料で対象値の開示なし";
  }
  if (status === "publication_pending") {
    return "情報源側の公表待ち。公表後にBuildBaseから再同期";
  }
  return "";
}

function sourceLabel(row, fieldId) {
  const method = String(row?.extraction_method ?? "").toUpperCase();
  const sourceDataset = String(row?.source_dataset_id ?? "").toLowerCase();
  const sourceFile = String(row?.source_file ?? "").toLowerCase();
  if (fieldId.startsWith("architecture_engineers_")) {
    return "CIIC経営事項審査";
  }
  if (
    method.includes("FACTBOOK") ||
    sourceDataset.includes("factbook") ||
    sourceFile.includes("factbook")
  ) {
    return "公式ファクトブック・データブック";
  }
  if (method === "MANUAL_OBSIDIAN") {
    return "公式決算説明資料等";
  }
  return "有価証券報告書";
}

function numberValue(value) {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`数値として扱えないBuildBase値です: ${value}`);
  }
  return parsed;
}

function recordKey(companyId, fieldId, fiscalYear) {
  return `${companyId}\u001f${fieldId}\u001f${fiscalYear}`;
}

function auditKey(companyYearId, fieldId) {
  return `${companyYearId}\u001f${fieldId}`;
}

function combinedHash(paths) {
  const hash = createHash("sha256");
  for (const [name, path] of Object.entries(paths).toSorted()) {
    hash.update(name);
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function loadBuildBaseCompanyData(root) {
  const paths = inputPaths(root);
  ensureInputs(paths);

  const companyRows = csvRecords(paths.companies);
  const fieldRows = csvRecords(paths.fields);
  const yearRows = csvRecords(paths.years).filter(
    (row) => (row.period_type || "annual") === "annual",
  );
  const wideRows = csvRecords(paths.values).filter(
    (row) => (row.period_type || "annual") === "annual",
  );
  const auditRows = csvRecords(paths.audit);
  const completionRows = csvRecords(paths.completion);

  const companyNames = new Map(
    companyRows.map((row) => [
      row.operating_company_id,
      row.operating_company_name || row.operating_company_id,
    ]),
  );
  const companies = [...new Set(yearRows.map((row) => row.operating_company_id))]
    .map((id) => ({ id, name: companyNames.get(id) || id }))
    .toSorted((left, right) => left.name.localeCompare(right.name, "ja"));
  const fields = fieldRows.map((row, index) => ({
    id: row.field_id,
    name: row.field_name_ja || row.field_id,
    category: row.category || "other",
    unit: row.target_unit || "",
    sortOrder: index,
  }));
  const fiscalYears = [...new Set(yearRows.map((row) => Number(row.fiscal_year)))]
    .filter(Number.isFinite)
    .toSorted((left, right) => left - right);

  const wideByCompanyYear = new Map(
    wideRows.map((row) => [row.company_year_id, row]),
  );
  const completionByKey = new Map(
    completionRows.map((row) => [
      recordKey(row.company_id, row.field_id, Number(row.fiscal_year)),
      row.status,
    ]),
  );
  const auditByKey = new Map();
  for (const row of auditRows) {
    const key = auditKey(row.company_year_id, row.field_id);
    if (!auditByKey.has(key)) auditByKey.set(key, []);
    auditByKey.get(key).push(row);
  }

  const statusCounts = {
    filled: 0,
    not_applicable: 0,
    publication_pending: 0,
    todo: 0,
  };
  const cells = [];
  for (const yearRow of yearRows) {
    const companyId = yearRow.operating_company_id;
    const companyYearId = yearRow.company_year_id;
    const fiscalYear = Number(yearRow.fiscal_year);
    const wide = wideByCompanyYear.get(companyYearId);
    if (!wide) throw new Error(`BuildBase最終表に会社年度行がありません: ${companyYearId}`);
    for (const field of fields) {
      const key = recordKey(companyId, field.id, fiscalYear);
      const status = completionByKey.get(key) || "todo";
      if (!(status in statusCounts)) {
        throw new Error(`未対応のBuildBaseセル状態です: ${status}`);
      }
      statusCounts[status] += 1;
      const rawValue = String(wide[field.id] ?? "").trim();
      const numericValue = numberValue(rawValue);
      if (status === "filled" && numericValue === null) {
        throw new Error(`filledなのに値がありません: ${companyYearId} / ${field.id}`);
      }
      if (status !== "filled" && numericValue !== null) {
        throw new Error(`空欄状態なのに値があります: ${companyYearId} / ${field.id}`);
      }
      const audits = auditByKey.get(auditKey(companyYearId, field.id)) ?? [];
      const matchedAudit =
        audits.find((row) => numberValue(row.value) === numericValue) ?? audits[0];
      cells.push({
        companyId,
        companyName: companyNames.get(companyId) || companyId,
        companyYearId,
        fiscalYear,
        fieldId: field.id,
        fieldName: field.name,
        unit: field.unit,
        rawValue,
        numericValue,
        status,
        annotation:
          status === "filled"
            ? `BuildBase確定値 / ${sourceLabel(matchedAudit, field.id)}`
            : statusAnnotation(status),
      });
    }
  }

  if (statusCounts.todo > 0) {
    throw new Error(
      `BuildBaseに未処理セルが${statusCounts.todo}件あるため公開を停止しました。`,
    );
  }
  if (cells.length !== yearRows.length * fields.length) {
    throw new Error("BuildBaseセル数が会社年度数×項目数と一致しません。");
  }

  const sourceUpdatedAt = new Date(
    Math.max(...Object.values(paths).map((path) => statSync(path).mtimeMs)),
  ).toISOString();
  return {
    companies,
    fields,
    fiscalYears,
    cells,
    statusCounts,
    companyYearCount: yearRows.length,
    sourceUpdatedAt,
    sourceHash: combinedHash(paths),
  };
}

export function buildBuildBaseDimensions(data) {
  return [
    {
      id: `${BUILDBASE_TABLE_ID}:tab`,
      tableId: BUILDBASE_TABLE_ID,
      apiKey: "tab",
      name: "比較項目",
      description: "BuildBaseで確定した会社別指標",
      sortOrder: 0,
      values: data.fields.map((field) => ({
        code: field.id,
        name: field.name,
        level: 1,
        parentCode: field.category,
        unit: field.unit,
        sortOrder: field.sortOrder,
      })),
    },
    {
      id: `${BUILDBASE_TABLE_ID}:cat01`,
      tableId: BUILDBASE_TABLE_ID,
      apiKey: "cat01",
      name: "会社",
      description: "BuildBaseの調査対象会社",
      sortOrder: 1,
      values: data.companies.map((company, index) => ({
        code: company.id,
        name: company.name,
        level: 1,
        parentCode: "",
        unit: "",
        sortOrder: index,
      })),
    },
    {
      id: `${BUILDBASE_TABLE_ID}:time`,
      tableId: BUILDBASE_TABLE_ID,
      apiKey: "time",
      name: "年度",
      description: "各社の事業年度。原則として4月から翌年3月。",
      sortOrder: 2,
      values: data.fiscalYears.map((year, index) => ({
        code: `${year}100000`,
        name: `${year}年度`,
        level: 1,
        parentCode: "",
        unit: "",
        sortOrder: index,
      })),
    },
  ];
}

export function buildBuildBaseObservations(data, dimensions) {
  const lookup = buildValueLookup(dimensions);
  const observations = data.cells.map((cell) => {
    const normalized = normalizeObservation(
      {
        "@tab": cell.fieldId,
        "@cat01": cell.companyId,
        "@time": `${cell.fiscalYear}100000`,
        "@unit": cell.unit,
        "@annotation": cell.annotation,
        $: cell.rawValue,
      },
      BUILDBASE_TABLE_ID,
    );
    normalized.status =
      cell.status === "filled" ? "confirmed_value" : cell.status === "not_applicable"
        ? "not_disclosed"
        : cell.status;
    return normalized;
  });
  return {
    observations: observations.toSorted(
      (left, right) =>
        left.seriesId.localeCompare(right.seriesId) ||
        left.timeCode.localeCompare(right.timeCode),
    ),
    seriesLabel: (coordinates) => seriesLabel(coordinates, lookup),
  };
}

