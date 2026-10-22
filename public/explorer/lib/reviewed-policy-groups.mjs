/** A source-checked reported history is displayable across policy changes.
 * Calculations remain limited to one explicitly reviewed accounting interval.
 * This contract is currently scoped to the explicitly reviewed company/metric pairs. */
const REVIEWED_PL_COMPANIES=['ASANUMA','PENTA','OKUMURA','KUMAGAI','NISHIMATSU'];
const REVIEWED_PL_METRICS=['net_sales_consolidated','ordinary_income_consolidated'];
export function validReviewedPolicyGroups(s){
 if(s?.comparisonPolicyMode!=='reported_values_with_reviewed_groups'||!['KAJIMA','OBAYASHI','TAISEI','SHIMIZU','ANDO_HAZAMA','NISHIMATSU','PENTA','OKUMURA','KUMAGAI','TODA','TOA','TOKYU','HASEKO','ASANUMA','KITANO','TAKENAKA','MATSUI','ZENITAKA','INFR','SMCC','MAEDA'].includes(s.companyId)||!(s.metricId==='operating_income_consolidated'||(REVIEWED_PL_COMPANIES.includes(s.companyId)&&REVIEWED_PL_METRICS.includes(s.metricId)))||s.comparisonScope!=='consolidated'||(s.unit!=='百万円'&&!(s.companyId==='SMCC'&&s.unit==='億円'&&s.accountingStandard==='not_stated_in_selected_parent_table'))||s.cycle!=='年度次'||!Array.isArray(s.comparisonPolicyGroups)||!s.comparisonPolicyGroups.length||!Array.isArray(s.points)||!s.points.length)return false;
 if(REVIEWED_PL_COMPANIES.includes(s.companyId)&&s.metricId!=='operating_income_consolidated'&&s.accountingStandard!=='JGAAP')return false;
 if(s.companyId==='INFR'&&!['JGAAP','IFRS'].includes(s.accountingStandard))return false;
 if(s.companyId==='SMCC'&&!['JGAAP','not_stated_in_selected_parent_table'].includes(s.accountingStandard))return false;
 if(s.companyId==='SMCC'&&s.accountingStandard==='not_stated_in_selected_parent_table'){const p=s.points[0],v=p?.provenance;if(s.unit!=='億円'||s.points.length!==1||p.numericValue!==185||p.periodStart!=='2025-04-01'||p.periodEnd!=='2026-03-31'||v.sourceFileSha256!=='63e9978f1fff70754caa5082eff805f5f2f2b7f7fa9da4da0a85298df6661005'||v.pdfPage!==56||v.sourceDocumentId!=='SMCC_FY2025_PARENT_FP')return false;}
 const groups=s.comparisonPolicyGroups,ids=new Set(),calendar=s.companyId==='TAKENAKA';
 for(const g of groups){if(ids.has(g.id)||!g.id||g.status!=='source_reviewed_policy_group'||!(calendar?/^\d{4}-01-01$/:/^\d{4}-04-01$/).test(g.periodStart)||!(calendar?/^\d{4}-12-31$/:/^\d{4}-03-31$/).test(g.periodEnd)||g.periodStart>=g.periodEnd||!/^[a-f0-9]{64}$/.test(g.sourceFileSha256||'')||!Number.isInteger(g.sourceLocator?.pdf_page)||g.sourceLocator.pdf_page<1||!g.sourceQuote)return false;ids.add(g.id);}
 const sorted=[...groups].sort((a,b)=>a.periodStart.localeCompare(b.periodStart));if(sorted.some((g,i)=>i&&sorted[i-1].periodEnd>=g.periodStart))return false;
 return s.points.every(p=>groups.filter(g=>p.comparisonPolicyGroup===g.id&&p.periodStart>=g.periodStart&&p.periodEnd<=g.periodEnd).length===1&&p.provenance?.accountingStandard===(['INFR','SMCC'].includes(s.companyId)?s.accountingStandard:'JGAAP'));
}
export function reviewedPointDefinition(s,p){return p?.provenance?.definitionChangeStatus==='reviewed_consistent_within_selected_window'||(p?.provenance?.definitionChangeStatus==='reviewed_consistent_within_policy_group'&&validReviewedPolicyGroups(s));}
export function policyCalculationError(s){
 if(!s?.comparisonPolicyMode)return '';
 if(s.companyId==='SMCC'&&s.accountingStandard==='not_stated_in_selected_parent_table')return '選択表の会計基準・連結範囲の内訳は未確認です。条件付き閲覧だけを許可し、計算しません。';
 if(!validReviewedPolicyGroups(s))return '会計方針ごとの比較条件を確認できません。';
 return new Set(s.points.map(p=>p.comparisonPolicyGroup)).size>1?'会計方針の変更をまたぐ同条件での計算は未確認です。表示された資料の数値は参照でき、確認済みの同じ会計区分の期間に絞れます。':'';
}
