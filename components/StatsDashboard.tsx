"use client";

import { useMemo, useState } from "react";
import type {
  MonthlyRecord,
  PrefectureRecord,
  StatisticsPayload,
} from "@/lib/types";

type MetricKey =
  | "total"
  | "ownerOccupied"
  | "rental"
  | "forSale"
  | "condominium"
  | "detached";

const METRICS: { key: MetricKey; label: string; short: string }[] = [
  { key: "total", label: "着工戸数 総数", short: "総数" },
  { key: "ownerOccupied", label: "持家", short: "持家" },
  { key: "rental", label: "貸家", short: "貸家" },
  { key: "forSale", label: "分譲住宅", short: "分譲" },
  { key: "condominium", label: "マンション", short: "マンション" },
  { key: "detached", label: "一戸建て", short: "一戸建て" },
];

const formatNumber = new Intl.NumberFormat("ja-JP");
const formatPercent = (value: number | null) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function latestValue(records: MonthlyRecord[], key: MetricKey) {
  return records.at(-1)?.[key] ?? 0;
}

function MetricCard({
  label,
  value,
  change,
  tone = "blue",
}: {
  label: string;
  value: number;
  change?: number | null;
  tone?: "blue" | "green" | "amber" | "violet";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-card-top">
        <span>{label}</span>
        <span className="metric-dot" aria-hidden="true" />
      </div>
      <strong>
        {formatNumber.format(value)}
        <small>戸</small>
      </strong>
      {change !== undefined && (
        <span
          className={
            change !== null && change >= 0 ? "change-up" : "change-down"
          }
        >
          前年同月比 {formatPercent(change)}
        </span>
      )}
    </article>
  );
}

function MonthlyChart({
  records,
  mode,
}: {
  records: MonthlyRecord[];
  mode: "total" | "breakdown";
}) {
  const max = Math.max(...records.map((record) => record.total), 1);

  return (
    <div className="chart-shell">
      <div className="chart-axis">
        <span>{formatNumber.format(max)}</span>
        <span>{formatNumber.format(Math.round(max / 2))}</span>
        <span>0</span>
      </div>
      <div className="monthly-chart" role="img" aria-label="月次住宅着工戸数グラフ">
        {records.map((record, index) => {
          const height = Math.max((record.total / max) * 100, 2);
          const showLabel =
            index === 0 || index === records.length - 1 || index % 3 === 0;
          return (
            <div
              className="month-column"
              key={record.period}
              title={`${record.label}: ${formatNumber.format(record.total)}戸`}
            >
              <div className="bar-track">
                {mode === "total" ? (
                  <div
                    className="single-bar"
                    style={{ height: `${height}%` }}
                  />
                ) : (
                  <div className="stacked-bar" style={{ height: `${height}%` }}>
                    <span
                      className="segment-owner"
                      style={{
                        height: `${(record.ownerOccupied / record.total) * 100}%`,
                      }}
                    />
                    <span
                      className="segment-rental"
                      style={{
                        height: `${(record.rental / record.total) * 100}%`,
                      }}
                    />
                    <span
                      className="segment-sale"
                      style={{
                        height: `${(record.forSale / record.total) * 100}%`,
                      }}
                    />
                    <span className="segment-other" />
                  </div>
                )}
              </div>
              <span className="month-label">
                {showLabel ? record.period.slice(2).replace("-", "/") : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PrefectureRanking({
  records,
  metric,
}: {
  records: PrefectureRecord[];
  metric: MetricKey;
}) {
  const ranking = [...records]
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, 12);
  const max = ranking[0]?.[metric] ?? 1;

  return (
    <div className="ranking-list">
      {ranking.map((record, index) => (
        <div className="ranking-row" key={record.code}>
          <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
          <strong>{record.name}</strong>
          <div className="rank-track">
            <span
              className="rank-fill"
              style={{ width: `${(record[metric] / max) * 100}%` }}
            />
          </div>
          <span className="rank-value">
            {formatNumber.format(record[metric])}戸
          </span>
        </div>
      ))}
    </div>
  );
}

export default function StatsDashboard({
  initialData,
}: {
  initialData: StatisticsPayload;
}) {
  const [data, setData] = useState(initialData);
  const [months, setMonths] = useState(24);
  const [chartMode, setChartMode] = useState<"total" | "breakdown">("total");
  const [regionMetric, setRegionMetric] = useState<MetricKey>("total");
  const [refreshing, setRefreshing] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);

  const visibleMonthly = useMemo(
    () => data.monthly.slice(-months),
    [data.monthly, months],
  );
  const latest = data.monthly.at(-1);
  const latestLabel = latest?.label ?? "—";

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/stats?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("更新できませんでした。");
      setData((await response.json()) as StatisticsPayload);
    } finally {
      setRefreshing(false);
    }
  }

  function downloadCsv() {
    const header = [
      "年月",
      "総数",
      "前年同月比",
      "持家",
      "貸家",
      "給与住宅",
      "分譲住宅",
      "マンション",
      "一戸建て",
      "床面積_千平米",
      "出典",
    ];
    const rows = visibleMonthly.map((record) => [
      record.period,
      record.total,
      record.yoy,
      record.ownerOccupied,
      record.rental,
      record.salaryHousing,
      record.forSale,
      record.condominium,
      record.detached,
      record.floorArea,
      "国土交通省 建築着工統計調査",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `住宅着工統計_${visibleMonthly[0]?.period ?? "data"}_${latest?.period ?? "latest"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="国交省統計パネル">
          <span className="brand-mark">統</span>
          <span>
            <strong>国交省統計</strong>
            <small>SELECTOR</small>
          </span>
        </a>
        <nav aria-label="画面内ナビゲーション">
          <a className="nav-active" href="#overview">
            <span>01</span>概要
          </a>
          <a href="#timeline">
            <span>02</span>時系列
          </a>
          <a href="#prefectures">
            <span>03</span>都道府県
          </a>
          <a href="#source">
            <span>04</span>出典
          </a>
        </nav>
        <div className="sidebar-status">
          <span className="status-light" />
          <div>
            <strong>公式データ接続</strong>
            <small>
              {data.metadata.mode === "live" ? "最新取得済み" : "保存値を表示"}
            </small>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p>建築・住宅関係統計</p>
            <h1>住宅着工ダッシュボード</h1>
          </div>
          <div className="topbar-actions">
            <span className="latest-period">
              最新値 <strong>{latestLabel}</strong>
            </span>
            <button className="button secondary" onClick={refresh} disabled={refreshing}>
              {refreshing ? "取得中…" : "最新データを取得"}
            </button>
            <button className="button primary" onClick={downloadCsv}>
              CSV出力
            </button>
          </div>
        </header>

        <section className="hero" id="overview">
          <div>
            <p className="eyebrow">MLIT OFFICIAL STATISTICS</p>
            <h2>
              必要な数字だけ、
              <br />
              <em>すぐ使える。</em>
            </h2>
            <p className="hero-copy">
              国土交通省の公式統計から、住宅着工の主要項目を自動収集。
              グラフ、表、CSVまでひとつの画面で完結します。
            </p>
          </div>
          <div className="hero-source">
            <span>収集対象</span>
            <strong>住宅着工統計</strong>
            <p>全国月次 ＋ 都道府県別</p>
            <div>
              <span className="live-dot" />
              {data.metadata.mode === "live" ? "公式サイトと同期" : "公式保存値"}
            </div>
          </div>
        </section>

        {data.metadata.note && (
          <p className="data-note" role="status">
            {data.metadata.note}
          </p>
        )}

        <section className="metrics-grid" aria-label="最新指標">
          <MetricCard
            label="新設住宅・総数"
            value={latestValue(data.monthly, "total")}
            change={latest?.yoy}
            tone="blue"
          />
          <MetricCard
            label="持家"
            value={latestValue(data.monthly, "ownerOccupied")}
            tone="green"
          />
          <MetricCard
            label="貸家"
            value={latestValue(data.monthly, "rental")}
            tone="violet"
          />
          <MetricCard
            label="分譲住宅"
            value={latestValue(data.monthly, "forSale")}
            tone="amber"
          />
        </section>

        <section className="panel" id="timeline">
          <div className="panel-header">
            <div>
              <p className="section-kicker">MONTHLY TREND</p>
              <h3>月次推移</h3>
            </div>
            <div className="segmented-controls">
              <div className="segmented" aria-label="表示期間">
                {[12, 24, 36, 60].map((value) => (
                  <button
                    className={months === value ? "selected" : ""}
                    key={value}
                    onClick={() => setMonths(value)}
                  >
                    {value}か月
                  </button>
                ))}
              </div>
              <div className="segmented" aria-label="グラフ表示">
                <button
                  className={chartMode === "total" ? "selected" : ""}
                  onClick={() => setChartMode("total")}
                >
                  総数
                </button>
                <button
                  className={chartMode === "breakdown" ? "selected" : ""}
                  onClick={() => setChartMode("breakdown")}
                >
                  内訳
                </button>
              </div>
            </div>
          </div>
          {chartMode === "breakdown" && (
            <div className="legend">
              <span><i className="legend-owner" />持家</span>
              <span><i className="legend-rental" />貸家</span>
              <span><i className="legend-sale" />分譲</span>
              <span><i className="legend-other" />その他</span>
            </div>
          )}
          <MonthlyChart records={visibleMonthly} mode={chartMode} />
          <button
            className="table-toggle"
            onClick={() => setTableOpen((value) => !value)}
            aria-expanded={tableOpen}
          >
            {tableOpen ? "表を閉じる" : "表形式でも確認する"}
            <span>{tableOpen ? "−" : "+"}</span>
          </button>
          {tableOpen && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>年月</th>
                    <th>総数</th>
                    <th>前年同月比</th>
                    <th>持家</th>
                    <th>貸家</th>
                    <th>分譲</th>
                    <th>マンション</th>
                    <th>一戸建て</th>
                  </tr>
                </thead>
                <tbody>
                  {[...visibleMonthly].reverse().map((record) => (
                    <tr key={record.period}>
                      <th>{record.label}</th>
                      <td>{formatNumber.format(record.total)}</td>
                      <td>{formatPercent(record.yoy)}</td>
                      <td>{formatNumber.format(record.ownerOccupied)}</td>
                      <td>{formatNumber.format(record.rental)}</td>
                      <td>{formatNumber.format(record.forSale)}</td>
                      <td>{formatNumber.format(record.condominium)}</td>
                      <td>{formatNumber.format(record.detached)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel ranking-panel" id="prefectures">
          <div className="panel-header">
            <div>
              <p className="section-kicker">PREFECTURE RANKING</p>
              <h3>都道府県別ランキング</h3>
              <p className="panel-subtitle">{latestLabel}・上位12都道府県</p>
            </div>
            <label className="select-label">
              表示項目
              <select
                value={regionMetric}
                onChange={(event) =>
                  setRegionMetric(event.target.value as MetricKey)
                }
              >
                {METRICS.map((metric) => (
                  <option value={metric.key} key={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <PrefectureRanking
            records={data.prefectures}
            metric={regionMetric}
          />
        </section>

        <section className="source-panel" id="source">
          <div>
            <p className="section-kicker">SOURCE & TRACEABILITY</p>
            <h3>数字の根拠を残す</h3>
            <p>
              取得値には統計名、調査年月、公式掲載先をセットで保持。
              CSVにも出典名を付けるため、資料作成時に数字の出どころを追跡できます。
            </p>
          </div>
          <dl>
            <div>
              <dt>統計名</dt>
              <dd>{data.metadata.title}</dd>
            </div>
            <div>
              <dt>作成機関</dt>
              <dd>{data.metadata.organization}</dd>
            </div>
            <div>
              <dt>最新調査月</dt>
              <dd>{latestLabel}</dd>
            </div>
            <div>
              <dt>取得状態</dt>
              <dd>
                {data.metadata.mode === "live"
                  ? "e-Stat掲載Excelから取得"
                  : "保存済み公式データ"}
              </dd>
            </div>
          </dl>
          <div className="source-links">
            <a href={data.metadata.sourcePage} target="_blank" rel="noreferrer">
              国土交通省の統計説明
            </a>
            <a href={data.metadata.sourceList} target="_blank" rel="noreferrer">
              e-Statの掲載データ
            </a>
          </div>
        </section>

        <footer>
          <span>国交省統計パネル · MVP 0.1</span>
          <span>Source: MLIT / e-Stat</span>
        </footer>
      </main>
    </div>
  );
}
