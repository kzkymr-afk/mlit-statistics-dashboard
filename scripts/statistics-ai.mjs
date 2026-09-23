#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import {
  DEFAULT_DATABASE_PATH,
  StatisticsQueryEngine,
} from "./lib/statistics-query.mjs";
import { writeReportBundle } from "./lib/statistics-report-bundle.mjs";
import {
  COMPANY_OUTPUT_ROOT,
  requireCompanyExtension,
  safeCompanyOutputPath,
} from "./lib/company-extension.mjs";

const ROOT = resolve(import.meta.dirname, "..");

function parseArguments(input) {
  const parsed = { _: [], select: [] };
  for (let index = 0; index < input.length; index += 1) {
    const token = input[index];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === "help") {
      parsed.help = true;
      continue;
    }
    const value = input[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`--${key} の値がありません。`);
    }
    index += 1;
    if (key === "select") parsed.select.push(value);
    else parsed[key] = value;
  }
  return parsed;
}

function selectionsFrom(arguments_) {
  if (arguments_.selections) {
    const parsed = JSON.parse(arguments_.selections);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("--selections はJSONオブジェクトで指定してください。");
    }
    return parsed;
  }
  return Object.fromEntries(
    arguments_.select.map((entry) => {
      const separator = entry.indexOf("=");
      if (separator <= 0) {
        throw new Error(`--select は key=value で指定してください: ${entry}`);
      }
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
}

function safeOutputPath(rawPath) {
  const outputPath = resolve(ROOT, rawPath || `outputs/ai/${Date.now()}`);
  const relativePath = relative(ROOT, outputPath);
  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error(
      `出力先はプロジェクト内のフォルダを指定してください: ${outputPath}`,
    );
  }
  return outputPath;
}

// 社内図表はローカル拡張（.env.localのATLAS_COMPANY_EXTENSION）がある端末だけで使う。
async function runCompanyCharts(arguments_, openEngine) {
  const action = arguments_._[1];
  const actions = ["list", "search", "describe", "data", "generate", "validate"];
  if (!actions.includes(action)) {
    throw new Error(`company-chartsは ${actions.join(" / ")} を指定してください。`);
  }
  if (["describe", "data", "generate"].includes(action) && !arguments_.id) {
    throw new Error(`company-charts ${action}には --id が必要です。`);
  }
  const outputDirectory =
    action === "generate"
      ? safeCompanyOutputPath(arguments_.out || `${COMPANY_OUTPUT_ROOT}/${arguments_.id}`)
      : null;
  const extension = await requireCompanyExtension();
  if (action === "list") printJson(extension.list());
  else if (action === "search") printJson(extension.search(arguments_.query));
  else if (action === "describe") printJson(extension.describe(arguments_.id));
  else if (action === "data") printJson(extension.data(arguments_.id));
  else if (action === "generate") {
    printJson(extension.generate(openEngine(), arguments_.id, outputDirectory, arguments_.artifact || "auto"));
  } else printJson(extension.validate(openEngine()));
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printQueryCsv(result) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    [
      "time_code",
      "time_label",
      "numeric_value",
      "raw_value",
      "unit",
      "annotation",
      "status",
      "source_id",
    ],
    ...result.observations.map((point) => [
      point.timeCode,
      point.timeLabel,
      point.numericValue ?? "",
      point.value ?? "",
      point.unit ?? "",
      point.annotation ?? "",
      point.status,
      point.sourceId ?? "",
    ]),
  ];
  process.stdout.write(
    `\uFEFF${rows.map((row) => row.map(escape).join(",")).join("\r\n")}\r\n`,
  );
}

function usage() {
  return `建設統計 AI CLI

Usage:
  npm run ai:stats -- datasets
  npm run ai:stats -- search --query "着工 床面積" [--dataset building-starts] [--cycle 年度次]
  npm run ai:stats -- schema --table 0003119773 [--dimension tab] [--value-search 床面積]
  npm run ai:stats -- query --table nikkenren-group-orders-annual \\
    --select tab=building-total --select cat01=1 --from 2013 --to 2025
  npm run ai:stats -- bundle --spec examples/ai-report-spec.json --out outputs/ai/nikkenren
  npm run ai:stats -- company-charts list      # 社内図表のローカル拡張がある端末のみ
  npm run ai:stats -- company-charts search --query "<語>"
  npm run ai:stats -- company-charts data --id <図表ID>
  npm run ai:stats -- company-charts generate --id <図表ID>

Options:
  --database <path>      SQLite DB（既定: data/database/mlit-statistics-system.sqlite）
  --limit <number>       検索・分類値の最大件数
  --format json|csv      queryの出力形式（既定: json）
  --selections '<json>'  --selectの代わりに分類条件をJSONで指定
`;
}

let engine;
try {
  const arguments_ = parseArguments(process.argv.slice(2));
  const command = arguments_._[0];
  if (!command || arguments_.help || command === "help") {
    process.stdout.write(usage());
    process.exit(0);
  }
  const databasePath = resolve(ROOT, arguments_.database || DEFAULT_DATABASE_PATH);
  if (command !== "company-charts") engine = new StatisticsQueryEngine(databasePath);
  if (command === "company-charts") {
    await runCompanyCharts(
      arguments_,
      () => (engine = new StatisticsQueryEngine(databasePath)),
    );
  } else if (command === "datasets") {
    printJson({ schemaVersion: "1.0", datasets: engine.listDatasets() });
  } else if (command === "search") {
    printJson({
      schemaVersion: "1.0",
      tables: engine.searchTables({
        query: arguments_.query,
        datasetId: arguments_.dataset,
        cycle: arguments_.cycle,
        limit: arguments_.limit,
      }),
    });
  } else if (command === "schema") {
    if (!arguments_.table) throw new Error("schemaには --table が必要です。");
    printJson(
      engine.getTableSchema({
        tableId: arguments_.table,
        dimension: arguments_.dimension,
        valueSearch: arguments_["value-search"],
        limit: arguments_.limit,
      }),
    );
  } else if (command === "query") {
    if (!arguments_.table) throw new Error("queryには --table が必要です。");
    const result = engine.querySeries({
      tableId: arguments_.table,
      selections: selectionsFrom(arguments_),
      from: arguments_.from,
      to: arguments_.to,
      label: arguments_.label,
    });
    if (arguments_.format === "csv") printQueryCsv(result);
    else printJson(result);
  } else if (command === "bundle") {
    if (!arguments_.spec) throw new Error("bundleには --spec が必要です。");
    const specPath = resolve(ROOT, arguments_.spec);
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    printJson(
      writeReportBundle(engine, spec, safeOutputPath(arguments_.out)),
    );
  } else {
    throw new Error(`不明なコマンドです: ${command}`);
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
} finally {
  engine?.close();
}
