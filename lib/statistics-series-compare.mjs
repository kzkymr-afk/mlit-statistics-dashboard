import { canonicalJson } from "./buildbase-contract-hash.mjs";

// Shared between the workbench UI (components/StatisticsSystemWorkbench.tsx)
// and the system pages export script (scripts/export-system-pages-data.mjs).
// Keeps the combo-identity format identical on both sides so a client-built
// coordinate key always matches a server-built availability index key.

export const COMBO_KEY_SEPARATOR = "";
export const MAX_BULK_ADD_SERIES = 12;

export const AVAILABILITY_STATUS_LABELS = {
  not_applicable: "対象外",
  not_disclosed: "非開示",
  on_hold: "保留",
  unverified: "未確認",
  publication_pending: "公表待ち",
  unavailable: "データなし",
};

/**
 * Builds the same "key=valuekey=value" identity string used by
 * seriesIdFor()/favoriteIdFor() elsewhere in the app, sorted by dimension
 * apiKey so argument order never affects the result.
 */
export function comboIdentity(coordinates) {
  return Object.entries(coordinates)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(COMBO_KEY_SEPARATOR);
}

/**
 * Looks up the availability status for one candidate combination of
 * dimension values. `combos` is the {identity: status} map published as
 * tables/{tableId}/availability.json.gz. A combo absent from the index
 * (or no index at all) is treated as "available" — the index only ever
 * records exceptions, never confirms availability.
 */
export function availabilityStatusFor(combos, coordinates) {
  if (!combos) return "available";
  return combos[comboIdentity(coordinates)] ?? "available";
}

/**
 * Classifies one series' aggregate observation status. Mirrors the
 * exceptionalStatus values stored per point in the series bundles
 * (not_disclosed / publication_pending / null=confirmed_value).
 */
export function classifyComboStatus({
  hasReal,
  hasNotDisclosed,
  hasNotApplicable,
  hasOnHold,
  hasUnverified,
  hasPublicationPending,
  observationCount,
}) {
  if (hasReal) return "available";
  if (!observationCount) return "unavailable";
  if (hasOnHold) return "on_hold";
  if (hasUnverified) return "unverified";
  if (hasNotApplicable) return "not_applicable";
  if (hasNotDisclosed) return "not_disclosed";
  if (hasPublicationPending) return "publication_pending";
  return "unavailable";
}

/**
 * Cartesian product of several dimensions' value codes, e.g.
 * [{apiKey:"tab", codes:["a","b"]}, {apiKey:"cat01", codes:["x"]}]
 * -> [{tab:"a", cat01:"x"}, {tab:"b", cat01:"x"}]
 * Callers should bound the input size themselves (see
 * AVAILABILITY_INDEX_MAX_COMBOS in the export script) — this performs no
 * capping on its own.
 */
export function cartesianCombinations(dimensionValueLists) {
  return dimensionValueLists.reduce(
    (combinations, { apiKey, codes }) =>
      combinations.flatMap((combination) =>
        codes.map((code) => ({ ...combination, [apiKey]: code })),
      ),
    [{}],
  );
}

/** Caps how many checked values a single bulk-add action may expand to. */
export function selectableCompareLimit(
  remainingCapacity,
  maxBulkAdd = MAX_BULK_ADD_SERIES,
) {
  return Math.max(0, Math.min(remainingCapacity, maxBulkAdd));
}

/**
 * Expands a multi-selected dimension into one coordinate map per checked
 * code, holding every other dimension's current single selection fixed.
 */
export function expandCompareSelections({
  baseSelections,
  dimensionApiKey,
  codes,
  remainingCapacity,
  maxBulkAdd = MAX_BULK_ADD_SERIES,
}) {
  const limit = selectableCompareLimit(remainingCapacity, maxBulkAdd);
  return codes.slice(0, limit).map((code) => ({
    ...baseSelections,
    [dimensionApiKey]: code,
  }));
}


/** Reviewed company definitions can cross source families only with one shared source-backed proof. */
export function reviewedCompanyComparisonCompatibility(left, right) {
  const reviewedCompany = (series) => series?.companyId && (series.requiresObservationReview ||
    series.datasetId?.startsWith("buildbase-") || series.points?.some((point) => point.eligibility));
  if (!reviewedCompany(left) || !reviewedCompany(right)) return "";
  if ((left.reviewWindow || "default") !== (right.reviewWindow || "default")) {
    return "確認期間（レビュー単位）が異なるため、別の系列として表示します。";
  }
  if (left.companyId === right.companyId || left.comparisonFamily === right.comparisonFamily) return "";
  const failure = "会社間の指標定義・対象範囲を結ぶ確認が不足しています。";
  const proof = left.comparisonEquivalence;
  const matchesMember = (series) => {
    const member = proof?.members?.find((item) => item.companyId === series.companyId && item.metricId === series.metricId);
    return Array.isArray(member?.factIds) && series.points.length > 0 && series.points.every((point) =>
      member.factIds.includes(point.factId) && proof.periods.includes(point.timeCode) &&
      point.timeCode === `${point.periodStart}/${point.periodEnd}`);
  };
  try {
    if (!left.comparisonIndicatorId || left.comparisonIndicatorId !== right.comparisonIndicatorId ||
        !proof?.id || proof.id !== right.comparisonEquivalence?.id ||
        proof.indicatorId !== left.comparisonIndicatorId || !proof.definition ||
        proof.status !== "source_reviewed_equivalent_indicator" || proof.automaticAggregationAllowed !== false ||
        (proof.reviewWindow || "default") !== (left.reviewWindow || "default") ||
        !Array.isArray(proof.members) || proof.members.length < 2 ||
        !Array.isArray(proof.periods) || !proof.periods.length ||
        !Array.isArray(proof.basisSources) || !proof.basisSources.length ||
        proof.basisSources.some((source) => !/^[a-f0-9]{64}$/.test(source.sourceFileSha256 ?? "") ||
          !source.sourceLocator || typeof source.sourceLocator !== "object" || !source.sourceQuote) ||
        !Array.isArray(proof.limitations) || !proof.limitations.length ||
        canonicalJson(proof) !== canonicalJson(right.comparisonEquivalence) ||
        !matchesMember(left) || !matchesMember(right)) return failure;
  } catch {
    return failure;
  }
  return "";
}

/** Frozen reference cells stay blocked; supplemental API approvals are checked per observation. */
export function comparisonCompatibility(left, right) {
  if (!left || !right) return "分析する2系列をグラフに追加してください。";
  if (left.displayOnlyDerived || right.displayOnlyDerived) return "指数化した表示値を原資料の確認済み実数として相関計算できません。";
  if (left.id === right.id) return "異なる2系列を選んでください。";
  if ([left, right].some((series) => series.automaticComparisonAllowed === false)) {
    return "観測値の出典・定義・比較許可が未確認のため、相関を計算できません。元値は参考表示できます。";
  }
  const reviewed = [left, right].filter((series) => series.requiresObservationReview || series.datasetId?.startsWith("buildbase-") || series.points.some((point) => point.eligibility));
  if (reviewed.some((series) => series.automaticComparisonAllowed !== true ||
      series.automaticAggregationAllowed !== false ||
      !/^[a-f0-9]{64}$/.test(series.snapshotHash ?? "") ||
      series.points.some((point) => point.eligibility?.automaticComparisonAllowed !== true ||
        point.eligibility?.automaticAggregationAllowed !== false ||
        point.provenance?.definitionChangeStatus !== "reviewed_consistent_within_selected_window" ||
        !point.provenance?.comparisonVerificationId ||
        !point.periodStart || !point.periodEnd || point.timeCode !== `${point.periodStart}/${point.periodEnd}`))) {
    return "観測ごとの出典確認と比較許可が必要です。開始日・終了日と定義レビューも確認してください。";
  }
  const companyDefinitionError = reviewedCompanyComparisonCompatibility(left, right);
  if (companyDefinitionError) return companyDefinitionError;
  if (!left.unit || !right.unit || left.unit !== right.unit) return "単位が異なるか未確認です。同じ単位の系列を選んでください。";
  if (!left.cycle || !right.cycle || left.cycle !== right.cycle) return "集計周期が一致しません。暦年・年度・月次などを混ぜて計算できません。";
  if (!left.priceBasis || !right.priceBasis || left.priceBasis === "unknown" || right.priceBasis === "unknown") return "名目・実質などの価格基準を確認できません。";
  if (left.priceBasis !== right.priceBasis) return "名目・実質などの価格基準が一致しません。";
  if (!left.comparisonScope || !right.comparisonScope || left.comparisonScope === "unknown" || right.comparisonScope === "unknown") return "連結・単体などの対象範囲を確認できません。";
  if (left.comparisonScope !== right.comparisonScope) return "連結・単体などの対象範囲が一致しません。";
  const rightTimes = new Set(right.points.map((point) => point.timeCode));
  for (const point of left.points) {
    if (!rightTimes.has(point.timeCode)) continue;
    const matching = right.points.find((item) => item.timeCode === point.timeCode);
    if ((point.periodStart || point.periodEnd || matching?.periodStart || matching?.periodEnd) &&
        (!point.periodStart || !point.periodEnd || point.periodStart !== matching?.periodStart || point.periodEnd !== matching?.periodEnd)) return "実際の開始日・終了日が一致しません。";
    const leftLabel = left.timeLabels?.[point.timeCode];
    const rightLabel = right.timeLabels?.[point.timeCode];
    if (!leftLabel || !rightLabel || leftLabel !== rightLabel) return "同じ期間コードの期間表記が一致しないか未確認です。期間の意味を確認してください。";
  }
  return "";
}

export function observationAnalysisState(point) {
  if (!point) return "missing";
  if (point.status !== "confirmed_value") return point.status || "unverified";
  if (point.implicitNumericZero) return "implicit_zero";
  if (typeof point.numericValue !== "number" || !Number.isFinite(point.numericValue)) return point.value ? "non_numeric" : "missing";
  return "valid";
}

/** Pearson r on exact common periods and source-confirmed finite numeric pairs only. */
export function calculatePearsonComparison(left, right) {
  const incompatible = comparisonCompatibility(left, right);
  if (incompatible) return { ok: false, reason: incompatible, n: 0, omittedPairs: 0, commonPeriods: [], excludedStates: [] };
  const leftPoints = new Map(left.points.map((point) => [point.timeCode, point]));
  const rightPoints = new Map(right.points.map((point) => [point.timeCode, point]));
  const times = [...new Set([...leftPoints.keys(), ...rightPoints.keys()])].sort();
  const pairs = [];
  const commonPeriods = [];
  const excludedStates = new Set();
  let overlap = 0;
  for (const time of times) {
    const a = leftPoints.get(time);
    const b = rightPoints.get(time);
    if (a && b) overlap += 1;
    const states = [observationAnalysisState(a), observationAnalysisState(b)];
    if (states.some((state) => state !== "valid")) {
      states.filter((state) => state !== "valid").forEach((state) => excludedStates.add(state));
      continue;
    }
    pairs.push([a.numericValue, b.numericValue]);
    commonPeriods.push(time);
  }
  const details = { n: pairs.length, omittedPairs: times.length - pairs.length, commonPeriods, excludedStates: [...excludedStates] };
  if (!overlap) return { ...details, ok: false, reason: "共通する期間がありません。" };
  if (!pairs.length) return { ...details, ok: false, reason: "共通期間に確定した数値の組がありません。欠測・非開示・文字値などの状態を確認してください。" };
  if (pairs.length < 3) return { ...details, ok: false, reason: "共通する有効な数値の組が3件未満のため、計算できません。" };
  // Scale before centering to avoid overflowing the sums for large source values.
  const scaleX = Math.max(...pairs.map(([x]) => Math.abs(x))) || 1;
  const scaleY = Math.max(...pairs.map(([, y]) => Math.abs(y))) || 1;
  const scaled = pairs.map(([x, y]) => [x / scaleX, y / scaleY]);
  const meanX = scaled.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const meanY = scaled.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
  let covariance = 0, varianceX = 0, varianceY = 0;
  for (const [x, y] of scaled) {
    covariance += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  }
  if (!varianceX || !varianceY) return { ...details, ok: false, reason: "一方または両方の系列が一定値のため、相関は定義できません。" };
  const r = covariance / Math.sqrt(varianceX) / Math.sqrt(varianceY);
  if (!Number.isFinite(r)) return { ...details, ok: false, reason: "数値の精度上、相関を計算できません。" };
  return { ...details, ok: true, reason: "", r: Math.max(-1, Math.min(1, r)) };
}


export function axisAssignmentError(series, candidate, axis) {
  return series.some((item) => item.id !== candidate.id && item.axis === axis && item.unit !== candidate.unit)
    ? "同じ軸に異なる単位は割り当てられません。もう一方の軸を選んでください。" : "";
}

/** Keep the existing chart intact; place compatible units on a free or matching axis. */
export function placeSeriesOnChart(series, candidate) {
  if (series.some((item) => item.id === candidate.id)) return { entry: null, reason: "同じ分類条件の系列はすでに追加されています。" };
  if (series.some((item) => item.cycle !== candidate.cycle)) return { entry: null, reason: "集計周期が異なるため追加できません。追加済み系列を削除してから、同じ周期の系列を選んでください。" };
  if (series.length && (candidate.priceBasis === "unknown" || series.some((item) => item.priceBasis === "unknown"))) return { entry: null, reason: "名目・実質などの価格基準を確認できないため、他の系列と並べられません。" };
  if (series.some((item) => item.priceBasis !== candidate.priceBasis)) return { entry: null, reason: "名目・実質などの価格基準が異なるため追加できません。" };
  if (series.some((item) => item.comparisonScope !== candidate.comparisonScope)) return { entry: null, reason: "連結・単体などの対象範囲が異なるため追加できません。" };
  for (const item of series) {
    for (const point of candidate.points) {
      const existingLabel = item.timeLabels?.[point.timeCode];
      const candidateLabel = candidate.timeLabels?.[point.timeCode];
      if (existingLabel && candidateLabel && existingLabel !== candidateLabel) return { entry: null, reason: "同じ期間コードの期間表記が異なるため追加できません。" };
    }
  }
  for (const axis of [candidate.axis, candidate.axis === "left" ? "right" : "left"]) {
    if (!axisAssignmentError(series, candidate, axis)) return { entry: { ...candidate, axis }, reason: "" };
  }
  return { entry: null, reason: "左右の軸が別の単位で使用中です。追加前に系列を削除するか、同じ単位の系列を選んでください。" };
}

/** Only explicit selected classifications or an unambiguous title establish a price basis. */
export function priceBasisForSelection(selectedNames, tableTitle) {
  const classify = (text) => {
    const nominal = text.includes("名目");
    const real = text.includes("実質");
    return nominal && real ? "unknown" : nominal ? "nominal" : real ? "real" : "not_applicable";
  };
  const selected = classify(selectedNames.join(" "));
  return selected === "not_applicable" ? classify(tableTitle) : selected;
}


/** Exception indexes do not establish that the normal case contains numeric data. */
export function discoveryStatusFor(combos, coordinates) {
  const status = combos?.[comboIdentity(coordinates)];
  return !status || status === "available" ? "unchecked" : status;
}
