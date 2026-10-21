import test from 'node:test';import assert from 'node:assert/strict';
import {canonicalSha256}from'../public/explorer/lib/buildbase-contract-hash.mjs';
import{validateAnnualComparisons,selectAnnualComparisons,renderAnnualComparisons}from'../public/workspace/annual-comparisons.mjs';
import{publicDataUrl}from'../public/explorer/public-data.mjs';import{acceptedWorkspaceHash}from'../lib/atlas-workspace-bridge.mjs';
const permissions={preciseDeltaAllowed:false,exactGrowthAllowed:false,automaticComparisonAllowed:false,automaticAggregationAllowed:false,canonicalFactPromotionAllowed:false,publicationAllowed:false};
const point=(id,kind,value,period)=>({pointId:id,pointKind:kind,isCanonicalFact:kind==='original_fact_read_view',newlyAdmittedFact:false,record:{company_id:'A',metric_id:'m',value_raw:value,source_url:'https://example.com/source.pdf'},period,permissions:{...permissions}});
const fixture=()=>({schemaVersion:1,datasetId:'buildbase-annual-source-comparison-reference',annualComparisons:[{seriesId:'s',companyId:'A',metricId:'m',scope:'standalone',unit:'百万円',definition:{native:'<img>'},conditions:['丸め差を保持'],currentPoint:point('fact','original_fact_read_view','100',{as_of:'2026-03-31'}),historicalPoints:[point('cell','source_cell_read_view','0',{as_of:'2025-03-31'})],permissions:{...permissions}}],permissions:{...permissions}});
const wrap=async payload=>({payload,snapshotHash:await canonicalSha256(payload)});
test('annual references preserve source cell identity, zero and stock instant without calculating growth',async()=>{const a=await validateAnnualComparisons(await wrap(fixture()));const h=renderAnnualComparisons(a);assert.match(h,/時点 2025-03-31/);assert.match(h,/0 百万円/);assert.match(h,/既存企業factの読取/);assert.match(h,/過年度原セルの読取/);assert.match(h,/&lt;img&gt;/);assert.ok(!h.includes('<img>'));assert.equal(selectAnnualComparisons(a,{scope:'consolidated'}).length,0);});
test('annual wrapper rejects tampering, canonical promotion, cross-company points and widened permissions',async()=>{const w=await wrap(fixture());w.payload.annualComparisons[0].unit='円';await assert.rejects(()=>validateAnnualComparisons(w));for(const mutate of [a=>a.permissions.publicationAllowed=true,a=>a.annualComparisons[0].historicalPoints[0].isCanonicalFact=true,a=>a.annualComparisons[0].currentPoint.record.company_id='OTHER',a=>a.annualComparisons[0].historicalPoints[0].newlyAdmittedFact=true]){const a=fixture();mutate(a);await assert.rejects(()=>wrap(a).then(validateAnnualComparisons));}});
test('annual view has bounded workspace route and explicit public asset path',()=>{assert.equal(acceptedWorkspaceHash('#annual'),'#annual');assert.equal(publicDataUrl('explorer/annual-comparisons.json.gz','/atlas'),'/atlas/explorer/annual-comparisons.json.gz');assert.throws(()=>publicDataUrl('explorer/../annual-comparisons.json.gz','/atlas'));});

test('verified 582-series snapshot retains985 historic points and cross-category fact IDs',async()=>{
 const {readFileSync}=await import('node:fs'),{gunzipSync}=await import('node:zlib');
 const a=await validateAnnualComparisons(JSON.parse(gunzipSync(readFileSync(new URL('../public/explorer/annual-comparisons.json.gz',import.meta.url)))));
 const bridge=JSON.parse(gunzipSync(readFileSync(new URL('../public/explorer/project-finance.json.gz',import.meta.url))));
 assert.deepEqual(a.summary,{canonicalFactRawAdded:0,companyCount:18,historicalPointCount:985,seriesCount:582});
 const facts=new Set(bridge.financialRecords.map(r=>r.financialRecordId));
 for(const row of a.annualComparisons){assert.ok(facts.has(row.currentPoint.pointId));for(const p of [row.currentPoint,...row.historicalPoints])assert.ok(p.sourceReferences.some(r=>r.url?.startsWith('https://')));}
 assert.ok(!/\/Volumes\/|\/Users\/|file:\/\//.test(JSON.stringify(a)));
 assert.equal(a.latestReadApi,bridge.sourceSnapshots.latestReadApi);
 const h=renderAnnualComparisons(a,{company:'MATSUI'});assert.match(h,/2024-03-31/);assert.match(h,/2026-03-31/);assert.ok(!h.includes('URL未確認'));
});
