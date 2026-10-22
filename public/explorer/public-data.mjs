import {cellDisplay} from './data-view.mjs';
import { publishedWorkbenchSelection } from './lib/statistics-workbench.mjs';
import { comboIdentity } from './lib/statistics-series-compare.mjs';
const cache = new Map();
export function publicDataUrl(path, base = window.__ATLAS_EXPLORER__?.base || '/') {
  if (! /^(?:workspace\/(?:project-display|reviewed-company-comparisons)\.json|system\/[A-Za-z0-9_./{}-]+|explorer\/(?:search-index\.json\.gz|project-finance\.json\.gz|annual-comparisons\.json\.gz|derived-indicators(?:\.json\.gz|\.catalog\.json|\.schema\.json)|quarterly-financials(?:\.json\.gz|\.catalog\.json|\.schema\.json)|quarterly-coverage\.csv|financial-usage(?:\.json\.gz|\.catalog\.json)))$/.test(path) || path.split('/').includes('..')) throw Error('公開データの所在を確認できません。');
  return base.replace(/\/$/, '') + '/' + path;
}
export async function fetchPublicJson(path) {
  if (cache.has(path)) return cache.get(path);
  const pending = (async () => {
    const response = await fetch(publicDataUrl(path));
    if (!response.ok) {const error=new Error(response.status === 404 ? 'この公開データは未収録です。' : '公開データを読み込めません。');error.httpStatus=response.status;throw error;}
    if (path.endsWith('.gz')) {
      if (!response.body || typeof DecompressionStream === 'undefined') throw Error('圧縮データに対応した最新版のブラウザーで開いてください。');
      return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    }
    return response.json();
  })().catch(error => { cache.delete(path); throw error; });
  cache.set(path, pending);
  while(cache.size > 48) cache.delete(cache.keys().next().value);
  return pending;
}
export function classificationCoordinates(meta, requested = {}) {
  const dimensions = meta.dimensions.filter(d => d.apiKey !== 'time');
  const coordinates = {};
  for (const d of dimensions) {
    const code = requested[d.apiKey] ?? meta.defaultSelection[d.apiKey];
    if (!d.values.some(v => v.code === code)) throw Error(d.name + 'の分類を選択してください。');
    coordinates[d.apiKey] = code;
  }
  return coordinates;
}
export async function publicSeriesId(tableId, coordinates) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tableId+'\u001f'+comboIdentity(coordinates)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('').slice(0,32);
}
export function originalPeriodYear(time) {
  const code = String(time?.code || '');
  if (/^(?:19|20)\d{2}(?:\d{6}|-\d{2}-\d{2}(?:\/(?:19|20)\d{2}-\d{2}-\d{2})?)?$/.test(code)) return Number(code.slice(0,4));
  const label = String(time?.name || '').trim();
  if (/月期|期末|決算/.test(label)) return null;
  const match = /^(?:((?:19|20)\d{2}))(?:$|年度|年(?:$|\s|\d{1,2}月|第))/.exec(label);
  return match ? Number(match[1]) : null;
}
export async function loadPublicIndex() {
  const [catalog,searchIndex] = await Promise.all([fetchPublicJson('system/catalog.json'),fetchPublicJson('explorer/search-index.json.gz')]);
  const legacyTable = catalog.tables.find(t => t.id === 'buildbase-company-annual');
  if (!legacyTable) throw Error('会社別原表のカタログがありません。');
  const legacyMeta = await fetchPublicJson(legacyTable.metaUrl);
  const legacyAvailability = legacyMeta.availabilityUrl ? await fetchPublicJson(legacyMeta.availabilityUrl) : null;
  return {
    catalog, legacyMeta, legacyAvailability,
    indicators: legacyMeta.dimensions.find(d => d.apiKey === 'tab').values,
    companies: legacyMeta.dimensions.find(d => d.apiKey === 'cat01').values,
    legacyTime: legacyMeta.dimensions.find(d => d.apiKey === 'time'),
    tables: catalog.tables.map(t => ({ ...t, name:t.title, datasetName:catalog.datasets.find(d => d.id === t.datasetId)?.title || t.statisticsName,
      location:t.metaUrl, coverage:searchIndex.tables.find(s=>s.id===t.id)?.coverage||{}, searchText:searchIndex.tables.find(s=>s.id===t.id)?.searchText||t.statisticsName||'', dimensions:[] }))
  };
}
export async function loadOriginalSeries(index, tableId, requested = {}) {
  const table = index.catalog.tables.find(t => t.id === tableId);
  if (!table) throw Error('公開カタログにない統計表です。');
  const meta = tableId === 'buildbase-company-annual' ? index.legacyMeta : await fetchPublicJson(table.metaUrl);
  const coordinates = classificationCoordinates(meta, requested);
  const availability = meta.availabilityUrl ? await fetchPublicJson(meta.availabilityUrl) : null;
  const recordedStatus = availability?.combos?.[comboIdentity(coordinates)] || null;
  const id = await publicSeriesId(tableId, coordinates);
  const shard = meta.seriesBundleUrlTemplate.replace('{prefix}',id.slice(0,meta.seriesBundlePrefixLength));
  const bundle = await fetchPublicJson(shard).catch(error=>{if(error.httpStatus===404&&recordedStatus)return {series:{}};throw error;});
  const compact = bundle.series[id];
  if (!compact) {const source=index.catalog.sources[tableId]||null;return {id,meta,coordinates,recordedStatus,source,shard,kind:'reference',loaded:true,metricId:coordinates.tab,companyId:tableId==='buildbase-company-annual'?coordinates.cat01:null,automaticComparisonAllowed:false,automaticAggregationAllowed:false,points:(meta.dimensions.find(d=>d.apiKey==='time')?.values||[]).map(time=>({timeCode:time.code,timeLabel:time.name,year:originalPeriodYear(time),numericValue:null,value:null,status:'missing',annotation:null,implicitNumericZero:false,rawTuple:null,rawExceptionalStatus:null,recordedComboStatus:recordedStatus,reference:true,factId:id+':'+time.code,provenance:{sourceUrl:source?.sourceUrl||meta.table.sourceUrl}}))};}
  if (!Array.isArray(compact) || compact.length !== 3 || !Array.isArray(compact[2])) throw Error('原表系列の形式を確認できません。');
  const floor = index.catalog.datasets.find(d=>d.id===meta.table.datasetId)?.fiscalYearFrom || 0;
  const times = (meta.dimensions.find(d => d.apiKey === 'time')?.values || []).filter(t=>originalPeriodYear(t)===null||originalPeriodYear(t)>=floor).sort((a,b)=>a.code.localeCompare(b.code));
  const source = index.catalog.sources[tableId] || null;
  const selected = publishedWorkbenchSelection({meta,coordinates,id,compactSeries:compact,timeValues:times,source});
  const stored = new Map(compact[2].map(tuple=>[tuple[0],tuple]));
  const reconstructed = new Map(selected.points.map(p=>[p.timeCode,p]));
  for(const tuple of compact[2]) if(!Array.isArray(tuple)||tuple.length!==5||!times.some(t=>t.code===tuple[0]))throw Error('原表の観測tuple・時間コードを確認できません。');
  const series = {...selected,id,meta,coordinates,recordedStatus,source,shard,kind:'reference',loaded:true,unit:compact[0],sourceId:source?.sourceId||'',metricId:coordinates.tab,
    companyId:tableId === 'buildbase-company-annual'?coordinates.cat01:null,rawSeries:compact,automaticComparisonAllowed:false,automaticAggregationAllowed:false};
  series.points = times.map(time => {
    const tuple=stored.get(time.code)||null;
    const p=reconstructed.get(time.code)||(tuple?{timeCode:tuple[0],numericValue:tuple[1],value:tuple[2],annotation:tuple[3],status:tuple[4]??'confirmed_value',implicitNumericZero:false,sourceId:source?.sourceId||''}:{timeCode:time.code,numericValue:null,value:null,annotation:null,status:'missing',implicitNumericZero:false,sourceId:source?.sourceId||''});
    return {...p,timeLabel:time.name,year:originalPeriodYear(time),rawTuple:tuple,rawExceptionalStatus:tuple?.[4]??null,recordedComboStatus:recordedStatus,
      factId:id+':'+time.code,companyId:series.companyId,reference:true,provenance:{sourceUrl:source?.sourceUrl || meta.table.sourceUrl}};
  });
  return series;
}

export function csvRowsForPoints(points) {
  const headers=['company','table_id','series_id','indicator','cycle','year_label','time_code','time_label','period_start','period_end','numeric_value','raw_value','unit','raw_status','raw_exceptional_status','display_status','disclosure_scope','recorded_combo_status','implicit_numeric_zero','annotation','classification_codes','source_id','source_url','published_at','retrieved_at','fact_id','reference_record_id','document_id','pdf_page','review_window','limitations'];
  const rows=points.map(p=>[p.companyId||'',p.series.meta?.table.id||'buildbase-source-verified-annual',p.series.id,p.series.metricId,p.series.cycle||p.series.meta?.table.cycle||'',p.year,p.timeCode,p.timeLabel,p.periodStart||'',p.periodEnd||'',p.numericValue,p.value,p.series.unit,p.status,p.rawExceptionalStatus??'',cellDisplay(p).status,p.disclosureScope?JSON.stringify(p.disclosureScope):'',p.recordedComboStatus??p.series.recordedStatus??'',p.implicitNumericZero,p.annotation,JSON.stringify(p.series.coordinates||{}),p.series.source?.sourceId||p.series.sourceId,p.provenance?.sourceUrl,p.series.source?.publishedAt||'',p.series.source?.retrievedAt||'',p.reference?'':p.factId,p.reference?p.factId:'',p.provenance?.documentId||'',p.provenance?.pdfPage||'',p.series.reviewWindow||'',(p.provenance?.comparisonLimitations||p.series.comparisonEquivalence?.limitations||[]).join(' / ')]);
  return {headers,rows};
}
