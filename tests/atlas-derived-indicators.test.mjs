import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import Ajv from 'ajv';
import {canonicalSha256} from '../lib/buildbase-contract-hash.mjs';
import {projectDerivedIndicators} from '../lib/atlas-derived-projection.mjs';
import {validateDerivedAsset,DERIVED_PERMISSION_KEYS,DERIVED_SOURCE_SNAPSHOT,publicFinancialValue,assertPublicFinancialData,officialFinancialUrl,derivedExport,derivedCsv,derivedPeriodLabel,filterDerivedResults} from '../public/explorer/derived-data.mjs';
import {renderDerivedView,derivedFilters} from '../public/explorer/derived-view.mjs';
import {parseState,stateHash} from '../public/explorer/data-view.mjs';
import {acceptedExplorerHash} from '../lib/atlas-explorer-bridge.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bytes=await readFile(path.join(root,'public/explorer/derived-indicators.json.gz'));
const asset=JSON.parse(gunzipSync(bytes)),catalog=JSON.parse(await readFile(path.join(root,'public/explorer/derived-indicators.catalog.json'),'utf8'));

test('public projection is hash-checked, source-attributed and contains exactly five definitions / 141 results / 23 IDs',async()=>{
 const p=await validateDerivedAsset(asset,catalog);
 assert.equal(p.origin.sourceSnapshotHash,DERIVED_SOURCE_SNAPSHOT);assert.match(p.origin.generatedFrom,/Source saved/);assert.doesNotMatch(p.origin.generatedFrom,/Atlas.*DB/);
 assert.equal(catalog.compressedSha256,createHash('sha256').update(bytes).digest('hex'));
 assert.deepEqual(Object.fromEntries(p.definitions.map(d=>[d.metricId,p.results.filter(r=>r.metricId===d.metricId).length])),{consolidated_gross_profit_yoy_difference:23,consolidated_gross_profit_yoy_growth_rate:23,consolidated_gross_profit_margin:46,group_perimeter_revenue_gap:3,consolidated_operating_profit_margin:46});
 for(const r of p.results)for(const key of DERIVED_PERMISSION_KEYS)assert.equal(r.permissions[key],false);
 const changed=structuredClone(asset);changed.payload.results[0].value='999';await assert.rejects(validateDerivedAsset(changed,catalog),/hash/);
 const promoted=structuredClone(asset);promoted.payload.results[0].permissions.automaticComparisonAllowed=true;promoted.projectionHash=await canonicalSha256(promoted.payload);await assert.rejects(validateDerivedAsset(promoted),/利用条件/);
});

test('published financial schema rejects private keys and public snapshot contains no private markers',async()=>{
 const schema=JSON.parse(await readFile(path.join(root,'public/explorer/derived-indicators.schema.json'),'utf8'));delete schema.$schema;
 const validate=new Ajv({allErrors:true}).compile(schema);assert.equal(validate(asset),true,JSON.stringify(validate.errors));
 for(const key of ['sourceFile','localSource','personName','email','secretToken','processedSheetVersion','sheetId','driveId','clientRelation','internalContact']){const changed=structuredClone(asset);changed.payload.results[0].inputDependencies[0][key]='blocked';assert.equal(validate(changed),false,key);assert.throws(()=>assertPublicFinancialData(changed.payload.results[0]));}
 const raw=JSON.stringify(asset);assert.doesNotMatch(raw,/\/Volumes\/|\/Users\/|file:\/\/|data\/raw\/|https?:\/\/github\.com\/|"(?:sourceFile|sourceReceiptFile|localSource|password|secretToken|email|phone)"|非公開参照/);
 assertPublicFinancialData(asset.payload.results);assert.throws(()=>publicFinancialValue({sourceQuote:'private https://docs.google.com/spreadsheets/d/internal/edit'}),/公式財務資料以外/);assert.throws(()=>assertPublicFinancialData({sourceTitle:'https://drive.google.com/file/d/private'}),/公式財務資料以外/);assert.deepEqual(publicFinancialValue({companyName:'公開会社',processedSheetVersion:'private',sheetId:'private',internalContact:'private',clientRelation:'private'}),{companyName:'公開会社'});
 const safe=publicFinancialValue({companyName:'公開会社',sourceFile:'data/raw/private.html',email:'person@example.test',password:'blocked',value:'7',sourceFileSha256:'a'.repeat(64)});assert.deepEqual(safe,{companyName:'公開会社',value:'7',sourceFileSha256:'a'.repeat(64)});
 for(const url of ['https://github.com/private/repo','http://www2.jpx.co.jp/','https://example.test/','https://www2.jpx.co.jp/public?api_key=secret','javascript:alert(1)'])assert.equal(officialFinancialUrl(url),null);
});

test('all 141 results are searchable and every paginated result is reachable',()=>{
 const p=asset.payload;assert.equal(filterDerivedResults(p).length,141);
 for(const r of p.results)assert.deepEqual(filterDerivedResults(p,{query:r.resultId}).map(r=>r.resultId),[r.resultId]);
 for(const d of p.definitions)assert.equal(filterDerivedResults(p,{metricId:d.metricId}).length,catalog.definitions.find(x=>x.metricId===d.metricId).resultCount);
 for(const company of p.companies)assert.ok(filterDerivedResults(p,{companyId:company.companyId}).length>0);
 const ids=[];for(let page=0;page<6;page++){const html=renderDerivedView(asset,{},page);ids.push(...Array.from(html.matchAll(/data-derived-result-id="([^"]+)"/g),m=>m[1]));assert.doesNotMatch(html,/● 出典確認済み/);}
 assert.equal(ids.length,141);assert.equal(new Set(ids).size,141);assert.deepEqual(ids,p.results.map(r=>r.resultId));
 assert.match(renderDerivedView(asset,{},0),/会社間の自動比較・合算、指数・相関は許可されていません/);
});

test('exact periods, basis differences and missing official URLs remain explicit',()=>{
 const p=asset.payload,c=p.operatingMarginCohorts;assert.deepEqual([c.sameMarchJgaapCompanyIds.length,c.ifrsBasisDifferenceCompanyIds.length,c.actualPeriodDifferenceCompanyIds.length,c.missingInputCompanyIds.length],[19,1,3,0]);
 const operating=p.results.filter(r=>r.metricId==='consolidated_operating_profit_margin');
 assert.ok(operating.filter(r=>r.companyId==='MAEDA').every(r=>r.periodTo.start.startsWith('2019')||r.periodTo.start.startsWith('2020')));
 assert.ok(operating.filter(r=>r.companyId==='TAKENAKA').every(r=>r.periodTo.start.endsWith('01-01')&&r.periodTo.end.endsWith('12-31')));
 assert.ok(operating.filter(r=>r.companyId==='SMCC').every(r=>r.reviewWindow==='FY2023_FY2024'));
 const dependencies=p.results.flatMap(r=>r.inputDependencies);assert.equal(dependencies.filter(d=>d.sourceUrl===null).length,250);assert.equal(dependencies.filter(d=>officialFinancialUrl(d.sourceUrl)).length,32);
 assert.ok(dependencies.filter(d=>d.sourceUrl===null).every(d=>d.sourceFileSha256));
 assert.match(renderDerivedView(asset,{derivedCompany:'INFR',derivedMetric:'consolidated_operating_profit_margin'}),/IFRSの資料です/);
 assert.match(renderDerivedView(asset,{derivedCompany:'TAKENAKA',derivedMetric:'consolidated_operating_profit_margin'}),/暦年・12月決算/);
 assert.match(renderDerivedView(asset,{derivedCompany:'MAEDA',derivedMetric:'consolidated_operating_profit_margin'}),/自社過年度/);
 assert.match(renderDerivedView(asset,{derivedCompany:'ANDO_HAZAMA',derivedMetric:'consolidated_operating_profit_margin'}),/原URLは未収録/);
 assert.match(derivedPeriodLabel(p.results.find(r=>r.metricId==='consolidated_gross_profit_yoy_difference')),/前期 .* → 当期 /);
});

test('derived CSV/JSON carry source and public hashes, original result IDs, formula, inputs and immutable permissions',()=>{
 const filters={companyId:'ANDO_HAZAMA',metricId:'consolidated_operating_profit_margin'},out=derivedExport(asset,filters),csv=derivedCsv(asset,filters);
 assert.equal(out.records.length,2);assert.equal(out.sourceSnapshotHash,DERIVED_SOURCE_SNAPSHOT);assert.equal(out.projectionHash,asset.projectionHash);assert.equal(out.definitions.length,1);
 assert.match(csv,/input_dependencies/);assert.match(csv,/formula_id/);assert.match(csv,/source_currentness/);assert.match(csv,/sourceFileSha256/);assert.match(csv,/sourceUrl"":null/);assert.match(csv,/automaticComparisonAllowed"":false/);
 for(const r of out.records)assert.ok(csv.includes(r.resultId));assert.ok(csv.includes(asset.projectionHash));assert.ok(csv.includes(DERIVED_SOURCE_SNAPSHOT));
 assert.doesNotMatch(JSON.stringify(out),/response_json|dependencyManifest|data\/raw\//);
});

test('derived URL state is independent of primary selections and retained through the parent bridge',()=>{
 const state=parseState('#view=derived&derivedMetric=consolidated_operating_profit_margin&derivedCompany=ANDO_HAZAMA&derivedWindow=FY2024_FY2025&indicator=roe&companies=TAISEI&from=2015&to=2025',['roe'],['TAISEI'],[]);
 const hash='#'+stateHash(state);assert.notEqual(acceptedExplorerHash({type:'atlas-explorer-state',hash}),null);
 assert.deepEqual(parseState(hash,['roe'],['TAISEI'],[]),state);assert.equal(state.indicator,'roe');assert.deepEqual(state.companies,['TAISEI']);assert.equal(derivedFilters(state).companyId,'ANDO_HAZAMA');
});

test('existing Source 141 values, dates, formula IDs, states and permissions survive projection; old 95 remain unchanged',async t=>{
 const file=process.env.ATLAS_DERIVED_SOURCE_EXPORT;
 if(!file){t.skip('Set ATLAS_DERIVED_SOURCE_EXPORT to the existing read-only Source export');return;}
 const source=JSON.parse(await readFile(file,'utf8')),projected=await projectDerivedIndicators(source);assert.deepEqual(projected,asset);
 for(let i=0;i<141;i++){const original=source.payload.results[i],publicRow=asset.payload.results[i];for(const key of ['resultId','companyId','metricId','value','unit','periodFrom','periodTo','formulaId','definitionVersion','calculationState','currentStatus','permissions','reportingBasis','validation'])assert.deepEqual(publicRow[key],publicFinancialValue(original[key]),key+':'+i);for(let j=0;j<original.inputDependencies.length;j++)for(const key of ['value','valueAsReviewed','periodStart','periodEnd','sourceFileSha256','sourceQuote','sourceLocator','inputId','factId'])assert.deepEqual(publicRow.inputDependencies[j][key],publicFinancialValue(original.inputDependencies[j][key]),key+':'+i);}
 const oldFile=process.env.ATLAS_DERIVED_OLD_CATALOG;
 if(oldFile){const old=JSON.parse(await readFile(oldFile,'utf8')).contracts.find(c=>c.kind==='indicators').payload;assert.equal(old.results.length,95);for(let i=0;i<95;i++)for(const key of ['resultId','value','unit','periodFrom','periodTo','permissions'])assert.deepEqual(asset.payload.results[i][key],old.results[i][key]);}
});
