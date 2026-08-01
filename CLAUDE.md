# 建設統計を使った分析

このプロジェクトには `mlit-statistics` MCP が設定済みです。建設業界・自社・
同業他社の分析では、UIを自動クリックせずMCPから正規化DBを検索してください。

- `search_statistical_tables` → `get_table_schema` → `query_statistics` の順で使う。
- queryではtime以外の全分類を指定し、最終成果物には公式分類コードを残す。
- 表・SVGグラフ・CSV・出典をまとめて作るときは `create_report_bundle` を使う。
- 社内・他社データは `customSeries` として比較できる。source情報を必ず付ける。
- 数値を引用するときは統計表ID、対象期間、単位、出典URLを明記する。
- 0、欠測、秘匿値は別物として扱い、statusとannotationを消さない。

詳細とCLI例は `docs/AI_ANALYSIS_GUIDE.md` を参照してください。
