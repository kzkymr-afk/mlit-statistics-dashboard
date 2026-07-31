"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { buildAxisScale } from "@/lib/chart-scale.mjs";

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
};
const DATASET_ORDER = [
  "building-starts",
  "building-starts-monthly",
  "orders-major50",
  "orders-major50-monthly",
  "renovation",
  "construction-investment",
  "construction-output",
  "construction-work",
  "construction-deflator",
  "construction-labor",
  "construction-materials",
  "building-stock",
];
const DATASET_GROUPS = [
  {
    id: "demand",
    title: "需要・受注",
    datasetIds: [
      "building-starts",
      "building-starts-monthly",
      "orders-major50",
      "orders-major50-monthly",
      "renovation",
      "construction-investment",
    ],
  },
  {
    id: "production",
    title: "出来高・業界",
    datasetIds: ["construction-output", "construction-work"],
  },
  {
    id: "supply",
    title: "コスト・供給",
    datasetIds: [
      "construction-deflator",
      "construction-labor",
      "construction-materials",
    ],
  },
  {
    id: "stock",
    title: "建築ストック",
    datasetIds: ["building-stock"],
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
  anchor.download = `国交省統計_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function StatisticsSystemWorkbench() {
  const [catalog, setCatalog] = useState<SystemCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [datasetId, setDatasetId] = useState("building-starts");
  const [tableSearch, setTableSearch] = useState("");
  const [tableId, setTableId] = useState("");
  const [meta, setMeta] = useState<TableMeta | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [selectedSeries, setSelectedSeries] = useState<SelectedSeries[]>([]);
  const [axisSettings, setAxisSettings] =
    useState<Record<ChartAxis, AxisSettings>>(emptyAxisSettings);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [addingSeries, setAddingSeries] = useState(false);
  const [message, setMessage] = useState("");

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

  const datasetTables = useMemo(() => {
    const normalized = normalizeSearch(tableSearch);
    return (catalog?.tables ?? [])
      .filter(
      (table) =>
        table.datasetId === datasetId &&
        (!normalized ||
          normalizeSearch(
            `${table.title} ${table.statisticsName} ${table.id}`,
          ).includes(normalized)),
      )
      .toSorted((left, right) => {
        const preferredId = DEFAULT_TABLE_IDS[datasetId];
        if (left.id === preferredId) return -1;
        if (right.id === preferredId) return 1;
        return left.title.localeCompare(right.title, "ja");
      });
  }, [catalog, datasetId, tableSearch]);

  const effectiveTableId = useMemo(() => {
    const current = catalog?.tables.find(
      (table) => table.id === tableId && table.datasetId === datasetId,
    );
    return (
      current?.id ??
      catalog?.tables.find(
        (table) =>
          table.datasetId === datasetId &&
          table.id === DEFAULT_TABLE_IDS[datasetId],
      )?.id ??
      catalog?.tables.find((table) => table.datasetId === datasetId)?.id ??
      ""
    );
  }, [catalog, datasetId, tableId]);

  useEffect(() => {
    const table = catalog?.tables.find(
      (item) => item.id === effectiveTableId,
    );
    if (!table) return;
    let cancelled = false;
    fetchJson<TableMeta>(table.metaUrl)
      .then((value) => {
        if (cancelled) return;
        const nextSelections: Record<string, string> = {};
        for (const dimension of value.dimensions) {
          if (dimension.apiKey === "time") continue;
          nextSelections[dimension.apiKey] =
            value.defaultSelection[dimension.apiKey] ??
            defaultDimensionValue(dimension);
        }
        const time = value.dimensions.find(
          (dimension) => dimension.apiKey === "time",
        );
        const availableTimes = (time?.values ?? []).filter((item) => {
          const year = Number(item.code.slice(0, 4));
          return !Number.isFinite(year) || year >= 2013;
        }).toSorted((left, right) => left.code.localeCompare(right.code));
        setSelections(nextSelections);
        setTimeFrom(availableTimes[0]?.code ?? "");
        setTimeTo(availableTimes.at(-1)?.code ?? "");
        setMeta(value);
        setMessage("");
      })
      .catch((error) => {
        if (cancelled) return;
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
      const seriesLabel =
        meta.dimensions
          .filter((dimension) => dimension.apiKey !== "time")
          .map((dimension) => {
            const code = selections[dimension.apiKey];
            return (
              dimension.values.find((value) => value.code === code)?.name ??
              code
            );
          })
          .filter(Boolean)
          .join(" / ") || "総数";
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
  const availableDatasets = (
    catalog?.datasets ?? [
      { id: "building-starts", title: "建築着工統計" },
      { id: "building-starts-monthly", title: "建築着工統計（月次主要系列）" },
      { id: "orders-major50", title: "受注動態（大手50社）" },
      { id: "orders-major50-monthly", title: "受注動態・大手50社（月次）" },
      { id: "renovation", title: "建築物リフォーム・リニューアル調査" },
      { id: "construction-investment", title: "建設投資見通し" },
      { id: "construction-output", title: "建設総合統計（出来高・手持ち）" },
      { id: "construction-work", title: "建設工事施工統計調査" },
      { id: "construction-deflator", title: "建設工事費デフレーター" },
      { id: "construction-labor", title: "建設労働需給調査" },
      { id: "construction-materials", title: "主要建設資材需給・価格動向調査" },
      { id: "building-stock", title: "建築物ストック統計" },
    ]
  ).toSorted(
    (left, right) =>
      DATASET_ORDER.indexOf(left.id) - DATASET_ORDER.indexOf(right.id),
  );

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
          {DATASET_GROUPS.map((group) => {
            const datasets = availableDatasets.filter((dataset) =>
              group.datasetIds.includes(dataset.id),
            );
            if (datasets.length === 0) return null;
            return (
              <div className="system-nav-group" key={group.id}>
                <small>{group.title}</small>
                {datasets.map((dataset) => (
                  <button
                    type="button"
                    key={dataset.id}
                    className={datasetId === dataset.id ? "active" : ""}
                    onClick={() => {
                      setDatasetId(dataset.id);
                      setTableSearch("");
                      setLoadingMeta(true);
                    }}
                  >
                    <span>
                      {String(DATASET_ORDER.indexOf(dataset.id) + 1).padStart(
                        2,
                        "0",
                      )}
                    </span>
                    {dataset.title}
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
            <small>e-Stat DB/API 主系 · Excel補完</small>
          </div>
        </div>
      </aside>

      <main className="system-main">
        <header className="system-topbar">
          <div>
            <p>国土交通省 / e-Stat</p>
            <h1>必要な統計項目だけを取り出す</h1>
          </div>
          <div className="system-badges">
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
              旧Excelビューは正本にせず、e-Statの公式分類コードと観測値から
              再生成します。
            </p>
          </section>
        ) : null}

        <section className="system-workflow" aria-label="統計条件の指定">
          <div className="system-step">
            <span>STEP 1</span>
            <strong>統計表</strong>
            <small>{datasetTables.length}件</small>
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
                    setTableId(table.id);
                    setLoadingMeta(true);
                  }}
                >
                  <strong>{table.title}</strong>
                  <span>
                    {table.id === DEFAULT_TABLE_IDS[datasetId]
                      ? "基本表 · "
                      : ""}
                    {table.cycle} ·{" "}
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
                    統計表ID {meta.table.id} · {meta.table.cycle}
                  </small>
                </div>
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
                  <button
                    type="button"
                    className="system-primary"
                    onClick={addSeries}
                    disabled={addingSeries || selectedSeries.length >= 5}
                  >
                    {addingSeries ? "取得中…" : "この系列を追加"}
                  </button>
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
                    {item.label} — e-Stat
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
