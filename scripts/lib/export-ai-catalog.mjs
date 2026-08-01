import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

export function exportAiCatalog(systemDirectory) {
  const outputDirectory = resolve(systemDirectory);
  const catalogPath = resolve(outputDirectory, "catalog.json");
  if (!existsSync(catalogPath)) {
    throw new Error(`公開カタログがありません: ${catalogPath}`);
  }
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const buildDirectory = resolve(outputDirectory, "ai.building");
  const aiDirectory = resolve(outputDirectory, "ai");
  if (existsSync(buildDirectory)) rmSync(buildDirectory, { recursive: true });
  mkdirSync(resolve(buildDirectory, "tables"), { recursive: true });

  const tableIndex = [];
  for (const table of catalog.tables) {
    const relativeMetaPath = String(table.metaUrl).replace(/^\/?system\//, "");
    const compressedMetaPath = resolve(outputDirectory, relativeMetaPath);
    if (!existsSync(compressedMetaPath)) {
      throw new Error(`統計表メタ情報がありません: ${compressedMetaPath}`);
    }
    const meta = JSON.parse(gunzipSync(readFileSync(compressedMetaPath)).toString("utf8"));
    const aiMetaPath = `tables/${table.id}.json`;
    writeJson(resolve(buildDirectory, aiMetaPath), {
      schemaVersion: "1.0",
      table: meta.table,
      dimensions: meta.dimensions,
      suggestedSelection: meta.defaultSelection,
      seriesAccess: {
        identity:
          "SHA-256(tableId + U+001F + sorted(apiKey=value).join(U+001F)).slice(0, 32)",
        bundlePrefixLength: meta.seriesBundlePrefixLength,
        bundleUrlTemplate: meta.seriesBundleUrlTemplate,
        compactTuple:
          "[unit, timeMask, points]; point=[timeCode,numericValue,nonNumericValue,annotation,exceptionalStatus]",
        implicitNumericZero: meta.implicitNumericZero,
        timeMask:
          "時間コード昇順のbit位置。bit=1でpoint行が無い場合は公表値0。bit=0は欠測または未公表。",
      },
    });
    tableIndex.push({
      ...table,
      aiMetaUrl: `system/ai/${aiMetaPath}`,
    });
  }

  writeJson(resolve(buildDirectory, "catalog.json"), {
    schemaVersion: "1.0",
    generatedAt: catalog.generatedAt,
    title: "建設統計 AIアクセスカタログ",
    description:
      "国交省e-Stat・公式Excel・日建連を同一の分類コード体系で検索するための機械可読カタログ。",
    workflow: [
      "catalog.jsonでdataset/tableを検索",
      "table.aiMetaUrlで分類コードとsuggestedSelectionを確認",
      "ローカル環境ではMCPまたはnpm run ai:statsを優先",
      "数値引用時はtableId・分類コード・期間・単位・sourceUrlを保持",
    ],
    localTools: {
      mcp: "mlit-statistics",
      cli: "npm run ai:stats -- help",
      guide: "docs/AI_ANALYSIS_GUIDE.md",
    },
    datasets: catalog.datasets,
    tables: tableIndex,
    sources: catalog.sources,
  });
  if (existsSync(aiDirectory)) rmSync(aiDirectory, { recursive: true });
  renameSync(buildDirectory, aiDirectory);
  return {
    outputDirectory: aiDirectory,
    datasetCount: catalog.datasets.length,
    tableCount: tableIndex.length,
  };
}
