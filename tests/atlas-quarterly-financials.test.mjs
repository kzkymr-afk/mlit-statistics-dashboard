import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv from 'ajv';
import {canonicalSha256} from '../lib/buildbase-contract-hash.mjs';
import {projectQuarterlyFinancials,selectQuarterlySourceRows,assertQuarterlyCohortExport,projectQuarterlyCurrentnessSupplement} from '../lib/atlas-quarterly-projection.mjs';
import {QUARTER_RECORD_COUNT,QUARTER_PERIOD_COMPANION_REGISTRY,QUARTER_DOCUMENTS,QUARTER_DOCUMENT_REGISTRY,quarterlyRecordCounts,assertQuarterCurrentnessSupplement,QUARTER_PERMISSION_KEYS,assertQuarterRecord,assertQuarterPublicStrings,validateQuarterlyAsset,quarterlySourceUrl,filterQuarterlyRecords,quarterMeasureKind,quarterPeriodLabel,quarterlyExport,quarterlyCsv,quarterlyCoverageCsv} from '../public/explorer/quarterly-data.mjs';
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
function assertSourceValues(actual,source,message){if(Array.isArray(actual)){assert.equal(actual.length,source.length,message);actual.forEach((v,i)=>assertSourceValues(v,source[i],message));}else if(actual&&typeof actual==='object'){for(const [k,v]of Object.entries(actual))assertSourceValues(v,source[k],message+':'+k);}else assert.deepEqual(actual,source,message);}
function withWindow(fn){const before=globalThis.window;globalThis.window={__ATLAS_EXPLORER__:{base:'/mlit-statistics-dashboard/'}};try{return fn();}finally{globalThis.window=before;}}


test('quarterly projection retains old341 plus Okumura42 and Asanuma42 financial records, separately from annual and Q4 candidates',async()=>{
 const p=await validateQuarterlyAsset(asset,catalog);assert.equal(p.records.length,QUARTER_RECORD_COUNT);assert.equal(p.companies.length,21);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),catalog.compressedSha256);
 assert.deepEqual(quarterlyRecordCounts(p.records),{recordCount:425,q1RecordCount:112,q2RecordCount:104,q3RecordCount:209,recordedCompanyCount:7,directQuarterRecordCount:30,cumulative3MonthRecordCount:102,cumulative6MonthRecordCount:94,cumulative9MonthRecordCount:191,stockRecordCount:8});
 assert.equal(catalog.sourceDocumentCount,23);assert.equal(catalog.periodCompanionDocumentCount,3);assert.equal(catalog.unreviewedCompanyCount,14);
 assert.deepEqual(Object.fromEntries(Object.keys(QUARTER_DOCUMENTS).map(x=>[x,p.records.filter(r=>r.extractor_version===x).length])),{reviewed_kitano_q3_summary_segments_v1:105,reviewed_kitano_q1_summary_v1:8});
 assert.deepEqual(Object.fromEntries(['quarter_cumulative_9months','quarter_cumulative_6months','quarter_cumulative_3months','quarter_only_3months','point_in_time_stock'].map(x=>[x,p.records.filter(r=>r.period_type===x).length])),{quarter_cumulative_9months:191,quarter_cumulative_6months:94,quarter_cumulative_3months:102,quarter_only_3months:30,point_in_time_stock:8});
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
 const privateProof=structuredClone(asset);privateProof.payload.records.find(r=>r.company_id==='KAJIMA').source_locator.period_binding_basis.source_quote='/Volumes/private/proof.json';assert.equal(validate(privateProof),false,'private proof path is rejected even under an allowed metadata key');
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
 for(const c of companies.filter(c=>!['KITANO','OBAYASHI','KAJIMA','HASEKO','ANDO_HAZAMA','OKUMURA','ASANUMA'].includes(c.companyId))){assert.equal(c.status,'not_reviewed');assert.equal(c.nonDisclosureAssertion,false);assert.equal(c.q1RecordCount+c.q2RecordCount+c.q3RecordCount,0);assert.equal(filterQuarterlyRecords(asset.payload,{companyId:c.companyId}).length,0);}
 assert.equal(await readFile(path.join(root,'public/explorer/quarterly-coverage.csv'),'utf8'),quarterlyCoverageCsv(companies));
 const mutated=structuredClone(asset);mutated.payload.companies[0].status='not_disclosed';await assert.rejects(validateQuarterlyAsset(await rehash(mutated)),/確認範囲/);
});

test('every source fact is findable and all records remain reachable through pagination; non-Kitano empty filters explain scope',()=>{
 const savedWindow=globalThis.window;globalThis.window={__ATLAS_EXPLORER__:{base:'/mlit-statistics-dashboard/'}};
 try{
  const seen=new Set();for(let page=0;page<Math.ceil(QUARTER_RECORD_COUNT/25);page++){const html=renderQuarterlyView(asset,{},page);for(const m of html.matchAll(/data-quarter-fact-id="([a-f0-9]+)"/g))seen.add(m[1]);assert.match(html,/mlit-statistics-dashboard\/explorer\/quarterly-coverage\.csv/);}
  assert.equal(seen.size,QUARTER_RECORD_COUNT);for(const r of asset.payload.records)assert.deepEqual(filterQuarterlyRecords(asset.payload,{query:r.fact_id}).map(x=>x.fact_id),[r.fact_id]);
  assert.equal(filterQuarterlyRecords(asset.payload,{query:'北野建設'}).length,113);assert.equal(filterQuarterlyRecords(asset.payload,{periodType:'quarter_cumulative_3months'}).length,102);assert.equal(filterQuarterlyRecords(asset.payload,{scope:'segment'}).length,75);
  const empty=renderQuarterlyView(asset,{quarterCompany:'MATSUI'});assert.match(empty,/一致0件/);assert.match(empty,/未確認の会社.*非開示.*0.*判定しません/);assert.match(empty,/会社別の収録範囲/);
  const html=Array.from({length:Math.ceil(QUARTER_RECORD_COUNT/25)},(_,page)=>renderQuarterlyView(asset,{},page)).join('');assert.match(html,/株式分割/);assert.match(html,/Q3/);assert.doesNotMatch(html,/レビュー境界|確認範囲境界|別レビュー|レビュー単位/);
 }finally{globalThis.window=savedWindow;}
});

test('selected CSV and JSON contain every matched row, complete source precision/provenance and false permissions',()=>{
 const all=quarterlyExport(asset),q1=quarterlyExport(asset,{periodType:'quarter_cumulative_3months'});assert.equal(all.records.length,QUARTER_RECORD_COUNT);assert.equal(q1.records.length,102);assert.equal(q1.origin.sourceSubsetHash,asset.payload.origin.sourceSubsetHash);assert.equal(q1.projectionHash,asset.projectionHash);
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

test('eligible Source rows and all registered original financial PDFs reproduce projection without altering any Source field',{skip:!sourceRoot||!coverageFile},async()=>{
 const ledger=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 const coverage=JSON.parse(await readFile(coverageFile,'utf8')),selected=selectQuarterlySourceRows(ledger),projected=await projectQuarterlyFinancials(ledger,coverage);assert.deepEqual(projected,asset);
 for(const row of selected){const publicRow=asset.payload.records.find(r=>r.fact_id===row.fact_id);for(const [key,value]of Object.entries(row))if(publicRow[key]!==undefined&&!['permissions','same_byte_index_conflict'].includes(key))assertSourceValues(publicRow[key],value,`${row.fact_id}:${key}`);}
 for(const doc of QUARTER_DOCUMENT_REGISTRY){const original=selected.find(r=>r.extractor_version===doc.extractorVersion&&r.source_file_sha256===doc.sha256);assert.equal(createHash('sha256').update(await readFile(path.join(sourceRoot,original.source_file))).digest('hex'),doc.sha256);}
 const privateExtra=structuredClone(ledger);for(const row of selectQuarterlySourceRows(privateExtra)){row.sheetId='private';row.source_file='private';row.internalContact='private';}assert.deepEqual(await projectQuarterlyFinancials(privateExtra,coverage),{...asset,payload:{...asset.payload,origin:{...asset.payload.origin,sourceSubsetHash:await canonicalSha256(selectQuarterlySourceRows(privateExtra))}},projectionHash:await canonicalSha256({...asset.payload,origin:{...asset.payload.origin,sourceSubsetHash:await canonicalSha256(selectQuarterlySourceRows(privateExtra))}})});
 const privateQuote=structuredClone(selected);privateQuote[0].source_quote='https://drive.google.com/file/d/private';await assert.rejects(projectQuarterlyFinancials(privateQuote,coverage),/公開対象外|公式HTTPS/);
});

test('previous published derived141 and primary20 artifacts retain exact bytes',async()=>{
 for(const [file,sha]of [['public/explorer/derived-indicators.json.gz','a3b87c130c5dab528b031087d6b5ec8bacb231e05b9718c1f715f23182d0b4dc'],['public/system/buildbase/source-verified-comparison.json','c8bf526280fa4192cef0de5852ddf8d95bfcf58cecd53e1e50a6da9fe27d4fb6']])assert.equal(createHash('sha256').update(await readFile(path.join(root,file))).digest('hex'),sha,file);
});

test('all previously public KITANO113 fields remain exact after expanding to three companies',async()=>{
 const priorBytes=await readFile(path.join(root,'tests/fixtures/atlas-quarterly-kitano113.v0.2.2.json.gz'));
 assert.equal(createHash('sha256').update(priorBytes).digest('hex'),'a3fd39a63b6883def247fe8dc4732781d97814368029cb249fecc60e6661c15a');
 const previous=JSON.parse(gunzipSync(priorBytes)).payload.records,newById=new Map(asset.payload.records.map(r=>[r.fact_id,r]));assert.equal(previous.length,113);
 for(const row of previous)assert.deepEqual(newById.get(row.fact_id),row,row.fact_id);
 assert.equal(asset.payload.records.filter(r=>r.company_id==='OBAYASHI').length,54);assert.equal(asset.payload.records.filter(r=>r.company_id==='KAJIMA').length,102);
});

test('new source notes, dimensions, dates, overlap and visual-coordinate frame survive explicit financial projection',()=>{
 const records=asset.payload.records,o=records.filter(r=>r.company_id==='OBAYASHI'),k=records.filter(r=>r.company_id==='KAJIMA');
 const prior=o.filter(r=>r.fiscal_year==='2024'&&r.source_restatement_basis);assert.equal(prior.length,12);
 for(const row of prior){assert.match(row.source_restatement_basis.source_quote,/会計方針の変更による遡及適用後/);assert.equal(row.source_restatement_basis.relation_to_original_prior_edition,'not_verified');}
 for(const row of k){assert.equal(row.unit,'億円');assert.equal(row.source_locator.period_binding_basis.exact_dates_printed_on_selected_table,false);assert.match(row.period_interval_status,/normalized_from_source_period_labels/);assert.equal(row.current_official_version_match_status,'unknown_not_checked');}
 assert.equal(filterQuarterlyRecords(asset.payload,{scope:'consolidated_construction_business'}).length,18);assert.equal(filterQuarterlyRecords(asset.payload,{query:'大林組'}).length,54);assert.equal(filterQuarterlyRecords(asset.payload,{query:'鹿島建設'}).length,102);
 const direct=k.filter(r=>r.period_type==='quarter_only_3months');assert.equal(direct.length,30);for(const row of direct){assert.equal(row.candidate_disposition,'normalize_direct_reported_single_quarter_value');const startMonth={1:'04',2:'07',3:'10'}[row.source_quarter_number];assert.equal(row.period_start,`${row.fiscal_year}-${startMonth}-01`);assert.match(quarterPeriodLabel(row),/単独3か月/);}
 const groups=[...new Set(k.map(r=>r.semantic_overlap_group).filter(Boolean))];assert.equal(groups.length,10);for(const group of groups){const pair=k.filter(r=>r.semantic_overlap_group===group);assert.equal(pair.length,2);assert.equal(pair[0].value,pair[1].value);assert.deepEqual(new Set(pair.map(r=>r.period_type)),new Set(['quarter_cumulative_3months','quarter_only_3months']));}
 const quarter=k.find(r=>r.source_family==='quarterly_orders_reference');assert.equal(quarter.source_locator.coordinate_system,'visual_page_relative_points_top_left');assert.ok(quarter.source_locator.pdfplumber_page_bbox_origin.every(n=>n<0));assert.equal(quarter.source_locator.pdf_page_rotation,0);
 const reference=k.find(r=>r.source_family==='financial_results_reference');assert.equal(reference.source_locator.pdf_page_rotation,90);assert.ok(reference.source_locator.native_header_guards.every(g=>g.bbox.length===4));
 for(const row of records.filter(r=>r.metric_id==='total_orders_as_reported'))assert.match(row.source_order_dimensions.business_scope,/all_/);
 const csv=quarterlyCsv(asset);for(const field of ['source_order_dimensions','semantic_overlap_group','source_restatement_basis','source_period_semantics','display_precision_as_disclosed'])assert.ok(csv.includes(field));
});

test('registered official URLs and nested financial metadata reject private, mismatched and unverified references',async()=>{
 for(const doc of QUARTER_DOCUMENT_REGISTRY)assert.equal(quarterlySourceUrl(doc.sourceUrl),doc.sourceUrl);
 for(const url of ['https://data.swcms.net/file/other-company/x.pdf','https://www.kajima.co.jp/ir/presentation/pdf/not-registered.pdf','https://www.kajima.co.jp/ir/q_order/pdf/quarterly-20251q-j.pdf?key=secret'])assert.equal(quarterlySourceUrl(url),null);
 const changed=structuredClone(asset),row=changed.payload.records.find(r=>r.company_id==='KAJIMA');row.source_locator.period_binding_basis.local_file='private';await assert.rejects(validateQuarterlyAsset(await rehash(changed)),/公開対象外/);
 const bad=structuredClone(asset),o=bad.payload.records.find(r=>r.company_id==='OBAYASHI');o.source_url=QUARTER_DOCUMENT_REGISTRY.find(d=>d.companyId==='KAJIMA').sourceUrl;await assert.rejects(validateQuarterlyAsset(await rehash(bad)),/出典・対象範囲/);
 const datePromotion=structuredClone(asset);datePromotion.payload.records.find(r=>r.company_id==='KAJIMA').source_locator.period_binding_basis.exact_dates_printed_on_selected_table=true;await assert.rejects(validateQuarterlyAsset(await rehash(datePromotion)),/正規化根拠/);
 const raw=JSON.stringify(asset);assert.doesNotMatch(raw,/\/(?:Volumes|Users)\/|data\/raw\/|file:\/\/|index_row_guards|observed_csv_line|source_file"|source_index_path|fixture_path|drive\.google|docs\.google/);
});

test('all published old269 rows remain field-exact; new cohort units, periods, origin and perimeter remain source-specific',async()=>{
 const prior=JSON.parse(gunzipSync(await readFile(path.join(root,'tests/fixtures/atlas-quarterly-original269.json.gz'))));
 assert.equal(prior.payload.records.length,269);assert.equal(prior.payload.origin.sourceSubsetHash,'20ff0e0b2b565ed46d627b90c0f55ab4a816f827a44e218d105512177b557268');
 for(const row of prior.payload.records)assert.deepEqual(asset.payload.records.find(r=>r.fact_id===row.fact_id),row,row.fact_id);
 const h=asset.payload.records.filter(r=>r.company_id==='HASEKO'),a=asset.payload.records.filter(r=>r.company_id==='ANDO_HAZAMA');assert.equal(h.length,30);assert.equal(a.length,42);
 for(const row of [...h,...a]){assert.equal(row.period_type,'quarter_cumulative_'+row.source_quarter_number*3+'months');assert.equal(row.source_period_semantics,'cumulative');assert.equal(row.permissions.automaticAggregationAllowed,false);assert.ok(row.source_locator.period_binding_basis.status);}
 for(const row of h){assert.equal(row.unit,'億円');assert.equal(row.retrieved_at,null);assert.equal(row.source_acquisition_date,null);assert.equal(row.source_acquisition_timestamp_status,'unknown_not_recorded');assert.equal(row.as_of_check_utc_status,'later_official_url_bytes_equal_saved_pdf');assert.equal(row.source_locator.period_binding_basis.exact_dates_printed_on_selected_table,false);}
 for(const row of a){assert.equal(row.unit,'百万円');assert.match(row.retrieved_at,/^2026-10-14T/);assert.equal(row.source_acquisition_date,'2026-10-14');assert.equal(row.source_acquisition_timestamp_status,'official_http_get_receipt_utc');assert.equal(row.source_locator.period_binding_basis.exact_dates_printed_on_selected_table,true);}
 const perimeter=h.filter(r=>r.consolidation_perimeter_annotation);assert.ok(perimeter.length>0);for(const row of perimeter){assert.equal(row.consolidation_perimeter_annotation.perimeter_change_assessment,'not_verified_across_periods');assert.equal(row.consolidation_perimeter_annotation.automatic_comparison_allowed,false);}
 assert.equal(filterQuarterlyRecords(asset.payload,{query:'長谷工'}).length,30);assert.equal(filterQuarterlyRecords(asset.payload,{query:'安藤ハザマ'}).length,42);
 const html=withWindow(()=>Array.from({length:Math.ceil(QUARTER_RECORD_COUNT/25)},(_,page)=>renderQuarterlyView(asset,{},page,catalog)).join(''));assert.match(html,/連結対象の変更は資料間で未確認/);assert.match(html,/原資料の取得UTC 2026-10-14/);assert.match(html,/後日の公式URL照合/);
});

test('supplemental currentness checks stay separate from old facts and redact all receipt/private paths',async()=>{
 const checks=assertQuarterCurrentnessSupplement(catalog.currentnessSupplement);assert.equal(checks.filter(r=>r.byteComparisonStatus==='equal').length,6);assert.equal(checks.filter(r=>r.httpStatus===500&&r.byteComparisonStatus==='not_compared').length,6);
 assert.equal(catalog.currentnessSupplementHash,await canonicalSha256(checks));
 for(const row of asset.payload.records.filter(r=>['OBAYASHI','KAJIMA'].includes(r.company_id))){assert.equal(row.current_official_version_match_status,'unknown_not_checked');assert.equal(row.retrieved_at,null);}
 assertQuarterPublicStrings(checks);assert.doesNotMatch(JSON.stringify(checks),/source_file|basis_sources|http_headers|linked_fact_guards|\/Volumes\/|data\/raw\//);
 const promoted=structuredClone(checks);promoted[0].automaticComparisonAllowed=true;assert.throws(()=>assertQuarterCurrentnessSupplement(promoted));
 const privateReceipt=structuredClone(checks);privateReceipt[0].receiptSourceFile='data/raw/private.json';assert.throws(()=>assertQuarterCurrentnessSupplement(privateReceipt));
 const wrongHash=structuredClone(checks);wrongHash[0].documentSha256='0'.repeat(64);assert.throws(()=>assertQuarterCurrentnessSupplement(wrongHash));
 const html=withWindow(()=>renderQuarterlyView(asset,{},0,catalog));assert.match(html,/補足の現在掲載版チェック/);assert.match(html,/HTTP 500/);assert.match(html,/確認後の変更は未確認/);
 if(sourceRoot){const ledger=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/source_currentness_checks.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.deepEqual(projectQuarterlyCurrentnessSupplement(ledger),checks);}
});

test('new bounded Source export snapshot matches all selected new records without publishing its raw wrapper',{skip:!sourceRoot},async()=>{
 const source=JSON.parse(await readFile(path.join(sourceRoot,'data/ai_haseko_ah_quarterly/export.json'),'utf8'));
 const ledger=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.deepEqual(await assertQuarterlyCohortExport(source,selectQuarterlySourceRows(ledger)),catalog.sourceCohortExport);
 const changed=structuredClone(source);changed.payload.records[0].value++;await assert.rejects(assertQuarterlyCohortExport(changed,selectQuarterlySourceRows(ledger)),/出力版|原記録/);
 const replaced=structuredClone(source);replaced.payload.records[0].value++;replaced.snapshotHash=await canonicalSha256(replaced.payload);await assert.rejects(assertQuarterlyCohortExport(replaced,selectQuarterlySourceRows(ledger)),/出力版|原記録/);
 assert.doesNotMatch(JSON.stringify(catalog.sourceCohortExport),/raw|source_file|eligibility|coverage/);
});

test('published old341 records and supplemental12 checks remain field-exact after the next two-company extension',async()=>{
 const prior=JSON.parse(gunzipSync(await readFile(path.join(root,'tests/fixtures/atlas-quarterly-original341.json.gz'))));
 const priorCatalog=JSON.parse(await readFile(path.join(root,'tests/fixtures/atlas-quarterly-original341.catalog.json'),'utf8'));
 assert.equal(prior.payload.records.length,341);
 assert.equal(createHash('sha256').update(await readFile(path.join(root,'tests/fixtures/atlas-quarterly-original341.json.gz'))).digest('hex'),'4478cd6eb4c6a5a854d535faa4bf9d217941a63b26f5c0a13471dc68d21b80d3');
 for(const row of prior.payload.records)assert.deepEqual(asset.payload.records.find(r=>r.fact_id===row.fact_id),row,row.fact_id);
 assert.deepEqual(catalog.currentnessSupplement,priorCatalog.currentnessSupplement);assert.equal(catalog.currentnessSupplementHash,priorCatalog.currentnessSupplementHash);assert.deepEqual(catalog.sourceCohortExport,priorCatalog.sourceCohortExport);
 for(const co of ['OKUMURA','ASANUMA']){const rows=asset.payload.records.filter(r=>r.company_id===co);assert.equal(rows.length,42);assert.equal(filterQuarterlyRecords(asset.payload,{companyId:co,periodType:'quarter_cumulative_6months'}).length,14);for(const row of rows){assert.equal(row.unit,'百万円');assert.equal(row.retrieved_at,null);assert.equal(row.source_acquisition_date,null);assert.equal(row.source_acquisition_timestamp_status,'unknown_not_recorded');assert.equal(row.as_of_check_utc_status,'later_official_url_bytes_equal_saved_pdf');assert.match(row.as_of_check_utc,/^2026-10-14T14:21:/);assert.equal(row.source_period_semantics,'cumulative');assert.equal(row.period_type,'quarter_cumulative_'+row.source_quarter_number*3+'months');assert.equal(row.prior_edition_difference_status,'not_reviewed');}}
 assert.equal(filterQuarterlyRecords(asset.payload,{query:'奥村組'}).length,42);assert.equal(filterQuarterlyRecords(asset.payload,{query:'淺沼組'}).length,42);assert.equal(filterQuarterlyRecords(asset.payload,{query:'浅沼組'}).length,42);
});

test('ASANUMA corrected Q1 and separate official period companions retain source scope and original precision',async()=>{
 const rows=asset.payload.records.filter(r=>r.company_id==='ASANUMA'),q1=rows.filter(r=>r.source_quarter_number===1);assert.equal(q1.length,14);
 for(const row of q1){assert.equal(row.correction_status,'official_listing_marks_2025_08_19_corrected_edition');assert.equal(row.prior_edition_difference_status,'not_reviewed');assert.ok(row.source_url.endsWith('/20250819_2.pdf'));}
 for(const row of rows){const companion=QUARTER_PERIOD_COMPANION_REGISTRY.find(d=>d.quarter===row.source_quarter_number),basis=row.source_locator.period_binding_basis;assert.equal(row.period_companion.official_url,companion.sourceUrl);assert.equal(row.period_companion.sha256,companion.sha256);assert.equal(row.period_companion.purpose,'exact_period_proof_only');assert.equal(basis.source_locator.official_url,companion.sourceUrl);assert.equal(basis.source_locator.sha256,companion.sha256);assert.equal(basis.source_locator.pdf_page,8);assert.equal(basis.exact_dates_printed_on_selected_table,false);assert.equal(basis.status,'official_companion_exact_calendar_interval');assert.ok(row.period_companion.date_proofs.some(p=>p.period_start===row.period_start&&p.period_end===row.period_end&&p.physical_page===8));assert.match(basis.source_quote,/自.*年.*至/s);}
 assert.equal(asset.payload.origin.periodCompanionDocuments.length,3);for(const doc of QUARTER_PERIOD_COMPANION_REGISTRY)assert.equal(quarterlySourceUrl(doc.sourceUrl),doc.sourceUrl);
 const html=withWindow(()=>renderQuarterlyView(asset,{quarterCompany:'ASANUMA'},0,catalog));assert.match(html,/訂正版/);assert.match(html,/訂正前の資料との数値差・訂正範囲は未確認/);assert.match(html,/期間の根拠資料（値の主出典とは別）/);assert.match(html,/公式の四半期短信/);assert.match(html,/PDF物理ページ 8/);assert.match(html,/対象範囲が同じとは扱いません/);assert.match(html,/原資料の取得日時は未収録/);assert.match(html,/後日の公式URL照合/);
 const csv=quarterlyCsv(asset,{companyId:'ASANUMA'}),json=quarterlyExport(asset,{companyId:'ASANUMA'});assert.equal(json.records.length,42);for(const key of ['correction_status','prior_edition_difference_status','period_companion','official_listing_marks_2025_08_19_corrected_edition','not_reviewed'])assert.ok(csv.includes(key));for(const doc of QUARTER_PERIOD_COMPANION_REGISTRY){assert.ok(csv.includes(doc.sourceUrl));assert.ok(csv.includes(doc.sha256));}
 const mismatch=structuredClone(asset);mismatch.payload.records.find(r=>r.company_id==='ASANUMA').source_locator.period_binding_basis.source_locator.official_url=QUARTER_PERIOD_COMPANION_REGISTRY[2].sourceUrl;await assert.rejects(validateQuarterlyAsset(await rehash(mismatch)),/期間根拠/);
 const privateProof=structuredClone(asset);privateProof.payload.records.find(r=>r.company_id==='ASANUMA').period_companion.receipt_file='data/raw/hidden.json';await assert.rejects(validateQuarterlyAsset(await rehash(privateProof)),/公開対象外/);
 const wrongDateFlag=structuredClone(asset);wrongDateFlag.payload.records.find(r=>r.company_id==='ASANUMA').source_locator.period_binding_basis.exact_dates_printed_on_selected_table=true;await assert.rejects(validateQuarterlyAsset(await rehash(wrongDateFlag)),/期間根拠/);
 assert.doesNotMatch(JSON.stringify(asset),/official_receipt_file|official_listing_file|manifest_file|receipt_file|companion_pdf_guards|\/Volumes\/|data\/raw\//);
});

test('both independent adopted cohort exports bind their own snapshot and full records',{skip:!sourceRoot},async()=>{
 const ledger=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);const selected=selectQuarterlySourceRows(ledger);
 const old=JSON.parse(await readFile(path.join(sourceRoot,'data/ai_haseko_ah_quarterly/export.json'),'utf8')),next=JSON.parse(await readFile(path.join(sourceRoot,'data/ai_okumura_asanuma_quarterly/export.json'),'utf8'));
 assert.deepEqual(catalog.sourceCohortExports,[await assertQuarterlyCohortExport(old,selected),await assertQuarterlyCohortExport(next,selected)]);assert.equal(catalog.sourceCohortExports[1].recordCount,84);assert.equal(catalog.sourceCohortExports[1].snapshotHash,'eb5b76b29d89ef08e5289e1e62660795c1f147e8b6441f3fc91aebbcb490868f');
 const tampered=structuredClone(next);tampered.payload.records[0].value++;await assert.rejects(assertQuarterlyCohortExport(tampered,selected),/原記録/);const mislabeled=structuredClone(next);mislabeled.snapshotHash=old.snapshotHash;await assert.rejects(assertQuarterlyCohortExport(mislabeled,selected),/出力版/);
 for(const doc of QUARTER_PERIOD_COMPANION_REGISTRY){const source=next.payload.records.find(r=>r.period_companion?.sha256===doc.sha256);assert.equal(createHash('sha256').update(await readFile(path.join(sourceRoot,source.period_companion.file))).digest('hex'),doc.sha256);}
});
