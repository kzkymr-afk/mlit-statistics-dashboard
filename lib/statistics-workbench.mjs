import {policyCalculationError,reviewedPointDefinition} from './reviewed-policy-groups.mjs';
import { reviewedMetricDisplayName, seriesFromBuildBaseComparison } from "./buildbase-verified-comparison.mjs";
import { observationAnalysisState, priceBasisForSelection, reviewedCompanyComparisonCompatibility } from "./statistics-series-compare.mjs";

export const VERIFIED_TABLE_ID = "buildbase-source-verified-annual";
export const VERIFIED_DATASET_ID = "buildbase-source-verified-comparison";
export const VERIFIED_DATA_URL = "system/buildbase/source-verified-comparison.json";
export const DEFAULT_REVIEW_WINDOW = "default";
/** Axis-only abbreviation: FY is the fiscal year in which this exact April–March interval begins. */
export function workbenchChartTickLabel(timeCode, originalLabel = timeCode) {
  const match = /^(\d{4})-04-01\/(\d{4})-03-31$/.exec(timeCode);
  return match && Number(match[2]) === Number(match[1]) + 1 ? `FY${match[1]}` : originalLabel;
}
const reviewWindowFor = (series) => series.reviewWindow || DEFAULT_REVIEW_WINDOW;
function reviewWindowLabel(series) {
  const years = [...new Set(series.flatMap((item) => item.points.map((point) => Number(point.fiscalYear??point.periodStart.slice(0, 4)))))].sort((a, b) => a - b);
  const span = years.length > 1 && years.at(-1) - years[0] === years.length - 1
    ? `${years[0]}～${years.at(-1)}` : years.join("・");
  return `${span}年度（資料を確認した年度）`;
}
const companyNames = { OBAYASHI: "大林組", KAJIMA: "鹿島建設", MATSUI:"松井建設", ZENITAKA:"錢高組" };
const metricNames = {
  net_sales_consolidated:"売上高（連結）",operating_income_consolidated:"営業利益（連結）",
  obayashi_databook_construction_orders_reported: "建設事業受注高",
  obayashi_databook_gross_profit_reported: "売上総利益",
  consolidated_gross_profit_reported: "売上総利益",
};
const indicatorIdFor = (series) => series.comparisonIndicatorId || series.metricId;
const metricNameFor = (series) => metricNames[indicatorIdFor(series)] ?? metricNames[series.metricId] ?? reviewedMetricDisplayName(series);
const dimValue = (code, name, sortOrder, unit = null) => ({ code, name, sortOrder, unit, level: null, parentCode: null });

/** Responses and optional indicator equivalence are checked by the shared response validator. */
export async function verifiedWorkbenchCatalog(responses) {
  if (!Array.isArray(responses) || !responses.length) throw new Error("出典確認済み系列が未収録です。");
  const series = await Promise.all(responses.map(seriesFromBuildBaseComparison));
  if (new Set(series.map((item) => item.id)).size !== series.length) throw new Error("確認済み系列IDが重複しています。");
  const companies = [...new Set(series.map((item) => item.companyId))];
  const metrics = [...new Map(series.map((item) => [indicatorIdFor(item), item])).values()];
  const windows = [...new Set(series.map(reviewWindowFor))];
  const defaultSource = series.find((item) => reviewWindowFor(item) === DEFAULT_REVIEW_WINDOW) ?? series[0];
  const periods = [...new Map(series.flatMap((item) => item.points.map((point) => [point.timeCode, point]))).values()].sort((a, b) => a.timeCode.localeCompare(b.timeCode));
  const fiscalYears = [...new Set(periods.map((point) => Number(point.fiscalYear??point.periodStart.slice(0, 4))))];
  const observationCount = series.reduce((sum, item) => sum + item.points.length, 0);
  const coverageSummary = `${companies.length}社・${metrics.length}指標・${series.length}系列、${fiscalYears.join("・")}年度、${observationCount}点を出典確認済み`;
  const names = companies.map((id) => companyNames[id] ?? id).join("・");
  const table = {
    id: VERIFIED_TABLE_ID, datasetId: VERIFIED_DATASET_ID,
    title: `${names}・${metrics.map(metricNameFor).join("／")}（出典確認済み）`,
    statisticsName: `${names} 公開決算資料・出典確認済み指標`, cycle: "年度次",
    sourceKind: "buildbase-source-verified", sourceUrl: series[0].points[0].provenance.sourceUrl,
    registryStatus: "ready", seriesCount: series.length,
    observationCount, metaUrl: VERIFIED_DATA_URL,
    notes: [`確認範囲は${coverageSummary}です。収録済みの会社・指標・実期間だけが確認対象です。${metrics.some((item) => metricNameFor(item) === "売上総利益") ? "売上総利益は利益率ではありません。" : ""}`, "現在版の恒常一致は保証しません。照合日・範囲は最新性確認台帳を参照してください。原本取得日が未記録の場合は不明です。自動集計は許可されていません。"],
  };
  const meta = { schemaVersion: 2, table, implicitNumericZero: false,
    seriesBundlePrefixLength: 0, seriesBundleUrlTemplate: "", automaticComparisonAllowed: true, automaticAggregationAllowed: false,
    defaultSelection: { cat01: defaultSource.companyId, tab: indicatorIdFor(defaultSource), reviewWindow: reviewWindowFor(defaultSource) },
    dimensions: [
      { id: "company", apiKey: "cat01", name: "会社", sortOrder: 0, values: companies.map((id, i) => dimValue(id, companyNames[id] ?? id, i)) },
      { id: "metric", apiKey: "tab", name: "指標", sortOrder: 1, values: metrics.map((item, i) => dimValue(indicatorIdFor(item), metricNameFor(item), i, item.unit)) },
      { id: "review-window", apiKey: "reviewWindow", name: "資料を確認した年度", sortOrder: 2, values: windows.map((code, i) => dimValue(code, reviewWindowLabel(series.filter((item) => reviewWindowFor(item) === code)), i)) },
      { id: "time", apiKey: "time", name: "期間（会計年度・実際の開始日／終了日）", sortOrder: 3, values: periods.map((point, i) => dimValue(point.timeCode, `${point.periodStart.slice(0, 4)}年度 · ${point.timeLabel}`, i)) },
    ],
  };
  return { series, table, meta, coverageSummary, dataset: { id: VERIFIED_DATASET_ID, title: "会社別・出典確認済み指標", governmentStatisticsCode: "", sourceUrl: table.sourceUrl, fiscalYearFrom: fiscalYears[0] } };
}

/** Omitted/default window resolves only legacy series; named windows must match exactly. */
export function verifiedSourceForSelection(verified, coordinates) {
  const reviewWindow = coordinates.reviewWindow || DEFAULT_REVIEW_WINDOW;
  return verified?.series.find((item) => item.companyId === coordinates.cat01 && reviewWindowFor(item) === reviewWindow &&
    (item.metricId === coordinates.tab || indicatorIdFor(item) === coordinates.tab)) ?? null;
}

/** A window's controls expose only actual approved periods, without joining separate reviews. */
export function verifiedWindowTimeValues(verified, reviewWindow = DEFAULT_REVIEW_WINDOW) {
  const times = new Set((verified?.series ?? []).filter((item) => reviewWindowFor(item) === (reviewWindow || DEFAULT_REVIEW_WINDOW))
    .flatMap((item) => item.points.map((point) => point.timeCode)));
  return (verified?.meta.dimensions.find((dimension) => dimension.apiKey === "time")?.values ?? [])
    .filter((item) => times.has(item.code));
}

function evidenceReviewTime(checkedAt) {
  return typeof checkedAt === "string" && /(Z|[+-]\d{2}:\d{2})$/.test(checkedAt) && Number.isFinite(Date.parse(checkedAt))
    ? new Date(checkedAt).toISOString().replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC")
    : checkedAt ? `${checkedAt}（時刻帯未確認）` : "照合日時の記録なし";
}

/** Call only for source-validated observations; keep the original sourceUrl alongside this link. */
export function verifiedOfficialBytesCheckedUrl(point) {
  const evidence = point?.provenance;
  if (evidence?.currentOfficialVersionMatchStatus !== "matched_current_official_bytes_at_review_time") return null;
  try {
    const url = new URL(evidence.currentOfficialBytesCheckedUrl);
    return url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}

function namedWindowEvidenceNotes(source, points) {
  if (!source.reviewWindow) return [];
  const notes = [];
  for (const point of points) {
    const evidence = point.provenance ?? {};
    const status = evidence.currentOfficialVersionMatchStatus;
    const checkedAt = evidence.currentOfficialBytesCheckedAt;
    if (status || checkedAt) {
      const time = evidenceReviewTime(checkedAt);
      const result = status === "matched_current_official_bytes_at_review_time" ? "保存PDFと指定URLの取得バイトが一致"
        : status === "unconfirmed_current_official_GET_failed" ? "GET取得失敗のため現掲載版は未確認"
        : status === "unconfirmed" || !status ? "現掲載版との一致は未確認" : `保存された照合状態: ${status}`;
      notes.push(`公式掲載版照合: ${result}（${time}）。各観測の指定URL・保存PDFに限る確認で、将来版・すべての訂正は保証しません。`);
    }
    const checkedUrl = verifiedOfficialBytesCheckedUrl(point);
    if (checkedUrl) notes.push(`取得バイト一致を照合した公式PDF: ${checkedUrl}`);
    for (const receipt of Array.isArray(evidence.sourceCurrentnessCheckHistory) ? evidence.sourceCurrentnessCheckHistory : []) {
      if (Number.isInteger(receipt?.httpStatus) && receipt.httpStatus >= 400 && receipt.httpStatus <= 599 && receipt.byteComparisonStatus === "not_compared") {
        notes.push(`先行照合履歴: ${evidenceReviewTime(receipt.checkedAtUTC)} · HTTP ${receipt.httpStatus}（取得失敗、バイト未比較）。今回の別URLの照合結果とは区別します。`);
      }
    }
    if (evidence.retrievedAt === null) notes.push("原本取得日: 不明（未記録）。公式掲載版の照合日時とは別です。");
    const explanation = evidence.restatementExplanation ?? point.restatementExplanation;
    if (typeof explanation === "string" && explanation) notes.push(`再表示の説明: ${explanation}`);
    const limitations = evidence.comparisonLimitations ?? point.comparisonLimitations;
    const limitationLabel = Array.isArray(evidence.sourceCurrentnessCheckHistory) && evidence.sourceCurrentnessCheckHistory.length
      ? "元資料を確認した時点の制約" : "比較の制約";
    for (const limit of Array.isArray(limitations) ? limitations : [limitations]) {
      if (typeof limit === "string" && limit) notes.push(`${limitationLabel}: ${limit}`);
    }
    const relation = evidence.sourceRestatementRelation ?? point.sourceRestatementRelation;
    if (relation && typeof relation.old_value === "number" && Number.isFinite(relation.old_value) &&
        typeof relation.restated_as_presented_value === "number" && Number.isFinite(relation.restated_as_presented_value) &&
        relation.fiscal_year && relation.unit) {
      notes.push(`${relation.fiscal_year}年度の保存値の再表示: ${relation.old_value.toLocaleString("ja-JP")} → ${relation.restated_as_presented_value.toLocaleString("ja-JP")} ${relation.unit}。`);
      if (relation.reason_classification === "accounting_policy_change_retrospective_application") notes.push("再表示の保存分類: 会計方針変更の遡及適用。");
      if (relation.is_error_correction === false) notes.push("再表示は誤り訂正ではありません（保存された判定）。");
      if (relation.original_facts_unchanged === true) notes.push("元の収録値は保持しています。");
      if (relation.older_periods_retrospectively_applied === false) notes.push("資料を確認した年度への遡及適用は行いません。");
    }
  }
  return [...new Set(notes)];
}

export function verifiedSeriesSelection(verified, coordinates, from, to, color) {
  const source = structuredClone(verifiedSourceForSelection(verified, coordinates));
  if (!source) throw new Error("この会社・指標の出典確認済みデータは不足しています。確認済みの収録範囲を確認するか、会社別主要指標の参考表を選んでください。");
  const points = source.points.filter((point) => (!from || point.timeCode >= from) && (!to || point.timeCode <= to));
  if (!points.length) throw new Error("選択した期間に確認済みデータがありません。");
  const metric = metricNameFor(source);
  const notes = [...verified.table.notes, ...(source.reviewWindow ? [`確認期間: ${reviewWindowLabel([source])}。この年度の資料の比較条件を保持します。`] : []),
    ...namedWindowEvidenceNotes(source, points),
    ...(source.policyNotes??[]),
    ...(source.comparisonEquivalence?.limitations ?? []).map((note) => `比較指標の確認範囲: ${note}`)];
  return { ...source, tableId: VERIFIED_TABLE_ID, tableTitle: verified.table.title,
    label: `${companyNames[source.companyId] ?? source.companyId} / ${metric}${source.reviewWindow ? ` / ${reviewWindowLabel([source])}` : ""}`, coordinates: { ...coordinates },
    requiresObservationReview: true, metricDefinition: metric, measureKind: source.measureKind??"flow", periodBasis: source.periodBasis??"fiscal_exact_interval",
    definitionReview: source.comparisonEquivalence
      ? `原系列の資料確認（当時の会社間判定を含む。現在の会社間確認は下記の資料確認結果を参照）: ${source.points[0].provenance.definitionReviewQuote}\n今回の会社間同等性の確認: ${source.comparisonEquivalence.definition}`
      : source.points[0].provenance.definitionReviewQuote,
    points: points.map((point) => ({ ...point, value: String(point.numericValue), unit: source.unit, annotation: null, sourceId: point.evidenceId })),
    timeMask: "", chartKind: "line", axis: "left", color, sourceLabel: `${companyNames[source.companyId] ?? source.companyId} 公開決算資料`,
    sources: Object.fromEntries(points.map((point) => [point.evidenceId, { sourceUrl: point.provenance.sourceUrl, publishedAt: null, retrievedAt: point.provenance.retrievedAt }])),
    timeLabels: Object.fromEntries(points.map((point) => [point.timeCode, point.timeLabel])),
    notes: source.reviewWindow ? [...new Set(notes)] : notes,
  };
}

/** Keep the complete reviewed indicator proof and original source identities in machine exports. */
export function workbenchComparisonMetadata(series) {
  return {
    ...(series.companyId ? { companyId: series.companyId } : {}),
    ...(series.metricId ? { metricId: series.metricId } : {}),
    ...(series.reviewWindow ? { reviewWindow: series.reviewWindow } : {}),
    ...(series.comparisonIndicatorId ? { comparisonIndicatorId: series.comparisonIndicatorId } : {}),
    ...(series.comparisonEquivalence ? { comparisonEquivalence: structuredClone(series.comparisonEquivalence) } : {}),
  };
}

/** Selection is a reference operation. Computation and common-axis overlay have separate gates. */
export function placeSeriesInWorkbench(series, candidate) {
  return series.some((item) => item.id === candidate.id)
    ? { entry: null, reason: "同じ会社・指標・分類の系列は追加済みです。" }
    : { entry: { ...candidate, axis: "left" }, reason: "" };
}

function exactPointKey(point) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(point?.periodStart ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(point?.periodEnd ?? "") || point.periodStart > point.periodEnd) return null;
  for (const date of [point.periodStart, point.periodEnd]) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  }
  return `${point.periodStart}/${point.periodEnd}`;
}

function eligibleSeriesError(series) {
  const policyError=policyCalculationError(series);if(policyError)return policyError;
  if (series.displayOnlyDerived) return "指数化した表示値は原資料の実数ではなく、直接計算用の確認済み観測ではありません。";
  if (series.automaticComparisonAllowed !== true) return "観測値の出典・定義・比較許可が未確認です。元値は参考として個別に表示できます。";
  if (!series.unit || !series.comparisonScope || ["unknown", "not_applicable"].includes(series.comparisonScope) || !series.priceBasis || series.priceBasis === "unknown" || !series.metricDefinition || !series.measureKind || !series.definitionReview) return "単位・対象範囲・価格基準・指標定義と定義変更の確認が必要です。";
  if (!series.periodBasis || !series.points.length || series.points.some((point) => !exactPointKey(point))) return "実際の開始日・終了日と暦年／会計年度などの期間基準が必要です。年の表記だけでは期間を揃えません。";
  if (series.points.some((point) => point.eligibility?.automaticComparisonAllowed === false || (series.requiresObservationReview && (point.eligibility?.automaticComparisonAllowed !== true || !point.provenance?.comparisonVerificationId || !reviewedPointDefinition(series,point))))) return "観測ごとの比較許可・定義確認が不足しています。";
  if (new Set(series.points.map(exactPointKey)).size !== series.points.length) return "同じ実期間の観測が重複しています。";
  return "";
}

export function actualOverlayCompatibility(left, right) {
  const invalid = eligibleSeriesError(left) || eligibleSeriesError(right);
  if (invalid) return invalid;
  const companyDefinitionError = reviewedCompanyComparisonCompatibility(left, right);
  if (companyDefinitionError) return companyDefinitionError;
  if (left.unit !== right.unit) return "単位が異なるため、元値は上下のグラフで表示します。";
  if (left.cycle !== right.cycle || left.periodBasis !== right.periodBasis) return "集計周期・期間基準が異なります。";
  if (left.comparisonScope !== right.comparisonScope || left.priceBasis !== right.priceBasis) return "対象範囲・価格基準が異なるため、個別に表示します。";
  const rightKeys = new Set(right.points.map(exactPointKey));
  return left.points.some((point) => rightKeys.has(exactPointKey(point))) ? "" : "開始日・終了日の一致する共通期間がありません。";
}

// Only these reviewed old/new source identities may share a *display* column.
// Their distinct review windows, comparison families, facts and permissions stay intact.
const REVIEWED_DISPLAY_PAIRS = new Set([
  ["KAJIMA:construction_orders_total_reported@FY2021_FY2023", "KAJIMA:construction_orders_total_reported@FY2024_FY2025"],
  ["KAJIMA:kajima_annual_consolidated_gross_profit_reported", "KAJIMA:kajima_annual_consolidated_gross_profit_reported@FY2024_FY2025"],
  ["OBAYASHI:obayashi_databook_construction_orders_reported", "OBAYASHI:obayashi_databook_construction_orders_reported@FY2024_FY2025"],
  ["OBAYASHI:obayashi_databook_gross_profit_reported", "OBAYASHI:obayashi_databook_gross_profit_reported@FY2024_FY2025"],
].map((ids) => ids.sort().join("|")));

function displayPeriodShape(point) {
  const key = exactPointKey(point);
  if (!key || point.timeCode !== key || Number(point.periodEnd.slice(0, 4)) - Number(point.fiscalYear??point.periodStart.slice(0, 4)) !== 1) return null;
  return `${point.periodStart.slice(5)}|${point.periodEnd.slice(5)}`;
}

function displayJoinReason(left, right) {
  if (left.datasetId !== VERIFIED_DATASET_ID || right.datasetId !== VERIFIED_DATASET_ID) return "確認済み系列以外です。";
  const required = ["companyId", "metricId", "unit", "currency", "priceBasis", "comparisonScope", "cycle", "periodBasis", "measureKind", "metricDefinition"];
  for (const field of required) {
    if (!left[field] || !right[field] || left[field] !== right[field]) return `${field} の確認値が不足または不一致です。`;
  }
  if (left.priceBasis !== "nominal" || left.comparisonScope !== "consolidated" || left.cycle !== "年度次" || left.periodBasis !== "fiscal_exact_interval" || left.measureKind !== "flow" ||
      (left.comparisonIndicatorId ?? null) !== (right.comparisonIndicatorId ?? null) ||
      left.automaticAggregationAllowed !== false || right.automaticAggregationAllowed !== false ||
      left.automaticComparisonAllowed !== true || right.automaticComparisonAllowed !== true) return "会計範囲・指標IDまたは利用条件が一致しません。";
  if ((left.reviewWindow || DEFAULT_REVIEW_WINDOW) === (right.reviewWindow || DEFAULT_REVIEW_WINDOW)) return "同じ確認期間の別系列です。";
  const allPoints = [...left.points, ...right.points];
  const shapes = new Set(allPoints.map(displayPeriodShape));
  if (shapes.size !== 1 || shapes.has(null) || allPoints.some((point) => point.status !== "confirmed_value" ||
      !Number.isFinite(point.numericValue) || point.eligibility?.automaticComparisonAllowed !== true ||
      !point.provenance?.comparisonVerificationId || !reviewedPointDefinition(left.points.includes(point)?left:right,point))) return "実期間・観測ごとの出典確認が揃っていません。";
  const seen = new Map();
  for (const point of allPoints) {
    const year = point.periodStart.slice(0, 4);
    const previous = seen.get(year);
    if (previous && (previous.timeCode !== point.timeCode || previous.numericValue !== point.numericValue || previous.status !== point.status)) {
      return "同一年度の実期間または値が衝突するため、別列で表示します。";
    }
    seen.set(year, point);
  }
  return "";
}

/** Shared strict display join; raw source series remain the only input to exports and calculations. */
export function workbenchRawTableColumns(series) {
  const columns = [];
  for (const item of series) {
    let joined = false;
    let warning = "";
    for (const column of columns) {
      if (column.members.length !== 1 || !REVIEWED_DISPLAY_PAIRS.has([column.members[0].id, item.id].sort().join("|"))) continue;
      const reason = displayJoinReason(column.members[0], item);
      if (reason) { column.warning = reason; warning = reason; continue; }
      column.members.push(item);
      column.label = column.members.find((member) => !member.reviewWindow)?.label
        ?? `${companyNames[item.companyId] ?? item.companyId} / ${item.metricDefinition}`;
      column.boundaryNote = item.companyId === "OBAYASHI"
        ? "表示上の連続列。2024年度以降は資料の比較条件が異なり、2024年度は会計方針変更の遡及適用後の掲載値です。2023年度以前を再計算・遡及していません。会計方針変更前後で資料の比較条件が異なるため、年度をまたぐ直接比較・計算はできません。"
        : item.companyId === "KAJIMA" && item.metricId === "construction_orders_total_reported"
        ? "表示上の連続列。2021～2023年度と2024～2025年度は別の資料・条件で確認しています。両期間を続けた指数・相関は確認できていません。"
        : "表示上の連続列。2024年度以降は資料の比較条件が異なります。両期間を続けた指数・相関は確認できていません。";
      joined = true;
      break;
    }
    if (!joined) columns.push({ key: item.id, label: item.label, members: [item], boundaryNote: "", warning });
  }
  return columns;
}

/** A deduplicated table value retains every original series/point reference and its provenance. */
export function workbenchRawTableCell(column, timeCode) {
  const origins = column.members.flatMap((series) => series.points.filter((point) => point.timeCode === timeCode)
    .map((point) => ({ series, point })));
  return { point: origins[0]?.point ?? null, origins };
}

/** Visual-only chart projection. Preserve every source point and reject gaps or changed chart controls. */
export function workbenchVisualChartGroups(series) {
  const displaySeries = workbenchRawTableColumns(series).flatMap((column) => {
    if (column.members.length !== 2) return column.members;
    const [first, second] = column.members;
    if (first.chartKind !== second.chartKind || first.axis !== second.axis) return column.members;

    const timeCodes = [...new Set(column.members.flatMap((member) => member.points.map((point) => point.timeCode)))].sort();
    const cells = timeCodes.map((timeCode) => ({ timeCode, ...workbenchRawTableCell(column, timeCode) }));
    const boundaries = [];
    for (let index = 1; index < cells.length; index += 1) {
      const previous = cells[index - 1].origins[0];
      const current = cells[index].origins[0];
      if (previous.series.id === current.series.id) continue;
      const oneDay = Date.parse(`${current.point.periodStart}T00:00:00Z`) - Date.parse(`${previous.point.periodEnd}T00:00:00Z`) === 86_400_000;
      if (!oneDay) return column.members;
      boundaries.push({ fromTimeCode: cells[index - 1].timeCode, toTimeCode: cells[index].timeCode,
        fromSeriesId: previous.series.id, toSeriesId: current.series.id,
        fromReviewWindow: reviewWindowFor(previous.series), toReviewWindow: reviewWindowFor(current.series) });
    }
    if (!boundaries.length) return column.members;
    return [{ ...first,
      id: `display:${column.members.map((member) => member.id).join("|")}`,
      label: column.label,
      points: cells.map((cell) => cell.point),
      timeLabels: Object.assign({}, ...column.members.map((member) => member.timeLabels)),
      displayOnlyDerived: true,
      displayOnlyJoined: true,
      displayOriginalSeriesIds: column.members.map((member) => member.id),
      displayOrigins: cells.flatMap((cell) => cell.origins.map((origin) => ({ timeCode: cell.timeCode,
        seriesId: origin.series.id, reviewWindow: reviewWindowFor(origin.series), point: origin.point }))),
      displayReviewBoundaries: boundaries,
      displayBoundaryNote: column.boundaryNote,
    }];
  });
  return workbenchChartGroups(displaySeries);
}

export function workbenchChartGroups(series) {
  const groups = [];
  for (const item of series) {
    const compatible = groups.find((group) => group.every((existing) => !actualOverlayCompatibility(existing, item)));
    if (compatible) compatible.push(item); else groups.push([item]);
  }
  return groups;
}

/** Derived display only. Source points, units and comparison eligibility remain untouched. */
export function indexSeriesAtCommonPeriod(series, requestedBase = "") {
  const failure = (reason) => ({ ok: false, reason, series: [], commonPeriods: [], basePeriod: "", baseFacts: [] });
  if (series.length < 2) return failure("指数で比較する2系列以上を追加してください。");
  const invalid = series.map(eligibleSeriesError).find(Boolean);
  if (invalid) return failure(invalid);
  for (let index = 0; index < series.length; index += 1) {
    for (const other of series.slice(index + 1)) {
      const companyDefinitionError = reviewedCompanyComparisonCompatibility(series[index], other);
      if (companyDefinitionError) return failure(companyDefinitionError);
    }
  }
  if (series.some((item) => item.cycle !== series[0].cycle || item.periodBasis !== series[0].periodBasis)) return failure("暦年・会計年度・月次などの期間基準が一致しません。");
  if (series.some((item) => item.priceBasis !== series[0].priceBasis)) return failure("価格基準が一致しません。");
  if (series.some((item) => item.measureKind !== series[0].measureKind)) return failure("残高・期間内の額・予測など指標の性質が異なります。");
  const maps = series.map((item) => new Map(item.points.map((point) => [exactPointKey(point), point])));
  const common = [...maps[0].keys()].filter((key) => maps.every((map) => observationAnalysisState(map.get(key)) === "valid")).sort();
  if (!common.length) return failure("開始日・終了日の一致する共通有効期間がありません。");
  const base = requestedBase || common.find((key) => maps.every((map) => map.get(key).numericValue !== 0)) || common[0];
  if (!common.includes(base)) return failure("全系列に確定数値がある共通期間を基準に選んでください。");
  if (maps.some((map) => map.get(base).numericValue === 0)) return failure("基準期間に0の系列があるため、100への指数化はできません。");
  const transformed = series.map((item, i) => ({ ...item, displayOnlyDerived: true, sourceUnit: item.unit, unit: "共通基準期間 = 100", axis: "left", indexBasePeriod: base,
    points: common.map((key) => ({ ...maps[i].get(key), timeCode: key, numericValue: maps[i].get(key).numericValue / maps[i].get(base).numericValue * 100, unit: "共通基準期間 = 100" })),
    timeLabels: Object.fromEntries(common.map((key) => [key, key.replace("/", " ～ ")])) }));
  if (transformed.some((item) => item.points.some((point) => !Number.isFinite(point.numericValue)))) return failure("指数化した値が有限数値になりません。");
  return { ok: true, reason: "", series: transformed, commonPeriods: common, basePeriod: base,
    baseFacts: series.map((item, i) => ({ seriesId: item.id, numericValue: maps[i].get(base).numericValue, unit: item.unit, factId: maps[i].get(base).factId ?? null, period: base })) };
}

export function correlationReviewCompatibility(left, right, review) {
  if (!left || !right || left.id === right.id) return "異なる2系列を明示して選んでください。";
  const invalid = eligibleSeriesError(left) || eligibleSeriesError(right);
  if (invalid) return invalid;
  if (!review?.meaning?.trim() || review.definitionsReviewed !== true) return "2指標の関係を何として確認するか記入し、定義・期間・対象範囲を確認してください。";
  if (left.measureKind !== right.measureKind) return "残高・期間内の額・予測など指標の性質が異なり、自動相関の対象にできません。";
  return actualOverlayCompatibility(left, right);
}

/** The same compact-public-data adapter is used by the UI and representative flow tests. */
export function publishedWorkbenchSelection({ meta, coordinates, id, compactSeries, timeValues, timeFrom, timeTo, color, source }) {
  const [unit, timeMask, compactPoints] = compactSeries;
  const mask = typeof timeMask === "string" ? BigInt(`0x${timeMask.replace(/^x/, "")}`) : BigInt(timeMask);
  const stored = new Map(compactPoints.map(([timeCode, numericValue, value, annotation, status]) => [timeCode,
    { timeCode, numericValue, value: value ?? (numericValue === null ? null : String(numericValue)), annotation, status: status ?? "confirmed_value", unit, sourceId: source?.sourceId ?? "", implicitNumericZero: false }]));
  const points = timeValues.filter((item, index) => (mask & (1n << BigInt(index))) !== 0n && (!timeFrom || item.code >= timeFrom) && (!timeTo || item.code <= timeTo)).map((item) => stored.get(item.code) ?? {
    timeCode: item.code, numericValue: meta.implicitNumericZero ? 0 : null, value: meta.implicitNumericZero ? "0" : null,
    status: meta.implicitNumericZero ? "confirmed_value" : "missing", implicitNumericZero: meta.implicitNumericZero, unit, annotation: null, sourceId: source?.sourceId ?? "",
  });
  const selected = meta.dimensions.filter((dim) => dim.apiKey !== "time").map((dim) => dim.values.find((value) => value.code === coordinates[dim.apiKey]));
  const label = selected.map((value) => value?.name).filter(Boolean).join(" / ") || "総数";
  return { id, datasetId: meta.table.datasetId, tableId: meta.table.id, tableTitle: meta.table.title, cycle: meta.table.cycle,
    coordinates: { ...coordinates }, label, unit, timeMask, points, color, chartKind: "line", axis: "left",
    comparisonScope: meta.table.datasetId === "buildbase-company-comparison" ? "unknown" : "not_applicable",
    priceBasis: priceBasisForSelection(selected.map((value) => value?.name ?? ""), meta.table.title),
    automaticComparisonAllowed: meta.automaticComparisonAllowed !== false && meta.table.datasetId !== "buildbase-company-comparison",
    snapshotHash: meta.snapshotHash,
    timeLabels: Object.fromEntries(timeValues.map((item) => [item.code, item.name || item.code])),
    notes: [...(meta.table.notes ?? []), ...selected.map((value) => value?.note).filter(Boolean)],
    sourceLabel: meta.table.statisticsName,
    sources: source?.sourceId ? { [source.sourceId]: { sourceUrl: source.sourceUrl, publishedAt: source.publishedAt, retrievedAt: source.retrievedAt } } : {},
  };
}

/** Unverified numeric cells can be inspected; missing/non-disclosed selections carry no values. */
export function referenceSelectionAllowed(status) {
  return ["unchecked", "unverified", "on_hold"].includes(status);
}

/** Keep held values in the raw table, while withholding their disputed unit/scope from the plot. */
export function workbenchDisplaySeries(series) {
  return series.map((item) => ({ ...item, points: item.points.map((point) => point.status === "on_hold"
    ? { ...point, numericValue: null, annotation: "保留値は原数値表と根拠を確認してください。" } : point) }));
}
