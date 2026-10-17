export function acceptedWorkspaceHash(hash){
 if(hash==='#home'||hash==='#saved'||hash==='#financial')return hash;
 if(typeof hash!=='string'||!hash.startsWith('#analysis=')||hash.length>12000||/[\r\n\u0000]/.test(hash))return null;
 try{
  const spec=JSON.parse(decodeURIComponent(hash.slice(10)));
  if(!spec||typeof spec!=='object'||typeof spec.title!=='string'||spec.title.length>300||
   !Number.isInteger(spec.from)||!Number.isInteger(spec.to)||spec.from<2013||spec.to>2030||spec.from>spec.to||
   !Array.isArray(spec.series)||spec.series.length>12||spec.series.some(s=>!s||typeof s.id!=='string'||s.id.length>500||s.axis&&!['left','right'].includes(s.axis)))return null;
  return hash;
 }catch{return null;}
}
export function acceptedWorkspaceMessage(event,expectedOrigin,expectedSource,advanced=false){
 if(advanced||!expectedSource||event.origin!==expectedOrigin||event.source!==expectedSource||event.data?.type!=='atlas-workspace-state')return null;
 return acceptedWorkspaceHash(event.data.hash);
}
export function workspaceRestoreMessage(hash,advanced=false){return advanced?null:{type:'atlas-workspace-restore',hash};}
