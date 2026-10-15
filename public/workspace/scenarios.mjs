import {GP} from './model.mjs';

export function sampleState(id,verified,quarters,market){
 const state={title:{peers:'競合との違いを知りたい',company:'1社の業績を、複数の指標で読みたい',market:'企業の動きと、市場の関係を見たい'}[id],series:[],from:2021,to:2025,mode:'auto',showAnalysis:false};
 if(!state.title)throw Error('問いの例が見つかりません。');
 if(id==='peers'){
  state.series=verified.filter(s=>s.metricId===GP&&['OBAYASHI','KAJIMA'].includes(s.companyId)).sort((a,b)=>a.companyId==='OBAYASHI'?-1:1);
  if(state.series.length!==2)throw Error('大林組と鹿島建設の確認済み資料が揃っていません。');
 }
 if(id==='company'){
  state.from=2024;
  state.series=quarters.filter(s=>s.companyId==='ANDO_HAZAMA'&&s.scope==='consolidated'&&s.periodType==='quarter_cumulative_9months'&&['sales_consolidated_reported','operating_profit_consolidated_reported'].includes(s.metricId)).sort((a,b)=>a.metricId==='sales_consolidated_reported'?-1:1).map((s,i)=>({...s,axis:i===1?'right':'left'}));
  if(state.series.length!==2)throw Error('安藤ハザマの同じ9か月累計期間の2指標が揃っていません。');
 }
 if(id==='market'){
  const company=verified.find(s=>s.companyId==='OBAYASHI'&&s.metricId==='obayashi_databook_construction_orders_reported');
  if(!company||!market?.points?.length)throw Error('大林組の受注高または国交省の原表系列を確認できません。');
  state.series=[company,market];
 }
 return state;
}
