import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {projectQuarterlyFinancials,selectQuarterlySourceRows,quarterlyPublicSchema,quarterlyCoverageCsv,projectQuarterlyCurrentnessSupplement,assertQuarterlyCohortExport} from '../lib/atlas-quarterly-projection.mjs';
import {QUARTER_DOCUMENT_REGISTRY,QUARTER_METRIC_NAMES,quarterlyRecordCounts} from '../public/explorer/quarterly-data.mjs';
const [sourceRoot,coverageFile,cohortFile]=process.argv.slice(2);
if(!sourceRoot||!coverageFile)throw Error('Pass read-only Source root and bounded 21-company coverage JSON. No DB is opened.');
const rows=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(l=>JSON.parse(l));
const selected=selectQuarterlySourceRows(rows);
for(const doc of QUARTER_DOCUMENT_REGISTRY){
 const file=selected.find(r=>r.extractor_version===doc.extractorVersion&&r.source_file_sha256===doc.sha256)?.source_file;
 if(!file||!/^data\/raw\/company_factbooks\/(?:kitano_ir_documents|obayashi_databook_documents|kajima_factbook_all_documents|kajima_quarterly_order_documents|haseko_presentation_documents|ando_hazama_quarterly_2026_documents)\/[A-Za-z0-9_-]+\.pdf$/.test(file))throw Error('Source金融PDF参照を確認できません。');
 const sha=createHash('sha256').update(await readFile(path.join(sourceRoot,file))).digest('hex');if(sha!==doc.sha256)throw Error('Source金融PDF原本hashが一致しません。');
}
const sourceCohortExport=await assertQuarterlyCohortExport(JSON.parse(await readFile(cohortFile||path.join(sourceRoot,'data/ai_haseko_ah_quarterly/export.json'),'utf8')),selected);
const currentnessSupplement=projectQuarterlyCurrentnessSupplement((await readFile(path.join(sourceRoot,'data/marts/public_disclosures/source_currentness_checks.jsonl'),'utf8')).trim().split('\n').map(JSON.parse));
const currentnessSupplementHash=await import('../lib/buildbase-contract-hash.mjs').then(({canonicalSha256})=>canonicalSha256(currentnessSupplement));
const asset=await projectQuarterlyFinancials(rows,JSON.parse(await readFile(coverageFile,'utf8')));
const compressed=gzipSync(JSON.stringify(asset),{mtime:0});
const output=path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))),'public/explorer');
const catalog={schemaVersion:1,datasetId:asset.payload.datasetId,projectionHash:asset.projectionHash,sourceSubsetHash:asset.payload.origin.sourceSubsetHash,compressedSha256:createHash('sha256').update(compressed).digest('hex'),dataUrl:'explorer/quarterly-financials.json.gz',schemaUrl:'explorer/quarterly-financials.schema.json',coverageCsvUrl:'explorer/quarterly-coverage.csv',...quarterlyRecordCounts(asset.payload.records),companyCount:asset.payload.companies.length,coverageCompanyCount:asset.payload.companies.length,unreviewedCompanyCount:asset.payload.companies.filter(c=>c.status==='not_reviewed').length,sourceDocumentCount:QUARTER_DOCUMENT_REGISTRY.length,sourceCohortExport,currentnessSupplement,currentnessSupplementHash,companies:asset.payload.companies,metrics:[...new Set(asset.payload.records.map(r=>r.metric_id))].sort().map(id=>({metricId:id,name:QUARTER_METRIC_NAMES[id]}))};
await writeFile(path.join(output,'quarterly-financials.json.gz'),compressed);
await writeFile(path.join(output,'quarterly-financials.catalog.json'),JSON.stringify(catalog,null,2)+'\n');
await writeFile(path.join(output,'quarterly-financials.schema.json'),JSON.stringify(quarterlyPublicSchema(),null,2)+'\n');
await writeFile(path.join(output,'quarterly-coverage.csv'),quarterlyCoverageCsv(asset.payload.companies));
console.log(JSON.stringify({...quarterlyRecordCounts(asset.payload.records),companyCount:asset.payload.companies.length,compressedBytes:compressed.length,projectionHash:asset.projectionHash,sourceSubsetHash:catalog.sourceSubsetHash,compressedSha256:catalog.compressedSha256}));
