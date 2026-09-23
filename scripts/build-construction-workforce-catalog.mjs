// 「日本の建設技能労働者に関する公的データセット」（公的統計の抽出CSV一式）から、
// e-Stat DB/APIで取れない系列だけを収集台帳 data/catalogs/construction-workforce.json へ写す。
//
//   node scripts/build-construction-workforce-catalog.mjs --source <データセットのフォルダ>
//
// 取り込む系列（ファイル取り込み）:
//   03 毎月勤労統計 年分結果確報（建設業・2020～2025年）… e-Stat DB表は2021年10月で更新停止
//   04 賃金構造基本統計調査 職種（小分類）2025年      … e-Stat DB表は2023年まで
//   06 公共工事設計労務単価 全国全職種平均値           … 統計表ではなく積算単価の公表資料
//   02 労働力調査年報 I-B-5 の年齢階級別構成比（2025年）… DB表は実数のみ
// 照合用に保持する系列（公開系列にはしない）:
//   01 労働力調査年報 I-B-8（各年の年報公表値）… 公開系列はe-Stat DB表0003024266から同期する
// 取り込まない:
//   05 建設労働需給調査 … 既存のconstruction-labor（e-Stat掲載Excel）に全職種・全月がある
//   07 最新値の抜粋 … 他CSVの抜粋なので二重計上になる
//
// 台帳には公式URL・公表日・値だけを書き、データセットのローカルパスは書かない。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseCsvRows } from "./lib/estat-normalize.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const CATALOG_PATH = resolve(ROOT, "data/catalogs/construction-workforce.json");
const sourceIndex = process.argv.indexOf("--source");
if (sourceIndex < 0 || !process.argv[sourceIndex + 1]) {
  throw new Error("--source <データセットのフォルダ> を指定してください。");
}
const SOURCE_DIR = resolve(process.argv[sourceIndex + 1]);

const fileHashes = {};

function readCsv(name) {
  const bytes = readFileSync(resolve(SOURCE_DIR, "data", name));
  fileHashes[name] = createHash("sha256").update(bytes).digest("hex");
  const [header, ...rows] = parseCsvRows(bytes.toString("utf8")).filter(
    (row) => row.some((field) => field !== ""),
  );
  return rows.map((row) =>
    Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function numberOrNull(value) {
  if (value === "") return null;
  const parsed = Number(value);
  assert(Number.isFinite(parsed), `数値でない値です: ${value}`);
  return parsed;
}

function unique(rows, key) {
  const values = [...new Set(rows.map((row) => row[key]))];
  assert(values.length === 1, `${key}が複数あります: ${values.join(" / ")}`);
  return values[0];
}

const workforce = readCsv("01_workforce_time_series.csv");
const age = readCsv("02_age_distribution_2025.csv");
const monthly = readCsv("03_wages_hours_annual_2020_2025.csv");
const wages = readCsv("04_occupation_wages_2025.csv");
const rates = readCsv("06_public_works_design_labour_rate.csv");

for (const [name, rows, expected] of [
  ["01", workforce, 126],
  ["02", age, 66],
  ["03", monthly, 78],
  ["04", wages, 72],
  ["06", rates, 8],
]) {
  assert(rows.length === expected, `${name}の行数が${rows.length}です（${expected}行を想定）`);
  assert(
    rows.every(
      (row) =>
        row.verification_status === "verified_against_official_table" ||
        // 原表の記号「-」を空欄にした行。値は持たず、欠測として取り込む。
        (row.verification_status === "not_available_source_symbol_dash" && row.value === ""),
    ),
    `${name}に公式原表と未照合の行があります。`,
  );
}

const catalog = {
  schemaVersion: 1,
  title: "建設技能労働者・労働条件（公的統計のファイル取り込み）",
  sourcePackage: {
    title: "日本の建設技能労働者に関する公的データセット",
    referenceDate: "2026-09-23",
    files: fileHashes,
  },
  labourForceAnnualReport: {
    statisticsName: "労働力調査年報 I-B-8 職業，産業別就業者数",
    purpose:
      "照合用。公開系列はe-Stat DB表0003024266から同期し、この年報値は派生系列の注記と検証にだけ使う。",
    rows: workforce
      .filter((row) => row.derivation === "原表値")
      .map((row) => ({
        year: Number(row.reference_period),
        sex: row.sex,
        occupation: row.occupation,
        value: numberOrNull(row.value),
        unit: row.unit,
        sourceUrl: row.source_url,
        publicationDate: row.publication_date || null,
      })),
  },
  ageShare: {
    statisticsName: "労働力調査年報 I-B-5 年齢階級，産業別就業者数（実数及び構成比）",
    sourceUrl: unique(age, "source_url"),
    publicationDate: unique(age, "publication_date"),
    year: Number(unique(age, "reference_period")),
    rows: age
      .filter((row) => row.unit === "%")
      .map((row) => ({
        sex: row.sex,
        ageClass: row.series_id.split("_").at(-1),
        value: numberOrNull(row.value),
        sourceSymbol:
          row.verification_status === "not_available_source_symbol_dash" ? "-" : null,
      })),
  },
  monthlyLabour: {
    statisticsName: unique(monthly, "statistics_name"),
    rows: monthly.map((row) => ({
      year: Number(row.reference_period),
      indicator: row.indicator,
      unit: row.unit,
      value: numberOrNull(row.value),
      sourceTable: row.source_table_page,
      sourceUrl: row.source_url,
      publicationDate: row.publication_date || null,
    })),
  },
  occupationWages: {
    statisticsName: unique(wages, "statistics_name"),
    sourceTable: unique(wages, "source_table_page"),
    sourceUrl: unique(wages, "source_url"),
    publicationDate: unique(wages, "publication_date"),
    rows: wages.map((row) => ({
      occupation: row.occupation,
      indicator: row.indicator,
      unit: row.unit,
      referencePeriod: row.reference_period,
      value: numberOrNull(row.value),
    })),
  },
  designLabourRate: {
    statisticsName: unique(rates, "statistics_name"),
    sourceTable: unique(rates, "source_table_page"),
    sourceUrl: unique(rates, "source_url"),
    priceBasis: unique(rates, "price_basis"),
    rows: rates.map((row) => ({
      effectiveFrom: row.reference_period,
      value: numberOrNull(row.value),
      unit: row.unit,
      publicationDate: row.publication_date || null,
    })),
  },
};

assert(catalog.ageShare.rows.length === 33, "年齢構成比は33行を想定しています。");
assert(
  catalog.designLabourRate.rows.every((row) => /^\d{4}-03$/.test(row.effectiveFrom)),
  "設計労務単価は各年3月適用を想定しています。",
);

writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
process.stdout.write(`construction workforce catalog: ${CATALOG_PATH}\n`);
