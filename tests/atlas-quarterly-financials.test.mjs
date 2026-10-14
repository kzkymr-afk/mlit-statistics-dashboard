import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv from 'ajv';
import {canonicalSha256} from '../lib/buildbase-contract-hash.mjs';
import {projectQuarterlyFinancials,selectQuarterlySourceRows} from '../lib/atlas-quarterly-projection.mjs';
import {QUARTER_DOCUMENTS,QUARTER_RECORD_KEYS,QUARTER_PERMISSION_KEYS,assertQuarterRecord,assertQuarterPublicStrings,validateQuarterlyAsset,quarterlySourceUrl,filterQuarterlyRecords,quarterMeasureKind,quarterPeriodLabel,quarterlyExport,quarterlyCsv,quarterlyCoverageCsv} from '../public/explorer/quarterly-data.mjs';
import {renderQuarterlyView} from '../public/explorer/quarterly-view.mjs';
import {parseState,stateHash} from '../public/explorer/data-view.mjs';
import {publicDataUrl} from '../public/explorer/public-data.mjs';
import {acceptedExplorerHash,acceptedExplorerMessage} from '../lib/atlas-explorer-bridge.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bytes=await readFile(path.join(root,'public/explorer/quarterly-financials.json.gz'));
const asset=JSON.parse(gunzipSync(bytes)),catalog=JSON.parse(await readFile(path.join(root,'public/explorer/quarterly-financials.catalog.json'),'utf8'));
const coverageFile=process.env.ATLAS_QUARTER_COVERAGE;
const sourceRoot=process.env.ATLAS_QUARTER_SOURCE_ROOT;
const rehash=async changed=>{changed.projectionHash=await canonicalSha256(changed.payload);return changed;};

test('quarterly projection retains all 105 Q3 and eight Q1 financial records, separately from annual and Q4 candidates',async()=>{
 const p=await validateQuarterlyAsset(asset,catalog);assert.equal(p.records.length,113);assert.equal(p.companies.length,21);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),catalog.compressedSha256);
 assert.equal(p.origin.sourceSubsetHash,'8fd52c75a56b029da62a7decf1578e1a92f0e503fadf95fa1133ce235d5f6b8f');
 assert.deepEqual(Object.fromEntries(Object.keys(QUARTER_DOCUMENTS).map(x=>[x,p.records.filter(r=>r.extractor_version===x).length])),{reviewed_kitano_q3_summary_segments_v1:105,reviewed_kitano_q1_summary_v1:8});
 assert.deepEqual(Object.fromEntries(['quarter_cumulative_9months','quarter_cumulative_3months','point_in_time_stock'].map(x=>[x,p.records.filter(r=>r.period_type===x).length])),{quarter_cumulative_9months:97,quarter_cumulative_3months:8,point_in_time_stock:8});
 for(const r of p.records)for(const key of QUARTER_PERMISSION_KEYS)assert.equal(r.permissions[key],false);
 assert.doesNotMatch(JSON.stringify(p),/reviewed_kitano_annual|displayed_amount_difference|derived_q4_candidates/);
 const changed=structuredClone(asset);changed.payload.records[0].value++;await assert.rejects(validateQuarterlyAsset(changed,catalog),/データ版/);
 const promoted=structuredClone(asset);promoted.payload.records[0].permissions.automaticComparisonAllowed=true;await assert.rejects(validateQuarterlyAsset(await rehash(promoted)),/利用条件/);
});

test('explicit whitelist schema excludes storage, private URLs and raw wrappers at all nested locations',async()=>{
 const schema=JSON.parse(await readFile(path.join(root,'public/explorer/quarterly-financials.schema.json'),'utf8'));delete schema.$schema;
 const validate=new Ajv({allErrors:true}).compile(schema);assert.equal(validate(asset),true,JSON.stringify(validate.errors));
 for(const key of ['source_file','source_index_discovered_at_utc','sheetId','driveId','processedSheetVersion','email','personName','internalContact','secretToken']){const changed=structuredClone(asset);changed.payload.records[0][key]='blocked';assert.equal(validate(changed),false,key);assert.throws(()=>assertQuarterRecord(changed.payload.records[0]),/公開対象外/);}
 const location=structuredClone(asset);location.payload.records[0].source_locator.localPath='blocked';assert.equal(validate(location),false);assert.throws(()=>assertQuarterRecord(location.payload.records[0]),/公開対象外/);
 assertQuarterPublicStrings(asset.payload);assert.doesNotMatch(JSON.stringify(asset),/\/Volumes\/|\/Users\/|file:\/\/|data\/raw\/|docs\.google|drive\.google|source_file"|index_line"|sourceIndexCandidates|baselineAudit"/);
 for(const v of ['https://drive.google.com/file/d/private','https://docs.google.com/spreadsheets/d/private/edit','https://github.com/private/repo','/Volumes/private','file:///private','https://example.test/public'])assert.throws(()=>assertQuarterPublicStrings({source_quote:v}));
 for(const url of ['http://www.kitano.co.jp/wp-content/uploads/2026/02/IR20260210-1.pdf','https://www.kitano.co.jp.evil.test/wp-content/uploads/2026/02/x.pdf','https://www.kitano.co.jp/wp-content/uploads/2026/02/x.pdf?token=secret','javascript:alert(1)','https://user:pass@www.kitano.co.jp/wp-content/uploads/2026/02/x.pdf'])assert.equal(quarterlySourceUrl(url),null);
});

test('month-only stocks, ratio and per-share precision remain distinct; split and index conflicts are disclosed',()=>{
 const p=asset.payload,stocks=p.records.filter(r=>r.period_type==='point_in_time_stock');assert.equal(stocks.length,8);
 for(const r of stocks){assert.equal(r.as_of_date,null);assert.equal(r.period_start,null);assert.equal(r.period_end,null);assert.match(quarterPeriodLabel(r),/月表記・正確な日付未収録/);}
 const ratio=p.records.find(r=>r.unit==='％');assert.equal(ratio.currency,null);assert.equal(quarterMeasureKind(ratio),'比率');
 const perShare=p.records.filter(r=>r.unit==='円銭');assert.equal(perShare.length,4);for(const r of perShare){assert.equal(quarterMeasureKind(r),'1株当たり');assert.match(r.share_split_source_note.normalize('NFKC'),/令和7年10月1日/);assert.match(r.share_split_source_note.normalize('NFKC'),/1株につき4株/);assert.equal(r.share_split_basis_source_locator.pdf_page,1);assert.equal(r.share_split_comparative_basis,'source_adjusted_as_if_split_at_beginning_of_prior_consolidated_fiscal_year');}
 const conflict=p.records.find(r=>r.same_byte_index_conflict);assert.match(conflict.same_byte_index_conflict.indexed_title,/第2四半期/);assert.equal(conflict.same_byte_index_conflict.treatment,'metadata_conflict_not_separate_source_version');assert.equal(conflict.extractor_version,'reviewed_kitano_q3_summary_segments_v1');
 const q1=p.records.filter(r=>r.extractor_version==='reviewed_kitano_q1_summary_v1');for(const r of q1){assert.equal(r.source_locator.primary_summary_cell.pdf_page,1);assert.equal(r.source_locator.period_provenance.pdf_page,7);assert.match(r.corroborating_source_quote,/累計期間/);assert.equal(r.source_acquisition_date,null);assert.equal(r.as_of_check_utc,null);assert.equal(r.whole_document_review_status,'not_completed');}
});

test('21-company coverage is bounded to recorded financial counts and distinguishes unreviewed from nondisclosure',async()=>{
 const companies=asset.payload.companies,kitano=companies.find(c=>c.companyId==='KITANO');assert.equal(kitano.q1RecordCount,8);assert.equal(kitano.q3RecordCount,105);
 for(const c of companies.filter(c=>c.companyId!=='KITANO')){assert.equal(c.status,'not_reviewed');assert.equal(c.nonDisclosureAssertion,false);assert.equal(c.q1RecordCount+c.q2RecordCount+c.q3RecordCount,0);assert.equal(filterQuarterlyRecords(asset.payload,{companyId:c.companyId}).length,0);}
 assert.equal(await readFile(path.join(root,'public/explorer/quarterly-coverage.csv'),'utf8'),quarterlyCoverageCsv(companies));
 const mutated=structuredClone(asset);mutated.payload.companies[0].status='not_disclosed';await assert.rejects(validateQuarterlyAsset(await rehash(mutated)),/確認範囲/);
});

test('every source fact is findable and all 113 results remain reachable through pagination; non-Kitano empty filters explain scope',()=>{
 const savedWindow=globalThis.window;globalThis.window={__ATLAS_EXPLORER__:{base:'/mlit-statistics-dashboard/'}};
 try{
  const seen=new Set();for(let page=0;page<5;page++){const html=renderQuarterlyView(asset,{},page);for(const m of html.matchAll(/data-quarter-fact-id="([a-f0-9]+)"/g))seen.add(m[1]);assert.match(html,/mlit-statistics-dashboard\/explorer\/quarterly-coverage\.csv/);}
  assert.equal(seen.size,113);for(const r of asset.payload.records)assert.deepEqual(filterQuarterlyRecords(asset.payload,{query:r.fact_id}).map(x=>x.fact_id),[r.fact_id]);
  assert.equal(filterQuarterlyRecords(asset.payload,{query:'北野建設'}).length,113);assert.equal(filterQuarterlyRecords(asset.payload,{periodType:'quarter_cumulative_3months'}).length,8);assert.equal(filterQuarterlyRecords(asset.payload,{scope:'segment'}).length,75);
  const empty=renderQuarterlyView(asset,{quarterCompany:'KAJIMA'});assert.match(empty,/一致0件/);assert.match(empty,/未確認の会社を非開示・0とは判定しません/);assert.match(empty,/全21社の四半期データ一覧/);
  const html=Array.from({length:5},(_,page)=>renderQuarterlyView(asset,{},page)).join('');assert.match(html,/株式分割の原資料注記/);assert.match(html,/本文・原本hashに基づくQ3/);assert.doesNotMatch(html,/レビュー境界|確認範囲境界|別レビュー|レビュー単位/);
 }finally{globalThis.window=savedWindow;}
});

test('selected CSV and JSON contain every matched row, complete source precision/provenance and false permissions',()=>{
 const all=quarterlyExport(asset),q1=quarterlyExport(asset,{periodType:'quarter_cumulative_3months'});assert.equal(all.records.length,113);assert.equal(q1.records.length,8);assert.equal(q1.origin.sourceSubsetHash,asset.payload.origin.sourceSubsetHash);assert.equal(q1.projectionHash,asset.projectionHash);
 const csv=quarterlyCsv(asset);for(const r of all.records){assert.ok(csv.includes(r.fact_id));assert.ok(csv.includes(r.source_file_sha256));assert.ok(csv.includes(r.source_url));}
 assert.match(csv,/value_raw/);assert.match(csv,/share_split_comparative_basis/);assert.match(csv,/source_locator/);assert.match(csv,/as_of_status/);assert.match(csv,/complete_public_source_record/);assert.match(csv,/unknown_not_recorded/);assert.match(csv,/metadata_conflict_not_separate_source_version/);
 const stockCsv=quarterlyCsv(asset,{periodType:'point_in_time_stock'});for(const r of asset.payload.records.filter(x=>x.period_type==='point_in_time_stock'))assert.ok(stockCsv.includes(r.fact_id));
});

test('quarter URL state and same-origin bridge preserve company/derived selections and reject advanced-mode state writes',async()=>{
 const state=parseState('#view=quarterly&indicator=sales&companies=OBAYASHI&from=2015&to=2025&derivedMetric=margin&derivedCompany=KITANO&quarterCompany=KITANO&quarterMetric=eps_consolidated_reported&quarterPeriod=point_in_time_stock&quarterScope=consolidated&quarterQuery='+encodeURIComponent('円銭 株式分割'),['sales'],['OBAYASHI']);
 const hash='#'+stateHash(state);assert.equal(acceptedExplorerHash({type:'atlas-explorer-state',hash}),hash);assert.deepEqual(parseState(hash,['sales'],['OBAYASHI']),state);assert.equal(state.derivedMetric,'margin');assert.deepEqual(state.companies,['OBAYASHI']);
 const source={},event={origin:'https://example.test',source,data:{type:'atlas-explorer-state',hash}};assert.equal(acceptedExplorerMessage(event,'https://example.test',source,true),null);assert.equal(acceptedExplorerMessage(event,'https://example.test',source,false),hash);
 for(const base of ['/','/mlit-statistics-dashboard/'])assert.equal(publicDataUrl(catalog.dataUrl,base),base+catalog.dataUrl);
 assert.equal(publicDataUrl('explorer/quarterly-coverage.csv','/mlit-statistics-dashboard/'),'/mlit-statistics-dashboard/explorer/quarterly-coverage.csv');assert.throws(()=>publicDataUrl('explorer/../private.json','/'));
 const app=await readFile(path.join(root,'public/explorer/app.mjs'),'utf8');assert.match(app,/\['all','quarterly','company'\]\.includes\(filter\)/);assert.match(app,/data-quarter-company/);assert.match(app,/renderQuarterly\(\)/);assert.match(app,/element\.hidden=state\.view!=='companies'/);
});

test('eligible Source rows and two original public financial PDFs reproduce projection without altering any Source field',{skip:!sourceRoot||!coverageFile},async()=>{
 const ledger=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 const coverage=JSON.parse(await readFile(coverageFile,'utf8')),selected=selectQuarterlySourceRows(ledger),projected=await projectQuarterlyFinancials(ledger,coverage);assert.deepEqual(projected,asset);
 for(const row of selected){const publicRow=asset.payload.records.find(r=>r.fact_id===row.fact_id);for(const [key,value]of Object.entries(row))if(QUARTER_RECORD_KEYS.has(key)&&!['permissions','same_byte_index_conflict'].includes(key))assert.deepEqual(publicRow[key],value,`${row.fact_id}:${key}`);}
 for(const [extractor,doc]of Object.entries(QUARTER_DOCUMENTS)){const original=selected.find(r=>r.extractor_version===extractor);assert.equal(createHash('sha256').update(await readFile(path.join(sourceRoot,original.source_file))).digest('hex'),doc.sha256);}
 const privateExtra=structuredClone(ledger);for(const row of selectQuarterlySourceRows(privateExtra)){row.sheetId='private';row.source_file='private';row.internalContact='private';}assert.deepEqual(await projectQuarterlyFinancials(privateExtra,coverage),{...asset,payload:{...asset.payload,origin:{...asset.payload.origin,sourceSubsetHash:await canonicalSha256(selectQuarterlySourceRows(privateExtra))}},projectionHash:await canonicalSha256({...asset.payload,origin:{...asset.payload.origin,sourceSubsetHash:await canonicalSha256(selectQuarterlySourceRows(privateExtra))}})});
 const privateQuote=structuredClone(selected);privateQuote[0].source_quote='https://drive.google.com/file/d/private';await assert.rejects(projectQuarterlyFinancials(privateQuote,coverage),/公開対象外|公式HTTPS/);
});

test('previous published derived141 and primary20 artifacts retain exact bytes',async()=>{
 for(const [file,sha]of [['public/explorer/derived-indicators.json.gz','a3b87c130c5dab528b031087d6b5ec8bacb231e05b9718c1f715f23182d0b4dc'],['public/system/buildbase/source-verified-comparison.json','c8bf526280fa4192cef0de5852ddf8d95bfcf58cecd53e1e50a6da9fe27d4fb6']])assert.equal(createHash('sha256').update(await readFile(path.join(root,file))).digest('hex'),sha,file);
});
