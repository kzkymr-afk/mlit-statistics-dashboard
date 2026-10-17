import {canonicalSha256} from '../explorer/lib/buildbase-contract-hash.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const BUCKETS={automatic:20,annotated_comparison:659,prohibited_total_NetAssets_alias:1,unreviewed:0,reported_basis_pending:42,target_context_pending:10,source_reconciliation_pending:1,individual_counterpart_waiting:667};
const OFFICIAL_HOSTS=new Set('ssl4.eir-parts.net ir.obayashi.co.jp pdf.irpocket.com www.haseko.co.jp www.nishimatsu.co.jp www.ad-hzm.co.jp www.penta-ocean.co.jp www.takenaka.co.jp www.smcon.co.jp www2.jpx.co.jp www.kajima.co.jp www.okumuragumi.co.jp www.toda.co.jp www.taisei.co.jp www.zenitaka.co.jp www.asanuma.co.jp www.matsui-ken.co.jp www.kumagaigumi.co.jp www.infroneer.com disclosure2dl.edinet-fsa.go.jp'.split(' '));
const PRIVATE=/\/Volumes\/|\/Users\/|file:\/\/|data\/raw\/|https?:\/\/github\.com\//i;
const date=value=>value||'未記録';
const option=(value,label,selected)=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`;
const safeUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&OFFICIAL_HOSTS.has(url.hostname)&&!/[?&](token|secret|password|key|signature|credential)=/i.test(url.search)?url.href:null;}catch{return null;}};

export async function validateFinancialUsageAsset(asset,catalog){
 if(asset?.schemaVersion!==1||asset.datasetId!=='buildbase-financial-usage-public'||asset.recordCount!==1400||
    catalog?.schemaVersion!==1||catalog.datasetId!==asset.datasetId||catalog.recordCount!==asset.recordCount||
    catalog.sourceQualitySha256!==asset.sourceQualitySha256||catalog.projectionHash!==await canonicalSha256(asset)||
    asset.permissions?.browseOnly!==true||asset.permissions?.newComparisonPermissionCreated!==false||asset.permissions?.automaticAggregationAllowed!==false||
    JSON.stringify(asset.partitionCounts)!==JSON.stringify(catalog.partitionCounts)||
    !Array.isArray(asset.records)||asset.records.length!==1400||new Set(asset.records.map(r=>r.id)).size!==1400)throw Error('財務利用案内の版・件数・閲覧条件を確認できません。');
 const expected={...BUCKETS};
 // A separately reviewed, bounded one-pair amendment can move one observation from waiting to annotated.
 if(asset.partitionCounts.annotated_comparison===660&&asset.partitionCounts.individual_counterpart_waiting===666){expected.annotated_comparison=660;expected.individual_counterpart_waiting=666;}
 if(Object.keys(expected).some(key=>asset.partitionCounts[key]!==expected[key]))throw Error('財務利用区分の保存件数が一致しません。');
 const counts={};
 for(const row of asset.records){
  counts[row.bucket]=(counts[row.bucket]||0)+1;
  if(!/^[a-f0-9]{64}$/.test(row.id)||!row.companyId||!row.metricId||!row.fiscalYear||!row.unit||
     !row.scope||!row.bucketLabel||!row.source?.sha256||!safeUrl(row.source.url)||
     !Array.isArray(row.conditions)||!Array.isArray(row.prohibitedUses)||!Array.isArray(row.specificUnconfirmedReasons)||
     !Array.isArray(row.contractIds)||row.contractIds.some(id=>! /^[a-f0-9]{16}$/.test(id))||
     PRIVATE.test(JSON.stringify(row)))throw Error('財務観測の原値・出典・公開範囲を確認できません。');
 }
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
 const buckets=[['automatic','既存の自動審査契約内'],['annotated_comparison','注記付き・登録用途のみ'],['individual_counterpart_waiting','比較相手待ち'],['reported_basis_pending','算定基準保留'],['target_context_pending','独立対象context保留'],['source_reconciliation_pending','原表橋渡し保留'],['prohibited_total_NetAssets_alias','総純資産への同一視禁止']];
 return `<section class="financial-head"><div class="eyebrow">BUILD BASE / FINANCIAL EVIDENCE</div><div class="financial-title"><h1>財務の原値と利用範囲</h1><button data-financial-close>分析へ戻る</button></div><p>19社・FY2021〜2025の1,400観測を、会社・原指標・対象範囲・出典とともに閲覧できます。観測数は比較できる組数ではありません。</p><div class="notice">${asset.partitionCounts.automatic+asset.partitionCounts.annotated_comparison}件は既存の指定窓・相手ID・注記に限って比較用途が登録されています。${asset.partitionCounts.reported_basis_pending+asset.partitionCounts.target_context_pending+asset.partitionCounts.source_reconciliation_pending+asset.partitionCounts.individual_counterpart_waiting}件は比較未確認、1件は総純資産への同一視禁止です。相手待ち${asset.partitionCounts.individual_counterpart_waiting}件も原値は参照でき、登録済みの式はその契約の範囲で検算できます。この画面は新しい比較・合算の許可を作りません。相手待ちは「元資料がない」という意味ではなく、過年度セルの列・期間と実績属性を各Factに対応付ける確認や、相手IDとの契約が未完の場合も含みます。</div><div class="financial-counts">${buckets.map(([id,label])=>`<div><strong>${asset.partitionCounts[id]}</strong><span>${esc(label)}</span></div>`).join('')}</div></section>
 <section class="panel financial-filters"><label>会社<select data-financial-filter="company">${option('','全19社',filters.company)}${companies.map(([id,name])=>option(id,name,filters.company)).join('')}</select></label><label>利用状態<select data-financial-filter="bucket">${option('','すべて',filters.bucket)}${buckets.map(([id,label])=>option(id,label,filters.bucket)).join('')}</select></label><label>原指標・出典・ID<input type="search" id="financial-query" value="${esc(filters.query||'')}" placeholder="例：売上高、鹿島、PDF名、Fact ID"></label><button data-financial-clear>条件をクリア</button></section>
 <section class="financial-results"><div class="financial-title"><h2>一致 ${matches.length}件</h2><small>${matches.length?current*size+1:0}–${Math.min((current+1)*size,matches.length)} / ${matches.length}件 · 1件ずつ原値・資料版・制約を確認</small></div>${matches.slice(current*size,(current+1)*size).map(renderRecord).join('')||'<div class="panel">一致する観測はありません。会社・利用状態・検索語を変えてください。</div>'}<div class="financial-pages"><button data-financial-page="${current-1}" ${current===0?'disabled':''}>前の25件</button><span>${current+1} / ${pages}</span><button data-financial-page="${current+1}" ${current+1>=pages?'disabled':''}>次の25件</button></div></section>
 <p class="footer-note">保存した公式資料の原値・Source審査状態を公開用に投影。品質版 ${esc(asset.sourceQualitySha256.slice(0,12))}。元の取得日時が空欄なら未記録のまま表示し、現在掲載版との一致は各観測の記録を参照します。</p>`;
}
function renderRecord(row){
 const period=row.period.asOf?`時点 ${row.period.asOf}`:row.period.start&&row.period.end?`${row.period.start} ～ ${row.period.end}`:row.period.originalLabel||'実期間未確認';
 const native=Object.entries(row.nativeDetails||{}).map(([key,value])=>`${key}: ${typeof value==='object'?JSON.stringify(value):value}`).join(' / ');
 const url=safeUrl(row.source.url);
 const displayedValue=row.valueAsDisplayed??row.value;
 const displayedUnit=row.unit==='%'&&String(displayedValue).trim().endsWith('%')?'':row.unit;
 const hasekoNote=row.id==='066a2a4b5f097a005c1aca209ac29f50c8c55993b5ef9328f8eb94b1e7e89107'?'<p class="notice">前年特命73.8%は同じ原資料で実績・金額比として確認されています。ただし前年の既存Factは actual が未設定で、期間別の読取投影と比較契約は未実装です。この91.7%観測の比較相手待ちは資料不在の意味ではありません。</p>':'';
 return `<article class="panel financial-record" data-financial-id="${esc(row.id)}"><div class="financial-title"><div><span class="tag reference">${esc(row.bucketLabel)}</span><h3>${esc(row.companyName)} · ${esc(row.metricLabel)}</h3><p>${esc(row.fiscalYear)}年度 · ${esc(row.scopeLabel)} · ${esc(row.accountingStandard||'会計基準未確認')}</p></div><div class="financial-value">${esc(displayedValue)} <small>${esc(displayedUnit)}</small></div></div><p class="small">原指標 ${esc(row.metricId)} · 実期間 ${esc(period)} · ${esc(row.period.measureKind||'期間種別未確認')}</p>${native?`<p class="small">原表区分：${esc(native)}</p>`:''}${hasekoNote}<details><summary>出典・条件・残る確認事項</summary><dl><dt>Fact ID</dt><dd>${esc(row.id)}</dd><dt>原資料</dt><dd>${esc(row.source.documentName)} · PDF物理 ${esc(row.source.page??'未収録')}頁<br>SHA-256 ${esc(row.source.sha256)}<br>${url?`<a href="${esc(url)}" target="_blank" rel="noopener">公式資料を開く ↗</a>`:'公式URL未収録'}</dd><dt>元取得日時</dt><dd>${esc(date(row.source.retrievedAt))}</dd><dt>現在掲載版</dt><dd>${esc(row.source.currentOfficialVersionMatchStatus||'未確認')}</dd><dt>登録用途</dt><dd>${esc(row.allowedUse)}${row.contractIds.length?`<br>契約参照ID：${row.contractIds.map(esc).join(' / ')}（元の登録条件を確認して使用）`:''}</dd><dt>利用条件</dt><dd>${row.conditions.length?`<ul>${row.conditions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'原定義と既存契約を確認'}</dd><dt>禁止用途</dt><dd>${row.prohibitedUses.length?`<ul>${row.prohibitedUses.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'未収録'}</dd><dt>未確認</dt><dd>${row.specificUnconfirmedReasons.length?`<ul>${row.specificUnconfirmedReasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'この審査区分に追加の未確認理由はありません'}</dd></dl></details></article>`;
}
