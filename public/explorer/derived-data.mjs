import {canonicalSha256} from './lib/buildbase-contract-hash.mjs';
import {serializeCsv} from './data-view.mjs';
export const DERIVED_SOURCE_DATASET='buildbase-reusable-verified-indicators';
export const DERIVED_SOURCE_SNAPSHOT='5414e48ae0c900934a07303dc41c63f5b8b9a7f5434db9c0baa1a9c92dbd4ab1';
export const DERIVED_PERMISSION_KEYS=['financeEligibleAsDirectReportedFact','automaticComparisonAllowed','automaticAggregationAllowed','canonicalFactPromotionAllowed'];
export const OFFICIAL_FINANCIAL_HOSTS=['ir.obayashi.co.jp','disclosure2dl.edinet-fsa.go.jp','www2.jpx.co.jp','www.shinnihon-c.co.jp','www.wave-nakano.co.jp'];
export const PUBLIC_FINANCIAL_KEYS=new Set(('actualStatus asReportedAtStatus automaticAggregationAllowed automaticComparisonAllowed calculationState canonicalFactId canonicalFactPromotionAllowed canonicalFreshness captionPage column companyId companyMasterListed companyName comparisonEquivalenceId comparisonProofPayloadSha256 comparisonVerificationId concept consolidated contextRef currency currentOfficialVersionMatchStatus currentStatus decisionSha256 definitionVersion denominator dependencyHash difference displayRounding displayRoundingLimit documentId documentVersionSha256 end equivalenceId equivalenceScope eventId exact exactPairPdfProof factFingerprint factId financeEligibleAsDirectReportedFact financialSearchReferenceScope formulaId grossProfitCaptionQuote grossProfitConcept grossProfitGuard grossProfitGuardOnly htmlMember identityScope inputDependencies inputFactIds inputId inputRecordIds inverseCheck issuerCode issuerFrontQuote limits metadataFileSha256 method metricId notRegisteredAsNewMetric numerator numericalPage officialDomain originalAcquiredAtUtc originalSourceUrl originalSourceUrlStatus ownStandalone pdfPage periodContinuity periodEnd periodFrom periodHeaderQuote periodStart periodTo permissions printedPage quote reasonCodes recomputedExact recordKind registeredAtUtc reportingBasis restatementStatus resultId retrievedAtBasis retrievedAtUtc revenueCaptionQuote revenueConcept revenueRowQuote reviewWindow reviewedAtUtc rowIndex rowLabel sameIssuerExactPeriodCurrencyUnit sameIssuerScopePeriodUnit sameIssuerScopePeriodUnitBasis scope semanticEquivalenceId semanticEquivalencePayloadSha256 semanticEquivalenceScope semanticLabelProof semanticProof sourceConceptInterpretation sourceCurrentness sourceDocumentId sourceDocumentType sourceFileSha256 sourceFixtureSha256 sourceInputKind sourceLocator sourceQuote sourceReceiptSha256 sourceSeriesId sourceSeriesSnapshotHash sourceTitle sourceUrl start state statementTitle status tableIndex unit unroundedDecimal validation value valueAsReviewed verificationStatus versionPerspective yearColumnRule name formula outputUnit inputConcept meaning requiredScope requiredCurrency requiredInputUnit requiresPositivePrior displayDecimalPlaces zeroOrNegativeDenominator edinetCode targetWindowStatus targetWindowReasonCodes requiredTargetPeriods availableResultCount storedResultCount').split(' '));
const privateKey=/(?:path|local.*file|rawhtml|localSource|^source(?:Receipt)?File$|secret|password|token|credential|cookie|email|phone|person|contact|address|sheet|drive|client|internal)/i;
const privateValue=/(?:\/Volumes\/|\/Users\/|file:\/\/|data\/raw\/|https?:\/\/github\.com\/)/i;
export function officialFinancialUrl(candidate){
 if(typeof candidate!=='string'||!candidate.startsWith('https://'))return null;
 try{const url=new URL(candidate);return url.protocol==='https:'&&!url.username&&!url.password&&OFFICIAL_FINANCIAL_HOSTS.includes(url.hostname)&&![...url.searchParams.keys()].some(k=>/token|key|secret|password|authorization|signature|email|phone|credential|cookie/i.test(k))?url.href:null;}catch{return null;}
}
/** Existing publicAnalysisAsset redaction rules, narrowed to known public financial metadata. */
export function assertOfficialFinancialUrls(value){if(typeof value!=='string')return;for(const url of value.match(/https?:\/\/[^\s<>"')]+/g)||[])if(!officialFinancialUrl(url))throw Error('公開公式財務資料以外のURLがmetadataにあります。');}
export function publicFinancialValue(value,key=''){
 if(Array.isArray(value))return value.map(v=>publicFinancialValue(v,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!privateKey.test(k)&&PUBLIC_FINANCIAL_KEYS.has(k)).map(([k,v])=>[k,publicFinancialValue(v,k)]));
 if(typeof value==='string'){
  if(privateValue.test(value))return '[非公開参照]';
  assertOfficialFinancialUrls(value);
  if(/(?:sourceUrl|originalSourceUrl)$/i.test(key)&&value!==''&&!officialFinancialUrl(value))throw Error('公開金融資料の公式URLを確認できません。');
 }
 return value;
}
export function assertPublicFinancialData(value){
 function walk(v,key=''){
  if(Array.isArray(v))return v.forEach(item=>walk(item,key));
  if(v&&typeof v==='object')return Object.entries(v).forEach(([k,item])=>{if(privateKey.test(k)||!PUBLIC_FINANCIAL_KEYS.has(k))throw Error('公開対象外のmetadata項目です。');walk(item,k);});
  if(typeof v==='string'&&(privateValue.test(v)||v==='[非公開参照]'))throw Error('公開対象外の出典参照が残っています。');
  if(typeof v==='string')assertOfficialFinancialUrls(v);
  if(typeof v==='string'&&/(?:sourceUrl|originalSourceUrl)$/i.test(key)&&v!==''&&!officialFinancialUrl(v))throw Error('公式のHTTPS出典ではありません。');
 }
 walk(value);
}
export function derivedStatus(row){return row.currentStatus?.state||row.calculationState||'unknown';}
export function derivedPeriodLabel(row){
 const label=p=>p?.start&&p?.end?p.start+' ～ '+p.end:'実期間未収録';
 return JSON.stringify(row.periodFrom)===JSON.stringify(row.periodTo)?label(row.periodTo):'前期 '+label(row.periodFrom)+' → 当期 '+label(row.periodTo);
}
export function derivedCompanyName(payload,id){return payload.companies.find(c=>c.companyId===id)?.companyName||id;}
export function derivedDefinitionName(definition){return definition?.name||(definition?.metricId==='group_perimeter_revenue_gap'?'連結と自社単体の売上差額':definition?.metricId)||'派生指標';}
export function derivedDefinitionFormula(definition){return definition?.formula||(definition?.formulaId==='same_issuer_same_period_consolidated_total_revenue_minus_own_standalone_total_revenue_v1'?'consolidated_total_revenue - own_standalone_total_revenue':definition?.meaning)||definition?.formulaId||'';}
export function filterDerivedResults(payload,filters={}){
 const terms=String(filters.query||'').normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
 return payload.results.filter(r=>(!filters.metricId||r.metricId===filters.metricId)&&(!filters.companyId||r.companyId===filters.companyId)&&(!filters.reviewWindow||r.reviewWindow===filters.reviewWindow)&&(!filters.state||derivedStatus(r)===filters.state)&&(!filters.resultId||r.resultId===filters.resultId)&&terms.every(term=>JSON.stringify({row:r,definition:payload.definitions.find(d=>d.metricId===r.metricId),company:derivedCompanyName(payload,r.companyId)}).normalize('NFKC').toLowerCase().includes(term)));
}
export async function validateDerivedAsset(asset,catalog){
 const p=asset?.payload;
 if(asset?.schemaVersion!==1||p?.schemaVersion!==1||p.datasetId!=='buildbase-derived-indicators-public'||p.origin?.datasetId!==DERIVED_SOURCE_DATASET||p.origin?.sourceSnapshotHash!==DERIVED_SOURCE_SNAPSHOT||p.origin?.generatedFrom!=='Source saved verified-indicator export; public financial projection'||asset.projectionHash!==await canonicalSha256(p)||catalog&&catalog.projectionHash!==asset.projectionHash)throw Error('派生指標の出典版・公開投影hashを確認できません。');
 if(!Array.isArray(p.results)||p.results.length!==141||!Array.isArray(p.definitions)||p.definitions.length!==5||!Array.isArray(p.companies)||p.companies.length!==23||new Set(p.results.map(r=>r.resultId)).size!==141)throw Error('派生指標の収録範囲を確認できません。');
 for(const permissions of [p.permissions,...p.results.map(r=>r.permissions)])if(DERIVED_PERMISSION_KEYS.some(k=>permissions?.[k]!==false))throw Error('派生指標の利用条件を確認できません。');
 for(const r of p.results){assertPublicFinancialData(r);if(!p.definitions.some(d=>d.metricId===r.metricId)||!p.companies.some(c=>c.companyId===r.companyId)||!['百万円','%'].includes(r.unit)||![r.periodFrom,r.periodTo].every(period=>/^\d{4}-\d{2}-\d{2}$/.test(period?.start||'')&&/^\d{4}-\d{2}-\d{2}$/.test(period?.end||'')))throw Error('派生結果の定義・会社・実期間・単位を確認できません。');}
 for(const group of [p.definitions,p.companies])assertPublicFinancialData(group);
 return p;
}
export function derivedExport(asset,filters={}){
 const p=asset.payload,records=filterDerivedResults(p,filters),metrics=new Set(records.map(r=>r.metricId));
 return {schemaVersion:1,exportScope:'selected_derived_results',origin:p.origin,sourceSnapshotHash:p.origin.sourceSnapshotHash,projectionHash:asset.projectionHash,conditions:filters,permissions:p.permissions,definitions:p.definitions.filter(d=>metrics.has(d.metricId)),records};
}
export function derivedCsv(asset,filters={}){
 const out=derivedExport(asset,filters),headers=['source_snapshot_hash','public_projection_hash','result_id','company_id','company_name','metric_id','definition_version','formula_id','formula','value','unit','period_from','period_to','review_window','reporting_basis','calculation_state','current_status','reason_codes','input_ids','input_dependencies','validation','permissions','canonical_freshness','source_currentness','registered_at_utc'];
 const rows=out.records.map(r=>{const definition=out.definitions.find(d=>d.metricId===r.metricId);return [out.sourceSnapshotHash,out.projectionHash,r.resultId,r.companyId,derivedCompanyName(asset.payload,r.companyId),r.metricId,r.definitionVersion,r.formulaId,derivedDefinitionFormula(definition),r.value,r.unit,JSON.stringify(r.periodFrom),JSON.stringify(r.periodTo),r.reviewWindow,r.reportingBasis||'',r.calculationState,derivedStatus(r),JSON.stringify(r.reasonCodes||[]),JSON.stringify(r.inputRecordIds||r.inputFactIds||[]),JSON.stringify(r.inputDependencies),JSON.stringify(r.validation),JSON.stringify(r.permissions),r.canonicalFreshness,JSON.stringify(r.sourceCurrentness),r.registeredAtUtc];});
 return '\uFEFF'+serializeCsv([headers,...rows]);
}
