import * as XLSX from "xlsx";
import type {
  MonthlyRecord,
  PrefectureRecord,
  StatisticsPayload,
} from "./types";

const SOURCE_LIST =
  "https://www.e-stat.go.jp/stat-search/files?cycle=1&layout=datalist&page=1&tclass1=000001048390&tclass2val=0&toukei=00600120&tstat=000001016966";
const SOURCE_PAGE =
  "https://www.mlit.go.jp/statistics/details/t-other-2_tk_000214.html";
const DOWNLOAD_BASE =
  "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36";

const PREFECTURES = [
  "北海道",
  "青森",
  "岩手",
  "宮城",
  "秋田",
  "山形",
  "福島",
  "茨城",
  "栃木",
  "群馬",
  "埼玉",
  "千葉",
  "東京",
  "神奈川",
  "新潟",
  "富山",
  "石川",
  "福井",
  "山梨",
  "長野",
  "岐阜",
  "静岡",
  "愛知",
  "三重",
  "滋賀",
  "京都",
  "大阪",
  "兵庫",
  "奈良",
  "和歌山",
  "鳥取",
  "島根",
  "岡山",
  "広島",
  "山口",
  "徳島",
  "香川",
  "愛媛",
  "高知",
  "福岡",
  "佐賀",
  "長崎",
  "熊本",
  "大分",
  "宮崎",
  "鹿児島",
  "沖縄",
] as const;

type Cell = string | number | boolean | Date | null | undefined;
type SheetRow = Cell[];

function normalizeDigits(value: string) {
  return value
    .replace(/[０-９]/g, (digit) =>
      String.fromCharCode(digit.charCodeAt(0) - 0xfee0),
    )
    .replace(/\s+/g, "");
}

function numberValue(value: Cell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-" || normalized === "…") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJapaneseMonth(value: Cell) {
  if (typeof value !== "string" || value.includes("年度")) return null;
  const label = normalizeDigits(value);
  const match = label.match(/^(R|令和)(元|\d+)年(\d+)月$/);
  if (!match) return null;
  const eraYear = match[2] === "元" ? 1 : Number(match[2]);
  const month = Number(match[3]);
  if (!Number.isInteger(eraYear) || month < 1 || month > 12) return null;
  const year = 2018 + eraYear;
  return {
    period: `${year}-${String(month).padStart(2, "0")}`,
    label: `${year}年${month}月`,
  };
}

function rowsFromWorkbook(bytes: ArrayBuffer): SheetRow[] {
  const workbook = XLSX.read(new Uint8Array(bytes), {
    type: "array",
    cellDates: false,
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Excelにシートがありません。");
  return XLSX.utils.sheet_to_json<SheetRow>(
    workbook.Sheets[firstSheetName],
    {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    },
  );
}

export function parseMonthlyWorkbook(bytes: ArrayBuffer): MonthlyRecord[] {
  const records = rowsFromWorkbook(bytes)
    .map((row) => {
      const period = parseJapaneseMonth(row[0]);
      const total = numberValue(row[1]);
      if (!period || total === null) return null;
      return {
        ...period,
        total,
        yoy: numberValue(row[2]),
        floorArea: numberValue(row[3]),
        ownerOccupied: numberValue(row[5]) ?? 0,
        rental: numberValue(row[9]) ?? 0,
        salaryHousing: numberValue(row[11]) ?? 0,
        forSale: numberValue(row[13]) ?? 0,
        condominium: numberValue(row[15]) ?? 0,
        detached: numberValue(row[18]) ?? 0,
      } satisfies MonthlyRecord;
    })
    .filter((row): row is MonthlyRecord => row !== null);

  const latestByPeriod = new Map(records.map((record) => [record.period, record]));
  return [...latestByPeriod.values()].sort((a, b) =>
    a.period.localeCompare(b.period),
  );
}

export function parsePrefectureWorkbook(
  bytes: ArrayBuffer,
): PrefectureRecord[] {
  const prefectureSet = new Set<string>(PREFECTURES);
  const records = rowsFromWorkbook(bytes)
    .map((row) => {
      // This workbook's used range starts at column B, so SheetJS exposes
      // the visible prefecture name as index 0.
      const name = typeof row[0] === "string" ? row[0].trim() : "";
      const total = numberValue(row[1]);
      if (!prefectureSet.has(name) || total === null) return null;
      return {
        code: String(
          PREFECTURES.indexOf(name as (typeof PREFECTURES)[number]) + 1,
        ).padStart(2, "0"),
        name,
        total,
        yoy: numberValue(row[2]),
        ownerOccupied: numberValue(row[3]) ?? 0,
        rental: numberValue(row[5]) ?? 0,
        salaryHousing: numberValue(row[7]) ?? 0,
        forSale: numberValue(row[9]) ?? 0,
        condominium: numberValue(row[11]) ?? 0,
        detached: numberValue(row[13]) ?? 0,
      } satisfies PrefectureRecord;
    })
    .filter((row): row is PrefectureRecord => row !== null);
  return [...new Map(records.map((record) => [record.code, record])).values()];
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`公式一覧の取得に失敗しました (${response.status})。`);
  }
  return response.text();
}

async function fetchWorkbook(statInfId: string) {
  const response = await fetch(`${DOWNLOAD_BASE}${statInfId}`, {
    headers: {
      "user-agent": USER_AGENT,
      accept:
        "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`公式Excelの取得に失敗しました (${response.status})。`);
  }
  return response.arrayBuffer();
}

function discoverStatInfId(html: string, title: string) {
  const linkPattern =
    /<a[^>]+data-value="(\d+)"[^>]*>\s*([^<]+?)\s*<\/a>/g;
  for (const match of html.matchAll(linkPattern)) {
    const normalizedTitle = match[2]
      .replace(/【住宅】/g, "")
      .replace(/\s+/g, "");
    if (normalizedTitle.includes(title.replace(/\s+/g, ""))) {
      return match[1];
    }
  }
  throw new Error(`公式一覧で「${title}」を見つけられませんでした。`);
}

export async function loadOfficialStatistics(): Promise<StatisticsPayload> {
  const listingHtml = await fetchText(SOURCE_LIST);
  const usageStatInfId = discoverStatInfId(listingHtml, "利用関係別戸数");
  const prefectureStatInfId = discoverStatInfId(
    listingHtml,
    "都道府県別着工戸数",
  );

  const [usageWorkbook, prefectureWorkbook] = await Promise.all([
    fetchWorkbook(usageStatInfId),
    fetchWorkbook(prefectureStatInfId),
  ]);
  const monthly = parseMonthlyWorkbook(usageWorkbook);
  const prefectures = parsePrefectureWorkbook(prefectureWorkbook);

  if (monthly.length < 12 || prefectures.length !== 47) {
    throw new Error(
      `公式Excelの構造を確認してください（月次${monthly.length}件・都道府県${prefectures.length}件）。`,
    );
  }

  return {
    monthly,
    prefectures,
    metadata: {
      title: "建築着工統計調査・住宅着工統計",
      organization: "国土交通省",
      surveyPeriod: monthly.at(-1)?.period ?? "",
      fetchedAt: new Date().toISOString(),
      sourcePage: SOURCE_PAGE,
      sourceList: SOURCE_LIST,
      usageStatInfId,
      prefectureStatInfId,
      mode: "live",
    },
  };
}
