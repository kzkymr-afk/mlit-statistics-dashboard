import {validReviewedRestatement} from './reviewed-restatement.mjs';
import {validReviewedPolicyGroups,reviewedPointDefinition} from './reviewed-policy-groups.mjs';
import { canonicalJson, canonicalSha256 } from "./buildbase-contract-hash.mjs";
import { calculatePearsonComparison } from "./statistics-series-compare.mjs";

export function validateComparisonEquivalence(payload) {
  const proof = payload.comparisonEquivalence;
  if (!proof && !payload.comparisonIndicatorId) return;
  const periods = payload.points.map((point) => point.timeCode).sort();
  const member = proof?.members?.find((item) => item.companyId === payload.companyId && item.metricId === payload.metricId);
  const facts = payload.points.map((point) => point.factId).sort();
  if (!proof?.id || !payload.comparisonIndicatorId || proof.indicatorId !== payload.comparisonIndicatorId ||
      !proof.definition || proof.status !== "source_reviewed_equivalent_indicator" ||
      proof.automaticAggregationAllowed !== false || proof.reviewWindow !== payload.reviewWindow || !Array.isArray(proof.periods) ||
      canonicalJson([...proof.periods].sort()) !== canonicalJson(periods) ||
      !Array.isArray(proof.members) || proof.members.length < 2 ||
      new Set(proof.members.map((item) => `${item.companyId}:${item.metricId}`)).size !== proof.members.length ||
      !Array.isArray(member?.factIds) || canonicalJson([...member.factIds].sort()) !== canonicalJson(facts) ||
      !Array.isArray(proof.basisSources) || !proof.basisSources.length ||
      proof.basisSources.some((source) => !/^[a-f0-9]{64}$/.test(source.sourceFileSha256 ?? "") ||
        !source.sourceLocator || typeof source.sourceLocator !== "object" || !source.sourceQuote) ||
      !Array.isArray(proof.limitations) || !proof.limitations.length) {
    throw new Error("Source-reviewed comparison equivalence is incomplete or does not cover the original facts/periods.");
  }
}


/** Only the supplemental reviewed API can produce this kind of series. */
export async function seriesFromBuildBaseComparison(response) {
  const payload = response?.payload;
  if (!payload || !/^[a-f0-9]{64}$/.test(response.snapshotHash ?? "") ||
      await canonicalSha256(payload) !== response.snapshotHash || payload.schemaVersion !== 1 ||
      payload.datasetId !== "buildbase-source-verified-comparison" ||
      payload.automaticComparisonAllowed !== true || payload.automaticAggregationAllowed !== false ||
      (payload.reviewWindow !== undefined && (typeof payload.reviewWindow !== "string" ||
        !/^[A-Za-z0-9_.-]+$/.test(payload.reviewWindow) || payload.reviewWindow === "default")) ||
      !payload.comparisonFamily || !Array.isArray(payload.points) || payload.points.length < (payload.reviewWindow ? 1 : 3)) {
    throw new Error("BuildBaseの出典確認済み系列の版または比較許可を確認できません。");
  }
  validateComparisonEquivalence(payload);
  if(payload.comparisonPolicyMode&&(!validReviewedPolicyGroups(payload)||!Array.isArray(payload.sourceCoverage)||canonicalJson(payload.points.map(p=>p.timeCode).sort())!==canonicalJson([...payload.sourceCoverage].sort())))throw new Error("会計方針ごとの出典・期間を確認できません。");
  const times = new Set();
  for (const point of payload.points) {
    const source = point.provenance;
    if(source?.reviewedRestatement&&!validReviewedRestatement(payload,point))throw Error("遡及修正の資料と対象年度を確認できません。");
    if (times.has(point.timeCode) || point.timeCode !== `${point.periodStart}/${point.periodEnd}` ||
        point.status !== "confirmed_value" || point.implicitNumericZero !== false ||
        typeof point.numericValue !== "number" || !Number.isFinite(point.numericValue) ||
        point.eligibility?.automaticComparisonAllowed !== true || point.eligibility?.automaticAggregationAllowed !== false ||
        !point.factId || !point.evidenceId || !point.timeLabel ||
        !/^[a-f0-9]{64}$/.test(source?.sourceFileSha256 ?? "") ||
        !/^[a-f0-9]{64}$/.test(source?.documentVersionSha256 ?? "") ||
        !source?.pdfPage || !source?.sourceQuote || !source?.comparisonVerificationId ||
        !reviewedPointDefinition(payload,point) ||
        !source?.definitionReviewQuote || !(source?.sourceUrl?.startsWith("https://") || (payload.comparisonPolicyMode&&source?.sourceLinkStatus==="saved_document_identified_individual_url_unconfirmed"&&/^S100[A-Z0-9]{4}$/.test(source?.sourceDocumentId||"")&&source?.documentTitle))) {
      throw new Error("観測値の出典・期間・比較許可が未確認です。");
    }
    times.add(point.timeCode);
  }
  return { ...payload, snapshotHash: response.snapshotHash,
    timeLabels: Object.fromEntries(payload.points.map((point) => [point.timeCode, point.timeLabel])) };
}

export async function compareBuildBaseResponses(left, right) {
  const series = await Promise.all([seriesFromBuildBaseComparison(left), seriesFromBuildBaseComparison(right)]);
  return { series, result: calculatePearsonComparison(...series) };
}

/** Presentation fallback only: original metric/facts/payload and comparison identity stay intact. */
export function reviewedMetricDisplayName(series) {
  const disclosed = typeof series.metricLabelAsDisclosed === "string" && series.metricLabelAsDisclosed.trim();
  if (disclosed) return disclosed;
  const name = series.label?.split(" / ").slice(1).join(" / ") || series.metricId;
  return series.companyId === "KAJIMA" && series.metricId === "construction_orders_total_reported" && name === series.metricId
    ? "連結建設事業受注高" : name;
}
