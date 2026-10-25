import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync, gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export const correction = JSON.parse(readFileSync(new URL('../data/corrections/toa-tenure-2025.json', import.meta.url)));
export const targetSeriesId = createHash('sha256').update('buildbase-company-annual\x1fcat01=TOA\x1ftab=average_tenure').digest('hex').slice(0,32);

// The published registry is downloaded before this step. Refuse any unexpected
// value/shape; never replace another company's data or silently overwrite a fix.
export function correctTenure(bundle) {
  const series = bundle.series?.[targetSeriesId];
  if (!series || series[0] !== correction.unit) throw Error('訂正対象の系列または単位が一致しません');
  const points = series[2].filter(p => p[0] === '2025100000');
  if (points.length !== 1) throw Error('訂正対象年度が一意ではありません');
  const point = points[0];
  if (point[1] === correction.correctedValue) return false;
  if (point[1] !== correction.previousValue || point[2] !== null) throw Error('訂正前値または状態が一致しません');
  point[1] = correction.correctedValue;
  return true;
}

export function prepareBuildBaseCorrections() {
  const file = path.join(root,'public/system/shards',`buildbase-company-comparison-${targetSeriesId.slice(0,2)}.json.gz`);
  const bundle = JSON.parse(gunzipSync(readFileSync(file)));
  if (correctTenure(bundle)) writeFileSync(file,gzipSync(JSON.stringify(bundle),{level:9}));
  console.log('BuildBase correction verified: TOA FY2025 average tenure = 17.8 年');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepareBuildBaseCorrections();
