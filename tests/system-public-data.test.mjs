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
    "labour-force-survey",
    "monthly-labour-survey",
    "wage-structure-survey",
    "public-works-labour-rate",
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
        : table.datasetId === "monthly-labour-survey"
          ? /^https:\/\/www\.mhlw\.go\.jp\//.test(sourceUrl)
        : table.datasetId === "public-works-labour-rate"
          ? /^https:\/\/www\.mlit\.go\.jp\//.test(sourceUrl)
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
  // 項目数・セル数はBuildBase側の項目追加で増えるため、固定値でなく同期時のカタログ値と突合する
  const buildBaseCatalog = JSON.parse(
    await readFile(
      new URL("../data/catalogs/buildbase-company-data.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(buildBaseCatalog.companyCount, 21);
  assert.ok(buildBaseCatalog.fieldCount >= 65);
  assert.equal(
    table.seriesCount,
    buildBaseCatalog.fieldCount * buildBaseCatalog.companyCount,
  );
  assert.equal(table.observationCount, buildBaseCatalog.cellCount);

  const meta = await readGzipJson(table.metaUrl);
  const fieldValues = meta.dimensions.find((item) => item.apiKey === "tab").values;
  assert.equal(fieldValues.length, buildBaseCatalog.fieldCount);
  assert.equal(meta.dimensions.find((item) => item.apiKey === "cat01").values.length, 21);
  assert.equal(meta.dimensions.find((item) => item.apiKey === "time").values.length, 11);
  // 値の範囲を説明する文字の注記項目（*_basis）は系列にせず、数値セルの注記に載せる
  assert.ok(!fieldValues.some((item) => item.code.endsWith("_basis")));
  for (const code of [
    "construction_gross_profit_margin_building_standalone",
    "construction_gross_profit_margin_domestic_building_standalone",
    "building_gross_margin_reported",
  ]) {
    assert.ok(fieldValues.some((item) => item.code === code), code);
  }

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

  const reportedMargin = await seriesFor({
    tab: "building_gross_margin_reported",
    cat01: "INFR",
  });
  assert.ok(
    reportedMargin[2].some(
      (point) =>
        point[0] === "2021100000" &&
        point[1] === 10.8 &&
        String(point[3] ?? "").includes("開示ベース: 連結グループセグメント"),
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

  // 淺沼組は2026-08の是正で用途別が全年開示値になったため、恒久的に用途別非開示の
  // 戸田建設（ファクトブックが事業別のみで用途別を持たない）で非開示状態の公開を検証する。
  const notDisclosed = await seriesFor({
    tab: "building_orders_use_office",
    cat01: "TODA",
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
  // 充足数はBuildBase側の是正・年次更新で増えるため、固定値でなくカタログ値と突合する
  assert.equal(
    filledBuildingUseCount,
    buildBaseCatalog.factbookBuildingUseFilledCount,
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

test("建設投資見通しは令和8年度版を主表とし2008年度から公開する", async () => {
  const catalog = await readJson("system/catalog.json");
  const dataset = catalog.datasets.find(
    (item) => item.id === "construction-investment",
  );
  assert.equal(dataset.fiscalYearFrom, 2008);
  const tableIds = catalog.tables
    .filter((item) => item.datasetId === "construction-investment")
    .map((item) => item.id)
    .toSorted();
  assert.deepEqual(tableIds, [
    "0004030738",
    "0004030739",
    "0004065387",
    "0004065388",
  ]);
  const shardNames = (await readdir(new URL("system/shards/", publicRoot)))
    .filter((name) => name.startsWith("construction-investment-"));
  assert.ok(shardNames.length > 0);
  let earliestYear = Infinity;
  for (const name of shardNames) {
    const bundle = await readGzipJson(`system/shards/${name}`);
    for (const [, , points] of Object.values(bundle.series)) {
      for (const [timeCode] of points) {
        earliestYear = Math.min(earliestYear, Number(timeCode.slice(0, 4)));
      }
    }
  }
  assert.equal(earliestYear, 2008);
});

test("建設技能労働者の系列は公的統計だけで、母集団の注意書きを持つ", async () => {
  const catalog = await readJson("system/catalog.json");
  const workforceDatasetIds = [
    "labour-force-survey",
    "monthly-labour-survey",
    "wage-structure-survey",
    "public-works-labour-rate",
  ];
  const tables = catalog.tables.filter((table) =>
    workforceDatasetIds.includes(table.datasetId),
  );
  assert.deepEqual(tables.map((table) => table.id).toSorted(), [
    "0003007108",
    "0003024266",
    "file-00450071-construction-annual",
    "file-00450091-occupation-2025",
    "file-lfs-construction-age-share-2025",
    "file-lfs-construction-skilled-3cat",
    "file-mlit-design-labour-rate",
  ]);
  // 公開データに社内資料・ローカルパスが入っていないこと（公的機関のURLだけ）
  for (const table of tables) {
    assert.match(
      catalog.sources[table.id].sourceUrl,
      /^https:\/\/www\.(e-stat|mhlw|mlit)\.go\.jp\//,
    );
  }
  const metaText = (
    await Promise.all(tables.map((table) => readGzipJson(table.metaUrl)))
  )
    .map((meta) => JSON.stringify(meta))
    .join("\n");
  assert.doesNotMatch(metaText, /\/Volumes\/|Materials|推進部|安藤|ハザマ|社内/);

  const bundleCache = new Map();
  async function seriesFor(tableId, selections) {
    const table = catalog.tables.find((item) => item.id === tableId);
    const identity = Object.entries(selections)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("\u001f");
    const seriesId = createHash("sha256")
      .update(`${tableId}\u001f${identity}`)
      .digest("hex")
      .slice(0, 32);
    const shard = `system/shards/${table.datasetId}-${seriesId.slice(0, 2)}.json.gz`;
    if (!bundleCache.has(shard)) bundleCache.set(shard, await readGzipJson(shard));
    return bundleCache.get(shard).series[seriesId];
  }
  function point(series, timeCode) {
    return series[2].find((item) => item[0] === timeCode);
  }

  // 派生系列: 3職業大分類の和。2024年300万人・2025年296万人
  const skilledMeta = await readGzipJson(
    catalog.tables.find((item) => item.id === "file-lfs-construction-skilled-3cat").metaUrl,
  );
  assert.ok(skilledMeta.table.notes.some((note) => /派生系列/.test(note)));
  const skilled = await seriesFor("file-lfs-construction-skilled-3cat", {
    tab: "skilled-3cat",
    cat01: "0",
  });
  assert.equal(point(skilled, "2024000000")[1], 300);
  assert.equal(point(skilled, "2025000000")[1], 296);
  assert.match(point(skilled, "2021000000")[3], /年報I-B-8.*309万人/);

  // e-Stat DB同期: 建設業就業者2025年478万人、専門的・技術的職業従事者に注意
  const lfsMeta = await readGzipJson(
    catalog.tables.find((item) => item.id === "0003024266").metaUrl,
  );
  assert.ok(lfsMeta.table.notes.some((note) => /2019～2021年/.test(note)));
  const occupation = lfsMeta.dimensions.find((item) => item.apiKey === "cat02");
  assert.match(
    occupation.values.find((item) => item.code === "002").note,
    /施工管理・設計/,
  );
  const constructionTotal = await seriesFor("0003024266", {
    tab: "01",
    area: "00000",
    cat01: "0",
    cat02: "000",
    cat03: "02",
    cat04: "09",
    cat05: "00",
  });
  assert.equal(point(constructionTotal, "2025000000")[1], 478);

  const ageMeta = await readGzipJson(
    catalog.tables.find((item) => item.id === "0003007108").metaUrl,
  );
  assert.ok(ageMeta.table.notes.some((note) => /技能者の年齢構成ではない/.test(note)));
  // 原表「-」は欠測として保持し、0にしない
  const blankShare = await seriesFor("file-lfs-construction-age-share-2025", {
    tab: "share",
    cat01: "2",
    cat02: "02",
  });
  assert.equal(point(blankShare, "2025000000")[1], null);
  assert.equal(point(blankShare, "2025000000")[4], "missing");

  const monthlyMeta = await readGzipJson(
    catalog.tables.find((item) => item.id === "file-00450071-construction-annual").metaUrl,
  );
  assert.ok(monthlyMeta.table.notes.some((note) => /5人以上/.test(note)));
  const wage = await seriesFor("file-00450071-construction-annual", { tab: "01" });
  assert.equal(point(wage, "2025000000")[1], 462801);

  const occupationMeta = await readGzipJson(
    catalog.tables.find((item) => item.id === "file-00450091-occupation-2025").metaUrl,
  );
  assert.ok(occupationMeta.table.notes.some((note) => /建設業に限った集計ではない/.test(note)));
  const bonus = await seriesFor("file-00450091-occupation-2025", {
    tab: "12",
    cat01: "1661",
  });
  // 注記はNFKC正規化されるため全角の「～」は「~」になる
  assert.match(point(bonus, "2025000000")[3], /2024年1[~～]12月/);

  const rateMeta = await readGzipJson(
    catalog.tables.find((item) => item.id === "file-mlit-design-labour-rate").metaUrl,
  );
  assert.ok(rateMeta.table.notes.some((note) => /実際に支払われた賃金ではない/.test(note)));
  const rate = await seriesFor("file-mlit-design-labour-rate", {
    tab: "all-occupations",
  });
  assert.equal(point(rate, "2026000000")[1], 25834);
});
