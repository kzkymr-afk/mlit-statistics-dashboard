export const reviewedCompanyDisplayNames=Object.freeze({"MATSUI": "松井建設", "ZENITAKA": "錢高組", "KAJIMA": "鹿島建設", "OBAYASHI": "大林組", "TAISEI": "大成建設", "SHIMIZU": "清水建設", "ANDO_HAZAMA": "安藤・間", "NISHIMATSU": "西松建設", "PENTA": "五洋建設", "OKUMURA": "奥村組", "KUMAGAI": "熊谷組", "TODA": "戸田建設", "TOA": "東亜建設工業", "TOKYU": "東急建設", "HASEKO": "長谷工コーポレーション", "ASANUMA": "淺沼組", "KITANO": "北野建設", "TAKENAKA": "竹中工務店", "SMCC": "三井住友建設", "MAEDA": "前田建設工業", "INFR": "インフロニア"});
export function companyDisplayIdentityError(series){
 if(!series||!Object.hasOwn(series,'companyName'))return null;
 const expected=reviewedCompanyDisplayNames[series.companyId];
 if(!expected||series.companyName!==expected||typeof series.label!=='string'||series.label.split(' / ')[0]!==expected)return '会社IDと会社表示名の対応を確認できません。';
 return null;
}
