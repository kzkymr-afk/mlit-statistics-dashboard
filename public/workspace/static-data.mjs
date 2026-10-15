import {loadPublicIndex,loadOriginalSeries,fetchPublicJson} from '../explorer/public-data.mjs';

let indexPromise;
const index=()=>indexPromise ||= loadPublicIndex();
const publicTable=t=>t.id!=='buildbase-company-annual'&&!t.id.startsWith('buildbase')&&t.sourceKind!=='buildbase-public-disclosures';

export async function workspaceIndex(){
 const source=await index();
 const datasets=new Map(source.catalog.datasets.map(d=>[d.id,d]));
 return {
  datasets:source.catalog.datasets,
  tables:source.tables.filter(publicTable).map(t=>({...t,datasetTitle:datasets.get(t.datasetId)?.title||t.statisticsName})),
  companySchema:{table:source.legacyMeta.table,dimensions:source.legacyMeta.dimensions},
  mode:'readonly_published_static_contract'
 };
}

export async function workspaceSchema(tableId){
 const source=await index();
 const table=source.catalog.tables.find(t=>t.id===tableId&&publicTable(t));
 if(!table)throw Error('公開統計表を選択してください。');
 const meta=await fetchPublicJson(table.metaUrl);
 return {table:{...meta.table,datasetTitle:source.catalog.datasets.find(d=>d.id===table.datasetId)?.title||table.statisticsName},dimensions:meta.dimensions,suggestedSelection:meta.defaultSelection};
}

export async function workspaceSeries(tableId,selections){
 const source=await index();
 const table=source.catalog.tables.find(t=>t.id===tableId);
 if(!table||(tableId!=='buildbase-company-annual'&&!publicTable(table)))throw Error('公開表を選択してください。');
 const entry=await loadOriginalSeries(source,tableId,selections);
 const dimensions=entry.meta.dimensions.filter(d=>d.apiKey!=='time').map(d=>({apiKey:d.apiKey,valueName:d.values.find(v=>v.code===entry.coordinates[d.apiKey])?.name||entry.coordinates[d.apiKey]}));
 const datasetTitle=source.catalog.datasets.find(d=>d.id===table.datasetId)?.title||table.statisticsName;
 return {
  table:{...entry.meta.table,datasetTitle},
  series:{id:entry.id,label:dimensions.map(d=>d.valueName).join(' / '),unit:entry.unit,dimensions},
  query:{tableId,selections:entry.coordinates,requestedSelections:selections,from:null,to:null},
  observations:entry.points,
  sources:entry.source?{[entry.source.sourceId||tableId]:entry.source}:{}
 };
}

export {fetchPublicJson};
