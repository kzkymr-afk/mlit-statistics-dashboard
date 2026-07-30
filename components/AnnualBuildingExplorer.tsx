"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  AnnualCatalog,
  AnnualCatalogRecord,
  AnnualTablePayload,
  StaticDataManifest,
  StaticSeriesBundle,
  StaticTableMeta,
  StaticTablePage,
  TableRow,
} from "@/lib/annual-building-types";

type ChartKind = "line" | "bar";
type ChartAxis = "left" | "right";

type ChartPoint = {
  fiscalYear: number;
  value: number | null;
};

type ChartSeries = {
  id: string;
  label: string;
  kind: ChartKind;
  axis: ChartAxis;
  color: string;
  points: ChartPoint[];
  loading: boolean;
  progress: number;
  sourceGroupId: string;
};

const SERIES_COLORS = ["#356df3", "#20a779", "#d88928", "#7c63d9"];
const staticJsonCache = new Map<string, Promise<unknown>>();

function formatNumber(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBytes(value: number) {
  return `${Math.round(value / 1_000_000)} MB`;
}

function columnName(index: number) {
  let output = "";
  let current = index + 1;
  while (current > 0) {
    current -= 1;
    output = String.fromCharCode(65 + (current % 26)) + output;
    current = Math.floor(current / 26);
  }
  return output;
}

function recordLabel(record: AnnualCatalogRecord) {
  return `${record.fiscalYearLabel}${record.variantLabel ? ` ${record.variantLabel}` : ""}`;
}

function datasetLabel(catalog: AnnualCatalog) {
  return catalog.datasetId === "orders-major50"
    ? "受注動態（大手50社）"
    : "建築着工統計";
}

function preferredGroup(catalog: AnnualCatalog) {
  return (
    catalog.groups.find((group) =>
      catalog.datasetId === "orders-major50"
        ? group.title === "結果表"
        : group.title.startsWith("用途別、構造別／"),
    ) ?? catalog.groups[0]
  );
}

function niceMaximum(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

function SeriesChart({ series }: { series: ChartSeries[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readySeries = useMemo(
    () => series.filter((item) => !item.loading),
    [series],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const render = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(box.width * ratio));
      canvas.height = Math.max(1, Math.floor(box.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, box.width, box.height);

      const width = box.width;
      const height = box.height;
      const plot = {
        left: 68,
        right: width - 68,
        top: 30,
        bottom: height - 46,
      };
      const plotWidth = Math.max(10, plot.right - plot.left);
      const plotHeight = Math.max(10, plot.bottom - plot.top);
      const years = Array.from({ length: 13 }, (_, index) => 2013 + index);

      context.font =
        '10px "SFMono-Regular", "Hiragino Sans", "Yu Gothic", sans-serif';
      context.lineWidth = 1;

      const valuesFor = (axis: ChartAxis) =>
        readySeries
          .filter((item) => item.axis === axis)
          .flatMap((item) =>
            item.points
              .map((point) => point.value)
              .filter((value): value is number => value !== null),
          );
      const leftMax = niceMaximum(Math.max(0, ...valuesFor("left")));
      const rightMax = niceMaximum(Math.max(0, ...valuesFor("right")));

      for (let tick = 0; tick <= 4; tick += 1) {
        const y = plot.bottom - (plotHeight * tick) / 4;
        context.strokeStyle = "#e8ebf0";
        context.beginPath();
        context.moveTo(plot.left, y);
        context.lineTo(plot.right, y);
        context.stroke();

        context.fillStyle = "#7a8495";
        context.textAlign = "right";
        context.fillText(
          formatNumber((leftMax * tick) / 4),
          plot.left - 9,
          y + 3,
        );
        if (readySeries.some((item) => item.axis === "right")) {
          context.textAlign = "left";
          context.fillText(
            formatNumber((rightMax * tick) / 4),
            plot.right + 9,
            y + 3,
          );
        }
      }

      const xForYear = (year: number) =>
        plot.left + (plotWidth * (year - 2013)) / 12;
      years.forEach((year, index) => {
        const x = xForYear(year);
        context.fillStyle = "#7a8495";
        context.textAlign = "center";
        context.fillText(
          index % 2 === 0 || year === 2025 ? String(year) : "",
          x,
          plot.bottom + 24,
        );
      });

      const barSeries = readySeries.filter((item) => item.kind === "bar");
      const barWidth = Math.min(13, plotWidth / years.length / Math.max(2, barSeries.length + 1));
      barSeries.forEach((item, seriesIndex) => {
        const axisMax = item.axis === "left" ? leftMax : rightMax;
        item.points.forEach((point) => {
          if (point.value === null) return;
          const centeredOffset =
            (seriesIndex - (barSeries.length - 1) / 2) * (barWidth + 2);
          const x = xForYear(point.fiscalYear) + centeredOffset - barWidth / 2;
          const barHeight = Math.max(
            1,
            (Math.max(0, point.value) / axisMax) * plotHeight,
          );
          context.fillStyle = item.color;
          context.globalAlpha = 0.82;
          context.fillRect(x, plot.bottom - barHeight, barWidth, barHeight);
          context.globalAlpha = 1;
        });
      });

      readySeries
        .filter((item) => item.kind === "line")
        .forEach((item) => {
          const axisMax = item.axis === "left" ? leftMax : rightMax;
          context.strokeStyle = item.color;
          context.fillStyle = item.color;
          context.lineWidth = 2.4;
          context.beginPath();
          let started = false;
          item.points.forEach((point) => {
            if (point.value === null) {
              started = false;
              return;
            }
            const x = xForYear(point.fiscalYear);
            const y =
              plot.bottom -
              (Math.max(0, point.value) / axisMax) * plotHeight;
            if (started) context.lineTo(x, y);
            else context.moveTo(x, y);
            started = true;
          });
          context.stroke();

          item.points.forEach((point) => {
            if (point.value === null) return;
            const x = xForYear(point.fiscalYear);
            const y =
              plot.bottom -
              (Math.max(0, point.value) / axisMax) * plotHeight;
            context.beginPath();
            context.arc(x, y, 3.2, 0, Math.PI * 2);
            context.fill();
          });
        });
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [readySeries]);

  if (series.length === 0) {
    return (
      <div className="chart-empty">
        <span>01</span>
        <strong>表の数値セルをクリック</strong>
        <p>選んだ項目の2013〜2025年度推移をここに表示します。</p>
      </div>
    );
  }

  return (
    <div className="annual-chart-wrap">
      <canvas
        ref={canvasRef}
        className="annual-chart"
        aria-label="選択項目の年度推移グラフ"
      />
    </div>
  );
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    let message = "データを取得できませんでした。";
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // GitHub Pagesの404 HTMLなど、JSON以外のエラー本文は既定文言にする。
    }
    throw new Error(message);
  }
  const path =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.pathname
        : input.url;
  if (path.endsWith(".gz")) {
    if (!response.body || typeof DecompressionStream === "undefined") {
      throw new Error(
        "このブラウザは圧縮統計データの表示に対応していません。最新版のEdgeまたはChromeで開いてください。",
      );
    }
    const decompressed = response.body.pipeThrough(
      new DecompressionStream("gzip"),
    );
    return (await new Response(decompressed).json()) as T;
  }
  return (await response.json()) as T;
}

function fetchStaticJson<T>(path: string) {
  const cached = staticJsonCache.get(path);
  if (cached) return cached as Promise<T>;
  const request = fetchJson<T>(path).catch((error) => {
    staticJsonCache.delete(path);
    throw error;
  });
  staticJsonCache.set(path, request);
  return request;
}

function normalizedSearch(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

async function loadStaticTable(options: {
  datasetId: string;
  statInfId: string;
  sheetName?: string;
  offset: number;
  query: string;
}): Promise<AnnualTablePayload> {
  const manifest = await fetchStaticJson<StaticDataManifest>(
    "data/manifest.json",
  );
  const table = manifest.tables.find(
    (item) =>
      item.datasetId === options.datasetId &&
      item.statInfId === options.statInfId,
  );
  if (!table) throw new Error("公開データに指定した統計表がありません。");
  const sheet =
    table.sheets.find((item) => item.name === options.sheetName) ??
    table.sheets[0];
  if (!sheet) throw new Error("公開データに表示できるシートがありません。");
  const meta = await fetchStaticJson<StaticTableMeta>(sheet.metaUrl);
  const query = normalizedSearch(options.query);
  let matchingIndexes: number[];
  if (query) {
    const search = await fetchStaticJson<{
      rows: Array<{ index: number; text: string }>;
    }>(meta.searchUrl);
    matchingIndexes = search.rows
      .filter((row) => row.text.toLowerCase().includes(query))
      .map((row) => row.index);
  } else {
    matchingIndexes = Array.from({ length: meta.rowCount }, (_, index) => index);
  }
  const offset = Math.min(
    Math.max(0, options.offset),
    Math.max(0, matchingIndexes.length - 1),
  );
  const wantedIndexes = matchingIndexes.slice(offset, offset + meta.pageSize);
  const pageIndexes = Array.from(
    new Set(wantedIndexes.map((index) => Math.floor(index / meta.pageSize))),
  );
  const pages = await Promise.all(
    pageIndexes.map((pageIndex) =>
      fetchStaticJson<StaticTablePage>(
        meta.pageUrlTemplate.replace("{page}", String(pageIndex)),
      ),
    ),
  );
  const rowsByIndex = new Map(
    pages.flatMap((page) => page.rows.map((row) => [row.index, row] as const)),
  );
  return {
    record: table,
    sheetName: sheet.name,
    sheetNames: table.sheets.map((item) => item.name),
    rows: wantedIndexes
      .map((index) => rowsByIndex.get(index))
      .filter((row): row is TableRow => Boolean(row)),
    columnLabels: meta.columnLabels,
    rowCount: meta.rowCount,
    columnCount: meta.columnCount,
    matchingRowCount: matchingIndexes.length,
    offset,
    limit: meta.pageSize,
    query: options.query,
  };
}

export default function AnnualBuildingExplorer({
  catalogs,
}: {
  catalogs: AnnualCatalog[];
}) {
  const defaultCatalog = catalogs[0];
  const defaultGroup = preferredGroup(defaultCatalog);
  const defaultRecord = defaultCatalog.records
    .filter((record) => record.groupId === defaultGroup?.id)
    .sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
  const [datasetId, setDatasetId] = useState(defaultCatalog.datasetId);
  const [groupId, setGroupId] = useState(defaultGroup?.id ?? "");
  const [statInfId, setStatInfId] = useState(defaultRecord?.statInfId ?? "");
  const [sheetName, setSheetName] = useState("");
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [table, setTable] = useState<AnnualTablePayload | null>(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState("");
  const [series, setSeries] = useState<ChartSeries[]>([]);
  const catalog =
    catalogs.find((candidate) => candidate.datasetId === datasetId) ??
    defaultCatalog;

  const records = useMemo(
    () =>
      catalog.records
        .filter((record) => record.groupId === groupId)
        .sort(
          (a, b) =>
            b.fiscalYear - a.fiscalYear ||
            a.variantLabel.localeCompare(b.variantLabel, "ja"),
        ),
    [catalog.records, groupId],
  );
  const group = catalog.groups.find((item) => item.id === groupId);

  useEffect(() => {
    if (!statInfId) return;
    let active = true;
    loadStaticTable({
      datasetId,
      statInfId,
      sheetName,
      offset,
      query,
    })
      .then((payload) => {
        if (!active) return;
        setTable(payload);
        setError("");
      })
      .catch((loadError) => {
        if (!active) return;
        setTable(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "統計表を読み込めませんでした。",
        );
      })
      .finally(() => {
        if (active) setTableLoading(false);
      });

    return () => {
      active = false;
    };
  }, [datasetId, statInfId, sheetName, offset, query]);

  const updateSeries = useCallback(
    (id: string, patch: Partial<ChartSeries>) => {
      setSeries((current) =>
        current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const addSeries = useCallback(
    async (row: TableRow, columnIndex: number) => {
      if (!table || !group || series.length >= 4) return;
      const reference = row.series?.[columnIndex];
      if (!reference?.bundleUrl) {
        setError("この数値は年度系列として照合できませんでした。");
        return;
      }
      const id = `${reference.id}-${Date.now()}`;
      const label = `${row.rowLabel}｜${
        table.columnLabels[columnIndex] || `列 ${columnName(columnIndex)}`
      }`;
      const color = SERIES_COLORS[series.length % SERIES_COLORS.length];

      setSeries((current) => [
        ...current,
        {
          id,
          label,
          kind: current.length === 1 ? "bar" : "line",
          axis: current.length === 1 ? "right" : "left",
          color,
          points: [],
          loading: true,
          progress: 0,
          sourceGroupId: group.id,
        },
      ]);
      try {
        const bundle = await fetchStaticJson<StaticSeriesBundle>(
          reference.bundleUrl,
        );
        const selected = bundle.series[reference.id];
        if (!selected) throw new Error("年度系列が公開データにありません。");
        updateSeries(id, {
          label: selected.label || label,
          points: selected.points.map((point) => ({
            fiscalYear: point.fiscalYear,
            value: point.value,
          })),
          loading: false,
          progress: 100,
        });
      } catch (loadError) {
        setSeries((current) => current.filter((item) => item.id !== id));
        setError(
          loadError instanceof Error
            ? loadError.message
            : "年度系列を読み込めませんでした。",
        );
      }
    },
    [group, series.length, table, updateSeries],
  );

  const exportChartCsv = () => {
    if (series.length === 0) return;
    const header = ["年度", ...series.map((item) => item.label)];
    const rows = Array.from({ length: 13 }, (_, index) => {
      const fiscalYear = 2013 + index;
      return [
        `${fiscalYear}年度`,
        ...series.map(
          (item) =>
            item.points.find((point) => point.fiscalYear === fiscalYear)?.value ??
            "",
        ),
      ];
    });
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${datasetLabel(catalog)}_年度推移.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const currentRecord = catalog.records.find(
    (record) => record.statInfId === statInfId,
  );
  const pageStart = table ? table.offset + 1 : 0;
  const pageEnd = table
    ? Math.min(table.offset + table.rows.length, table.matchingRowCount)
    : 0;

  return (
    <div className="app-shell annual-explorer">
      <aside className="sidebar">
        <a className="brand" href="#top">
          <span className="brand-mark">国</span>
          <span>
            <strong>国交省統計パネル</strong>
            <small>MLIT DATA EXPLORER</small>
          </span>
        </a>
        <nav aria-label="画面内メニュー">
          <a className="nav-active" href="#dataset">
            <span>01</span>データを選ぶ
          </a>
          <a href="#table">
            <span>02</span>表を見る
          </a>
          <a href="#chart">
            <span>03</span>グラフを作る
          </a>
          <a href="#source">
            <span>04</span>出典
          </a>
        </nav>
        <div className="sidebar-status">
          <i className="status-light" />
          <span>
            <strong>原本を保存済み</strong>
            <small>
              2013–2025年度 / ローカルDBから公開
            </small>
          </span>
        </div>
      </aside>

      <main id="top">
        <header className="topbar">
          <div>
            <p>MLIT OFFICIAL STATISTICS / ANNUAL</p>
            <h1>{datasetLabel(catalog)}・年度データ</h1>
          </div>
          <div className="topbar-actions">
            <span className="latest-period">
              収録 <strong>2013–2025年度</strong>
            </span>
            <a
              className="button secondary source-button"
              href={catalog.sourceUrl}
              target="_blank"
            >
              e-Stat原表 ↗
            </a>
          </div>
        </header>

        <section className="annual-hero">
          <div>
            <p className="eyebrow">NORMALIZED LOCAL DATA, READ-ONLY WEB VIEW</p>
            <h2>
              必要な表を開いて、
              <br />
              <em>数字をそのまま年度比較。</em>
            </h2>
            <p className="hero-copy">
              国土交通省「{catalog.title}」をローカルで正規化し、閲覧用データとして公開。
              表の数値セルを選ぶだけで、折れ線・棒グラフ・左右2軸を組み合わせられます。
            </p>
          </div>
          <div className="coverage-card">
            <span>LOCAL SOURCE ARCHIVE</span>
            <strong>{formatBytes(catalog.totalBytes)}</strong>
            <p>公式Excel原本・SHA-256付き</p>
            <div className="coverage-line">
              <i />
              <span>最終取得 {new Date(catalog.fetchedAt).toLocaleDateString("ja-JP")}</span>
            </div>
          </div>
        </section>

        <section className="annual-metrics" aria-label="収録データ概要">
          <div>
            <span>収録年度</span>
            <strong>13</strong>
            <small>2013–2025</small>
          </div>
          <div>
            <span>公式Excel</span>
            <strong>{catalog.fileCount}</strong>
            <small>年度別原本</small>
          </div>
          <div>
            <span>統計表グループ</span>
            <strong>{catalog.groups.length}</strong>
            <small>名称変更を統合</small>
          </div>
          <div>
            <span>出典</span>
            <strong>e-Stat</strong>
            <small>国土交通省</small>
          </div>
        </section>

        <section className="panel dataset-panel" id="dataset">
          <div className="panel-header annual-panel-heading">
            <div>
              <p className="section-kicker">01 / SELECT DATA</p>
              <h3>見る統計表を選ぶ</h3>
              <p className="panel-subtitle">
                表の種類と年度を選択すると、正規化済みの公開データを開きます。
              </p>
            </div>
            <span className="record-badge">
              {group?.fiscalYears.length ?? 0}年度・{records.length}ファイル
            </span>
          </div>
          <div className="dataset-controls">
            <label>
              <span>統計</span>
              <select
                value={datasetId}
                onChange={(event) => {
                  const nextCatalog =
                    catalogs.find(
                      (candidate) => candidate.datasetId === event.target.value,
                    ) ?? catalogs[0];
                  const nextGroup = preferredGroup(nextCatalog);
                  const nextRecord = nextCatalog.records
                    .filter((record) => record.groupId === nextGroup?.id)
                    .sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
                  setDatasetId(nextCatalog.datasetId);
                  setGroupId(nextGroup?.id ?? "");
                  setStatInfId(nextRecord?.statInfId ?? "");
                  setSheetName("");
                  setOffset(0);
                  setQuery("");
                  setQueryDraft("");
                  setSeries([]);
                  setTable(null);
                  setTableLoading(true);
                }}
              >
                {catalogs.map((candidate) => (
                  <option key={candidate.datasetId} value={candidate.datasetId}>
                    {datasetLabel(candidate)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>統計表</span>
              <select
                value={groupId}
                onChange={(event) => {
                  const nextGroupId = event.target.value;
                  const nextRecord = catalog.records
                    .filter((record) => record.groupId === nextGroupId)
                    .sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
                  setGroupId(nextGroupId);
                  setStatInfId(nextRecord?.statInfId ?? "");
                  setSheetName("");
                  setOffset(0);
                  setQuery("");
                  setQueryDraft("");
                  setTableLoading(true);
                }}
              >
                {catalog.groups.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>年度</span>
              <select
                value={statInfId}
                onChange={(event) => {
                  setStatInfId(event.target.value);
                  setSheetName("");
                  setOffset(0);
                  setTableLoading(true);
                }}
              >
                {records.map((record) => (
                  <option key={record.statInfId} value={record.statInfId}>
                    {recordLabel(record)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {currentRecord?.variantLabel ? (
            <p className="split-note">
              2024年度は制度変更に伴う分割表です。グラフでは同年度の分割値を合算します。
            </p>
          ) : null}
        </section>

        <section className="panel annual-table-panel" id="table">
          <div className="panel-header annual-panel-heading">
            <div>
              <p className="section-kicker">02 / SOURCE TABLE</p>
              <h3>{currentRecord?.title ?? "統計表"}</h3>
              <p className="panel-subtitle">
                青い数値をクリックすると、同じ項目の年度推移をグラフへ追加します。
              </p>
            </div>
            {table?.sheetNames.length ? (
              <label className="compact-select">
                <span>シート</span>
                <select
                  value={sheetName || table.sheetName}
                  onChange={(event) => {
                    setSheetName(event.target.value);
                    setOffset(0);
                    setTableLoading(true);
                  }}
                >
                  {table.sheetNames.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <form
            className="table-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              setOffset(0);
              setQuery(queryDraft);
              setTableLoading(true);
            }}
          >
            <label>
              <span>表内検索</span>
              <input
                value={queryDraft}
                onChange={(event) => setQueryDraft(event.target.value)}
                placeholder="例：全国計、事務所、東京都"
              />
            </label>
            <button className="button secondary" type="submit">
              検索
            </button>
            {query ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setQueryDraft("");
                  setQuery("");
                  setOffset(0);
                  setTableLoading(true);
                }}
              >
                解除
              </button>
            ) : null}
            <span className="table-count">
              {table
                ? `${formatNumber(table.matchingRowCount)}行中 ${formatNumber(pageStart)}–${formatNumber(pageEnd)}行`
                : tableLoading
                  ? "読み込み中"
                  : "表示できません"}
            </span>
          </form>

          {error ? <div className="error-note">{error}</div> : null}
          <div className={`annual-table-scroll ${tableLoading ? "is-loading" : ""}`}>
            {table ? (
              <table className="annual-source-table">
                <thead>
                  <tr>
                    <th className="row-number">行</th>
                    {Array.from({ length: table.columnCount }, (_, column) => (
                      <th key={column} title={table.columnLabels[column]}>
                        {columnName(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row.index}>
                      <th className="row-number">{row.index + 1}</th>
                      {Array.from(
                        { length: table.columnCount },
                        (_, column) => {
                          const cell = row.cells[column];
                          const numeric =
                            typeof cell === "number" && Number.isFinite(cell);
                          return (
                            <td
                              key={column}
                              className={numeric ? "numeric-cell" : ""}
                              title={
                                numeric
                                  ? `${row.rowLabel}｜${table.columnLabels[column]}`
                                  : String(cell ?? "")
                              }
                            >
                              {numeric ? (
                                <button
                                  type="button"
                                  disabled={series.length >= 4}
                                  onClick={() => addSeries(row, column)}
                                >
                                  {formatNumber(cell)}
                                </button>
                              ) : (
                                String(cell ?? "")
                              )}
                            </td>
                          );
                        },
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="table-placeholder">
                {tableLoading
                  ? "公開用データを読み込んでいます…"
                  : "表を表示できません。再読み込みしてください。"}
              </div>
            )}
          </div>
          <div className="pagination">
            <button
              className="button secondary"
              type="button"
              disabled={!table || table.offset === 0 || tableLoading}
              onClick={() => {
                setOffset(Math.max(0, offset - 80));
                setTableLoading(true);
              }}
            >
              ← 前へ
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={
                !table ||
                table.offset + table.rows.length >= table.matchingRowCount ||
                tableLoading
              }
              onClick={() => {
                setOffset(offset + 80);
                setTableLoading(true);
              }}
            >
              次へ →
            </button>
          </div>
        </section>

        <section className="panel chart-panel" id="chart">
          <div className="panel-header annual-panel-heading">
            <div>
              <p className="section-kicker">03 / BUILD CHART</p>
              <h3>年度推移グラフ</h3>
              <p className="panel-subtitle">
                最大4項目。項目ごとに折れ線／棒、左軸／右軸を指定できます。
              </p>
            </div>
            <button
              className="button secondary"
              type="button"
              disabled={series.length === 0}
              onClick={exportChartCsv}
            >
              CSV出力
            </button>
          </div>

          {series.length > 0 ? (
            <div className="series-settings">
              {series.map((item) => (
                <article key={item.id} className="series-card">
                  <i style={{ background: item.color }} />
                  <div className="series-title">
                    <input
                      aria-label="系列名"
                      value={item.label}
                      onChange={(event) =>
                        updateSeries(item.id, { label: event.target.value })
                      }
                    />
                    {item.loading ? (
                      <span>年度データを照合中… {item.progress}%</span>
                    ) : (
                      <span>
                        {item.points.filter((point) => point.value !== null).length}
                        年度を表示
                      </span>
                    )}
                  </div>
                  <div className="series-options">
                    <div className="mini-segment">
                      {(["line", "bar"] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className={item.kind === kind ? "selected" : ""}
                          onClick={() => updateSeries(item.id, { kind })}
                        >
                          {kind === "line" ? "折れ線" : "棒"}
                        </button>
                      ))}
                    </div>
                    <div className="mini-segment">
                      {(["left", "right"] as const).map((axis) => (
                        <button
                          key={axis}
                          type="button"
                          className={item.axis === axis ? "selected" : ""}
                          onClick={() => updateSeries(item.id, { axis })}
                        >
                          {axis === "left" ? "左軸" : "右軸"}
                        </button>
                      ))}
                    </div>
                    <button
                      className="remove-series"
                      type="button"
                      aria-label={`${item.label}を削除`}
                      onClick={() =>
                        setSeries((current) =>
                          current.filter((candidate) => candidate.id !== item.id),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          <SeriesChart series={series} />
          {series.length >= 4 ? (
            <p className="series-limit">4項目まで選択できます。</p>
          ) : null}
        </section>

        <section className="source-panel annual-source" id="source">
          <div>
            <p className="section-kicker">04 / PROVENANCE</p>
            <h3>出典と保存方針</h3>
          </div>
          <div className="source-grid">
            <dl>
              <dt>政府統計</dt>
              <dd>{catalog.title}</dd>
              <dt>作成機関</dt>
              <dd>{catalog.organization}</dd>
            </dl>
            <dl>
              <dt>保存範囲</dt>
              <dd>{catalog.fiscalYearFrom}〜{catalog.fiscalYearTo}年度</dd>
              <dt>保存内容</dt>
              <dd>Excel原本 {catalog.fileCount}件＋出典・ハッシュ目録</dd>
            </dl>
            <a href={catalog.sourceUrl} target="_blank">
              e-Statの公式一覧を開く <span>↗</span>
            </a>
          </div>
          <p className="source-footnote">
            原本ExcelはBusinessフォルダ内に年度別保存し、画面では検証済みDBから生成した読み取り専用データを参照します。
            同一年度に分割表がある場合はグラフ上で合算し、原表自体は改変しません。
          </p>
        </section>

        <footer>
          <span>MLIT STATISTICS PANEL</span>
          <p>
            出典：政府統計の総合窓口 e-Stat / 国土交通省
            ・本サイトは国土交通省の公式サイトではありません
          </p>
        </footer>
      </main>
    </div>
  );
}
