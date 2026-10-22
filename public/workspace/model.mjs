import {analysisFor,cellDisplay} from '../explorer/data-view.mjs';
import {actualOverlayCompatibility,verifiedSeriesSelection} from '../explorer/lib/statistics-workbench.mjs';
export const GP='consolidated_gross_profit_reported';
export const metricNames={profit_attributable_owners_parent:"親会社株主帰属当期純利益（連結）",net_sales_consolidated:"売上高（連結）",operating_income_consolidated:"営業利益（連結）",ordinary_income_consolidated:"経常利益（連結）",sales_consolidated_reported:'売上高',net_profit_parent_consolidated_reported:'親会社株主に帰属する四半期純利益',revenue_consolidated_reported:'売上高',operating_profit_consolidated_reported:'営業利益',ordinary_profit_consolidated_reported:'経常利益',profit_attributable_to_owners_of_parent_reported:'親会社株主に帰属する四半期純利益',gross_profit_consolidated_reported:'売上総利益',construction_orders_reported:'建設事業の受注高',construction_orders_total_reported:'連結建設事業受注高',obayashi_databook_construction_orders_reported:'建設事業受注高（Data Book）',consolidated_gross_profit_reported:'売上総利益合計'};
export const scopeName=x=>({consolidated:'連結',standalone:'単体',non_consolidated:'単体',segment:'セグメント'}[x]||x||'対象範囲未確認');
export const cycleName=x=>({quarter_cumulative_3months:'Q1・3か月累計',quarter_cumulative_6months:'Q2・6か月累計',quarter_cumulative_9months:'Q3・9か月累計',quarter:'単独四半期',quarter_direct:'単独四半期',quarter_only_3months:'単独3か月',point_in_time:'期末時点',point_in_time_stock:'時点残高',fiscal_annual:'年度'}[x]||x);
export const isNumeric=p=>p&&typeof p.numericValue==='number'&&Number.isFinite(p.numericValue)&&!p.implicitNumericZero&&['confirmed_value','reference','extracted'].includes(p.status)&&!p.conflict;
export function makeVerified(series,names){
 const groups=new Map();
 for(const s of series){const basis=['INFR','SMCC'].includes(s.companyId)?s.accountingStandard:null,metric=s.comparisonIndicatorId||s.metricId,key=['v',s.companyId,metric,s.comparisonScope,s.unit,s.priceBasis,s.currency,...(basis?[basis]:[])].join(':');let g=groups.get(key);if(!g){g={id:key,type:'verified',companyId:s.companyId,name:names[s.companyId]||s.companyId,metricId:metric,metricName:(metricNames[metric]||metric)+(basis?' / '+(basis==='JGAAP'?'日本基準':basis==='IFRS'?'IFRS':'親会社資料・基準未明示'):''),unit:s.unit,scope:s.comparisonScope,cycle:'年度次',quality:basis==='not_stated_in_selected_parent_table'?'出典数値確認・基準未明示':'出典確認済み',accountingStandard:basis,originalSeries:[],points:[]};groups.set(key,g);}g.originalSeries.push(s);g.points.push(...s.points.map(p=>({...p,reviewWindow:s.reviewWindow||'default',year:+p.periodStart.slice(0,4),numericValue:p.numericValue,seriesId:s.id})));}
 return [...groups.values()].map(g=>{const unique=new Map();for(const p of g.points){const key=pointKey(p),prev=unique.get(key);if(!prev)unique.set(key,{...p,origins:[p]});else{prev.origins.push(p);if(prev.numericValue!==p.numericValue||prev.status!==p.status){prev.conflict=true;prev.status='unverified';prev.numericValue=null;}}}return {...g,points:[...unique.values()].sort((a,b)=>pointKey(a).localeCompare(pointKey(b)))};});
}
export function makeQuarterly(asset,names){
 const groups=new Map();
 for(const r of asset.payload.records){if(r.actual_or_forecast!=='actual')continue;const key=['q',r.company_id,r.metric_id,r.data_scope,r.unit,r.accounting_standard_id,r.reporting_entity_id,r.period_type,r.source_category_as_disclosed||'',JSON.stringify(r.source_row_path_as_disclosed||[])].join(':');let g=groups.get(key);if(!g){g={id:key,type:'quarterly',companyId:r.company_id,name:names[r.company_id]||r.company_id,metricId:r.metric_id,metricName:metricNames[r.metric_id]||r.metric_id,unit:r.unit,scope:r.data_scope,cycle:cycleName(r.period_type),periodType:r.period_type,quality:'開示原値・比較未審査',points:[]};groups.set(key,g);}g.points.push({timeCode:r.period_start+'/'+r.period_end,timeLabel:r.period_label_as_disclosed,year:+r.fiscal_year,periodStart:r.period_start,periodEnd:r.period_end,numericValue:typeof r.value==='number'&&Number.isFinite(r.value)?r.value:null,value:r.value,status:r.status||'unverified',factId:r.fact_id,raw:r,provenance:{sourceUrl:r.source_url,pdfPage:r.source_locator?.pdf_page,sourceQuote:r.source_quote,documentId:r.document_id,retrievedAt:r.retrieved_at},extractorVersion:r.extractor_version});}
 return [...groups.values()].map(g=>{const unique=new Map();for(const p of g.points){const prev=unique.get(p.timeCode);if(!prev)unique.set(p.timeCode,{...p,origins:[p]});else{prev.origins.push(p);if(prev.numericValue!==p.numericValue||prev.status!==p.status){prev.conflict=true;prev.status='unverified';prev.numericValue=null;}}}return {...g,points:[...unique.values()].sort((a,b)=>a.timeCode.localeCompare(b.timeCode))};});
}
export function fromQuery(d){
 const company=d.table.id==='buildbase-company-annual';
 return {id:'r:'+d.series.id,type:company?'legacy':'statistic',tableId:d.table.id,name:company?d.series.dimensions.find(x=>x.apiKey==='cat01')?.valueName:d.table.datasetTitle,companyId:company?d.query.selections.cat01:null,metricId:d.query.selections.tab,metricName:company?d.series.dimensions.find(x=>x.apiKey==='tab')?.valueName:d.series.label,fullTitle:d.table.title,unit:d.series.unit,cycle:d.table.cycle,scope:company?'原表範囲未確認':'調査対象集計',quality:'原表参照・実期間未確認',query:d.query,source:d.sources,table:d.table,points:d.observations.map(p=>({...p,year:+p.timeCode.slice(0,4),reference:true,provenance:{sourceUrl:d.table.sourceUrl},factId:d.series.id+':'+p.timeCode}))};
}
export function filtered(s,from,to){return {...s,points:s.points.filter(p=>p.year>=from&&p.year<=to)};}
export function pointKey(p,reference=false){return reference?String(p.year):p.periodStart&&p.periodEnd?`${p.periodStart}/${p.periodEnd}`:String(p.timeCode||p.timeLabel||p.year);}
export function pointLabel(p){return p.periodStart&&p.periodEnd?`${p.periodStart} ～ ${p.periodEnd}`:p.timeLabel||p.timeCode||`${p.year}年`;}
export function periodRows(series){return [...new Set(series.flatMap(s=>s.points.map(p=>pointKey(p))))].sort();}
export function reviewSpanNote(series){
 const policyNotes=[...new Set(series.flatMap(s=>(s.originalSeries||[]).flatMap(o=>o.policyNotes||[])))];
 if(policyNotes.length)return "資料に記載された数値の推移です。会計方針の変更前後を同じ条件とみなした指数・相関の計算はしません。 "+policyNotes.join(" ");
 const windows=new Map();
 for(const s of series.filter(s=>s.type==='verified'))for(const o of s.originalSeries||[]){const active=o.points.filter(p=>s.points.some(q=>pointKey(q)===pointKey(p)));if(!active.length)continue;const start=Math.min(...active.map(p=>+p.periodStart.slice(0,4))),end=Math.max(...active.map(p=>+p.periodStart.slice(0,4)));if(Number.isFinite(start)&&Number.isFinite(end))windows.set(`${start}-${end}`,`${start}–${end}年度`);}
 return windows.size>1?`${[...windows.values()].join('と')}は別々に指標定義を確認しています。両期間を通した定義の一致は未確認のため、線をつながず、全期間の相関を計算しません。`:'';
}
export function referenceAllowed(series,gate=compatible(series)){return !series.some(s=>s.accountingStandard==='not_stated_in_selected_parent_table')&&!(series.every(s=>s.companyId==='INFR')&&new Set(series.map(s=>s.accountingStandard)).size>1)&&!gate.ok&&series.length===2&&new Set(series.map(s=>s.cycle)).size===1;}
export function compatible(series){
 if(series.length<2)return {ok:true};
 if(series.every(s=>s.type==='verified'&&s.metricId===series[0].metricId)){
  const active=s=>s.originalSeries.map(o=>({...o,points:o.points.filter(p=>s.points.some(q=>pointKey(q)===pointKey(p)))})).filter(o=>o.points.length);
  for(let i=0;i<series.length;i++)for(let j=i+1;j<series.length;j++){
   const left=active(series[i]),right=active(series[j]);if(!left.length||!right.length)return {ok:false,reason:'両系列に同じ期間の確認済み観測がありません。'};
   for(const a of left){let matched=false;for(const b of right){if(!a.points.some(p=>b.points.some(q=>pointKey(q)===pointKey(p))))continue;matched=true;const verified={series:[a,b],table:{notes:[],title:'確認済み開示値'}};const adapt=x=>verifiedSeriesSelection(verified,{cat01:x.companyId,tab:x.metricId,reviewWindow:x.reviewWindow||'default'},undefined,undefined,'#2464dd');const result=actualOverlayCompatibility(adapt(a),adapt(b));if(result)return {ok:false,reason:result};}if(!matched)return {ok:false,reason:'片方の資料で確認した実期間に対応する観測がありません。'};}
  }
  return {ok:true};
 }
 if(series.every(s=>s.type==='quarterly'&&s.companyId===series[0].companyId&&s.periodType===series[0].periodType&&s.scope===series[0].scope&&s.unit===series[0].unit))return {ok:true,reference:true,reason:'同じ会社・同じ累計期間の開示原値を閲覧表示。自動比較・集計・相関の許可はありません。'};
 if(series.every(s=>s.type==='verified'&&s.companyId===series[0].companyId&&s.unit===series[0].unit&&s.scope===series[0].scope&&s.cycle===series[0].cycle)){
  const common=series[0].points.some(p=>series.slice(1).every(s=>s.points.some(q=>pointKey(q)===pointKey(p))));if(common)return {ok:true,reference:true,reason:'同じ会社・実期間・単位の複数指標を表示しています。指標間の定義の同等性は未確認のため、相関は計算しません。'};
 }
 const reasons=[...new Set(series.flatMap(s=>s.points.map(p=>p.comparisonUnresolvedReason).filter(Boolean)))];if(new Set(series.map(s=>s.cycle)).size>1)reasons.push('粒度が異なります：'+[...new Set(series.map(s=>s.cycle))].join(' / '));if(new Set(series.map(s=>s.unit)).size>1)reasons.push('単位が異なります：'+[...new Set(series.map(s=>s.unit))].join(' / '));
 if(series.some(s=>['statistic','legacy'].includes(s.type)))reasons.push('原表の実際の開始日・終了日は未確認です');
 if(new Set(series.map(s=>s.scope)).size>1)reasons.push('会社の連結範囲と市場の調査母集団を同一視できません');
 return {ok:false,reason:reasons.join('。')||'開示定義・比較許可が未確認です。'};
}
export function correlation(series,from,to){
 if(series.length!==2)return {ok:false,reason:'相関の対象を2系列選択してください。',n:0};
 if(series.some(s=>s.type!=='verified'))return {ok:false,reason:'実期間・比較許可の審査が未完了の系列を含みます。相関を計算しません。',n:0};
 if(series[0].metricId!==series[1].metricId)return {ok:false,reason:'異なる指標の相関は既存契約で未審査です。',n:0};
 const original=series.flatMap(s=>s.originalSeries);const r=analysisFor(original,series[0].metricId,series.map(s=>s.companyId),from,to);
 if(!r.ok)return {...r,n:0};
 const result=r.correlation;
 if(result.ok&&result.n!==result.commonPeriods.length)return {ok:false,reason:'計算結果と対応期間の件数が一致しません。',n:0};
 return {...result,pairs:(result.commonPeriods||[]).map(t=>t.replace('/', ' ～ ')),excluded:result.omittedPairs||0};
}
export function display(p){if(!p)return cellDisplay(p);if(p?.conflict)return {text:'値が競合・保留',state:'held'};if(p?.reference)return cellDisplay(p);if(isNumeric(p))return {text:p.numericValue.toLocaleString('ja-JP'),state:p.status==='extracted'?'raw':'confirmed',detail:p.status==='extracted'?'開示原値・比較未審査':'出典確認済み'};return cellDisplay(p);}

/** Group only same-indicator reviewed series; leave every reference visible separately. */
export function automaticChartGroups(series){const groups=[];for(const s of series){const group=s.type==='verified'?groups.find(g=>g.every(x=>x.type==='verified'&&x.metricId===s.metricId)&&compatible([...g,s]).ok):null;if(group)group.push(s);else groups.push([s]);}return groups;}
