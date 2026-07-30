import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("建築着工統計の年度データ画面をサーバーレンダリングする", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /建築着工統計・年度データ/);
  assert.match(html, /必要な表を開いて/);
  assert.match(html, /2013–2025年度/);
  assert.match(html, /折れ線／棒、左軸／右軸/);
  assert.match(html, /CSV出力/);
  assert.match(html, /e-Statの公式一覧を開く/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
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
