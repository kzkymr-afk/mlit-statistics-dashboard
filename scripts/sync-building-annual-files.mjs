import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const START_FISCAL_YEAR = 2013;
const END_FISCAL_YEAR = 2025;
const CONCURRENCY = 6;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36";
const ESTAT_BASE = "https://www.e-stat.go.jp";
const SOURCE_BASE =
  `${ESTAT_BASE}/stat-search/files?cycle=8&layout=datalist&month=0&page=1` +
  "&result_back=1&tclass1val=0&toukei=00600120&tstat=000001016965";
const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const RAW_ROOT = resolve(
  PROJECT_ROOT,
  "data/raw/building-starts/annual",
);
const MANIFEST_PATH = resolve(
  PROJECT_ROOT,
  "data/normalized/building-starts/annual/manifest.json",
);

function decodeEntities(value) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function textContent(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function yearPage(fiscalYear) {
  return `${SOURCE_BASE}&year=${fiscalYear}1`;
}

function extractFileName(contentDisposition, statInfId) {
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
  const candidate = encoded
    ? decodeURIComponent(encoded)
    : plain ?? `${statInfId}.xls`;
  const safe = candidate.replace(/[/:*?"<>|\\]/g, "_").trim();
  return safe || `${statInfId}.xls`;
}

function parseYearPage(html, fiscalYear) {
  const articles = [
    ...html.matchAll(
      /<article class="stat-dataset_list-item">([\s\S]*?)<\/article>/g,
    ),
  ];

  return articles.flatMap(([, block]) => {
    const download = block.match(
      /href="(\/stat-search\/file-download\?statInfId=(\d+)&fileKind=0)"[\s\S]*?data-file_id="([^"]+)"[\s\S]*?data-release_count="([^"]+)"/,
    );
    if (!download) return [];

    const detailItems = [
      ...block.matchAll(
        /<li class="stat-dataset_list-detail-item[^"]*">([\s\S]*?)<\/li>/g,
      ),
    ].map((match) => textContent(match[1]));
    const titleAnchor = block.match(
      /class="stat-link_text[^"]*[^>]*data-value="(\d+)"[^>]*>([\s\S]*?)<\/a>/,
    );
    const releaseDate = block.match(
      /公開（更新）日(?:&nbsp;|\s)*<\/span>\s*([0-9-]+)/,
    )?.[1];
    const title = titleAnchor ? textContent(titleAnchor[2]) : "";
    const tableNumber =
      detailItems.find((item) => /^(?:表番号\s*)?[\d０-９]/.test(item)) ?? "";

    return [
      {
        fiscalYear,
        tableNumber,
        title,
        statInfId: download[2],
        fileId: download[3],
        releaseCount: Number(download[4]) || 0,
        releaseDate: releaseDate ?? "",
        sourcePage: yearPage(fiscalYear),
        downloadUrl: `${ESTAT_BASE}${decodeEntities(download[1])}`,
      },
    ];
  });
}

async function fetchWithRetry(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "user-agent": USER_AGENT,
          ...(options.headers ?? {}),
        },
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, 500 * attempt),
        );
      }
    }
  }
  throw lastError;
}

async function loadInventory() {
  const records = [];
  for (
    let fiscalYear = START_FISCAL_YEAR;
    fiscalYear <= END_FISCAL_YEAR;
    fiscalYear += 1
  ) {
    const response = await fetchWithRetry(yearPage(fiscalYear));
    const html = await response.text();
    const yearRecords = parseYearPage(html, fiscalYear);
    if (yearRecords.length === 0) {
      throw new Error(`${fiscalYear}年度のExcel一覧を取得できませんでした。`);
    }
    records.push(...yearRecords);
    console.log(`${fiscalYear}: ${yearRecords.length} Excel`);
  }
  return records;
}

async function downloadRecord(record) {
  const yearDirectory = resolve(RAW_ROOT, String(record.fiscalYear));
  await mkdir(yearDirectory, { recursive: true });

  const existingName = (await readdir(yearDirectory)).find((name) =>
    name.startsWith(`${record.statInfId}-`),
  );
  if (existingName) {
    const localPath = resolve(yearDirectory, existingName);
    const bytes = await readFile(localPath);
    return {
      ...record,
      originalName: basename(existingName).slice(record.statInfId.length + 1),
      localPath: relative(PROJECT_ROOT, localPath),
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  const response = await fetchWithRetry(record.downloadUrl);
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const originalName = extractFileName(contentDisposition, record.statInfId);
  const extension = extname(originalName) || ".xls";
  const localPath = resolve(
    yearDirectory,
    `${record.statInfId}-${originalName.replace(extension, "")}${extension}`,
  );

  const bytes = Buffer.from(await response.arrayBuffer());
  const signature = bytes.subarray(0, 20).toString("utf8").toLowerCase();
  if (signature.includes("<!doctype") || signature.includes("<html")) {
    throw new Error(`${record.statInfId} がExcelではなくHTMLを返しました。`);
  }
  await writeFile(localPath, bytes);

  return {
    ...record,
    originalName,
    localPath: relative(PROJECT_ROOT, localPath),
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function mapConcurrent(items, limit, task) {
  const output = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await task(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return output;
}

const inventory = await loadInventory();
console.log(`total: ${inventory.length} Excel`);
const files = await mapConcurrent(inventory, CONCURRENCY, async (record, index) => {
  const downloaded = await downloadRecord(record);
  console.log(
    `[${index + 1}/${inventory.length}] ${record.fiscalYear} ${record.statInfId} ${record.title}`,
  );
  return downloaded;
});

const manifest = {
  title: "建築着工統計調査・建築物着工統計（年度次）",
  governmentStatisticsCode: "00600120",
  providedStatisticsId: "000001016965",
  sourceUrl:
    "https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00600120&tstat=000001016965&cycle=8&tclass1val=0",
  fiscalYearFrom: START_FISCAL_YEAR,
  fiscalYearTo: END_FISCAL_YEAR,
  fetchedAt: new Date().toISOString(),
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files,
};

await mkdir(dirname(MANIFEST_PATH), { recursive: true });
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`manifest: ${relative(PROJECT_ROOT, MANIFEST_PATH)}`);
console.log(`bytes: ${manifest.totalBytes}`);
