import {canonicalSha256} from './buildbase-contract-hash.mjs';
import {DERIVED_SOURCE_DATASET,DERIVED_SOURCE_SNAPSHOT,DERIVED_PERMISSION_KEYS,publicFinancialValue,assertPublicFinancialData,officialFinancialUrl,validateDerivedAsset,PUBLIC_FINANCIAL_KEYS} from '../public/explorer/derived-data.mjs';
const permittedDocumentTypes=new Set(['annual_securities_report','securities_report','databook','earnings_release']);
const hashPattern=/^[a-f0-9]{64}$/;
const resultKeys=new Set(('asReportedAtStatus calculationState canonicalFreshness companyId companyMasterListed companyName comparisonEquivalenceId currentStatus definitionVersion dependencyHash financialSearchReferenceScope formulaId inputDependencies inputFactIds inputRecordIds issuerCode limits metricId periodFrom periodTo permissions reasonCodes registeredAtUtc reportingBasis resultId reviewWindow semanticEquivalenceId semanticEquivalencePayloadSha256 semanticEquivalenceScope sourceCurrentness sourceInputKind sourceSeriesId sourceSeriesSnapshotHash unit validation value versionPerspective').split(' '));
export async function projectDerivedIndicators(response){
 const source=response?.payload;
 if(source?.datasetId!==DERIVED_SOURCE_DATASET||source.contractVersion!==1||response.snapshotHash!==DERIVED_SOURCE_SNAPSHOT||await canonicalSha256(source)!==response.snapshotHash)throw Error('Sourceの派生指標snapshotが一致しません。');
 if(DERIVED_PERMISSION_KEYS.some(k=>source.permissions?.[k]!==false))throw Error('Sourceの派生指標利用条件が変わっています。');
 const results=source.results.map(row=>{
  for(const input of row.inputDependencies||[]){
   if(!hashPattern.test(input.sourceFileSha256||'')||!permittedDocumentTypes.has(input.sourceDocumentType)&&input.sourceInputKind!=='official_public_pdf_saved_review'&&input.recordKind!=='source_verified_own_standalone_input_for_derived_indicator')throw Error('公開公式財務資料の入力profileを確認できません。');
   for(const url of [input.sourceUrl,input.originalSourceUrl].filter(Boolean))if(!officialFinancialUrl(url))throw Error('公開公式財務資料以外のURLです。');
  }
  const projected=publicFinancialValue(Object.fromEntries(Object.entries(row).filter(([key])=>resultKeys.has(key))));
  projected.inputDependencies=projected.inputDependencies.map(input=>({...input,sourceUrl:input.sourceUrl??null}));
  assertPublicFinancialData(projected);
  return projected;
 });
 const companyIds=[...new Set(results.map(r=>r.companyId))].sort();
 const companies=companyIds.map(id=>{
  const entry=[...source.financialMasterCoverage,...source.financialIdentityExtensions].find(c=>c.companyId===id);
  if(!entry)throw Error('派生結果の会社IDの公開範囲を確認できません。');
  return publicFinancialValue(Object.fromEntries(['companyId','companyName','edinetCode','issuerCode','reportingBasis','scope','status','targetWindowStatus','targetWindowReasonCodes','requiredTargetPeriods','reviewWindow','periodFrom','periodTo','availableResultCount','storedResultCount'].filter(k=>entry[k]!==undefined).map(k=>[k,entry[k]])));
 });
 const payload={schemaVersion:1,datasetId:'buildbase-derived-indicators-public',origin:{datasetId:source.datasetId,sourceContractVersion:source.contractVersion,sourceSnapshotHash:response.snapshotHash,generatedFrom:'Source saved verified-indicator export; public financial projection',canonicalFreshness:'not_checked',currentOfficialVersionMatchStatus:'unconfirmed',directFactPromotionAllowed:false,projectionOmissions:['Private storage paths and secret/person/contact fields','Processed-sheet and project coverage','Original local documents are not attached','Missing source URLs remain null']},definitions:publicFinancialValue(source.definitions),companies,results,permissions:source.permissions,
  operatingMarginCohorts:{sameMarchJgaapCompanyIds:source.operatingMarginCoverage.sameMarchJgaapReferenceCompanyIds,ifrsBasisDifferenceCompanyIds:source.operatingMarginCoverage.ifrsBasisDifferenceCompanyIds,actualPeriodDifferenceCompanyIds:source.operatingMarginCoverage.actualPeriodDifferenceCompanyIds,missingInputCompanyIds:source.operatingMarginCoverage.missingInputCompanyIds}};
 const asset={schemaVersion:1,projectionHash:await canonicalSha256(payload),payload};
 await validateDerivedAsset(asset);
 return asset;
}
export function derivedPublicSchema(){
 const permissionSchema={type:'object',additionalProperties:false,required:DERIVED_PERMISSION_KEYS,properties:Object.fromEntries(DERIVED_PERMISSION_KEYS.map(k=>[k,{const:false}]))};
 const sourceUrlSchema={anyOf:[{type:'null'},{type:'string',pattern:'^https://(?:ir\\.obayashi\\.co\\.jp|disclosure2dl\\.edinet-fsa\\.go\\.jp|www2\\.jpx\\.co\\.jp|www\\.shinnihon-c\\.co\\.jp|www\\.wave-nakano\\.co\\.jp)/'}]};
 const publicObject={type:'object',additionalProperties:false,properties:Object.fromEntries([...PUBLIC_FINANCIAL_KEYS].sort().map(key=>[key,key==='sourceUrl'||key==='originalSourceUrl'?sourceUrlSchema:key==='permissions'?permissionSchema:{$ref:'#/$defs/financialValue'}]))};
 const resultSchema={...publicObject,required:['resultId','companyId','metricId','formulaId','value','unit','periodFrom','periodTo','permissions','inputDependencies']};
 return {$schema:'https://json-schema.org/draft/2020-12/schema',title:'Atlas public derived financial result snapshot',type:'object',additionalProperties:false,required:['schemaVersion','projectionHash','payload'],
  $defs:{financialValue:{anyOf:[{type:['string','number','boolean','null']},{type:'array',items:{$ref:'#/$defs/financialValue'}},publicObject]}},
  properties:{schemaVersion:{const:1},projectionHash:{type:'string',pattern:'^[a-f0-9]{64}$'},payload:{type:'object',additionalProperties:false,required:['schemaVersion','datasetId','origin','definitions','companies','results','permissions','operatingMarginCohorts'],properties:{schemaVersion:{const:1},datasetId:{const:'buildbase-derived-indicators-public'},origin:{type:'object',additionalProperties:false,required:['datasetId','sourceContractVersion','sourceSnapshotHash','generatedFrom','canonicalFreshness','currentOfficialVersionMatchStatus','directFactPromotionAllowed','projectionOmissions'],properties:{datasetId:{const:DERIVED_SOURCE_DATASET},sourceContractVersion:{const:1},sourceSnapshotHash:{const:DERIVED_SOURCE_SNAPSHOT},generatedFrom:{const:'Source saved verified-indicator export; public financial projection'},canonicalFreshness:{const:'not_checked'},currentOfficialVersionMatchStatus:{const:'unconfirmed'},directFactPromotionAllowed:{const:false},projectionOmissions:{type:'array',items:{type:'string'}}}},definitions:{type:'array',minItems:5,maxItems:5,items:publicObject},companies:{type:'array',minItems:23,maxItems:23,items:publicObject},results:{type:'array',minItems:141,maxItems:141,items:resultSchema},permissions:permissionSchema,operatingMarginCohorts:{type:'object',additionalProperties:false,properties:Object.fromEntries(['sameMarchJgaapCompanyIds','ifrsBasisDifferenceCompanyIds','actualPeriodDifferenceCompanyIds','missingInputCompanyIds'].map(key=>[key,{type:'array',items:{type:'string'}}]))}}}}};
}
