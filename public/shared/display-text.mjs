const words={'原表':'出典資料','原値':'資料に記載された数値','原セル':'資料の該当箇所','原指標':'資料の指標','原表示':'資料の表示','原期間':'対象期間','原Fact':'資料の記録','元Fact':'資料の記録','Fact':'資料の記録','metadata':'出典情報','Source審査':'確認','原本hash':'保存資料の照合情報'};
const labels={consolidated:'連結',standalone:'単体',segment:'事業別',closing_stock:'期末時点',point_in_time_stock:'期末時点',annual_flow:'通期',quarter_cumulative_9months_flow:'第3四半期までの累計',quarter_cumulative_9months:'第3四半期までの累計',interim_cumulative_6months_flow:'上半期累計',actual:'実績',forecast:'予想',source_stated:'資料に記載',unconfirmed:'未確認',ok:'確認済み',Japan_GAAP:'日本基準',JPY:'円'};
export function displayText(value,fallback='詳細は出典資料をご確認ください'){
 let text=String(value??'');for(const[a,b]of Object.entries(words).sort((a,b)=>b[0].length-a[0].length))text=text.replaceAll(a,b);
 if(labels[text])return labels[text];
 for(const[a,b]of Object.entries(labels))text=text.replace(new RegExp('\\b'+a+'\\b','g'),b);
 if(/[{}]/.test(text))return fallback;
 if(/(?:[a-f0-9]{32,}|\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b|\/Volumes\/|\/Users\/|data\/raw\/|["{][A-Za-z][A-Za-z0-9]*[":])/.test(text))return fallback;
 return text;
}
export function humanizeHtml(html){
 // Only visible text is formatted. Routing IDs, input values and export records are untouched.
 return html.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/g,'<p class="small">詳細な出典情報は書き出しデータに保持しています。</p>')
 .replaceAll('原資料 / 原本SHA-256','出典資料')
 .replace(/<dt>[^<]*(?:ID|定義版)[^<]*<\/dt>\s*<dd>[\s\S]*?<\/dd>/g,'')
 .replace(/>([^<>]+)</g,(_,text)=>'>'+displayText(text,'') .replace(/\b[a-f0-9]{8,12}\b/g,'').replace(/\s*\[[A-Za-z0-9-]+\]/g,'').replace(/\b(?:fact|Fact|ID)\b/g,'記録')+'<');
}
export function metricDisplay(record={},fallback='資料に記載された指標'){
 const value=record.metricLabel||record.source_metric_label||record.source_label||record.reported_category_as_disclosed||record.source_metric_label_as_disclosed||record.source_row_label;
 const id=record.metricId||record.metric_id||'';const kind=/backlog|work_available/.test(id)?'繰越工事高':/orders/.test(id)?'受注高':/gross.*profit.*ratio|gross.*margin/.test(id)?'売上総利益率':/gross.*profit/.test(id)?'売上総利益':/operating.*income|operating.*profit/.test(id)?'営業利益':/ordinary.*profit|ordinary.*income/.test(id)?'経常利益':/assets/.test(id)?'資産':/sales|revenue/.test(id)?'売上高':/profit/.test(id)?'利益':fallback;return displayText(value||kind,kind);
}

/** Axis labels only; preserve fractional ratios without modifying observations. */
export function axisTickLabel(value){
 if(!Number.isFinite(value))return '';
 if(Math.abs(value)>=10000)return (value/10000).toFixed(1)+'万';
 return Number(value.toPrecision(4)).toLocaleString('ja-JP',{maximumFractionDigits:6});
}
