import { verifiedSeriesSelection, indexSeriesAtCommonPeriod } from './lib/statistics-workbench.mjs';
import { seriesFromBuildBaseComparison } from './lib/buildbase-verified-comparison.mjs';
import { calculatePearsonComparison, observationAnalysisState, comboIdentity } from './lib/statistics-series-compare.mjs';
export const GP='consolidated_gross_profit_reported';
export const reviewedIndicators=[
 {id:GP,name:'売上総利益合計（連結・開示実績）',unit:'百万円',scope:'連結',definition:'日本基準の連結損益計算書に開示された売上総利益合計。工事だけの利益や利益率とは区別します。',kind:'verified'},
 {id:'construction_orders_total_reported',name:'鹿島建設 · 連結建設事業受注高',unit:'百万円',scope:'連結',definition:'鹿島建設のFactbook開示総額。大林組の受注高との会社間同等性は未確認です。',kind:'verified'},
 {id:'obayashi_databook_construction_orders_reported',name:'大林組 · 建設事業受注高（Data Book）',unit:'百万円',scope:'連結',definition:'大林組のData Book開示値。鹿島建設の連結建設事業受注高とは別の定義として保持します。',kind:'verified'},
];
export async function validatedPacket(packet){return Promise.all(packet.series.map(seriesFromBuildBaseComparison));}
export function matchesIndicator(s,id){return id===GP?s.comparisonIndicatorId===GP:s.metricId===id;}
export function pointsFor(series,id,companies,from,to){return series.filter(s=>matchesIndicator(s,id)&&companies.includes(s.companyId)).flatMap(s=>s.points.filter(p=>pointInYearRange(p,from,to)).map(p=>({...p,series:s,companyId:s.companyId,year:p.year===null?null:p.year??+p.periodStart?.slice(0,4)})));}
export function cellDisplay(point){
 if(!point)return {text:'未読込',state:'unloaded',status:'unloaded',rawStatus:'',detail:'会社別・年度別の観測値は未読込です。欠測や非開示の判定ではありません。'};
 if(point.reference && typeof point.numericValue==='number' && Number.isFinite(point.numericValue) && !point.implicitNumericZero && point.status==='confirmed_value')return {text:point.numericValue.toLocaleString('ja-JP'),state:'reference',status:'not_reviewed',rawStatus:point.status,detail:'原表参照 / 出典・実期間未確認。指数・相関の対象外です。'};
 if(point.reference&&point.implicitNumericZero)return {text:'0（省略による0・未確認）',state:'implicit_zero',status:'implicit_zero',rawStatus:point.status,detail:'原表の省略による0。出典・実期間未確認のため、分析・グラフの対象外です。'};
 if(point.reference&&point.recordedComboStatus&&point.rawTuple===null)return {text:'原記録あり・範囲未確認',state:'unverified_record_scope',status:'unverified_record_scope',rawStatus:point.status??'',detail:'組合せ単位の原記録：'+point.recordedComboStatus+'。年度・資料・範囲は未確認です。'};
 const st=observationAnalysisState(point);
 const rawStatus=point.status??'';
 if(!point.reference&&st==='valid')return {text:point.numericValue.toLocaleString('ja-JP'),state:'confirmed',status:'confirmed_value',rawStatus,detail:'出典確認済み'};
 if(point.status==='not_disclosed'){
  const description=typeof point.disclosureScope?.description==='string'?point.disclosureScope.description.trim():'';
  if(point.disclosureScope?.verified===true&&description)return {text:'非開示',state:'not_disclosed',status:'scoped_not_disclosed',rawStatus,detail:'確認済み非開示範囲：'+description};
  return {text:'原記録あり・範囲未確認',state:'unverified_disclosure_scope',status:'unverified_disclosure_scope',rawStatus,detail:'原記録はnot_disclosedですが、確認済みの年度・資料・非開示範囲がありません。非開示とは確定しません。'};
 }
 const labels={missing:'未収録',unverified:'未確認',not_applicable:'対象外',extraction_failed:'抽出失敗',implicit_zero:'未確認',publication_pending:'公表待ち',on_hold:'保留',suppressed:'秘匿',not_reviewed:'未確認'};
 return {text:labels[st]||'未確認',state:point.reference&&st==='valid'?'reference':st,status:point.reference&&st==='valid'?'not_reviewed':st,rawStatus,detail:'0として扱わず、分析から除外します。'};
}
export function observationExportFields(point){
 const display=cellDisplay(point),scope=point?.disclosureScope;
 return {raw_status:display.rawStatus,status:display.status,display_state:display.state,label:display.text,detail:display.detail,disclosure_scope:scope&&typeof scope==='object'?JSON.stringify(scope):''};
}
export function csvField(value){return '"'+String(value??'').replaceAll('"','""')+'"';}
export function serializeCsv(rows){return rows.map(row=>row.map(csvField).join(',')).join('\r\n');}
export function isFiniteMarketReferenceTuple(tuple){return Array.isArray(tuple)&&tuple.length===5&&typeof tuple[1]==='number'&&Number.isFinite(tuple[1])&&tuple[4]===null;}
export function marketPointDisplay(tuple){
 const status=isFiniteMarketReferenceTuple(tuple)?'confirmed_value':tuple?.[4]??(tuple?.[1]===null?'missing':'unverified');
 return cellDisplay({reference:true,status:status||'unverified',numericValue:tuple?.[1],implicitNumericZero:false});
}
export function recordedLegacyStatus(index,company,indicator){const status=index?.combos?.[comboIdentity({cat01:company,tab:indicator})];return status?{rawStatus:status,scope:'会社×指標の組合せ単位。年度・資料・非開示範囲は未確認。'}:null;}
export function analysisFor(series,id,companies,from,to){
 try{return analysisForChecked(series,id,companies,from,to);}catch(error){return {ok:false,reason:"分析条件または出典確認ゲートを確認できません。"+(error instanceof Error?error.message:"予期しない選択エラー")};}
}
export function analysisSelectionResult(verified,selected,from,to){
 try{const series=selected.map(s=>{const times=s.points.filter(p=>+p.periodStart.slice(0,4)>=from&&+p.periodStart.slice(0,4)<=to).map(p=>p.timeCode).sort();return verifiedSeriesSelection(verified,{cat01:s.companyId,tab:s.metricId,reviewWindow:s.reviewWindow||'default'},times[0],times.at(-1),'#207569');});return {ok:true,series};}catch(error){return {ok:false,reason:"出典確認済みの選択系列を取得できません。"+(error instanceof Error?error.message:"予期しない選択エラー")};}
}
function analysisForChecked(series,id,companies,from,to){
 const selected=series.filter(s=>s.kind!=='reference'&&matchesIndicator(s,id)&&companies.includes(s.companyId)&&s.points.some(p=>+p.periodStart.slice(0,4)>=from&&+p.periodStart.slice(0,4)<=to));
 if(!selected.length)return {ok:false,reason:'原観測値・出典・比較許可が未読込のため、指数と相関を計算できません。'};
 const windows=new Set(selected.map(s=>s.reviewWindow||'default'));
 if(windows.size!==1){const spans=[...new Set(selected.map(s=>{const yrs=s.points.map(p=>+p.periodStart.slice(0,4));return 'FY'+Math.min(...yrs)+'–'+Math.max(...yrs);} ))];return {ok:false,reason:'資料を確認した年度の比較条件が異なります（'+spans.join(' / ')+')。'+(selected.some(s=>s.points.some(p=>p.provenance?.sourceRestatementRelation))?'大林組の会計方針変更の遡及適用を含みます。':'')+'この期間をまたぐ指数・相関は計算できません。資料の比較条件が一致する年度に絞ってください。'};}
 if(companies.some(c=>!selected.some(s=>s.companyId===c)))return {ok:false,reason:'選択した会社に出典確認済みの原値がないため、計算できません。'};
 const verified={series,table:{notes:[],title:'出典確認済み指標'}};
 const selection=analysisSelectionResult(verified,selected,from,to);
 if(!selection.ok)return selection;
 const filtered=selection.series;
 const indexResult=indexSeriesAtCommonPeriod(filtered);
 if(!indexResult.ok)return {ok:false,reason:indexResult.reason};
 if(filtered.some(s=>s.points.some(p=>observationAnalysisState(p)!=='valid')||s.points[0]?.numericValue===0))return {ok:false,reason:'確認済み実数または指数の基準値を確認できません。0の基準値では指数を計算できません。'};
 const indices=indexResult.series.map(s=>({companyId:s.companyId,points:s.points.map(p=>({year:+p.periodStart.slice(0,4),value:p.numericValue}))}));
 const correlation=filtered.length===2?calculatePearsonComparison(...filtered):{ok:false,reason:'相関は2社を選択したときに計算します。'};
 return {ok:true,indices,correlation};
}
export function parseState(hash,validIndicators,validCompanies,validReferences=[]){const q=new URLSearchParams(hash.replace(/^#/,''));const year=(key,fallback)=>{const raw=q.get(key),v=raw===null||raw.trim()===''?fallback:Number(raw);return Number.isFinite(v)?Math.max(1900,Math.min(2100,Math.trunc(v))):fallback;};const from=year('from',2021),to=year('to',2025),indicator=validIndicators.includes(q.get('indicator'))?q.get('indicator'):'';return {view:['derived','quarterly'].includes(q.get('view'))?q.get('view'):'companies',quarterCompany:(q.get('quarterCompany')||'').slice(0,100),quarterMetric:(q.get('quarterMetric')||'').slice(0,200),quarterPeriod:(q.get('quarterPeriod')||'').slice(0,100),quarterScope:(q.get('quarterScope')||'').slice(0,100),quarterQuery:(q.get('quarterQuery')||'').slice(0,1000),derivedMetric:(q.get('derivedMetric')||'').slice(0,200),derivedCompany:(q.get('derivedCompany')||'').slice(0,100),derivedWindow:(q.get('derivedWindow')||'').slice(0,100),derivedState:(q.get('derivedState')||'').slice(0,100),derivedQuery:(q.get('derivedQuery')||'').slice(0,1000),indicator,companies:[...new Set((q.get('companies')||'').split(',').filter(c=>validCompanies.includes(c)))],from:Math.min(from,to),to:Math.max(from,to),reference:validReferences.includes(q.get('reference'))?q.get('reference'):'',compare:[...new Set((q.get('compare')||'').split(',').filter(i=>validIndicators.includes(i)&&i!==indicator))],coordinates:parseCoordinates(q.get('coordinates')),graph:q.get('graph')==='overlay'?'overlay':'separate'};}
export function stateHash(s){return new URLSearchParams({view:s.view||'companies',quarterCompany:s.quarterCompany||'',quarterMetric:s.quarterMetric||'',quarterPeriod:s.quarterPeriod||'',quarterScope:s.quarterScope||'',quarterQuery:s.quarterQuery||'',derivedMetric:s.derivedMetric||'',derivedCompany:s.derivedCompany||'',derivedWindow:s.derivedWindow||'',derivedState:s.derivedState||'',derivedQuery:s.derivedQuery||'',indicator:s.indicator,companies:s.companies.join(','),from:s.from,to:s.to,reference:s.reference,compare:(s.compare||[]).join(','),coordinates:JSON.stringify(s.coordinates||{}),graph:s.graph||'separate'}).toString();}

export async function validateMarket(m){
 if(!m?.table?.id||!Array.isArray(m.rawSeries)||m.rawSeries.length!==3||m.rawSeries[0]!==m.unit||typeof m.rawSeries[1]!=='string'||!Array.isArray(m.rawSeries[2]))throw Error('市場参照の公開tuple形式・単位を確認できません。');
 const dimensions=m.dimensions.filter(d=>d.apiKey!=='time');if(dimensions.some(d=>!d.values.some(v=>v.code===m.coordinates[d.apiKey]))||Object.keys(m.coordinates).length!==dimensions.length)throw Error('市場参照の分類コードを確認できません。');
 const declared=dimensions.flatMap(d=>d.values.filter(v=>v.code===m.coordinates[d.apiKey]).map(v=>v.unit).filter(Boolean));if(declared.some(u=>u!==m.unit))throw Error('市場参照の分類単位が一致しません。');
 const bytes=new TextEncoder().encode(m.table.id+'\u001f'+comboIdentity(m.coordinates)),digest=await crypto.subtle.digest('SHA-256',bytes),id=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,32);if(id!==m.seriesId)throw Error('市場参照の系列IDと分類条件が一致しません。');
 const knownTimes=new Set(m.dimensions.find(d=>d.apiKey==='time')?.values.map(v=>v.code)),seen=new Set();for(const p of m.rawSeries[2]){if(!Array.isArray(p)||p.length!==5||typeof p[0]!=='string'||!knownTimes.has(p[0])||seen.has(p[0])||p[1]!==null&&(typeof p[1]!=='number'||!Number.isFinite(p[1])))throw Error('市場参照の期間・観測tupleを確認できません。');seen.add(p[0]);}
 return m.rawSeries[2];
}

function parseCoordinates(value){try{const parsed=JSON.parse(value||'{}');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.entries(parsed).every(([k,v])=>/^[A-Za-z0-9_]+$/.test(k)&&typeof v==='string'&&v.length<300)?parsed:{};}catch{return {};}}

export function pointInYearRange(point,from,to){const year=point.year===null?null:point.year??Number(point.periodStart?.slice(0,4));return point.reference&&year===null||Number.isInteger(year)&&year>=from&&year<=to;}
