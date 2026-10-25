import{canonicalJson}from'./buildbase-contract-hash.mjs';import{approvedAnnualPins}from'./reviewed-approved-annual-pins.mjs';
export const APPROVED_ANNUAL_MODE='reported_annual_source_batch_with_holds';
const presentationKeys=new Set(['snapshotHash','timeLabels','tableId','tableTitle','coordinates','requiresObservationReview','metricDefinition','definitionReview','timeMask','chartKind','axis','color','sourceLabel','sources','notes']);
export function validApprovedAnnualSeries(s){
 const pin=approvedAnnualPins[s?.id];if(s?.comparisonPolicyMode!==APPROVED_ANNUAL_MODE||s.calculationAllowed!==false||typeof pin!=='string')return false;
 const expected=JSON.parse(pin),keys=Object.keys(expected),display=s.tableId==='buildbase-source-verified-annual'&&s.requiresObservationReview===true;
 if(Object.keys(s).some(k=>!keys.includes(k)&&!(display?presentationKeys.has(k):['snapshotHash','timeLabels'].includes(k))))return false;
 if(display&&(s.coordinates?.cat01!==s.companyId||s.coordinates?.tab!==s.metricId||s.coordinates?.reviewWindow!==s.reviewWindow||s.metricDefinition!==s.metricLabelAsDisclosed||!s.label?.includes(s.metricLabelAsDisclosed)))return false;
 if(!Array.isArray(s.points)||!s.points.length||(!display&&s.points.length!==expected.points.length))return false;
 const pointPins=new Map(expected.points.map(p=>[p.timeCode,canonicalJson(p)])),seen=new Set();
 for(const p of s.points){if(seen.has(p.timeCode))return false;seen.add(p.timeCode);let source=p;
  if(display){if(p.value!==String(p.numericValue)||p.unit!==s.unit||p.annotation!==null||p.sourceId!==p.evidenceId)return false;const{value,unit,annotation,sourceId,...original}=p;source=original;}
  if(canonicalJson(source)!==pointPins.get(p.timeCode))return false;
 }
 const core=Object.fromEntries(keys.map(k=>[k,k==='points'?expected.points:k==='label'&&display?expected.label:s[k]]));return canonicalJson(core)===pin;
}
