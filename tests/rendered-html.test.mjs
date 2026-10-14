import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  return readFile(new URL("../out/index.html", import.meta.url), "utf8");
}

test("検索・比較の初期画面と従来の詳細設定への入口を共通ログイン内に表示する", async () => {
  const html = await render();
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /Atlas/);
  assert.match(html, /詳細な統計設定/);
  assert.match(html, /従来の分類指定・お気に入り・グラフ設定・分析用書き出し/);
  assert.match(html, /検索画面を準備しています/);
  assert.match(html, /表・グラフ・CSV/);
  assert.match(html, /atlas-gate/);
  assert.match(html, /data-atlas-build-id/);
  assert.doesNotMatch(html, /レビュー境界|確認範囲境界|別レビュー|レビュー単位/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("BuildBase収録基準は建物用途別受注の反映状況を表示する", async () => {
  const html = await readFile(
    new URL("../out/buildbase-data/index.html", import.meta.url),
    "utf8",
  );
  const buildBaseCatalog = JSON.parse(
    await readFile(
      new URL("../data/catalogs/buildbase-company-data.json", import.meta.url),
      "utf8",
    ),
  );
  const { buildingUseCompanyCount, factbookBuildingUseFilledCount } =
    buildBaseCatalog;
  assert.ok(buildingUseCompanyCount > 0);
  assert.ok(factbookBuildingUseFilledCount > 0);
  assert.match(html, /建物用途別受注実績/);
  assert.match(
    html,
    new RegExp(`${buildingUseCompanyCount}社`),
  );
  assert.match(
    html,
    new RegExp(factbookBuildingUseFilledCount.toLocaleString("ja-JP")),
  );
  assert.match(html, /公式ファクトブック/);
  assert.match(html, /BuildBaseが公式資料から値と出典を確定/);
});

test("大手50社受注動態の2013年度以降の公式Excel全件を保持する", async () => {
  const raw = await readFile(
    new URL("../data/catalogs/orders-major50-annual.json", import.meta.url),
    "utf8",
  );
  const data = JSON.parse(raw);
  assert.equal(data.datasetId, "orders-major50");
  assert.equal(data.organization, "国土交通省");
  assert.equal(data.fiscalYearFrom, 2013);
  assert.equal(data.fiscalYearTo, 2025);
  assert.equal(data.fileCount, 48);
  assert.equal(data.records.length, 48);
  assert.equal(data.groups.length, 4);
  assert.ok(data.totalBytes > 1_600_000);
  assert.ok(
    data.records.every(
      (record) =>
        /^https:\/\/www\.e-stat\.go\.jp\//.test(record.sourcePage) &&
        /^https:\/\/www\.e-stat\.go\.jp\//.test(record.downloadUrl) &&
        /^[a-f0-9]{64}$/.test(record.sha256),
    ),
  );
  assert.deepEqual(
    [...new Set(data.records.map((record) => record.fiscalYear))].sort(),
    Array.from({ length: 13 }, (_, index) => 2013 + index),
  );
});

test("保存済み目録に2013年度以降の公式Excel全件を保持する", async () => {
  const raw = await readFile(
    new URL("../data/catalogs/building-annual.json", import.meta.url),
    "utf8",
  );
  const data = JSON.parse(raw);
  assert.equal(data.organization, "国土交通省");
  assert.equal(data.fiscalYearFrom, 2013);
  assert.equal(data.fiscalYearTo, 2025);
  assert.equal(data.fileCount, 351);
  assert.equal(data.records.length, 351);
  assert.ok(data.groups.length >= 30);
  assert.ok(data.totalBytes > 380_000_000);
  assert.ok(
    data.records.every(
      (record) =>
        /^https:\/\/www\.e-stat\.go\.jp\//.test(record.sourcePage) &&
        /^https:\/\/www\.e-stat\.go\.jp\//.test(record.downloadUrl) &&
        /^[a-f0-9]{64}$/.test(record.sha256),
    ),
  );
  assert.deepEqual(
    [...new Set(data.records.map((record) => record.fiscalYear))].sort(),
    Array.from({ length: 13 }, (_, index) => 2013 + index),
  );
});
