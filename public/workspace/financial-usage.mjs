import {metricDisplay,displayText} from '../shared/display-text.mjs';
import {sourceLabel} from '../shared/source-labels.mjs';
import {humanizeHtml} from '../shared/display-text.mjs';
const STOCK_DATE_IDS=new Set(["0d81298871e05c37f47104cc36f37aec23826515f37f0be563e241efa4d7e9a0", "10f7d59376a97c32ddd93de95b1772df0e5fa677870e56f9959a83be853bbaea", "19c102c6d95ae0db883b296d330a9b632f677c23e39fe59e05e4bd61fa689ab5", "1baa28ef6e463451a13146868b1ea882e60ab8ef50c057defdf2d5e35802da44", "222c7e2279a93fcb77f40b74d6d9ad6bbc815e3669916dd9a05bb23355ef6b13", "2377131d9cb0f32eba175dad1885524ab3af59c54a1517a48bb9f5f4ea67727d", "288c28d88c062d53dfb657157b139cd1f0c849dc2e820fa3e22bd2f3efcecf27", "3347f960c7ba0bb76b30c56ad09ae272bce4b89be3727977403b40abc3c9ad4c", "5b6aebf77b202b6075203f06aea776ca46414ba90ec7a51003e1d67a97c963ca", "5e5fafc116b66ac6fcc6a560f2ce613156814a490ad14eb20e210ed1b67d3167", "690cb5e1442bd8c55bf682ea9e5d4e08a916d5af207965f9e08ab2e569936627", "79de6ce74813944539ad06e77f03e032a41e94130f5ea26c5352009ba7486f70", "7d317e16a410efcaac39b8ddc6f2d9207446803c9f0f9c1dec6c3c5b98272c35", "84f95729b107b3e8ad11f9cc981ddf21e42f87a309b7b97eb8523fe11adc7945", "8e2e89c642c8ff5f239f17a6ff73da5e723f1e0c84112fc548d0f3c3ce53d3ed", "926e5d0fa9de866bc4ec9241fd0c0b48d7bd14791d0050ad7a5b5d78b485bc8b", "aeff45ec76551d778383b2d703f4160bebfe1b8889faa382771a047abdc1d3f3", "b614a998c162fe44ec3f2d95b3565c4bce50bf3c14d44c369f7bdcca3c247230", "e124ec8d10b04651336221ebf5a6b3d9c496e1a60a31b262a11ed32e1da87e20", "e5ba9d0c2d4ac806e0d27fbe22d33e6efbbf63ecce09c618af80d5cffc288dce", "e625b3d30acc69e350db7aa1ecd565388311ce552fa25cc59ec736901ddb5fe0", "ee655550726af7981d360a49f2a0d2dddc62611fae645918d10a11064175ca43", "f5d6688c8c177d745b812d734cfe255552c856b0ec285d0afb782332a3708a9b", "fd69a13cffdfe7a26c0f4e81226103ca698954eaf09880051e615952bac510c3"]);
import {canonicalSha256} from '../explorer/lib/buildbase-contract-hash.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const BUCKETS={automatic:20,annotated_comparison:994,prohibited_total_NetAssets_alias:1,unreviewed:0,reported_basis_pending:42,target_context_pending:10,source_reconciliation_pending:1,individual_counterpart_waiting:332};
const LEDGERS={quality:'5e33a74b438e9fc664f147b755fe7940446eedc4fa765c5893d9d919b5265299',usage:'dabd49c60a2799545c6bfc1611cb50ef52eda6962f63c2b81db610188fb9cf24',constraints:'de1e0f208f041cc6ca2ba0968f04f115e98f3ec3eaacd6dab41b839393d1731e',stockQuality:'2b9daae5341d8005220cd16101242b3d855aba673648effbde11e84bf50714a4',stockUsage:'a34055ae30207afc986b06e0cb4d9bfe8240f4ae8df4d114e261d34e0d1bec07',stockDateContext:'8458d3aa2d2469ed665116bf1264341687cb6ab18c7cfb965288a4c788fb1059'};
const QUALITY_VIEW='3a014ff922e95eafece3cef08b87a59d37fb4bf04131fea9db8d2b151a06101d';
const USAGE_VIEW='6bc1b836e7ba5cdda1eb61d5ab8c8637f2114bd6d2a56256b4a66976b3ebdb35';
const OFFICIAL_HOSTS=new Set('ssl4.eir-parts.net ir.obayashi.co.jp pdf.irpocket.com www.haseko.co.jp www.nishimatsu.co.jp www.ad-hzm.co.jp www.penta-ocean.co.jp www.takenaka.co.jp www.smcon.co.jp www2.jpx.co.jp www.kajima.co.jp www.okumuragumi.co.jp www.toda.co.jp www.taisei.co.jp www.zenitaka.co.jp www.asanuma.co.jp www.matsui-ken.co.jp www.kumagaigumi.co.jp www.infroneer.com disclosure2dl.edinet-fsa.go.jp'.split(' '));
const PRIVATE=/\/Volumes\/|\/Users\/|file:\/\/|data\/raw\/|https?:\/\/github\.com\//i;
const date=value=>value||'未記録';
const option=(value,label,selected)=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`;
const safeUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&OFFICIAL_HOSTS.has(url.hostname)&&!/[?&](token|secret|password|key|signature|credential)=/i.test(url.search)?url.href:null;}catch{return null;}};

export async function validateFinancialUsageAsset(asset,catalog){
 if(asset?.schemaVersion!==2||asset.datasetId!=='buildbase-financial-usage-public'||asset.recordCount!==1400||
    catalog?.schemaVersion!==2||catalog.datasetId!==asset.datasetId||catalog.recordCount!==asset.recordCount||
    catalog.sourceQualitySha256!==asset.sourceQualitySha256||asset.sourceQualitySha256!==QUALITY_VIEW||
    catalog.sourceUsageSha256!==asset.sourceUsageSha256||asset.sourceUsageSha256!==USAGE_VIEW||
    Object.keys(LEDGERS).some(key=>catalog.sourceLedgerSha256?.[key]!==LEDGERS[key]||asset.sourceLedgerSha256?.[key]!==LEDGERS[key])||catalog.projectionHash!==await canonicalSha256(asset)||
    asset.permissions?.browseOnly!==true||asset.permissions?.historicalSourceCellsPublished!==false||asset.permissions?.newComparisonPermissionCreated!==false||asset.permissions?.automaticAggregationAllowed!==false||
    JSON.stringify(asset.partitionCounts)!==JSON.stringify(catalog.partitionCounts)||
    !Array.isArray(asset.records)||asset.records.length!==1400||new Set(asset.records.map(r=>r.id)).size!==1400)throw Error('財務利用案内の版・件数・閲覧条件を確認できません。');
 const expected=BUCKETS;
 if(Object.keys(expected).some(key=>asset.partitionCounts[key]!==expected[key]))throw Error('財務利用区分の保存件数が一致しません。');
 const counts={};let restricted=0;
 for(const row of asset.records){
  counts[row.bucket]=(counts[row.bucket]||0)+1;
  const series=row.currentYearSeriesRestrictions;
  if(series){
   restricted++;
   if(series.appliesToCurrentFactId!==row.id||series.appliesToFiscalYear!==row.fiscalYear||
      series.historicalBasisVerifiedByCurrentConditions!==false||series.currentYearBasisTransferAllowed!==false||
      series.automaticComparisonAllowed!==false||series.automaticAggregationAllowed!==false||
      series.preciseDeltaAllowed!==false||series.relativeGrowthAllowed!==false||
      series.sourceSeriesPublicationAllowed!==false||series.sourceCellsAreNotFacts!==true||
      !series.availableUse||!row.conditions.length||
      ['quality','usage'].some(kind=>series.ledgerReferences?.[kind]?.sha256!==(STOCK_DATE_IDS.has(row.id)?LEDGERS[kind==='quality'?'stockQuality':'stockUsage']:LEDGERS[kind])||
        series.ledgerReferences?.[kind]?.jsonPointer!=='/replacements_by_id/'+row.id))
     throw Error('財務系列の年度別利用条件を確認できません。');
  }
  if(!/^[a-f0-9]{64}$/.test(row.id)||!row.companyId||!row.metricId||!row.fiscalYear||!row.unit||
     !row.scope||!row.bucketLabel||!row.source?.sha256||!safeUrl(row.source.url)||
     !Array.isArray(row.conditions)||!Array.isArray(row.prohibitedUses)||!Array.isArray(row.specificUnconfirmedReasons)||
     !Array.isArray(row.contractIds)||row.contractIds.some(id=>! /^[a-f0-9]{16}$/.test(id))||
     PRIVATE.test(JSON.stringify(row)))throw Error('財務観測の資料に記載された数値・出典・公開範囲を確認できません。');
 }
 if(restricted!==263)throw Error('財務系列の制約件数が一致しません。');
 if(Object.keys(expected).some(key=>(counts[key]||0)!==expected[key]))throw Error('財務観測の区分別件数が一致しません。');
 return asset;
}
export function filterFinancialUsage(asset,filters={}){
 const terms=String(filters.query||'').normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
 return asset.records.filter(row=>(!filters.company||row.companyId===filters.company)&&(!filters.bucket||row.bucket===filters.bucket)&&
  terms.every(term=>JSON.stringify({company:row.companyName,metric:row.metricLabel,metricId:row.metricId,native:row.nativeDetails,year:row.fiscalYear,source:row.source.documentName,id:row.id}).normalize('NFKC').toLowerCase().includes(term)));
}
export function renderFinancialUsage(asset,filters={},page=0){
 const matches=filterFinancialUsage(asset,filters),size=25,pages=Math.max(1,Math.ceil(matches.length/size)),current=Math.min(page,pages-1),companies=[...new Map(asset.records.map(r=>[r.companyId,r.companyName])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'ja'));
 const buckets=[['automatic','既存の自動審査契約内'],['annotated_comparison','注記付き・登録用途のみ'],['individual_counterpart_waiting','比較相手待ち'],['reported_basis_pending','算定基準保留'],['target_context_pending','独立対象context保留'],['source_reconciliation_pending','出典資料橋渡し保留'],['prohibited_total_NetAssets_alias','総純資産への同一視禁止']];
 return humanizeHtml(`<section class="financial-head"><div class="eyebrow">BUILD BASE / FINANCIAL EVIDENCE</div><div class="financial-title"><h1>財務の資料に記載された数値と利用範囲</h1><button data-financial-close>分析へ戻る</button></div><p>19社・FY2021〜2025の1,400観測を、会社・資料の指標・対象範囲・出典とともに閲覧できます。観測数は比較できる組数ではありません。</p><div class="notice">${asset.partitionCounts.automatic+asset.partitionCounts.annotated_comparison}件は既存の指定窓・相手ID・注記に限って比較用途が登録されています。${asset.partitionCounts.reported_basis_pending+asset.partitionCounts.target_context_pending+asset.partitionCounts.source_reconciliation_pending+asset.partitionCounts.individual_counterpart_waiting}件は比較未確認、1件は総純資産への同一視禁止です。相手待ち${asset.partitionCounts.individual_counterpart_waiting}件も資料に記載された数値は参照でき、登録済みの式はその契約の範囲で検算できます。この画面は新しい比較・合算の許可を作りません。相手待ちは「元資料がない」という意味ではなく、過年度セルの列・期間と実績属性を各Factに対応付ける確認や、相手IDとの契約が未完の場合も含みます。</div><div class="financial-counts">${buckets.map(([id,label])=>`<div><strong>${asset.partitionCounts[id]}</strong><span>${esc(label)}</span></div>`).join('')}</div></section>
 <section class="panel financial-filters"><label>会社<select data-financial-filter="company">${option('','全19社',filters.company)}${companies.map(([id,name])=>option(id,name,filters.company)).join('')}</select></label><label>利用状態<select data-financial-filter="bucket">${option('','すべて',filters.bucket)}${buckets.map(([id,label])=>option(id,label,filters.bucket)).join('')}</select></label><label>指標・出典<input type="search" id="financial-query" value="${esc(filters.query||'')}" placeholder="例：売上高、鹿島、決算資料"></label><button data-financial-clear>条件をクリア</button></section>
 <section class="financial-results"><div class="financial-title"><h2>一致 ${matches.length}件</h2><small>${matches.length?current*size+1:0}–${Math.min((current+1)*size,matches.length)} / ${matches.length}件 · 1件ずつ資料に記載された数値・資料版・制約を確認</small></div>${matches.slice(current*size,(current+1)*size).map(renderRecord).join('')||'<div class="panel">一致する観測はありません。会社・利用状態・検索語を変えてください。</div>'}<div class="financial-pages"><button data-financial-page="${current-1}" ${current===0?'disabled':''}>前の25件</button><span>${current+1} / ${pages}</span><button data-financial-page="${current+1}" ${current+1>=pages?'disabled':''}>次の25件</button></div></section>
 <p class="footer-note">保存した公式資料の資料に記載された数値・Source審査状態を公開用に投影。品質版 ${esc(asset.sourceQualitySha256.slice(0,12))}。元の取得日時が空欄なら未記録のまま表示し、現在掲載版との一致は各観測の記録を参照します。</p>`);
}
function renderRecord(row){
 const period=row.period.asOf?`時点 ${row.period.asOf}`:row.period.start&&row.period.end?`${row.period.start} ～ ${row.period.end}`:row.period.originalLabel||'実期間未確認';
 const native=Object.values(row.nativeDetails||{}).filter(value=>typeof value==='string').map(value=>displayText(value,'')).join(' / ');
 const url=safeUrl(row.source.url);
 const displayedValue=row.valueAsDisplayed??row.value;
 const displayedUnit=row.unit==='%'&&String(displayedValue).trim().endsWith('%')?'':row.unit;
 const series=row.currentYearSeriesRestrictions;
 const seriesNote=series?`<p class="notice">保存済み系列の利用条件はこの${esc(series.appliesToFiscalYear)}年度のFactに適用します。過年度の算定基準への転用、厳密前年比・差額、自動比較・合算は許可されていません。${series.remainingRequirement?esc(series.remainingRequirement):''}</p>`:'';
 return humanizeHtml(`<article class="panel financial-record" data-financial-id="${esc(row.id)}"><div class="financial-title"><div><span class="tag reference">${esc(row.bucketLabel)}</span><h3>${esc(row.companyName)} · ${esc(metricDisplay(row))}</h3><p>${esc(row.fiscalYear)}年度 · ${esc(row.scopeLabel)} · ${esc(row.accountingStandard||'会計基準未確認')}</p></div><div class="financial-value">${esc(displayedValue)} <small>${esc(displayedUnit)}</small></div></div><p class="small">対象期間 ${esc(period)} · ${esc(row.period.measureKind||'期間種別未確認')}</p>${native?`<p class="small">出典資料区分：${esc(native)}</p>`:''}${seriesNote}<details><summary>出典・条件・残る確認事項</summary><dl><dt>Fact ID</dt><dd>${esc(row.id)}</dd><dt>原資料</dt><dd>${esc(sourceLabel(row.source.url,row.companyName+'の公表資料（資料名確認中）'))} · PDF物理 ${esc(row.source.page??'未収録')}頁<br>SHA-256 ${esc(row.source.sha256)}<br>${url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(sourceLabel(row.source.url))} ↗</a>`:'公式URL未収録'}</dd><dt>元取得日時</dt><dd>${esc(date(row.source.retrievedAt))}</dd><dt>現在掲載版</dt><dd>${esc(row.source.currentOfficialVersionMatchStatus||'未確認')}</dd><dt>登録用途</dt><dd>${esc(row.allowedUse)}${row.contractIds.length?`<br>契約参照ID：${row.contractIds.map(esc).join(' / ')}（元の登録条件を確認して使用）`:''}</dd>${series?`<dt>保存系列の制約</dt><dd>${esc(series.availableUse)} · ${esc(series.comparisonPrecision||'対象期間表示のみ')}<br>品質台帳 ${esc(series.ledgerReferences.quality.sha256)} / 利用台帳 ${esc(series.ledgerReferences.usage.sha256)}<br>適用Fact ${esc(series.appliesToCurrentFactId)} · ${esc(series.appliesToFiscalYear)}年度${series.specifiedTargetUse?.targetUse?`<br>指定用途：${esc(series.specifiedTargetUse.targetUse)}（${esc(series.specifiedTargetUse.status)}）`:''}</dd>`:''}<dt>利用条件</dt><dd>${row.conditions.length?`<ul>${row.conditions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'原定義と既存契約を確認'}</dd><dt>禁止用途</dt><dd>${row.prohibitedUses.length?`<ul>${row.prohibitedUses.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'未収録'}</dd><dt>未確認</dt><dd>${row.specificUnconfirmedReasons.length?`<ul>${row.specificUnconfirmedReasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'この審査区分に追加の未確認理由はありません'}</dd></dl></details></article>`);
}
