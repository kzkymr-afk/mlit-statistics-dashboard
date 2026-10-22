"use client";

import {REVIEWED_COMPANY_URL,reviewedCompanyCatalog,connectReviewedCompanySelection} from '../lib/reviewed-company-connection.mjs';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import { buildAxisScale } from "@/lib/chart-scale.mjs";
import { canonicalSha256 } from "@/lib/buildbase-contract-hash.mjs";
import {
  FAVORITES_STORAGE_KEY,
  MAX_FAVORITES,
  favoriteIdFor,
  normalizeFavorites,
  upsertFavorite,
} from "@/lib/statistics-favorites.mjs";
import {
  indicatorCategory,
  ALL_CYCLES,
  filterTablesByNavigation,
  preferredTableId,
  searchCatalogTables,
  tableCoverageLabel,
  tableMatchesCycle,
} from "@/lib/statistics-navigation.mjs";
import {
  AVAILABILITY_STATUS_LABELS,
  MAX_BULK_ADD_SERIES,
  discoveryStatusFor,
  comboIdentity,
  calculatePearsonComparison,
  comparisonCompatibility,
  observationAnalysisState,
  axisAssignmentError,
  selectableCompareLimit,
} from "@/lib/statistics-series-compare.mjs";
import { STATISTICS_PRESETS } from "@/lib/statistics-presets.mjs";
import {
  VERIFIED_TABLE_ID, VERIFIED_DATASET_ID, VERIFIED_DATA_URL,
  verifiedWorkbenchCatalog, verifiedSourceForSelection, verifiedWindowTimeValues, verifiedSeriesSelection, verifiedOfficialBytesCheckedUrl, workbenchComparisonMetadata, placeSeriesInWorkbench,
  workbenchChartGroups, workbenchVisualChartGroups, workbenchChartTickLabel, indexSeriesAtCommonPeriod, correlationReviewCompatibility, publishedWorkbenchSelection, referenceSelectionAllowed, workbenchDisplaySeries, workbenchRawTableColumns, workbenchRawTableCell,
} from "@/lib/statistics-workbench.mjs";

type VerifiedCatalog = Awaited<ReturnType<typeof verifiedWorkbenchCatalog>>;

type DatasetSummary = {
  id: string;
  title: string;
  governmentStatisticsCode: string;
  providedStatisticsId?: string;
  sourceUrl: string;
  fiscalYearFrom: number;
};

type TableSummary = {
  id: string;
  datasetId: string;
  title: string;
  statisticsName: string;
  cycle: string;
  surveyDate?: string;
  openDate?: string;
  updatedDate?: string;
  sourceKind: string;
  sourceUrl: string;
  registryStatus: string;
  seriesCount: number;
  observationCount: number;
  metaUrl: string;
  snapshotHash?: string;
  // 母集団・比較上の注意（data/catalogs/table-notes.json）
  notes?: string[];
};

type SystemCatalog = {
  schemaVersion: 2;
  generatedAt: string;
  source: string;
  datasets: DatasetSummary[];
  tables: TableSummary[];
  sources: Record<
    string,
    {
      sourceId: string;
      sourceUrl: string;
      publishedAt: string | null;
      retrievedAt: string;
    }
  >;
};

type DimensionValue = {
  code: string;
  name: string;
  level: number | null;
  parentCode: string | null;
  unit: string | null;
  sortOrder: number;
  note?: string;
};

type Dimension = {
  id: string;
  apiKey: string;
  name: string;
  description?: string;
  sortOrder: number;
  values: DimensionValue[];
};

type TableMeta = {
  schemaVersion: 2;
  table: TableSummary;
  dimensions: Dimension[];
  defaultSelection: Record<string, string>;
  implicitNumericZero: boolean;
  seriesBundlePrefixLength: number;
  seriesBundleUrlTemplate: string;
  availabilityUrl?: string;
  contractVersion?: number;
  snapshotHash?: string;
  evidenceUrl?: string;
  metadataHash?: string;
  searchIndexUrl?: string;
  automaticComparisonAllowed?: boolean;
  automaticAggregationAllowed?: boolean;
};

type BuildBaseEvidence = {
  contractVersion: number;
  snapshotHash: string;
  metadataHash: string;
  canonicalFreshness?: string;
  cellMetadata: Array<{
    companyId: string;
    fiscalYear: number;
    fieldId: string;
    valueState?: string;
    verificationStatus?: string;
    disclosureStatus?: string;
    sourceBindingStatus?: string;
    source?: Record<string, unknown> | null;
    semantics?: Record<string, unknown> | null;
    eligibility?: {
      automaticComparisonAllowed?: boolean;
      automaticAggregationAllowed?: boolean;
    };
    history?: unknown;
  }>;
  searchIndex: { records: Array<Record<string, unknown>>; coverageNote?: string };
};

type AvailabilityIndex = {
  schemaVersion: 1;
  tableId: string;
  combos: Record<string, string>;
};

type ObservationPoint = {
  timeCode: string;
  value: string | null;
  numericValue: number | null;
  unit: string | null;
  annotation: string | null;
  status: string;
  sourceId: string;
  implicitNumericZero: boolean;
  periodStart?: string;
  periodEnd?: string;
  factId?: string;
  provenance?: { sourceUrl: string; pdfPage: number; definitionReviewQuote: string; sourceQuote: string; sourceFileSha256: string;
    currentOfficialVersionMatchStatus?: string; currentOfficialBytesCheckedAt?: string; currentOfficialBytesCheckedUrl?: string;
    sourceCurrentnessCheckId?: string; sourceCurrentnessCheckPayloadSha256?: string; sourceCurrentnessCheck?: Record<string, unknown>;
    sourceCurrentnessCheckHistory?: Array<{ checkId: string; checkedAtUTC: string; sourceUrl: string; httpStatus: number;
      byteComparisonStatus: string; recordPayloadSha256: string; [key: string]: unknown }>;
  };
};

type BundlePoint = [
    timeCode: string,
    numericValue: number | null,
    nonNumericValue: string | null,
    annotation: string | null,
    exceptionalStatus: string | null,
];

type CompactBundleSeries = [
  unit: string | null,
  timeMask: number | string,
  points: BundlePoint[],
];

type SeriesBundle = {
  schemaVersion: 2;
  datasetId: string;
  prefix: string;
  series: Record<string, CompactBundleSeries>;
};

type ChartKind = "line" | "bar";
type ChartAxis = "left" | "right";
type AxisSettingKey = "min" | "max" | "step";
type AxisSettings = Record<AxisSettingKey, string>;
type CycleFilter = "年度次" | "年次" | "月次" | "四半期" | "all";

type FavoriteItem = {
  id: string;
  datasetId: string;
  tableId: string;
  tableTitle: string;
  statisticsName: string;
  label: string;
  selections: Record<string, string>;
  timeFrom: string;
  timeTo: string;
  timeFromLabel: string;
  timeToLabel: string;
  savedAt: string;
};

type StatisticsPreset = {
  id: string;
  title: string;
  description: string;
  notes: string;
  datasetId: string;
  tableId: string;
  cycle: CycleFilter;
  displayFormat: "table" | "bar" | "line";
  chartKind: ChartKind;
  axis: ChartAxis;
  baseSelections: Record<string, string>;
  expandDimensionApiKey: string;
  expandCodes: string[];
};

type SelectedSeries = {
  id: string;
  datasetId: string;
  tableId: string;
  tableTitle: string;
  cycle: string;
  comparisonScope: string;
  metricDefinition?: string;
  measureKind?: string;
  periodBasis?: string;
  definitionReview?: string;
  automaticAggregationAllowed?: boolean;
  comparisonFamily?: string;
  companyId?: string;
  metricId?: string;
  reviewWindow?: string;
  comparisonIndicatorId?: string;
  comparisonEquivalence?: Record<string, unknown>;
  priceBasis: string;
  automaticComparisonAllowed: boolean;
  snapshotHash?: string;
  coordinates: Record<string, string>;
  label: string;
  unit: string | null;
  timeMask: number | string;
  points: ObservationPoint[];
  chartKind: ChartKind;
  axis: ChartAxis;
  color: string;
  sourceLabel: string;
  sources: Record<
    string,
    {
      sourceUrl: string;
      publishedAt: string | null;
      retrievedAt: string;
    }
  >;
  timeLabels: Record<string, string>;
  notes: string[];
};

type ChartDisplaySeries = SelectedSeries & {
  displayOnlyJoined?: boolean;
  displayBoundaryNote?: string;
  displayOriginalSeriesIds?: string[];
  displayOrigins?: Array<{ timeCode: string; seriesId: string; reviewWindow: string; point: ObservationPoint }>;
  displayReviewBoundaries?: Array<{ fromTimeCode: string; toTimeCode: string; fromSeriesId: string; toSeriesId: string; fromReviewWindow: string; toReviewWindow: string }>;
};

const MAX_SELECTED_SERIES = 15;
const COLORS = [
  "#2367d1",
  "#0f8c72",
  "#d17a17",
  "#7459c6",
  "#c14953",
  "#0086a8",
  "#7a8f1b",
  "#d2559a",
  "#72503a",
  "#4f657a",
  "#4d8f2e",
  "#b8860b",
  "#9b45c1",
  "#006c67",
  "#304c89",
];
const DEFAULT_TABLE_IDS: Record<string, string> = {
  [VERIFIED_DATASET_ID]: VERIFIED_TABLE_ID,
  "building-starts": "0003119773",
  "building-starts-monthly": "0003119745",
  "orders-major50": "0003126300",
  "orders-major50-monthly": "0003126275",
  renovation: "0003360953",
  "construction-output": "0003458439",
  "construction-deflator": "0004055083",
  "construction-investment": "0004065387",
  "construction-work": "0004016760",
  "construction-labor": "excel-00600050-national-shortage",
  "construction-materials": "excel-00600060-prefecture-index",
  "building-stock": "excel-00600940-private-national",
  "nikkenren-group-orders": "nikkenren-group-orders-annual",
  "labour-force-survey": "file-lfs-construction-skilled-3cat",
  "monthly-labour-survey": "file-00450071-construction-annual",
  "wage-structure-survey": "file-00450091-occupation-2025",
  "public-works-labour-rate": "file-mlit-design-labour-rate",
};
const CYCLE_OPTIONS: Array<{
  id: CycleFilter;
  label: string;
  detail: string;
}> = [
  { id: "年度次", label: "年度", detail: "4–3月" },
  { id: "年次", label: "年次", detail: "暦年" },
  { id: "月次", label: "月次", detail: "毎月" },
  { id: "四半期", label: "四半期", detail: "3か月" },
  { id: "all", label: "すべて", detail: "全周期" },
];
const STATISTICS_FAMILIES = [
  {
    id: "buildbase-company-comparison",
    title: "ゼネコン会社別データ",
    datasetIds: ["buildbase-company-comparison", VERIFIED_DATASET_ID],
    cycles: ["年度次"],
  },
  {
    id: "building-starts",
    title: "建築着工統計",
    datasetIds: ["building-starts", "building-starts-monthly"],
    cycles: ["年度次", "年次", "月次"],
  },
  {
    id: "orders-major50",
    title: "受注動態（大手50社）",
    datasetIds: ["orders-major50", "orders-major50-monthly"],
    cycles: ["年度次", "月次"],
  },
  {
    id: "renovation",
    title: "建築物リフォーム・リニューアル調査",
    datasetIds: ["renovation"],
    cycles: ["年度次", "四半期"],
  },
  {
    id: "construction-investment",
    title: "建設投資見通し",
    datasetIds: ["construction-investment"],
    cycles: ["年度次"],
  },
  {
    id: "nikkenren-group-orders",
    title: "日建連・企業規模別受注高",
    datasetIds: ["nikkenren-group-orders"],
    cycles: ["年度次"],
  },
  {
    id: "construction-output",
    title: "建設総合統計（出来高・手持ち）",
    datasetIds: ["construction-output"],
    cycles: ["年度次", "年次", "月次"],
  },
  {
    id: "construction-work",
    title: "建設工事施工統計調査",
    datasetIds: ["construction-work"],
    cycles: ["年度次"],
  },
  {
    id: "construction-deflator",
    title: "建設工事費デフレーター",
    datasetIds: ["construction-deflator"],
    cycles: ["年度次", "四半期", "月次"],
  },
  {
    id: "construction-labor",
    title: "建設労働需給調査",
    datasetIds: ["construction-labor"],
    cycles: ["月次"],
  },
  {
    id: "construction-materials",
    title: "主要建設資材需給・価格動向調査",
    datasetIds: ["construction-materials"],
    cycles: ["月次"],
  },
  {
    id: "labour-force-survey",
    title: "労働力調査（就業者・職業・年齢）",
    datasetIds: ["labour-force-survey"],
    cycles: ["年次"],
  },
  {
    id: "monthly-labour-survey",
    title: "毎月勤労統計調査（建設業）",
    datasetIds: ["monthly-labour-survey"],
    cycles: ["年次"],
  },
  {
    id: "wage-structure-survey",
    title: "賃金構造基本統計調査（建設関連職種）",
    datasetIds: ["wage-structure-survey"],
    cycles: ["年次"],
  },
  {
    id: "public-works-labour-rate",
    title: "公共工事設計労務単価",
    datasetIds: ["public-works-labour-rate"],
    cycles: ["年次"],
  },
  {
    id: "building-stock",
    title: "建築物ストック統計",
    datasetIds: ["building-stock"],
    cycles: ["年次"],
  },
] as const;
const DATASET_GROUPS = [
  {
    id: "company",
    title: "企業比較",
    statisticsIds: ["buildbase-company-comparison"],
  },
  {
    id: "demand",
    title: "需要・受注",
    statisticsIds: [
      "building-starts",
      "orders-major50",
      "renovation",
      "construction-investment",
      "nikkenren-group-orders",
    ],
  },
  {
    id: "production",
    title: "出来高・業界",
    statisticsIds: ["construction-output", "construction-work"],
  },
  {
    id: "supply",
    title: "コスト・供給",
    statisticsIds: [
      "construction-deflator",
      "construction-labor",
      "construction-materials",
    ],
  },
  {
    id: "workforce",
    title: "労働・人材",
    statisticsIds: [
      "labour-force-survey",
      "monthly-labour-survey",
      "wage-structure-survey",
      "public-works-labour-rate",
    ],
  },
  {
    id: "stock",
    title: "建築ストック",
    statisticsIds: ["building-stock"],
  },
];
const MAX_JSON_CACHE_ENTRIES = 10;
const jsonCache = new Map<string, Promise<unknown>>();
const REMOTE_SYSTEM_DATA_URL = (
  process.env.NEXT_PUBLIC_MLIT_SYSTEM_BASE_URL ?? ""
).replace(/\/$/, "");

function emptyAxisSettings(): Record<ChartAxis, AxisSettings> {
  return {
    left: { min: "", max: "", step: "" },
    right: { min: "", max: "", step: "" },
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 2,
  }).format(value);
}

const POINT_STATUS_LABELS: Record<string, string> = {
  not_applicable: "対象外",
  not_disclosed: "非開示",
  on_hold: "保留",
  unverified: "未確認",
  publication_pending: "公表待ち",
  missing: "欠測",
  suppressed: "秘匿",
};

function pointDisplayValue(point: ObservationPoint | undefined) {
  if (!point) return "—";
  if (point.numericValue !== null) return formatNumber(point.numericValue);
  return POINT_STATUS_LABELS[point.status] || point.value || "—";
}

function safeEvidenceUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function sourceLabelFor(sourceKind: string) {
  if (sourceKind === "estat-api") return "e-Stat（API）";
  if (sourceKind === "estat-excel") return "e-Stat（Excel）";
  if (sourceKind === "estat-file") return "e-Stat（公開ファイル）";
  if (sourceKind === "buildbase-source-verified") return "会社公開決算資料（出典確認済み）";
  if (sourceKind === "nikkenren-excel") return "日建連";
  if (sourceKind === "mhlw-excel") return "厚生労働省";
  if (sourceKind === "mlit-publication") return "国土交通省";
  if (sourceKind === "derived-estat-api") return "e-Stat（派生系列）";
  if (sourceKind === "buildbase-public-disclosures") {
    return "BuildBase（公開資料集約）";
  }
  return "e-Stat";
}

function normalizeSearch(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function statisticsIdForDataset(datasetId: string) {
  return (
    STATISTICS_FAMILIES.find((statistics) =>
      statistics.datasetIds.some((candidate) => candidate === datasetId),
    )?.id ?? datasetId
  );
}

function displayCycle(cycle: string) {
  if (cycle === "年度次") return "年度";
  if (cycle === ALL_CYCLES) return "すべて";
  return cycle;
}

function selectionLabelFor(
  meta: TableMeta,
  selections: Record<string, string>,
) {
  return (
    meta.dimensions
      .filter((dimension) => dimension.apiKey !== "time")
      .map((dimension) => {
        const code = selections[dimension.apiKey];
        return dimension.values.find((value) => value.code === code)?.name ?? code;
      })
      .filter(Boolean)
      .join(" / ") || "総数"
  );
}

function selectionsFromFavorite(meta: TableMeta, favorite: FavoriteItem) {
  const nextSelections: Record<string, string> = {};
  for (const dimension of meta.dimensions) {
    if (dimension.apiKey === "time") continue;
    const savedCode = favorite.selections[dimension.apiKey];
    nextSelections[dimension.apiKey] =
      dimension.values.some((value) => value.code === savedCode)
        ? savedCode
        : meta.defaultSelection[dimension.apiKey] ??
          defaultDimensionValue(dimension);
  }
  return nextSelections;
}

function selectionsFromPreset(meta: TableMeta, preset: StatisticsPreset) {
  const nextSelections: Record<string, string> = {};
  for (const dimension of meta.dimensions) {
    if (dimension.apiKey === "time") continue;
    if (dimension.apiKey === preset.expandDimensionApiKey) {
      nextSelections[dimension.apiKey] =
        preset.expandCodes.find((code) =>
          dimension.values.some((value) => value.code === code),
        ) ??
        meta.defaultSelection[dimension.apiKey] ??
        defaultDimensionValue(dimension);
      continue;
    }
    const presetCode = preset.baseSelections[dimension.apiKey];
    nextSelections[dimension.apiKey] =
      presetCode !== undefined &&
      dimension.values.some((value) => value.code === presetCode)
        ? presetCode
        : meta.defaultSelection[dimension.apiKey] ??
          defaultDimensionValue(dimension);
  }
  return nextSelections;
}

async function fetchJson<T>(path: string): Promise<T> {
  const requestPath =
    REMOTE_SYSTEM_DATA_URL && path.startsWith("system/")
      ? `${REMOTE_SYSTEM_DATA_URL}/${path.slice("system/".length)}`
      : path;
  const cached = jsonCache.get(requestPath);
  if (cached) return cached as Promise<T>;
  const request = (async () => {
    const response = await fetch(requestPath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "正規化された統計データがまだ公開されていません。"
          : "統計データを読み込めませんでした。",
      );
    }
    if (requestPath.endsWith(".gz")) {
      if (!response.body || typeof DecompressionStream === "undefined") {
        throw new Error(
          "圧縮データに対応した最新版のEdgeまたはChromeで開いてください。",
        );
      }
      const stream = response.body.pipeThrough(
        new DecompressionStream("gzip"),
      );
      return (await new Response(stream).json()) as T;
    }
    return (await response.json()) as T;
  })().catch((error) => {
    jsonCache.delete(requestPath);
    throw error;
  });
  jsonCache.set(requestPath, request);
  while (jsonCache.size > MAX_JSON_CACHE_ENTRIES) {
    const oldestPath = jsonCache.keys().next().value;
    if (!oldestPath) break;
    jsonCache.delete(oldestPath);
  }
  return request;
}

async function seriesIdFor(
  tableId: string,
  coordinates: Record<string, string>,
) {
  const identity = comboIdentity(coordinates);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${tableId}\u001f${identity}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function fetchCompactSeries(
  meta: TableMeta,
  coordinates: Record<string, string>,
) {
  const id = await seriesIdFor(meta.table.id, coordinates);
  const bundleUrl = meta.seriesBundleUrlTemplate.replace(
    "{prefix}",
    id.slice(0, meta.seriesBundlePrefixLength),
  );
  const bundle = await fetchJson<SeriesBundle>(bundleUrl);
  const compactSeries = bundle.series[id];
  if (!compactSeries) {
    return { id, compactSeries: null as CompactBundleSeries | null };
  }
  return { id, compactSeries };
}

function buildSelectedSeriesEntry({
  meta,
  coordinates,
  id,
  compactSeries,
  source,
  timeValues,
  timeFrom,
  timeTo,
  color,
}: {
  meta: TableMeta;
  coordinates: Record<string, string>;
  id: string;
  compactSeries: CompactBundleSeries;
  source?: {
    sourceId: string;
    sourceUrl: string;
    publishedAt: string | null;
    retrievedAt: string;
  };
  timeValues: DimensionValue[];
  timeFrom: string;
  timeTo: string;
  timeLabels: Map<string, string>;
  color: string;
}): SelectedSeries {
  return publishedWorkbenchSelection({ meta, coordinates, id, compactSeries, source: source ?? null, timeValues, timeFrom, timeTo, color }) as SelectedSeries;
}

function defaultDimensionValue(dimension: Dimension) {
  const preferred =
    dimension.values.find((value) => {
      if (dimension.apiKey === "area") {
        return /^(全国|全地域|計)$/.test(value.name);
      }
      return /^(総数|総計|合計|計|全体|すべて)$/.test(value.name);
    }) ?? dimension.values[0];
  return preferred?.code ?? "";
}

function timeLabel(value: DimensionValue) {
  return value.name || value.code;
}

// 年度マスクのbit位置は取込時のdatasets.fiscal_year_from以降の時間コード昇順で
// 決まる。データセットごとに起点が異なる（建設投資見通しは2008年度）ため、
// 画面の時間軸も同じ起点で切り出さないとbit位置がずれる。
function timeFloorFor(catalog: SystemCatalog | null, datasetId: string) {
  return (
    catalog?.datasets.find((dataset) => dataset.id === datasetId)
      ?.fiscalYearFrom ?? 2013
  );
}

function DimensionPicker({
  dimension,
  value,
  onChange,
  compareActive,
  onToggleCompare,
}: {
  dimension: Dimension;
  value: string;
  onChange: (value: string) => void;
  compareActive: boolean;
  onToggleCompare: () => void;
}) {
  const selected = dimension.values.find((item) => item.code === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const categories = dimension.apiKey === "tab" && dimension.values.length > 10
    ? [...new Set(dimension.values.map((item) => indicatorCategory(item.name)))] : [];

  const matches = useMemo(() => {
    const normalized = normalizeSearch(query);
    const values = normalized
      ? dimension.values.filter((item) =>
          normalizeSearch(`${item.name} ${item.code}`).includes(normalized),
        )
      : dimension.values;
    return values.filter((item) => !category || indicatorCategory(item.name) === category).slice(0, 80);
  }, [dimension.values, query, category]);

  return (
    <label className="system-filter">
      <span className="system-filter-label">
        <span>{dimension.name}</span>
        {dimension.values.length > 1 ? (
          <button
            type="button"
            className={
              compareActive
                ? "system-compare-toggle active"
                : "system-compare-toggle"
            }
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              onToggleCompare();
            }}
          >
            {compareActive ? "比較を解除" : "複数選択で比較"}
          </button>
        ) : null}
      </span>
      {categories.length > 1 ? <select value={category} aria-label="指標の種類で絞り込む" onChange={(event) => { setCategory(event.target.value); setQuery(""); setOpen(true); }}>
        <option value="">すべての指標</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}
      </select> : null}
      <div className="system-combobox">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
              setQuery(selected?.name ?? "");
            }, 120);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setQuery(selected?.name ?? "");
            }
          }}
          placeholder={`${dimension.name}を検索`}
          aria-label={`${dimension.name}を検索`}
        />
        {open ? (
          <div className="system-option-menu">
            {matches.map((item) => (
              <button
                type="button"
                key={item.code}
                className={item.code === value ? "selected" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(item.code);
                  setQuery(item.name);
                  setOpen(false);
                }}
              >
                <span>{item.name}</span>
                <small>{item.unit ? `${item.unit} · ` : ""}{item.code}</small>
              </button>
            ))}
            {matches.length === 0 ? <p>該当する分類がありません。</p> : null}
          </div>
        ) : null}
      </div>
      <small className="system-selected-classification">{selected?.name}{selected?.unit ? ` · ${selected.unit}` : ""}{selected?.note ? ` · ${selected.note}` : ""}</small>
    </label>
  );
}

function CompareValueList({
  dimension,
  baseSelections,
  checkedCodes,
  onChange,
  availability,
  verifiedCatalog,
  timeFrom,
  timeTo,
  maxSelectable,
}: {
  dimension: Dimension;
  baseSelections: Record<string, string>;
  checkedCodes: string[];
  onChange: (codes: string[]) => void;
  availability: Record<string, string> | null;
  verifiedCatalog: VerifiedCatalog | null;
  timeFrom: string;
  timeTo: string;
  maxSelectable: number;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const normalized = normalizeSearch(query);
    const values = normalized
      ? dimension.values.filter((item) =>
          normalizeSearch(`${item.name} ${item.code}`).includes(normalized),
        )
      : dimension.values;
    return values.slice(0, 120);
  }, [dimension.values, query]);

  return (
    <div className="system-compare-panel">
      <div className="system-compare-heading">
        <span>
          {dimension.name}を複数選択して一括追加（最大{maxSelectable}件）
        </span>
        <span className="system-compare-count">
          {checkedCodes.length}件選択中
        </span>
      </div>
      <input
        className="system-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`${dimension.name}を検索`}
        aria-label={`${dimension.name}を検索`}
      />
      <p className="system-dataset-note">他の分類条件を固定して、{dimension.name}の候補を追加できます。未確認値は参考表示、保留値は実数表で根拠を確認します。追加と直接計算の許可は別です。</p>
      <div
        className="system-compare-list"
        role="group"
        aria-label={`${dimension.name}の複数選択`}
      >
        {matches.map((item) => {
          const coordinates = { ...baseSelections, [dimension.apiKey]: item.code };
          const status = discoveryStatusFor(availability, coordinates);
          const verifiedSource = verifiedSourceForSelection(verifiedCatalog, coordinates);
          const confirmedCount = verifiedSource?.automaticComparisonAllowed === true
            ? verifiedSource.points.filter((point: ObservationPoint & { eligibility?: { automaticComparisonAllowed?: boolean }; provenance?: { comparisonVerificationId?: string; definitionChangeStatus?: string } }) =>
                (!timeFrom || point.timeCode >= timeFrom) && (!timeTo || point.timeCode <= timeTo) &&
                observationAnalysisState(point) === "valid" &&
                point.eligibility?.automaticComparisonAllowed === true &&
                point.provenance?.comparisonVerificationId &&
                point.provenance?.definitionChangeStatus === "reviewed_consistent_within_selected_window").length
            : 0;
          const unavailable = !referenceSelectionAllowed(status);
          const checked = checkedCodes.includes(item.code);
          const disabled =
            unavailable || (!checked && checkedCodes.length >= maxSelectable);
          return (
            <label
              key={item.code}
              className={
                unavailable
                  ? "system-compare-item unavailable"
                  : "system-compare-item"
              }
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => {
                  if (event.target.checked) {
                    if (checkedCodes.length >= maxSelectable) return;
                    onChange([...checkedCodes, item.code]);
                  } else {
                    onChange(checkedCodes.filter((code) => code !== item.code));
                  }
                }}
              />
              <span>{item.name}</span>
              <small className="system-compare-status">
                  {confirmedCount > 0 ? `出典確認済み ${confirmedCount}点` : status === "unchecked" ? "収録状態は追加後に確認" : (AVAILABILITY_STATUS_LABELS as Record<string, string>)[status] ?? "収録状態は追加後に確認"}
                </small>
            </label>
          );
        })}
        {matches.length === 0 ? <p>該当する分類がありません。</p> : null}
      </div>
    </div>
  );
}

function optionalAxisNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolvedAxisSettings(settings: AxisSettings) {
  return {
    min: optionalAxisNumber(settings.min),
    max: optionalAxisNumber(settings.max),
    step: optionalAxisNumber(settings.step),
  };
}

function axisSettingsError(settings: AxisSettings) {
  const { min, max, step } = resolvedAxisSettings(settings);
  if (min !== null && max !== null && min >= max) {
    return "最大値は最小値より大きくしてください。";
  }
  if (step !== null && step <= 0) {
    return "目盛間隔は0より大きい数値にしてください。";
  }
  if (
    min !== null &&
    max !== null &&
    step !== null &&
    (max - min) / step > 50
  ) {
    return "目盛りが多すぎます。間隔を大きくしてください。";
  }
  return "";
}

function SystemChart({
  series,
  timeLabels,
  axisSettings,
}: {
  series: ChartDisplaySeries[];
  timeLabels: Map<string, string>;
  axisSettings: Record<ChartAxis, AxisSettings>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const draw = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(box.width * ratio));
      canvas.height = Math.max(1, Math.floor(box.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, box.width, box.height);

      const times = Array.from(
        new Set(series.flatMap((item) => item.points.map((point) => point.timeCode))),
      ).sort();
      if (times.length === 0) return;
      const plot = {
        left: 76,
        right: box.width - 76,
        top: 28,
        bottom: box.height - 56,
      };
      const width = Math.max(1, plot.right - plot.left);
      const height = Math.max(1, plot.bottom - plot.top);
      const valuesFor = (axis: ChartAxis) =>
        series
          .filter((item) => item.axis === axis)
          .flatMap((item) =>
            item.points
              .map((point) => point.numericValue)
              .filter((value): value is number => value !== null),
          );
      const leftScale = buildAxisScale(
        valuesFor("left"),
        {
          includeZero: series.some(
            (item) => item.axis === "left" && item.chartKind === "bar",
          ),
          ...resolvedAxisSettings(axisSettings.left),
        },
      );
      const rightScale = buildAxisScale(
        valuesFor("right"),
        {
          includeZero: series.some(
            (item) => item.axis === "right" && item.chartKind === "bar",
          ),
          ...resolvedAxisSettings(axisSettings.right),
        },
      );
      const hasLeftAxis = series.some((item) => item.axis === "left");
      const hasRightAxis = series.some((item) => item.axis === "right");
      const x = (timeCode: string) => {
        const index = times.indexOf(timeCode);
        return plot.left + (width * index) / Math.max(1, times.length - 1);
      };
      const y = (value: number, axis: ChartAxis) => {
        const range = axis === "left" ? leftScale : rightScale;
        return (
          plot.bottom -
          (height * (value - range.min)) / Math.max(1e-9, range.max - range.min)
        );
      };

      context.font =
        '10px "SFMono-Regular", "Hiragino Sans", "Yu Gothic", sans-serif';
      context.lineWidth = 1;
      const primaryScale = hasLeftAxis ? leftScale : rightScale;
      const primaryAxis: ChartAxis = hasLeftAxis ? "left" : "right";
      for (const tick of primaryScale.ticks) {
        const lineY = y(tick, primaryAxis);
        context.strokeStyle = "#e1e7ef";
        context.beginPath();
        context.moveTo(plot.left, lineY);
        context.lineTo(plot.right, lineY);
        context.stroke();
      }

      if (hasLeftAxis) {
        for (const tick of leftScale.ticks) {
          const lineY = y(tick, "left");
          context.strokeStyle = "#aeb8c6";
          context.beginPath();
          context.moveTo(plot.left - 4, lineY);
          context.lineTo(plot.left, lineY);
          context.stroke();
          context.fillStyle = "#6c7789";
          context.textAlign = "right";
          context.fillText(formatNumber(tick), plot.left - 9, lineY + 3);
        }
      }
      if (hasRightAxis) {
        for (const tick of rightScale.ticks) {
          const lineY = y(tick, "right");
          context.strokeStyle = "#aeb8c6";
          context.beginPath();
          context.moveTo(plot.right, lineY);
          context.lineTo(plot.right + 4, lineY);
          context.stroke();
          context.fillStyle = "#6c7789";
          context.textAlign = "left";
          context.fillText(formatNumber(tick), plot.right + 9, lineY + 3);
        }
      }

      const labelEvery = Math.max(1, Math.ceil(times.length / 8));
      times.forEach((timeCode, index) => {
        if (index % labelEvery !== 0 && index !== times.length - 1) return;
        context.fillStyle = "#6c7789";
        context.textAlign = "center";
        context.fillText(
          workbenchChartTickLabel(timeCode, timeLabels.get(timeCode) ?? timeCode),
          x(timeCode),
          plot.bottom + 26,
        );
      });

      const bars = series.filter((item) => item.chartKind === "bar");
      const barWidth = Math.min(
        18,
        width / Math.max(2, times.length) / Math.max(1, bars.length),
      );
      context.save();
      context.beginPath();
      context.rect(plot.left, plot.top, width, height);
      context.clip();
      bars.forEach((item, itemIndex) => {
        const zeroY = Math.min(
          plot.bottom,
          Math.max(plot.top, y(0, item.axis)),
        );
        item.points.forEach((point) => {
          if (point.numericValue === null) return;
          const pointY = y(point.numericValue, item.axis);
          const offset =
            (itemIndex - (bars.length - 1) / 2) * (barWidth + 2);
          context.globalAlpha = 0.82;
          context.fillStyle = item.color;
          context.fillRect(
            x(point.timeCode) + offset - barWidth / 2,
            Math.min(zeroY, pointY),
            barWidth,
            Math.max(1, Math.abs(zeroY - pointY)),
          );
          context.globalAlpha = 1;
        });
      });

      series
        .filter((item) => item.chartKind === "line")
        .forEach((item) => {
          context.strokeStyle = item.color;
          context.fillStyle = item.color;
          context.lineWidth = 2.3;
          const reviewEdges = new Set((item.displayReviewBoundaries ?? []).map((boundary) => `${boundary.fromTimeCode}|${boundary.toTimeCode}`));
          let previous: ObservationPoint | null = null;
          for (const point of item.points) {
            if (point.numericValue === null) {
              previous = null;
              continue;
            }
            if (previous?.numericValue !== null && previous?.numericValue !== undefined) {
              context.setLineDash(reviewEdges.has(`${previous.timeCode}|${point.timeCode}`) ? [5, 4] : []);
              context.beginPath();
              context.moveTo(x(previous.timeCode), y(previous.numericValue, item.axis));
              context.lineTo(x(point.timeCode), y(point.numericValue, item.axis));
              context.stroke();
            }
            previous = point;
          }
          context.setLineDash([]);
          for (const point of item.points) {
            if (point.numericValue === null) continue;
            context.beginPath();
            context.arc(
              x(point.timeCode),
              y(point.numericValue, item.axis),
              3,
              0,
              Math.PI * 2,
            );
            context.fill();
          }
        });
      for (const boundary of series.flatMap((item) => item.displayReviewBoundaries ?? [])) {
        const markerX = (x(boundary.fromTimeCode) + x(boundary.toTimeCode)) / 2;
        context.strokeStyle = "#a36d2c";
        context.fillStyle = "#885517";
        context.lineWidth = 1;
        context.setLineDash([3, 3]);
        context.beginPath();
        context.moveTo(markerX, plot.top);
        context.lineTo(markerX, plot.bottom);
        context.stroke();
        context.setLineDash([]);
        context.textAlign = "center";
        context.fillText("資料の比較条件が異なる年度", markerX, plot.top + 12);
      }
      context.restore();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [axisSettings, series, timeLabels]);

  return (
    <canvas
      ref={canvasRef}
      className="system-chart"
      aria-label="選択した統計系列のグラフ"
      title={series.find((item) => item.displayBoundaryNote)?.displayBoundaryNote}
    />
  );
}

function downloadCsv(
  series: SelectedSeries[],
  timeLabels: Map<string, string>,
  buildBaseEvidence: BuildBaseEvidence | null,
) {
  const times = Array.from(
    new Set(series.flatMap((item) => item.points.map((point) => point.timeCode))),
  ).sort();
  const pointMaps = series.map(
    (item) =>
      new Map(item.points.map((point) => [point.timeCode, point] as const)),
  );
  const escape = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    [
      "時間コード",
      "期間",
      ...series.map((item) => `${item.tableTitle} — ${item.label}`),
    ],
    ["単位", "", ...series.map((item) => item.unit ?? "")],
    ...times.map((timeCode) => [
      timeCode,
      timeLabels.get(timeCode) ?? timeCode,
      ...pointMaps.map((points) => pointDisplayValue(points.get(timeCode))),
    ]),
    [],
    [
      "統計表ID",
      "",
      ...series.map((item) => item.tableId ?? ""),
    ],
    [
      "系列ID",
      "",
      ...series.map((item) => item.id),
    ],
    [
      "分類コード",
      "",
      ...series.map((item) =>
        Object.entries(item.coordinates)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => `${key}=${value}`)
          .join(";"),
      ),
    ],
    [
      "出典URL",
      "",
      ...series.map(
        (item) => Object.values(item.sources)[0]?.sourceUrl ?? "",
      ),
    ],
    ...(series.some((item) => item.datasetId === "buildbase-company-comparison")
      ? [
          ["公開版", "", ...series.map((item) => item.datasetId === "buildbase-company-comparison"
            ? buildBaseEvidence?.snapshotHash ?? "未確認" : "")],
          ["自動比較・集計", "", ...series.map((item) => item.datasetId === "buildbase-company-comparison"
            ? "不可" : "")],
          ["正本の最新更新", "", ...series.map((item) => item.datasetId === "buildbase-company-comparison"
            ? "未照合" : "")],
        ] : []),
    ...(series.some((item) => item.notes.length > 0)
      ? [["注記", "", ...series.map((item) => item.notes.join(" / "))]]
      : []),
  ];
  const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `建設統計_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadAiJson(
  series: SelectedSeries[],
  axisSettings: Record<ChartAxis, AxisSettings>,
  axisScales: Record<ChartAxis, ReturnType<typeof buildAxisScale>>,
  buildBaseEvidence: BuildBaseEvidence | null,
  display: { basis: string; basePeriod?: string; baseFacts?: unknown[]; chartGroups: string[][] },
) {
  const evidenceMap = new Map((buildBaseEvidence?.cellMetadata ?? []).map((item) => [
    `${item.companyId}\u001f${item.fiscalYear}\u001f${item.fieldId}`, item,
  ]));
  const includesBuildBase = series.some((item) => item.datasetId === "buildbase-company-comparison");
  const payload = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    purpose: includesBuildBase
      ? "BuildBaseの元値閲覧用。自動比較・自動集計は禁止。数値と根拠・公開版を一緒に保持する。"
      : "AIによる建設業界分析・比較・レポート作成用。数値引用時はtableId、coordinates、sourcesを保持する。",
    ...(includesBuildBase ? { buildBaseContract: {
      snapshotHash: buildBaseEvidence?.snapshotHash ?? null,
      canonicalFreshness: "not_checked",
      automaticComparisonAllowed: false,
      automaticAggregationAllowed: false,
    } } : {}),
    chart: {
      display,
      axes: axisSettings,
      resolvedScales: axisScales,
    },
    series: series.map((item) => ({
      ...workbenchComparisonMetadata(item),
      id: item.id,
      datasetId: item.datasetId,
      tableId: item.tableId,
      tableTitle: item.tableTitle,
      snapshotHash: item.snapshotHash,
      label: item.label,
      unit: item.unit,
      coordinates: item.coordinates,
      cycle: item.cycle,
      periodBasis: item.periodBasis ?? "unconfirmed",
      comparisonScope: item.comparisonScope,
      priceBasis: item.priceBasis,
      metricDefinition: item.metricDefinition ?? item.label,
      definitionReview: item.definitionReview ?? null,
      eligibility: { automaticComparisonAllowed: item.automaticComparisonAllowed, automaticAggregationAllowed: item.automaticAggregationAllowed ?? false },
      chartKind: item.chartKind,
      axis: item.axis,
      color: item.color,
      observations: item.points.map((point) => ({
        ...point,
        timeLabel: item.timeLabels[point.timeCode] ?? point.timeCode,
        ...(item.datasetId === "buildbase-company-comparison" ? {
          evidence: evidenceMap.get(`${item.coordinates.cat01}\u001f${Number(point.timeCode.slice(0, 4))}\u001f${item.coordinates.tab}`) ?? null,
          eligibility: { automaticComparisonAllowed: false, automaticAggregationAllowed: false },
        } : {}),
      })),
      sources: item.sources,
      notes: item.notes,
    })),
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `建設統計_AI分析用_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const ANALYSIS_STATE_LABELS: Record<string, string> = {
  ...POINT_STATUS_LABELS, valid: "有効数値", implicit_zero: "省略による0（分析対象外）",
  non_numeric: "文字値", unchecked: "収録状態未確認",
};

function loadedSeriesStatus(series: SelectedSeries) {
  const counts = new Map<string, number>();
  for (const point of series.points) {
    const state = observationAnalysisState(point);
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return [...counts].map(([state, count]) => `${ANALYSIS_STATE_LABELS[state] ?? state} ${count}点`).join(" · ") || "対象期間の観測値なし";
}

function SeriesAnalysis({ series }: { series: SelectedSeries[] }) {
  const [meaning, setMeaning] = useState("");
  const [definitionsReviewed, setDefinitionsReviewed] = useState(false);
  const [reviewedPairKey, setReviewedPairKey] = useState("");
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const left = series.find((item) => item.id === leftId) ?? series[0];
  const right = series.find((item) => item.id === rightId) ?? series.find((item) => item.id !== left?.id);
  const pairKey = `${left?.id ?? ""}|${right?.id ?? ""}`;
  const reviewConfirmed = definitionsReviewed && reviewedPairKey === pairKey;
  const [calculation, setCalculation] = useState<{
    left: SelectedSeries; right: SelectedSeries; result: ReturnType<typeof calculatePearsonComparison>;
  } | null>(null);
  const compatibilityError = correlationReviewCompatibility(left, right, { meaning, definitionsReviewed: reviewConfirmed }) || comparisonCompatibility(left, right);
  const result = calculation?.left === left && calculation?.right === right && reviewConfirmed && meaning.trim() ? calculation?.result : null;
  const validPeriod = result?.commonPeriods.length
    ? `${left?.timeLabels[result.commonPeriods[0]]} ～ ${left?.timeLabels[result.commonPeriods.at(-1)!]}`
    : "なし";
  return (
    <details className="system-analysis">
      <summary>2指標の関係を確認（相関・定義の確認）</summary>
      <p>同じ単位・周期・価格基準・対象範囲の2系列について、共通期間の確定数値だけで Pearson 相関係数を計算します。期間の補間・集約・単位変換は行いません。</p>
      <div className="system-analysis-controls">
        {(["left", "right"] as const).map((side) => {
          const selected = side === "left" ? left : right;
          return (
            <label key={side}>
              <span>{side === "left" ? "系列1" : "系列2"}</span>
              <select value={selected?.id ?? ""}
                onChange={(event) => { if (side === "left") setLeftId(event.target.value); else setRightId(event.target.value); setDefinitionsReviewed(false); setReviewedPairKey(""); setCalculation(null); }}>
                {!selected ? <option value="">系列を選択</option> : null}
                {series.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.tableTitle}</option>)}
              </select>
              {selected ? <small className="system-selected-classification">{selected.label} · {selected.tableTitle}</small> : null}
            </label>
          );
        })}
        <label><span>確認したい2指標の関係</span><input value={meaning} onChange={(event) => { setMeaning(event.target.value); setCalculation(null); }} placeholder="例：受注と売上総利益の年度推移の関連" /></label>
        <label><input type="checkbox" checked={reviewConfirmed} onChange={(event) => { setDefinitionsReviewed(event.target.checked); setReviewedPairKey(event.target.checked ? pairKey : ""); }} />定義・対象範囲・価格基準・実期間と変更注記を確認した</label>
        <button type="button" disabled={Boolean(compatibilityError)}
          onClick={() => left && right && setCalculation({ left, right, result: calculatePearsonComparison(left, right) })}>相関を計算</button>
      </div>
      {compatibilityError ? <p role="status">{compatibilityError}</p> : null}
      {result ? (
        <div className="system-analysis-result" role="status">
          <strong>{result.ok ? `Pearson r = ${"r" in result && typeof result.r === "number" ? result.r.toFixed(3) : "—"}` : result.reason}</strong>
          <p>{result.n < 10 ? <strong>少数の観測です（n={result.n}）。傾向や関連性を確かな根拠として判断できません。 </strong> : null}共通有効ペア n = {result.n} · 共通有効期間: {validPeriod} · 除外した期間ペア: {result.omittedPairs}</p>
          <p>有効期間: {result.commonPeriods.length ? result.commonPeriods.map((time: string) => left?.timeLabels[time]).join("、") : "なし"}</p>
          {result.excludedStates.length ? <p>除外状態: {result.excludedStates.map((state: string) => ANALYSIS_STATE_LABELS[state] ?? state).join("、")}</p> : null}
        </div>
      ) : null}
      <p>欠測・非開示・文字値・未確認値・省略による0は計算対象外です。相関は因果関係を示しません。長期トレンド、標本数、各系列の母集団・出典・注記を確認してください。</p>
      {[left, right].filter((item): item is SelectedSeries => Boolean(item)).map((item, index) => item.notes.length ? <p key={index}>系列{index + 1}の注記: {item.notes.join(" / ")}</p> : null)}
    </details>
  );
}

export default function StatisticsSystemWorkbench() {
  const [catalog, setCatalog] = useState<SystemCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [verifiedCatalog, setVerifiedCatalog] = useState<VerifiedCatalog | null>(null);
  const [reviewedCompanyConnection,setReviewedCompanyConnection]=useState<Awaited<ReturnType<typeof reviewedCompanyCatalog>> | null>(null);
  const [verifiedError, setVerifiedError] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [displayBasis, setDisplayBasis] = useState<"actual" | "indexed">("actual");
  const [indexBase, setIndexBase] = useState("");
  const [cycleFilter, setCycleFilter] = useState<CycleFilter>("年度次");
  const [statisticsId, setStatisticsId] = useState(
    "buildbase-company-comparison",
  );
  const [tableSearch, setTableSearch] = useState("");
  const [tableId, setTableId] = useState("");
  const [meta, setMeta] = useState<TableMeta | null>(null);
  const [buildBaseEvidence, setBuildBaseEvidence] = useState<BuildBaseEvidence | null>(null);
  const [buildBaseEvidenceError, setBuildBaseEvidenceError] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [selectedSeries, setSelectedSeries] = useState<SelectedSeries[]>([]);
  const [axisSettings, setAxisSettings] =
    useState<Record<ChartAxis, AxisSettings>>(emptyAxisSettings);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const pendingFavoriteRef = useRef<FavoriteItem | null>(null);
  const pendingPresetRef = useRef<StatisticsPreset | null>(null);
  const [loadingPreset, setLoadingPreset] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [addingSeries, setAddingSeries] = useState(false);
  const [message, setMessage] = useState("");
  const [compareDimensionKey, setCompareDimensionKey] = useState<
    string | null
  >(null);
  const [compareCodes, setCompareCodes] = useState<string[]>([]);
  const [availabilityIndex, setAvailabilityIndex] = useState<Record<
    string,
    string
  > | null>(null);

  useEffect(() => {
    if (meta?.table.datasetId !== "buildbase-company-comparison") {
      return;
    }
    if (!meta.evidenceUrl || !meta.snapshotHash ||
        meta.snapshotHash !== catalog?.tables.find((item) => item.id === meta.table.id)?.snapshotHash) {
      queueMicrotask(() => { setBuildBaseEvidence(null); setBuildBaseEvidenceError("BuildBase の公開版を確認できません。"); });
      return;
    }
    let cancelled = false;
    fetchJson<BuildBaseEvidence>(meta.evidenceUrl).then(async (evidence) => {
      if (cancelled) return;
      if (evidence.contractVersion !== meta.contractVersion || evidence.snapshotHash !== meta.snapshotHash ||
          evidence.metadataHash !== meta.metadataHash ||
          await canonicalSha256(evidence.cellMetadata) !== evidence.metadataHash) {
        setBuildBaseEvidence(null);
        setBuildBaseEvidenceError("BuildBase の数値と根拠データの版が一致しません。");
      } else {
        setBuildBaseEvidence(evidence);
        setBuildBaseEvidenceError("");
      }
    }).catch(() => {
      if (!cancelled) {
        setBuildBaseEvidence(null);
        setBuildBaseEvidenceError("BuildBase の根拠データを読み込めません。");
      }
    });
    return () => { cancelled = true; };
  }, [meta, catalog]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
        setFavorites(
          normalizeFavorites(stored ? JSON.parse(stored) : []) as FavoriteItem[],
        );
      } catch {
        setFavorites([]);
      } finally {
        setFavoritesLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) return;
    try {
      window.localStorage.setItem(
        FAVORITES_STORAGE_KEY,
        JSON.stringify(favorites),
      );
    } catch {
      queueMicrotask(() =>
        setMessage(
          "このブラウザではお気に入りを保存できません。サイトデータの保存設定を確認してください。",
        ),
      );
    }
  }, [favorites, favoritesLoaded]);

  useEffect(() => {
    fetchJson<SystemCatalog>("system/catalog.json")
      .then(async (value) => {
        if (value.schemaVersion !== 2) {
          throw new Error("公開データの形式が古いため再生成が必要です。");
        }
        try {
          const response = await fetchJson<{ series: unknown[] }>(VERIFIED_DATA_URL);
          const connection=await fetchJson<unknown>(REVIEWED_COMPANY_URL).then(reviewedCompanyCatalog).catch(()=>null);
          setReviewedCompanyConnection(connection);
          const verified = await verifiedWorkbenchCatalog([...response.series,...(connection?.responses??[])]);
          setVerifiedCatalog(verified);
          setSelectedSeries(verified.series.filter((item)=>response.series.some((row)=>(row as {payload:{id:string}}).payload.id===item.id)).map((item, index) => verifiedSeriesSelection(verified, { cat01: item.companyId, tab: item.metricId, ...(item.reviewWindow ? { reviewWindow: item.reviewWindow } : {}) }, "", "", COLORS[index % COLORS.length]) as unknown as SelectedSeries));
          setCatalog({
            ...value,
            datasets: [...value.datasets.filter((dataset) => dataset.id !== verified.dataset.id), verified.dataset],
            tables: [...value.tables.filter((table) => table.id !== verified.table.id), verified.table],
          } as SystemCatalog);
        } catch (error) {
          setVerifiedError(`確認済みデータの読込に失敗しました: ${String((error as Error).message ?? error)}`);
          setCatalog(value);
        }
        setLoadingMeta(true);
      })
      .catch((error) => setCatalogError(String(error.message ?? error)));
  }, []);

  const statisticsFamilies = useMemo(() => [
    ...STATISTICS_FAMILIES,
    ...(catalog?.datasets ?? [])
      .filter((dataset) => !STATISTICS_FAMILIES.some((family) => family.datasetIds.some((id) => id === dataset.id)))
      .map((dataset) => ({ id: dataset.id, title: dataset.title, datasetIds: [dataset.id],
        cycles: [...new Set((catalog?.tables ?? []).filter((table) => table.datasetId === dataset.id).map((table) => table.cycle))] })),
  ], [catalog]);
  const catalogSearchResults = useMemo(() => searchCatalogTables(
    catalog?.tables ?? [], catalog?.datasets ?? [], tableSearch,
  ).filter((table: TableSummary) => !sourceFilter || table.sourceKind === sourceFilter) as TableSummary[], [catalog, tableSearch, sourceFilter]);
  const statisticsForCycle = useCallback(
    (cycle: CycleFilter) =>
      statisticsFamilies.filter((statistics) => {
        if (!catalog) {
          return (
            cycle === ALL_CYCLES ||
            statistics.cycles.some((candidate) => candidate === cycle)
          );
        }
        return catalog.tables.some(
          (table) =>
            statistics.datasetIds.some(
              (datasetId) => datasetId === table.datasetId,
            ) && tableMatchesCycle(table, cycle),
        );
      }),
    [catalog, statisticsFamilies],
  );
  const availableStatistics = statisticsForCycle(cycleFilter);
  const activeStatistics =
    statisticsFamilies.find((statistics) => statistics.id === statisticsId) ??
    availableStatistics[0] ??
    statisticsFamilies[0];
  const eligibleTables = filterTablesByNavigation(
    catalog?.tables ?? [],
    activeStatistics.datasetIds,
    cycleFilter,
  ).filter((table: TableSummary) => !sourceFilter || table.sourceKind === sourceFilter) as TableSummary[];
  const activeTimeFloor = Math.min(
    ...activeStatistics.datasetIds.map((datasetId) =>
      timeFloorFor(catalog, datasetId),
    ),
  );
  const datasetTables = (() => {
    return eligibleTables
      .toSorted((left, right) => {
        const leftPreferred = left.id === DEFAULT_TABLE_IDS[left.datasetId];
        const rightPreferred = right.id === DEFAULT_TABLE_IDS[right.datasetId];
        if (leftPreferred && !rightPreferred) return -1;
        if (!leftPreferred && rightPreferred) return 1;
        return left.title.localeCompare(right.title, "ja");
      });
  })();

  const effectiveTableId = preferredTableId(
    eligibleTables,
    tableId,
    DEFAULT_TABLE_IDS,
  );

  // 表を切り替えたら複数選択の状態を持ち越さない。effect ではなく描画中に
  // 直接調整する（React公式が推奨する「propの変化に応じたstate調整」の形）。
  const [compareTableId, setCompareTableId] = useState(effectiveTableId);
  if (compareTableId !== effectiveTableId) {
    setCompareTableId(effectiveTableId);
    if (compareDimensionKey !== null) setCompareDimensionKey(null);
    if (compareCodes.length > 0) setCompareCodes([]);
    if (availabilityIndex !== null) setAvailabilityIndex(null);
  }

  useEffect(() => {
    const table = catalog?.tables.find(
      (item) => item.id === effectiveTableId,
    );
    if (!table) return;
    let cancelled = false;
    (table.id === VERIFIED_TABLE_ID && verifiedCatalog
      ? Promise.resolve(verifiedCatalog.meta as unknown as TableMeta)
      : fetchJson<TableMeta>(table.metaUrl))
      .then((value) => {
        if (cancelled) return;
        const pendingFavorite =
          pendingFavoriteRef.current?.tableId === value.table.id
            ? pendingFavoriteRef.current
            : null;
        const nextSelections = pendingFavorite
          ? selectionsFromFavorite(value, pendingFavorite)
          : Object.fromEntries(
              value.dimensions
                .filter((dimension) => dimension.apiKey !== "time")
                .map((dimension) => [
                  dimension.apiKey,
                  value.defaultSelection[dimension.apiKey] ??
                    defaultDimensionValue(dimension),
                ]),
            );
        const time = value.dimensions.find(
          (dimension) => dimension.apiKey === "time",
        );
        const timeFloor = timeFloorFor(catalog, value.table.datasetId);
        const windowTimes = value.table.id === VERIFIED_TABLE_ID
          ? verifiedWindowTimeValues(verifiedCatalog, nextSelections.reviewWindow) as DimensionValue[] : time?.values ?? [];
        const availableTimes = windowTimes.filter((item) => {
          const year = Number(item.code.slice(0, 4));
          return !Number.isFinite(year) || year >= timeFloor;
        }).toSorted((left, right) => left.code.localeCompare(right.code));
        setSelections(nextSelections);
        setTimeFrom(
          pendingFavorite &&
              availableTimes.some(
                (item) => item.code === pendingFavorite.timeFrom,
              )
            ? pendingFavorite.timeFrom
            : availableTimes[0]?.code ?? "",
        );
        setTimeTo(
          pendingFavorite &&
              availableTimes.some((item) => item.code === pendingFavorite.timeTo)
            ? pendingFavorite.timeTo
            : availableTimes.at(-1)?.code ?? "",
        );
        setMeta(value);
        setMessage(
          pendingFavorite
            ? `「${pendingFavorite.label}」の保存条件を選択しました。`
            : "",
        );
        if (pendingFavorite) pendingFavoriteRef.current = null;
      })
      .catch((error) => {
        if (cancelled) return;
        pendingFavoriteRef.current = null;
        setMeta(null);
        setMessage(String(error.message ?? error));
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalog, effectiveTableId, verifiedCatalog]);

  useEffect(() => {
    const availabilityUrl = meta?.availabilityUrl;
    if (!availabilityUrl) return;
    let cancelled = false;
    fetchJson<AvailabilityIndex>(availabilityUrl)
      .then((value) => {
        if (cancelled) return;
        setAvailabilityIndex(value.combos ?? {});
      })
      .catch(() => {
        if (!cancelled) setAvailabilityIndex(null);
      });
    return () => {
      cancelled = true;
    };
  }, [meta?.availabilityUrl]);

  const timeDimension = meta?.dimensions.find(
    (dimension) => dimension.apiKey === "time",
  );
  const metaDatasetId = meta?.table.datasetId ?? "";
  const timeValues = useMemo(() => {
    const timeFloor = timeFloorFor(catalog, metaDatasetId);
    const windowTimes = meta?.table.id === VERIFIED_TABLE_ID
      ? verifiedWindowTimeValues(verifiedCatalog, selections.reviewWindow) as DimensionValue[] : timeDimension?.values ?? [];
    return windowTimes.filter((item) => {
      const year = Number(item.code.slice(0, 4));
      return !Number.isFinite(year) || year >= timeFloor;
    }).toSorted((left, right) => left.code.localeCompare(right.code));
  }, [catalog, metaDatasetId, timeDimension, meta?.table.id, verifiedCatalog, selections.reviewWindow]);
  const timeLabels = useMemo(
    () => new Map(timeValues.map((item) => [item.code, timeLabel(item)])),
    [timeValues],
  );

  const compareDimension = meta?.dimensions.find(
    (dimension) => dimension.apiKey === compareDimensionKey,
  );
  const compareMaxSelectable = selectableCompareLimit(
    MAX_SELECTED_SERIES - selectedSeries.length,
    MAX_BULK_ADD_SERIES,
  );

  const addSeries = useCallback(async () => {
    if (!meta) return;
    if (selectedSeries.length >= MAX_SELECTED_SERIES) {
      setMessage(`比較グラフには最大${MAX_SELECTED_SERIES}系列まで追加できます。`);
      return;
    }
    setAddingSeries(true);
    setMessage("");
    try {
      const id = await seriesIdFor(meta.table.id, selections);
      if (selectedSeries.some((item) => item.id === id)) {
        throw new Error("同じ分類条件の系列はすでに追加されています。");
      }
      if (meta.table.id === VERIFIED_TABLE_ID) {
        const entry = verifiedSeriesSelection(verifiedCatalog, selections, timeFrom, timeTo, COLORS[selectedSeries.length % COLORS.length]) as unknown as SelectedSeries;
        const placement = placeSeriesInWorkbench(selectedSeries, entry);
        if (!placement.entry) throw new Error(placement.reason);
        setSelectedSeries((current) => [...current, placement.entry as SelectedSeries]);
        return;
      }
      const { compactSeries } = await fetchCompactSeries(meta, selections);
      if (!compactSeries) {
        throw new Error(
          "この分類条件に該当する公表値はありません。別の分類を選んでください。",
        );
      }
      const entry = buildSelectedSeriesEntry({
        meta,
        coordinates: selections,
        id,
        compactSeries,
        source: catalog?.sources[meta.table.id],
        timeValues,
        timeFrom,
        timeTo,
        timeLabels,
        color: COLORS[selectedSeries.length % COLORS.length],
      });
      const resolution=connectReviewedCompanySelection(entry,reviewedCompanyConnection);
      const additions:SelectedSeries[]=[];
      for(const candidate of resolution.entries){const placement=placeSeriesInWorkbench([...selectedSeries,...additions],candidate);if(!placement.entry)throw new Error(placement.reason);additions.push(placement.entry as SelectedSeries);}
      if(selectedSeries.length+additions.length>MAX_SELECTED_SERIES)throw new Error("確認済み年度と未確認年度を分けて追加するため、比較欄の空きを増やしてください。");
      setSelectedSeries((current)=>[...current,...additions]);
      setMessage(resolution.reviewedPoints?`${resolution.reviewedPoints}年度を出典確認済みの比較へ接続しました。${resolution.reasons.join(" ")}`:resolution.reasons.join(" "));
    } catch (error) {
      setMessage(String((error as Error).message ?? error));
    } finally {
      setAddingSeries(false);
    }
  }, [
    catalog,
    verifiedCatalog,
    reviewedCompanyConnection,
    meta,
    selectedSeries,
    selections,
    timeFrom,
    timeLabels,
    timeTo,
    timeValues,
  ]);

  // 分類事項ごとに要素を選び直して「追加」を繰り返す代わりに、1つの分類事項
  // だけ複数値をチェックし、その数だけ系列を一括追加する（例: BuildBase表で
  // 項目を固定したまま会社を5社チェック→1回の追加操作で5系列展開）。
  const addManySeries = useCallback(
    async (dimensionApiKey: string, codes: string[]) => {
      if (!meta) return;
      const remainingCapacity = MAX_SELECTED_SERIES - selectedSeries.length;
      if (remainingCapacity <= 0) {
        setMessage(`比較グラフには最大${MAX_SELECTED_SERIES}系列まで追加できます。`);
        return;
      }
      const limit = selectableCompareLimit(remainingCapacity, MAX_BULK_ADD_SERIES);
      const targets = codes.slice(0, limit);
      setAddingSeries(true);
      setMessage("");
      const added: SelectedSeries[] = [];
      let skippedCount = Math.max(0, codes.length - targets.length);
      let skippedReason = "";
      try {
        for (const code of targets) {
          const coordinates = { ...selections, [dimensionApiKey]: code };
          try {
            const id = await seriesIdFor(meta.table.id, coordinates);
            if (
              selectedSeries.some((item) => item.id === id) ||
              added.some((item) => item.id === id)
            ) {
              skippedCount += 1;
              continue;
            }
            if (meta.table.id === VERIFIED_TABLE_ID) {
              const candidate = verifiedSeriesSelection(verifiedCatalog, coordinates, timeFrom, timeTo, COLORS[(selectedSeries.length + added.length) % COLORS.length]) as unknown as SelectedSeries;
              const placement = placeSeriesInWorkbench([...selectedSeries, ...added], candidate);
              if (placement.entry) added.push(placement.entry as SelectedSeries);
              else { skippedCount += 1; skippedReason = placement.reason; }
              continue;
            }
            const { compactSeries } = await fetchCompactSeries(
              meta,
              coordinates,
            );
            if (!compactSeries) {
              skippedCount += 1;
              continue;
            }
            const candidate = buildSelectedSeriesEntry({
                meta,
                coordinates,
                id,
                compactSeries,
                source: catalog?.sources[meta.table.id],
                timeValues,
                timeFrom,
                timeTo,
                timeLabels,
                color:
                  COLORS[(selectedSeries.length + added.length) % COLORS.length],
              });
            const resolution=connectReviewedCompanySelection(candidate,reviewedCompanyConnection);
            const candidates:SelectedSeries[]=[];
            for(const value of resolution.entries){const placement=placeSeriesInWorkbench([...selectedSeries,...added,...candidates],value);if(placement.entry)candidates.push(placement.entry as SelectedSeries);else skippedReason=placement.reason;}
            if(selectedSeries.length+added.length+candidates.length>MAX_SELECTED_SERIES){skippedCount+=1;skippedReason="確認済み年度と未確認年度を分けるため、比較欄の空きが不足しています。";continue;}
            added.push(...candidates);
          } catch {
            skippedCount += 1;
          }
        }
        if (added.length) {
          setSelectedSeries((current) => [...current, ...added]);
        }
        setMessage(
          skippedCount > 0
            ? `${added.length}系列を追加しました（${skippedCount}件は重複・未収録・比較条件不一致などで追加できませんでした）。${skippedReason}`
            : `${added.length}系列を追加しました。`,
        );
        setCompareCodes([]);
      } finally {
        setAddingSeries(false);
      }
    },
    [
      catalog,
      verifiedCatalog,
      reviewedCompanyConnection,
      meta,
      selectedSeries,
      selections,
      timeFrom,
      timeLabels,
      timeTo,
      timeValues,
    ],
  );

  // プリセットは「よく使う項目」と違い、条件を選ぶだけでなく該当する表の系列一式を
  // その場で一括ロードする。addManySeries()はReact stateの`selections`に依存する
  // ため、表を切り替えた直後（`meta`がまだ古い/未ロード）でも安全に呼べるよう、
  // 明示的なbaseSelectionsを受け取る専用の読み込み処理を用意する。
  const applyPresetSeries = useCallback(
    async (
      preset: StatisticsPreset,
      presetMeta: TableMeta,
      baseSelections: Record<string, string>,
    ) => {
      setLoadingPreset(true);
      setMessage("");
      const time = presetMeta.dimensions.find(
        (dimension) => dimension.apiKey === "time",
      );
      const presetTimeFloor = timeFloorFor(
        catalog,
        presetMeta.table.datasetId,
      );
      const presetTimeValues = (time?.values ?? [])
        .filter((item) => {
          const year = Number(item.code.slice(0, 4));
          return !Number.isFinite(year) || year >= presetTimeFloor;
        })
        .toSorted((left, right) => left.code.localeCompare(right.code));
      const presetTimeLabels = new Map(
        presetTimeValues.map((item) => [item.code, timeLabel(item)]),
      );
      const presetTimeFrom = presetTimeValues[0]?.code ?? "";
      const presetTimeTo = presetTimeValues.at(-1)?.code ?? "";
      const targets = preset.expandCodes.slice(0, Math.max(0, MAX_SELECTED_SERIES - selectedSeries.length));
      const added: SelectedSeries[] = [];
      let skippedCount = preset.expandCodes.length - targets.length;
      let skippedReason = "";
      for (const code of targets) {
        const coordinates = {
          ...baseSelections,
          [preset.expandDimensionApiKey]: code,
        };
        try {
          const id = await seriesIdFor(presetMeta.table.id, coordinates);
          if ([...selectedSeries, ...added].some((item) => item.id === id)) {
            skippedCount += 1;
            continue;
          }
          const { compactSeries } = await fetchCompactSeries(
            presetMeta,
            coordinates,
          );
          if (!compactSeries) {
            skippedCount += 1;
            continue;
          }
          const entry = buildSelectedSeriesEntry({
            meta: presetMeta,
            coordinates,
            id,
            compactSeries,
            source: catalog?.sources[presetMeta.table.id],
            timeValues: presetTimeValues,
            timeFrom: presetTimeFrom,
            timeTo: presetTimeTo,
            timeLabels: presetTimeLabels,
            color: COLORS[(selectedSeries.length + added.length) % COLORS.length],
          });
          const placement = placeSeriesInWorkbench([...selectedSeries, ...added], { ...entry, chartKind: preset.chartKind, axis: preset.axis });
          if (!placement.entry) { skippedCount += 1; skippedReason = placement.reason; continue; }
          added.push(placement.entry as SelectedSeries);
        } catch {
          skippedCount += 1;
        }
      }
      setSelections(baseSelections);
      setTimeFrom(presetTimeFrom);
      setTimeTo(presetTimeTo);
      setSelectedSeries((current) => [...current, ...added]);
      setMessage(
        skippedCount > 0
          ? `プリセット「${preset.title}」から${added.length}系列を読み込みました（${skippedCount}件は重複・未収録・上限・比較条件不一致などで追加できませんでした）。${skippedReason}`
          : `プリセット「${preset.title}」から${added.length}系列を読み込みました。`,
      );
      setLoadingPreset(false);
    },
    [catalog, selectedSeries],
  );

  useEffect(() => {
    const preset = pendingPresetRef.current;
    if (!preset || !meta || meta.table.id !== preset.tableId) return;
    pendingPresetRef.current = null;
    applyPresetSeries(preset, meta, selectionsFromPreset(meta, preset));
  }, [meta, applyPresetSeries]);

  const applyPreset = (preset: StatisticsPreset) => {
    const presetTable = catalog?.tables.find(
      (table) => table.id === preset.tableId && table.datasetId === preset.datasetId,
    );
    if (!presetTable) {
      setMessage(
        "このプリセットの統計表が現在の公開データにありません。",
      );
      return;
    }
    setTableSearch("");
    setCycleFilter(preset.cycle);
    setStatisticsId(statisticsIdForDataset(preset.datasetId));
    if (meta?.table.id === preset.tableId) {
      applyPresetSeries(preset, meta, selectionsFromPreset(meta, preset));
      return;
    }
    pendingPresetRef.current = preset;
    setTableId(preset.tableId);
    setLoadingMeta(true);
  };

  const currentFavoriteId = meta
    ? favoriteIdFor(meta.table.id, selections)
    : "";
  const currentFavorite = favorites.find(
    (favorite) => favorite.id === currentFavoriteId,
  );
  const currentFavoriteIsExact =
    currentFavorite?.timeFrom === timeFrom && currentFavorite?.timeTo === timeTo;

  const saveCurrentFavorite = () => {
    if (!meta) return;
    const favorite: FavoriteItem = {
      id: favoriteIdFor(meta.table.id, selections),
      datasetId: meta.table.datasetId,
      tableId: meta.table.id,
      tableTitle: meta.table.title,
      statisticsName: meta.table.statisticsName,
      label: selectionLabelFor(meta, selections),
      selections: { ...selections },
      timeFrom,
      timeTo,
      timeFromLabel: timeLabels.get(timeFrom) ?? timeFrom,
      timeToLabel: timeLabels.get(timeTo) ?? timeTo,
      savedAt: new Date().toISOString(),
    };
    setFavorites(
      (current) => upsertFavorite(current, favorite) as FavoriteItem[],
    );
    setMessage(
      currentFavorite
        ? `「${favorite.label}」のお気に入りを更新しました。`
        : `「${favorite.label}」をよく使う項目に保存しました。`,
    );
  };

  const applyFavorite = (favorite: FavoriteItem) => {
    const favoriteTable = catalog?.tables.find(
      (table) =>
        table.id === favorite.tableId &&
        table.datasetId === favorite.datasetId,
    );
    if (!favoriteTable) {
      setMessage(
        "保存した統計表が現在の公開データにありません。お気に入りを削除して選び直してください。",
      );
      return;
    }
    setTableSearch("");
    setCycleFilter(favoriteTable.cycle as CycleFilter);
    setStatisticsId(statisticsIdForDataset(favorite.datasetId));
    if (meta?.table.id === favorite.tableId) {
      setSelections(selectionsFromFavorite(meta, favorite));
      setTimeFrom(
        timeValues.some((item) => item.code === favorite.timeFrom)
          ? favorite.timeFrom
          : timeValues[0]?.code ?? "",
      );
      setTimeTo(
        timeValues.some((item) => item.code === favorite.timeTo)
          ? favorite.timeTo
          : timeValues.at(-1)?.code ?? "",
      );
      setMessage(`「${favorite.label}」の保存条件を選択しました。`);
      return;
    }
    pendingFavoriteRef.current = favorite;
    setTableId(favorite.tableId);
    setLoadingMeta(true);
  };

  const removeFavorite = (favorite: FavoriteItem) => {
    setFavorites((current) =>
      current.filter((item) => item.id !== favorite.id),
    );
    setMessage(`「${favorite.label}」をよく使う項目から削除しました。`);
  };

  const updateSeries = (
    id: string,
    patch: Partial<Pick<SelectedSeries, "chartKind" | "axis">>,
  ) => {
    const candidate = selectedSeries.find((item) => item.id === id);
    if (candidate && patch.axis) {
      const error = axisAssignmentError(selectedSeries, candidate, patch.axis);
      if (error) { setMessage(error); return; }
    }
    setSelectedSeries((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const indexedDisplay = useMemo(() => indexSeriesAtCommonPeriod(selectedSeries, indexBase), [selectedSeries, indexBase]);
  const chartGroups = useMemo(() => workbenchChartGroups(selectedSeries) as SelectedSeries[][], [selectedSeries]);
  const visualChartGroups = useMemo(() => workbenchVisualChartGroups(selectedSeries) as ChartDisplaySeries[][], [selectedSeries]);
  const tableTimes = useMemo(
    () =>
      Array.from(
        new Set(
          selectedSeries.flatMap((item) =>
            item.points.map((point) => point.timeCode),
          ),
        ),
      ).sort(),
    [selectedSeries],
  );
  const rawTableColumns = useMemo(() => workbenchRawTableColumns(selectedSeries), [selectedSeries]);
  const outputTimeLabels = useMemo(
    () =>
      new Map(
        selectedSeries.flatMap((item) =>
          Object.entries(item.timeLabels),
        ),
      ),
    [selectedSeries],
  );
  const buildBaseCellMap = useMemo(() => new Map(
    (buildBaseEvidence?.cellMetadata ?? []).map((item) => [
      `${item.companyId}\u001f${item.fiscalYear}\u001f${item.fieldId}`,
      item,
    ]),
  ), [buildBaseEvidence]);
  const buildBaseExportReady = selectedSeries.every((item) =>
    item.datasetId !== "buildbase-company-comparison" ||
    (Boolean(buildBaseEvidence?.snapshotHash) && item.snapshotHash === buildBaseEvidence?.snapshotHash),
  );
  const axisScales = useMemo(() => {
    const scaleFor = (axis: ChartAxis) =>
      buildAxisScale(
        selectedSeries
          .filter((item) => item.axis === axis)
          .flatMap((item) =>
            item.points
              .map((point) => point.numericValue)
              .filter((value): value is number => value !== null),
          ),
        {
          includeZero: selectedSeries.some(
            (item) => item.axis === axis && item.chartKind === "bar",
          ),
          ...resolvedAxisSettings(axisSettings[axis]),
        },
      );
    return { left: scaleFor("left"), right: scaleFor("right") };
  }, [axisSettings, selectedSeries]);
  const axisUnits = useMemo(
    () => ({
      left: [...new Set(
        selectedSeries
          .filter((item) => item.axis === "left")
          .map((item) => item.unit)
          .filter(Boolean),
      )].join(" / "),
      right: [...new Set(
        selectedSeries
          .filter((item) => item.axis === "right")
          .map((item) => item.unit)
          .filter(Boolean),
      )].join(" / "),
    }),
    [selectedSeries],
  );
  const hasCustomAxisSettings = Object.values(axisSettings).some((settings) =>
    Object.values(settings).some((value) => value.trim()),
  );
  const updateAxisSetting = (
    axis: ChartAxis,
    key: AxisSettingKey,
    value: string,
  ) => {
    setAxisSettings((current) => ({
      ...current,
      [axis]: { ...current[axis], [key]: value },
    }));
  };
  const selectCycle = (cycle: CycleFilter) => {
    if (cycle === cycleFilter) return;
    const nextStatistics = statisticsForCycle(cycle);
    const nextStatisticsId = nextStatistics.some(
      (statistics) => statistics.id === statisticsId,
    )
      ? statisticsId
      : nextStatistics[0]?.id;
    const nextStatisticsFamily = statisticsFamilies.find(
      (statistics) => statistics.id === nextStatisticsId,
    );
    const nextTables = nextStatisticsFamily
      ? (filterTablesByNavigation(
          catalog?.tables ?? [],
          nextStatisticsFamily.datasetIds,
          cycle,
        ) as TableSummary[])
      : [];
    const nextTableId = preferredTableId(nextTables, "", DEFAULT_TABLE_IDS);
    setCycleFilter(cycle);
    if (nextStatisticsId) setStatisticsId(nextStatisticsId);
    setTableId("");
    setTableSearch("");
    setLoadingMeta(Boolean(nextTableId && nextTableId !== effectiveTableId));
  };

  const selectCatalogTable = (table: TableSummary) => {
    if (table.id === effectiveTableId) return;
    setCycleFilter(table.cycle as CycleFilter);
    setStatisticsId(statisticsIdForDataset(table.datasetId));
    setTableId(table.id);
    setLoadingMeta(true);
  };

  return (
    <div className="system-shell">
      <aside className="system-sidebar">
        <div className="system-brand">
          <span>At</span>
          <div>
            <strong>Atlas</strong>
            <small>CONSTRUCTION DATA</small>
          </div>
        </div>
        <nav aria-label="統計の選択">
          <div className="system-catalog-search">
            <label htmlFor="atlas-catalog-search">全収録統計を検索</label>
            <input id="atlas-catalog-search" className="system-search" type="search"
              value={tableSearch} onChange={(event) => setTableSearch(event.target.value)}
              placeholder="統計名・表名" />
            <small>{catalog ? `${catalog.datasets.length}分野 · ${catalog.tables.length}表` : "カタログを読込中"} · 周期・分野を横断</small>
            <a className="system-selected-count" href="#atlas-comparison-chart">グラフ {selectedSeries.length} / {MAX_SELECTED_SERIES}系列</a>
            <Link className="system-evidence-link" href="/buildbase-data/">公開資料レコード（子会社・工事・本文）を探索 · 数値系列とは別</Link>
            {tableSearch.trim() || sourceFilter ? (
              <div className="system-catalog-results">
                <p role="status">{catalogSearchResults.length}表が該当</p>
                {catalogSearchResults.map((table) => (
                  <button type="button" key={table.id} className={table.id === effectiveTableId ? "active" : ""}
                    onClick={() => selectCatalogTable(table)}>
                    <strong>{table.title}</strong>
                    <small>{table.statisticsName} · {displayCycle(table.cycle)} · {tableCoverageLabel(table)}</small>
                  </button>
                ))}
                {catalog && !catalogSearchResults.length ? <p>該当する表がありません。収録済みの表名・統計名が検索対象です。</p> : null}
              </div>
            ) : null}
          </div>
          <label className="system-source-filter"><span>出典・収録区分</span><select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); const matching = catalog?.tables.find((item) => !event.target.value || item.sourceKind === event.target.value); if (matching) selectCatalogTable(matching); }}>
            <option value="">すべての出典</option>
            {[...new Set((catalog?.tables ?? []).map((table) => table.sourceKind))].map((kind) => <option key={kind} value={kind}>{sourceLabelFor(kind)}</option>)}
          </select></label>
          <details className="system-saved-options"><summary>保存条件・プリセット</summary><div className="system-favorites">
            <div className="system-favorites-heading">
              <small>よく使う項目</small>
              {favorites.length ? <span>{favorites.length}</span> : null}
            </div>
            {favorites.length === 0 ? (
              <p>
                分類条件を選び、
                <br />
                お気に入りとして保存
              </p>
            ) : null}
            {favorites.map((favorite) => (
              <div className="system-favorite-row" key={favorite.id}>
                <button
                  type="button"
                  className={`system-favorite-select ${
                    currentFavoriteId === favorite.id ? "active" : ""
                  }`}
                  onClick={() => applyFavorite(favorite)}
                  title={`${favorite.tableTitle} — ${favorite.label}`}
                >
                  <span aria-hidden="true">★</span>
                  <span className="system-favorite-copy">
                    <strong>{favorite.label}</strong>
                    <small>
                      {favorite.statisticsName || favorite.tableTitle}
                      {favorite.timeFromLabel && favorite.timeToLabel
                        ? ` · ${favorite.timeFromLabel}–${favorite.timeToLabel}`
                        : ""}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className="system-favorite-remove"
                  onClick={() => removeFavorite(favorite)}
                  aria-label={`${favorite.label}をよく使う項目から削除`}
                  title="よく使う項目から削除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="system-presets">
            <div className="system-presets-heading">
              <small>プリセット</small>
              <span>{STATISTICS_PRESETS.length}</span>
            </div>
            {(STATISTICS_PRESETS as StatisticsPreset[]).map((preset) => (
              <button
                type="button"
                key={preset.id}
                className="system-preset-select"
                onClick={() => applyPreset(preset)}
                disabled={loadingPreset || addingSeries || loadingMeta}
                title={preset.notes || preset.description}
              >
                <span aria-hidden="true">▣</span>
                <span className="system-preset-copy">
                  <strong>{preset.title}</strong>
                  <small>{preset.description}</small>
                </span>
              </button>
            ))}
          </div>
          </details><div className="system-cycle-filter">
            <div className="system-cycle-heading">
              <small>集計周期</small>
              <span>{displayCycle(cycleFilter)}</span>
            </div>
            <select className="system-cycle-select" value={cycleFilter}
              onChange={(event) => selectCycle(event.target.value as CycleFilter)} aria-label="集計周期を選択">
              {CYCLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}（{option.detail}）</option>)}
            </select>
          </div>
          <div className="system-statistics-heading">
            <small>該当する統計</small>
            <span>{availableStatistics.length}</span>
          </div>
          {[...DATASET_GROUPS, { id: "other", title: "その他の収録統計", statisticsIds: statisticsFamilies.filter((family) => !DATASET_GROUPS.some((group) => group.statisticsIds.includes(family.id))).map((family) => family.id) }].map((group) => {
            const statisticsItems = availableStatistics.filter((statistics) =>
              group.statisticsIds.some((id) => id === statistics.id),
            );
            if (statisticsItems.length === 0) return null;
            return (
              <div className="system-nav-group" key={group.id}>
                <small>{group.title}</small>
                {statisticsItems.map((statistics) => (
                  <button
                    type="button"
                    key={statistics.id}
                    className={statisticsId === statistics.id ? "active" : ""}
                    onClick={() => {
                      if (statisticsId === statistics.id) return;
                      setStatisticsId(statistics.id);
                      setTableId("");
                      setTableSearch("");
                      setLoadingMeta(true);
                    }}
                  >
                    <span>
                      {String(
                        statisticsFamilies.findIndex(
                          (item) => item.id === statistics.id,
                        ) + 1,
                      ).padStart(2, "0")}
                    </span>
                    {statistics.title}
                    <small className="system-family-count">{catalog?.tables.filter((table) => statistics.datasetIds.some((id) => id === table.datasetId) && tableMatchesCycle(table, cycleFilter)).length ?? 0}表</small>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="system-status">
          <i className={catalog ? "ready" : ""} />
          <div>
            <strong>{catalog ? "公開データ読込済み" : "データ接続待ち"}</strong>
            <small>国交省統計 · 日建連 · BuildBase企業データ</small>
          </div>
        </div>
      </aside>

      <main className="system-main">
        <header className="system-topbar">
          <div>
            <p>国土交通省 / e-Stat / 日建連 / BuildBase</p>
            <h1>
              データを探し、選んだ系列を見る
            </h1>
          </div>
          <div className="system-badges">
            <span>{displayCycle(cycleFilter)}</span>
            <span>
              {activeTimeFloor}
              {(activeStatistics.cycles as readonly string[]).includes("年度次")
                ? "年度"
                : "年"}
              以降
            </span>
            <span>出典付き</span>
          </div>
        </header>

        {catalogError ? (
          <section className="system-blocker">
            <span>DATA SETUP</span>
            <h2>統計項目レジストリを準備中です</h2>
            <p>{catalogError}</p>
            <p>
              旧Excelビューは正本にせず、公式分類コードと正規化した観測値から
              再生成します。
            </p>
          </section>
        ) : null}

        <p className="system-flow-guidance">会社・指標・期間を選び、系列を追加。企業同士、1社の複数指標、市場統計と企業実績を同じ画面に並べられます。実数表は原資料の単位で表示します。</p>
        {verifiedError ? <p className="system-message" role="status">{verifiedError}</p> : null}

        <div className="system-layout">
          <section className="system-panel system-table-registry">
            <div className="system-panel-heading">
              <div>
                <span>ITEM REGISTRY</span>
                <h2>統計表レジストリ</h2>
              </div>
            </div>
            <p className="system-registry-count">{datasetTables.length}表 · {activeStatistics.title}</p>
            <div className="system-table-list">
              {datasetTables.map((table) => (
                <button
                  type="button"
                  key={table.id}
                  className={table.id === effectiveTableId ? "selected" : ""}
                  onClick={() => {
                    if (table.id === effectiveTableId) return;
                    setTableId(table.id);
                    setLoadingMeta(true);
                  }}
                >
                  <strong>{table.title}</strong>
                  <span>
                    {table.id === DEFAULT_TABLE_IDS[table.datasetId]
                      ? "基本表 · "
                      : ""}
                    {displayCycle(table.cycle)} ·{" "}
                    {tableCoverageLabel(table)}
                  </span>

                </button>
              ))}
              {catalog && datasetTables.length === 0 ? (
                <p className="system-empty">該当する統計表がありません。</p>
              ) : null}
            </div>
          </section>

          <section className="system-panel system-condition-panel">
            <div className="system-panel-heading">
              <div>
                <span>QUERY BUILDER</span>
                <h2>会社・指標・期間を選ぶ</h2>
              </div>
              {meta ? (
                <a href={meta.table.sourceUrl} target="_blank" rel="noreferrer">
                  公式原典
                </a>
              ) : null}
            </div>

            {loadingMeta ? <p className="system-empty">分類を読み込み中です。</p> : null}
            {meta ? (
              <>
                <div className="system-selected-table">
                  <span>{meta.table.statisticsName}</span>
                  <strong>{meta.table.title}</strong>
                  <small>
                    {displayCycle(meta.table.cycle)}
                  </small>
                </div>
                  <div className="system-query-actions system-selection-actions">
                    <button
                      type="button"
                      className="system-secondary"
                      onClick={saveCurrentFavorite}
                      disabled={
                        !favoritesLoaded ||
                        currentFavoriteIsExact ||
                        (!currentFavorite && favorites.length >= MAX_FAVORITES)
                      }
                      title={
                        !currentFavorite && favorites.length >= MAX_FAVORITES
                          ? `よく使う項目は${MAX_FAVORITES}件までです。`
                          : undefined
                      }
                    >
                      {!favoritesLoaded
                        ? "読み込み中…"
                        : currentFavoriteIsExact
                          ? "★ 保存済み"
                          : currentFavorite
                            ? "★ 保存を更新"
                            : "☆ よく使う項目に保存"}
                    </button>
                    <button
                      type="button"
                      className="system-primary"
                      onClick={() => {
                        if (compareDimensionKey && compareCodes.length > 0) {
                          addManySeries(compareDimensionKey, compareCodes);
                        } else {
                          addSeries();
                        }
                      }}
                      disabled={
                        addingSeries || loadingMeta || loadingPreset ||
                        selectedSeries.length >= MAX_SELECTED_SERIES ||
                        (compareDimensionKey !== null && compareCodes.length === 0)
                      }
                      title={
                        selectedSeries.length >= MAX_SELECTED_SERIES
                          ? `比較グラフには最大${MAX_SELECTED_SERIES}系列まで追加できます。`
                          : compareDimensionKey && compareCodes.length === 0
                            ? "複数選択で比較する分類値をチェックしてください。"
                            : undefined
                      }
                    >
                      {addingSeries
                        ? "取得中…"
                        : selectedSeries.length >= MAX_SELECTED_SERIES
                          ? `${MAX_SELECTED_SERIES}系列まで追加済み`
                          : compareDimensionKey && compareCodes.length > 0
                            ? `グラフに追加（${compareCodes.length}系列）`
                            : meta.table.datasetId === "buildbase-company-comparison" ? "グラフに追加（参考表示）" : "グラフに追加"}
                    </button>
                  </div>
                {meta.table.datasetId === "buildbase-company-comparison" ? (
                  <>
                    <p className="system-dataset-note" role="status">
                      {buildBaseEvidence
                        ? `数値と出典資料の版は一致しています。正本の最新更新との照合は未確認です。元値の参考表示です。自動比較・自動集計は許可されていません。`
                        : buildBaseEvidenceError || "BuildBase の根拠を確認中です。自動比較・自動集計は許可されていません。"}
                      {" "}<Link href="/buildbase-data/">出典・訂正・定性レコードを探す</Link>
                    </p>

                  </>
                ) : null}
                {meta.table.id === VERIFIED_TABLE_ID ? (
                  <p className="system-dataset-note">{verifiedCatalog?.coverageSummary ?? "確認済みの収録範囲を確認中です"}。確認対象は収録済みの会社・指標・実期間だけです。他の組み合わせは確認済みデータが不足する場合があります。元値の参照と直接計算の許可は別です。</p>
                ) : null}
                {meta.table.datasetId === "nikkenren-group-orders" ? (
                  <p className="system-dataset-note">
                    第1～第5グループを収録。年度により集計対象の会員社数が
                    96～98社で変わるため、同一企業群の厳密な比較ではありません。
                    年度選択と数値表には各年度の対象社数も表示します。
                  </p>
                ) : null}
                <div className="system-filters">
                  {meta.dimensions
                    .filter((dimension) => dimension.apiKey !== "time")
                    .map((dimension) => (
                      <DimensionPicker
                        key={dimension.id}
                        dimension={dimension}
                        value={selections[dimension.apiKey] ?? ""}
                        onChange={(value) => {
                          setSelections((current) => ({ ...current, [dimension.apiKey]: value }));
                          if (meta.table.id === VERIFIED_TABLE_ID && dimension.apiKey === "reviewWindow") {
                            const times = verifiedWindowTimeValues(verifiedCatalog, value) as DimensionValue[];
                            setTimeFrom(times[0]?.code ?? "");
                            setTimeTo(times.at(-1)?.code ?? "");
                          }
                        }}
                        compareActive={compareDimensionKey === dimension.apiKey}
                        onToggleCompare={() => {
                          setCompareDimensionKey((current) =>
                            current === dimension.apiKey ? null : dimension.apiKey,
                          );
                          setCompareCodes([]);
                        }}
                      />
                    ))}
                </div>
                {compareDimension ? (
                  <CompareValueList
                    dimension={compareDimension}
                    baseSelections={selections}
                    checkedCodes={compareCodes}
                    onChange={setCompareCodes}
                    availability={availabilityIndex}
                    verifiedCatalog={meta.table.id === VERIFIED_TABLE_ID ? verifiedCatalog : null}
                    timeFrom={timeFrom}
                    timeTo={timeTo}
                    maxSelectable={compareMaxSelectable}
                  />
                ) : null}
                <p className="system-selection-summary">{selectionLabelFor(meta, selections)}<br />期間: {timeLabels.get(timeFrom) ?? timeFrom} ～ {timeLabels.get(timeTo) ?? timeTo}</p>
                <div className="system-time-range">
                  <label>
                    <span>開始</span>
                    <select
                      value={timeFrom}
                      onChange={(event) => setTimeFrom(event.target.value)}
                    >
                      {timeValues.map((item) => (
                        <option key={item.code} value={item.code}>
                          {timeLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>終了</span>
                    <select
                      value={timeTo}
                      onChange={(event) => setTimeTo(event.target.value)}
                    >
                      {timeValues.map((item) => (
                        <option key={item.code} value={item.code}>
                          {timeLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>

                </div>
              </>
            ) : !loadingMeta && !catalogError ? (
              <p className="system-empty">左から統計表を選んでください。</p>
            ) : null}
            {message ? <p className="system-message">{message}</p> : null}
          </section>
        </div>

        <section id="atlas-comparison-chart" className="system-panel system-output">
          <div className="system-panel-heading">
            <div>
              <span>OUTPUT</span>
              <h2>選択した系列</h2>
            </div>
            <div className="system-output-actions">
              <button
                type="button"
                onClick={() =>
                  downloadAiJson(selectedSeries, axisSettings, axisScales, buildBaseEvidence, { basis: displayBasis, ...(displayBasis === "indexed" && indexedDisplay.ok ? { basePeriod: indexedDisplay.basePeriod, baseFacts: indexedDisplay.baseFacts } : {}), chartGroups: chartGroups.map((group) => group.map((item) => item.id)) })
                }
                disabled={selectedSeries.length === 0 || !buildBaseExportReady}
              >
                AI用JSON
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(selectedSeries, outputTimeLabels, buildBaseEvidence)
                }
                disabled={selectedSeries.length === 0 || !buildBaseExportReady}
              >
                CSV出力
              </button>
            </div>
          </div>

          {message ? <p className="system-message" role="status">{message}</p> : null}
          {selectedSeries.length ? (
            <>
              {selectedSeries.some((item) => item.datasetId === VERIFIED_DATASET_ID && item.points.length <= 3) ? <p className="system-dataset-note">確認済み系列にも観測が3点以下のものがあります。各系列の期間・点数を確認してください。推移を参照できますが、少数の観測から関連性や因果関係を判断できません。異なる指標の値を利益率や市場シェアとして扱いません。</p> : null}
              <div className="system-series-controls">
                {selectedSeries.map((item) => (
                  <div key={item.id} className="system-series-row">
                    <i style={{ background: item.color }} />
                    <div className="system-series-description">
                      <strong>{item.label}</strong>
                      <small>
                        {item.tableTitle} · {displayCycle(item.cycle)} · {item.unit || "単位なし"}
                        {item.datasetId === "buildbase-company-comparison" ? " · 参考表示／自動比較未許可" : ""}
                      </small>
                      <small>{loadedSeriesStatus(item)}</small>
                      <details className="system-series-notes"><summary>定義・期間・範囲・出典</summary>
                        <p>指標: {item.metricDefinition || item.label} · 単位: {item.unit || "未確認"}</p>
                        <p>期間基準: {item.periodBasis || `${displayCycle(item.cycle)}（開始日・終了日の整合は未確認）`} · 価格基準: {item.priceBasis} · 対象範囲: {item.comparisonScope}</p>
                        <p>{item.automaticComparisonAllowed ? "収録元の比較許可あり。直接計算には実期間・定義の確認も必要です。" : "参考表示。観測値の出典・定義・期間・比較許可が未確認のため、直接計算の対象外です。"}</p>
                        {item.definitionReview ? <p>{item.definitionReview}</p> : null}
                        {item.points.map((point) => {
                          if (!point.provenance) return null;
                          const checkedUrl = item.datasetId === VERIFIED_DATASET_ID && item.reviewWindow ? verifiedOfficialBytesCheckedUrl(point) : null;
                          return <p key={point.timeCode}><a href={point.provenance.sourceUrl} target="_blank" rel="noreferrer">{item.timeLabels[point.timeCode]} · PDF {point.provenance.pdfPage}頁</a>
                            {checkedUrl ? <><br /><a href={checkedUrl} target="_blank" rel="noreferrer">照合時点に保存資料と同じバイトを確認した公式PDF</a></> : null}
                            <br />{point.provenance.sourceQuote}</p>;
                        })}
                      </details>
                      {item.notes.length ? (
                        <details className="system-series-notes">
                          <summary>注記 {item.notes.length}件</summary>
                          <ul>
                            {item.notes.map((note) => (
                              <li key={note}>{note}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                    <select
                      value={item.chartKind}
                      onChange={(event) =>
                        updateSeries(item.id, {
                          chartKind: event.target.value as ChartKind,
                        })
                      }
                      aria-label={`${item.label}のグラフ形式`}
                    >
                      <option value="line">折れ線</option>
                      <option value="bar">棒</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedSeries((current) =>
                          current.filter((series) => series.id !== item.id),
                        )
                      }
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
              {chartGroups.length === 1 && displayBasis === "actual" ? <div className="system-axis-settings">
                <div className="system-axis-heading">
                  <div>
                    <strong>Y軸設定</strong>
                    <small>
                      空欄は自動。自動時は1・2・5刻みの見やすい目盛りに調整します。
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAxisSettings(emptyAxisSettings())}
                    disabled={!hasCustomAxisSettings}
                  >
                    自動に戻す
                  </button>
                </div>
                <div className="system-axis-grid">
                  {(["left"] as const).map((axis) => {
                    const axisLabel = axis === "left" ? "左軸" : "右軸";
                    const error = axisSettingsError(axisSettings[axis]);
                    const scale = axisScales[axis];
                    const seriesCount = selectedSeries.filter(
                      (item) => item.axis === axis,
                    ).length;
                    return (
                      <fieldset
                        key={axis}
                        className={error ? "invalid" : ""}
                      >
                        <legend>
                          {axisLabel}
                          <small>
                            {seriesCount
                              ? `${seriesCount}系列 · ${axisUnits[axis] || "単位なし"}`
                              : "系列なし"}
                          </small>
                        </legend>
                        <div className="system-axis-inputs">
                          {([
                            ["min", "最小値"],
                            ["max", "最大値"],
                            ["step", "目盛間隔"],
                          ] as const).map(([key, inputLabel]) => (
                            <label key={key}>
                              <span>{inputLabel}</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                value={axisSettings[axis][key]}
                                placeholder="自動"
                                onChange={(event) =>
                                  updateAxisSetting(
                                    axis,
                                    key,
                                    event.target.value,
                                  )
                                }
                                aria-label={`${axisLabel}の${inputLabel}`}
                                aria-invalid={Boolean(error)}
                              />
                            </label>
                          ))}
                        </div>
                        {error ? (
                          <small className="system-axis-error">{error}</small>
                        ) : seriesCount ? (
                          <small className="system-axis-preview">
                            現在: {formatNumber(scale.min)} ～{" "}
                            {formatNumber(scale.max)}／{formatNumber(scale.step)}刻み
                          </small>
                        ) : (
                          <small className="system-axis-preview">
                            系列をこの軸に割り当てると反映されます。
                          </small>
                        )}
                      </fieldset>
                    );
                  })}
                </div>
              </div>
              : null}
              {selectedSeries.some((item) => item.datasetId === "buildbase-company-comparison") ? (
                <p className="system-dataset-note">会社別収録値は未確認の参考表示です。保留値はグラフに描かず実数表に原数値を残します。出典・定義・比較許可が不足し、直接計算できません。</p>
              ) : null}
              <div className="system-display-basis">
                <label>グラフの表示基準 <select value={displayBasis} onChange={(event) => setDisplayBasis(event.target.value as "actual" | "indexed")}>
                  <option value="actual">元値（異なる単位・範囲は上下に表示）</option><option value="indexed">共通の実期間を100とした指数</option>
                </select></label>
                {displayBasis === "indexed" && indexedDisplay.ok ? <label>基準期間 <select value={indexBase || indexedDisplay.basePeriod} onChange={(event) => setIndexBase(event.target.value)}>{indexedDisplay.commonPeriods.map((period) => <option key={period} value={period}>{period.replace("/", " ～ ")}</option>)}</select></label> : null}
              </div>
              {displayBasis === "indexed" ? indexedDisplay.ok ? <>
                <p className="system-dataset-note">共通基準 {indexedDisplay.basePeriod.replace("/", " ～ ")} = 100。元値の規模・市場シェア・利益率の比較ではありません。各系列の対象範囲と定義が異なる場合があります。実数表とCSVは原資料の値です。</p>
                <div className="system-chart-scroll" tabIndex={0} aria-label="グラフを横にスクロール">
                  <SystemChart series={indexedDisplay.series as unknown as SelectedSeries[]} timeLabels={new Map(Object.entries(indexedDisplay.series[0].timeLabels))} axisSettings={emptyAxisSettings()} />
                </div>
              </> : <p className="system-message" role="status">指数化できません: {indexedDisplay.reason} 元値は下に表示します。</p> : null}
              {displayBasis === "actual" || !indexedDisplay.ok ? visualChartGroups.map((group, index) => <div className="system-chart-group" key={group[0].id}>
                <p><strong>{group.map((item) => item.label).join(" / ")}</strong> · {group[0].unit || "単位未確認"}</p>
                {group.length === 1 && selectedSeries.length > 1 && !group[0].displayOnlyJoined ? <p className="system-dataset-note">対象範囲・単位・実期間・比較許可を揃えた重ね描きの条件が未確認、または異なるため個別表示。市場全体と企業実績の規模・構成の違いを保ちます。</p> : null}
                {group.filter((item) => item.displayOnlyJoined).map((item) => <div key={item.id} className="system-dataset-note">
                  <p>{item.displayBoundaryNote} 境界の接続線は破線です。このグラフだけの表示で、元の{item.displayOriginalSeriesIds?.length}系列と比較・計算・出力の許可は変わりません。</p>
                  <details><summary>各点の原系列・確認期間・出典</summary>
                    {item.displayOrigins?.map((origin) => {
                      const url = safeEvidenceUrl(origin.point.provenance?.sourceUrl);
                      return <p key={`${origin.seriesId}:${origin.timeCode}`}>
                        {origin.timeCode} · {pointDisplayValue(origin.point)}
                        {url ? <> · <a href={url} target="_blank" rel="noreferrer">原典</a></> : null}

                      </p>;
                    })}
                  </details>
                </div>)}
                <div className="system-chart-scroll" tabIndex={0} aria-label="グラフを横にスクロール">
                  <SystemChart series={workbenchDisplaySeries(group) as ChartDisplaySeries[]} timeLabels={new Map(group.flatMap((item) => Object.entries(item.timeLabels)))} axisSettings={chartGroups.length === 1 ? axisSettings : emptyAxisSettings()} />
                </div>
                {index < visualChartGroups.length - 1 ? <hr /> : null}
              </div>) : null}
              <SeriesAnalysis series={selectedSeries} />
            </>
          ) : (
            <div className="system-chart-empty">
              <span>QUERY → SERIES</span>
              <strong>分類条件を選び、「グラフに追加」</strong>
              <p>
                会社を変えて同じ指標を追加したり、同じ会社の別の指標を追加できます。異なる単位・対象範囲の系列は上下のグラフで表示します。最大15系列まで。
              </p>
            </div>
          )}
        </section>

        {selectedSeries.length ? (
          <section className="system-panel system-data-table">
            <div className="system-panel-heading">
              <div>
                <span>TABLE</span>
                <h2>実数表（原資料の値・単位）</h2>
              </div>
            </div>
            {rawTableColumns.some((column) => column.members.length > 1) ? (
              <p className="system-dataset-note">この実数表だけ、同じ会社・原指標で、資料の確認年度が異なる系列を表示上1列に整理しています。2024年度をまたぐ比較条件は一致しません。グラフ・相関・計算・CSVは元の{selectedSeries.length}系列と、それぞれの確認年度を保持します。</p>
            ) : null}
            <div className="system-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>期間</th>
                    {rawTableColumns.map((column) => {
                      const item = column.members[0] as SelectedSeries;
                      return <th key={column.key}>
                        {column.label}
                        <small>{item.tableTitle} · {item.unit}</small>
                        {column.boundaryNote ? <small className="system-selected-classification">{column.boundaryNote}</small> : null}
                        {column.warning ? <small className="system-selected-classification">別列の理由: {column.warning}</small> : null}
                      </th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tableTimes.map((timeCode) => (
                    <tr key={timeCode}>
                      <th>
                        {outputTimeLabels.get(timeCode) ?? timeCode}
                        <small className="system-selected-classification">{timeCode}</small>
                      </th>
                      {rawTableColumns.map((column) => {
                        const item = column.members[0] as SelectedSeries;
                        const cell = workbenchRawTableCell(column, timeCode) as { point: ObservationPoint | null; origins: Array<{ series: SelectedSeries; point: ObservationPoint }> };
                        const point = cell.point ?? undefined;
                        const evidence = item.datasetId === "buildbase-company-comparison"
                          ? buildBaseCellMap.get(`${item.coordinates.cat01}\u001f${Number(timeCode.slice(0, 4))}\u001f${item.coordinates.tab}`)
                          : null;
                        const evidenceUrl = safeEvidenceUrl(evidence?.source?.url);
                        return (
                          <td
                            key={column.key}
                            className={
                              point?.status && point.status !== "confirmed_value"
                                ? `system-cell-status status-${point.status}`
                                : undefined
                            }
                            title={[point?.annotation, evidence?.valueState, evidence?.disclosureStatus,
                              evidence?.sourceBindingStatus].filter(Boolean).join(" / ") || undefined}
                          >
                            {!point && item.datasetId === VERIFIED_DATASET_ID ? "未収録（確認済み系列）" : pointDisplayValue(point)}
                            {column.members.length > 1 && cell.origins.length ? (
                              <small style={{ display: "block", overflowWrap: "anywhere" }}>
                                {cell.origins.map((origin) => origin.series.reviewWindow
                                  ? `確認期間 ${origin.series.reviewWindow.replace(/^FY(\d{4})_FY(\d{4})$/, "$1～$2年度")}`
                                  : "資料を確認した年度（2023年度以前）").join("・")}
                                <details><summary>原系列・出典</summary>
                                  {cell.origins.map((origin) => {
                                    const url = safeEvidenceUrl(origin.point.provenance?.sourceUrl);
                                    return <span key={`${origin.series.id}:${origin.point.sourceId}`} style={{ display: "block", overflowWrap: "anywhere" }}>
                                      出典資料の記録
                                      {url ? <> · <a href={url} target="_blank" rel="noreferrer">原典</a></> : null}
                                    </span>;
                                  })}
                                </details>
                              </small>
                            ) : null}
                            {item.datasetId === "buildbase-company-comparison" ? (
                              <small style={{ display: "block" }}>
                                {point?.status && point.status !== "confirmed_value"
                                  ? (POINT_STATUS_LABELS[point.status] ?? "未確認") : "出典状態を参照"}
                                {" · "}{point?.numericValue !== null && point?.numericValue !== undefined
                                  ? "旧収録値（参考）" : "数値なし"} · {String((point as ObservationPoint & {comparisonUnresolvedReason?:string})?.comparisonUnresolvedReason ?? (item as SelectedSeries & {comparisonUnresolvedReason?:string}).comparisonUnresolvedReason ?? "この会社・指標・年度の比較条件は未確認です。")}
                                {evidence?.history && typeof evidence.history === "object" &&
                                  (evidence.history as Record<string, unknown>).activeHold ? " · 保留中" : ""}
                                {evidenceUrl ? <> · <a href={evidenceUrl} target="_blank" rel="noreferrer">原典</a></> : null}
                                {evidence ? (
                                  <details><summary>根拠・訂正の詳細</summary><pre>{JSON.stringify({
                                    source: evidence.source,
                                    semantics: evidence.semantics,
                                    eligibility: evidence.eligibility,
                                    history: evidence.history,
                                  }, null, 2)}</pre></details>
                                ) : null}
                              </small>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="system-provenance">
              <strong>出典</strong>
              {selectedSeries.flatMap((item) =>
                Object.entries(item.sources).map(([sourceId, source]) => (
                  <a
                    key={`${item.id}:${sourceId}`}
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.label} — {item.sourceLabel}
                  </a>
                )),
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
