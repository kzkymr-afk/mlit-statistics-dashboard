import {reviewedRestatementMatches} from './reviewed-restatement.mjs';
import {canonicalSha256} from './buildbase-contract-hash.mjs';
import {verifiedWorkbenchCatalog,verifiedSeriesSelection} from './statistics-workbench.mjs';
export const REVIEWED_COMPANY_URL='workspace/reviewed-company-comparisons.json';
function reviewedFiscalPeriodMatches(m,p){
 const y=+p.periodStart.slice(0,4);
 if(m.companyId==='TAKENAKA'&&m.legacyMetricId==='operating_income_consolidated')return m.fiscalCalendar==='calendar_year'&&p.periodStart===`${y}-01-01`&&p.periodEnd===`${y}-12-31`;
 return !m.fiscalCalendar&&p.periodStart.slice(4)==='-04-01'&&p.periodEnd===`${y+1}-03-31`;
}
export async function reviewedCompanyCatalog(wrapper){
 const p=wrapper?.payload;
 if(!p||wrapper.snapshotHash!==await canonicalSha256(p)||p.schemaVersion!==1||p.datasetId!=='atlas-reviewed-company-connection'||p.automaticAggregationAllowed!==false||!Array.isArray(p.mappings)||!Array.isArray(p.series))throw Error('会社別比較の出典と確認範囲が一致しません。');
 const catalog=await verifiedWorkbenchCatalog(p.series),keys=new Set();
 for(const m of p.mappings){const k=m.companyId+':'+m.legacyMetricId,s=catalog.series.find(s=>s.id===m.reviewedSeriesId);
  if(keys.has(k)||!s||s.companyId!==m.companyId||s.metricId!==m.legacyMetricId||s.comparisonScope!==m.scope||s.unit!==m.unit||m.scope!=='consolidated'||m.periodKind!=='annual_flow'||m.accountingStandard!=='JGAAP'||s.points.some(pt=>pt.provenance.accountingStandard!=='JGAAP'||!m.fiscalYears.includes(+pt.periodStart.slice(0,4))||!reviewedFiscalPeriodMatches(m,pt)))throw Error('会社・年度・通期・単位・連結範囲の対応が確認できません。');
  keys.add(k);
 }
 if(keys.size!==catalog.series.length)throw Error('比較する指標の対応が不足しています。');
 return {...catalog,mappings:p.mappings,responses:p.series,sourceSnapshot:wrapper.snapshotHash};
}
/** Exact source-pinned KITANO unit conversion representation differences only; no epsilon. */
function reviewedUnitPrecisionMatches(legacy,series,point,match){
 if(legacy?.coordinates?.cat01!=='KITANO'||legacy.coordinates.tab!=='operating_income_consolidated'||legacy.unit!=='百万円'||series?.companyId!=='KITANO'||series.metricId!=='operating_income_consolidated'||series.comparisonScope!=='consolidated'||series.unit!=='百万円'||series.cycle!=='年度次')return false;
 const pins=[{"year":2016,"legacyValue":4856.5289999999995,"value":4856.529,"raw":4856529,"doc":"S100AMKX","page":39,"sha":"658c4ce6a746a7d3304ada9fdc3a29fc066cae0a807f6393b547c95a09000d89"},{"year":2017,"legacyValue":4885.9169999999995,"value":4885.917,"raw":4885917,"doc":"S100DCKB","page":38,"sha":"f24f0b49c969e5c00f70a9f4c2d1725521906aac4b349c2731543895fce1b2c6"},{"year":2018,"legacyValue":4618.255999999999,"value":4618.256,"raw":4618256,"doc":"S100G5RZ","page":43,"sha":"8c00bd45313e237e7ccdf8af2ceb2fb9e9e8cf91ec52370ef20955a3984b0204"}];const p=match?.provenance;
 return pins.some(x=>point.timeCode===`${x.year}100000`&&point.numericValue===x.legacyValue&&match.periodStart===`${x.year}-04-01`&&match.periodEnd===`${x.year+1}-03-31`&&match.numericValue===x.value&&p.sourceUnit==='千円'&&p.sourceNumericValue===x.raw&&p.unitConversionFactor===0.001&&p.sourceDocumentId===x.doc&&p.pdfPage===x.page&&p.sourceFileSha256===x.sha&&p.accountingStandard==='JGAAP');
}

/** Never change legacy permissions. Use separate reviewed observations only on exact matches. */
export function connectReviewedCompanySelection(legacy,catalog){
 if(legacy.datasetId!=='buildbase-company-comparison')return {entries:[legacy],reviewedPoints:0,reasons:[]};
 const co=legacy.coordinates.cat01,metric=legacy.coordinates.tab,m=catalog?.mappings.find(m=>m.companyId===co&&m.legacyMetricId===metric),source=catalog?.series.find(s=>s.id===m?.reviewedSeriesId);
 const accepted=[],remaining=[],reasons=[];
 const wrongPeriod=legacy.tableId!=='buildbase-company-annual'||legacy.cycle!=='年度次';
 const wrongScope=[legacy.comparisonScope,legacy.scope].some(s=>['standalone','non_consolidated','segment'].includes(s));
 for(const point of legacy.points){
  const year=/^\d{4}100000$/.test(point.timeCode)?+point.timeCode.slice(0,4):null,match=source?.points.find(p=>+p.periodStart.slice(0,4)===year);
  const reason=point.numericValue===null||point.numericValue===undefined?'選択した年度の数値がありません。':point.status!=='confirmed_value'?'数値の確認が完了していません。':wrongPeriod?'通期の年次表ではないため、累計四半期や単独四半期を年度値へ転用しません。':wrongScope?'単体・事業別と連結の対象範囲が異なるため、参考表示に残します。':!catalog?'比較用の確認データを読み込めないため、参考表示に残します。':!m?'この会社・指標は、比較の出典・定義をまだ確認できていません。':legacy.unit!==m.unit?'資料の単位が異なるため、自動換算せず参考表示に残します。':!match?'選択した年度の実期間と定義は比較用に未確認です。':match.numericValue!==point.numericValue&&!reviewedRestatementMatches(legacy,source,point,match)&&!reviewedUnitPrecisionMatches(legacy,source,point,match)?'参考表と確認済み資料の数値が一致しないため、確認が必要です。':'';
  if(reason){remaining.push({...point,comparisonUnresolvedReason:reason});reasons.push(reason);}else accepted.push(match);
 }
 const entries=[];
 if(accepted.length){const e=verifiedSeriesSelection(catalog,{cat01:co,tab:metric,reviewWindow:source.reviewWindow},undefined,undefined,legacy.color);const times=new Set(accepted.map(p=>p.timeCode));e.points=e.points.filter(p=>times.has(p.timeCode));e.timeLabels=Object.fromEntries(e.points.map(p=>[p.timeCode,p.timeLabel]));e.legacyReference={tableId:legacy.tableId,seriesId:legacy.id,selectedFiscalYears:accepted.map(p=>+p.periodStart.slice(0,4)),sourceSnapshot:catalog.sourceSnapshot};e.notes.push('会社別参考表との一致、または資料に明記された遡及修正を確認し、出典・定義・通期・単位・連結範囲を照合した年度だけを比較に接続しています。未確認年度は別の参考表示に残します。');for(const p of accepted)if(p.provenance?.reviewedRestatement)e.notes.push(p.provenance.reviewedRestatement.note);entries.push(e);}
 if(remaining.length||!legacy.points.length)entries.push({...legacy,points:remaining,comparisonUnresolvedReason:[...new Set(reasons)].join(' '),automaticComparisonAllowed:false,notes:[...legacy.notes,...new Set(reasons)]});
 return {entries,reviewedPoints:accepted.length,reasons:[...new Set(reasons)]};
}
