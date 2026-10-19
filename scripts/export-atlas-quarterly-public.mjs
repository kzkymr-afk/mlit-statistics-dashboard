import {STATEMENT_PROFILES} from '../public/explorer/quarterly-statement-registry.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {projectQuarterlyFinancials,selectQuarterlySourceRows,quarterlyPublicSchema,quarterlyCoverageCsv,projectQuarterlyCurrentnessSupplement,assertQuarterlyCohortExport,assertStatementCohortExport,QUARTER_COHORT_SOURCES} from '../lib/atlas-quarterly-projection.mjs';
import {QUARTER_DOCUMENT_REGISTRY,QUARTER_METRIC_NAMES,quarterlyRecordCounts,QUARTER_PERIOD_COMPANION_REGISTRY} from '../public/explorer/quarterly-data.mjs';
const [sourceRoot,coverageFile,cohortFile,nextCohortFile,zkCohortFile,inCohortFile,stCohortFile]=process.argv.slice(2);
if(!sourceRoot||!coverageFile)throw Error('Pass read-only Source root and bounded 21-company coverage JSON. No DB is opened.');
const rows=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(l=>JSON.parse(l));
const selected=selectQuarterlySourceRows(rows);
for(const doc of QUARTER_DOCUMENT_REGISTRY){
 const file=selected.find(r=>r.extractor_version===doc.extractorVersion&&r.source_file_sha256===doc.sha256)?.source_file;
 if(!file||!/^data\/raw\/company_factbooks\/(?:kitano_ir_documents|obayashi_databook_documents|kajima_factbook_all_documents|kajima_quarterly_order_documents|haseko_presentation_documents|ando_hazama_quarterly_2026_documents|okumura_results_documents|asanuma_library_documents|zenitaka_library_documents|kumagai_results_documents|kumagai_quarter_statement_2026_documents|infr_quarterly_statement_2026_documents|nishimatsu_quarter_statement_2026_documents|shimizu_quarter_statement_2026_documents|toda_quarter_statement_2026_documents|toa_quarter_statement_2026_documents|matsui_quarter_statement_2026_documents|penta_quarter_statement_2026_documents|taisei_quarter_statement_2026_documents|takenaka_halfyear_release_2025_documents|tokyu_quarter_statement_2026_documents|smcc_quarter_statement_2026_documents|official_quarter_evidence_20261019)\/[A-Za-z0-9_-]+\.pdf$/.test(file))throw Error('Source金融PDF参照を確認できません。');
 const sha=createHash('sha256').update(await readFile(path.join(sourceRoot,file))).digest('hex');if(sha!==doc.sha256)throw Error('Source金融PDF原本hashが一致しません。');
}
const sourceCohortExports=await Promise.all(QUARTER_COHORT_SOURCES.map(async(profile,i)=>assertQuarterlyCohortExport(JSON.parse(await readFile([cohortFile,nextCohortFile,zkCohortFile,inCohortFile,stCohortFile][i]||path.join(sourceRoot,profile.exportPath),'utf8')),selected)));
const statementCohortExports=await Promise.all(STATEMENT_PROFILES.map(async p=>assertStatementCohortExport(JSON.parse(await readFile(path.join(sourceRoot,p.exportPath),'utf8')),selected)));
const sourceCohortExport=sourceCohortExports[0];
for(const doc of QUARTER_PERIOD_COMPANION_REGISTRY){
 const companion=selected.find(r=>r.period_companion?.sha256===doc.sha256)?.period_companion;const file=companion?.file;
 if(!file||!/^data\/raw\/company_factbooks\/(?:asanuma_quarter_statement_documents|kumagai_quarter_statement_2026_documents)\/[A-Za-z0-9_-]+\.pdf$/.test(file)||companion.official_url!==doc.sourceUrl||createHash('sha256').update(await readFile(path.join(sourceRoot,file))).digest('hex')!==doc.sha256)throw Error('期間根拠PDFの公式URL・原本hashが一致しません。');
}
const currentnessSupplement=projectQuarterlyCurrentnessSupplement((await readFile(path.join(sourceRoot,'data/marts/public_disclosures/source_currentness_checks.jsonl'),'utf8')).trim().split('\n').map(JSON.parse));
const currentnessSupplementHash=await import('../lib/buildbase-contract-hash.mjs').then(({canonicalSha256})=>canonicalSha256(currentnessSupplement));
const asset=await projectQuarterlyFinancials(rows,JSON.parse(await readFile(coverageFile,'utf8')));
const compressed=gzipSync(JSON.stringify(asset),{mtime:0});
const output=path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))),'public/explorer');
const catalog={schemaVersion:1,datasetId:asset.payload.datasetId,projectionHash:asset.projectionHash,sourceSubsetHash:asset.payload.origin.sourceSubsetHash,compressedSha256:createHash('sha256').update(compressed).digest('hex'),dataUrl:'explorer/quarterly-financials.json.gz',schemaUrl:'explorer/quarterly-financials.schema.json',coverageCsvUrl:'explorer/quarterly-coverage.csv',...quarterlyRecordCounts(asset.payload.records),numericRecordCount:asset.payload.records.filter(r=>Number.isFinite(r.value)).length,heldReferenceCount:asset.payload.records.filter(r=>r.record_kind==='held_reference').length,companyCount:asset.payload.companies.length,coverageCompanyCount:asset.payload.companies.length,unreviewedCompanyCount:asset.payload.companies.filter(c=>c.status==='not_reviewed').length,sourceDocumentCount:QUARTER_DOCUMENT_REGISTRY.length,sourceCohortExport,sourceCohortExports,statementCohortExports,periodCompanionDocumentCount:QUARTER_PERIOD_COMPANION_REGISTRY.length,periodCompanionDocuments:asset.payload.origin.periodCompanionDocuments,currentnessSupplement,currentnessSupplementHash,companies:asset.payload.companies,metrics:[...new Set(asset.payload.records.map(r=>r.metric_id))].sort().map(id=>({metricId:id,name:QUARTER_METRIC_NAMES[id]}))};
await writeFile(path.join(output,'quarterly-financials.json.gz'),compressed);
await writeFile(path.join(output,'quarterly-financials.catalog.json'),JSON.stringify(catalog,null,2)+'\n');
await writeFile(path.join(output,'quarterly-financials.schema.json'),JSON.stringify(quarterlyPublicSchema(),null,2)+'\n');
await writeFile(path.join(output,'quarterly-coverage.csv'),quarterlyCoverageCsv(asset.payload.companies));
console.log(JSON.stringify({...quarterlyRecordCounts(asset.payload.records),companyCount:asset.payload.companies.length,compressedBytes:compressed.length,projectionHash:asset.projectionHash,sourceSubsetHash:catalog.sourceSubsetHash,compressedSha256:catalog.compressedSha256}));
