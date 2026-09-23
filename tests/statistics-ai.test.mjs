import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  buildValueLookup,
  normalizeObservation,
  seriesLabel,
} from "../scripts/lib/estat-normalize.mjs";
import { companyExtensionPath } from "../scripts/lib/company-extension.mjs";
import { StatisticsQueryEngine } from "../scripts/lib/statistics-query.mjs";
import { writeReportBundle } from "../scripts/lib/statistics-report-bundle.mjs";
import {
  finalizeTable,
  makeObservationWriter,
  openStatisticsDatabase,
  replaceDimensions,
  upsertDataset,
  upsertObservationSource,
  upsertStatisticalTable,
} from "../scripts/lib/statistics-system-db.mjs";

function createFixture(directory) {
  const databasePath = resolve(directory, "statistics.sqlite");
  const db = openStatisticsDatabase(databasePath);
  const tableId = "ai-fixture-table";
  const dimensions = [
    {
      id: `${tableId}:tab`,
      tableId,
      apiKey: "tab",
      name: "表章項目",
      description: "",
      sortOrder: 0,
      values: [
        {
          code: "amount",
          name: "受注高",
          level: 1,
          parentCode: "",
          unit: "百万円",
          sortOrder: 0,
        },
      ],
    },
    {
      id: `${tableId}:area`,
      tableId,
      apiKey: "area",
      name: "地域",
      description: "",
      sortOrder: 1,
      values: [
        {
          code: "00",
          name: "全国",
          level: 1,
          parentCode: "",
          unit: "",
          sortOrder: 0,
        },
      ],
    },
    {
      id: `${tableId}:time`,
      tableId,
      apiKey: "time",
      name: "年度",
      description: "",
      sortOrder: 2,
      values: ["2022", "2023", "2024"].map((year, index) => ({
        code: `${year}100000`,
        name: `${year}年度`,
        level: 1,
        parentCode: "",
        unit: "",
        sortOrder: index,
      })),
    },
  ];
  upsertDataset(db, {
    id: "ai-fixture",
    title: "AIテスト統計",
    governmentStatisticsCode: "test",
    providedStatisticsId: null,
    sourceUrl: "https://example.com/dataset",
    fiscalYearFrom: 2022,
  });
  upsertStatisticalTable(
    db,
    "ai-fixture",
    {
      id: tableId,
      title: "全国受注高",
      statisticsName: "AIテスト統計",
      cycle: "年度次",
      surveyDate: "2024",
      openDate: "2025-04-01",
      updatedDate: "2025-04-01",
      overallTotalNumber: 3,
    },
    "2026-08-01T00:00:00Z",
    {
      sourceKind: "test",
      sourceUrl: "https://example.com/table",
      registryStatus: "ready",
    },
  );
  replaceDimensions(db, tableId, dimensions);
  upsertObservationSource(db, {
    id: "source:test",
    tableId,
    sourceUrl: "https://example.com/source",
    publishedAt: "2025-04-01",
    retrievedAt: "2026-08-01T00:00:00Z",
    sourceKind: "test",
  });
  const lookup = buildValueLookup(dimensions);
  const write = makeObservationWriter(db, {
    tableId,
    dimensions,
    sourceId: "source:test",
    fetchedAt: "2026-08-01T00:00:00Z",
    timeCodes: dimensions[2].values.map((item) => item.code),
    seriesLabel: (coordinates) => seriesLabel(coordinates, lookup),
  });
  write(
    [
      ["2022100000", "100", ""],
      ["2023100000", "0", ""],
      ["2024100000", "-", "未公表"],
    ].map(([timeCode, value, annotation]) => ({
      ...normalizeObservation(
        {
          "@tab": "amount",
          "@area": "00",
          "@time": timeCode,
          "@unit": "百万円",
          "@annotation": annotation,
          $: value,
        },
        tableId,
      ),
      sourceId: "source:test",
    })),
  );
  write.finish();
  finalizeTable(db, tableId, dimensions[2].values.map((item) => item.code));
  db.close();
  return { databasePath, tableId };
}

test("AIクエリは分類名を解決し、公表0と欠測を区別して出典を返す", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "mlit-ai-query-"));
  try {
    const { databasePath, tableId } = createFixture(directory);
    const engine = new StatisticsQueryEngine(databasePath);
    assert.equal(engine.searchTables({ query: "全国 受注" }).length, 1);
    const schema = engine.getTableSchema({ tableId });
    assert.deepEqual(schema.suggestedSelection, { tab: "amount", area: "00" });
    const result = engine.querySeries({
      tableId,
      selections: { tab: "受注高", area: "全国" },
      from: "2022",
      to: "2024",
    });
    assert.equal(result.observations.length, 3);
    assert.equal(result.observations[1].numericValue, 0);
    assert.equal(result.observations[1].implicitNumericZero, true);
    assert.equal(result.observations[2].status, "missing");
    assert.equal(result.observations[2].annotation, "未公表");
    assert.equal(result.sources[0].sourceUrl, "https://example.com/source");

    const outputDirectory = resolve(directory, "bundle");
    const bundle = writeReportBundle(
      engine,
      {
        title: "AIテスト",
        series: [
          {
            tableId,
            selections: { tab: "amount", area: "00" },
            chartKind: "bar",
            axis: "left",
          },
        ],
        axes: { left: { min: 0, max: 200, step: 50 } },
      },
      outputDirectory,
    );
    assert.equal(bundle.seriesCount, 1);
    assert.match(readFileSync(resolve(outputDirectory, "chart.svg"), "utf8"), /AIテスト/);
    assert.match(
      readFileSync(resolve(outputDirectory, "provenance.json"), "utf8"),
      /https:\/\/example\.com\/source/,
    );
    engine.close();
  } finally {
    rmSync(directory, { recursive: true });
  }
});

const ROOT = resolve(import.meta.dirname, "..");

test("MCPは検索・分類・取得・資料作成の5ツールを公開する", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "mlit-ai-mcp-"));
  let client;
  try {
    const { databasePath, tableId } = createFixture(directory);
    const transport = new StdioClientTransport({
      command: "node",
      args: ["scripts/mcp-statistics-server.mjs"],
      cwd: resolve(import.meta.dirname, ".."),
      env: {
        ...process.env,
        MLIT_SYSTEM_DATABASE_PATH: databasePath,
        ATLAS_COMPANY_EXTENSION: "",
      },
      stderr: "pipe",
    });
    client = new Client({ name: "statistics-ai-test", version: "1.0.0" });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((item) => item.name),
      [
        "list_statistical_datasets",
        "search_statistical_tables",
        "get_table_schema",
        "query_statistics",
        "create_report_bundle",
      ],
    );
    const queried = await client.callTool({
      name: "query_statistics",
      arguments: {
        tableId,
        selections: { tab: "amount", area: "00" },
        from: "2022",
        to: "2023",
      },
    });
    assert.equal(queried.structuredContent.observations.length, 2);
    assert.equal(queried.structuredContent.observations[1].numericValue, 0);
  } finally {
    await client?.close();
    rmSync(directory, { recursive: true });
  }
});

// 社内図表はローカル拡張がある端末だけの機能。公開リポジトリのテストは値を持たず、
// 拡張の有無による公開・非公開の切り替えと出力先の制限だけを確かめる。
test(
  "社内図表の拡張がある端末ではMCPに社内図表ツールを追加する",
  { skip: companyExtensionPath() ? false : "社内図表の拡張が未設定" },
  async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "mlit-ai-mcp-company-"));
    let client;
    try {
      const { databasePath } = createFixture(directory);
      const transport = new StdioClientTransport({
        command: "node",
        args: ["scripts/mcp-statistics-server.mjs"],
        cwd: ROOT,
        env: { ...process.env, MLIT_SYSTEM_DATABASE_PATH: databasePath },
        stderr: "pipe",
      });
      client = new Client({ name: "statistics-ai-test", version: "1.0.0" });
      await client.connect(transport);
      const tools = await client.listTools();
      assert.equal(tools.tools.at(-1).name, "company_annual_report_figures");
      const listed = await client.callTool({
        name: "company_annual_report_figures",
        arguments: { action: "list" },
      });
      assert.ok(Array.isArray(listed.structuredContent.items));
      assert.ok(listed.structuredContent.items.length > 0);
    } finally {
      await client?.close();
      rmSync(directory, { recursive: true });
    }
  },
);

test("社内図表CLIは拡張が無い環境では明示的に停止する", () => {
  const result = spawnSync(
    "node",
    ["scripts/statistics-ai.mjs", "company-charts", "list"],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, ATLAS_COMPANY_EXTENSION: "" },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ATLAS_COMPANY_EXTENSION/);
});

test("社内図表CLIはpublicなど許可外の出力先を拒否する", () => {
  for (const out of ["public/company-chart", "outputs/ai/company-annual-report"]) {
    const result = spawnSync(
      "node",
      [
        "scripts/statistics-ai.mjs",
        "company-charts",
        "generate",
        "--id",
        "any",
        "--out",
        out,
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /outputs\/ai\/company-annual-report/);
  }
});
