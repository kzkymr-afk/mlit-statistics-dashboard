import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {projectQuarterlyFinancials,selectQuarterlySourceRows,quarterlyPublicSchema,quarterlyCoverageCsv} from '../lib/atlas-quarterly-projection.mjs';
import {QUARTER_DOCUMENTS,QUARTER_METRIC_NAMES} from '../public/explorer/quarterly-data.mjs';
const [sourceRoot,coverageFile]=process.argv.slice(2);
if(!sourceRoot||!coverageFile)throw Error('Pass read-only Source root and bounded 21-company coverage JSON. No DB is opened.');
const rows=(await readFile(path.join(sourceRoot,'data/marts/public_disclosures/facts_effective.jsonl'),'utf8')).trim().split('\n').map(l=>JSON.parse(l));
const selected=selectQuarterlySourceRows(rows);
for(const [extractor,doc] of Object.entries(QUARTER_DOCUMENTS)){
 const file=selected.find(r=>r.extractor_version===extractor)?.source_file;
 if(!file||!/^data\/raw\/company_factbooks\/kitano_ir_documents\/[A-Za-z0-9_-]+\.pdf$/.test(file))throw Error('Source金融PDF参照を確認できません。');
 const sha=createHash('sha256').update(await readFile(path.join(sourceRoot,file))).digest('hex');if(sha!==doc.sha256)throw Error('Source金融PDF原本hashが一致しません。');
}
const asset=await projectQuarterlyFinancials(rows,JSON.parse(await readFile(coverageFile,'utf8')));
const compressed=gzipSync(JSON.stringify(asset),{mtime:0});
const output=path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))),'public/explorer');
const catalog={schemaVersion:1,datasetId:asset.payload.datasetId,projectionHash:asset.projectionHash,sourceSubsetHash:asset.payload.origin.sourceSubsetHash,compressedSha256:createHash('sha256').update(compressed).digest('hex'),dataUrl:'explorer/quarterly-financials.json.gz',schemaUrl:'explorer/quarterly-financials.schema.json',coverageCsvUrl:'explorer/quarterly-coverage.csv',recordCount:113,q3RecordCount:105,q1RecordCount:8,companyCount:21,coverageCompanyCount:21,recordedCompanyCount:1,sourceDocumentCount:2,companies:asset.payload.companies,metrics:[...new Set(asset.payload.records.map(r=>r.metric_id))].sort().map(id=>({metricId:id,name:QUARTER_METRIC_NAMES[id]}))};
await writeFile(path.join(output,'quarterly-financials.json.gz'),compressed);
await writeFile(path.join(output,'quarterly-financials.catalog.json'),JSON.stringify(catalog,null,2)+'\n');
await writeFile(path.join(output,'quarterly-financials.schema.json'),JSON.stringify(quarterlyPublicSchema(),null,2)+'\n');
await writeFile(path.join(output,'quarterly-coverage.csv'),quarterlyCoverageCsv(asset.payload.companies));
console.log(JSON.stringify({recordCount:113,q3:105,q1:8,companyCount:21,compressedBytes:compressed.length,projectionHash:asset.projectionHash,sourceSubsetHash:catalog.sourceSubsetHash,compressedSha256:catalog.compressedSha256}));
