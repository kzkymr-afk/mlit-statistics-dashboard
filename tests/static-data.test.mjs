import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

const manifestUrl = new URL("../public/data/manifest.json", import.meta.url);
const gunzipAsync = promisify(gunzip);

async function readGzipJson(url) {
  const compressed = await readFile(url);
  return JSON.parse((await gunzipAsync(compressed)).toString("utf8"));
}

function publicDataUrl(path) {
  return new URL(`../public/${path}`, import.meta.url);
}

test("Pages公開データは全統計ファイルとシート索引を持つ", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.source, "local-normalized-sqlite");
  assert.equal(manifest.tables.length, 399);
  assert.ok(manifest.tables.every((table) => table.sheets.length > 0));
});

test("表ページから年度系列束まで静的データだけで辿れる", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const table = manifest.tables.find(
    (item) =>
      item.datasetId === "orders-major50" &&
      item.fiscalYear === 2025 &&
      item.title === "結果表",
  );
  assert.ok(table, "2025年度の受注動態・結果表が必要");
  assert.ok(table.sheets.length > 0);

  let selectedSeries = null;
  for (const sheet of table.sheets) {
    const meta = await readGzipJson(publicDataUrl(sheet.metaUrl));
    assert.ok(meta.columnLabels.length > 0);
    for (let pageIndex = 0; pageIndex < meta.pageCount; pageIndex += 1) {
      const page = await readGzipJson(
        publicDataUrl(
          meta.pageUrlTemplate.replace("{page}", String(pageIndex)),
        ),
      );
      selectedSeries = page.rows
        .flatMap((row) => row.series)
        .find((series) => series?.bundleUrl);
      if (selectedSeries) break;
    }
    if (selectedSeries) break;
  }
  assert.ok(selectedSeries, "グラフ化できる数値セルが必要");
  const bundle = await readGzipJson(
    publicDataUrl(selectedSeries.bundleUrl),
  );
  assert.ok(bundle.series[selectedSeries.id]);
  assert.equal(bundle.series[selectedSeries.id].points.length, 13);
});

test("公開用JSONは個別ファイル25MiB未満に収まる", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  for (const table of manifest.tables) {
    for (const sheet of table.sheets) {
      const target = new URL(`../public/${sheet.metaUrl}`, import.meta.url);
      const fileStat = await stat(target);
      assert.ok(
        fileStat.size < 25 * 1024 * 1024,
        `${sheet.metaUrl} is too large`,
      );
    }
  }
});
