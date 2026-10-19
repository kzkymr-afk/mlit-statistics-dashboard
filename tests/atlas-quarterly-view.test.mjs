import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {quarterlyCsv} from '../public/explorer/quarterly-data.mjs';
import * as renderer from '../public/explorer/quarterly-view.mjs';
globalThis.window={__ATLAS_EXPLORER__:{base:'/mlit-statistics-dashboard/'}};
const publicAsset=JSON.parse(gunzipSync(await readFile(new URL('../public/explorer/quarterly-financials.json.gz',import.meta.url))));
const legacyAsset={...publicAsset,payload:{...publicAsset.payload,records:publicAsset.payload.records.filter(record=>record.company_id==='KITANO')}};

function record(id,{company,period,start,end,scope='consolidated',unit='百万円',metric='sales_consolidated_reported',label='売上高',hierarchy,category,policy,intervalStatus,bindingBasis}={}){
 return {fact_id:id,company_id:company,metric_id:metric,source_metric_label:label,source_row_label:label,
  value:100,value_raw:'100',unit,currency:'JPY',data_scope:scope,actual_or_forecast:'actual',
  period_type:period,period_kind:period+'_flow',period_start:start,period_end:end,period_end_month:end?.slice(0,7),
  target_company_period_id:'FY2025',fiscal_year:'2025',official_fiscal_year_label:'FY2025',
  status:'extracted',candidate_disposition:'direct_reported',source_url:'https://example.org/quarterly.pdf',
  document_id:'pdf:'+id,source_file_sha256:'a'.repeat(64),document_version_sha256:'a'.repeat(64),
  source_quote:label+' 100 '+unit,source_quote_kind:'joined_native_cell_excerpts',source_locator:{pdf_page:2,...(bindingBasis?{period_binding_basis:bindingBasis}:{})},finance_eligible:false,
  ...(intervalStatus?{period_interval_status:intervalStatus}:{}),...(hierarchy?{source_row_hierarchy:hierarchy}:{}),...(category?{source_category_as_disclosed:category}:{}),
  ...(policy?{accounting_policy_note:policy}:{})};
}
const newAsset={projectionHash:'12345678901234567890',payload:{companies:[
 {companyId:'OB',companyName:'大林組'},{companyId:'KA',companyName:'鹿島建設'},{companyId:'UN',companyName:'未確認会社'}
],records:[
 record('ob-q1',{company:'OB',period:'quarter_cumulative_3months',start:'2025-04-01',end:'2025-06-30'}),
 record('ob-q2',{company:'OB',period:'quarter_cumulative_6months',start:'2025-04-01',end:'2025-09-30'}),
 record('ob-q3',{company:'OB',period:'quarter_cumulative_9months',start:'2025-04-01',end:'2025-12-31'}),
 record('ka-q1-finance',{company:'KA',period:'quarter_cumulative_3months',start:'2025-04-01',end:'2025-06-30',metric:'operating_profit_consolidated_reported',label:'営業利益'}),
 record('ka-q1-order-a',{company:'KA',period:'quarter_only_3months',start:'2025-04-01',end:'2025-06-30',scope:'standalone',unit:'億円',metric:'orders_actual_reported',label:'単独建築受注高',hierarchy:['受注','建設事業','建築'],category:'建築受注',policy:'<script>source policy</script>'}),
 record('ka-q1-order-b',{company:'KA',period:'quarter_only_3months',start:'2025-04-01',end:'2025-06-30',scope:'standalone',unit:'億円',metric:'orders_actual_reported',label:'単独土木受注高'}),
 record('ka-q2-order',{company:'KA',period:'quarter_only_3months',start:'2025-07-01',end:'2025-09-30',scope:'standalone',unit:'億円',metric:'orders_actual_reported',label:'単独建築受注高',intervalStatus:'derived_from_annual_bounds_and_quarter_label'}),
 {...record('ka-q3-order',{company:'KA',period:'quarter_only_3months',start:'2025-10-01',end:'2025-12-31',scope:'standalone',unit:'億円',metric:'orders_actual_reported',label:'単独建築受注高',bindingBasis:{status:'normalized_from_fiscal_year_bounds_and_quarter_label'}}),source_restatement_basis:{status:'source_stated',native_quote:'<b>native restatement quote</b>',note:'<i>native basis note</i>'},source_notes:['<img src=x onerror=alert(1)>','補足注記'.repeat(100)],semantic_overlap_group:'FY2025_Q3_SOURCE_POSITION',semantic_overlap_status:'same_period_separate_source_cell'},
 {...record('ka-special-period',{company:'KA',period:'company_specific_period',start:'2025-10-01',end:'2025-12-31',scope:'standalone',unit:'億円',metric:'orders_special_reported',label:'特別受注'}),period_label_as_disclosed:'会社固有の期間表記'}]}};

test('legacy 113 records remain reachable on 25-row pages with stable controls and complete source metadata',()=>{
 const seen=new Set(),html=[];
 for(let page=0;page<5;page++){
  const pageHtml=renderer.renderQuarterlyView(legacyAsset,{},page);html.push(pageHtml);
  for(const match of pageHtml.matchAll(/data-quarter-fact-id="([a-f0-9]+)"/g))seen.add(match[1]);
 }
 assert.equal(seen.size,113);assert.match(html[0],/収録113件/);assert.match(html[0],/data-quarter-filter="quarterCompany"/);
 assert.match(html[0],/data-quarter-filter="quarterMetric"/);assert.match(html[0],/data-quarter-filter="quarterPeriod"/);assert.match(html[0],/data-quarter-filter="quarterScope"/);
 assert.match(html[0],/data-quarter-export="csv"/);assert.match(html[0],/quarterly-coverage\.csv/);assert.match(html[0],/kitano\.co\.jp/);assert.match(html[4],/5 \/ 5/);
 for(const row of legacyAsset.payload.records){assert.ok(seen.has(row.fact_id));assert.ok(html.join('').includes(row.source_quote));}
 const q1=quarterlyCsv(legacyAsset,{periodType:'quarter_cumulative_3months'});assert.equal((q1.match(/reviewed_kitano_q1_summary_v1/g)||[]).length,8);
});

test('coverage totals, recorded companies, period/scope facets and status come from supplied records',()=>{
 const html=renderer.renderQuarterlyView(newAsset,{});
 assert.match(html,/2社・9件の記録IDを収録/);assert.match(html,/単独四半期（直接報告）/);
 assert.match(html,/quarter_cumulative_6months/);assert.match(html,/value="quarter_cumulative_6months"/);
 assert.match(html,/value="quarter_only_3months"/);assert.match(html,/value="standalone"\s*>単体/);assert.match(html,/value="consolidated"\s*>連結/);
 assert.match(html,/未確認会社[^<]*<\/button><\/td>(?:<td>0件<\/td>)+<td>0件<\/td><td>未確認<\/td>/);assert.doesNotMatch(html,/0件<\/td><td>非開示<\/td>/);
 assert.match(html,/同じ期間の複数資料・観測を経済的な期間数として合算しません/);
 assert.match(html,/2025-04-01 ～ 2025-06-30（3か月・単独四半期、直接報告）/);
 assert.match(html,/2025-07-01 ～ 2025-09-30（3か月・単独四半期、直接報告、期間は年度境界と期区分から正規化）/);
 assert.match(html,/2025-10-01 ～ 2025-12-31（3か月・単独四半期、直接報告、期間は年度境界と期区分から正規化）/);
 assert.match(html,/単独建築受注高/);assert.match(html,/億円/);assert.match(html,/2025-04-01 ～ 2025-09-30（6か月累計）/);
 assert.match(html,/value="company_specific_period"\s*>会社固有の期間表記/);
 const unknown=html.match(/<article class="panel derived-result" data-quarter-fact-id="ka-special-period">([\s\S]*?)<\/article>/)?.[1];
 assert.ok(unknown);assert.doesNotMatch(unknown,/3か月累計|単独四半期/);
});

test('optional source hierarchy, categories and accounting notes are escaped in each record',()=>{
 const html=renderer.renderQuarterlyView(newAsset,{});
 assert.match(html,/原資料の行：受注 › 建設事業 › 建築/);assert.match(html,/区分：建築受注/);
 assert.match(html,/原資料から結合した引用（複数箇所の抜粋）/);
 assert.match(html,/同じ期間の別出典欄・自動合算不可/);
 assert.match(html,/比較値の再表示根拠/);assert.match(html,/&lt;b&gt;native restatement quote&lt;\/b&gt;/);
 assert.match(html,/&lt;i&gt;native basis note&lt;\/i&gt;/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 const notes=html.match(/<strong>原資料の注記<\/strong><ul>([\s\S]*?)<\/ul><\/section>/)?.[1];
 assert.ok(notes);assert.match(notes,/…<\/li>/);assert.equal(notes.includes('補足注記'.repeat(100)),false);
 const aliasRecord=record('actual-alias',{company:'KA',period:'quarter_actual_3months',start:'2025-07-01',end:'2025-09-30',scope:'standalone',unit:'億円'});
 const aliasHtml=renderer.renderQuarterlyView({projectionHash:'alias',payload:{companies:[],records:[aliasRecord]}},{});
 assert.match(aliasHtml,/単独四半期（直接報告）/);assert.match(aliasHtml,/2025-07-01 ～ 2025-09-30（3か月・単独四半期、直接報告）/);
 assert.match(html,/&lt;script&gt;source policy&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>source policy<\/script>/);
});

test('company and period selectors filter the displayed records without changing state keys',()=>{
 const filtered=renderer.renderQuarterlyView(newAsset,{quarterCompany:'KA',quarterPeriod:'quarter_only_3months',quarterScope:'standalone'},0);
 assert.match(filtered,/収録9件 · 一致4件/);assert.equal([...filtered.matchAll(/data-quarter-fact-id=/g)].length,4);
 assert.match(filtered,/data-quarter-filter="quarterCompany"/);assert.match(filtered,/data-quarter-filter="quarterPeriod"/);assert.match(filtered,/data-quarter-filter="quarterScope"/);
});

test('adopted native quarterly cards reach every new fact and keep accounting, categories, alias and period proof readable',()=>{
 for(const [company,count,pages]of [['INFR',24,1],['NISHIMATSU',99,4]]){
  const rows=publicAsset.payload.records.filter(r=>r.company_id===company),seen=new Set(),html=[];assert.equal(rows.length,count);
  for(let page=0;page<pages;page++){const rendered=renderer.renderQuarterlyView(publicAsset,{quarterCompany:company},page);html.push(rendered);for(const m of rendered.matchAll(/data-quarter-fact-id="([a-f0-9]+)"/g))seen.add(m[1]);}
  const rendered=html.join('');assert.equal(seen.size,count);for(const row of rows)assert.ok(seen.has(row.fact_id));
  assert.match(rendered,/同じPDF内の期間根拠/);assert.match(rendered,/Q2は6か月累計/);assert.match(rendered,/原資料の取得UTC 2026-10-14T16:/);assert.match(rendered,/期間種別の追加表記は未収録/);assert.doesNotMatch(rendered,/undefined|NaN|data\/raw\/|heldSourceObservations|sourcePlaceholders|sourceConflicts/);
  if(company==='INFR'){assert.match(rendered,/税引前利益（IFRS）/);assert.match(rendered,/会社全体の非開示を意味しません/);}else{assert.match(rendered,/原資料の会計基準：日本基準/);assert.match(rendered,/原資料の行：建築/);assert.match(rendered,/個別受注合計の重複欄は照合位置として保持/);}
 }
 const noOrdinary=renderer.renderQuarterlyView(publicAsset,{quarterCompany:'INFR',quarterMetric:'ordinary_profit_consolidated_reported'},0);assert.match(noOrdinary,/一致0件/);assert.match(noOrdinary,/未確認の会社・期間を非開示や0とは判定しません/);
 const unsafe=structuredClone(publicAsset),row=unsafe.payload.records.find(r=>r.company_id==='NISHIMATSU'&&r.source_parent_category_as_disclosed);row.source_parent_category_as_disclosed='<img src=x onerror=alert(1)>';row.source_row_label_as_disclosed='<script>native row</script>';
 const escaped=renderer.renderQuarterlyView(unsafe,{quarterCompany:'NISHIMATSU',quarterQuery:row.fact_id},0);assert.match(escaped,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.match(escaped,/&lt;script&gt;native row&lt;\/script&gt;/);assert.doesNotMatch(escaped,/<img src=x|<script>native row/);
});

test('Shimizu Toda cards expose all144 adopted values and separate literal scope from interpretation',()=>{
 for(const [company,count]of [['SHIMIZU',32],['TODA',112]]){
  const rows=publicAsset.payload.records.filter(r=>r.company_id===company),seen=new Set(),html=[];assert.equal(rows.length,count);
  for(let page=0;page<Math.ceil(count/25);page++){const rendered=renderer.renderQuarterlyView(publicAsset,{quarterCompany:company},page);html.push(rendered);for(const m of rendered.matchAll(/data-quarter-fact-id="([a-f0-9]+)"/g))seen.add(m[1]);}
  const rendered=html.join('');assert.equal(seen.size,count);for(const row of rows)assert.ok(seen.has(row.fact_id));assert.match(rendered,/対象範囲の原文：/);assert.match(rendered,/対象範囲の解釈（原文引用とは別）/);assert.match(rendered,/同じPDF内の期間根拠/);assert.match(rendered,/Q2は6か月累計/);assert.match(rendered,/原資料の取得UTC 2026-10-14T18:/);assert.match(rendered,/資料全体の訂正履歴・確認後の版は未確認/);assert.doesNotMatch(rendered,/undefined|NaN|data\/raw\/|heldSourceObservations|sourcePlaceholders|sourceConflicts/);
  if(company==='SHIMIZU'){assert.match(rendered,/海外受注高（連結・参考値）/);assert.match(rendered,/会社全体の連結受注合計ではありません/);assert.match(rendered,/比較値の再表示根拠（清水Q3・前年財務のみ）/);}else{assert.match(rendered,/建設事業の小計とは区別します/);assert.match(rendered,/建設事業の受注へ付け替えません/);assert.match(rendered,/建設事業 › 建築/);}
 }
 const unsafe=structuredClone(publicAsset),row=unsafe.payload.records.find(r=>r.company_id==='TODA');row.source_subject_scope_interpretation='<img src=x onerror=alert(1)>';
 const escaped=renderer.renderQuarterlyView(unsafe,{quarterCompany:'TODA',quarterQuery:row.fact_id},0);assert.match(escaped,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(escaped,/<img src=x/);
});
