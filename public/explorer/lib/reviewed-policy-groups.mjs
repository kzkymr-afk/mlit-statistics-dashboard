/** A source-checked reported history is displayable across policy changes.
 * Calculations remain limited to one explicitly reviewed accounting interval.
 * This contract is currently scoped to the explicitly reviewed company/metric pairs. */
export function validReviewedPolicyGroups(s){
 if(s?.comparisonPolicyMode!=='reported_values_with_reviewed_groups'||!['KAJIMA','OBAYASHI'].includes(s.companyId)||s.metricId!=='operating_income_consolidated'||s.comparisonScope!=='consolidated'||s.unit!=='百万円'||s.cycle!=='年度次'||!Array.isArray(s.comparisonPolicyGroups)||!s.comparisonPolicyGroups.length||!Array.isArray(s.points)||!s.points.length)return false;
 const groups=s.comparisonPolicyGroups,ids=new Set();
 for(const g of groups){if(ids.has(g.id)||!g.id||g.status!=='source_reviewed_policy_group'||!/^\d{4}-04-01$/.test(g.periodStart)||!/^\d{4}-03-31$/.test(g.periodEnd)||g.periodStart>=g.periodEnd||!/^[a-f0-9]{64}$/.test(g.sourceFileSha256||'')||!Number.isInteger(g.sourceLocator?.pdf_page)||g.sourceLocator.pdf_page<1||!g.sourceQuote)return false;ids.add(g.id);}
 const sorted=[...groups].sort((a,b)=>a.periodStart.localeCompare(b.periodStart));if(sorted.some((g,i)=>i&&sorted[i-1].periodEnd>=g.periodStart))return false;
 return s.points.every(p=>groups.filter(g=>p.comparisonPolicyGroup===g.id&&p.periodStart>=g.periodStart&&p.periodEnd<=g.periodEnd).length===1&&p.provenance?.accountingStandard==='JGAAP');
}
export function reviewedPointDefinition(s,p){return p?.provenance?.definitionChangeStatus==='reviewed_consistent_within_selected_window'||(p?.provenance?.definitionChangeStatus==='reviewed_consistent_within_policy_group'&&validReviewedPolicyGroups(s));}
export function policyCalculationError(s){
 if(!s?.comparisonPolicyMode)return '';
 if(!validReviewedPolicyGroups(s))return '会計方針ごとの比較条件を確認できません。';
 return new Set(s.points.map(p=>p.comparisonPolicyGroup)).size>1?'会計方針の変更をまたぐ同条件での計算は未確認です。表示された資料の数値は参照でき、確認済みの同じ会計区分の期間に絞れます。':'';
}
