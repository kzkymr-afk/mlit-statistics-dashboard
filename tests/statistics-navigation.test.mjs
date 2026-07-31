import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_CYCLES,
  filterTablesByNavigation,
  preferredTableId,
  tableMatchesCycle,
} from "../lib/statistics-navigation.mjs";

const tables = [
  { id: "annual", datasetId: "building-starts", cycle: "年度次" },
  { id: "calendar", datasetId: "building-starts", cycle: "年次" },
  {
    id: "monthly",
    datasetId: "building-starts-monthly",
    cycle: "月次",
  },
  { id: "other", datasetId: "orders-major50", cycle: "年度次" },
];

test("周期を先に選ぶと同じ統計の対応表だけを返す", () => {
  const datasetIds = ["building-starts", "building-starts-monthly"];
  assert.deepEqual(
    filterTablesByNavigation(tables, datasetIds, "年度次").map(
      (table) => table.id,
    ),
    ["annual"],
  );
  assert.deepEqual(
    filterTablesByNavigation(tables, datasetIds, "月次").map(
      (table) => table.id,
    ),
    ["monthly"],
  );
});

test("すべてでは統合した統計の全周期を返す", () => {
  const result = filterTablesByNavigation(
    tables,
    ["building-starts", "building-starts-monthly"],
    ALL_CYCLES,
  );
  assert.deepEqual(
    result.map((table) => table.id),
    ["annual", "calendar", "monthly"],
  );
  assert.equal(tableMatchesCycle(tables[0], ALL_CYCLES), true);
});

test("現在表が周期外ならその周期の基本表を選び直す", () => {
  const monthlyTables = filterTablesByNavigation(
    tables,
    ["building-starts", "building-starts-monthly"],
    "月次",
  );
  assert.equal(
    preferredTableId(monthlyTables, "annual", {
      "building-starts-monthly": "monthly",
    }),
    "monthly",
  );
});
