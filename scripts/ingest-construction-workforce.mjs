// 建設技能労働者・労働条件の系列を正規化DBへ登録する。
//
// - labour-force-survey（e-Stat DB同期済み）に、派生系列「建設技能者（3職業大分類合計）」と
//   年報I-B-5の年齢階級別構成比（2025年）をファイル取り込みの表として加える。
//   派生系列はDB表0003024266の同期値から計算するため、先に
//   `npm run sync:estat-api -- --resume --dataset labour-force-survey` が必要。
// - 毎月勤労統計（建設業・年平均）、賃金構造基本統計（職種別2025年）、
//   公共工事設計労務単価を、それぞれ独立したデータセットとして登録する。
//
// 値は data/catalogs/construction-workforce.json（公式URL・公表日つき）から読む。
// 空欄は欠測（missing）として保存し、0に置き換えない。
import { createHash, randomUUID } from "node:crypto";
import {
  constants as fsConstants,
  copyFileSync,
  existsSync,
  linkSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { relative, resolve } from "node:path";

import {
  buildValueLookup,
  normalizeObservation,
  seriesIdFor,
  seriesLabel,
} from "./lib/estat-normalize.mjs";
import {
  finalizeTable,
  makeObservationWriter,
  openStatisticsDatabase,
  replaceDimensions,
  upsertDataset,
  upsertObservationSource,
  upsertStatisticalTable,
} from "./lib/statistics-system-db.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DATABASE_PATH = resolve(
  ROOT,
  process.env.MLIT_SYSTEM_DATABASE_PATH ??
    "data/database/mlit-statistics-system.sqlite",
);
const BUILD_PATH = `${DATABASE_PATH}.workforce-building`;
const CATALOG_PATH = resolve(ROOT, "data/catalogs/construction-workforce.json");
const LFS_DATASET_ID = "labour-force-survey";
const LFS_OCCUPATION_TABLE_ID = "0003024266";
const FILE_TABLE_PREFIX = "file-";

if (!existsSync(DATABASE_PATH)) {
  throw new Error(`正規化DBがありません: ${DATABASE_PATH}`);
}

const catalogBytes = readFileSync(CATALOG_PATH);
const catalog = JSON.parse(catalogBytes);
const catalogSha256 = createHash("sha256").update(catalogBytes).digest("hex");
const fetchedAt = new Date().toISOString();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const yearCode = (year) => `${year}000000`;
const SEX_CODES = [
  { code: "0", name: "総数", catalogName: "男女計" },
  { code: "1", name: "男", catalogName: "男" },
  { code: "2", name: "女", catalogName: "女" },
];

// e-Stat DB表0003007108（年齢階級，産業別就業者数）の年齢階級コード
const AGE_CODES = {
  "15～19歳": "02",
  "20～24歳": "05",
  "25～29歳": "07",
  "30～34歳": "08",
  "35～39歳": "10",
  "40～44歳": "11",
  "45～49歳": "13",
  "50～54歳": "14",
  "55～59歳": "16",
  "60～64歳": "17",
  "65歳以上": "18",
};

// e-Stat DB表0003426315（賃金構造基本統計 一般_職種（小分類））の公式コード
const WAGE_MEASURES = [
  { code: "01", indicator: "平均年齢", name: "年齢" },
  { code: "02", indicator: "平均勤続年数", name: "勤続年数" },
  { code: "04", indicator: "所定内実労働時間数", name: "所定内実労働時間数" },
  { code: "06", indicator: "超過実労働時間数", name: "超過実労働時間数" },
  { code: "08", indicator: "きまって支給する現金給与額", name: "きまって支給する現金給与額" },
  { code: "10", indicator: "所定内給与額", name: "所定内給与額" },
  { code: "12", indicator: "年間賞与その他特別給与額", name: "年間賞与その他特別給与額（2024年1～12月）" },
  { code: "13", indicator: "賃構表中労働者数", name: "労働者数（調査対象範囲の表章値）" },
];
const WAGE_OCCUPATIONS = [
  { code: "1091", name: "建築技術者" },
  { code: "1092", name: "土木技術者" },
  { code: "1093", name: "測量技術者" },
  { code: "1651", name: "建設躯体工事従事者" },
  { code: "1661", name: "大工" },
  { code: "1666", name: "配管従事者" },
  { code: "1669", name: "その他の建設従事者" },
  { code: "1671", name: "電気工事従事者" },
  { code: "1681", name: "土木従事者，鉄道線路工事従事者" },
];

const MONTHLY_INDICATORS = [
  "現金給与総額",
  "きまって支給する給与",
  "所定内給与",
  "所定外給与",
  "特別に支払われた給与",
  "総実労働時間",
  "所定内労働時間",
  "所定外労働時間",
  "出勤日数",
  "常用労働者数（毎月勤労統計）",
  "パートタイム労働者比率",
  "入職率",
  "離職率",
];

function dimension(tableId, apiKey, name, description, sortOrder, values) {
  return {
    id: `${tableId}:${apiKey}`,
    tableId,
    apiKey,
    name,
    description,
    sortOrder,
    values: values.map((value, index) => ({
      code: value.code,
      name: value.name,
      level: 1,
      parentCode: "",
      unit: value.unit ?? "",
      sortOrder: index,
    })),
  };
}

function observation(tableId, coordinates, { value, unit, annotation }) {
  const prefixed = Object.fromEntries(
    Object.entries(coordinates).map(([key, code]) => [`@${key}`, code]),
  );
  return normalizeObservation(
    {
      ...prefixed,
      "@unit": unit,
      "@annotation": annotation ?? "",
      $: value === null || value === undefined ? "" : String(value),
    },
    tableId,
  );
}

function clearTables(db, tableIds) {
  db.exec("BEGIN");
  try {
    for (const tableId of tableIds) {
      db.prepare(
        `DELETE FROM observations WHERE series_id IN
           (SELECT id FROM series WHERE table_id = ?)`,
      ).run(tableId);
      db.prepare(
        `DELETE FROM series_dimensions WHERE series_id IN
           (SELECT id FROM series WHERE table_id = ?)`,
      ).run(tableId);
      db.prepare("DELETE FROM series WHERE table_id = ?").run(tableId);
      db.prepare("DELETE FROM observation_sources WHERE table_id = ?").run(tableId);
      db.prepare(
        `DELETE FROM dimension_values WHERE dimension_id IN
           (SELECT id FROM dimensions WHERE table_id = ?)`,
      ).run(tableId);
      db.prepare("DELETE FROM dimensions WHERE table_id = ?").run(tableId);
      db.prepare("DELETE FROM concept_mappings WHERE table_id = ?").run(tableId);
      db.prepare("DELETE FROM statistical_tables WHERE id = ?").run(tableId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function writeTable(db, spec) {
  upsertStatisticalTable(
    db,
    spec.datasetId,
    {
      id: spec.tableId,
      title: spec.title,
      statisticsName: spec.statisticsName,
      cycle: spec.cycle,
      surveyDate: spec.surveyDate,
      openDate: spec.openDate ?? "",
      updatedDate: "",
      overallTotalNumber: spec.observations.length,
    },
    fetchedAt,
    {
      sourceKind: spec.sourceKind,
      sourceUrl: spec.sourceUrl,
      registryStatus: "ready",
    },
  );
  replaceDimensions(db, spec.tableId, spec.dimensions);
  const sourceId = `${spec.sourceKind}:${spec.tableId}:${catalogSha256.slice(0, 12)}`;
  upsertObservationSource(db, {
    id: sourceId,
    tableId: spec.tableId,
    sourceUrl: spec.sourceUrl,
    publishedAt: spec.openDate || null,
    retrievedAt: fetchedAt,
    sourceKind: spec.sourceKind,
    localPath: relative(ROOT, CATALOG_PATH),
    sha256: catalogSha256,
  });
  const timeCodes = spec.dimensions
    .find((item) => item.apiKey === "time")
    .values.map((value) => value.code);
  const lookup = buildValueLookup(spec.dimensions);
  const write = makeObservationWriter(db, {
    tableId: spec.tableId,
    dimensions: spec.dimensions,
    sourceId,
    fetchedAt,
    timeCodes,
    seriesLabel: (coordinates) => seriesLabel(coordinates, lookup),
  });
  write(
    spec.observations.toSorted(
      (left, right) =>
        left.seriesId.localeCompare(right.seriesId) ||
        left.timeCode.localeCompare(right.timeCode),
    ),
  );
  write.finish();
  finalizeTable(db, spec.tableId, timeCodes);
  return spec.observations.length;
}

// --- 派生系列: 建設技能者（3職業大分類合計） -------------------------------

const SKILLED_OCCUPATIONS = [
  { code: "023", name: "生産工程" },
  { code: "031", name: "輸送・機械運転" },
  { code: "032", name: "建設・採掘" },
];

function readLfsOccupationValues(db) {
  const table = db
    .prepare(
      `SELECT registry_status AS status FROM statistical_tables WHERE id = ?`,
    )
    .get(LFS_OCCUPATION_TABLE_ID);
  assert(
    table?.status === "ready",
    `${LFS_OCCUPATION_TABLE_ID}が同期されていません。先に ` +
      "npm run sync:estat-api -- --resume --dataset labour-force-survey を実行してください。",
  );
  const fiscalYearFrom = db
    .prepare("SELECT fiscal_year_from AS year FROM datasets WHERE id = ?")
    .get(LFS_DATASET_ID).year;
  const maskTimeCodes = db
    .prepare(
      `SELECT dv.code FROM dimension_values dv
         JOIN dimensions d ON d.id = dv.dimension_id
        WHERE d.table_id = ? AND d.api_key = 'time'`,
    )
    .all(LFS_OCCUPATION_TABLE_ID)
    .map((row) => row.code)
    .filter((code) => Number(code.slice(0, 4)) >= fiscalYearFrom)
    .sort();
  const seriesStatement = db.prepare(
    `SELECT time_mask AS timeMask, time_mask_text AS timeMaskText
       FROM series WHERE id = ?`,
  );
  const observationStatement = db.prepare(
    `SELECT time_code AS timeCode, numeric_value AS numericValue, status
       FROM observations WHERE series_id = ?`,
  );
  const values = new Map();
  for (const sex of SEX_CODES) {
    for (const occupation of [{ code: "000" }, { code: "002" }, ...SKILLED_OCCUPATIONS]) {
      const seriesId = seriesIdFor(LFS_OCCUPATION_TABLE_ID, {
        tab: "01",
        area: "00000",
        cat01: sex.code,
        cat02: occupation.code,
        cat03: "02",
        cat04: "09",
        cat05: "00",
      });
      const series = seriesStatement.get(seriesId);
      assert(series, `建設業の職業別系列がありません: 性別${sex.code} 職業${occupation.code}`);
      const mask = series.timeMaskText
        ? BigInt(`0x${series.timeMaskText}`)
        : BigInt(series.timeMask);
      const stored = new Map(
        observationStatement.all(seriesId).map((row) => [row.timeCode, row]),
      );
      maskTimeCodes.forEach((timeCode, index) => {
        if ((mask & (1n << BigInt(index))) === 0n) return;
        const row = stored.get(timeCode);
        // 行が無くbitが立っている時点は公表値0（暗黙0）。欠測・秘匿は値を持たない。
        const value = row
          ? row.status === "confirmed_value"
            ? row.numericValue
            : null
          : 0;
        values.set(`${sex.code}|${occupation.code}|${timeCode}`, value);
      });
    }
  }
  return { values, timeCodes: maskTimeCodes };
}

function annualReportValue(year, sexName, occupation) {
  return (
    catalog.labourForceAnnualReport.rows.find(
      (row) =>
        row.year === year && row.sex === sexName && row.occupation === occupation,
    )?.value ?? null
  );
}

// 2022～2025年はDB値と年報I-B-8公表値が一致することを確かめる（違えば停止する）。
// 2019～2021年はベンチマーク人口切替えをはさみ一致しないため、派生系列の注記に年報値を残す。
function verifyAgainstAnnualReport(lfs) {
  const occupationCodes = {
    総数: "000",
    "専門的・技術的職業従事者": "002",
    生産工程従事者: "023",
    "輸送・機械運転従事者": "031",
    "建設・採掘従事者": "032",
  };
  const differences = [];
  for (const row of catalog.labourForceAnnualReport.rows) {
    const sex = SEX_CODES.find((item) => item.catalogName === row.sex);
    const dbValue = lfs.values.get(
      `${sex.code}|${occupationCodes[row.occupation]}|${yearCode(row.year)}`,
    );
    if (dbValue === row.value) continue;
    differences.push({ ...row, dbValue });
  }
  const unexpected = differences.filter((item) => item.year >= 2022);
  assert(
    unexpected.length === 0,
    `2022年以降のe-Stat DB値が年報I-B-8と一致しません: ${JSON.stringify(unexpected)}`,
  );
  return differences;
}

function skilledWorkersTable(lfs) {
  const tableId = `${FILE_TABLE_PREFIX}lfs-construction-skilled-3cat`;
  const years = lfs.timeCodes.map((code) => Number(code.slice(0, 4)));
  const observations = [];
  for (const sex of SEX_CODES) {
    for (const year of years) {
      const parts = SKILLED_OCCUPATIONS.map((occupation) => ({
        ...occupation,
        value: lfs.values.get(`${sex.code}|${occupation.code}|${yearCode(year)}`),
      }));
      if (parts.some((part) => part.value === undefined)) continue;
      const complete = parts.every((part) => part.value !== null);
      const total = complete
        ? parts.reduce((sum, part) => sum + part.value, 0)
        : null;
      let annotation = complete
        ? `派生: ${parts.map((part) => `${part.name}${part.value}`).join("+")}（e-Stat DB 0003024266 建設業の万人値の和）`
        : "派生: 構成要素に未公表の値があるため計算していない";
      const reportParts = ["生産工程従事者", "輸送・機械運転従事者", "建設・採掘従事者"].map(
        (occupation) => annualReportValue(year, sex.catalogName, occupation),
      );
      if (complete && reportParts.every((value) => value !== null)) {
        const reportTotal = reportParts.reduce((sum, value) => sum + value, 0);
        if (reportTotal !== total) {
          annotation +=
            `。年報I-B-8（${year}年）の公表値による合計は${reportTotal}万人` +
            `（${reportParts.join("+")}）で一致しない（2022年1月のベンチマーク人口切替えより前に公表された年報値）`;
        }
      }
      observations.push(
        observation(
          tableId,
          { tab: "skilled-3cat", cat01: sex.code },
          { value: total, unit: "万人", annotation },
        ),
      );
      observations.at(-1).timeCode = yearCode(year);
    }
  }
  return {
    datasetId: LFS_DATASET_ID,
    tableId,
    title: "建設技能者（建設業の3職業大分類合計・派生系列）",
    statisticsName: "労働力調査（e-Stat DB 0003024266から計算した派生系列）",
    cycle: "年次",
    surveyDate: String(years.at(-1)),
    sourceKind: "derived-estat-api",
    sourceUrl: "https://www.e-stat.go.jp/dbview?sid=0003024266",
    dimensions: [
      dimension(tableId, "tab", "表章項目", "派生系列。原表にある系列ではない。", 0, [
        { code: "skilled-3cat", name: "建設技能者（生産工程＋輸送・機械運転＋建設・採掘）", unit: "万人" },
      ]),
      dimension(tableId, "cat01", "性別", "e-Stat DB 0003024266と同じコード", 1, SEX_CODES),
      dimension(
        tableId,
        "time",
        "時間軸（年次）",
        "暦年平均",
        2,
        years.map((year) => ({ code: yearCode(year), name: `${year}年` })),
      ),
    ],
    observations,
  };
}

// --- 年齢階級別構成比（年報I-B-5・2025年） --------------------------------

function ageShareTable() {
  const tableId = `${FILE_TABLE_PREFIX}lfs-construction-age-share-${catalog.ageShare.year}`;
  const observations = catalog.ageShare.rows.map((row) => {
    const sex = SEX_CODES.find((item) => item.catalogName === row.sex);
    const ageCode = AGE_CODES[row.ageClass];
    assert(sex && ageCode, `年齢構成比の分類が不明です: ${row.sex} ${row.ageClass}`);
    const item = observation(
      tableId,
      { tab: "share", cat01: sex.code, cat02: ageCode },
      {
        value: row.value,
        unit: "%",
        annotation: row.sourceSymbol ? `原表の記号「${row.sourceSymbol}」。0ではない` : "",
      },
    );
    item.timeCode = yearCode(catalog.ageShare.year);
    return item;
  });
  return {
    datasetId: LFS_DATASET_ID,
    tableId,
    title: `建設業就業者の年齢階級別構成比（${catalog.ageShare.year}年・年報I-B-5）`,
    statisticsName: catalog.ageShare.statisticsName,
    cycle: "年次",
    surveyDate: String(catalog.ageShare.year),
    openDate: catalog.ageShare.publicationDate,
    sourceKind: "estat-file",
    sourceUrl: catalog.ageShare.sourceUrl,
    dimensions: [
      dimension(tableId, "tab", "表章項目", "年報I-B-5の構成比", 0, [
        { code: "share", name: "構成比（建設業の全就業者＝100）", unit: "%" },
      ]),
      dimension(tableId, "cat01", "性別", "e-Stat DB 0003007108と同じコード", 1, SEX_CODES),
      dimension(
        tableId,
        "cat02",
        "年齢階級",
        "e-Stat DB 0003007108と同じコード",
        2,
        Object.entries(AGE_CODES).map(([name, code]) => ({ code, name })),
      ),
      dimension(tableId, "time", "時間軸（年次）", "暦年平均", 3, [
        { code: yearCode(catalog.ageShare.year), name: `${catalog.ageShare.year}年` },
      ]),
    ],
    observations,
  };
}

// --- 毎月勤労統計（建設業・年平均） --------------------------------------

function monthlyLabourTable() {
  const tableId = `${FILE_TABLE_PREFIX}00450071-construction-annual`;
  const years = [...new Set(catalog.monthlyLabour.rows.map((row) => row.year))].sort();
  const measures = MONTHLY_INDICATORS.map((indicator, index) => {
    const unit = catalog.monthlyLabour.rows.find((row) => row.indicator === indicator)?.unit;
    assert(unit, `毎月勤労統計の項目がありません: ${indicator}`);
    return { code: String(index + 1).padStart(2, "0"), name: indicator, unit };
  });
  const observations = catalog.monthlyLabour.rows.map((row) => {
    const measure = measures.find((item) => item.name === row.indicator);
    const item = observation(
      tableId,
      { tab: measure.code },
      {
        value: row.value,
        unit: row.unit,
        annotation: `${row.year}年分結果確報 ${row.sourceTable}`,
      },
    );
    item.timeCode = yearCode(row.year);
    return item;
  });
  return {
    datasetId: "monthly-labour-survey",
    tableId,
    title: "建設業の賃金・労働時間・常用雇用（年平均・事業所規模5人以上）",
    statisticsName: catalog.monthlyLabour.statisticsName,
    cycle: "年次",
    surveyDate: String(years.at(-1)),
    openDate:
      catalog.monthlyLabour.rows.find((row) => row.year === years.at(-1))
        ?.publicationDate ?? "",
    sourceKind: "mhlw-excel",
    sourceUrl: "https://www.mhlw.go.jp/toukei/itiran/roudou/monthly/r07/25cr/25cr.html",
    dimensions: [
      dimension(
        tableId,
        "tab",
        "表章項目",
        "建設業・就業形態計・事業所規模5人以上の年平均。単位は項目ごとに違う。",
        0,
        measures,
      ),
      dimension(
        tableId,
        "time",
        "時間軸（年次）",
        "暦年平均",
        1,
        years.map((year) => ({ code: yearCode(year), name: `${year}年` })),
      ),
    ],
    observations,
  };
}

// --- 賃金構造基本統計（職種別・2025年） -----------------------------------

function occupationWagesTable() {
  const tableId = `${FILE_TABLE_PREFIX}00450091-occupation-2025`;
  const observations = catalog.occupationWages.rows.map((row) => {
    const measure = WAGE_MEASURES.find((item) => item.indicator === row.indicator);
    const occupation = WAGE_OCCUPATIONS.find((item) => item.name === row.occupation);
    assert(measure && occupation, `賃金構造基本統計の分類が不明です: ${row.occupation} ${row.indicator}`);
    const item = observation(
      tableId,
      { tab: measure.code, cat01: occupation.code },
      {
        value: row.value,
        unit: row.unit,
        annotation:
          row.referencePeriod === "2024"
            ? "対象期間: 2024年1～12月（月額給与・労働時間の2025年6月と違う）"
            : `対象期間: ${row.referencePeriod.slice(0, 4)}年${Number(row.referencePeriod.slice(5))}月`,
      },
    );
    item.timeCode = yearCode(2025);
    return item;
  });
  assert(observations.length === WAGE_MEASURES.length * WAGE_OCCUPATIONS.length, "賃金構造基本統計の件数が合いません。");
  return {
    datasetId: "wage-structure-survey",
    tableId,
    title: "建設関連職種の賃金・労働時間（2025年調査・産業計）",
    statisticsName: catalog.occupationWages.statisticsName,
    cycle: "年次",
    surveyDate: "2025",
    openDate: catalog.occupationWages.publicationDate,
    sourceKind: "estat-file",
    sourceUrl: catalog.occupationWages.sourceUrl,
    dimensions: [
      dimension(
        tableId,
        "tab",
        "表章項目",
        "e-Stat DB 0003426315と同じコード。単位は項目ごとに違う。",
        0,
        WAGE_MEASURES.map((item) => ({
          code: item.code,
          name: item.name,
          unit: catalog.occupationWages.rows.find((row) => row.indicator === item.indicator).unit,
        })),
      ),
      dimension(
        tableId,
        "cat01",
        "職種（小分類）",
        "産業計（全産業）の職種。建設業に限った集計ではない。コードはe-Stat DB 0003426315と同じ。",
        1,
        WAGE_OCCUPATIONS,
      ),
      dimension(tableId, "time", "調査年", "月額・時間は2025年6月、賞与は2024年1～12月", 2, [
        { code: yearCode(2025), name: "2025年調査" },
      ]),
    ],
    observations,
  };
}

// --- 公共工事設計労務単価 -------------------------------------------------

function designLabourRateTable() {
  const tableId = `${FILE_TABLE_PREFIX}mlit-design-labour-rate`;
  const rows = catalog.designLabourRate.rows;
  const observations = rows.map((row) => {
    const year = Number(row.effectiveFrom.slice(0, 4));
    const item = observation(
      tableId,
      { tab: "all-occupations" },
      {
        value: row.value,
        unit: row.unit,
        annotation: `${year}年3月から適用。積算用単価で実際の賃金ではない`,
      },
    );
    item.timeCode = yearCode(year);
    return item;
  });
  const years = rows.map((row) => Number(row.effectiveFrom.slice(0, 4)));
  return {
    datasetId: "public-works-labour-rate",
    tableId,
    title: "公共工事設計労務単価（全国全職種平均値の推移）",
    statisticsName: catalog.designLabourRate.statisticsName,
    cycle: "年次",
    surveyDate: String(years.at(-1)),
    openDate: rows.at(-1).publicationDate ?? "",
    sourceKind: "mlit-publication",
    sourceUrl: catalog.designLabourRate.sourceUrl,
    dimensions: [
      dimension(tableId, "tab", "表章項目", catalog.designLabourRate.priceBasis, 0, [
        { code: "all-occupations", name: "全国全職種平均値（8時間当たり）", unit: "円/8時間" },
      ]),
      dimension(
        tableId,
        "time",
        "適用年",
        "各年3月から適用",
        1,
        years.map((year) => ({ code: yearCode(year), name: `${year}年3月適用` })),
      ),
    ],
    observations,
  };
}

const DATASETS = [
  {
    id: "monthly-labour-survey",
    title: "毎月勤労統計調査（建設業・年平均）",
    governmentStatisticsCode: "00450071",
    sourceUrl: "https://www.mhlw.go.jp/toukei/list/30-1.html",
    fiscalYearFrom: 2020,
  },
  {
    id: "wage-structure-survey",
    title: "賃金構造基本統計調査（建設関連職種）",
    governmentStatisticsCode: "00450091",
    sourceUrl: "https://www.mhlw.go.jp/toukei/list/chinginkouzou.html",
    fiscalYearFrom: 2025,
  },
  {
    id: "public-works-labour-rate",
    title: "公共工事設計労務単価",
    governmentStatisticsCode: "MLIT-LABOUR-RATE",
    sourceUrl: "https://www.mlit.go.jp/report/press/content/001981942.pdf",
    fiscalYearFrom: 2019,
  },
];

if (existsSync(BUILD_PATH)) rmSync(BUILD_PATH);
copyFileSync(DATABASE_PATH, BUILD_PATH, fsConstants.COPYFILE_FICLONE);
const db = openStatisticsDatabase(BUILD_PATH);
const runId = randomUUID();
db.prepare(
  `INSERT INTO ingestion_runs(id, started_at, status) VALUES (?, ?, 'running')`,
).run(runId, fetchedAt);

try {
  const lfs = readLfsOccupationValues(db);
  const vintageDifferences = verifyAgainstAnnualReport(lfs);

  const staleTableIds = db
    .prepare(
      `SELECT id FROM statistical_tables
        WHERE (dataset_id = ? AND id LIKE ?)
           OR dataset_id IN (${DATASETS.map(() => "?").join(", ")})`,
    )
    .all(LFS_DATASET_ID, `${FILE_TABLE_PREFIX}%`, ...DATASETS.map((item) => item.id))
    .map((row) => row.id);
  clearTables(db, staleTableIds);
  for (const dataset of DATASETS) upsertDataset(db, dataset);

  const specs = [
    skilledWorkersTable(lfs),
    ageShareTable(),
    monthlyLabourTable(),
    occupationWagesTable(),
    designLabourRateTable(),
  ];
  let observationCount = 0;
  for (const spec of specs) {
    const count = writeTable(db, spec);
    observationCount += count;
    process.stdout.write(`[${spec.datasetId}] ${spec.tableId}: ${count} observations\n`);
  }

  db.prepare(
    `UPDATE ingestion_runs
        SET completed_at = ?, status = 'complete', table_count = ?, observation_count = ?
      WHERE id = ?`,
  ).run(new Date().toISOString(), specs.length, observationCount, runId);
  db.exec("PRAGMA optimize");
  db.close();

  const previousPath = `${DATABASE_PATH}.previous`;
  const pendingPreviousPath = `${previousPath}.${runId}.linking`;
  try {
    linkSync(DATABASE_PATH, pendingPreviousPath);
    renameSync(pendingPreviousPath, previousPath);
  } catch {
    if (existsSync(pendingPreviousPath)) rmSync(pendingPreviousPath);
    copyFileSync(DATABASE_PATH, previousPath);
  }
  renameSync(BUILD_PATH, DATABASE_PATH);
  process.stdout.write(
    `LFS年報I-B-8との差（2019～2021年、ベンチマーク人口切替え前の年報値）: ${vintageDifferences.length}件\n` +
      vintageDifferences
        .map(
          (item) =>
            `  ${item.year} ${item.sex} ${item.occupation}: 年報${item.value} / DB${item.dbValue}\n`,
        )
        .join(""),
  );
} catch (error) {
  try {
    db.prepare(
      `UPDATE ingestion_runs SET completed_at = ?, status = 'failed', error = ? WHERE id = ?`,
    ).run(new Date().toISOString(), String(error?.stack ?? error), runId);
    db.close();
  } catch {
    // 元の例外を優先する。
  }
  if (existsSync(BUILD_PATH)) rmSync(BUILD_PATH);
  throw error;
}
