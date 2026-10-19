import {escapeHtml as esc,sourceLink} from './presentation.mjs';
import {publicDataUrl} from './public-data.mjs';
import {quarterMetricName,quarterMeasureKind,quarterPeriodLabel,quarterlySourceUrl,quarterlyFilters,filterQuarterlyRecords,quarterlyExport,quarterlyCsv} from './quarterly-data.mjs';

const pretty=value=>esc(JSON.stringify(value,null,2));
const option=(value,label,selected)=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`;
const select=(label,key,entries,state)=>`<label>${esc(label)}<select data-quarter-filter="${esc(key)}">${option('','すべて',state[key])}${entries.map(([value,name])=>option(value,name,state[key])).join('')}</select></label>`;

function textValue(value){
 if(value===undefined||value===null||value==='')return '';
 if(Array.isArray(value))return value.map(textValue).filter(Boolean).join(' › ');
 if(typeof value==='object'){
  const labeled=value.label??value.name??value.text??value.note??value.description??value.quote??value.value;
  return labeled===undefined?JSON.stringify(value):textValue(labeled);
 }
 return String(value);
}
function firstValue(record,keys){
 for(const key of keys){const value=record?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}
 return undefined;
}
function companyEntries(payload){
 const byId=new Map();
 for(const company of payload.companies||[]){if(company?.companyId)byId.set(company.companyId,{...company});}
 for(const record of payload.records||[]){
  const id=record.company_id;
  if(id&&!byId.has(id))byId.set(id,{companyId:id,companyName:textValue(record.company_name)||id});
 }
 return [...byId.values()];
}
function companyName(id,companies){return companies.find(company=>company.companyId===id)?.companyName||id||'会社名未収録';}
function periodTypeLabel(type,record){
 if(type==='interim_cumulative_6months')return '中間6か月累計（直接報告）';
 if(type===null)return '保留中・期間未表示';
 const cumulative=String(type||'').match(/^quarter_cumulative_(\d+)months$/);
 if(cumulative)return `${cumulative[1]}か月累計`;
 const direct=String(type||'').match(/^quarter_(?:actual|only)_(\d+)months$/);
 if(direct)return direct[1]==='3'?'単独四半期（直接報告）':`単独四半期（${direct[1]}か月・直接報告）`;
 if(type==='point_in_time_stock')return '残高等';
 return textValue(firstValue(record,['source_period_heading','period_label_as_disclosed','period_label']))||'その他の期間';
}
function periodRank(type){
 if(type==='interim_cumulative_6months')return 6.5;
 const cumulative=String(type||'').match(/^quarter_cumulative_(\d+)months$/);
 const direct=String(type||'').match(/^quarter_(?:actual|only)_(\d+)months$/);
 return cumulative?Number(cumulative[1]):direct?500+Number(direct[1]):type==='point_in_time_stock'?1000:2000;
}
function periodTypes(records){
 return [...new Set(records.map(record=>record.period_type).filter(Boolean))]
  .sort((a,b)=>periodRank(a)-periodRank(b)||String(a).localeCompare(String(b)));
}
function intervalWasNormalized(record){
 const locator=record.source_locator||{},provenance=locator.period_provenance||{};
 const fields=[record.period_interval_status,locator.period_interval_status,locator.period_binding_basis,
  provenance.period_interval_status,provenance.period_binding_basis];
 const collect=value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(collect):value&&typeof value==='object'?Object.values(value).flatMap(collect):[];
 return /normalized|derived|inferred|正規化|導出/i.test(fields.flatMap(collect).join(' '));
}
function normalizedIntervalNote(record){if(record.period_interval_status==='summary_fiscal_comparison_bound_to_same_pdf_exact_cumulative_interval')return '期間は同じPDFの受注表の日付に対応づけ';return intervalWasNormalized(record)?'期間は年度境界と期区分から正規化':'';}
function periodLabel(record){
 const type=String(record.period_type||'');
 if(type==='interim_cumulative_6months')return `${record.period_start} ～ ${record.period_end}（中間6か月累計・直接報告）`;
 const intervalNote=normalizedIntervalNote(record);
 const cumulative=type.match(/^quarter_cumulative_(\d+)months$/);
 if(cumulative&&record.period_start&&record.period_end)return `${record.period_start} ～ ${record.period_end}（${cumulative[1]}か月累計${intervalNote?`、${intervalNote}`:''}）`;
 const direct=type.match(/^quarter_(?:actual|only)_(\d+)months$/);
 if(direct&&record.period_start&&record.period_end)return `${record.period_start} ～ ${record.period_end}（${direct[1]}か月・単独四半期、直接報告${intervalNote?`、${intervalNote}`:''}）`;
 if(type==='point_in_time_stock')return quarterPeriodLabel(record);
 if(intervalNote&&record.period_start&&record.period_end)return `${textValue(record.period_label_as_disclosed||record.period_label)||periodTypeLabel(type,record)} · ${record.period_start} ～ ${record.period_end}（${intervalNote}）`;
 return textValue(record.period_label_as_disclosed||record.period_label)||periodTypeLabel(type);
}
function scopeLabel(scope){return ({consolidated:'連結',standalone:'単体',segment:'セグメント・調整欄',consolidated_construction_business:'連結・建設事業'}[scope]||scope||'対象範囲未収録');}
function metricLabel(record){
 const known=quarterMetricName(record);
 if(known!==record.metric_id)return known;
 return textValue(firstValue(record,['source_row_label','source_column_label_as_disclosed','source_metric_label']))||known;
}
function scopes(records){return [...new Set(records.map(record=>record.data_scope).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));}
function recordCount(records,companyId,periodType){
 return records.reduce((count,record)=>count+(record.company_id===companyId&&record.period_type===periodType?1:0),0);
}
function reviewLabel(companyId,records){return records.some(record=>record.company_id===companyId)?'記録あり':'未確認';}
function accountingNotes(record){
 if(record.accounting_standard_status==='not_disclosed_in_reviewed_source')return '<section class="notice"><strong>確認した資料には会計基準の記載がありません</strong><p>日本基準などへ推定せず、原資料の中間実績として表示します。</p></section>';
 if(record.accounting_standard_id){const ifrs=record.accounting_standard_id==='IFRS';return `<section class="notice"><strong>原資料の会計基準：${esc(record.accounting_standard_as_disclosed)}</strong><p>${ifrs?'税引前利益はIFRSの独立した指標です。日本基準の経常利益との対応づけ・自動比較は行いません。選択した連結損益表では経常利益は適用対象外で、会社全体の非開示を意味しません。':'日本基準の連結財務と、原資料が記載する連結・個別の受注を区別します。範囲をまたぐ自動合算は行いません。'}</p></section>`;}
 const value=firstValue(record,['accounting_policy_note','accounting_policy_notes','source_accounting_policy_note','source_accounting_policy_notes','accounting_policy_source_note','accounting_policy']);
 if(value===undefined)return '';
 const notes=(Array.isArray(value)?value:[value]).map(textValue).filter(Boolean);
 if(!notes.length)return '';
 return `<section class="notice"><strong>原資料の会計方針メモ</strong>${notes.length===1?`<p>${esc(notes[0])}</p>`:`<ul>${notes.map(note=>`<li>${esc(note)}</li>`).join('')}</ul>`}</section>`;
}
function boundedText(value,max=300){
 const text=textValue(value),chars=Array.from(text);
 return chars.length>max?chars.slice(0,max-1).join('')+'…':text;
}
function sourceNotes(record){
 if(!Array.isArray(record.source_notes))return '';
 const notes=record.source_notes.map(note=>{
  if(typeof note==='string')return note;
  if(note&&typeof note==='object')return textValue(firstValue(note,['native_quote','nativeQuote','source_quote','sourceQuote','quote','note','text','description','summary']));
  return '';
 }).filter(Boolean);
 if(!notes.length)return '';
 const shown=notes.slice(0,5).map(note=>boundedText(note));
 const more=notes.length>shown.length?`<li>ほか${notes.length-shown.length}件の注記</li>`:'';
 return `<section class="notice"><strong>原資料の注記</strong><ul>${shown.map(note=>`<li>${esc(note)}</li>`).join('')}${more}</ul></section>`;
}
function restatementBasis(record){
 const basis=record.source_restatement_basis;
 if(basis===undefined||basis===null||basis==='')return '';
 if(record.extractor_version==='reviewed_shimizu_toda_quarterly_fy2025_v1')return `<section class="notice"><strong>比較値の再表示根拠（清水Q3・前年財務のみ）</strong><p>企業結合に係る暫定的な会計処理の確定を反映した、原資料の前年比較値を保持します。Q1・Q2や受注へこの注記を転記しません。元の前年版との数値差・資料全体の訂正履歴は未確認です。</p><h3>原資料の注記</h3><blockquote>${(basis.native_quote_lines||[]).map(line=>esc(line.quote)).join('<br>')}</blockquote><p>注記のPDF物理ページ ${esc(basis.physical_page)} / 原本SHA-256 ${esc(basis.source_sha256)}</p><p>注記の解釈（原文引用とは別）：${esc(basis.interpretation)}</p></section>`;
 const quote=typeof basis==='string'?basis:textValue(firstValue(basis,['native_quote','nativeQuote','source_native_quote','sourceNativeQuote','source_quote','sourceQuote','quote','quote_as_disclosed','quoteAsDisclosed']));
 const note=typeof basis==='object'?textValue(firstValue(basis,['source_note','sourceNote','note','summary','description','reason_as_disclosed','reasonAsDisclosed','basis_as_disclosed','basisAsDisclosed'])):'';
 if(!quote&&!note)return '';
 return `<section class="notice"><strong>比較値の再表示根拠</strong>${note?`<p>${esc(boundedText(note))}</p>`:''}${quote?`<blockquote>${esc(boundedText(quote,600))}</blockquote>`:''}</section>`;
}
function overlapNote(record){
 const group=record.semantic_overlap_group,status=textValue(record.semantic_overlap_status).toLowerCase();
 const hasGroup=group!==undefined&&group!==null&&group!=='';
 const suppressed=/^(?:none|no[_ -]?overlap|not[_ -]?overlap|unique|not_applicable|not_needed|false)$/i.test(status);
 const statusSignalsOverlap=/same|shared|overlap|duplicate|non[_ -]?unique|別出典|同じ期間|重複/.test(status);
 return hasGroup||(!suppressed&&statusSignalsOverlap)?'<p class="notice">同じ期間の別出典欄・自動合算不可</p>':'';
}
function sourceRowDetails(record){
 const hierarchy=record.source_row_path_as_disclosed|| (record.source_parent_category_as_disclosed?[record.source_parent_category_as_disclosed,record.source_row_label_as_disclosed].filter(Boolean):firstValue(record,['source_row_hierarchy','source_row_path','source_row_role']));
 const category=firstValue(record,['source_category_as_disclosed','source_row_category','source_category_label','source_category','category_label','category']);
 if(hierarchy===undefined&&category===undefined)return '';
 return `${record.semantic_category_label?'<p class="small">説明上の区分（原文引用とは別）：'+esc(record.semantic_category_label)+'</p>':''}<p class="small">${hierarchy===undefined?'':`原資料の行：${esc(textValue(hierarchy))}`}${hierarchy!==undefined&&category!==undefined?'<br>':''}${category===undefined?'':`区分：${esc(textValue(category))}`}</p>`;
}
function sourceScopeNotes(record){
 if(record.extractor_version==='reviewed_selected_statement_extension_v1')return `<section class="notice"><strong>対象会社の期間・会計基準</strong><p>${esc(record.source_subject_scope_as_disclosed)}。日本基準・${record.data_scope==='standalone'?'個別':'連結'}。${esc(record.period_start)}〜${esc(record.period_end)}の累計を保持します。${record.company_id==='MAEDA'?'INFR発行資料の前田建設名義の個別補足表と同じPDFの期間記載に対応付けています。親会社のIFRSや連結数値へ接続しません。':'三井住友建設の当該期自社短信の表紙に基準・連結・累計期間が明記されています。当年Q3へ基準を転記しません。'}</p><p>百万円表示。${record.precision?.rounding_rule==='million_yen_truncation_explicit'?'百万円未満切捨て。':'端数処理は未確認で換算しません。'}自動比較・合算は許可していません。</p></section>`;
 if(['reviewed_toa_matsui_quarterly_fy2025_v1','reviewed_penta_taisei_quarterly_fy2025_v1','reviewed_takenaka_tokyu_quarterly_fy2025_v1','reviewed_smcc_maeda_quarterly_fy2025_v1'].includes(record.extractor_version))return `<section class="notice"><strong>原資料の対象・期間・注記</strong><p>対象：${esc(record.source_subject_scope_as_disclosed||'原表の選択行')}。${esc(record.source_subject_scope_interpretation||'')}</p>${record.source_period_interpretation?`<p>期間の解釈：${esc(record.source_period_interpretation)}</p>`:''}${record.source_value_annotation_as_disclosed?`<p>原表の値注記：${esc(record.source_value_annotation_as_disclosed)}</p>`:''}<p>原表カテゴリの親子を自動合算せず、累計から単独四半期を計算しません。現在掲載版との一致・資料全体の訂正履歴は未確認です。</p></section>`;
 if(record.extractor_version!=='reviewed_shimizu_toda_quarterly_fy2025_v1')return '';
 const overseas=record.company_id==='SHIMIZU'&&record.metric_id==='total_orders_as_reported'&&record.data_scope==='consolidated',order=record.metric_id.includes('order');
 const note=overseas?'連結の海外受注参考値です。会社全体の連結受注合計ではありません。個別受注の合計と加算・比較しません。':record.company_id==='TODA'&&record.metric_id==='total_orders_as_reported'?'個別の全体合計は建設事業・国内投資開発事業等・環境・エネルギー事業を含みます。建設事業の小計とは区別します。':record.metric_id==='order_value_as_reported'?'国内投資開発事業等・環境・エネルギー事業の原表カテゴリです。建設事業の受注へ付け替えません。':order?'原表の個別受注の合計・小計・明細を区別します。親子カテゴリを補正・合算しません。':'連結損益計算書の期間は連結財務にだけ適用し、個別受注へ対象範囲を転記しません。';
 return `<section class="notice"><strong>${overseas?'海外受注高（連結・参考値）':'原資料の対象範囲'}</strong><p>対象範囲の原文：${esc(record.source_subject_scope_as_disclosed)}</p><p>対象範囲の解釈（原文引用とは別）：${esc(record.source_subject_scope_interpretation)}</p><p>${esc(note)}</p>${record.source_precision_status?'<p>原資料の表示精度：'+esc(record.source_precision_status)+'</p>':''}<p>資料全体の訂正履歴・確認後の版は未確認です。</p></section>`;
}
function sourceQuoteLabel(record){
 return /joined|multiple|excerpt|cell/i.test(record.source_quote_kind||'')?'原資料から結合した引用（複数箇所の抜粋）':'原資料の引用';
}
function summaryNote(types,records){
 const cumulative=types.filter(type=>/^quarter_cumulative_\d+months$/.test(type)).map(type=>periodTypeLabel(type,records.find(record=>record.period_type===type)));
 const direct=types.filter(type=>/^quarter_(?:actual|only)_\d+months$/.test(type)).map(type=>periodTypeLabel(type,records.find(record=>record.period_type===type)));
 const notes=[];
 if(cumulative.length)notes.push(`${cumulative.join('・')}を累計期間として表示します。累計を単独四半期に読み替えません。`);
 if(direct.length)notes.push(`${direct.join('・')}は原資料が単独四半期として直接報告した期間です。`);
 if(types.includes('point_in_time_stock'))notes.push('残高等は原資料の月表記・日付を保ちます。');
 if(types.includes('interim_cumulative_6months'))notes.push('中間6か月実績は原資料の期間を保持し、他の四半期との同一視や差分計算をしません。');
 if(records.some(r=>r.record_kind==='held_reference'))notes.push('保留中の1件はIDと出典のみを残し、数値・期間は表示・書き出ししません。');
 notes.push('原資料の単位・丸めを保持し、会社間の自動比較・合算・指数化・相関分析は行いません。');
 return notes.join(' ');
}

function currentnessSupplementHtml(checks=[]){
 if(!checks.length)return '';
 const equal=checks.filter(c=>c.byteComparisonStatus==='equal').length,failed=checks.filter(c=>c.byteComparisonStatus==='not_compared').length;
 return `<section class="panel"><details><summary>補足の現在掲載版チェック · ${checks.length}資料（同じPDF bytes ${equal}件・未比較 ${failed}件）</summary><p>原記録の取得日時・確認状態を変更する記録ではありません。保存PDFと後日のHTTP応答を照合した結果です。大林組は確認時点で同じbytesでした。鹿島はHTTP 500・0bytesのため、掲載版・訂正は未確認のままです。</p><div class="table-scroll"><table class="values"><thead><tr><th>会社・資料</th><th>確認日時 UTC</th><th>結果</th></tr></thead><tbody>${checks.map(c=>`<tr><td>${esc(c.companyId)}<br>${sourceLink(quarterlySourceUrl(c.sourceUrl),'公式PDF ↗')}<br>${esc(c.documentSha256)}</td><td>${esc(c.checkedAtUtc)}</td><td>${c.byteComparisonStatus==='equal'?'同じPDF bytes・確認した掲載ページに訂正の表示なし':'HTTP '+esc(c.httpStatus)+'・未比較／掲載版・訂正は未確認'}</td></tr>`).join('')}</tbody></table></div><p class="small">大林組の訂正表示確認は保存した掲載ページだけが対象です。全社・全期間に訂正がないとは判定しません。確認後の変更は未確認です。</p></details></section>`;
}
function recordCurrentnessCheck(check){return check?`<p class="notice">原記録とは別の補足チェック：${esc(check.checkedAtUtc)} / ${check.byteComparisonStatus==='equal'?'保存PDFと同じbytes':'HTTP '+esc(check.httpStatus)+'・未比較。掲載版・訂正は未確認'}。この記録で元の取得日時や利用条件は変更しません。</p>`:'';}
function correctionNote(record){return record.correction_status==='official_listing_marks_2025_08_19_corrected_edition'?'<p class="notice">公式掲載ページで訂正版と表示された資料です。訂正前の資料との数値差・訂正範囲は未確認です。</p>':'';}
function periodEvidence(record){
 const basis=record.source_locator?.period_binding_basis;if(!basis)return '';
 if(['reviewed_toa_matsui_quarterly_fy2025_v1','reviewed_penta_taisei_quarterly_fy2025_v1','reviewed_takenaka_tokyu_quarterly_fy2025_v1','reviewed_smcc_maeda_quarterly_fy2025_v1'].includes(record.extractor_version))return `<section class="notice"><strong>原資料の期間根拠</strong><p>${esc(basis.status)}。${record.company_id==='TAKENAKA'?'中間期間は別の公式資料による明示期間照合です。':''}連結財務と個別受注の対象範囲を同一視しません。</p><pre>${pretty(basis)}</pre></section>`;
 if(record.extractor_version==='reviewed_shimizu_toda_quarterly_fy2025_v1')return `<section class="notice"><strong>同じPDF内の期間根拠</strong><blockquote>${esc(basis.period_start_quote)} / ${esc(basis.period_end_quote)}</blockquote><p>期間根拠のPDF物理ページ ${esc(basis.physical_page)}${basis.printed_page?' / 資料の表示ページ '+esc(basis.printed_page):''}。${record.metric_id.includes('order')?'原資料の受注表の累計日付を、その表の対象範囲に保持します。':'連結損益計算書の累計日付を、連結財務だけに保持します。'}${basis.status==='same_page_repeated_order_header_dates'?'海外参考欄の期間は同じページに繰り返された受注期間の見出しに対応づけています。':''}Q2は6か月累計で、単独Q2への差分計算は行いません。</p></section>`;
 if(record.extractor_version==='reviewed_infr_nishimatsu_quarterly_fy2025_v1')return `<section class="notice"><strong>同じPDF内の期間根拠</strong><blockquote>${esc(basis.period_start_quote)} / ${esc(basis.period_end_quote)}</blockquote><p>期間根拠のPDF物理ページ ${esc(basis.physical_page)}${basis.printed_page?' / 資料の表示ページ '+esc(basis.printed_page):''}。${record.metric_id==='construction_order_value_as_reported'?'受注表の開始・終了日をその表の対象範囲に保持します。':'連結損益計算書の開始・終了日を連結財務の期間だけに使います。受注表へ対象範囲を転記しません。'}Q2は6か月累計で、単独Q2への差分計算は行いません。</p></section>`;

 if(record.period_companion){const ref=basis.source_locator||{};const scopeNote=record.company_id==='KUMAGAI'?(record.data_scope==='standalone'?'期間根拠は同じ法人・四半期の短信の単体受注表です。':'期間根拠は同じ法人・四半期の短信の連結損益計算書です。'):(record.data_scope==='standalone'?'短信の期間根拠は連結、受注表は単体です。対象範囲が同じとは扱いません。':'');return `<section class="notice"><strong>期間の根拠資料（値の主出典とは別）</strong><p>${sourceLink(quarterlySourceUrl(ref.official_url),'公式の四半期短信を開く ↗')} · PDF物理ページ ${esc(ref.pdf_page)}<br>原本SHA-256 ${esc(ref.sha256)}</p><blockquote>${esc(basis.source_quote)}</blockquote><p>同じ法人・四半期の短信に記載された期間を対応づけています。値の主出典と期間の根拠資料を分けて保持します。${scopeNote}単独四半期への差分計算や自動比較は行いません。</p></section>`;}
 if(record.extractor_version==='reviewed_zenitaka_kumagai_quarterly_fy2025_v1')return `<section class="notice"><strong>同じPDF内の期間根拠</strong><blockquote>${esc(basis.source_quote)}</blockquote><p>原文の開始・終了日と累計の表記を保持します。期間根拠のPDF物理ページ ${esc(basis.source_locator?.pdf_page||'metadata参照')}${basis.source_locator?.printed_page?' / 資料の表示ページ '+esc(basis.source_locator.printed_page):''}。${record.company_id==='ZENITAKA'&&record.data_scope==='standalone'?'連結損益計算書は期間だけの根拠に使います。単体受注の対象範囲と同じとは扱いません。':''}単独四半期への差分計算や自動比較は行いません。</p></section>`;
 return record.extractor_version==='reviewed_okumura_asanuma_quarterly_fy2025_v1'?`<section class="notice"><strong>同じPDF内の期間根拠</strong><blockquote>${esc(basis.source_quote)}</blockquote><p>表紙の当期期間と同じPDF内の比較期間の記載に対応づけています。連結の財務表と単体の受注表は、期間の対応だけを確認し、対象範囲が同じとは扱いません。</p></section>`:'';
}
function acquisitionLabel(record){return record.retrieved_at?'原資料の取得UTC '+record.retrieved_at:'原資料の取得日時は未収録';}
function editionLabel(record){return record.as_of_check_utc?record.as_of_check_utc_status==='later_official_url_bytes_equal_saved_pdf'?'後日の公式URL照合 '+record.as_of_check_utc+'：保存PDFと同じbytes。以後の版・訂正は未確認。':'公式URLから取得した時点 '+record.as_of_check_utc+'。以後の版・訂正は未確認。':'現在版との一致は原記録では未確認。';}
export function renderQuarterlyView(asset,state,page=0,catalog={}){
 const payload=asset.payload,records=payload.records||[],companies=companyEntries(payload),types=periodTypes(records);
 const matches=filterQuarterlyRecords(payload,quarterlyFilters(state)),pages=Math.max(1,Math.ceil(matches.length/25)),current=Math.min(Math.max(0,page),pages-1),start=current*25;
 const metrics=[...new Set(records.map(record=>record.metric_id).filter(Boolean))].sort().map(id=>{
  const example=records.find(record=>record.metric_id===id);return [id,metricLabel(example)];
 });
 const periodOptions=types.map(type=>[type,periodTypeLabel(type,records.find(record=>record.period_type===type))]),scopeOptions=scopes(records).map(scope=>[scope,scopeLabel(scope)]);
 const recordedCompanies=new Set(records.map(record=>record.company_id).filter(Boolean)).size;
 const body=companies.map(company=>{
  const total=records.filter(record=>record.company_id===company.companyId).length;
  return `<tr><td><button data-quarter-company="${esc(company.companyId)}">${esc(company.companyName||company.companyId)}</button></td>${types.map(type=>`<td>${recordCount(records,company.companyId,type)}件</td>`).join('')}<td>${total}件</td><td>${reviewLabel(company.companyId,records)}</td></tr>`;
 }).join('');
 const notice=summaryNote(types,records);
 return `<section class="derived-header"><div class="eyebrow">会社の四半期資料</div><div class="panel-heading"><h1>四半期の記録と確認状況</h1><button data-close-quarter>会社指標と公的統計へ戻る</button></div><p>${recordedCompanies}社・${records.length}件の記録IDを収録（数値 ${records.filter(r=>Number.isFinite(r.value)).length}件・保留参照 ${records.filter(r=>r.record_kind==='held_reference').length}件）。表示件数は当期・比較期を含みます。記録がない会社や期間は、未確認のまま表示します。</p><div class="notice">${esc(notice)}</div></section>
 <section class="panel"><div class="panel-heading"><h2>会社別の収録範囲</h2><a href="${esc(publicDataUrl('explorer/quarterly-coverage.csv'))}" download="atlas-quarterly-coverage.csv">会社別の一覧CSV ↗</a></div><p class="small">収録した四半期値と確認状況です。全社のIR資料を網羅した調査ではありません。0件は未確認であり、非開示を意味しません。${types.length?`期間の種類：${esc(types.map(type=>periodTypeLabel(type,records.find(record=>record.period_type===type))).join('・'))}。`:''}</p><div class="table-scroll"><table class="values"><thead><tr><th>会社</th>${types.map(type=>`<th>${esc(periodTypeLabel(type,records.find(record=>record.period_type===type)))}</th>`).join('')}<th>合計</th><th>確認状態</th></tr></thead><tbody>${body}</tbody></table></div><p class="small">件数は原資料の記録単位で数え、同じ期間の複数資料・観測を経済的な期間数として合算しません。資料や期間を確認していないことを、非開示・0とは扱いません。</p></section>
 <section class="panel derived-filters" aria-label="四半期資料の検索条件"><label>原値を検索<input type="search" id="quarter-search" value="${esc(state.quarterQuery||'')}" placeholder="指標名・会社ID・原文・資料ID"></label>${select('会社','quarterCompany',companies.map(company=>[company.companyId,company.companyName||company.companyId]),state)}${select('指標','quarterMetric',metrics,state)}${select('期間の種類','quarterPeriod',periodOptions,state)}${select('値の対象','quarterScope',scopeOptions,state)}<button data-clear-quarter>条件をクリア · 全${records.length}件</button></section>
 <section class="panel"><div class="panel-heading"><h2>収録${records.length}件 · 一致${matches.length}件</h2><div class="tool-row"><button data-quarter-export="csv">選択した原値CSV</button><button data-quarter-export="json">選択した原値・出典JSON</button></div></div><p class="small">表示 ${matches.length?start+1:0}–${Math.min(start+25,matches.length)} / ${matches.length}件。書き出しはページ内だけでなく、検索条件に一致した全件です。</p><div class="derived-pagination"><button data-quarter-page="${current-1}" ${current===0?'disabled':''}>前の25件</button><span>${current+1} / ${pages}</span><button data-quarter-page="${current+1}" ${current+1>=pages?'disabled':''}>次の25件</button></div></section>
 ${currentnessSupplementHtml(catalog.currentnessSupplement)}
 ${matches.slice(start,start+25).map(record=>renderQuarterRecord(record,companies,catalog.currentnessSupplement?.find(c=>c.documentSha256===record.source_file_sha256))).join('')||'<p class="notice">この条件の収録値はありません。未確認の会社・期間を非開示や0とは判定しません。</p>'}
 <footer class="main-foot">原資料の公式URL・hash・位置・原文を保持します。取得日時と現在掲載版の確認状態は記録ごとに異なります。補足チェックで原記録の状態を変更しません。表示用データ版 ${esc(asset.projectionHash.slice(0,12))}。</footer>`;
}
function renderQuarterRecord(record,companies,currentnessCheck){
 if(record.record_kind==='held_reference')return `<article class="panel derived-result" data-quarter-fact-id="${esc(record.fact_id)}"><div class="eyebrow">保留中の原記録 · 数値・期間は非公開</div><h2>${esc(companyName(record.company_id,companies))} · ${esc(quarterMetricName(record))}</h2><p class="notice">${esc(record.hold_note)}</p><details><summary>保留理由・原資料</summary><p>記録ID ${esc(record.fact_id)} · 理由コード ${esc(record.hold_reason_code)}</p><p>${sourceLink(quarterlySourceUrl(record.source_url),'公式PDFを開く ↗')} · 原本SHA-256 ${esc(record.source_file_sha256)}</p><p>財務分析・比較・合算の許可はありません。</p></details></article>`;
 const locator=record.source_locator||{},page=locator.pdf_page||locator.primary_summary_cell?.pdf_page,periodPage=locator.period_provenance?.pdf_page;
 const role=record.is_reconciliation_adjustment?'調整欄':record.is_reported_total?'報告合計':record.is_reported_subtotal?'報告小計':record.is_additive_leaf?'明細（自動合算は未許可）':'原資料の欄';
 const conflict=record.same_byte_index_conflict;
 const company=companyName(record.company_id,companies),metric=metricLabel(record),measure=quarterMeasureKind(record),period=periodLabel(record);
 const scope=`${scopeLabel(record.data_scope)}${record.source_segment_label?` / ${textValue(record.source_segment_label)}`:''}`;
 const hierarchy=sourceRowDetails(record),policy=accountingNotes(record),notes=sourceNotes(record),restatement=restatementBasis(record),overlap=overlapNote(record);
 const actual=record.actual_or_forecast==='forecast'?'予測':record.actual_or_forecast==='actual'?'実績':textValue(record.actual_or_forecast)||'区別未収録';
 const conflictNote=conflict?'<p class="notice">資料索引には別の四半期を示す表記が同じ保存内容に結び付く矛盾があります。本文と原本hashを保持し、別期間の値に読み替えません。</p><pre>'+pretty(conflict)+'</pre>':'';
 return `<article class="panel derived-result" data-quarter-fact-id="${esc(record.fact_id)}"><div class="eyebrow">原資料の表示値 · ${esc(periodTypeLabel(record.period_type,record))} · 自動比較未許可</div><h2>${esc(company)} · ${esc(metric)}</h2><p class="derived-value">${esc(record.value_raw)} <span>${esc(record.unit)} · ${esc(measure)}</span></p><p>${esc(period)}</p><p class="small">対象：${esc(scope)} · ${esc(role)} · ${esc(actual)}<br>会社期間ID ${esc(record.target_company_period_id)}${record.official_fiscal_year_label?' / 原資料表記 '+esc(record.official_fiscal_year_label):''}</p>${hierarchy}${record.source_locator?.corroborating_alias_locators?.length?'<p class="notice">同じ原資料の個別受注合計の重複欄は照合位置として保持し、別の記録や追加の合計として数えません。</p>':''}${record.share_split_source_note?'<p class="notice">株式分割の原資料注記：'+esc(record.share_split_source_note)+'</p>':''}${record.adjustment_source_note?'<p class="notice">'+esc(record.adjustment_source_note)+'</p>':''}${policy}${sourceScopeNotes(record)}${notes}${restatement}${overlap}${correctionNote(record)}${periodEvidence(record)}${record.consolidation_perimeter_annotation?'<p class="notice">連結対象の変更は資料間で未確認です。原資料の連結表記と確認範囲をmetadataに保持しています。</p>':''}${recordCurrentnessCheck(currentnessCheck)}<details><summary>原資料・ページ・原文と利用条件</summary><dl><dt>原資料 / 原本SHA-256</dt><dd>${sourceLink(quarterlySourceUrl(record.source_url),'公式PDFを開く ↗')}<br>${esc(record.document_id)}<br>${esc(record.source_file_sha256)}</dd><dt>PDFの物理ページ</dt><dd>${esc(page||'詳細位置を参照')}${periodPage?' / 期間・照合欄 '+esc(periodPage):''}</dd><dt>原期間・種類</dt><dd>${esc(period)}<br>${esc(record.period_kind??'期間種別の追加表記は未収録')}${record.as_of_status?'<br>'+esc(record.as_of_status):''}</dd><dt>原値・単位・通貨</dt><dd>${esc(record.value_raw)} / ${esc(record.unit)} / ${esc(record.currency??'比率・通貨対象外')}<br>正規化値 ${esc(record.value)}。原資料の表示単位・丸めを保持します。</dd><dt>取得日時・現在掲載版</dt><dd>${esc(acquisitionLabel(record))}<br>${esc(editionLabel(record))}資料表紙の日付 ${esc(record.source_edition_date_as_disclosed??'未収録')}を取得日時に読み替えません。</dd><dt>原状態 / 正規化判断</dt><dd>${esc(record.status||'記録済み')} / ${esc(record.candidate_disposition||'判断の記録なし')}<br>資料全体の確認 ${esc(record.whole_document_review_status||'確認状態未収録')}。年度の財務分析表には含めていません。自動比較・合算は行いません。</dd></dl><h3>${sourceQuoteLabel(record)}</h3><blockquote>${esc(record.source_quote)}</blockquote>${record.corroborating_source_quote?'<h3>照合した原資料の引用</h3><blockquote>'+esc(record.corroborating_source_quote)+'</blockquote>':''}${conflictNote}<h3>原文位置・出典・原状態の公開metadata</h3><pre>${pretty(record)}</pre></details></article>`;
}
export function downloadQuarterly(asset,state,format){const filters=quarterlyFilters(state),text=format==='csv'?quarterlyCsv(asset,filters):JSON.stringify(quarterlyExport(asset,filters),null,2),url=URL.createObjectURL(new Blob([text],{type:format==='csv'?'text/csv':'application/json'}));const a=document.createElement('a');a.href=url;a.download='atlas-quarterly-financials.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
