import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {acceptedExplorerHash,acceptedExplorerMessage,explorerBasePath,explorerRestoreMessage} from '../lib/atlas-explorer-bridge.mjs';
import {explorerDocument} from '../lib/atlas-explorer-document.mjs';
import {publicDataUrl,classificationCoordinates,loadPublicIndex,loadOriginalSeries,publicSeriesId,csvRowsForPoints,originalPeriodYear} from '../public/explorer/public-data.mjs';
import {cellDisplay,pointsFor,analysisFor,validatedPacket,parseState,stateHash,marketPointDisplay,pointInYearRange} from '../public/explorer/data-view.mjs';
import {renderLineChart,isConfirmed,isPlottable,safeHttpsSourceUrl,sourceLink} from '../public/explorer/presentation.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('parent URL bridge accepts only explorer state and preserves the Pages base path',async()=>{
 const nextConfig=await readFile(path.join(root,'next.config.ts'),'utf8');const pagesPrefix=nextConfig.match(/GITHUB_PAGES === "true"\s*\?\s*"([^"]+)"\s*:\s*""/)?.[1];assert.equal(pagesPrefix,'/mlit-statistics-dashboard');assert.equal(explorerBasePath(pagesPrefix+'/'),pagesPrefix);
 assert.equal(explorerBasePath('/mlit-statistics-dashboard/'),'/mlit-statistics-dashboard');
 assert.equal(explorerBasePath('/'), '');assert.equal(publicDataUrl('system/catalog.json','/'),'/system/catalog.json');
 assert.equal(publicDataUrl('system/catalog.json','/mlit-statistics-dashboard/'),'/mlit-statistics-dashboard/system/catalog.json');
 assert.throws(()=>publicDataUrl('system/../private.json','/'));
 assert.equal(acceptedExplorerHash({type:'atlas-explorer-state',hash:'#indicator=roe&from=2021'}),'#indicator=roe&from=2021');
 const source={},event={origin:'https://example.test',source,data:{type:'atlas-explorer-state',hash:'#indicator=roe'}};
 assert.equal(acceptedExplorerMessage(event,event.origin,source),'#indicator=roe');
 assert.equal(acceptedExplorerMessage({...event,origin:'https://other.test'},event.origin,source),null);
 assert.equal(acceptedExplorerMessage({...event,source:{}},event.origin,source),null);
 assert.equal(acceptedExplorerMessage(event,event.origin,null),null);assert.equal(acceptedExplorerMessage(event,event.origin,source,true),null);assert.equal(explorerRestoreMessage('#favorite=legacy',true),null);assert.deepEqual(explorerRestoreMessage('#indicator=roe'),{type:'atlas-explorer-restore',hash:'#indicator=roe'});
 for(const data of [{type:'other',hash:'#indicator=roe'},{type:'atlas-explorer-state',hash:'https://bad/'},{type:'atlas-explorer-state',hash:'#redirect=https://bad/'},{type:'atlas-explorer-state',hash:'#indicator=roe\n'}])assert.equal(acceptedExplorerHash(data),null);
 const html=explorerDocument('/mlit-statistics-dashboard','#indicator=roe');
 assert.match(html,/src="\/mlit-statistics-dashboard\/explorer\/app.mjs"/);
 assert.match(html,/<base href="\/mlit-statistics-dashboard\/">/);
 assert.equal(explorerDocument('', '</script><script>alert(1)</script>').includes('</script><script>alert'),false);
});

test('state retains exact classification strings, companies and additional metrics',()=>{
 const state=parseState('#indicator=roe&companies=TAISEI,TAISEI&from=2015&to=2025&reference=t&compare=roe,profit&graph=overlay&coordinates='+encodeURIComponent(JSON.stringify({cat01:'001',tab:'300'})),['roe','profit'],['TAISEI'],['t']);
 assert.deepEqual(state.companies,['TAISEI']);assert.deepEqual(state.compare,['profit']);assert.deepEqual(state.coordinates,{cat01:'001',tab:'300'});
 assert.deepEqual(parseState('#'+stateHash(state),['roe','profit'],['TAISEI'],['t']),state);
 assert.deepEqual(classificationCoordinates({defaultSelection:{cat01:'001',tab:'300'},dimensions:[{apiKey:'time',values:[]},{apiKey:'cat01',name:'地域',values:[{code:'001'}]},{apiKey:'tab',name:'項目',values:[{code:'300'}]}]}),{cat01:'001',tab:'300'});
 assert.throws(()=>classificationCoordinates({defaultSelection:{},dimensions:[{apiKey:'area',name:'地域',values:[{code:'001'}]}]}));
});

test('original reference values never acquire verified badges or exact fiscal dates',()=>{
 const base={reference:true,numericValue:0,status:'confirmed_value',implicitNumericZero:false,year:2021,factId:'ref:2021'};
 assert.equal(cellDisplay(base).state,'reference');assert.equal(cellDisplay(base).status,'not_reviewed');
 assert.equal(cellDisplay({...base,implicitNumericZero:true}).state,'implicit_zero');
 assert.equal(cellDisplay({...base,numericValue:null,status:'missing'}).state,'missing');
 assert.equal(cellDisplay({...base,numericValue:null,status:'not_disclosed'}).text,'原記録あり・範囲未確認');
 assert.equal(cellDisplay({...base,numericValue:null,status:'publication_pending'}).text,'公表待ち');
 assert.equal(cellDisplay(undefined).state,'unloaded');
 const series={id:'reference',metricId:'roe',companyId:'TAISEI',kind:'reference',points:[base],unit:'%'};
 assert.equal(pointsFor([series],'roe',['TAISEI'],2021,2025)[0].periodStart,undefined);
 assert.equal(analysisFor([series],'roe',['TAISEI'],2021,2025).ok,false);
 const chart=renderLineChart([{unit:'%',metric:'roe',points:[{...base,series}]}],{from:2021,to:2025,primary:{id:'roe',unit:'%',name:'ROE'}});
 assert.match(chart,/circle/);assert.doesNotMatch(chart,/出典確認済み/);assert.doesNotMatch(chart,/2021年度/);
 const implied=renderLineChart([{unit:'%',metric:'roe',points:[{...base,implicitNumericZero:true,series}]}],{from:2021,to:2025,primary:{id:'roe',unit:'%',name:'ROE'}});
 assert.doesNotMatch(implied,/<circle/);
});

test('existing reviewed packet remains byte exact and math gates stay in force',async()=>{
 const bytes=await readFile(path.join(root,'public/system/buildbase/source-verified-comparison.json'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'c8bf526280fa4192cef0de5852ddf8d95bfcf58cecd53e1e50a6da9fe27d4fb6');
 const series=await validatedPacket(JSON.parse(bytes));assert.equal(series.length,8);assert.equal(series.flatMap(s=>s.points).length,20);
 assert.equal(analysisFor(series,'consolidated_gross_profit_reported',['OBAYASHI','KAJIMA'],2021,2023).ok,true);
 assert.equal(analysisFor(series,'consolidated_gross_profit_reported',['OBAYASHI','KAJIMA'],2021,2025).ok,false);
});

test('published baseline retains all tables and loads only requested gzip series',async t=>{
 const dataRoot=process.env.ATLAS_PUBLIC_DATA_ROOT||path.join(root,'public');
 try{await access(path.join(dataRoot,'system/catalog.json'));}catch{t.skip('Mount the unchanged public baseline or set ATLAS_PUBLIC_DATA_ROOT');return;}
 const previousFetch=globalThis.fetch,previousWindow=globalThis.window;const requests=[];
 globalThis.window={__ATLAS_EXPLORER__:{base:'/mlit-statistics-dashboard/'}};
 globalThis.fetch=async url=>{assert.ok(url.startsWith('/mlit-statistics-dashboard/system/')||url==='/mlit-statistics-dashboard/explorer/search-index.json.gz');const rel=url.slice('/mlit-statistics-dashboard/'.length);requests.push(rel);return new Response(await readFile(path.join(rel.startsWith('explorer/')?path.join(root,'public'):dataRoot,rel)));};
 try{
 const index=await loadPublicIndex();assert.equal(index.tables.length,236);assert.equal(index.indicators.length,65);assert.equal(index.companies.length,21);
 assert.equal(requests.filter(p=>p.includes('/shards/')).length,0);
 const company=await loadOriginalSeries(index,'buildbase-company-annual',{cat01:'TAISEI',tab:'operating_income_consolidated'});
 assert.equal(company.id,'2ad22ddc078d85c9d2e8c8d434fe9be3');assert.equal(company.points.length,11);assert.equal(company.automaticComparisonAllowed,false);
 assert.equal(company.points.filter(p=>p.numericValue!==null).length,11);assert.equal(company.points[0].periodStart,undefined);assert.equal(cellDisplay(company.points[0]).state,'reference');
 const exported=csvRowsForPoints(company.points.map(p=>({...p,series:company})));const row=Object.fromEntries(exported.headers.map((key,i)=>[key,exported.rows[0][i]]));assert.equal(row.period_start,'');assert.equal(row.period_end,'');assert.equal(row.display_status,'not_reviewed');assert.equal(row.fact_id,'');assert.equal(row.raw_status,'confirmed_value');assert.equal(row.classification_codes,JSON.stringify({tab:'operating_income_consolidated',cat01:'TAISEI'}));assert.equal(row.source_url,company.source.sourceUrl);assert.equal(row.retrieved_at,company.source.retrievedAt);assert.equal(row.cycle,'年度次');
 assert.match(company.source.sourceUrl,/buildbase-data/);assert.ok(company.source.retrievedAt);assert.equal(company.sourceId,'buildbase:public-company-disclosures');
 const infr=await loadOriginalSeries(index,'buildbase-company-annual',{cat01:'INFR',tab:'operating_income_consolidated'});
 assert.equal(infr.points.find(p=>p.timeCode==='2025100000').status,'not_disclosed');
 assert.equal(infr.points.find(p=>p.timeCode==='2015100000').status,'missing');assert.equal(infr.points.find(p=>p.timeCode==='2015100000').numericValue,null);
 const pending=await loadOriginalSeries(index,'buildbase-company-annual',{cat01:'ANDO_HAZAMA',tab:'architecture_engineers_1st_class'});
 assert.equal(cellDisplay(pending.points.find(p=>p.timeCode==='2025100000')).text,'公表待ち');
 const market=await loadOriginalSeries(index,'0003126265');assert.equal(market.id,'407bddad7b286e8b732f3c38d5ecb171');assert.deepEqual(market.coordinates,{tab:'300',cat01:'300',cat02:'370'});assert.ok(market.points.some(p=>cellDisplay(p).state==='reference'));
 const undisclosed=await loadOriginalSeries(index,'buildbase-company-annual',{cat01:'TODA',tab:'building_orders_use_office'});assert.equal(undisclosed.points.every(p=>cellDisplay(p).text==='原記録あり・範囲未確認'),true);
 const annual=await loadOriginalSeries(index,'file-00450071-construction-annual',{tab:'01'});assert.ok(annual.points.length);assert.ok(annual.source.sourceUrl);assert.ok(annual.source.retrievedAt);
 const monthly=await loadOriginalSeries(index,'0003119745',{tab:'12',cat01:'11'});assert.equal(monthly.points[0].timeCode,'2013000101');assert.ok(monthly.points.every(p=>p.periodStart===undefined));assert.ok(monthly.points.some(p=>p.timeLabel.includes('月')));assert.ok(monthly.points.some(p=>cellDisplay(p).state==='reference'));
 assert.equal(requests.filter(p=>p.includes('/shards/')).length,7);assert.ok(index.tables.some(t=>t.searchText.includes('工場')));
 assert.equal(await publicSeriesId('0003126265',{cat02:'370',tab:'300',cat01:'300'}),market.id);
 }finally{globalThis.fetch=previousFetch;globalThis.window=previousWindow;}
});

test('browser math modules match the shared implementation',async()=>{for(const name of ['statistics-workbench.mjs','statistics-series-compare.mjs','buildbase-verified-comparison.mjs','buildbase-contract-hash.mjs'])assert.deepEqual(await readFile(path.join(root,'public/explorer/lib',name)),await readFile(path.join(root,'lib',name)));});

test('host sandbox permits the local classification form and its submit stays inside the explorer',async()=>{
 const host=await readFile(path.join(root,'components/AtlasExplorer.tsx'),'utf8');
 const sandbox=host.match(/sandbox="([^"]+)"/)?.[1].split(' ')||[];
 assert.ok(sandbox.includes('allow-forms'));
 const app=await readFile(path.join(root,'public/explorer/app.mjs'),'utf8');
 assert.match(app,/<form id="reference-conditions" data-reference-table=/);
 assert.match(app,/document\.addEventListener\('submit',e=>\{if\(e\.target\.id!=='reference-conditions'\)return;e\.preventDefault\(\);state\.reference=/);
 assert.doesNotMatch(app,/<form[^>]*\baction=/);
});

test('every raw-reference status remains outside verified counts and market tuples remain references',()=>{
 for(const status of ['confirmed_value','missing','not_disclosed','publication_pending','on_hold','unverified','not_applicable','suppressed','extraction_failed','not_reviewed','unavailable','available','valid',null]){
 const point={reference:true,year:2021,status,numericValue:7,implicitNumericZero:false};
 assert.equal(isConfirmed(point),false,String(status));assert.notEqual(cellDisplay(point).state,'confirmed');assert.notEqual(cellDisplay(point).status,'confirmed_value');
 }
 assert.equal(marketPointDisplay(['2021000000',7,null,null,null]).state,'reference');
 assert.equal(marketPointDisplay(['2021000000',null,null,null,'not_disclosed']).state,'unverified_disclosure_scope');
});

test('original codes control period years and unresolved records stay in raw exports without inferred dates',()=>{
 assert.equal(originalPeriodYear({code:'2021100000',name:'令和3年度'}),2021);
 assert.equal(originalPeriodYear({code:'2021100000',name:'2022年3月期'}),2021);
 assert.equal(originalPeriodYear({code:'2021000000',name:'2021年'}),2021);
 assert.equal(originalPeriodYear({code:'unknown',name:'2021年度'}),2021);
 assert.equal(originalPeriodYear({code:'unknown',name:'2022年3月期'}),null);
 assert.equal(originalPeriodYear({code:'unknown',name:'令和3年度'}),null);
 const series={id:'ref',metricId:'m',companyId:'c',kind:'reference',unit:'人',points:[{reference:true,year:null,timeCode:'unknown',timeLabel:'令和3年度',numericValue:7,status:'confirmed_value',factId:'ref:unknown'}]};
 const points=pointsFor([series],'m',['c'],2021,2025);assert.equal(points.length,1);assert.equal(points[0].year,null);assert.equal(pointInYearRange(points[0],2021,2025),true);assert.equal(isPlottable(points[0]),false);
 const {headers,rows}=csvRowsForPoints(points);const exported=Object.fromEntries(headers.map((key,i)=>[key,rows[0][i]]));assert.equal(exported.time_code,'unknown');assert.equal(exported.time_label,'令和3年度');assert.equal(exported.numeric_value,7);assert.equal(exported.period_start,'');assert.equal(exported.period_end,'');
});

test('CSV retains verified disclosure scope and unchecked combination records independently',()=>{
 const disclosureScope={verified:true,description:'資料Xの特定項目、2021年度'};
 const scoped={year:2021,status:'not_disclosed',numericValue:null,disclosureScope,series:{id:'s',unit:'人'}};
 const original={reference:true,year:2021,status:'missing',numericValue:null,rawTuple:null,recordedComboStatus:'not_disclosed',series:{id:'r',unit:'人',recordedStatus:'not_disclosed'}};
 assert.equal(cellDisplay(original).text,'原記録あり・範囲未確認');assert.notEqual(cellDisplay(original).status,'scoped_not_disclosed');
 const {headers,rows}=csvRowsForPoints([scoped,original]);
 assert.equal(rows[0][headers.indexOf('disclosure_scope')],JSON.stringify(disclosureScope));assert.equal(rows[0][headers.indexOf('display_status')],'scoped_not_disclosed');
 assert.equal(rows[1][headers.indexOf('recorded_combo_status')],'not_disclosed');assert.equal(rows[1][headers.indexOf('display_status')],'unverified_record_scope');
});

test('source links allow HTTPS and preserve rejected schemes as non-executable text',()=>{
 assert.equal(safeHttpsSourceUrl('https://www.e-stat.go.jp/dbview?sid=0003126265'),'https://www.e-stat.go.jp/dbview?sid=0003126265');
 for(const url of ['javascript:alert(1)','data:text/html,test','http://example.test/','https://user:pass@example.test/','not a url']){assert.equal(safeHttpsSourceUrl(url),null);assert.doesNotMatch(sourceLink(url,'公開元'),/<a |href=/);}
 assert.match(sourceLink('https://example.test/','公開元'),/href="https:\/\/example.test\/"/);
});

test('missing shard with a combination record retains unchecked scope in cells and CSV',async()=>{
 const previousFetch=globalThis.fetch,previousWindow=globalThis.window;
 const tableId='_fixture-reference-scope',meta={table:{id:tableId,datasetId:'fixture',title:'原表',cycle:'年次',sourceUrl:'https://example.test/source'},dimensions:[{apiKey:'tab',name:'項目',values:[{code:'foo'}]},{apiKey:'time',name:'年',values:[{code:'2021000000',name:'2021年'},{code:'unknown',name:'元の期間'}]}],defaultSelection:{tab:'foo'},availabilityUrl:'system/tables/'+tableId+'/availability.json.gz',seriesBundleUrlTemplate:'system/shards/fixture-{prefix}.json.gz',seriesBundlePrefixLength:2,implicitNumericZero:false};
 const index={catalog:{tables:[{id:tableId,metaUrl:'system/tables/'+tableId+'/meta.json.gz'}],datasets:[{id:'fixture',fiscalYearFrom:2021}],sources:{[tableId]:{sourceId:'fixture-source',sourceUrl:'https://example.test/source',retrievedAt:'2026-10-14'}}}};
 globalThis.window={__ATLAS_EXPLORER__:{base:'/'}};
 globalThis.fetch=async url=>url.includes('/shards/')?new Response('',{status:404}):new Response(gzipSync(JSON.stringify(url.includes('/availability.')?{combos:{'tab=foo':'not_disclosed'}}:meta)));
 try{const result=await loadOriginalSeries(index,tableId);assert.equal(result.points.length,2);assert.equal(result.recordedStatus,'not_disclosed');assert.ok(result.points.every(p=>cellDisplay(p).text==='原記録あり・範囲未確認'));assert.ok(result.points.every(p=>!isConfirmed(p)));assert.equal(result.points[1].year,null);const {headers,rows}=csvRowsForPoints(result.points.map(p=>({...p,series:result})));assert.ok(rows.every(row=>row[headers.indexOf('recorded_combo_status')]==='not_disclosed'));assert.ok(rows.every(row=>row[headers.indexOf('disclosure_scope')]===''));}
 finally{globalThis.fetch=previousFetch;globalThis.window=previousWindow;}
});
