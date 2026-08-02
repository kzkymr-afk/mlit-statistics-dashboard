# データ格納ルール

このディレクトリは、国交省・e-Statから収集する統計データ、
BuildBaseから同期する会社別確定値、アプリが生成する整形データ・出力を用途別に分離して保管します。

| フォルダ | 用途 | Git管理 |
| --- | --- | --- |
| `catalogs/` | アプリが読み込む収集台帳・項目定義 | 対象 |
| `raw/` | 公式APIレスポンス、取得したExcelなどの原本 | 対象外 |
| `normalized/` | 統計横断で扱える共通形式へ整形したJSON・CSV・Parquet | 対象外 |
| `database/` | 正規化SQLite、更新用DB、索引 | 対象外 |
| `snapshots/` | 取得失敗時にも画面表示できる配布用スナップショット | 対象 |
| `exports/` | 利用者が画面から出力したCSV・Excel | 対象外 |
| `cache/` | 再取得・再生成できる一時ファイル | 対象外 |

## 保存時に残す情報

収集データには、数値だけでなく次の情報を一緒に残します。

- 政府統計コード・統計表ID
- 項目、地域、時間、分類の各コード
- 単位と注釈
- 公式掲載URL
- 取得日時
- 公表・改訂年月
- 原本のファイル名または取得識別子

正本は `database/mlit-statistics-system.sqlite` です。統計表、公式分類コード、
系列、年度別観測値、単位、注釈、出典を別テーブルで保持します。
`database/mlit-statistics.sqlite` は旧Excelビュー用で、正本ではありません。

2026年8月2日時点の正本は、14データセット・227統計表・17,762,723系列、
2013年・2013年度以降185,494,347件の観測セルを収録しています。数値の0は
欠測と区別できる年度マスクで暗黙保持し、非0・欠測・秘匿・注記付きの
行だけを `observations` に保存します。62時点を超える
時間軸は `time_mask_text` の可変長マスクで保持します。

`raw/`、`normalized/`、`database/` は運用データなので、GitHubではなく
Businessフォルダを対象にしたバックアップで保護します。SQLite本体は
GitHubへアップロードしません。公開用に生成した項目レジストリと
系列ID先頭2桁で分割した圧縮観測値だけをPages用アーカイブとして、GitHub Releaseの
`data-current` に保存します。

## 現在の原本

- `raw/building-starts/annual/<年度>/` — 建築物着工統計
- `raw/construction-orders-major-50/annual/<年度>/` — 受注動態（大手50社）
- `raw/api/renovation/` — 建築物リフォーム・リニューアル調査（年度次・四半期）
- `raw/api/<データセットID>/` — 月次着工、大手50社月次、出来高、デフレーター、投資、施工統計
- `raw/excel/construction-labor/` — 建設労働需給調査（月次）
- `raw/excel/construction-materials/` — 主要建設資材需給・価格動向調査（月次）
- `raw/excel/building-stock/` — 建築物ストック統計
- BuildBase会社別データ — BuildBaseの最終表から`npm run sync:buildbase`で正規化DBへ同期

対応する収集台帳は `catalogs/` に保存します。公開アプリには原本を
同梱せず、正規化SQLiteから項目レジストリ、分類候補、系列の年度値を
`public/system/` へ生成します。
`public/data/` は旧Excelビュー用です。
