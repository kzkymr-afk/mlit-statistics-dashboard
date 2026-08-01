"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { buildAxisScale } from "@/lib/chart-scale.mjs";
import {
  FAVORITES_STORAGE_KEY,
  MAX_FAVORITES,
  favoriteIdFor,
  normalizeFavorites,
  upsertFavorite,
} from "@/lib/statistics-favorites.mjs";
import {
  ALL_CYCLES,
  filterTablesByNavigation,
  preferredTableId,
  tableMatchesCycle,
} from "@/lib/statistics-navigation.mjs";

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
};

type ObservationPoint = {
  timeCode: string;
  value: string | null;
  numericValue: number | null;
  unit: string | null;
  annotation: string | null;
  status: string;
  sourceId: string;
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

type SelectedSeries = {
  id: string;
  tableId: string;
  tableTitle: string;
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
};

const COLORS = ["#2367d1", "#0f8c72", "#d17a17", "#7459c6", "#c14953"];
const DEFAULT_TABLE_IDS: Record<string, string> = {
  "building-starts": "0003119773",
  "building-starts-monthly": "0003119745",
  "orders-major50": "0003126300",
  "orders-major50-monthly": "0003126275",
  renovation: "0003360953",
  "construction-output": "0003458439",
  "construction-deflator": "0004055083",
  "construction-investment": "0004030738",
  "construction-work": "0004016760",
  "construction-labor": "excel-00600050-national-shortage",
  "construction-materials": "excel-00600060-prefecture-index",
  "building-stock": "excel-00600940-private-national",
  "nikkenren-group-orders": "nikkenren-group-orders-annual",
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
    id: "building-stock",
    title: "建築物ストック統計",
    datasetIds: ["building-stock"],
    cycles: ["年次"],
  },
] as const;
const DATASET_GROUPS = [
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
    id: "stock",
    title: "建築ストック",
    statisticsIds: ["building-stock"],
  },
];
const MAX_JSON_CACHE_ENTRIES = 10;
const jsonCache = new Map<string, Promise<unknown>>();

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

async function fetchJson<T>(path: string): Promise<T> {
  const cached = jsonCache.get(path);
  if (cached) return cached as Promise<T>;
  const request = (async () => {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "正規化された統計データがまだ公開されていません。"
          : "統計データを読み込めませんでした。",
      );
    }
    if (path.endsWith(".gz")) {
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
    jsonCache.delete(path);
    throw error;
  });
  jsonCache.set(path, request);
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
  const identity = Object.entries(coordinates)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\u001f");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${tableId}\u001f${identity}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
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

function timeMaskIncludes(timeMask: number | string, index: number) {
  const normalizedMask =
    typeof timeMask === "string"
      ? BigInt(`0x${timeMask.replace(/^x/, "")}`)
      : BigInt(timeMask);
  return (
    (normalizedMask & (BigInt(1) << BigInt(index))) !== BigInt(0)
  );
}

function DimensionPicker({
  dimension,
  value,
  onChange,
}: {
  dimension: Dimension;
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = dimension.values.find((item) => item.code === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const normalized = normalizeSearch(query);
    const values = normalized
      ? dimension.values.filter((item) =>
          normalizeSearch(`${item.name} ${item.code}`).includes(normalized),
        )
      : dimension.values;
    return values.slice(0, 80);
  }, [dimension.values, query]);

  return (
    <label className="system-filter">
      <span>{dimension.name}</span>
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
                <small>{item.code}</small>
              </button>
            ))}
            {matches.length === 0 ? <p>該当する分類がありません。</p> : null}
          </div>
        ) : null}
      </div>
    </label>
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
  series: SelectedSeries[];
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
          timeLabels.get(timeCode) ?? timeCode,
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
          context.beginPath();
          let started = false;
          for (const point of item.points) {
            if (point.numericValue === null) {
              started = false;
              continue;
            }
            const pointX = x(point.timeCode);
            const pointY = y(point.numericValue, item.axis);
            if (started) context.lineTo(pointX, pointY);
            else context.moveTo(pointX, pointY);
            started = true;
          }
          context.stroke();
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
    />
  );
}

function downloadCsv(
  series: SelectedSeries[],
  timeLabels: Map<string, string>,
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
      ...pointMaps.map((points) => points.get(timeCode)?.value ?? ""),
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

export default function StatisticsSystemWorkbench() {
  const [catalog, setCatalog] = useState<SystemCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [cycleFilter, setCycleFilter] = useState<CycleFilter>("年度次");
  const [statisticsId, setStatisticsId] = useState("building-starts");
  const [tableSearch, setTableSearch] = useState("");
  const [tableId, setTableId] = useState("");
  const [meta, setMeta] = useState<TableMeta | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [selectedSeries, setSelectedSeries] = useState<SelectedSeries[]>([]);
  const [axisSettings, setAxisSettings] =
    useState<Record<ChartAxis, AxisSettings>>(emptyAxisSettings);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const pendingFavoriteRef = useRef<FavoriteItem | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [addingSeries, setAddingSeries] = useState(false);
  const [message, setMessage] = useState("");

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
      .then((value) => {
        if (value.schemaVersion !== 2) {
          throw new Error("公開データの形式が古いため再生成が必要です。");
        }
        setCatalog(value);
        setLoadingMeta(true);
      })
      .catch((error) => setCatalogError(String(error.message ?? error)));
  }, []);

  const statisticsForCycle = useCallback(
    (cycle: CycleFilter) =>
      STATISTICS_FAMILIES.filter((statistics) => {
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
    [catalog],
  );
  const availableStatistics = statisticsForCycle(cycleFilter);
  const activeStatistics =
    STATISTICS_FAMILIES.find((statistics) => statistics.id === statisticsId) ??
    availableStatistics[0] ??
    STATISTICS_FAMILIES[0];
  const eligibleTables = filterTablesByNavigation(
    catalog?.tables ?? [],
    activeStatistics.datasetIds,
    cycleFilter,
  ) as TableSummary[];
  const datasetTables = (() => {
    const normalized = normalizeSearch(tableSearch);
    return eligibleTables
      .filter(
        (table) =>
        (!normalized ||
          normalizeSearch(
            `${table.title} ${table.statisticsName} ${table.id}`,
          ).includes(normalized)),
      )
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

  useEffect(() => {
    const table = catalog?.tables.find(
      (item) => item.id === effectiveTableId,
    );
    if (!table) return;
    let cancelled = false;
    fetchJson<TableMeta>(table.metaUrl)
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
        const availableTimes = (time?.values ?? []).filter((item) => {
          const year = Number(item.code.slice(0, 4));
          return !Number.isFinite(year) || year >= 2013;
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
  }, [catalog, effectiveTableId]);

  const timeDimension = meta?.dimensions.find(
    (dimension) => dimension.apiKey === "time",
  );
  const timeValues = useMemo(
    () =>
      (timeDimension?.values ?? []).filter((item) => {
        const year = Number(item.code.slice(0, 4));
        return !Number.isFinite(year) || year >= 2013;
      }).toSorted((left, right) => left.code.localeCompare(right.code)),
    [timeDimension],
  );
  const timeLabels = useMemo(
    () => new Map(timeValues.map((item) => [item.code, timeLabel(item)])),
    [timeValues],
  );

  const addSeries = useCallback(async () => {
    if (!meta) return;
    setAddingSeries(true);
    setMessage("");
    try {
      const id = await seriesIdFor(meta.table.id, selections);
      if (selectedSeries.some((item) => item.id === id)) {
        throw new Error("同じ分類条件の系列はすでに追加されています。");
      }
      const bundleUrl = meta.seriesBundleUrlTemplate.replace(
        "{prefix}",
        id.slice(0, meta.seriesBundlePrefixLength),
      );
      const bundle = await fetchJson<SeriesBundle>(bundleUrl);
      const compactSeries = bundle.series[id];
      if (!compactSeries) {
        throw new Error(
          "この分類条件に該当する公表値はありません。別の分類を選んでください。",
        );
      }
      const [seriesUnit, seriesTimeMask, compactPoints] = compactSeries;
      const seriesTableId = meta.table.id;
      const seriesLabel = selectionLabelFor(meta, selections);
      const source = catalog?.sources[seriesTableId];
      const storedPoints = new Map(
        compactPoints.map(
          ([
            pointTimeCode,
            numericValue,
            nonNumericValue,
            annotation,
            exceptionalStatus,
          ]) => [
            pointTimeCode,
            {
              timeCode: pointTimeCode,
              value:
                nonNumericValue ??
                (numericValue === null ? null : String(numericValue)),
              numericValue,
              unit: seriesUnit,
              annotation,
              status: exceptionalStatus ?? "confirmed_value",
              sourceId: source?.sourceId ?? "",
            },
          ],
        ),
      );
      const points = timeValues
        .map((item, index) => ({ item, index }))
        .filter(
          ({ item, index }) =>
            timeMaskIncludes(seriesTimeMask, index) &&
            (!timeFrom || item.code >= timeFrom) &&
            (!timeTo || item.code <= timeTo),
        )
        .map(
          ({ item }) =>
            storedPoints.get(item.code) ?? {
              timeCode: item.code,
              value: "0",
              numericValue: 0,
              unit: seriesUnit,
              annotation: null,
              status: "confirmed_value",
              sourceId: source?.sourceId ?? "",
            },
        );
      setSelectedSeries((current) => [
        ...current,
        {
          id,
          tableId: seriesTableId,
          tableTitle: meta.table.title,
          coordinates: { ...selections },
          label: seriesLabel,
          unit: seriesUnit,
          timeMask: seriesTimeMask,
          points,
          chartKind: "line",
          axis: current.length === 0 ? "left" : "left",
          color: COLORS[current.length % COLORS.length],
          sourceLabel:
            meta.table.sourceKind === "nikkenren-excel"
              ? "日建連"
              : "e-Stat",
          sources: source
            ? {
                [source.sourceId]: {
                  sourceUrl: source.sourceUrl,
                  publishedAt: source.publishedAt,
                  retrievedAt: source.retrievedAt,
                },
              }
            : {},
          timeLabels: Object.fromEntries(timeLabels),
        },
      ]);
    } catch (error) {
      setMessage(String((error as Error).message ?? error));
    } finally {
      setAddingSeries(false);
    }
  }, [
    catalog,
    meta,
    selectedSeries,
    selections,
    timeFrom,
    timeLabels,
    timeTo,
    timeValues,
  ]);

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
    setSelectedSeries((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

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
  const outputTimeLabels = useMemo(
    () =>
      new Map(
        selectedSeries.flatMap((item) =>
          Object.entries(item.timeLabels),
        ),
      ),
    [selectedSeries],
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
    const nextStatisticsFamily = STATISTICS_FAMILIES.find(
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

  return (
    <div className="system-shell">
      <aside className="system-sidebar">
        <div className="system-brand">
          <span>ML</span>
          <div>
            <strong>国交省統計</strong>
            <small>STATISTICS SYSTEM</small>
          </div>
        </div>
        <nav aria-label="統計の選択">
          <div className="system-favorites">
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
          <div className="system-cycle-filter">
            <div className="system-cycle-heading">
              <small>集計周期</small>
              <span>{displayCycle(cycleFilter)}</span>
            </div>
            <div
              className="system-cycle-options"
              role="group"
              aria-label="集計周期を選択"
            >
              {CYCLE_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={cycleFilter === option.id ? "active" : ""}
                  aria-pressed={cycleFilter === option.id}
                  onClick={() => selectCycle(option.id)}
                  title={`${option.label}（${option.detail}）`}
                >
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="system-statistics-heading">
            <small>該当する統計</small>
            <span>{availableStatistics.length}</span>
          </div>
          {DATASET_GROUPS.map((group) => {
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
                        STATISTICS_FAMILIES.findIndex(
                          (item) => item.id === statistics.id,
                        ) + 1,
                      ).padStart(2, "0")}
                    </span>
                    {statistics.title}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="system-status">
          <i className={catalog ? "ready" : ""} />
          <div>
            <strong>{catalog ? "正規化DB接続済み" : "データ接続待ち"}</strong>
            <small>e-Stat DB/API 主系 · 公式Excel／日建連補完</small>
          </div>
        </div>
      </aside>

      <main className="system-main">
        <header className="system-topbar">
          <div>
            <p>国土交通省 / e-Stat / 日建連</p>
            <h1>必要な統計項目だけを取り出す</h1>
          </div>
          <div className="system-badges">
            <span>{displayCycle(cycleFilter)}</span>
            <span>2013年度以降</span>
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

        <section className="system-workflow" aria-label="統計条件の指定">
          <div className="system-step">
            <span>STEP 1</span>
            <strong>周期・統計</strong>
            <small>{activeStatistics.title}</small>
          </div>
          <div className="system-step active">
            <span>STEP 2</span>
            <strong>分類条件</strong>
            <small>公式コード</small>
          </div>
          <div className="system-step">
            <span>STEP 3</span>
            <strong>出力</strong>
            <small>表・グラフ・CSV</small>
          </div>
        </section>

        <div className="system-layout">
          <section className="system-panel system-table-registry">
            <div className="system-panel-heading">
              <div>
                <span>ITEM REGISTRY</span>
                <h2>統計表レジストリ</h2>
              </div>
            </div>
            <input
              className="system-search"
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="統計表名・項目を検索"
              aria-label="統計表名・項目を検索"
            />
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
                    {table.seriesCount.toLocaleString("ja-JP")}系列
                  </span>
                  <small>{table.id}</small>
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
                <h2>分類条件を指定</h2>
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
                    統計表ID {meta.table.id} · {displayCycle(meta.table.cycle)}
                  </small>
                </div>
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
                        onChange={(value) =>
                          setSelections((current) => ({
                            ...current,
                            [dimension.apiKey]: value,
                          }))
                        }
                      />
                    ))}
                </div>
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
                  <div className="system-query-actions">
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
                      onClick={addSeries}
                      disabled={addingSeries || selectedSeries.length >= 5}
                    >
                      {addingSeries ? "取得中…" : "この系列を追加"}
                    </button>
                  </div>
                </div>
              </>
            ) : !loadingMeta && !catalogError ? (
              <p className="system-empty">左から統計表を選んでください。</p>
            ) : null}
            {message ? <p className="system-message">{message}</p> : null}
          </section>
        </div>

        <section className="system-panel system-output">
          <div className="system-panel-heading">
            <div>
              <span>OUTPUT</span>
              <h2>比較グラフ</h2>
            </div>
            <button
              type="button"
              onClick={() =>
                downloadCsv(selectedSeries, outputTimeLabels)
              }
              disabled={selectedSeries.length === 0}
            >
              CSV出力
            </button>
          </div>

          {selectedSeries.length ? (
            <>
              <div className="system-series-controls">
                {selectedSeries.map((item) => (
                  <div key={item.id} className="system-series-row">
                    <i style={{ background: item.color }} />
                    <div className="system-series-description">
                      <strong>{item.label}</strong>
                      <small>
                        {item.tableTitle} · {item.unit || "単位なし"}
                      </small>
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
                    <select
                      value={item.axis}
                      onChange={(event) =>
                        updateSeries(item.id, {
                          axis: event.target.value as ChartAxis,
                        })
                      }
                      aria-label={`${item.label}の軸`}
                    >
                      <option value="left">左軸</option>
                      <option value="right">右軸</option>
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
              <div className="system-axis-settings">
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
                  {(["left", "right"] as const).map((axis) => {
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
              <SystemChart
                series={selectedSeries}
                timeLabels={outputTimeLabels}
                axisSettings={axisSettings}
              />
            </>
          ) : (
            <div className="system-chart-empty">
              <span>QUERY → SERIES</span>
              <strong>分類条件を選び、「この系列を追加」</strong>
              <p>
                最大5系列まで。折れ線／棒、左右2軸、軸の最小・最大・目盛間隔を指定できます。
              </p>
            </div>
          )}
        </section>

        {selectedSeries.length ? (
          <section className="system-panel system-data-table">
            <div className="system-panel-heading">
              <div>
                <span>TABLE</span>
                <h2>数値表</h2>
              </div>
            </div>
            <div className="system-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>期間</th>
                    {selectedSeries.map((item) => (
                      <th key={item.id}>
                        {item.label}
                        <small>
                          {item.tableTitle} · {item.unit}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableTimes.map((timeCode) => (
                    <tr key={timeCode}>
                      <th>
                        {outputTimeLabels.get(timeCode) ?? timeCode}
                      </th>
                      {selectedSeries.map((item) => {
                        const point = item.points.find(
                          (entry) => entry.timeCode === timeCode,
                        );
                        return (
                          <td key={item.id}>
                            {point?.numericValue === null ||
                            point?.numericValue === undefined
                              ? point?.value || "—"
                              : formatNumber(point.numericValue)}
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
