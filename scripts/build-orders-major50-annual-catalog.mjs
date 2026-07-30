import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MANIFEST_PATH = resolve(
  PROJECT_ROOT,
  "data/normalized/construction-orders-major-50/annual/manifest.json",
);
const CATALOG_PATH = resolve(
  PROJECT_ROOT,
  "data/catalogs/orders-major50-annual.json",
);

function cleanTitle(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[（(](?:平成|令和)[^）)]+[）)]$/u, "")
    .trim();
}

function groupId(title) {
  return createHash("sha1").update(title).digest("hex").slice(0, 12);
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const records = manifest.files.map((file) => {
  const baseTitle = cleanTitle(file.title);
  return {
    fiscalYear: file.fiscalYear,
    fiscalYearLabel: `${file.fiscalYear}年度`,
    tableNumber: file.tableNumber,
    title: file.title,
    baseTitle,
    variantLabel: "",
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
  datasetId: "orders-major50",
  title: manifest.title,
  organization: manifest.organization,
  governmentStatisticsCode: manifest.governmentStatisticsCode,
  providedStatisticsId: manifest.providedStatisticsId,
  classificationId: manifest.classificationId,
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
