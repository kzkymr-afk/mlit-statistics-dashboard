import assert from "node:assert/strict";
import test from "node:test";

import { buildAxisScale, niceStep } from "../lib/chart-scale.mjs";

test("自動軸は1・2・5刻みの読みやすい目盛りになる", () => {
  const scale = buildAxisScale([112_000, 873_000]);
  assert.equal(scale.min, 0);
  assert.equal(scale.max, 1_000_000);
  assert.equal(scale.step, 200_000);
  assert.deepEqual(scale.ticks, [0, 200_000, 400_000, 600_000, 800_000, 1_000_000]);
});

test("値の桁に応じて目盛間隔を切り替える", () => {
  assert.equal(niceStep(280_000), 100_000);
  assert.equal(niceStep(28_000), 10_000);
  assert.equal(niceStep(280), 100);
  assert.equal(niceStep(2.8), 1);
});

test("棒グラフの自動軸は0を含む", () => {
  const scale = buildAxisScale([125_000, 475_000], { includeZero: true });
  assert.equal(scale.min, 0);
  assert.ok(scale.max >= 475_000);
  assert.ok(scale.ticks.includes(0));
});

test("利用者が指定した最小値・最大値・目盛間隔を優先する", () => {
  const scale = buildAxisScale([112_000, 873_000], {
    min: 100_000,
    max: 900_000,
    step: 100_000,
  });
  assert.equal(scale.min, 100_000);
  assert.equal(scale.max, 900_000);
  assert.equal(scale.step, 100_000);
  assert.deepEqual(scale.ticks, [
    100_000,
    200_000,
    300_000,
    400_000,
    500_000,
    600_000,
    700_000,
    800_000,
    900_000,
  ]);
});

test("最小値と最大値だけを指定した場合も指定範囲から自動間隔を決める", () => {
  const scale = buildAxisScale([112_000, 873_000], {
    min: 0,
    max: 10_000_000,
  });
  assert.equal(scale.min, 0);
  assert.equal(scale.max, 10_000_000);
  assert.equal(scale.step, 2_000_000);
});
