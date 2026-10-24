import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
const root=fileURLToPath(new URL('../',import.meta.url));
const dataDir=path.join(root,'data/reviewed-company');
const dataFile=path.join(dataDir,'reviewed-company-comparisons.json.gz');
const manifestFile=path.join(dataDir,'manifest.json');
const jsonFile=path.join(root,'public/workspace/reviewed-company-comparisons.json');
const gzipFile=jsonFile+'.gz';
const digest=b=>createHash('sha256').update(b).digest('hex');
export function verifyReviewedAsset(compressed,manifest){
 if(digest(compressed)!==manifest.compressedSha256)throw Error('圧縮データのSHAが一致しません。');
 const raw=gunzipSync(compressed);
 if(raw.length!==manifest.uncompressedBytes||digest(raw)!==manifest.uncompressedSha256)throw Error('展開データのSHAが一致しません。');
 const parsed=JSON.parse(raw);
 if(parsed.snapshotHash!==manifest.snapshotHash)throw Error('データ版が一致しません。');
 return raw;
}
export function prepareReviewedAsset(){
 const compressed=fs.readFileSync(dataFile),manifest=JSON.parse(fs.readFileSync(manifestFile));
 const raw=verifyReviewedAsset(compressed,manifest);
 for(const [p,b]of[[jsonFile,raw],[gzipFile,compressed]]){
  if(fs.existsSync(p)){
   if(digest(fs.readFileSync(p))!==digest(b))throw Error('既存の作業データを上書きしません。圧縮入力との不一致: '+path.relative(root,p));
  }else{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);}
 }
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--pack')){
  const raw=fs.readFileSync(jsonFile),parsed=JSON.parse(raw),compressed=gzipSync(raw,{level:9});
  if(compressed.length>=100*1024*1024)throw Error('GitHub単一ファイル上限を超えます。');
  fs.mkdirSync(dataDir,{recursive:true});
  fs.writeFileSync(dataFile,compressed);fs.writeFileSync(manifestFile,JSON.stringify({schemaVersion:1,compression:'gzip',snapshotHash:parsed.snapshotHash,uncompressedBytes:raw.length,compressedBytes:compressed.length,uncompressedSha256:digest(raw),compressedSha256:digest(compressed)},null,2)+'\n');
 }
 const m=prepareReviewedAsset();
 console.log('Reviewed company data verified:',m.compressedBytes,'compressed bytes;',m.uncompressedBytes,'original bytes;',m.snapshotHash);
}
