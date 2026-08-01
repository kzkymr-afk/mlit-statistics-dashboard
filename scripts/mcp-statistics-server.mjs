#!/usr/bin/env node

import { relative, resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  DEFAULT_DATABASE_PATH,
  StatisticsQueryEngine,
} from "./lib/statistics-query.mjs";
import { writeReportBundle } from "./lib/statistics-report-bundle.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const databasePath = resolve(
  ROOT,
  process.env.MLIT_SYSTEM_DATABASE_PATH || DEFAULT_DATABASE_PATH,
);
const engine = new StatisticsQueryEngine(databasePath);

const server = new McpServer(
  { name: "mlit-construction-statistics", version: "1.0.0" },
  {
    instructions:
      "国交省・e-Stat・日建連の正規化済み建設統計です。最初にsearch_statistical_tables、次にget_table_schemaで公式分類コードを確認し、query_statisticsで取得してください。数値を報告するときは必ずtableId、分類コード、期間、sourceUrlを保持します。グラフや表の資料一式にはcreate_report_bundleを使います。",
  },
);

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

function result(value, summary) {
  return {
    content: [
      {
        type: "text",
        text: summary ? `${summary}\n${JSON.stringify(value)}` : JSON.stringify(value),
      },
    ],
    structuredContent: value,
  };
}

function safeOutputPath(rawPath) {
  const outputPath = resolve(ROOT, rawPath || `outputs/ai/${Date.now()}`);
  const relativePath = relative(ROOT, outputPath);
  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error("outputDirectoryはこのアプリのプロジェクト内を指定してください。");
  }
  return outputPath;
}

server.registerTool(
  "list_statistical_datasets",
  {
    title: "建設統計データセット一覧",
    description:
      "収録済みの国交省・e-Stat・日建連データセットと統計表数を一覧します。分析テーマの入口を探すときに使います。",
    inputSchema: {},
    annotations: readOnlyAnnotations,
  },
  async () => {
    const value = { schemaVersion: "1.0", datasets: engine.listDatasets() };
    return result(value, `${value.datasets.length}データセットを収録しています。`);
  },
);

server.registerTool(
  "search_statistical_tables",
  {
    title: "統計表を検索",
    description:
      "自然語、統計名、統計表IDで収録済み統計表を検索します。分類項目を探す前に使用してください。",
    inputSchema: {
      query: z.string().optional().describe("例: 着工 床面積、受注 民間"),
      datasetId: z.string().optional().describe("データセットIDで絞り込み"),
      cycle: z
        .enum(["年度次", "年次", "月次", "四半期"])
        .optional()
        .describe("周期で絞り込み"),
      limit: z.number().int().min(1).max(200).optional(),
    },
    annotations: readOnlyAnnotations,
  },
  async (input) => {
    const tables = engine.searchTables(input);
    return result(
      { schemaVersion: "1.0", tables },
      `${tables.length}件の統計表が見つかりました。`,
    );
  },
);

server.registerTool(
  "get_table_schema",
  {
    title: "統計表の分類コードを取得",
    description:
      "統計表の全分類キーと公式コード・名称を取得します。値が多い分類はdimensionとvalueSearchで絞れます。query_statisticsの前に使用してください。",
    inputSchema: {
      tableId: z.string().min(1).describe("統計表ID"),
      dimension: z.string().optional().describe("tab、area、cat01、timeなど"),
      valueSearch: z.string().optional().describe("分類値のコードまたは名称"),
      limit: z.number().int().min(1).max(2000).optional(),
    },
    annotations: readOnlyAnnotations,
  },
  async (input) => {
    const schema = engine.getTableSchema(input);
    return result(
      schema,
      `${schema.table.title}の分類コードです。time以外の全分類を指定してください。`,
    );
  },
);

server.registerTool(
  "query_statistics",
  {
    title: "建設統計系列を取得",
    description:
      "統計表IDと公式分類条件から1系列を取得します。暗黙ゼロを復元し、期間名、注記、出典URLを一緒に返します。",
    inputSchema: {
      tableId: z.string().min(1),
      selections: z
        .record(z.string(), z.string())
        .describe("time以外の全分類。例: {tab: 'building-total', cat01: '1'}"),
      from: z.string().optional().describe("時間コード、期間名、または4桁年"),
      to: z.string().optional().describe("時間コード、期間名、または4桁年"),
      label: z.string().optional().describe("出力で使う系列名"),
    },
    annotations: readOnlyAnnotations,
  },
  async (input) => {
    const value = engine.querySeries(input);
    return result(
      value,
      `${value.series.label}: ${value.observations.length}時点を取得しました。`,
    );
  },
);

server.registerTool(
  "create_report_bundle",
  {
    title: "表・グラフ・出典パッケージを作成",
    description:
      "複数の統計系列と任意の社内・他社データから、SVGグラフ、横持ち/縦持ちCSV、JSON、出典、再生成定義を一括作成します。折れ線/棒、左右2軸、軸の最小・最大・目盛間隔を指定できます。",
    inputSchema: {
      spec: z
        .record(z.string(), z.unknown())
        .describe(
          "title、series、customSeries、axesを含む定義。series各要素はtableId/selections/chartKind/axis、customSeriesはlabel/unit/values/sourceを指定。",
        ),
      outputDirectory: z
        .string()
        .optional()
        .describe("プロジェクトルートからの相対パス。既定はoutputs/ai/<timestamp>"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async ({ spec, outputDirectory }) => {
    const value = writeReportBundle(engine, spec, safeOutputPath(outputDirectory));
    return result(
      value,
      `${value.seriesCount}系列・${value.observationCount}観測値の資料一式を作成しました。`,
    );
  },
);

async function shutdown() {
  engine.close();
  await server.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.once("exit", () => {
  try {
    engine.close();
  } catch {
    // 既にclose済み。
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
