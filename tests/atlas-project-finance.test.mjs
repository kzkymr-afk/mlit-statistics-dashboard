import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {publicDataUrl} from '../public/explorer/public-data.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateProjectFinance,selectProjects,renderProjectFinance} from '../public/workspace/project-finance.mjs';
import {acceptedWorkspaceHash} from '../lib/atlas-workspace-bridge.mjs';
const fixture=()=>({schemaVersion:1,datasetId:'buildbase-project-finance-navigation',companies:[{companyId:'A',companyName:'会社A'}],projects:[{projectObservationId:'p1',companyId:'A',name:'<img onerror=alert(1)>',sourceReportingFiscalYear:'2025'},{projectObservationId:'p2',companyId:'A',name:'年度なし',sourceReportingFiscalYear:null}],projectDimensions:[{projectObservationId:'p1',kind:'usage',value:'事務所',valueStatus:'source_stated'},{projectObservationId:'p1',kind:'region',value:'東京',valueStatus:'source_stated'}],projectEvents:[],financialContexts:[{financialPeriodId:'f1',companyId:'A',fiscalYear:'2025'},{financialPeriodId:'f2',companyId:'A',fiscalYear:'2025'}],financialRecords:[],projectFinancialRelations:['f1','f2'].map(f=>({projectObservationId:'p1',financialPeriodId:f,relationKind:'source_reporting_context',financialAttributionAllowed:false})),permissions:{financialAttributionAllowed:false,automaticComparisonAllowed:false,automaticAggregationAllowed:false,canonicalFactPromotionAllowed:false,publicationAllowed:false}});
test('project count is distinct before multiple finance contexts and missing years stay unknown',()=>{
 const a=validateProjectFinance(fixture());assert.equal(selectProjects(a).projectCount,2);assert.equal(selectProjects(a).relationCount,2);
 assert.equal(selectProjects(a,{year:'2025',usage:'事務所',region:'東京'}).projectCount,1);
 assert.equal(selectProjects(a,{year:'unknown'}).projects[0].projectObservationId,'p2');
 assert.equal(selectProjects(a,{year:'2024'}).projectCount,0);
});
test('relation references and permissions fail closed',()=>{
 for(const mutate of [a=>a.financialContexts[0].companyId='OTHER',a=>a.financialContexts[0].fiscalYear='2024',a=>a.permissions.automaticAggregationAllowed=true,a=>a.projects.push(a.projects[0]),a=>a.projectFinancialRelations[0].financialPeriodId='missing',a=>a.projectFinancialRelations[0].financialAttributionAllowed=true]){const a=fixture();mutate(a);assert.throws(()=>validateProjectFinance(a));}
});
test('render escapes source claims and preserves project caveats',()=>{
 const html=renderProjectFinance(fixture());assert.ok(!html.includes('<img onerror'));assert.match(html,/&lt;img/);assert.match(html,/資料の報告年度/);assert.match(html,/全案件の母集団/);assert.match(html,/案件の会計帰属/);assert.match(html,/AI参照用JSON/);
});
test('projects view is wired through same-origin workspace and static base path',()=>{
 assert.equal(acceptedWorkspaceHash('#projects'),'#projects');
 const app=readFileSync(new URL('../public/workspace/app.mjs',import.meta.url),'utf8');
 assert.match(app,/fetchPublicJson\('explorer\/project-finance.json.gz'\)/);assert.match(app,/hash==='#projects'/);
 const doc=readFileSync(new URL('../lib/atlas-workspace-document.mjs',import.meta.url),'utf8');assert.match(doc,/data-nav=.*projects/);
});
test('saved source export preserves 230 observations, unknown94 and finance grains',()=>{
 const a=validateProjectFinance(JSON.parse(gunzipSync(readFileSync(new URL('../public/explorer/project-finance.json.gz',import.meta.url)))));
 assert.equal(a.projects.length,230);assert.equal(a.financialRecords.length,2904);assert.equal(a.projectFinancialRelations.length,1574);
 assert.equal(selectProjects(a,{year:'unknown'}).projectCount,94);
 assert.equal(selectProjects(a,{year:'2025'}).projectCount,120);
 const html=renderProjectFinance(a);assert.ok(!html.includes('[object Object]'));
 const serialized=JSON.stringify(a);assert.ok(!/\/Volumes\/|\/Users\/|file:\/\//.test(serialized));
 for(const p of a.projects){assert.equal(p.financialAttributionAllowed,false);}
});

test('project asset URL is explicit and rejects traversal',()=>{assert.equal(publicDataUrl('explorer/project-finance.json.gz','/atlas'),'/atlas/explorer/project-finance.json.gz');assert.throws(()=>publicDataUrl('explorer/../project-finance.json.gz','/atlas'));});

test('name-derived unreviewed location never enters confirmed filters',()=>{const a=fixture();a.projectDimensions.push({projectObservationId:'p2',kind:'region',value:'メキシコ',valueStatus:'unreviewed'});assert.equal(selectProjects(a,{region:'メキシコ'}).projectCount,0);assert.ok(!renderProjectFinance(a).includes('<option value="メキシコ"'));});
