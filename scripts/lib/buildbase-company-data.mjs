import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildValueLookup,
  normalizeObservation,
  seriesLabel,
} from "./estat-normalize.mjs";

export const BUILDBASE_DATASET_ID = "buildbase-company-comparison";
export const BUILDBASE_TABLE_ID = "buildbase-company-annual";
export const BUILDBASE_SOURCE_ID = "buildbase:public-company-disclosures";
export const BUILDBASE_SOURCE_URL =
  "https://kzkymr-afk.github.io/mlit-statistics-dashboard/buildbase-data/";
export const BUILDBASE_EXPORT_RELATIVE_PATH =
  "data/exports/mlit_company_data.json";

function exportPath(pathOrRoot) {
  return String(pathOrRoot).endsWith(".json")
    ? resolve(pathOrRoot)
    : resolve(pathOrRoot, BUILDBASE_EXPORT_RELATIVE_PATH);
}

function assertArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`BuildBase公開データの${name}が配列ではありません。`);
  }
}

export function loadBuildBaseCompanyData(pathOrRoot) {
  const path = exportPath(pathOrRoot);
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`BuildBase公開データを読めません: ${path}`, { cause: error });
  }

  if (data?.schemaVersion !== 1) {
    throw new Error(
      `未対応のBuildBase公開データ形式です: ${data?.schemaVersion ?? "不明"}`,
    );
  }
  assertArray(data.companies, "companies");
  assertArray(data.fields, "fields");
  assertArray(data.fiscalYears, "fiscalYears");
  assertArray(data.cells, "cells");

  const summary = data.summary ?? {};
  const statusCounts = summary.statusCounts ?? {};
  if (Number(statusCounts.todo ?? 0) > 0) {
    throw new Error(
      `BuildBaseに未処理セルが${statusCounts.todo}件あるため公開を停止しました。`,
    );
  }
  const expectedCellCount = data.companies.length
    ? Number(summary.companyYearCount ?? 0) * data.fields.length
    : 0;
  if (data.cells.length !== expectedCellCount) {
    throw new Error("BuildBaseセル数が会社年度数×項目数と一致しません。");
  }
  if (Number(summary.cellCount ?? data.cells.length) !== data.cells.length) {
    throw new Error("BuildBase公開データの集計件数が一致しません。");
  }

  return {
    companies: data.companies,
    fields: data.fields,
    fiscalYears: data.fiscalYears,
    cells: data.cells,
    statusCounts,
    companyYearCount: Number(summary.companyYearCount ?? 0),
    sourceUpdatedAt: data.sourceUpdatedAt,
    sourceHash: data.sourceHash,
    buildingUseFieldCount: Number(summary.buildingUseFieldCount ?? 0),
    buildingUseCompanyCount: Number(summary.buildingUseCompanyCount ?? 0),
    buildingUseFilledCount: Number(summary.buildingUseFilledCount ?? 0),
    factbookBuildingUseFilledCount: Number(
      summary.factbookBuildingUseFilledCount ?? 0,
    ),
    buildingUseFiscalYearFrom: Number(summary.buildingUseFiscalYearFrom ?? 0),
    buildingUseFiscalYearTo: Number(summary.buildingUseFiscalYearTo ?? 0),
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
      cell.status === "filled"
        ? "confirmed_value"
        : cell.status === "not_applicable"
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
