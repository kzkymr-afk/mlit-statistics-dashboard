import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_FAVORITES,
  favoriteIdFor,
  normalizeFavorites,
  upsertFavorite,
} from "../lib/statistics-favorites.mjs";

function favorite(overrides = {}) {
  return {
    id: "ignored",
    datasetId: "building-starts-monthly",
    tableId: "0003119745",
    tableTitle: "民間非居住 用途別 床面積",
    statisticsName: "建築着工統計",
    label: "事務所 / 東京都",
    selections: { area: "13000", cat01: "11", tab: "12" },
    timeFrom: "2013010000",
    timeTo: "2026070000",
    timeFromLabel: "2013年1月",
    timeToLabel: "2026年7月",
    savedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

test("分類コードの並び順に関係なく同じお気に入りIDになる", () => {
  assert.equal(
    favoriteIdFor("table", { tab: "1", area: "13" }),
    favoriteIdFor("table", { area: "13", tab: "1" }),
  );
});

test("保存値を検証し、同じ項目を重複させない", () => {
  const valid = favorite();
  const normalized = normalizeFavorites([valid, valid, null, { bad: true }]);
  assert.equal(normalized.length, 1);
  assert.equal(
    normalized[0].id,
    favoriteIdFor(valid.tableId, valid.selections),
  );
});

test("同じ項目を再保存すると期間を更新して先頭へ移す", () => {
  const previous = favorite({ timeTo: "2025060000" });
  const other = favorite({
    tableId: "0003126275",
    label: "受注高",
  });
  const updated = favorite({ timeTo: "2026070000" });
  const result = upsertFavorite([other, previous], updated);
  assert.equal(result.length, 2);
  assert.equal(result[0].timeTo, "2026070000");
  assert.equal(result[1].tableId, other.tableId);
});

test("お気に入りは左カラムで扱える件数に制限する", () => {
  const items = Array.from({ length: MAX_FAVORITES + 4 }, (_, index) =>
    favorite({
      tableId: String(index),
      label: `項目${index}`,
    }),
  );
  assert.equal(normalizeFavorites(items).length, MAX_FAVORITES);
});
