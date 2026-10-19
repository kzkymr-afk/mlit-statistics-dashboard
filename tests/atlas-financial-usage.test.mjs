import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {validateFinancialUsageAsset,filterFinancialUsage,renderFinancialUsage} from '../public/workspace/financial-usage.mjs';

const asset=JSON.parse(gunzipSync(readFileSync(new URL('../public/explorer/financial-usage.json.gz',import.meta.url))));
const catalog=JSON.parse(readFileSync(new URL('../public/explorer/financial-usage.catalog.json',import.meta.url)));

test('financial view carries 1,400 original values with only bounded review status',async()=>{
 await validateFinancialUsageAsset(asset,catalog);
 assert.equal(asset.records.length,1400);
 assert.equal(asset.partitionCounts.automatic,20);
 assert.equal(asset.partitionCounts.annotated_comparison,994);
 assert.equal(asset.partitionCounts.individual_counterpart_waiting,332);
 assert.equal(asset.partitionCounts.annotated_comparison+asset.partitionCounts.individual_counterpart_waiting,1326);
 assert.equal(asset.schemaVersion,2);
 assert.equal(asset.records.filter(r=>r.currentYearSeriesRestrictions).length,263);
 assert.equal(asset.permissions.historicalSourceCellsPublished,false);
 assert.equal(asset.partitionCounts.prohibited_total_NetAssets_alias,1);
 assert.equal(asset.partitionCounts.unreviewed,0);
 assert.equal(new Set(asset.records.map(r=>r.companyId)).size,19);
 assert.equal(asset.permissions.newComparisonPermissionCreated,false);
 assert.equal(asset.permissions.automaticAggregationAllowed,false);
 assert.equal(JSON.stringify(asset).match(/\/Volumes\/|\/Users\/|file:\/\/|data\/raw\/|https?:\/\/github\.com\//i),null);
 assert.equal(JSON.stringify(asset).includes('reviewed_source_cell_v2:'),false);
 assert.equal(JSON.stringify(asset).includes('historical_points'),false);
});

test('financial search and record detail retain original conditions and source',()=>{
 const forbidden=asset.records.find(r=>r.bucket==='prohibited_total_NetAssets_alias');
 assert.ok(forbidden);
 const found=filterFinancialUsage(asset,{company:forbidden.companyId,bucket:forbidden.bucket,query:forbidden.id});
 assert.deepEqual(found.map(r=>r.id),[forbidden.id]);
 const html=renderFinancialUsage(asset,{company:forbidden.companyId,bucket:forbidden.bucket,query:forbidden.id});
 assert.match(html,/総純資産への同一視禁止/);
 assert.ok(html.includes(forbidden.source.sha256));
 assert.ok(html.includes(forbidden.source.documentName));
 assert.ok(html.includes(forbidden.period.asOf||forbidden.period.end||forbidden.period.originalLabel));
 assert.ok(html.includes('公式資料を開く'));
 assert.equal(html.includes('data-financial-page="1"'),true);
 const haseko=asset.records.find(r=>r.id==='066a2a4b5f097a005c1aca209ac29f50c8c55993b5ef9328f8eb94b1e7e89107');
 assert.equal(haseko.bucket,'annotated_comparison');
 assert.match(renderFinancialUsage(asset,{query:haseko.id}),/Named FY2024\/FY2025 special-order/);
});

test('financial validator rejects changed values, permission, or unsafe source',async()=>{
 const tampered=structuredClone(asset);
 tampered.records[0].value='0';
 await assert.rejects(validateFinancialUsageAsset(tampered,catalog));
 const widened=structuredClone(asset);
 widened.permissions.newComparisonPermissionCreated=true;
 await assert.rejects(validateFinancialUsageAsset(widened,catalog));
 const seriesTampered=structuredClone(asset);
 seriesTampered.records.find(r=>r.currentYearSeriesRestrictions).currentYearSeriesRestrictions.currentYearBasisTransferAllowed=true;
 await assert.rejects(validateFinancialUsageAsset(seriesTampered,catalog));
 const ledgerTampered=structuredClone(asset);
 ledgerTampered.sourceLedgerSha256.usage='0'.repeat(64);
 await assert.rejects(validateFinancialUsageAsset(ledgerTampered,catalog));
 const leaked=structuredClone(asset);
 leaked.records[0].source.url='https://github.com/private/report';
 await assert.rejects(validateFinancialUsageAsset(leaked,catalog));
});
