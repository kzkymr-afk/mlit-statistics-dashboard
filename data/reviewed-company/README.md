# 検証済み財務データ

`reviewed-company-comparisons.json.gz` は会社開示の数値・出典・期間・単位・比較制限を含む正本の配信用コピーです。`manifest.json` のSHAで圧縮前後を照合します。

`npm ci` または `npm run data:prepare-reviewed-company` で検証後、互換JSONとブラウザー用gzipを `public/workspace/` に生成します。既存生成物が入力と異なる場合は上書きしません。更新時は検証済みJSONを置き、`node scripts/prepare-reviewed-company-data.mjs --pack` で圧縮入力を更新します。生成JSONはGitに追加しません。

参考専用・年度不足・資料差・単体連結・計算制限はデータに保持されています。値の収録と通常比較可能は別状態です。
