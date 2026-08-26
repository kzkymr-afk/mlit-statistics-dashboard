import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BULK_ADD_SERIES,
  availabilityStatusFor,
  cartesianCombinations,
  classifyComboStatus,
  comboIdentity,
  expandCompareSelections,
  selectableCompareLimit,
} from "../lib/statistics-series-compare.mjs";

test("分類コードの並び順に関係なく同じ組み合わせIDになる", () => {
  assert.equal(
    comboIdentity({ tab: "operating_income_consolidated", cat01: "INFR" }),
    comboIdentity({ cat01: "INFR", tab: "operating_income_consolidated" }),
  );
});

test("インデックスにない組み合わせはavailable扱い", () => {
  const combos = {
    [comboIdentity({ tab: "engineers", cat01: "A" })]: "not_disclosed",
  };
  assert.equal(
    availabilityStatusFor(combos, { tab: "engineers", cat01: "B" }),
    "available",
  );
  assert.equal(
    availabilityStatusFor(combos, { tab: "engineers", cat01: "A" }),
    "not_disclosed",
  );
});

test("インデックス自体が無い場合も常にavailable扱い", () => {
  assert.equal(
    availabilityStatusFor(null, { tab: "engineers", cat01: "A" }),
    "available",
  );
});

test("実数値が1件でもあればavailable", () => {
  assert.equal(
    classifyComboStatus({
      hasReal: true,
      hasNotDisclosed: true,
      hasPublicationPending: false,
      observationCount: 5,
    }),
    "available",
  );
});

test("観測値が1件も無い組み合わせはunavailable", () => {
  assert.equal(
    classifyComboStatus({
      hasReal: false,
      hasNotDisclosed: false,
      hasPublicationPending: false,
      observationCount: 0,
    }),
    "unavailable",
  );
});

test("非開示のみの組み合わせはnot_disclosed", () => {
  assert.equal(
    classifyComboStatus({
      hasReal: false,
      hasNotDisclosed: true,
      hasPublicationPending: false,
      observationCount: 3,
    }),
    "not_disclosed",
  );
});

test("公表待ちのみの組み合わせはpublication_pending", () => {
  assert.equal(
    classifyComboStatus({
      hasReal: false,
      hasNotDisclosed: false,
      hasPublicationPending: true,
      observationCount: 3,
    }),
    "publication_pending",
  );
});

test("2つの分類の直積を全て列挙する", () => {
  const combos = cartesianCombinations([
    { apiKey: "tab", codes: ["a", "b"] },
    { apiKey: "cat01", codes: ["x", "y", "z"] },
  ]);
  assert.equal(combos.length, 6);
  assert.deepEqual(
    combos.map((item) => comboIdentity(item)).toSorted(),
    [
      { tab: "a", cat01: "x" },
      { tab: "a", cat01: "y" },
      { tab: "a", cat01: "z" },
      { tab: "b", cat01: "x" },
      { tab: "b", cat01: "y" },
      { tab: "b", cat01: "z" },
    ]
      .map((item) => comboIdentity(item))
      .toSorted(),
  );
});

test("次元が無ければ直積は空オブジェクト1件のみ", () => {
  assert.deepEqual(cartesianCombinations([]), [{}]);
});

test("一括追加の選択上限は残り枠と上限の小さい方", () => {
  assert.equal(selectableCompareLimit(20), MAX_BULK_ADD_SERIES);
  assert.equal(selectableCompareLimit(3), 3);
  assert.equal(selectableCompareLimit(0), 0);
  assert.equal(selectableCompareLimit(-2), 0);
});

test("チェックした分類値の数だけ系列条件を展開する", () => {
  const expanded = expandCompareSelections({
    baseSelections: { tab: "operating_income_consolidated", cat01: "INFR" },
    dimensionApiKey: "cat01",
    codes: ["A", "B", "C"],
    remainingCapacity: 10,
  });
  assert.equal(expanded.length, 3);
  assert.deepEqual(expanded[0], {
    tab: "operating_income_consolidated",
    cat01: "A",
  });
  assert.deepEqual(expanded[2], {
    tab: "operating_income_consolidated",
    cat01: "C",
  });
});

test("展開数は残り枠と一括追加上限で切り詰める", () => {
  const codes = Array.from({ length: 20 }, (_, index) => `C${index}`);
  const expandedByCap = expandCompareSelections({
    baseSelections: { tab: "x" },
    dimensionApiKey: "cat01",
    codes,
    remainingCapacity: 20,
  });
  assert.equal(expandedByCap.length, MAX_BULK_ADD_SERIES);

  const expandedByCapacity = expandCompareSelections({
    baseSelections: { tab: "x" },
    dimensionApiKey: "cat01",
    codes,
    remainingCapacity: 2,
  });
  assert.equal(expandedByCapacity.length, 2);
});
