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

test("住宅着工ダッシュボードをサーバーレンダリングする", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /住宅着工ダッシュボード/);
  assert.match(html, /必要な数字だけ/);
  assert.match(html, /最新データを取得/);
  assert.match(html, /CSV出力/);
  assert.match(html, /都道府県別ランキング/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("保存済みデータに公式出典と47都道府県を保持する", async () => {
  const raw = await readFile(
    new URL("../data/official-snapshot.json", import.meta.url),
    "utf8",
  );
  const data = JSON.parse(raw);
  assert.equal(data.metadata.organization, "国土交通省");
  assert.match(data.metadata.sourceList, /^https:\/\/www\.e-stat\.go\.jp\//);
  assert.ok(data.monthly.length >= 60);
  assert.equal(data.prefectures.length, 47);
  assert.match(data.metadata.surveyPeriod, /^\d{4}-\d{2}$/);
});
