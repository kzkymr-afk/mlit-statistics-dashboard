import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  return readFile(new URL("../out/index.html", import.meta.url), "utf8");
}

test("統計項目と分類条件を選ぶシステム画面をサーバーレンダリングする", async () => {
  const html = await render();
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /建築着工統計/);
  assert.match(html, /受注動態（大手50社）/);
  assert.match(html, /必要な統計項目だけを取り出す/);
  assert.match(html, /統計表レジストリ/);
  assert.match(html, /分類条件を指定/);
  assert.match(html, /表・グラフ・CSV/);
  assert.match(html, /よく使う項目/);
  assert.match(html, /お気に入りとして保存/);
  assert.match(html, /左右2軸、軸の最小・最大・目盛間隔/);
  assert.match(html, /CSV出力/);
  assert.match(html, /e-Stat DB\/API 主系/);
  assert.doesNotMatch(html, /シート|数値セルをクリック/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
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
