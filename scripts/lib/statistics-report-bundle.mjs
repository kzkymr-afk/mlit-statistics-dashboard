import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildAxisScale } from "../../lib/chart-scale.mjs";

const COLORS = ["#2367d1", "#0f8c72", "#d17a17", "#7459c6", "#c14953"];
const CHART_KINDS = new Set(["line", "bar"]);
const AXES = new Set(["left", "right"]);

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function asFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedDimension(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, Math.round(parsed)))
    : fallback;
}

function normalizeAxisSettings(value = {}) {
  const min = asFiniteNumber(value.min);
  const max = asFiniteNumber(value.max);
  const step = asFiniteNumber(value.step);
  if (min !== null && max !== null && min >= max) {
    throw new Error("Y軸の最小値は最大値より小さくしてください。");
  }
  if (step !== null && step <= 0) {
    throw new Error("Y軸の目盛間隔は0より大きくしてください。");
  }
  return { min, max, step };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1,
  }).format(value);
}

function timeLabelMap(series) {
  const map = new Map();
  for (const item of series) {
    for (const point of item.observations) {
      if (!map.has(point.timeCode)) {
        map.set(point.timeCode, point.timeLabel || point.timeCode);
      }
    }
  }
  return map;
}

function normalizeCustomSeries(item, index) {
  if (!item || typeof item !== "object") {
    throw new Error(`customSeries[${index}] が不正です。`);
  }
  if (!item.label || !Array.isArray(item.values)) {
    throw new Error(`customSeries[${index}] にはlabelとvaluesが必要です。`);
  }
  const source = item.source && typeof item.source === "object" ? item.source : {};
  return {
    id: item.id || `custom-${index + 1}`,
    label: String(item.label),
    unit: item.unit ? String(item.unit) : null,
    tableId: null,
    datasetId: "custom",
    tableTitle: item.tableTitle || "ユーザー提供データ",
    chartKind: CHART_KINDS.has(item.chartKind) ? item.chartKind : "line",
    axis: AXES.has(item.axis) ? item.axis : "left",
    color: item.color || COLORS[index % COLORS.length],
    coordinates: {},
    observations: item.values
      .map((point) => ({
        timeCode: String(point.timeCode ?? point.period ?? ""),
        timeLabel: String(
          point.timeLabel ?? point.periodLabel ?? point.timeCode ?? point.period ?? "",
        ),
        value:
          point.value === null || point.value === undefined
            ? null
            : String(point.value),
        numericValue: asFiniteNumber(point.numericValue ?? point.value),
        unit: point.unit || item.unit || null,
        annotation: point.annotation || null,
        status: point.status || "user_provided",
        sourceId: source.id || `custom:${index + 1}`,
        fetchedAt: source.retrievedAt || new Date().toISOString(),
        implicitNumericZero: false,
      }))
      .filter((point) => point.timeCode)
      .sort((left, right) => left.timeCode.localeCompare(right.timeCode)),
    sources: [
      {
        sourceId: source.id || `custom:${index + 1}`,
        sourceKind: source.kind || "user-provided",
        sourceUrl: source.url || null,
        localPath: source.localPath || null,
        sha256: source.sha256 || null,
        publishedAt: source.publishedAt || null,
        retrievedAt: source.retrievedAt || new Date().toISOString(),
        note: source.note || "AIレポート作成時にユーザーが提供した比較データ",
      },
    ],
  };
}

function normalizeQueriedSeries(result, item, index) {
  return {
    id: result.series.id,
    label: item.label || result.series.label,
    unit: result.series.unit,
    tableId: result.table.id,
    datasetId: result.table.datasetId,
    tableTitle: result.table.title,
    chartKind: CHART_KINDS.has(item.chartKind) ? item.chartKind : "line",
    axis: AXES.has(item.axis) ? item.axis : "left",
    color: item.color || COLORS[index % COLORS.length],
    coordinates: result.query.selections,
    dimensions: result.series.dimensions,
    observations: result.observations,
    sources: result.sources,
  };
}

function buildSvg({ title, subtitle, width, height, series, axes }) {
  const margin = { top: 122, right: 112, bottom: 132, left: 112 };
  const plot = {
    left: margin.left,
    top: margin.top,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };
  const times = Array.from(
    new Set(series.flatMap((item) => item.observations.map((point) => point.timeCode))),
  ).sort();
  const labels = timeLabelMap(series);
  const valuesFor = (axis) =>
    series
      .filter((item) => item.axis === axis)
      .flatMap((item) => item.observations.map((point) => point.numericValue))
      .filter(Number.isFinite);
  const scaleFor = (axis) => {
    const axisSeries = series.filter((item) => item.axis === axis);
    return buildAxisScale(valuesFor(axis), {
      includeZero: axisSeries.some((item) => item.chartKind === "bar"),
      ...normalizeAxisSettings(axes[axis]),
    });
  };
  const scales = { left: scaleFor("left"), right: scaleFor("right") };
  const x = (timeCode) => {
    if (times.length <= 1) return plot.left + plot.width / 2;
    return plot.left + (times.indexOf(timeCode) / (times.length - 1)) * plot.width;
  };
  const y = (value, axis) => {
    const scale = scales[axis];
    return (
      plot.top +
      plot.height -
      ((value - scale.min) / (scale.max - scale.min || 1)) * plot.height
    );
  };
  const uniqueUnits = (axis) =>
    Array.from(
      new Set(series.filter((item) => item.axis === axis).map((item) => item.unit).filter(Boolean)),
    ).join(" / ");
  const svg = [];
  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<style>text{font-family:"Hiragino Sans","Yu Gothic",sans-serif;fill:#172033}.mono{font-family:ui-monospace,SFMono-Regular,monospace}.muted{fill:#68758a}.grid{stroke:#dfe5ed;stroke-width:1}.axis{stroke:#aab4c3;stroke-width:1}.line{fill:none;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}</style>`,
    `<text x="${margin.left}" y="45" font-size="26" font-weight="700">${escapeXml(title)}</text>`,
    subtitle
      ? `<text x="${margin.left}" y="73" font-size="13" class="muted">${escapeXml(subtitle)}</text>`
      : "",
  );

  for (const tick of scales.left.ticks) {
    const tickY = y(tick, "left");
    svg.push(
      `<line x1="${plot.left}" y1="${tickY}" x2="${plot.left + plot.width}" y2="${tickY}" class="grid"/>`,
      `<text x="${plot.left - 12}" y="${tickY + 4}" text-anchor="end" font-size="11" class="mono muted">${escapeXml(formatNumber(tick))}</text>`,
    );
  }
  if (series.some((item) => item.axis === "right")) {
    for (const tick of scales.right.ticks) {
      const tickY = y(tick, "right");
      svg.push(
        `<text x="${plot.left + plot.width + 12}" y="${tickY + 4}" text-anchor="start" font-size="11" class="mono muted">${escapeXml(formatNumber(tick))}</text>`,
      );
    }
  }
  svg.push(
    `<line x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.top + plot.height}" class="axis"/>`,
    `<line x1="${plot.left}" y1="${plot.top + plot.height}" x2="${plot.left + plot.width}" y2="${plot.top + plot.height}" class="axis"/>`,
    `<text x="${plot.left}" y="${plot.top - 14}" font-size="11" class="muted">左軸 ${escapeXml(uniqueUnits("left") || "単位なし")}</text>`,
  );
  if (series.some((item) => item.axis === "right")) {
    svg.push(
      `<text x="${plot.left + plot.width}" y="${plot.top - 14}" text-anchor="end" font-size="11" class="muted">右軸 ${escapeXml(uniqueUnits("right") || "単位なし")}</text>`,
    );
  }

  const labelEvery = Math.max(1, Math.ceil(times.length / 9));
  times.forEach((timeCode, index) => {
    if (index % labelEvery !== 0 && index !== times.length - 1) return;
    const tickX = x(timeCode);
    svg.push(
      `<line x1="${tickX}" y1="${plot.top + plot.height}" x2="${tickX}" y2="${plot.top + plot.height + 6}" class="axis"/>`,
      `<text x="${tickX}" y="${plot.top + plot.height + 24}" text-anchor="middle" font-size="10" class="muted">${escapeXml(labels.get(timeCode) || timeCode)}</text>`,
    );
  });

  const barSeries = series.filter((item) => item.chartKind === "bar");
  const groupWidth = times.length > 1 ? Math.min(58, (plot.width / times.length) * 0.75) : 58;
  const barWidth = Math.max(2, groupWidth / Math.max(1, barSeries.length));
  barSeries.forEach((item, seriesIndex) => {
    const zeroY = Math.max(plot.top, Math.min(plot.top + plot.height, y(0, item.axis)));
    for (const point of item.observations) {
      if (!Number.isFinite(point.numericValue)) continue;
      const pointY = y(point.numericValue, item.axis);
      const barX = x(point.timeCode) - groupWidth / 2 + seriesIndex * barWidth;
      svg.push(
        `<rect x="${barX.toFixed(2)}" y="${Math.min(zeroY, pointY).toFixed(2)}" width="${Math.max(1, barWidth - 1).toFixed(2)}" height="${Math.max(1, Math.abs(zeroY - pointY)).toFixed(2)}" fill="${escapeXml(item.color)}" opacity="0.86"/>`,
      );
    }
  });

  for (const item of series.filter((entry) => entry.chartKind === "line")) {
    let current = [];
    const paths = [];
    for (const point of item.observations) {
      if (!Number.isFinite(point.numericValue)) {
        if (current.length) paths.push(current);
        current = [];
        continue;
      }
      current.push([x(point.timeCode), y(point.numericValue, item.axis)]);
    }
    if (current.length) paths.push(current);
    for (const path of paths) {
      svg.push(
        `<path d="${path.map(([px, py], index) => `${index ? "L" : "M"}${px.toFixed(2)},${py.toFixed(2)}`).join(" ")}" class="line" stroke="${escapeXml(item.color)}"/>`,
      );
    }
    for (const point of item.observations) {
      if (!Number.isFinite(point.numericValue)) continue;
      svg.push(
        `<circle cx="${x(point.timeCode).toFixed(2)}" cy="${y(point.numericValue, item.axis).toFixed(2)}" r="3.4" fill="${escapeXml(item.color)}"/>`,
      );
    }
  }

  let legendY = plot.top + plot.height + 58;
  let legendX = margin.left;
  for (const item of series) {
    const itemWidth = Math.min(280, 40 + item.label.length * 13);
    if (legendX + itemWidth > width - margin.right && legendX > margin.left) {
      legendX = margin.left;
      legendY += 20;
    }
    svg.push(
      `<rect x="${legendX}" y="${legendY - 10}" width="14" height="4" rx="2" fill="${escapeXml(item.color)}"/>`,
      `<text x="${legendX + 20}" y="${legendY - 4}" font-size="11">${escapeXml(item.label)}</text>`,
    );
    legendX += itemWidth;
  }
  svg.push(
    `<text x="${margin.left}" y="${height - 18}" font-size="9" class="muted">出典・分類条件は provenance.json を参照</text>`,
    "</svg>",
  );
  return { svg: svg.join("\n"), scales, times, timeLabels: labels };
}

function buildWideCsv(series, times, labels) {
  const pointMaps = series.map(
    (item) => new Map(item.observations.map((point) => [point.timeCode, point])),
  );
  const rows = [
    ["時間コード", "期間", ...series.map((item) => item.label)],
    ["単位", "", ...series.map((item) => item.unit || "")],
    ...times.map((timeCode) => [
      timeCode,
      labels.get(timeCode) || timeCode,
      ...pointMaps.map((points) => points.get(timeCode)?.numericValue ?? ""),
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
}

function buildLongCsv(series) {
  const rows = [
    [
      "系列ID",
      "統計表ID",
      "系列名",
      "時間コード",
      "期間",
      "数値",
      "原値",
      "単位",
      "注記",
      "状態",
      "出典ID",
    ],
  ];
  for (const item of series) {
    for (const point of item.observations) {
      rows.push([
        item.id,
        item.tableId || "",
        item.label,
        point.timeCode,
        point.timeLabel,
        point.numericValue ?? "",
        point.value ?? "",
        point.unit || item.unit || "",
        point.annotation || "",
        point.status,
        point.sourceId || "",
      ]);
    }
  }
  return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
}

export function buildReportBundle(engine, spec = {}) {
  const queryItems = Array.isArray(spec.series) ? spec.series : [];
  const customItems = Array.isArray(spec.customSeries) ? spec.customSeries : [];
  if (queryItems.length + customItems.length === 0) {
    throw new Error("series または customSeries を1件以上指定してください。");
  }
  if (queryItems.length + customItems.length > 10) {
    throw new Error("1つのグラフに指定できる系列は10件までです。");
  }
  const queried = queryItems.map((item, index) =>
    normalizeQueriedSeries(
      engine.querySeries({
        tableId: item.tableId,
        selections: item.selections,
        from: item.from ?? spec.from,
        to: item.to ?? spec.to,
        label: item.label,
      }),
      item,
      index,
    ),
  );
  const custom = customItems.map((item, index) =>
    normalizeCustomSeries(item, queryItems.length + index),
  );
  const series = [...queried, ...custom];
  const width = boundedDimension(spec.width, 1200, 800, 2400);
  const height = boundedDimension(spec.height, 675, 500, 1600);
  const axes = {
    left: normalizeAxisSettings(spec.axes?.left),
    right: normalizeAxisSettings(spec.axes?.right),
  };
  const title = String(spec.title || "建設統計 比較グラフ");
  const subtitle = String(spec.subtitle || "");
  const chart = buildSvg({ title, subtitle, width, height, series, axes });
  const provenance = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    title,
    series: series.map((item) => ({
      id: item.id,
      label: item.label,
      tableId: item.tableId,
      datasetId: item.datasetId,
      tableTitle: item.tableTitle,
      coordinates: item.coordinates,
      sources: item.sources,
    })),
  };
  const data = {
    schemaVersion: "1.0",
    generatedAt: provenance.generatedAt,
    title,
    subtitle,
    chart: {
      width,
      height,
      axes,
      resolvedScales: chart.scales,
    },
    series,
  };
  return {
    data,
    provenance,
    chartSvg: chart.svg,
    wideCsv: buildWideCsv(series, chart.times, chart.timeLabels),
    longCsv: buildLongCsv(series),
  };
}

export function writeReportBundle(engine, spec, outputDirectory) {
  const outputPath = resolve(outputDirectory);
  mkdirSync(outputPath, { recursive: true });
  const bundle = buildReportBundle(engine, spec);
  const files = {
    "chart.svg": bundle.chartSvg,
    "data.csv": bundle.wideCsv,
    "data_long.csv": bundle.longCsv,
    "data.json": `${JSON.stringify(bundle.data, null, 2)}\n`,
    "provenance.json": `${JSON.stringify(bundle.provenance, null, 2)}\n`,
    "query-spec.json": `${JSON.stringify(spec, null, 2)}\n`,
    "README.md": [
      `# ${bundle.data.title}`,
      "",
      "AIレポート・PowerPoint・Excelへ再利用できる統計素材パッケージです。",
      "",
      "- `chart.svg`: ベクター形式のグラフ",
      "- `data.csv`: 期間を行、系列を列にした表",
      "- `data_long.csv`: 分析・再集計向けの縦持ち表",
      "- `data.json`: 観測値、グラフ設定、解決済み軸を含む完全データ",
      "- `provenance.json`: 統計表ID、分類コード、出典URL、取得日時",
      "- `query-spec.json`: 再生成用の入力定義",
      "",
      "数値を引用する際は `provenance.json` の出典と分類条件を併記してください。",
      "",
    ].join("\n"),
  };
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(resolve(outputPath, name), content);
  }
  return {
    outputDirectory: outputPath,
    files: Object.keys(files),
    seriesCount: bundle.data.series.length,
    observationCount: bundle.data.series.reduce(
      (sum, item) => sum + item.observations.length,
      0,
    ),
  };
}
