import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MANIFEST_PATH = resolve(
  PROJECT_ROOT,
  "data/normalized/building-starts/annual/manifest.json",
);
const CATALOG_PATH = resolve(
  PROJECT_ROOT,
  "data/catalogs/building-annual.json",
);

function cleanTitle(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(
      "構造別、用途別、規模別（鉄骨造）",
      "構造別（鉄骨造）、用途別、規模別",
    )
    .replace("用途別、工事種別", "用途別、工事種類別")
    .replace("【年次・年度次】集計事項／集計範囲 一覧", "【年次・年度次】集計事項／集計範囲")
    .trim();
}

function splitVariant(title) {
  const cleaned = cleanTitle(title);
  const match = cleaned.match(/^(.*?)(（令和[^）]+分）)$/);
  if (!match) {
    return { baseTitle: cleaned, variantLabel: "" };
  }
  return {
    baseTitle: cleanTitle(match[1]),
    variantLabel: match[2],
  };
}

function groupId(title) {
  return createHash("sha1").update(title).digest("hex").slice(0, 12);
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const records = manifest.files.map((file) => {
  const { baseTitle, variantLabel } = splitVariant(file.title);
  return {
    fiscalYear: file.fiscalYear,
    fiscalYearLabel: `${file.fiscalYear}年度`,
    tableNumber: file.tableNumber,
    title: file.title,
    baseTitle,
    variantLabel,
    groupId: groupId(baseTitle),
    statInfId: file.statInfId,
    fileId: file.fileId,
    releaseCount: file.releaseCount,
    releaseDate: file.releaseDate,
    bytes: file.bytes,
    sha256: file.sha256,
    sourcePage: file.sourcePage,
    downloadUrl: file.downloadUrl,
  };
});

const groups = [
  ...new Map(
    records.map((record) => [
      record.groupId,
      {
        id: record.groupId,
        title: record.baseTitle,
        tableNumbers: [],
        fiscalYears: [],
        recordCount: 0,
      },
    ]),
  ).values(),
];

for (const group of groups) {
  const groupRecords = records.filter((record) => record.groupId === group.id);
  group.tableNumbers = [
    ...new Set(groupRecords.map((record) => record.tableNumber).filter(Boolean)),
  ];
  group.fiscalYears = [
    ...new Set(groupRecords.map((record) => record.fiscalYear)),
  ].sort((a, b) => a - b);
  group.recordCount = groupRecords.length;
}

groups.sort((a, b) => a.title.localeCompare(b.title, "ja"));
records.sort(
  (a, b) =>
    b.fiscalYear - a.fiscalYear ||
    a.baseTitle.localeCompare(b.baseTitle, "ja") ||
    a.title.localeCompare(b.title, "ja"),
);

const catalog = {
  title: manifest.title,
  organization: "国土交通省",
  governmentStatisticsCode: manifest.governmentStatisticsCode,
  providedStatisticsId: manifest.providedStatisticsId,
  sourceUrl: manifest.sourceUrl,
  fiscalYearFrom: manifest.fiscalYearFrom,
  fiscalYearTo: manifest.fiscalYearTo,
  fetchedAt: manifest.fetchedAt,
  fileCount: records.length,
  totalBytes: manifest.totalBytes,
  groups,
  records,
};

await mkdir(dirname(CATALOG_PATH), { recursive: true });
await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(
  `catalog: groups=${groups.length} records=${records.length} bytes=${manifest.totalBytes}`,
);
