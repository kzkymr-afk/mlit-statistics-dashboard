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
 assert.equal(asset.partitionCounts.annotated_comparison+asset.partitionCounts.individual_counterpart_waiting,1326);
 assert.equal(asset.partitionCounts.prohibited_total_NetAssets_alias,1);
 assert.equal(asset.partitionCounts.unreviewed,0);
 assert.equal(new Set(asset.records.map(r=>r.companyId)).size,19);
 assert.equal(asset.permissions.newComparisonPermissionCreated,false);
 assert.equal(asset.permissions.automaticAggregationAllowed,false);
 assert.equal(JSON.stringify(asset).match(/\/Volumes\/|\/Users\/|file:\/\/|data\/raw\/|https?:\/\/github\.com\//i),null);
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
});

test('financial validator rejects changed values, permission, or unsafe source',async()=>{
 const tampered=structuredClone(asset);
 tampered.records[0].value='0';
 await assert.rejects(validateFinancialUsageAsset(tampered,catalog));
 const widened=structuredClone(asset);
 widened.permissions.newComparisonPermissionCreated=true;
 await assert.rejects(validateFinancialUsageAsset(widened,catalog));
 const leaked=structuredClone(asset);
 leaked.records[0].source.url='https://github.com/private/report';
 await assert.rejects(validateFinancialUsageAsset(leaked,catalog));
});
