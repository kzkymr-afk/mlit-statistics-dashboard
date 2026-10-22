import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {acceptedWorkspaceHash,acceptedWorkspaceMessage,workspaceRestoreMessage} from '../lib/atlas-workspace-bridge.mjs';
import {workspaceDocument} from '../lib/atlas-workspace-document.mjs';
import {validatedPacket} from '../public/explorer/data-view.mjs';
import {makeVerified,compatible,correlation,GP} from '../public/workspace/model.mjs';

test('workspace keeps the published search index for category names',async()=>{
 const oldFetch=globalThis.fetch,oldWindow=globalThis.window;
 globalThis.window={__ATLAS_EXPLORER__:{base:'/mlit-statistics-dashboard/'}};
 globalThis.fetch=async url=>new Response(readFileSync(new URL('../public/'+url.slice('/mlit-statistics-dashboard/'.length),import.meta.url)));
 try{
  const {workspaceIndex}=await import('../public/workspace/static-data.mjs');
  const catalog=await workspaceIndex();
  assert.equal(catalog.tables.length,235);
  assert.ok(catalog.tables.some(t=>t.id==='0003119730'&&t.searchText.includes('工場')));
  assert.ok(catalog.tables.every(t=>t.id!=='buildbase-company-annual'));
 }finally{globalThis.fetch=oldFetch;globalThis.window=oldWindow;}
});

test('workspace bridge accepts only bounded same-origin analysis state',()=>{
 const hash='#analysis='+encodeURIComponent(JSON.stringify({title:'競合比較',series:[{id:'v:OBAYASHI',axis:'left'}],from:2021,to:2025}));
 assert.equal(acceptedWorkspaceHash(hash),hash);
 assert.equal(acceptedWorkspaceHash('#home'),'#home');
 assert.equal(acceptedWorkspaceHash('#saved'),'#saved');
 assert.equal(acceptedWorkspaceHash('#financial'),'#financial');
 const source={},event={origin:'https://example.test',source,data:{type:'atlas-workspace-state',hash}};
 assert.equal(acceptedWorkspaceMessage(event,event.origin,source),hash);
 assert.equal(acceptedWorkspaceMessage({...event,origin:'https://other.test'},event.origin,source),null);
 assert.equal(acceptedWorkspaceMessage({...event,source:{}},event.origin,source),null);
 assert.equal(acceptedWorkspaceMessage(event,event.origin,source,true),null);
 for(const invalid of ['#analysis=not-json','#analysis='+encodeURIComponent(JSON.stringify({title:'x',series:[{id:'x'}],from:2025,to:2021})),'#analysis='+encodeURIComponent(JSON.stringify({title:'x',series:Array.from({length:13},(_,i)=>({id:String(i)})),from:2021,to:2025})),'#evil=1']) assert.equal(acceptedWorkspaceHash(invalid),null);
 assert.deepEqual(workspaceRestoreMessage(hash),{type:'atlas-workspace-restore',hash});
 assert.equal(workspaceRestoreMessage(hash,true),null);
});

test('workspace document stays under Pages base path and escapes dynamic content',()=>{
 const html=workspaceDocument('/mlit-statistics-dashboard','#home','https://example.test','0.3.0','123456789');
 assert.match(html,/<base href="\/mlit-statistics-dashboard\/">/);
 assert.match(html,/src="\/mlit-statistics-dashboard\/workspace\/app.mjs\?v=123456789"/);
 assert.match(html,/href="\/mlit-statistics-dashboard\/workspace\/styles.css\?v=123456789"/);
 assert.match(html,/UI v0\.3\.0/);
 assert.equal(workspaceDocument('', '</script><script>alert(1)</script>','https://example.test','0.3.0','x').includes('</script><script>alert'),false);
});

test('published annual facts retain review windows and correlation gating',async()=>{
 const packet=JSON.parse(readFileSync(new URL('../public/system/buildbase/source-verified-comparison.json',import.meta.url)));
 const verified=makeVerified(await validatedPacket(packet),{});
 const peers=verified.filter(s=>s.metricId===GP);
 assert.equal(peers.length,2);
 assert.deepEqual(peers.map(s=>s.points.length),[5,5]);
 assert.equal(compatible(peers).ok,true);
 assert.equal(correlation(peers,2021,2025).ok,false);
 const three=correlation(peers,2021,2023);
 assert.equal(three.ok,true);
 assert.equal(three.n,3);
 assert.equal(three.pairs.length,3);
});
