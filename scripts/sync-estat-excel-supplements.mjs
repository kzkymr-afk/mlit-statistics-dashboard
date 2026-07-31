import { createHash, randomUUID } from "node:crypto";
import {
  constants as fsConstants,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

import XLSX from "xlsx";

import { EStatApiClient } from "./lib/estat-api-client.mjs";
import {
  buildValueLookup,
  normalizeObservation,
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
const APP_ID = process.env.ESTAT_APP_ID?.trim();
const DATABASE_PATH = resolve(
  ROOT,
  "data/database/mlit-statistics-system.sqlite",
);
const BUILD_PATH = `${DATABASE_PATH}.excel-building`;
const RAW_ROOT = resolve(ROOT, "data/raw/excel");
const NORMALIZED_ROOT = resolve(ROOT, "data/normalized/excel");
const START_YEAR = 2013;
const USER_AGENT = "MLITStatisticsSystem/2.0";

if (!APP_ID) {
  throw new Error("ESTAT_APP_IDが必要です。");
}
if (!existsSync(DATABASE_PATH)) {
  throw new Error(
    "正規化DBがありません。先にe-Stat API同期を実行してください。",
  );
}

const client = new EStatApiClient({ appId: APP_ID });

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function compact(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function label(value) {
  return compact(value)
    .replace(/^[\s　]+|[\s　]+$/g, "")
    .replace(/\s*([()（）])\s*/g, "$1");
}

function numeric(value) {
  const normalized = compact(value)
    .replaceAll(",", "")
    .replace(/^[△▲]\s*/, "-")
    .replace(/^－\s*/, "-");
  if (!normalized || /^(?:-|―|…|⊥)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceFileName(url, fallback) {
  const statInfId = new URL(url).searchParams.get("statInfId");
  return `${statInfId || fallback}.xls`;
}

async function fetchWithRetry(url, attempts = 6) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (error?.retryable === false || attempt === attempts - 1) break;
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, 600 * (attempt + 1)),
      );
    }
  }
  throw lastError;
}

async function dataCatalog(statsCode) {
  const records = [];
  let startPosition = 1;
  while (startPosition) {
    const { body } = await client.dataCatalog({
      statsCode,
      dataType: "XLS",
      startPosition,
      limit: 100,
    });
    const info = body?.GET_DATA_CATALOG?.DATA_CATALOG_LIST_INF;
    records.push(...asArray(info?.DATA_CATALOG_INF));
    startPosition = Number(info?.RESULT_INF?.NEXT_KEY ?? 0);
  }
  return records.map((record) => {
    const dataset = record.DATASET ?? {};
    const title = dataset.TITLE ?? {};
    return {
      id: compact(record["@id"]),
      name: compact(title.NAME),
      surveyDate: compact(title.SURVEY_DATE),
      cycle: compact(title.CYCLE),
      releaseDate: compact(dataset.RELEASE_DATE),
      modifiedDate: compact(dataset.LAST_MODIFIED_DATE),
      landingPage: compact(dataset.LANDING_PAGE),
      resources: asArray(record.RESOURCES?.RESOURCE).map((resource) => ({
        id: compact(resource["@id"]),
        name: compact(resource.TITLE?.NAME || resource.TITLE?.TABLE_NAME),
        format: compact(resource.FORMAT),
        url: compact(resource.URL),
        releaseDate: compact(resource.RELEASE_DATE),
        modifiedDate: compact(resource.LAST_MODIFIED_DATE),
      })),
    };
  });
}

async function downloadResource(datasetId, resource) {
  const directory = resolve(RAW_ROOT, datasetId);
  mkdirSync(directory, { recursive: true });
  const fileName = sourceFileName(resource.url, resource.id || "source");
  const path = resolve(directory, fileName);
  let bytes;
  if (existsSync(path)) {
    bytes = readFileSync(path);
  } else {
    const response = await fetchWithRetry(resource.url);
    bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(path, bytes);
  }
  return {
    ...resource,
    path,
    localPath: relative(ROOT, path),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function worksheetRows(path, preferredNames) {
  const workbook = XLSX.read(readFileSync(path), { type: "buffer" });
  const name =
    preferredNames.find((candidate) => workbook.Sheets[candidate]) ??
    workbook.SheetNames.find((candidate) =>
      preferredNames.some((preferred) => candidate.includes(preferred)),
    );
  if (!name) {
    throw new Error(
      `${basename(path)}: 対象シートがありません (${preferredNames.join(", ")})`,
    );
  }
  return XLSX.utils.sheet_to_json(workbook.Sheets[name], {
    header: 1,
    raw: false,
    defval: "",
  });
}

function sheetYear(name) {
  const match = compact(name).match(/(昭和|平成|令和)(\d+)年/);
  if (!match) return null;
  return { 昭和: 1925, 平成: 1988, 令和: 2018 }[match[1]] +
    Number(match[2]);
}

function timeCode(year, month = null) {
  return month
    ? `${year}${String(month).padStart(2, "0")}0000`
    : `${year}100000`;
}

function timeName(year, month = null) {
  return month ? `${year}年${month}月` : `${year}年`;
}

function codeMap(values) {
  return new Map(
    [...new Set(values)]
      .sort((left, right) => left.localeCompare(right, "ja"))
      .map((value, index) => [value, String(index + 1).padStart(3, "0")]),
  );
}

function buildDimensions(tableId, axisDefinitions, semanticRows) {
  const maps = new Map();
  const dimensions = axisDefinitions.map((axis, axisIndex) => {
    const values = axis.apiKey === "time"
      ? [...new Map(
          semanticRows.map((row) => [row.timeCode, row.timeName]),
        )]
      : [...new Set(
          semanticRows.map((row) => row.coordinates[axis.apiKey]),
        )]
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right, "ja"))
          .map((value) => [value, value]);
    const map = codeMap(values.map(([code]) => code));
    if (axis.apiKey !== "time") maps.set(axis.apiKey, map);
    return {
      id: `${tableId}:${axis.apiKey}`,
      tableId,
      apiKey: axis.apiKey,
      name: axis.name,
      description: axis.description ?? "",
      sortOrder: axisIndex,
      values: values.map(([value, name], valueIndex) => ({
        code: axis.apiKey === "time" ? value : map.get(value),
        name,
        level: 1,
        parentCode: "",
        unit: "",
        sortOrder: valueIndex,
      })),
    };
  });
  const observations = semanticRows.map((row) => {
    const value = {
      "@time": row.timeCode,
      "@unit": row.unit,
      "@annotation": row.annotation ?? "",
      $: row.value === null ? row.rawValue ?? "" : String(row.value),
    };
    for (const [apiKey, semanticValue] of Object.entries(row.coordinates)) {
      value[`@${apiKey}`] = maps.get(apiKey)?.get(semanticValue) ?? "";
    }
    return normalizeObservation(value, tableId);
  });
  observations.sort(
    (left, right) =>
      left.seriesId.localeCompare(right.seriesId) ||
      left.timeCode.localeCompare(right.timeCode),
  );
  return { dimensions, observations };
}

function clearDataset(db, datasetId) {
  const tableIds = db
    .prepare("SELECT id FROM statistical_tables WHERE dataset_id = ?")
    .all(datasetId)
    .map((row) => row.id);
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
      db.prepare("DELETE FROM observation_sources WHERE table_id = ?").run(
        tableId,
      );
      db.prepare(
        `DELETE FROM dimension_values WHERE dimension_id IN
           (SELECT id FROM dimensions WHERE table_id = ?)`,
      ).run(tableId);
      db.prepare("DELETE FROM dimensions WHERE table_id = ?").run(tableId);
      db.prepare("DELETE FROM concept_mappings WHERE table_id = ?").run(
        tableId,
      );
      db.prepare("DELETE FROM statistical_tables WHERE id = ?").run(tableId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function ingestTable(
  db,
  { dataset, table, axes, rows, source, fetchedAt },
) {
  upsertDataset(db, dataset);
  upsertStatisticalTable(db, dataset.id, {
    ...table,
    overallTotalNumber: rows.length,
  }, fetchedAt, {
    sourceKind: "estat-excel",
    sourceUrl: source.sourceUrl,
  });
  const { dimensions, observations } = buildDimensions(table.id, axes, rows);
  replaceDimensions(db, table.id, dimensions);
  upsertObservationSource(db, {
    id: source.id,
    tableId: table.id,
    sourceUrl: source.sourceUrl,
    publishedAt: source.publishedAt,
    retrievedAt: fetchedAt,
    sourceKind: "estat-excel",
    localPath: source.localPath,
    sha256: source.sha256,
  });
  const lookup = buildValueLookup(dimensions);
  const write = makeObservationWriter(db, {
    tableId: table.id,
    dimensions,
    sourceId: source.id,
    fetchedAt,
    timeCodes:
      dimensions.find((dimension) => dimension.apiKey === "time")?.values
        .map((value) => value.code) ?? [],
    seriesLabel: (coordinates) => seriesLabel(coordinates, lookup),
  });
  const pageSize = 50_000;
  for (let index = 0; index < observations.length; index += pageSize) {
    write(observations.slice(index, index + pageSize));
  }
  write.finish();
  const times = dimensions
    .find((dimension) => dimension.apiKey === "time")
    ?.values.map((value) => value.code) ?? [];
  finalizeTable(db, table.id, times);
  return {
    tableId: table.id,
    title: table.title,
    rowCount: rows.length,
    seriesCount: Number(
      db.prepare("SELECT COUNT(*) AS count FROM series WHERE table_id = ?")
        .get(table.id)?.count ?? 0,
    ),
  };
}

const LABOR_JOBS = new Map([
  ["型わく工(土木)", "型わく工(土木)"],
  ["型わく工(建築)", "型わく工(建築)"],
  ["左官", "左官"],
  ["とび工", "とび工"],
  ["鉄筋工(土木)", "鉄筋工(土木)"],
  ["鉄筋工(建築)", "鉄筋工(建築)"],
  ["6職種計", "6職種計"],
  ["電工", "電工"],
  ["配管工", "配管工"],
  ["8職種計", "8職種計"],
]);

function compactJob(value) {
  return label(value).replaceAll(" ", "");
}

function parseLaborCurrent(path, surveyDate) {
  const rows = worksheetRows(path, ["過不足率状況"]);
  const year = Number(surveyDate.slice(0, 4));
  const month = Number(surveyDate.slice(4, 6));
  const output = [];
  for (const row of rows) {
    const jobIndex = row.findIndex((cell) => LABOR_JOBS.has(compactJob(cell)));
    if (jobIndex < 0) continue;
    const job = LABOR_JOBS.get(compactJob(row[jobIndex]));
    const percentIndex = row.findIndex(
      (cell, index) => index > jobIndex && compact(cell) === "%",
    );
    if (percentIndex < 0) continue;
    const candidates = row
      .slice(jobIndex + 1, percentIndex)
      .map((cell) => ({ rawValue: compact(cell), value: numeric(cell) }))
      .filter((item) => item.value !== null);
    const current = candidates.at(-1);
    if (!current) continue;
    output.push({
      coordinates: { tab: "過不足率(原数値)", cat01: job },
      timeCode: timeCode(year, month),
      timeName: timeName(year, month),
      unit: "%",
      value: current.value,
      rawValue: current.rawValue,
    });
  }
  return output;
}

const PREFECTURES = new Set([
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
]);

function materialName(rows, headerIndex) {
  for (let index = headerIndex - 1; index >= Math.max(0, headerIndex - 4); index -= 1) {
    const candidate = rows[index]
      .map(label)
      .find((value) => value && !/^(?:表|No\.|<|現在)/i.test(value));
    if (candidate) return candidate;
  }
  return "不明";
}

function parseMaterialRows(rows, surveyDate, forcedMaterial = "") {
  const year = Number(surveyDate.slice(0, 4));
  const month = Number(surveyDate.slice(4, 6));
  const output = [];
  for (let headerIndex = 0; headerIndex < rows.length - 2; headerIndex += 1) {
    const header = rows[headerIndex].map(compact);
    const areaIndex = header.findIndex((cell) => cell === "都道府県");
    if (areaIndex < 0 || !header.some((cell) => cell.includes("価格動向"))) {
      continue;
    }
    const subheader = rows[headerIndex + 1].map(compact);
    const currentColumns = subheader
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => cell.includes("今回調査"))
      .map(({ index }) => index);
    if (currentColumns.length < 2) continue;
    const material = forcedMaterial || materialName(rows, headerIndex);
    const metrics = ["価格動向", "需給動向", "在庫状況"];
    for (let rowIndex = headerIndex + 2; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const area = label(row[areaIndex]);
      if (!PREFECTURES.has(area)) {
        if (rowIndex > headerIndex + 55) break;
        continue;
      }
      for (let metricIndex = 0; metricIndex < currentColumns.length; metricIndex += 1) {
        const rawValue = compact(row[currentColumns[metricIndex]]);
        const value = numeric(rawValue);
        if (value === null && !rawValue) continue;
        output.push({
          coordinates: {
            tab: metrics[metricIndex] ?? `指標${metricIndex + 1}`,
            area,
            cat01: material,
          },
          timeCode: timeCode(year, month),
          timeName: timeName(year, month),
          unit: "5段階指数",
          value,
          rawValue,
          annotation: value === null ? rawValue : "",
        });
      }
    }
  }
  return output;
}

function parseMaterials(path, surveyDate) {
  const workbook = XLSX.read(readFileSync(path), { type: "buffer" });
  const combinedSheetName = [
    "公表資料（表-２）_新様式",
    "公表資料（表-２）",
    "表－２",
    "表-２",
  ].find((name) => workbook.Sheets[name]) ??
    workbook.SheetNames.find((name) =>
      compact(name).startsWith("公表資料(表-2"),
    );
  if (combinedSheetName) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[combinedSheetName], {
      header: 1,
      raw: false,
      defval: "",
    });
    return parseMaterialRows(rows, surveyDate);
  }
  const detailSheetNames = workbook.SheetNames.filter((name) =>
    /^表[-－]?2/.test(name.normalize("NFKC")),
  );
  if (detailSheetNames.length === 0) {
    throw new Error(`${basename(path)}: 資材別詳細シートがありません。`);
  }
  return detailSheetNames.flatMap((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: "",
    });
    const material = label(rows[0]?.find((cell) => compact(cell))) ||
      label(name.replace(/^表[-－]?2/, ""));
    return parseMaterialRows(rows, surveyDate, material);
  });
}

function privateStockRows(path, kind) {
  const workbook = XLSX.read(readFileSync(path), { type: "buffer" });
  const output = [];
  for (const name of workbook.SheetNames) {
    const year = sheetYear(name);
    if (year === null || year < START_YEAR || !name.includes("全国")) continue;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: "",
    });
    let structure = "";
    for (const row of rows.slice(4)) {
      const first = label(row[0]);
      const second = label(row[1]);
      if (["木造", "非木造", "不詳"].includes(first)) structure = first;
      let use = second;
      if (first === "合計") {
        structure = "合計";
        use = "合計";
      }
      if (!structure || !use) continue;
      const values = row.slice(2).map(numeric).filter((value) => value !== null);
      if (values.length === 0) continue;
      output.push({
        coordinates: {
          tab: "延べ床面積",
          cat01: kind,
          cat02: structure,
          cat03: use,
        },
        timeCode: timeCode(year),
        timeName: timeName(year),
        unit: "万m2",
        value: values.reduce((sum, value) => sum + value, 0),
      });
    }
  }
  return output;
}

function publicStockRows(path, kind) {
  const workbook = XLSX.read(readFileSync(path), { type: "buffer" });
  const output = [];
  for (const name of workbook.SheetNames) {
    const year = sheetYear(name);
    if (year === null || year < START_YEAR) continue;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: "",
    });
    const headerIndex = rows.findIndex(
      (row) => row.some((cell) => label(cell) === "事務所") &&
        row.some((cell) => label(cell) === "合計"),
    );
    if (headerIndex < 0) continue;
    const headers = rows[headerIndex].map(label);
    for (const row of rows.slice(headerIndex + 1)) {
      const area = label(row[0]);
      if (!(area === "全国計" || PREFECTURES.has(area))) continue;
      for (let column = 1; column < headers.length; column += 1) {
        const use = headers[column];
        if (!use) continue;
        const rawValue = compact(row[column]);
        const value = numeric(rawValue);
        if (value === null && !rawValue) continue;
        output.push({
          coordinates: {
            tab: "延べ床面積",
            area: area === "全国計" ? "全国" : area,
            cat01: kind,
            cat02: use,
          },
          timeCode: timeCode(year),
          timeName: timeName(year),
          unit: "万m2",
          value,
          rawValue,
        });
      }
    }
  }
  return output;
}

async function mapConcurrent(items, limit, task) {
  const result = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      result[index] = await task(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return result;
}

async function prepareLabor() {
  const catalogs = (await dataCatalog("00600050"))
    .filter((record) => Number(record.surveyDate) >= START_YEAR * 100 + 1)
    .sort((left, right) => left.surveyDate.localeCompare(right.surveyDate));
  const latest = catalogs.at(-1);
  if (!latest) throw new Error("建設労働需給調査Excelがありません。");
  const files = await mapConcurrent(catalogs, 5, async (record, index) => {
    const resource = record.resources.find((item) => /XLS/.test(item.format));
    if (!resource) return null;
    const file = await downloadResource("construction-labor", resource);
    if ((index + 1) % 24 === 0 || index === catalogs.length - 1) {
      process.stdout.write(
        `[construction-labor] ${index + 1}/${catalogs.length} Excel\n`,
      );
    }
    return { record, file };
  });
  const valid = files.filter(Boolean);
  return {
    latest,
    files: valid.map((item) => item.file),
    rows: valid.flatMap(({ record, file }) =>
      parseLaborCurrent(file.path, record.surveyDate),
    ),
  };
}

async function prepareMaterials() {
  const catalogs = (await dataCatalog("00600060"))
    .filter((record) => Number(record.surveyDate) >= START_YEAR * 100 + 1)
    .sort((left, right) => left.surveyDate.localeCompare(right.surveyDate));
  const files = await mapConcurrent(catalogs, 5, async (record, index) => {
    const resource = record.resources.find((item) => /XLS/.test(item.format));
    if (!resource) return null;
    const file = await downloadResource("construction-materials", resource);
    if ((index + 1) % 24 === 0 || index === catalogs.length - 1) {
      process.stdout.write(
        `[construction-materials] ${index + 1}/${catalogs.length} Excel\n`,
      );
    }
    return { record, file };
  });
  const valid = files.filter(Boolean);
  return {
    latest: catalogs.at(-1),
    files: valid.map((item) => item.file),
    rows: valid.flatMap(({ record, file }) =>
      parseMaterials(file.path, record.surveyDate),
    ),
  };
}

async function prepareStock() {
  const catalogs = (await dataCatalog("00600940"))
    .sort((left, right) => left.surveyDate.localeCompare(right.surveyDate));
  const latest = catalogs.at(-1);
  if (!latest) throw new Error("建築物ストック統計Excelがありません。");
  const wanted = [
    ["住宅", "住宅"],
    ["法人等の非住宅建築物", "法人等非住宅"],
    ["公共の非住宅建築物-国", "公共非住宅(国)"],
    ["公共の非住宅建築物-地方公共団体", "公共非住宅(地方公共団体)"],
  ];
  const files = [];
  for (const [resourceName, kind] of wanted) {
    const normalizedResourceName = resourceName.replaceAll("-", "");
    const resource = latest.resources.find(
      (item) => item.name.replaceAll("-", "") === normalizedResourceName,
    );
    if (!resource) throw new Error(`建築物ストック統計: ${resourceName}がありません。`);
    files.push({ kind, file: await downloadResource("building-stock", resource) });
  }
  return {
    latest,
    files: files.map((item) => item.file),
    privateRows: [
      ...privateStockRows(files[0].file.path, files[0].kind),
      ...privateStockRows(files[1].file.path, files[1].kind),
    ],
    publicRows: [
      ...publicStockRows(files[2].file.path, files[2].kind),
      ...publicStockRows(files[3].file.path, files[3].kind),
    ],
  };
}

const fetchedAt = new Date().toISOString();
const [labor, materials, stock] = await Promise.all([
  prepareLabor(),
  prepareMaterials(),
  prepareStock(),
]);

for (const [datasetId, prepared] of [
  ["construction-labor", labor],
  ["construction-materials", materials],
  ["building-stock", stock],
]) {
  const manifest = {
    schemaVersion: 1,
    datasetId,
    fetchedAt,
    latestSurveyDate: prepared.latest?.surveyDate,
    fileCount: prepared.files.length,
    files: prepared.files.map((file) => ({
      name: file.name,
      url: file.url,
      localPath: file.localPath,
      bytes: file.bytes,
      sha256: file.sha256,
      releaseDate: file.releaseDate,
      modifiedDate: file.modifiedDate,
    })),
  };
  const path = resolve(NORMALIZED_ROOT, datasetId, "manifest.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (existsSync(BUILD_PATH)) rmSync(BUILD_PATH);
copyFileSync(DATABASE_PATH, BUILD_PATH, fsConstants.COPYFILE_FICLONE);
const db = openStatisticsDatabase(BUILD_PATH);
const runId = randomUUID();
db.prepare(
  `INSERT INTO ingestion_runs(id, started_at, status)
   VALUES (?, ?, 'running')`,
).run(runId, fetchedAt);

let results = [];
try {
  for (const datasetId of [
    "construction-labor",
    "construction-materials",
    "building-stock",
  ]) {
    clearDataset(db, datasetId);
  }

  results.push(ingestTable(db, {
    dataset: {
      id: "construction-labor",
      title: "建設労働需給調査",
      governmentStatisticsCode: "00600050",
      providedStatisticsId: "000001020817",
      sourceUrl:
        "https://www.e-stat.go.jp/stat-search/files?toukei=00600050&tstat=000001020817",
      fiscalYearFrom: START_YEAR,
    },
    table: {
      id: "excel-00600050-national-shortage",
      title: "建設技能労働者の職種別過不足率(全国・原数値)",
      statisticsName: "建設労働需給調査",
      cycle: "月次",
      surveyDate: labor.latest.surveyDate,
      openDate: labor.latest.releaseDate,
      updatedDate: labor.latest.modifiedDate,
    },
    axes: [
      { apiKey: "tab", name: "表章項目" },
      { apiKey: "cat01", name: "職種" },
      { apiKey: "time", name: "時間軸" },
    ],
    rows: labor.rows,
    source: {
      id: `estat-excel:00600050:${labor.latest.surveyDate}`,
      sourceUrl: labor.latest.landingPage || labor.files[0].url,
      publishedAt: labor.latest.releaseDate,
      localPath: relative(
        ROOT,
        resolve(NORMALIZED_ROOT, "construction-labor", "manifest.json"),
      ),
      sha256: sha256(
        Buffer.from(labor.files.map((file) => file.sha256).join("\n")),
      ),
    },
    fetchedAt,
  }));

  results.push(ingestTable(db, {
    dataset: {
      id: "construction-materials",
      title: "主要建設資材需給・価格動向調査",
      governmentStatisticsCode: "00600060",
      providedStatisticsId: "000001020818",
      sourceUrl:
        "https://www.e-stat.go.jp/stat-search/files?toukei=00600060&tstat=000001020818",
      fiscalYearFrom: START_YEAR,
    },
    table: {
      id: "excel-00600060-prefecture-index",
      title: "主要資材の価格・需給・在庫動向(都道府県別)",
      statisticsName: "主要建設資材需給・価格動向調査",
      cycle: "月次",
      surveyDate: materials.latest.surveyDate,
      openDate: materials.latest.releaseDate,
      updatedDate: materials.latest.modifiedDate,
    },
    axes: [
      { apiKey: "tab", name: "表章項目" },
      { apiKey: "area", name: "都道府県" },
      { apiKey: "cat01", name: "資材・規格" },
      { apiKey: "time", name: "時間軸" },
    ],
    rows: materials.rows,
    source: {
      id: `estat-excel:00600060:${materials.latest.surveyDate}`,
      sourceUrl:
        "https://www.e-stat.go.jp/stat-search/files?toukei=00600060&tstat=000001020818",
      publishedAt: materials.latest.releaseDate,
      localPath: relative(
        ROOT,
        resolve(NORMALIZED_ROOT, "construction-materials", "manifest.json"),
      ),
      sha256: sha256(
        Buffer.from(materials.files.map((file) => file.sha256).join("\n")),
      ),
    },
    fetchedAt,
  }));

  const stockDataset = {
    id: "building-stock",
    title: "建築物ストック統計",
    governmentStatisticsCode: "00600940",
    sourceUrl:
      "https://www.e-stat.go.jp/stat-search/files?toukei=00600940",
    fiscalYearFrom: START_YEAR,
  };
  const stockSource = {
    id: `estat-excel:00600940:${stock.latest.surveyDate}`,
    sourceUrl:
      "https://www.e-stat.go.jp/stat-search/files?toukei=00600940",
    publishedAt: stock.latest.releaseDate,
    localPath: relative(
      ROOT,
      resolve(NORMALIZED_ROOT, "building-stock", "manifest.json"),
    ),
    sha256: sha256(
      Buffer.from(stock.files.map((file) => file.sha256).join("\n")),
    ),
  };
  results.push(ingestTable(db, {
    dataset: stockDataset,
    table: {
      id: "excel-00600940-private-national",
      title: "住宅・法人等非住宅の全国延べ床面積",
      statisticsName: "建築物ストック統計",
      cycle: "年次",
      surveyDate: stock.latest.surveyDate,
      openDate: stock.latest.releaseDate,
      updatedDate: stock.latest.modifiedDate,
    },
    axes: [
      { apiKey: "tab", name: "表章項目" },
      { apiKey: "cat01", name: "建築物区分" },
      { apiKey: "cat02", name: "構造" },
      { apiKey: "cat03", name: "使途" },
      { apiKey: "time", name: "時間軸" },
    ],
    rows: stock.privateRows,
    source: { ...stockSource, id: `${stockSource.id}:private` },
    fetchedAt,
  }));
  results.push(ingestTable(db, {
    dataset: stockDataset,
    table: {
      id: "excel-00600940-public-prefecture",
      title: "公共非住宅の都道府県別延べ床面積",
      statisticsName: "建築物ストック統計",
      cycle: "年次",
      surveyDate: stock.latest.surveyDate,
      openDate: stock.latest.releaseDate,
      updatedDate: stock.latest.modifiedDate,
    },
    axes: [
      { apiKey: "tab", name: "表章項目" },
      { apiKey: "area", name: "地域" },
      { apiKey: "cat01", name: "建築物区分" },
      { apiKey: "cat02", name: "使途" },
      { apiKey: "time", name: "時間軸" },
    ],
    rows: stock.publicRows,
    source: { ...stockSource, id: `${stockSource.id}:public` },
    fetchedAt,
  }));

  const observationCount = results.reduce(
    (sum, result) => sum + result.rowCount,
    0,
  );
  db.prepare(
    `UPDATE ingestion_runs
        SET completed_at = ?, status = 'complete',
            table_count = ?, observation_count = ?
      WHERE id = ?`,
  ).run(new Date().toISOString(), results.length, observationCount, runId);
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
    `${results.map((result) =>
      `${result.tableId}: ${result.seriesCount.toLocaleString("ja-JP")}系列 / ` +
      `${result.rowCount.toLocaleString("ja-JP")}観測`,
    ).join("\n")}\n` +
    `system database: ${DATABASE_PATH}\n`,
  );
} catch (error) {
  try {
    db.prepare(
      `UPDATE ingestion_runs SET completed_at = ?, status = 'failed', error = ?
        WHERE id = ?`,
    ).run(new Date().toISOString(), String(error), runId);
    db.close();
  } catch {
    // 元の例外を優先する。
  }
  throw error;
}
