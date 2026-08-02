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

function write(root, path, text) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function fixture(completionStatus = "publication_pending") {
  const root = mkdtempSync(resolve(tmpdir(), "buildbase-company-data-"));
  write(
    root,
    "config/company_master.csv",
    "operating_company_id,operating_company_name\nA,甲建設\n",
  );
  write(
    root,
    "config/field_definition.csv",
    [
      "field_id,field_name_ja,category,target_unit",
      "sales,売上高,performance,百万円",
      "engineers,技術者数,human_capital,人",
      "",
    ].join("\n"),
  );
  write(
    root,
    "config/company_year_master.csv",
    [
      "company_year_id,fiscal_year,operating_company_id,period_type",
      "A_2025,2025,A,annual",
      "A_2025H1,2025,A,semiannual_h1",
      "",
    ].join("\n"),
  );
  write(
    root,
    "data/final/final_master_wide.csv",
    [
      "company_year_id,fiscal_year,operating_company_id,period_type,sales,engineers",
      "A_2025,2025,A,annual,1234,",
      "A_2025H1,2025,A,semiannual_h1,600,",
      "",
    ].join("\n"),
  );
  write(
    root,
    "data/final/final_master_long.csv",
    [
      "company_year_id,field_id,value,extraction_method,source_dataset_id,source_file",
      "A_2025,sales,1234,XBRL_CSV,,edinet.db:xbrl_facts",
      "",
    ].join("\n"),
  );
  write(
    root,
    "data/reports/company_completion_report.csv",
    [
      "company_id,field_id,field_name_ja,fiscal_year,status",
      "A,sales,売上高,2025,filled",
      `A,engineers,技術者数,2025,${completionStatus}`,
      "",
    ].join("\n"),
  );
  return root;
}

test("BuildBase完成表を会社・項目・年度の系列へ変換する", () => {
  const root = fixture();
  try {
    const data = loadBuildBaseCompanyData(root);
    assert.equal(data.companies.length, 1);
    assert.equal(data.companyYearCount, 1);
    assert.equal(data.fields.length, 2);
    assert.equal(data.cells.length, 2);
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
    assert.match(seriesLabel({ tab: "sales", cat01: "A" }), /売上高 \/ 甲建設/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("未処理セルがあるBuildBaseデータは公開対象にしない", () => {
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

