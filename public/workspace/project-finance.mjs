const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dimensionLabel=d=>String(d.asDisclosed??(typeof d.value==='string'?d.value:d.value?.asDisclosed)??'');
const tables=['projects','companies','projectDimensions','projectEvents','financialContexts','financialRecords','projectFinancialRelations'];
export function validateProjectFinance(asset){
 if(!asset||asset.schemaVersion!==1||asset.datasetId!=='buildbase-project-finance-navigation'||tables.some(k=>!Array.isArray(asset[k])))throw Error('施工実績の参照形式を確認できません。');
 for(const key of ['financialAttributionAllowed','automaticComparisonAllowed','automaticAggregationAllowed','canonicalFactPromotionAllowed','publicationAllowed'])if(asset.permissions?.[key]!==false)throw Error('施工実績と財務の利用制約を確認できません。');
 const ids=new Set(asset.projects.map(p=>p.projectObservationId));
 if(ids.size!==asset.projects.length||ids.has(undefined))throw Error('施工実績の観測IDが重複しています。');
 const contexts=new Set(asset.financialContexts.map(c=>c.financialPeriodId));
 const contextRows=new Map(asset.financialContexts.map(c=>[c.financialPeriodId,c])),projectRows=new Map(asset.projects.map(p=>[p.projectObservationId,p]));
 if(contexts.size!==asset.financialContexts.length)throw Error('財務期間IDが重複しています。');
 if(asset.projectFinancialRelations.some(r=>{const p=projectRows.get(r.projectObservationId),c=contextRows.get(r.financialPeriodId);return !p||!c||!p.sourceReportingFiscalYear||p.companyId!==c.companyId||String(p.sourceReportingFiscalYear)!==String(c.fiscalYear);}))throw Error('会社・資料報告年度をまたぐ参照は許可されません。');
 if(asset.financialRecords.some(r=>!contexts.has(r.financialPeriodId)))throw Error('財務原値の期間参照が欠けています。');
 if(asset.projectFinancialRelations.some(r=>!ids.has(r.projectObservationId)||!contexts.has(r.financialPeriodId)||r.financialAttributionAllowed!==false||r.relationKind!=='source_reporting_context'))throw Error('施工実績の参照関係が不正です。');
 if([...asset.projectDimensions,...asset.projectEvents].some(r=>!ids.has(r.projectObservationId)))throw Error('施工実績の根拠参照が欠けています。');
 return asset;
}
export function selectProjects(asset,filters={}){
 const dimensions=new Map(asset.projects.map(p=>[p.projectObservationId,{usage:[],region:[]}]));
 for(const d of asset.projectDimensions){if(d.valueStatus!=='source_stated')continue;if(dimensions.get(d.projectObservationId)?.[d.kind])dimensions.get(d.projectObservationId)[d.kind].push(dimensionLabel(d));}
 const q=String(filters.query||'').normalize('NFKC').toLowerCase();
 const projects=asset.projects.filter(p=>{
  const d=dimensions.get(p.projectObservationId),y=p.sourceReportingFiscalYear;
  return (!filters.company||p.companyId===filters.company)&&(!filters.year||(filters.year==='unknown'?!y:String(y)===filters.year))&&(!filters.usage||d.usage.includes(filters.usage))&&(!filters.region||d.region.includes(filters.region))&&(!q||[p.name,p.companyId,...d.usage,...d.region].join(' ').normalize('NFKC').toLowerCase().includes(q));
 });
 const ids=new Set(projects.map(p=>p.projectObservationId));
 return {projects,dimensions,projectCount:ids.size,relationCount:asset.projectFinancialRelations.filter(r=>ids.has(r.projectObservationId)).length};
}
const options=(values,selected)=>'<option value="">すべて</option>'+values.map(([v,n])=>`<option value="${esc(v)}" ${String(selected)===String(v)?'selected':''}>${esc(n)}</option>`).join('');
const sourceLinks=refs=>(refs||[]).map(s=>{const url=s.url||s.sourceUrl||s.source_url;try{const u=new URL(url);if(u.protocol==='https:')return `<a href="${esc(u.href)}" target="_blank" rel="noopener">公式出典 ↗</a>`;}catch{}return '';}).filter(Boolean).join(' / ');
export function renderProjectFinance(asset,filters={},page=0){
 const result=selectProjects(asset,filters),size=20,pages=Math.max(1,Math.ceil(result.projectCount/size));page=Math.min(Math.max(0,page),pages-1);
 const names=new Map(asset.companies.map(c=>[c.companyId,c.companyName]));
 const years=[...new Set(asset.projects.map(p=>p.sourceReportingFiscalYear).filter(Boolean).map(String))].sort().reverse().map(y=>[y,y]);years.push(['unknown','年度未確認']);
 const dims=kind=>[...new Set(asset.projectDimensions.filter(d=>d.kind===kind&&d.valueStatus==='source_stated').map(d=>dimensionLabel(d)))].filter(Boolean).sort().map(v=>[v,v]);
 return `<div class="workspace-title"><div><div class="eyebrow">PROJECT & FINANCIAL SOURCES · ローカル検証候補</div><h1>施工実績と会社資料</h1><p>案件の用途・地域・出典から、掲載会社の財務原値を参照できます。</p></div><button data-project-export>AI参照用JSONを書き出す</button></div><div class="notice">施工実績は全案件の母集団ではありません。掲載資料の報告年度は、案件の受注・売上計上年度を意味しません。案件金額の財務への配賦、比較・合算は行いません。</div><section class="panel"><div class="conditions project-filters"><label>会社 <select data-project-filter="company">${options(asset.companies.map(c=>[c.companyId,c.companyName]),filters.company)}</select></label><label>資料の報告年度 <select data-project-filter="year">${options(years,filters.year)}</select></label><label>用途（確認済原記載） <select data-project-filter="usage">${options(dims('usage'),filters.usage)}</select></label><label>地域（確認済原記載） <select data-project-filter="region">${options(dims('region'),filters.region)}</select></label><label>検索 <input id="project-query" value="${esc(filters.query||'')}" placeholder="案件名・用途・地域"></label></div><p>${result.projectCount}案件観測 / ${result.relationCount}参照関係。参照先が複数でも案件数は重複加算しません。</p></section><div class="project-list">${result.projects.slice(page*size,(page+1)*size).map(p=>{
 const id=p.projectObservationId,d=result.dimensions.get(id),events=asset.projectEvents.filter(e=>e.projectObservationId===id),relations=asset.projectFinancialRelations.filter(r=>r.projectObservationId===id);
 const periods=asset.financialContexts.filter(c=>relations.some(r=>r.financialPeriodId===c.financialPeriodId));
 const periodIds=new Set(periods.map(c=>c.financialPeriodId));
 const records=asset.financialRecords.filter(r=>periodIds.has(r.financialPeriodId));
 return `<article class="panel"><h2>${esc(p.name||'案件名未確認')}</h2><p>${esc(names.get(p.companyId)||p.companyId)} / 資料の報告年度：${esc(p.sourceReportingFiscalYear||'未確認')}</p><p>用途：${esc(d.usage.join(' / ')||'未確認')} ／ 地域：${esc(d.region.join(' / ')||'未確認')}</p><p>日付根拠：${events.length?events.map(e=>esc([e.eventKind,e.date, e.precision,e.actualOrForecast].filter(Boolean).join(' / '))).join('<br>'):'未確認'}</p><p>${sourceLinks(p.sourceReferences)}</p><details><summary>会社の会計期間と出典の参照（${periods.length}期間）</summary><p>資料掲載会社・報告年度による参照です。案件の会計帰属、元請・子会社・JV持分はこのリンクから推定しません。</p>${periods.map(c=>`<p>${esc(c.fiscalYear)} / ${esc(c.scope)} / ${esc(c.period?.start||c.period?.asOf||'期間未確認')} ～ ${esc(c.period?.end||'')} / ${esc(c.period?.kind||'')}</p>`).join('')}<details><summary>ローカル候補の会社財務原値（${records.length}記録）</summary><p>会社単位の原値です。この案件の値ではありません。</p>${records.map(r=>{const c=periods.find(c=>c.financialPeriodId===r.financialPeriodId);return `<p>${esc(r.fiscalYear)} / ${esc(c?.scope||'対象範囲未確認')} / ${esc(c?.period?.kind||'期間種別未確認')} / ${esc(c?.period?.start||c?.period?.asOf||'')} ～ ${esc(c?.period?.end||'')}<br>${esc(r.metricId)}：${esc(r.value??'未確認')} ${esc(r.unit)}<br>${esc(typeof r.definition==='string'?r.definition:JSON.stringify(r.definition))}<br>${esc((r.conditions||[]).join(' / '))} ${sourceLinks(r.sourceReferences)}</p>`;}).join('')}</details><button data-project-annual-company="${esc(p.companyId)}">同社の年度別原表実績を見る →</button> <button data-project-company="${esc(p.companyId)}">公開版の会社財務原値と利用範囲を見る →</button></details><details><summary>原観測・欠損理由・関係の根拠</summary><pre>${esc(JSON.stringify({project:p,dimensions:asset.projectDimensions.filter(x=>x.projectObservationId===id),events,relations},null,2))}</pre></details></article>`;
 }).join('')||'<div class="panel">該当する案件観測はありません。未確認を0件の実績とは解釈しません。</div>'}</div><div class="actions"><button data-project-page="${page-1}" ${page===0?'disabled':''}>前へ</button><span>${page+1} / ${pages}</span><button data-project-page="${page+1}" ${page===pages-1?'disabled':''}>次へ</button></div><details class="panel"><summary>参照範囲・取得時点・利用制約</summary><pre>${esc(JSON.stringify({schemaVersion:asset.schemaVersion,datasetId:asset.datasetId,sourceSnapshots:asset.sourceSnapshots,permissions:asset.permissions,limitations:asset.limitations},null,2))}</pre></details>`;
}
