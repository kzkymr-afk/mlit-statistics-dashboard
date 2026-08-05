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
  assert.equal(catalog.source, "estat-normalized-sqlite");
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
  for (const datasetId of [
    "building-starts-monthly",
    "orders-major50-monthly",
    "construction-output",
    "construction-deflator",
    "construction-investment",
    "construction-work",
    "construction-labor",
    "construction-materials",
    "building-stock",
    "nikkenren-group-orders",
    "buildbase-company-comparison",
  ]) {
    assert.ok(
      catalog.tables.some((table) => table.datasetId === datasetId),
      `${datasetId}が必要です`,
    );
  }
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
    catalog.tables.every((table) => {
      const sourceUrl = catalog.sources[table.id]?.sourceUrl ?? "";
      return table.datasetId === "nikkenren-group-orders"
        ? /^https:\/\/www\.nikkenren\.com\//.test(sourceUrl)
        : table.datasetId === "buildbase-company-comparison"
          ? /\/buildbase-data\/$/.test(sourceUrl)
        : /^https:\/\/www\.e-stat\.go\.jp\//.test(sourceUrl);
    }),
  );
});

test("AI向け公開カタログは全統計表の非圧縮分類スキーマを持つ", async () => {
  const catalog = await readJson("system/catalog.json");
  const aiCatalog = await readJson("system/ai/catalog.json");
  assert.equal(aiCatalog.schemaVersion, "1.0");
  assert.equal(aiCatalog.datasets.length, catalog.datasets.length);
  assert.equal(aiCatalog.tables.length, catalog.tables.length);
  const nikkenren = aiCatalog.tables.find(
    (item) => item.id === "nikkenren-group-orders-annual",
  );
  assert.ok(nikkenren);
  const meta = await readJson(
    nikkenren.aiMetaUrl.replace(/^system\//, "system/"),
  );
  assert.equal(meta.table.id, nikkenren.id);
  assert.ok(meta.dimensions.some((item) => item.apiKey === "time"));
  assert.match(meta.seriesAccess.identity, /SHA-256/);
  assert.equal(meta.seriesAccess.implicitNumericZero, true);
});

test("日建連受注高は5グループ×5指標を年度系列として公開する", async () => {
  const catalog = await readJson("system/catalog.json");
  const table = catalog.tables.find(
    (item) => item.id === "nikkenren-group-orders-annual",
  );
  assert.ok(table);
  assert.equal(table.datasetId, "nikkenren-group-orders");
  assert.equal(table.sourceKind, "nikkenren-excel");
  assert.equal(table.seriesCount, 25);
  assert.equal(table.observationCount, 325);

  const meta = await readGzipJson(table.metaUrl);
  const measure = meta.dimensions.find((item) => item.apiKey === "tab");
  const group = meta.dimensions.find((item) => item.apiKey === "cat01");
  const time = meta.dimensions.find((item) => item.apiKey === "time");
  assert.deepEqual(
    measure.values.map((item) => item.name),
    ["建築全体", "国内建築", "海外建築", "民間建築", "官庁建築"],
  );
  assert.deepEqual(
    group.values.map((item) => item.name),
    ["第1グループ", "第2グループ", "第3グループ", "第4グループ", "第5グループ"],
  );
  assert.equal(time.values.length, 13);
  assert.match(time.values[0].name, /^2013年度（会員97社）$/);
  assert.match(time.values.at(-1).name, /^2025年度（会員96社）$/);
  assert.ok(!measure.values.some((item) => /その他/.test(item.name)));
  assert.ok(!group.values.some((item) => item.name === "合計"));

  const identity = Object.entries(meta.defaultSelection)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\u001f");
  const seriesId = createHash("sha256")
    .update(`${table.id}\u001f${identity}`)
    .digest("hex")
    .slice(0, 32);
  const bundle = await readGzipJson(
    `system/shards/nikkenren-group-orders-${seriesId.slice(0, 2)}.json.gz`,
  );
  const series = bundle.series[seriesId];
  assert.ok(series);
  assert.equal(series[0], "百万円");
  assert.equal(series[2].length, 13);
  assert.deepEqual(series[2][0].slice(0, 2), ["2013100000", 4845277]);
  assert.deepEqual(series[2].at(-1).slice(0, 2), ["2025100000", 7827139]);
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
    .filter((name) => /^[a-z0-9-]+-[a-f0-9]{2}\.json\.gz$/.test(name))
    .filter((name) => !name.startsWith("buildbase-company-comparison-"))
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

test("BuildBase会社別データは確定値・非開示・公表待ちを区別して公開する", async () => {
  const catalog = await readJson("system/catalog.json");
  const table = catalog.tables.find(
    (item) => item.id === "buildbase-company-annual",
  );
  assert.ok(table);
  assert.equal(table.datasetId, "buildbase-company-comparison");
  assert.equal(table.sourceKind, "buildbase-public-disclosures");
  assert.equal(table.seriesCount, 1_134);
  assert.equal(table.observationCount, 12_150);

  const meta = await readGzipJson(table.metaUrl);
  assert.equal(meta.dimensions.find((item) => item.apiKey === "tab").values.length, 54);
  assert.equal(meta.dimensions.find((item) => item.apiKey === "cat01").values.length, 21);
  assert.equal(meta.dimensions.find((item) => item.apiKey === "time").values.length, 11);

  const bundleCache = new Map();
  async function seriesFor(selections) {
    const identity = Object.entries(selections)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("\u001f");
    const seriesId = createHash("sha256")
      .update(`${table.id}\u001f${identity}`)
      .digest("hex")
      .slice(0, 32);
    const prefix = seriesId.slice(0, 2);
    if (!bundleCache.has(prefix)) {
      bundleCache.set(
        prefix,
        await readGzipJson(
          `system/shards/buildbase-company-comparison-${prefix}.json.gz`,
        ),
      );
    }
    const bundle = bundleCache.get(prefix);
    return bundle.series[seriesId];
  }

  const researchExpense = await seriesFor({
    tab: "rd_expense",
    cat01: "KAJIMA",
  });
  assert.ok(researchExpense);
  assert.ok(
    researchExpense[2].some(
      (point) => point[0] === "2024100000" && point[1] === 22_207,
    ),
  );

  const pendingEngineers = await seriesFor({
    tab: "architecture_engineers_1st_class",
    cat01: "ANDO_HAZAMA",
  });
  assert.ok(
    pendingEngineers[2].some(
      (point) =>
        point[0] === "2025100000" &&
        point[1] === null &&
        point[4] === "publication_pending",
    ),
  );

  const notDisclosed = await seriesFor({
    tab: "building_orders_use_office",
    cat01: "ASANUMA",
  });
  assert.ok(
    notDisclosed[2].some(
      (point) => point[1] === null && point[4] === "not_disclosed",
    ),
  );

  const buildingUseFields = meta.dimensions
    .find((item) => item.apiKey === "tab")
    .values.filter((item) => item.code.startsWith("building_orders_use_"));
  const companies = meta.dimensions.find(
    (item) => item.apiKey === "cat01",
  ).values;
  let filledBuildingUseCount = 0;
  for (const field of buildingUseFields) {
    for (const company of companies) {
      const series = await seriesFor({ tab: field.code, cat01: company.code });
      filledBuildingUseCount += series[2].filter(
        (point) =>
          point[1] !== null &&
          String(point[3] ?? "").includes("公式ファクトブック・データブック"),
      ).length;
    }
  }
  assert.equal(buildingUseFields.length, 9);
  assert.equal(filledBuildingUseCount, 604);
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
