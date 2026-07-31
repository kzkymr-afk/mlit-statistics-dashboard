import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

const gunzipAsync = promisify(gunzip);
const publicRoot = new URL("../public/", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, publicRoot), "utf8"));
}

async function readGzipJson(path) {
  const compressed = await readFile(new URL(path, publicRoot));
  return JSON.parse((await gunzipAsync(compressed)).toString("utf8"));
}

test("公開データは統計表・公式分類・観測値のv2形式である", async () => {
  const catalog = await readJson("system/catalog.json");
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.source, "estat-api-normalized-sqlite");
  assert.ok(catalog.tables.length > 0);
  assert.ok(
    catalog.tables.some((table) => table.datasetId === "building-starts"),
  );
  assert.ok(
    catalog.tables.some((table) => table.datasetId === "orders-major50"),
  );
  assert.ok(
    catalog.tables.some((table) => table.datasetId === "renovation"),
  );
  assert.ok(
    catalog.tables.every(
      (table) =>
        table.registryStatus === "ready" &&
        table.seriesCount > 0 &&
        table.observationCount > 0,
    ),
  );
  assert.equal(
    Object.keys(catalog.sources).length,
    catalog.tables.length,
  );
  assert.ok(
    catalog.tables.every(
      (table) =>
        /^https:\/\/www\.e-stat\.go\.jp\/dbview\?sid=/.test(
          catalog.sources[table.id]?.sourceUrl ?? "",
        ),
    ),
  );
});

test("統計表メタ情報はExcelシートではなく公式分類コードを持つ", async () => {
  const catalog = await readJson("system/catalog.json");
  const table = catalog.tables.find(
    (item) =>
      item.datasetId === "building-starts" && item.observationCount > 0,
  );
  assert.ok(table);
  const meta = await readGzipJson(table.metaUrl);
  assert.equal(meta.schemaVersion, 2);
  assert.equal(meta.implicitNumericZero, true);
  assert.ok(Object.keys(meta.defaultSelection).length > 0);
  assert.ok(meta.dimensions.some((dimension) => dimension.apiKey === "time"));
  assert.ok(
    meta.dimensions.some((dimension) => dimension.apiKey === "tab"),
  );
  assert.ok(
    meta.dimensions.every(
      (dimension) =>
        dimension.name &&
        dimension.values.length > 0 &&
        dimension.values.every((value) => value.code && value.name),
    ),
  );
  assert.equal("sheets" in meta, false);
  assert.equal("cells" in meta, false);
});

test("実データの系列分割は軽量形式で値・暗黙0・出典を復元できる", async () => {
  const shardDirectory = new URL("system/shards/", publicRoot);
  const shardFiles = (await readdir(shardDirectory))
    .filter((name) =>
      /^(building-starts|orders-major50|renovation)-[a-f0-9]{2}\.json\.gz$/.test(
        name,
      ),
    )
    .sort();
  assert.ok(shardFiles.length >= 256);

  let storedSeries;
  let zeroSeries;
  for (const shardFile of shardFiles.slice(0, 32)) {
    const bundle = await readGzipJson(`system/shards/${shardFile}`);
    assert.equal(bundle.schemaVersion, 2);
    for (const [seriesId, series] of Object.entries(bundle.series)) {
      assert.match(seriesId, /^[a-f0-9]{32}$/);
      assert.ok(Array.isArray(series));
      assert.equal(series.length, 3);
      const [unit, timeMask, points] = series;
      assert.ok(unit === null || typeof unit === "string");
      assert.ok(
        (Number.isSafeInteger(timeMask) && timeMask > 0) ||
          (typeof timeMask === "string" && /^x[a-f0-9]+$/.test(timeMask)),
      );
      assert.ok(Array.isArray(points));
      if (points.length > 0 && !storedSeries) {
        storedSeries = series;
      }
      if (points.length === 0 && !zeroSeries) {
        zeroSeries = series;
      }
      if (storedSeries && zeroSeries) break;
    }
    if (storedSeries && zeroSeries) break;
  }

  assert.ok(storedSeries, "非0または注記付き観測値の系列が必要です");
  assert.ok(zeroSeries, "暗黙0だけの系列が必要です");
  assert.ok(
    storedSeries[2].every(
      (point) =>
        point.length === 5 &&
        typeof point[0] === "string" &&
        !(
          point[1] === 0 &&
          (point[3] === null || point[3] === "")
        ),
    ),
  );
});

test("リニューアルの長い月別時間軸を可変長マスクで復元できる", async () => {
  const catalog = await readJson("system/catalog.json");
  const table = catalog.tables.find((item) => item.id === "0003360970");
  assert.ok(table);
  const meta = await readGzipJson(table.metaUrl);
  const timeDimension = meta.dimensions.find(
    (dimension) => dimension.apiKey === "time",
  );
  assert.ok(timeDimension.values.length > 62);
  const identity = Object.entries(meta.defaultSelection)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\u001f");
  const seriesId = createHash("sha256")
    .update(`${table.id}\u001f${identity}`)
    .digest("hex")
    .slice(0, 32);
  const bundle = await readGzipJson(
    `system/shards/renovation-${seriesId.slice(0, 2)}.json.gz`,
  );
  const series = bundle.series[seriesId];
  assert.ok(series);
  assert.match(series[1], /^x[a-f0-9]+$/);
});
