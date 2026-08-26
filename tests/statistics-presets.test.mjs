import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import {
  STATISTICS_PRESETS,
  presetSeriesCoordinates,
} from "../lib/statistics-presets.mjs";
import { comboIdentity } from "../lib/statistics-series-compare.mjs";
import { createHash } from "node:crypto";

const gunzipAsync = promisify(gunzip);
const publicRoot = new URL("../public/", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, publicRoot), "utf8"));
}

async function readGzipJson(path) {
  const compressed = await readFile(new URL(path, publicRoot));
  return JSON.parse((await gunzipAsync(compressed)).toString("utf8"));
}

function seriesIdFor(tableId, coordinates) {
  const identity = comboIdentity(coordinates);
  return createHash("sha256")
    .update(`${tableId}${identity}`)
    .digest("hex")
    .slice(0, 32);
}

test("プリセットの構造は一意なIDと表示形式を持つ", () => {
  assert.ok(STATISTICS_PRESETS.length > 0);
  const ids = new Set();
  for (const preset of STATISTICS_PRESETS) {
    assert.ok(preset.id, "idが必要です");
    assert.ok(!ids.has(preset.id), `idが重複しています: ${preset.id}`);
    ids.add(preset.id);
    assert.ok(preset.title);
    assert.ok(preset.description);
    assert.ok(["table", "bar", "line"].includes(preset.displayFormat));
    assert.ok(["line", "bar"].includes(preset.chartKind));
    assert.ok(["left", "right"].includes(preset.axis));
    assert.ok(preset.expandCodes.length > 0);
    assert.ok(
      preset.expandCodes.length <= 12,
      `${preset.id}: 一括追加の上限(12)を超えています`,
    );
    assert.equal(
      new Set(preset.expandCodes).size,
      preset.expandCodes.length,
      `${preset.id}: expandCodesに重複があります`,
    );
  }
});

test("プリセットが参照する統計表は公開カタログに存在する", async () => {
  const catalog = await readJson("system/catalog.json");
  for (const preset of STATISTICS_PRESETS) {
    const table = catalog.tables.find((item) => item.id === preset.tableId);
    assert.ok(table, `${preset.id}: tableId ${preset.tableId} が見つかりません`);
    assert.equal(
      table.datasetId,
      preset.datasetId,
      `${preset.id}: datasetIdが一致しません`,
    );
  }
});

test("プリセットが参照する分類コードは表の分類事項に実在する", async () => {
  const catalog = await readJson("system/catalog.json");
  for (const preset of STATISTICS_PRESETS) {
    const table = catalog.tables.find((item) => item.id === preset.tableId);
    const meta = await readGzipJson(table.metaUrl);

    const expandDimension = meta.dimensions.find(
      (dimension) => dimension.apiKey === preset.expandDimensionApiKey,
    );
    assert.ok(
      expandDimension,
      `${preset.id}: 展開対象の分類事項 ${preset.expandDimensionApiKey} がありません`,
    );
    for (const code of preset.expandCodes) {
      assert.ok(
        expandDimension.values.some((value) => value.code === code),
        `${preset.id}: 分類コード ${code} が ${preset.expandDimensionApiKey} に存在しません`,
      );
    }

    for (const [apiKey, code] of Object.entries(preset.baseSelections)) {
      const dimension = meta.dimensions.find((item) => item.apiKey === apiKey);
      assert.ok(dimension, `${preset.id}: 分類事項 ${apiKey} がありません`);
      assert.ok(
        dimension.values.some((value) => value.code === code),
        `${preset.id}: 固定条件 ${apiKey}=${code} が存在しません`,
      );
    }
  }
});

test("プリセットの全系列は実データとして公開されている", async () => {
  for (const preset of STATISTICS_PRESETS) {
    const bundleCache = new Map();
    for (const coordinates of presetSeriesCoordinates(preset)) {
      const seriesId = seriesIdFor(preset.tableId, coordinates);
      const prefix = seriesId.slice(0, 2);
      const cacheKey = `${preset.datasetId}-${prefix}`;
      if (!bundleCache.has(cacheKey)) {
        bundleCache.set(
          cacheKey,
          await readGzipJson(
            `system/shards/${preset.datasetId}-${prefix}.json.gz`,
          ),
        );
      }
      const bundle = bundleCache.get(cacheKey);
      const series = bundle.series[seriesId];
      assert.ok(
        series,
        `${preset.id}: ${JSON.stringify(coordinates)} の系列が公開データにありません`,
      );
      const [, , points] = series;
      const hasRealValue = points.some((point) => point[1] !== null);
      assert.ok(
        hasRealValue,
        `${preset.id}: ${JSON.stringify(coordinates)} に実測値がありません`,
      );
    }
  }
});
