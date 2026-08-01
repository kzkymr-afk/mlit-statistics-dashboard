import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalogUrl = new URL(
  "../data/catalogs/nikkenren-group-orders.json",
  import.meta.url,
);

test("日建連の第1～第5グループを2013～2025年度で保持する", async () => {
  const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
  assert.equal(catalog.datasetId, "nikkenren-group-orders");
  assert.equal(catalog.fiscalYearFrom, 2013);
  assert.equal(catalog.fiscalYearTo, 2025);
  assert.equal(catalog.years.length, 13);
  assert.deepEqual(catalog.groupCodes, ["1", "2", "3", "4", "5"]);
  assert.deepEqual(
    catalog.measures.map((measure) => measure.name),
    ["建築全体", "国内建築", "海外建築", "民間建築", "官庁建築"],
  );
  assert.deepEqual(
    catalog.years.map((year) => year.fiscalYear),
    Array.from({ length: 13 }, (_, index) => 2013 + index),
  );
  assert.deepEqual(
    [...new Set(catalog.years.map((year) => year.memberCount))].sort(),
    [96, 97, 98],
  );
  assert.ok(
    catalog.years.every(
      (year) =>
        year.groups.length === 5 &&
        year.groups.every((group) => /^[1-5]$/.test(group.group)),
    ),
  );
});

test("日建連原表の内訳式と5グループ合計が全年度で一致する", async () => {
  const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
  for (const year of catalog.years) {
    for (const group of year.groups) {
      assert.equal(
        group.buildingTotal,
        group.domesticBuilding + group.overseasBuilding,
      );
      assert.equal(
        group.domesticBuilding,
        group.privateBuilding + group.publicBuilding + group.otherBuilding,
      );
    }
    for (const key of [
      "buildingTotal",
      "domesticBuilding",
      "privateBuilding",
      "publicBuilding",
      "otherBuilding",
      "overseasBuilding",
    ]) {
      assert.equal(
        year.groups.reduce((sum, group) => sum + group[key], 0),
        year.total[key],
      );
    }
  }
});
