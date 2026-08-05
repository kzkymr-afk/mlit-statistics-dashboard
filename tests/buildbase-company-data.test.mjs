import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";

import {
  buildBuildBaseDimensions,
  buildBuildBaseObservations,
  loadBuildBaseCompanyData,
} from "../scripts/lib/buildbase-company-data.mjs";

function fixture(completionStatus = "publication_pending") {
  const root = mkdtempSync(resolve(tmpdir(), "buildbase-company-data-"));
  const payload = {
    schemaVersion: 1,
    generatedAt: "2026-08-05T00:00:00Z",
    sourceUpdatedAt: "2026-08-04T00:00:00Z",
    sourceHash: "fixture-hash",
    companies: [{ id: "A", name: "甲建設" }],
    fields: [
      {
        id: "building_orders_use_office",
        name: "建築受注高_用途別_事務所・庁舎",
        category: "building_use_orders",
        unit: "百万円",
        sortOrder: 0,
      },
      {
        id: "engineers",
        name: "技術者数",
        category: "human_capital",
        unit: "人",
        sortOrder: 1,
      },
    ],
    fiscalYears: [2025],
    cells: [
      {
        companyId: "A",
        companyName: "甲建設",
        companyYearId: "A_2025",
        fiscalYear: 2025,
        fieldId: "building_orders_use_office",
        fieldName: "建築受注高_用途別_事務所・庁舎",
        unit: "百万円",
        rawValue: "1234",
        numericValue: 1234,
        status: "filled",
        sourceType: "factbook",
        sourceLabel: "公式ファクトブック・データブック",
        annotation: "BuildBase確定値 / 公式ファクトブック・データブック",
      },
      {
        companyId: "A",
        companyName: "甲建設",
        companyYearId: "A_2025",
        fiscalYear: 2025,
        fieldId: "engineers",
        fieldName: "技術者数",
        unit: "人",
        rawValue: "",
        numericValue: null,
        status: completionStatus,
        sourceType: "",
        sourceLabel: "",
        annotation: "情報源側の公表待ち。公表後にBuildBaseから再同期",
      },
    ],
    summary: {
      companyCount: 1,
      companyYearCount: 1,
      fieldCount: 2,
      cellCount: 2,
      statusCounts: {
        filled: 1,
        not_applicable: 0,
        publication_pending: completionStatus === "publication_pending" ? 1 : 0,
        todo: completionStatus === "todo" ? 1 : 0,
      },
      buildingUseFieldCount: 1,
      buildingUseCompanyCount: 1,
      buildingUseFilledCount: 1,
      factbookBuildingUseFilledCount: 1,
      buildingUseFiscalYearFrom: 2025,
      buildingUseFiscalYearTo: 2025,
    },
  };
  const target = resolve(root, "data/exports/mlit_company_data.json");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  return root;
}

test("BuildBase公開データを会社・項目・年度の系列へ変換する", () => {
  const root = fixture();
  try {
    const data = loadBuildBaseCompanyData(root);
    assert.equal(data.companies.length, 1);
    assert.equal(data.companyYearCount, 1);
    assert.equal(data.fields.length, 2);
    assert.equal(data.cells.length, 2);
    assert.equal(data.factbookBuildingUseFilledCount, 1);
    assert.equal(data.buildingUseCompanyCount, 1);
    assert.deepEqual(data.statusCounts, {
      filled: 1,
      not_applicable: 0,
      publication_pending: 1,
      todo: 0,
    });

    const dimensions = buildBuildBaseDimensions(data);
    const { observations, seriesLabel } = buildBuildBaseObservations(
      data,
      dimensions,
    );
    assert.equal(dimensions.find((item) => item.apiKey === "time").values.length, 1);
    assert.equal(observations.length, 2);
    assert.deepEqual(
      observations.map((item) => item.status).sort(),
      ["confirmed_value", "publication_pending"],
    );
    assert.equal(observations.find((item) => item.numericValue !== null).numericValue, 1234);
    assert.match(
      seriesLabel({ tab: "building_orders_use_office", cat01: "A" }),
      /事務所・庁舎 \/ 甲建設/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("未処理セルがあるBuildBase公開データは公開対象にしない", () => {
  const root = fixture("todo");
  try {
    assert.throws(
      () => loadBuildBaseCompanyData(root),
      /未処理セルが1件あるため公開を停止/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
