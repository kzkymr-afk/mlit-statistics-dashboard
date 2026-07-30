# データ格納ルール

このディレクトリは、国交省・e-Statから収集する統計データと、
アプリが生成する整形データ・出力を用途別に分離して保管します。

| フォルダ | 用途 | Git管理 |
| --- | --- | --- |
| `catalogs/` | アプリが読み込む収集台帳・項目定義 | 対象 |
| `raw/` | 公式APIレスポンス、取得したExcelなどの原本 | 対象外 |
| `normalized/` | 統計横断で扱える共通形式へ整形したJSON・CSV・Parquet | 対象外 |
| `database/` | ローカルSQLite、更新用DB、索引 | 対象外 |
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

`raw/`、`normalized/`、`database/` は運用データなので、GitHubではなく
Businessフォルダを対象にしたバックアップで保護します。最新版の
SQLite圧縮版だけは、Pages再構築用としてGitHub Releaseの
`data-current` に保存します。GitHub側で大型SQLiteを毎回再解析しない
ため、生成済み `pages-data.tar` も同じReleaseへ保存します。

## 現在の原本

- `raw/building-starts/annual/<年度>/` — 建築物着工統計
- `raw/construction-orders-major-50/annual/<年度>/` — 受注動態（大手50社）

対応する収集台帳は `catalogs/` に保存します。公開アプリには原本を
同梱せず、SQLiteから生成した80行単位の表・検索索引・年度系列束だけを
`public/data/` 経由で配布します。
