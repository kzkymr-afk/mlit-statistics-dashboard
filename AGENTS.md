# AI analysis contract

このリポジトリで建設業界・自社・同業他社の分析を行うときは、画面の読み取りや
Excelのセル位置を根拠にせず、`mlit_statistics` MCP または
`npm run ai:stats -- ...` を使って正規化DBから取得する。

## 標準手順

1. `search_statistical_tables` で分析テーマに合う統計表を探す。
2. `get_table_schema` で分類キーと公式分類コードを確認する。
3. `query_statistics` では time 以外の全分類を指定する。
4. 複数系列の比較、社内データとの比較、グラフ作成は
   `create_report_bundle` を使う。
5. レポートには統計表ID、分類コード、対象期間、単位、出典URLを残す。

分類名称でも検索できるが、再現性のため最終的なクエリ定義には分類コードを使う。
欠測と0を混同せず、`status`、`annotation`、`implicitNumericZero` を保持する。
生成素材は `outputs/ai/` 以下に置き、`query-spec.json` と
`provenance.json` を成果物と一緒に管理する。

`customSeries` で社内・他社データを加える場合は、値だけでなく単位、期間、資料名、
URLまたはローカルパス、取得日を `source` に記録する。

BuildBaseの会社別確定値は `npm run sync:buildbase` で正規化DBへ同期する。
公開画面では未入力を0に変換せず、`not_disclosed` と
`publication_pending` を保持する。生の抽出ログ、ローカルパス、非公開GitHub URLは公開しない。
