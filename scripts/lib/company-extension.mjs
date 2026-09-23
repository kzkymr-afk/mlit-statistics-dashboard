import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

import { writeReportBundle } from "./statistics-report-bundle.mjs";

// 社内図表のローカル拡張。公開リポジトリには社内データも社内の配置も持たせず、
// 利用者の端末の .env.local（Git・Pages・Release対象外）に
// ATLAS_COMPANY_EXTENSION=<拡張モジュールのパス> がある場合だけ読み込む。
const ROOT = resolve(import.meta.dirname, "../..");
export const COMPANY_OUTPUT_ROOT = "outputs/ai/company-annual-report";

export function companyExtensionPath() {
  let configured = process.env.ATLAS_COMPANY_EXTENSION;
  if (configured === undefined) {
    const envPath = resolve(ROOT, ".env.local");
    if (existsSync(envPath)) {
      configured = parseEnv(readFileSync(envPath, "utf8")).ATLAS_COMPANY_EXTENSION;
    }
  }
  if (!configured) return null;
  return isAbsolute(configured) ? configured : resolve(ROOT, configured);
}

export async function loadCompanyExtension() {
  const modulePath = companyExtensionPath();
  if (!modulePath) return null;
  if (!existsSync(modulePath)) {
    throw new Error(`ATLAS_COMPANY_EXTENSIONのファイルがありません: ${modulePath}`);
  }
  const extensionModule = await import(pathToFileURL(modulePath).href);
  if (typeof extensionModule.createCompanyChartsExtension !== "function") {
    throw new Error("社内図表拡張はcreateCompanyChartsExtensionを公開してください。");
  }
  return extensionModule.createCompanyChartsExtension({ writeReportBundle });
}

export async function requireCompanyExtension() {
  const extension = await loadCompanyExtension();
  if (!extension) {
    throw new Error(
      "社内図表の拡張が設定されていません。.env.localにATLAS_COMPANY_EXTENSIONを設定した端末だけで使えます。",
    );
  }
  return extension;
}

// 社内図表の出力はGit・Pages対象外のoutputs/ai/company-annual-report/<name>以下に限定する。
export function safeCompanyOutputPath(rawPath) {
  const outputPath = resolve(ROOT, rawPath);
  const allowedRoot = resolve(ROOT, COMPANY_OUTPUT_ROOT);
  const relativePath = relative(allowedRoot, outputPath);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`社内図表の出力先は${COMPANY_OUTPUT_ROOT}/<name>以下に限定します。`);
  }
  return outputPath;
}
