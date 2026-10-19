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
import {QUARTER_EXTRACTORS,QUARTER_ST_DOCUMENTS,QUARTER_RECORD_COUNT,QUARTER_PERIOD_COMPANION_REGISTRY,QUARTER_DOCUMENTS,QUARTER_DOCUMENT_REGISTRY,quarterlyRecordCounts,assertQuarterCurrentnessSupplement,QUARTER_PERMISSION_KEYS,assertQuarterRecord,assertQuarterPublicStrings,validateQuarterlyAsset,quarterlySourceUrl,filterQuarterlyRecords,quarterMeasureKind,quarterPeriodLabel,quarterlyExport,quarterlyCsv,quarterlyCoverageCsv} from '../public/explorer/quarterly-data.mjs';
import {renderQuarterlyView} from '../public/explorer/quarterly-view.mjs';
import {parseState,stateHash} from '../public/explorer/data-view.mjs';
import {publicDataUrl} from '../public/explorer/public-data.mjs';
import {acceptedExplorerHash,acceptedExplorerMessage} from '../lib/atlas-explorer-bridge.mjs';
import {QUARTER_EXPANSION_PROFILES,QUARTER_EXPANSION_DOCUMENTS} from '../public/explorer/quarterly-expansion-registry.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bytes=await readFile(path.join(root,'public/explorer/quarterly-financials.json.gz'));
const asset=JSON.parse(gunzipSync(bytes)),catalog=JSON.parse(await readFile(path.join(root,'public/explorer/quarterly-financials.catalog.json'),'utf8'));
const coverageFile=process.env.ATLAS_QUARTER_COVERAGE;
const sourceRoot=process.env.ATLAS_QUARTER_SOURCE_ROOT;
const rehash=async changed=>{changed.projectionHash=await canonicalSha256(changed.payload);return changed;};
function assertSourceValues(actual,source,message){if(Array.isArray(actual)){assert.equal(actual.length,source.length,message);actual.forEach((v,i)=>assertSourceValues(v,source[i],message));}else if(actual&&typeof actual==='object'){for(const [k,v]of Object.entries(actual))assertSourceValues(v,source[k],message+':'+k);}else assert.deepEqual(actual,source,message);}
function withWindow(fn){const before=globalThis.window;globalThis.window={__ATLAS_EXPLORER__:{base:'/mlit-statistics-dashboard/'}};try{return fn();}finally{globalThis.window=before;}}


test('quarterly projection retains old638 plus Shimizu32 and Toda112 financial and issuer-order records, separately from annual and Q4 candidates',async()=>{
 const p=await validateQuarterlyAsset(asset,catalog);assert.equal(p.records.length,QUARTER_RECORD_COUNT);assert.equal(p.companies.length,21);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),catalog.compressedSha256);
 assert.deepEqual(quarterlyRecordCounts(p.records),{recordCount:1492,q1RecordCount:469,q2RecordCount:485,q3RecordCount:538,recordedCompanyCount:20,directQuarterRecordCount:30,cumulative3MonthRecordCount:459,cumulative6MonthRecordCount:457,cumulative9MonthRecordCount:519,stockRecordCount:8});
 assert.equal(catalog.sourceDocumentCount,59);assert.equal(catalog.periodCompanionDocumentCount,4);assert.equal(catalog.unreviewedCompanyCount,1);
 assert.deepEqual(Object.fromEntries(Object.keys(QUARTER_DOCUMENTS).map(x=>[x,p.records.filter(r=>r.extractor_version===x).length])),{reviewed_kitano_q3_summary_segments_v1:105,reviewed_kitano_q1_summary_v1:8});
 assert.deepEqual(Object.fromEntries(['quarter_cumulative_9months','quarter_cumulative_6months','quarter_cumulative_3months','quarter_only_3months','point_in_time_stock','interim_cumulative_6months'].map(x=>[x,p.records.filter(r=>r.period_type===x).length])),{quarter_cumulative_9months:519,quarter_cumulative_6months:457,quarter_cumulative_3months:459,quarter_only_3months:30,point_in_time_stock:8,interim_cumulative_6months:18});
 for(const r of p.records)for(const key of QUARTER_PERMISSION_KEYS)assert.equal(r.permissions[key],false);
 assert.doesNotMatch(JSON.stringify(p),/reviewed_kitano_annual|displayed_amount_difference|derived_q4_candidates/);
 const changed=structuredClone(asset);changed.payload.records[0].value++;await assert.rejects(validateQuarterlyAsset(changed,catalog),/データ版/);
 const promoted=structuredClone(asset);promoted.payload.records[0].permissions.automaticComparisonAllowed=true;await assert.rejects(validateQuarterlyAsset(await rehash(promoted)),/利用条件/);
});

test('four pinned Source profiles add 710 typed records while 781 old public values remain exact and one held ID is nonnumeric',async()=>{
 const records=asset.payload.records,manifest=JSON.parse(await readFile(path.join(root,'tests/fixtures/atlas-quarterly-782.v0.3.1.manifest.json'),'utf8'));
 const previousIds=new Set(manifest.recordIds),previous=records.filter(r=>previousIds.has(r.fact_id));
 assert.equal(previous.length,782);assert.equal(await canonicalSha256(previous.filter(r=>r.record_kind!=='held_reference')),manifest.nonheldRecordProjectionHash);
 const held=previous.find(r=>r.record_kind==='held_reference');assert.equal(held.fact_id,'df84afac72e25d75e0e004009b1baa48a5e2d5c7c2e6442a900fc2c2a99090de');
 for(const key of ['value','value_raw','period_start','period_end','period_type','source_quote','source_locator'])assert.equal(held[key],null,key);
 assert.equal(held.hold_reason_code,'wrong_prior_column_interval');assert.equal(catalog.numericRecordCount,1491);assert.equal(catalog.heldReferenceCount,1);
 assert.equal(quarterlyExport(asset,{query:held.fact_id}).records.length,1);assert.ok(!quarterlyCsv(asset,{query:held.fact_id}).includes(held.fact_id));
 for(const n of [3,6,9])assert.match(quarterPeriodLabel({period_type:`quarter_cumulative_${n}months`,period_start:'2025-04-01',period_end:'2025-12-31'}),new RegExp(`${n}か月累計`));
 const added=records.filter(r=>!previousIds.has(r.fact_id));assert.equal(added.length,710);assert.equal(QUARTER_EXPANSION_DOCUMENTS.length,18);
 assert.deepEqual(QUARTER_EXPANSION_PROFILES.map(p=>added.filter(r=>r.extractor_version===p.extractorVersion).length),[204,282,156,68]);
 assert.equal(added.filter(r=>r.company_id==='TAKENAKA'&&r.period_type==='interim_cumulative_6months'&&r.accounting_standard_status==='not_disclosed_in_reviewed_source').length,18);
 assert.equal(added.filter(r=>r.company_id==='MAEDA').length,0);assert.equal(asset.payload.companies.find(c=>c.companyId==='MAEDA').status,'not_reviewed');
 for(const row of added){assert.equal(row.finance_eligible,false);assert.equal(row.automatic_comparison_allowed,false);assert.equal(row.automatic_aggregation_allowed,false);assert.equal(row.source_url_byte_verification_status,'http_200_saved_byte_equal');assert.doesNotMatch(JSON.stringify(row),/source_file"|companion_source_file"|\/Volumes\/|data\/raw\//);}
 const html=withWindow(()=>renderQuarterlyView(asset,{quarterCompany:'KITANO',quarterQuery:held.fact_id},0,catalog));assert.match(html,/数値・期間は非公開/);assert.doesNotMatch(html,/665百万円/);
});

test('all four additional Source export snapshots and saved PDF bytes remain pinned',{skip:!sourceRoot},async()=>{
 const selected=selectQuarterlySourceRows((await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(JSON.parse));
 for(const profile of QUARTER_EXPANSION_PROFILES){const source=JSON.parse(await readFile(path.join(sourceRoot,profile.exportPath),'utf8'));const result=await assertQuarterlyCohortExport(source,selected);assert.deepEqual(result,catalog.sourceCohortExports.find(x=>x.datasetId===profile.datasetId));}
 for(const doc of QUARTER_EXPANSION_DOCUMENTS){const source=selected.find(r=>r.extractor_version===doc.extractorVersion&&r.source_file_sha256===doc.sha256);assert.equal(createHash('sha256').update(await readFile(path.join(sourceRoot,source.source_file))).digest('hex'),doc.sha256);}
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
 for(const c of companies.filter(c=>c.companyId==='MAEDA')){assert.equal(c.status,'not_reviewed');assert.equal(c.nonDisclosureAssertion,false);assert.equal(c.q1RecordCount+c.q2RecordCount+c.q3RecordCount,0);assert.equal(filterQuarterlyRecords(asset.payload,{companyId:c.companyId}).length,0);}
 assert.equal(await readFile(path.join(root,'public/explorer/quarterly-coverage.csv'),'utf8'),quarterlyCoverageCsv(companies));
 const mutated=structuredClone(asset);mutated.payload.companies[0].status='not_disclosed';await assert.rejects(validateQuarterlyAsset(await rehash(mutated)),/確認範囲/);
});

test('every source fact is findable and all records remain reachable through pagination; non-Kitano empty filters explain scope',()=>{
 const savedWindow=globalThis.window;globalThis.window={__ATLAS_EXPLORER__:{base:'/mlit-statistics-dashboard/'}};
 try{
  const seen=new Set();for(let page=0;page<Math.ceil(QUARTER_RECORD_COUNT/25);page++){const html=renderQuarterlyView(asset,{},page);for(const m of html.matchAll(/data-quarter-fact-id="([a-f0-9]+)"/g))seen.add(m[1]);assert.match(html,/mlit-statistics-dashboard\/explorer\/quarterly-coverage\.csv/);}
  assert.equal(seen.size,QUARTER_RECORD_COUNT);for(const r of [asset.payload.records[0],asset.payload.records.at(-1),asset.payload.records.find(x=>x.record_kind==='held_reference')])assert.deepEqual(filterQuarterlyRecords(asset.payload,{query:r.fact_id}).map(x=>x.fact_id),[r.fact_id]);
  assert.equal(filterQuarterlyRecords(asset.payload,{query:'北野建設'}).length,113);assert.equal(filterQuarterlyRecords(asset.payload,{periodType:'quarter_cumulative_3months'}).length,459);assert.equal(filterQuarterlyRecords(asset.payload,{scope:'segment'}).length,75);
  const empty=renderQuarterlyView(asset,{quarterCompany:'MAEDA'});assert.match(empty,/一致0件/);assert.match(empty,/未確認の会社.*非開示.*0.*判定しません/);assert.match(empty,/会社別の収録範囲/);
  const html=Array.from({length:Math.ceil(QUARTER_RECORD_COUNT/25)},(_,page)=>renderQuarterlyView(asset,{},page)).join('');assert.match(html,/株式分割/);assert.match(html,/Q3/);assert.doesNotMatch(html,/レビュー境界|確認範囲境界|別レビュー|レビュー単位/);
 }finally{globalThis.window=savedWindow;}
});

test('selected CSV and JSON contain every matched row, complete source precision/provenance and false permissions',()=>{
 const all=quarterlyExport(asset),q1=quarterlyExport(asset,{periodType:'quarter_cumulative_3months'});assert.equal(all.records.length,QUARTER_RECORD_COUNT);assert.equal(q1.records.length,459);assert.equal(q1.origin.sourceSubsetHash,asset.payload.origin.sourceSubsetHash);assert.equal(q1.projectionHash,asset.projectionHash);
 const csv=quarterlyCsv(asset);for(const r of all.records){if(r.record_kind==='held_reference'){assert.ok(!csv.includes(r.fact_id));assert.equal(r.value,null);assert.equal(quarterlyCsv(asset,{query:r.fact_id}).trim().split('\n').length,1);continue;}assert.ok(csv.includes(r.fact_id));assert.ok(csv.includes(r.source_file_sha256));assert.ok(csv.includes(r.source_url));}
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
 for(const row of selected){const publicRow=asset.payload.records.find(r=>r.fact_id===row.fact_id);for(const [key,value]of Object.entries(row))if(row.fact_id!=='df84afac72e25d75e0e004009b1baa48a5e2d5c7c2e6442a900fc2c2a99090de'&&publicRow[key]!==undefined&&!['permissions','same_byte_index_conflict'].includes(key))assertSourceValues(publicRow[key],value,`${row.fact_id}:${key}`);}
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
 for(const row of previous)if(row.fact_id!=='df84afac72e25d75e0e004009b1baa48a5e2d5c7c2e6442a900fc2c2a99090de')assert.deepEqual(newById.get(row.fact_id),row,row.fact_id);
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
 for(const row of records.filter(r=>r.metric_id==='total_orders_as_reported'&&QUARTER_EXTRACTORS.slice(0,7).includes(r.extractor_version)))assert.match(row.source_order_dimensions.business_scope,/all_/);
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
 for(const row of prior.payload.records)if(row.fact_id!=='df84afac72e25d75e0e004009b1baa48a5e2d5c7c2e6442a900fc2c2a99090de')assert.deepEqual(asset.payload.records.find(r=>r.fact_id===row.fact_id),row,row.fact_id);
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
 for(const row of prior.payload.records)if(row.fact_id!=='df84afac72e25d75e0e004009b1baa48a5e2d5c7c2e6442a900fc2c2a99090de')assert.deepEqual(asset.payload.records.find(r=>r.fact_id===row.fact_id),row,row.fact_id);
 assert.deepEqual(catalog.currentnessSupplement,priorCatalog.currentnessSupplement);assert.equal(catalog.currentnessSupplementHash,priorCatalog.currentnessSupplementHash);assert.deepEqual(catalog.sourceCohortExport,priorCatalog.sourceCohortExport);
 for(const co of ['OKUMURA','ASANUMA']){const rows=asset.payload.records.filter(r=>r.company_id===co);assert.equal(rows.length,42);assert.equal(filterQuarterlyRecords(asset.payload,{companyId:co,periodType:'quarter_cumulative_6months'}).length,14);for(const row of rows){assert.equal(row.unit,'百万円');assert.equal(row.retrieved_at,null);assert.equal(row.source_acquisition_date,null);assert.equal(row.source_acquisition_timestamp_status,'unknown_not_recorded');assert.equal(row.as_of_check_utc_status,'later_official_url_bytes_equal_saved_pdf');assert.match(row.as_of_check_utc,/^2026-10-14T14:21:/);assert.equal(row.source_period_semantics,'cumulative');assert.equal(row.period_type,'quarter_cumulative_'+row.source_quarter_number*3+'months');assert.equal(row.prior_edition_difference_status,'not_reviewed');}}
 assert.equal(filterQuarterlyRecords(asset.payload,{query:'奥村組'}).length,42);assert.equal(filterQuarterlyRecords(asset.payload,{query:'淺沼組'}).length,42);assert.equal(filterQuarterlyRecords(asset.payload,{query:'浅沼組'}).length,42);
});

test('ASANUMA corrected Q1 and separate official period companions retain source scope and original precision',async()=>{
 const rows=asset.payload.records.filter(r=>r.company_id==='ASANUMA'),q1=rows.filter(r=>r.source_quarter_number===1);assert.equal(q1.length,14);
 for(const row of q1){assert.equal(row.correction_status,'official_listing_marks_2025_08_19_corrected_edition');assert.equal(row.prior_edition_difference_status,'not_reviewed');assert.ok(row.source_url.endsWith('/20250819_2.pdf'));}
 for(const row of rows){const companion=QUARTER_PERIOD_COMPANION_REGISTRY.find(d=>d.quarter===row.source_quarter_number),basis=row.source_locator.period_binding_basis;assert.equal(row.period_companion.official_url,companion.sourceUrl);assert.equal(row.period_companion.sha256,companion.sha256);assert.equal(row.period_companion.purpose,'exact_period_proof_only');assert.equal(basis.source_locator.official_url,companion.sourceUrl);assert.equal(basis.source_locator.sha256,companion.sha256);assert.equal(basis.source_locator.pdf_page,8);assert.equal(basis.exact_dates_printed_on_selected_table,false);assert.equal(basis.status,'official_companion_exact_calendar_interval');assert.ok(row.period_companion.date_proofs.some(p=>p.period_start===row.period_start&&p.period_end===row.period_end&&p.physical_page===8));assert.match(basis.source_quote,/自.*年.*至/s);}
 assert.equal(asset.payload.origin.periodCompanionDocuments.length,4);for(const doc of QUARTER_PERIOD_COMPANION_REGISTRY)assert.equal(quarterlySourceUrl(doc.sourceUrl),doc.sourceUrl);
 const html=withWindow(()=>renderQuarterlyView(asset,{quarterCompany:'ASANUMA'},0,catalog));assert.match(html,/訂正版/);assert.match(html,/訂正前の資料との数値差・訂正範囲は未確認/);assert.match(html,/期間の根拠資料（値の主出典とは別）/);assert.match(html,/公式の四半期短信/);assert.match(html,/PDF物理ページ 8/);assert.match(html,/対象範囲が同じとは扱いません/);assert.match(html,/原資料の取得日時は未収録/);assert.match(html,/後日の公式URL照合/);
 const csv=quarterlyCsv(asset,{companyId:'ASANUMA'}),json=quarterlyExport(asset,{companyId:'ASANUMA'});assert.equal(json.records.length,42);for(const key of ['correction_status','prior_edition_difference_status','period_companion','official_listing_marks_2025_08_19_corrected_edition','not_reviewed'])assert.ok(csv.includes(key));for(const doc of QUARTER_PERIOD_COMPANION_REGISTRY.filter(d=>d.companyId==='ASANUMA')){assert.ok(csv.includes(doc.sourceUrl));assert.ok(csv.includes(doc.sha256));}
 const mismatch=structuredClone(asset);mismatch.payload.records.find(r=>r.company_id==='ASANUMA').source_locator.period_binding_basis.source_locator.official_url=QUARTER_PERIOD_COMPANION_REGISTRY[2].sourceUrl;await assert.rejects(validateQuarterlyAsset(await rehash(mismatch)),/期間根拠/);
 const privateProof=structuredClone(asset);privateProof.payload.records.find(r=>r.company_id==='ASANUMA').period_companion.receipt_file='data/raw/hidden.json';await assert.rejects(validateQuarterlyAsset(await rehash(privateProof)),/公開対象外/);
 const wrongDateFlag=structuredClone(asset);wrongDateFlag.payload.records.find(r=>r.company_id==='ASANUMA').source_locator.period_binding_basis.exact_dates_printed_on_selected_table=true;await assert.rejects(validateQuarterlyAsset(await rehash(wrongDateFlag)),/期間根拠/);
 assert.doesNotMatch(JSON.stringify(asset),/official_receipt_file|official_listing_file|manifest_file|receipt_file|companion_pdf_guards|\/Volumes\/|data\/raw\//);
});

test('both independent adopted cohort exports bind their own snapshot and full records',{skip:!sourceRoot},async()=>{
 const ledger=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);const selected=selectQuarterlySourceRows(ledger);
 const old=JSON.parse(await readFile(path.join(sourceRoot,'data/ai_haseko_ah_quarterly/export.json'),'utf8')),next=JSON.parse(await readFile(path.join(sourceRoot,'data/ai_okumura_asanuma_quarterly/export.json'),'utf8'));
 assert.deepEqual(catalog.sourceCohortExports.slice(0,2),[await assertQuarterlyCohortExport(old,selected),await assertQuarterlyCohortExport(next,selected)]);assert.equal(catalog.sourceCohortExports[1].recordCount,84);assert.equal(catalog.sourceCohortExports[1].snapshotHash,'eb5b76b29d89ef08e5289e1e62660795c1f147e8b6441f3fc91aebbcb490868f');
 const tampered=structuredClone(next);tampered.payload.records[0].value++;await assert.rejects(assertQuarterlyCohortExport(tampered,selected),/原記録/);const mislabeled=structuredClone(next);mislabeled.snapshotHash=old.snapshotHash;await assert.rejects(assertQuarterlyCohortExport(mislabeled,selected),/出力版/);
 for(const doc of QUARTER_PERIOD_COMPANION_REGISTRY.filter(d=>d.companyId==='ASANUMA')){const source=next.payload.records.find(r=>r.period_companion?.sha256===doc.sha256);assert.equal(createHash('sha256').update(await readFile(path.join(sourceRoot,source.period_companion.file))).digest('hex'),doc.sha256);}
});

test('published old425 fields, both old cohort exports, companion3 and supplemental12 remain unchanged',async()=>{
 const previousBytes=await readFile(path.join(root,'tests/fixtures/atlas-quarterly-original425.json.gz')),previous=JSON.parse(gunzipSync(previousBytes)),oldCatalog=JSON.parse(await readFile(path.join(root,'tests/fixtures/atlas-quarterly-original425.catalog.json'),'utf8'));
 assert.equal(createHash('sha256').update(previousBytes).digest('hex'),'91477fc9d07f9d30b04dab047636bbb8c9e11018f16bcc1b0532ccf27d89dc9d');assert.equal(previous.payload.records.length,425);
 for(const row of previous.payload.records)if(row.fact_id!=='df84afac72e25d75e0e004009b1baa48a5e2d5c7c2e6442a900fc2c2a99090de')assert.deepEqual(asset.payload.records.find(r=>r.fact_id===row.fact_id),row,row.fact_id);
 assert.deepEqual(catalog.sourceCohortExports.slice(0,2),oldCatalog.sourceCohortExports);assert.deepEqual(catalog.sourceCohortExport,oldCatalog.sourceCohortExport);assert.deepEqual(catalog.currentnessSupplement,oldCatalog.currentnessSupplement);assert.equal(catalog.currentnessSupplementHash,oldCatalog.currentnessSupplementHash);assert.deepEqual(catalog.periodCompanionDocuments.slice(0,3),oldCatalog.periodCompanionDocuments);
 for(const [company,count]of [['ZENITAKA',42],['KUMAGAI',48]]){const rows=asset.payload.records.filter(r=>r.company_id===company);assert.equal(rows.length,count);for(const row of rows){assert.equal(row.period_type,'quarter_cumulative_'+row.source_quarter_number*3+'months');for(const key of QUARTER_PERMISSION_KEYS)assert.equal(row.permissions[key],false);}}
 assert.equal(filterQuarterlyRecords(asset.payload,{query:'錢高組'}).length,42);assert.equal(filterQuarterlyRecords(asset.payload,{query:'銭高組'}).length,42);assert.equal(filterQuarterlyRecords(asset.payload,{query:'熊谷組'}).length,48);
 assert.equal(catalog.metrics.length,37);assert.equal(catalog.metrics.find(m=>m.metricId==='completed_construction_revenue_consolidated_reported').name,'完成工事高');
});

test('Kumagai completed construction revenue is independent from sales and all overseas/domestic raw amounts keep units and acquisition scope',async()=>{
 const k=asset.payload.records.filter(r=>r.company_id==='KUMAGAI'),z=asset.payload.records.filter(r=>r.company_id==='ZENITAKA');assert.equal(k.filter(r=>r.metric_id==='sales_consolidated_reported').length,0);assert.equal(k.filter(r=>r.metric_id==='completed_construction_revenue_consolidated_reported').length,6);
 const completed=filterQuarterlyRecords(asset.payload,{companyId:'KUMAGAI',query:'完成工事高'});assert.equal(completed.length,6);for(const row of completed){assert.equal(row.company_id,'KUMAGAI');assert.equal(row.source_metric_label,'完成工事高');}
 for(const row of [...z,...k]){const fresh=row.company_id==='KUMAGAI'&&row.source_quarter_number!==2;if(fresh){assert.equal(row.retrieved_at,row.as_of_check_utc);assert.match(row.retrieved_at,/^2026-10-14T15:13:/);assert.equal(row.source_acquisition_timestamp_status,'known_from_official_capture');}else{assert.equal(row.retrieved_at,null);assert.equal(row.source_acquisition_date,null);assert.equal(row.source_acquisition_timestamp_status,'unknown_not_recorded');assert.equal(row.as_of_check_utc_status,'later_official_url_bytes_equal_saved_pdf');}assert.equal(row.unit,row.company_id==='KUMAGAI'&&row.source_quarter_number===2?'億円':'百万円');}
 const orders=k.filter(r=>r.data_scope==='standalone');assert.equal(orders.length,24);assert.equal(orders.filter(r=>r.semantic_category_label==='受注高（個別・海外）').length,6);assert.equal(orders.filter(r=>r.semantic_category_label==='受注高（個別・国内土木）').length,6);assert.equal(orders.filter(r=>r.semantic_category_label==='受注高（個別・国内建築）').length,6);assert.equal(orders.filter(r=>r.semantic_category_label==='受注高（個別・合計）').length,6);
 for(const row of orders){assert.ok(row.correction_ids.length);assert.equal(row.metadata_correction_status,'reviewed_literal_source_fragments');assert.equal(row.source_quote_kind,'joined_verified_native_value_page_fragments');assert.equal(row.value_raw,row.source_text);}
 const html=withWindow(()=>Array.from({length:2},(_,page)=>renderQuarterlyView(asset,{quarterCompany:'KUMAGAI'},page,catalog)).join(''));assert.match(html,/説明上の区分（原文引用とは別）/);assert.match(html,/原資料から結合した引用（複数箇所の抜粋）/);assert.match(html,/受注高（個別・海外）/);assert.match(html,/完成工事高/);
 const csv=quarterlyCsv(asset,{companyId:'KUMAGAI'}),out=quarterlyExport(asset,{companyId:'KUMAGAI'});assert.equal(out.records.length,48);for(const key of ['semantic_category_label','correction_ids','metadata_correction_status','reviewed_literal_source_fragments','joined_verified_native_value_page_fragments'])assert.ok(csv.includes(key));
 const wrongUnit=structuredClone(asset);wrongUnit.payload.records.find(r=>r.company_id==='KUMAGAI'&&r.source_quarter_number===2).unit='百万円';await assert.rejects(validateQuarterlyAsset(await rehash(wrongUnit)),/表示単位/);
});

test('Kumagai officially linked C1861 PDFs and Q2 period-only companion are exact, source-linked and private-wrapper free',{skip:!sourceRoot},async()=>{
 const own=JSON.parse(await readFile(path.join(sourceRoot,'data/ai_zenitaka_kumagai_quarterly/export.json'),'utf8'));const ledger=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.deepEqual(await assertQuarterlyCohortExport(own,selectQuarterlySourceRows(ledger)),catalog.sourceCohortExports[2]);assert.equal(catalog.sourceCohortExports[2].recordCount,90);assert.equal(catalog.sourceCohortExports[2].snapshotHash,'d2b6e417bfd5878667205603c1618bdde79e32d546f899ac555cef82e7aacc53');
 const doc=QUARTER_PERIOD_COMPANION_REGISTRY.find(d=>d.companyId==='KUMAGAI');assert.equal(quarterlySourceUrl(doc.sourceUrl),doc.sourceUrl);const raw=own.payload.records.find(r=>r.period_companion?.sha256===doc.sha256);assert.equal(createHash('sha256').update(await readFile(path.join(sourceRoot,raw.period_companion.file))).digest('hex'),doc.sha256);
 const q2=asset.payload.records.filter(r=>r.company_id==='KUMAGAI'&&r.source_quarter_number===2);assert.equal(q2.length,16);for(const row of q2){const basis=row.source_locator.period_binding_basis;assert.equal(row.period_companion.purpose,'exact_period_proof_only');assert.equal(row.period_companion.sha256,doc.sha256);assert.equal(basis.source_locator.official_url,doc.sourceUrl);assert.equal(basis.source_locator.sha256,doc.sha256);assert.equal(basis.source_locator.pdf_page,row.data_scope==='standalone'?17:8);assert.ok(row.period_companion.date_proofs.some(p=>p.scope===row.data_scope&&p.period_start===row.period_start&&p.period_end===row.period_end));assert.equal(row.retrieved_at,null);}
 for(const url of ['https://pdf.irpocket.com/C0001/bffO/mTgf/L2Nh.pdf','https://pdf.irpocket.com/C1861/unregistered.pdf','https://pdf.irpocket.com/C1861/bffO/mTgf/L2Nh.pdf?token=secret','http://pdf.irpocket.com/C1861/bffO/mTgf/L2Nh.pdf'])assert.equal(quarterlySourceUrl(url),null);
 const html=withWindow(()=>renderQuarterlyView(asset,{quarterCompany:'KUMAGAI',quarterPeriod:'quarter_cumulative_6months'},0,catalog));assert.match(html,/期間の根拠資料（値の主出典とは別）/);assert.match(html,/短信の単体受注表/);assert.match(html,/短信の連結損益計算書/);assert.match(html,/原資料の取得日時は未収録/);assert.doesNotMatch(html,/短信の期間根拠は連結、受注表は単体です/);
 assert.doesNotMatch(JSON.stringify(asset),/feed_item|listing_file|receipt_file|manifest_file|officialProviderBinding|data\/raw\/|\/Volumes\//);
});

test('Zenitaka standalone order values retain their own locator and corrected consolidated period locator with a scope-limited explanation',async()=>{
 const orders=asset.payload.records.filter(r=>r.company_id==='ZENITAKA'&&r.data_scope==='standalone');assert.equal(orders.length,18);
 for(const row of orders){const basis=row.source_locator.period_binding_basis,locator=basis.source_locator;assert.equal(locator.pdf_page,7);assert.equal(locator.printed_page,5);assert.equal(locator.same_pdf_statement_printed_page,5);assert.equal(row.metadata_correction_status,'reviewed_period_locator_printed_page');assert.ok(row.correction_ids.length);assert.notEqual(row.source_locator.pdf_page,locator.pdf_page);assert.notEqual(row.source_locator.printed_page,locator.printed_page);}
 const html=withWindow(()=>renderQuarterlyView(asset,{quarterCompany:'ZENITAKA',quarterScope:'standalone'},0,catalog));assert.match(html,/PDF物理ページ 7 \/ 資料の表示ページ 5/);assert.match(html,/連結損益計算書は期間だけの根拠に使います/);assert.match(html,/単体受注の対象範囲と同じとは扱いません/);
 const wrong=structuredClone(asset);wrong.payload.records.find(r=>r.company_id==='ZENITAKA'&&r.data_scope==='standalone').source_locator.period_binding_basis.source_locator.printed_page=8;await assert.rejects(validateQuarterlyAsset(await rehash(wrong)),/期間出典と単体受注/);
});

test('published old515 rows, corrected metadata, three source cohorts, four companions and twelve checks remain exact',async()=>{
 const priorBytes=await readFile(path.join(root,'tests/fixtures/atlas-quarterly-original515.json.gz')),prior=JSON.parse(gunzipSync(priorBytes));
 const priorCatalogBytes=await readFile(path.join(root,'tests/fixtures/atlas-quarterly-original515.catalog.json')),priorCatalog=JSON.parse(priorCatalogBytes);
 assert.equal(createHash('sha256').update(priorBytes).digest('hex'),'b5b35dd5b003aaf170ce0123452221e255a775011162160258edbb87c3298db9');
 assert.equal(createHash('sha256').update(priorCatalogBytes).digest('hex'),'e071f944861f92ae2f4466e409f400007ed074654a7e3fb1e1b436022f01092a');
 assert.equal(prior.payload.records.length,515);for(const row of prior.payload.records)if(row.fact_id!=='df84afac72e25d75e0e004009b1baa48a5e2d5c7c2e6442a900fc2c2a99090de')assert.deepEqual(asset.payload.records.find(r=>r.fact_id===row.fact_id),row,row.fact_id);
 assert.equal(prior.payload.records.filter(r=>r.correction_ids?.length).length,42);
 assert.deepEqual(catalog.sourceCohortExports.slice(0,3),priorCatalog.sourceCohortExports);assert.deepEqual(catalog.sourceCohortExport,priorCatalog.sourceCohortExport);
 assert.deepEqual(catalog.currentnessSupplement,priorCatalog.currentnessSupplement);assert.equal(catalog.currentnessSupplementHash,priorCatalog.currentnessSupplementHash);assert.deepEqual(catalog.periodCompanionDocuments,priorCatalog.periodCompanionDocuments);
 assert.deepEqual(asset.payload.origin.sourceDocuments.slice(0,29),prior.payload.origin.sourceDocuments);
});

test('INFR IFRS PBT is independent from ordinary profit and native acquisition, periods and fields stay source-specific',async()=>{
 const rows=asset.payload.records.filter(r=>r.company_id==='INFR');assert.equal(rows.length,24);
 assert.equal(rows.filter(r=>r.metric_id==='profit_before_tax_consolidated_reported').length,6);assert.equal(rows.filter(r=>r.metric_id==='ordinary_profit_consolidated_reported').length,0);
 assert.equal(catalog.metrics.find(m=>m.metricId==='profit_before_tax_consolidated_reported').name,'税引前利益（IFRS）');
 for(const row of rows){assert.equal(row.accounting_standard_id,'IFRS');assert.equal(row.accounting_standard_as_disclosed,'ＩＦＲＳ');assert.equal(row.data_scope,'consolidated');assert.equal(row.reporting_entity_id,'INFR');assert.equal(row.source_locator.pdf_page,9);assert.equal(row.source_locator.period_binding_basis.physical_page,9);assert.equal(row.source_selected_field_availability.ordinary_profit_consolidated_reported.status,'not_applicable_in_selected_ifrs_table');assert.equal(row.source_selected_field_availability.ordinary_profit_consolidated_reported.company_wide_non_disclosure_claim,false);}
 const parentQ2=rows.find(r=>r.metric_id==='net_profit_parent_consolidated_reported'&&r.source_quarter_number===2&&r.fiscal_year==='2025');assert.equal(parentQ2.value,24558);assert.equal(parentQ2.value_raw,'24,558');
 for(const row of asset.payload.records.filter(r=>['INFR','NISHIMATSU'].includes(r.company_id))){assert.equal(row.unit,'百万円');assert.equal(row.retrieved_at,row.as_of_check_utc);assert.match(row.retrieved_at,/^2026-10-14T16:/);assert.equal(row.source_acquisition_timestamp_status,'known_actual_official_get_completion_utc');assert.equal(row.source_url_byte_verification_status,'http_200_saved_byte_equal');assert.equal(row.current_official_version_match_status,'unconfirmed_after_check');assert.equal(row.period_type,'quarter_cumulative_'+row.source_quarter_number*3+'months');for(const key of ['source_family','period_kind','period_end_month','as_of_date','candidate_disposition','source_period_semantics','as_of_check_utc_status','retrieved_at_basis','subject_entity_id','source_subject_name_as_disclosed'])assert.equal(Object.hasOwn(row,key),false,key);}
 assert.equal(filterQuarterlyRecords(asset.payload,{query:'インフロニア'}).length,24);assert.equal(filterQuarterlyRecords(asset.payload,{query:'INFRONEER'}).length,24);
 assert.equal(filterQuarterlyRecords(asset.payload,{companyId:'INFR',metricId:'ordinary_profit_consolidated_reported'}).length,0);
 const html=withWindow(()=>renderQuarterlyView(asset,{quarterCompany:'INFR',quarterMetric:'profit_before_tax_consolidated_reported'},0,catalog));assert.match(html,/税引前利益（IFRS）/);assert.match(html,/日本基準の経常利益との対応づけ・自動比較は行いません/);assert.match(html,/会社全体の非開示を意味しません/);assert.match(html,/PDF物理ページ 9 \/ 資料の表示ページ 6/);assert.match(html,/原資料の取得UTC 2026-10-14T16:/);
 const wrong=structuredClone(asset);wrong.payload.records.find(r=>r.company_id==='INFR'&&r.metric_id==='profit_before_tax_consolidated_reported').metric_id='ordinary_profit_consolidated_reported';await assert.rejects(validateQuarterlyAsset(await rehash(wrong)),/会計区分/);
 const invented=structuredClone(asset);invented.payload.records.find(r=>r.company_id==='INFR').as_of_date=null;await assert.rejects(validateQuarterlyAsset(await rehash(invented)),/原記録にない/);
});

test('Nishimatsu native construction order grid preserves consolidated versus individual, redundant totals and literal dash omission',async()=>{
 const rows=asset.payload.records.filter(r=>r.company_id==='NISHIMATSU'),orders=rows.filter(r=>r.metric_id==='construction_order_value_as_reported');assert.equal(rows.length,99);assert.equal(orders.length,75);
 assert.equal(orders.filter(r=>r.data_scope==='consolidated').length,6);assert.equal(orders.filter(r=>r.data_scope==='standalone').length,69);
 assert.equal(orders.reduce((n,r)=>n+r.source_locator.corroborating_alias_locators.length,0),6);
 for(const row of orders){assert.equal(row.reporting_entity_id,'NISHIMATSU');assert.equal(row.accounting_standard_id,'JGAAP');assert.equal(row.source_locator.period_binding_basis.status,'direct_exact_from_native_order_table');assert.equal(row.value_raw.includes('－'),false);assert.equal(row.source_locator.row_label,row.source_row_label_as_disclosed);assert.equal(row.source_locator.period_binding_basis.physical_page,row.source_locator.pdf_page);}
 const buildingOverseas=orders.filter(r=>r.source_parent_category_as_disclosed==='建築'&&r.source_row_label_as_disclosed.replaceAll(' ','')==='海外');assert.equal(buildingOverseas.length,3);assert.ok(buildingOverseas.every(r=>r.fiscal_year==='2024'));
 for(const q of [1,2,3])assert.equal(orders.filter(r=>r.source_quarter_number===q).length,25);
 assert.equal(filterQuarterlyRecords(asset.payload,{query:'西松'}).length,99);assert.equal(quarterlyExport(asset,{companyId:'NISHIMATSU',scope:'standalone'}).records.length,69);
 const csv=quarterlyCsv(asset,{companyId:'NISHIMATSU'});for(const field of ['accounting_standard_id','source_row_label_as_disclosed','source_parent_category_as_disclosed','source_selected_field_availability','corroborating_alias_locators','complete_public_source_record'])assert.ok(csv.includes(field));
 const html=withWindow(()=>Array.from({length:4},(_,page)=>renderQuarterlyView(asset,{quarterCompany:'NISHIMATSU'},page,catalog)).join(''));assert.match(html,/個別受注合計の重複欄は照合位置として保持/);assert.match(html,/受注表の開始・終了日をその表の対象範囲に保持/);assert.match(html,/連結損益計算書の開始・終了日を連結財務の期間だけに使います/);assert.match(html,/原資料の行：建築/);
 const lostAlias=structuredClone(asset);lostAlias.payload.records.find(r=>r.source_locator.corroborating_alias_locators?.length).source_locator.corroborating_alias_locators=[];await assert.rejects(validateQuarterlyAsset(await rehash(lostAlias)),/照合位置件数/);
});

test('new exact official provider URLs and profile-specific schema reject private aliases, misbound periods and old-profile relaxation',async()=>{
 const schema=JSON.parse(await readFile(path.join(root,'public/explorer/quarterly-financials.schema.json'),'utf8'));delete schema.$schema;const validate=new Ajv({allErrors:true}).compile(schema);
 for(const url of ['https://ssl4.eir-parts.net/doc/9999/tdnet/2669706/00.pdf','https://ssl4.eir-parts.net/doc/1820/tdnet/unregistered/00.pdf','https://ssl4.eir-parts.net/doc/1820/tdnet/2669706/00.pdf?token=secret','http://ssl4.eir-parts.net/doc/1820/tdnet/2669706/00.pdf','https://www.infroneer.com/pdf/ir/factbook/FY2025_2Q_fact.pdf','https://www.infroneer.com/pdf/ir/presentations/FY2025_1Q_FP.pdf'])assert.equal(quarterlySourceUrl(url),null);
 const aliasPrivate=structuredClone(asset);aliasPrivate.payload.records.find(r=>r.source_locator.corroborating_alias_locators?.length).source_locator.corroborating_alias_locators[0].source_path='data/raw/private.pdf';assert.equal(validate(aliasPrivate),false);await assert.rejects(validateQuarterlyAsset(await rehash(aliasPrivate)),/公開対象外/);
 const misbound=structuredClone(asset);misbound.payload.records.find(r=>r.company_id==='NISHIMATSU').source_locator.period_binding_basis.source_sha256='0'.repeat(64);await assert.rejects(validateQuarterlyAsset(await rehash(misbound)),/累計期間根拠/);
 const nonDisclosure=structuredClone(asset);nonDisclosure.payload.records.find(r=>r.company_id==='INFR').source_selected_field_availability.ordinary_profit_consolidated_reported.company_wide_non_disclosure_claim=true;assert.equal(validate(nonDisclosure),false);await assert.rejects(validateQuarterlyAsset(await rehash(nonDisclosure)),/非開示/);
 const oldAbsent=structuredClone(asset);delete oldAbsent.payload.records.find(r=>r.company_id==='KITANO').as_of_date;assert.equal(validate(oldAbsent),false);
 const oldNewField=structuredClone(asset);oldNewField.payload.records.find(r=>r.company_id==='KITANO').accounting_standard_id='IFRS';assert.equal(validate(oldNewField),false);await assert.rejects(validateQuarterlyAsset(await rehash(oldNewField)),/公開対象外/);
 const oldNewLocator=structuredClone(asset);oldNewLocator.payload.records.find(r=>r.company_id==='KITANO').source_locator.corroborating_alias_locators=[];assert.equal(validate(oldNewLocator),false);await assert.rejects(validateQuarterlyAsset(await rehash(oldNewLocator)),/公開対象外/);
 assert.doesNotMatch(JSON.stringify(asset)+JSON.stringify(catalog),/heldSourceObservations|sourcePlaceholders|sourceConflicts|formal_statement_reconciliation|nishimatsu_eir|data\/raw\/|\/Volumes\//);
});

test('new adopted Source export binds its own snapshot and all123 full rows while held observations remain Source-only',{skip:!sourceRoot},async()=>{
 const own=JSON.parse(await readFile(path.join(sourceRoot,'data/ai_infr_nishimatsu_quarterly/export.json'),'utf8'));
 const ledger=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(JSON.parse),selected=selectQuarterlySourceRows(ledger);
 assert.deepEqual(await assertQuarterlyCohortExport(own,selected),catalog.sourceCohortExports[3]);assert.equal(catalog.sourceCohortExports.length,9);assert.equal(own.snapshotHash,'d668264cd72c0bd5e7b68b39ed3aefb8f77e4018fdd8155dedb721589eb33192');assert.equal(own.payload.records.length,123);assert.equal(own.payload.heldSourceObservations.length,50);assert.equal(own.payload.sourcePlaceholders.length,3);assert.equal(own.payload.sourceConflicts.length,1);
 for(const row of own.payload.records)assert.deepEqual(selected.find(r=>r.fact_id===row.fact_id),row);
 const changed=structuredClone(own);changed.payload.records[0].source_locator.pdf_page++;await assert.rejects(assertQuarterlyCohortExport(changed,selected),/原記録/);
 const mislabeled=structuredClone(own);mislabeled.snapshotHash=catalog.sourceCohortExports[2].snapshotHash;await assert.rejects(assertQuarterlyCohortExport(mislabeled,selected),/出力版/);
 for(const held of own.payload.heldSourceObservations)assert.equal(asset.payload.records.some(r=>r.source_cell_id===held.source_observation_id),false);
});

test('all published old638 fields, four Source cohorts, currentness12 and companions4 remain exact',async()=>{
 const previousBytes=await readFile(path.join(root,'tests/fixtures/atlas-quarterly-original638.json.gz')),previous=JSON.parse(gunzipSync(previousBytes));
 const previousCatalogBytes=await readFile(path.join(root,'tests/fixtures/atlas-quarterly-original638.catalog.json')),previousCatalog=JSON.parse(previousCatalogBytes);
 assert.equal(createHash('sha256').update(previousBytes).digest('hex'),'017ca48b88240f23fdeb01865803d3cc28711f022998f73a58b654f4a8e28a8c');
 assert.equal(createHash('sha256').update(previousCatalogBytes).digest('hex'),'6176b29f03a11c176b06426ffa85ed242c8ce82a443c4cfc4a69c8be64df68ef');
 assert.equal(previous.payload.records.length,638);for(const row of previous.payload.records)if(row.fact_id!=='df84afac72e25d75e0e004009b1baa48a5e2d5c7c2e6442a900fc2c2a99090de')assert.deepEqual(asset.payload.records.find(r=>r.fact_id===row.fact_id),row,row.fact_id);
 assert.deepEqual(catalog.sourceCohortExports.slice(0,4),previousCatalog.sourceCohortExports);assert.deepEqual(catalog.sourceCohortExport,previousCatalog.sourceCohortExport);
 assert.deepEqual(catalog.currentnessSupplement,previousCatalog.currentnessSupplement);assert.equal(catalog.currentnessSupplementHash,previousCatalog.currentnessSupplementHash);
 assert.deepEqual(catalog.periodCompanionDocuments,previousCatalog.periodCompanionDocuments);assert.deepEqual(asset.payload.origin.periodCompanionDocuments,previous.payload.origin.periodCompanionDocuments);
 assert.deepEqual(asset.payload.origin.sourceDocuments.slice(0,35),previous.payload.origin.sourceDocuments);assert.deepEqual(asset.payload.origin.sourceExtractorVersions.slice(0,7),previous.payload.origin.sourceExtractorVersions);
});

test('Shimizu32 and Toda112 retain native scopes, cumulative periods, six exact PDFs and actual capture UTC',async()=>{
 const rows=asset.payload.records.filter(r=>r.extractor_version===QUARTER_EXTRACTORS[7]);assert.equal(rows.length,144);
 assert.deepEqual(Object.fromEntries(['SHIMIZU','TODA'].map(c=>[c,rows.filter(r=>r.company_id===c).length])),{SHIMIZU:32,TODA:112});
 assert.deepEqual(Object.fromEntries([1,2,3].map(q=>[q,rows.filter(r=>r.source_quarter_number===q).length])),{1:44,2:50,3:50});
 for(const row of rows){
  const doc=QUARTER_ST_DOCUMENTS.find(d=>d.sha256===row.source_file_sha256);assert.ok(doc);assert.equal(row.source_url,doc.sourceUrl);assert.equal(row.retrieved_at,doc.acquiredAtUtc);assert.equal(row.as_of_check_utc,doc.acquiredAtUtc);
  assert.equal(row.source_text,row.value_raw);assert.equal(row.unit,'百万円');assert.equal(row.data_scope==='consolidated'?'連結':'個別',row.source_subject_scope_as_disclosed);assert.equal(row.subject_entity_id,row.reporting_entity_id);assert.equal(row.subject_entity_id,row.company_id);
  assert.equal(row.period_type,'quarter_cumulative_'+row.source_quarter_number*3+'months');assert.equal(row.source_locator.period_binding_basis.source_sha256,doc.sha256);
  assert.equal(row.source_acquisition_timestamp_status,'known_actual_official_get_completion_utc');assert.equal(row.current_official_version_match_status,'unconfirmed_after_check');assert.equal(row.correction_status,'unreviewed_full_revision_series');
  for(const key of ['source_family','period_kind','period_end_month','as_of_date','candidate_disposition','source_period_semantics','as_of_check_utc_status','retrieved_at_basis','source_file','source_subject_name_as_disclosed'])assert.equal(Object.hasOwn(row,key),false,key);
 }
 assert.equal(filterQuarterlyRecords(asset.payload,{query:'清水'}).length,32);assert.equal(filterQuarterlyRecords(asset.payload,{query:'戸田'}).length,112);assert.equal(catalog.metrics.find(m=>m.metricId==='order_value_as_reported').name,'非建設事業の受注高（原表カテゴリ別）');
 const wrongUtc=structuredClone(asset);wrongUtc.payload.records.find(r=>r.company_id==='TODA').retrieved_at='2025-08-08';await assert.rejects(validateQuarterlyAsset(await rehash(wrongUtc)),/実取得UTC/);
 const literal=structuredClone(asset);literal.payload.records.find(r=>r.company_id==='SHIMIZU').source_subject_scope_as_disclosed='issuer consolidated JGAAP financial scope';await assert.rejects(validateQuarterlyAsset(await rehash(literal)),/原文の対象範囲/);
 const misbound=structuredClone(asset);misbound.payload.records.find(r=>r.company_id==='SHIMIZU'&&r.metric_id==='sales_consolidated_reported').source_locator.period_binding_basis.physical_page=19;await assert.rejects(validateQuarterlyAsset(await rehash(misbound)),/累計期間根拠/);
});

test('Shimizu overseas reference4 and Q3 prior financial restatement4 are distinct from companywide orders and other periods',async()=>{
 const rows=asset.payload.records.filter(r=>r.company_id==='SHIMIZU'),references=rows.filter(r=>r.metric_id==='total_orders_as_reported'&&r.data_scope==='consolidated');assert.equal(references.length,4);
 assert.equal(rows.filter(r=>r.metric_id==='total_orders_as_reported'&&r.data_scope==='standalone').length,4);assert.equal(rows.filter(r=>r.source_quarter_number===1&&r.metric_id.includes('order')).length,0);
 for(const row of references){assert.equal(row.source_category_as_disclosed,'合 計');assert.equal(row.source_parent_category_as_disclosed,'（参考）海外受注高の状況（連結）');assert.match(row.source_subject_scope_interpretation,/not consolidated companywide total/);assert.equal(row.period_interval_status,'same_page_repeated_order_period_header_exact_dates');}
 const restated=rows.filter(r=>r.source_restatement_basis);assert.equal(restated.length,4);for(const row of restated){assert.equal(row.source_quarter_number,3);assert.equal(row.fiscal_year,'2024');assert.equal(row.data_scope,'consolidated');assert.equal(row.source_restatement_basis.native_quote_lines.length,2);assert.equal(row.source_restatement_basis.physical_page,1);assert.equal(row.source_restatement_basis.source_sha256,row.source_file_sha256);assert.match(row.source_restatement_basis.native_quote_lines.map(q=>q.quote).join(''),/企業結合.*暫定的.*確定/s);}
 const html=withWindow(()=>[0,1].map(page=>renderQuarterlyView(asset,{quarterCompany:'SHIMIZU'},page,catalog)).join(''));assert.match(html,/海外受注高（連結・参考値）/);assert.match(html,/会社全体の連結受注合計ではありません/);assert.match(html,/対象範囲の原文：連結/);assert.match(html,/対象範囲の解釈（原文引用とは別）/);assert.match(html,/清水Q3・前年財務のみ/);assert.match(html,/Q1・Q2や受注へこの注記を転記しません/);
 const copied=structuredClone(asset);copied.payload.records.find(r=>r.company_id==='SHIMIZU'&&r.source_quarter_number===1).source_restatement_basis=restated[0].source_restatement_basis;await assert.rejects(validateQuarterlyAsset(await rehash(copied)),/前年財務注記/);
 const whole=structuredClone(asset);whole.payload.records.find(r=>r.fact_id===references[0].fact_id).source_subject_scope_interpretation='companywide total';await assert.rejects(validateQuarterlyAsset(await rehash(whole)),/会社全体の受注合計/);
});

test('Toda reported grand totals, construction subtree and nonconstruction12 retain their source paths without coercion',async()=>{
 const rows=asset.payload.records.filter(r=>r.company_id==='TODA'),grand=rows.filter(r=>r.metric_id==='total_orders_as_reported'),construction=rows.filter(r=>r.metric_id==='construction_order_value_as_reported'),nonconstruction=rows.filter(r=>r.metric_id==='order_value_as_reported');
 assert.equal(grand.length,6);assert.equal(construction.length,70);assert.equal(nonconstruction.length,12);assert.equal(construction.filter(r=>r.source_row_path_as_disclosed.length===2).length,6);
 for(const row of grand){assert.deepEqual(row.source_row_path_as_disclosed,['合 計']);assert.match(row.source_subject_scope_interpretation,/construction \+ investment\/development \+ energy aggregate/);}
 for(const row of nonconstruction){assert.ok(['国内投資開発事業等','環境・エネルギー事業'].includes(row.source_row_path_as_disclosed[0]));assert.equal(row.data_scope,'standalone');}
 const civilOverseas=construction.filter(r=>r.source_row_path_as_disclosed.join('/')==='建設事業/土木/海外');assert.equal(civilOverseas.length,4);assert.ok(civilOverseas.every(r=>r.source_quarter_number!==1));
 const csv=quarterlyCsv(asset,{companyId:'TODA'}),json=quarterlyExport(asset,{companyId:'TODA'});assert.equal(json.records.length,112);for(const field of ['source_subject_scope_as_disclosed','source_subject_scope_interpretation','source_row_path_as_disclosed','source_precision_status','period_interval_status','complete_public_source_record'])assert.ok(csv.includes(field));for(const row of nonconstruction)assert.ok(csv.includes(row.fact_id));
 const html=withWindow(()=>Array.from({length:5},(_,page)=>renderQuarterlyView(asset,{quarterCompany:'TODA'},page,catalog)).join(''));assert.match(html,/建設事業の小計とは区別します/);assert.match(html,/建設事業の受注へ付け替えません/);assert.match(html,/原資料の行：建設事業 › 土木/);assert.match(html,/対象範囲の原文：個別/);
 const coerced=structuredClone(asset);coerced.payload.records.find(r=>r.fact_id===nonconstruction[0].fact_id).metric_id='construction_order_value_as_reported';await assert.rejects(validateQuarterlyAsset(await rehash(coerced)),/全体合計・建設小計・非建設事業/);
});

test('eighth profile schema does not widen older profiles or expose private guards, wrappers and pagewide text',async()=>{
 const schema=JSON.parse(await readFile(path.join(root,'public/explorer/quarterly-financials.schema.json'),'utf8'));delete schema.$schema;const validate=new Ajv({allErrors:true}).compile(schema);assert.equal(validate(asset),true,JSON.stringify(validate.errors));
 const newRow=asset.payload.records.find(r=>r.company_id==='SHIMIZU'),restated=asset.payload.records.find(r=>r.company_id==='SHIMIZU'&&r.source_restatement_basis);
 for(const url of ['https://pdf.irpocket.com/C9999/i6fv/Gae6/pesL.pdf','https://pdf.irpocket.com/C1803/i6fv/Gae6/unregistered.pdf','https://pdf.irpocket.com/C1803/i6fv/Gae6/pesL.pdf?token=secret','http://pdf.irpocket.com/C1803/i6fv/Gae6/pesL.pdf','https://www.toda.co.jp/ir/results/assets/pdf/toda_103_02.pdf'])assert.equal(quarterlySourceUrl(url),null);
 const guardPath=structuredClone(asset);guardPath.payload.records.find(r=>r.fact_id===newRow.fact_id).source_locator.native_header_guards[0].source_path='data/raw/private.pdf';assert.equal(validate(guardPath),false);await assert.rejects(validateQuarterlyAsset(await rehash(guardPath)),/公開対象外/);
 const notePath=structuredClone(asset);notePath.payload.records.find(r=>r.fact_id===restated.fact_id).source_restatement_basis.native_quote_lines[0].source_file='data/raw/private.pdf';assert.equal(validate(notePath),false);await assert.rejects(validateQuarterlyAsset(await rehash(notePath)),/公開対象外/);
 const page=structuredClone(asset);page.payload.records.find(r=>r.fact_id===newRow.fact_id).source_text='whole native PDF page text';await assert.rejects(validateQuarterlyAsset(await rehash(page)),/原文の対象範囲/);
 for(const company of ['KITANO','INFR']){const old=structuredClone(asset);old.payload.records.find(r=>r.company_id===company).source_subject_scope_interpretation='extra';assert.equal(validate(old),false);await assert.rejects(validateQuarterlyAsset(await rehash(old)),/公開対象外/);}
 const invented=structuredClone(asset);invented.payload.records.find(r=>r.fact_id===newRow.fact_id).as_of_date=null;assert.equal(validate(invented),false);await assert.rejects(validateQuarterlyAsset(await rehash(invented)),/公開対象外/);
 assert.doesNotMatch(JSON.stringify(asset)+JSON.stringify(catalog),/heldOrderObservations|heldSourceObservations|sourcePlaceholders|sourceConflicts|documentMetadata|source_path|source_file"|receipt_file|manifest_file|juchu|\/Volumes\/|data\/raw\//);
});

test('adopted Shimizu Toda fifth cohort binds snapshot144 full Source rows and excludes held6 and placeholders2',{skip:!sourceRoot},async()=>{
 const own=JSON.parse(await readFile(path.join(sourceRoot,'data/ai_shimizu_toda_quarterly/export.json'),'utf8'));
 const ledger=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(JSON.parse),selected=selectQuarterlySourceRows(ledger);
 assert.equal(own.snapshotHash,'a60124646393a40acc7eca029ffdabdcf204c2ba2d4c90c0ae609bcfee8d31b5');assert.equal(own.payload.records.length,144);assert.equal(own.payload.heldSourceObservations.length,6);assert.equal(own.payload.sourcePlaceholders.length,2);assert.equal(own.payload.coverage.length,12);assert.equal(catalog.sourceCohortExports.length,9);
 assert.deepEqual(await assertQuarterlyCohortExport(own,selected),catalog.sourceCohortExports[4]);for(const row of own.payload.records)assert.deepEqual(selected.find(r=>r.fact_id===row.fact_id),row);
 for(const held of [...own.payload.heldSourceObservations,...own.payload.sourcePlaceholders])assert.equal(asset.payload.records.some(r=>r.source_cell_id===held.source_observation_id),false);
 const tampered=structuredClone(own);tampered.payload.records[0].source_subject_scope_interpretation='companywide';await assert.rejects(assertQuarterlyCohortExport(tampered,selected),/原記録/);
});
