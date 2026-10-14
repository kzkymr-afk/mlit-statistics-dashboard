# 四半期財務資料の公開表示契約

新UIの「四半期」または統合検索の「会社名 · 四半期資料」から、21社の確認状況と北野建設の113件を開く。既存Q3資料105件（9か月累計97件、月表記の残高等8件）とQ1資料8件（3か月累計）だけを公開表示用に投影する。現年と前年の比較欄、連結とセグメント・調整欄、金額・比率・1株当たり、原資料の行役割を保持する。単独四半期へ変換しない。

21社の一覧CSVは `explorer/quarterly-coverage.csv`。保存された四半期財務記録と資料索引の範囲だけを示す。他20社の収録0件は未確認であり、全社IR資料の網羅的調査や非開示の判断ではない。単独Q4直接報告値も未確認。ローカルの年次8件・Q4差分候補8件は今回の投影に含めない。

公開ファイルは `public/explorer/quarterly-financials.json.gz`、同catalog/schema JSON、一覧CSV。原データはSourceの既存 `facts_effective.jsonl` の2つの抽出器 `reviewed_kitano_q3_summary_segments_v1` / `reviewed_kitano_q1_summary_v1`。生成元をSourceの正規化済み四半期財務記録と明記し、DB・既存派生141件のexportを生成元と扱わない。公開assetは独立し、既存主指標20件、派生141件、旧65指標・21社・236統計表の収録を変更しない。

投影は財務項目とPDF原文位置の明示的許可リストを使う。公式財務PDFは `https://www.kitano.co.jp/wp-content/uploads/` 以下の2版に固定し、URL・文書SHA-256・原本PDFを照合する。すべての公開文字列に公式HTTPS URL以外やローカル参照が残っていないことを確認する。保存パス、索引の行番号、非公開Sheet/Drive、個人・連絡先、raw wrapperは公開しない。同一内容をQ2と呼ぶ資料索引の矛盾は、公開タイトル・公式URL・扱いだけを残し、本文と原本hashに基づくQ3をQ2へ変えない。

`value` / `value_raw` / `unit` / 原文と位置はそのまま保持。百万円未満切捨てを含む原資料の表示精度を上げない。1株当たり値の円銭と原資料の株式分割調整注記・根拠ページを保持する。残高等8件は月までの記録で、`as_of_date` / 開始日 / 終了日はnullのまま。取得日時・現在公式版との一致・資料全体の確認状態を推定しない。財務分析への利用、直接確定値への昇格、自動比較・合算の公開許可はすべてfalse。

UIは25件ずつ全113件を表示でき、会社・20指標・期間種別・連結/セグメント・原文検索で絞り込む。CSV/JSONは表示ページだけでなく条件に一致する全件を出力する。原値・原状態・株式分割・調整・収益認識・原文位置・出典hashと許可情報を残す。CSVには完全な公開原記録JSON列もある。URL stateは `view=quarterly` と独立した `quarterCompany/Metric/Period/Scope/Query` を保持し、主指標・派生141件の条件を上書きしない。既存の詳細設定と認証の契約は変更しない。

再生成は読取専用のSource rootと21社coverage JSONを指定する。Source/DBには書き込まない。

```sh
node scripts/export-atlas-quarterly-public.mjs SOURCE_ROOT COVERAGE_JSON
ATLAS_QUARTER_SOURCE_ROOT=SOURCE_ROOT ATLAS_QUARTER_COVERAGE=COVERAGE_JSON node --test tests/atlas-quarterly-financials.test.mjs
```

公開UIはGitHub Pagesの既存prefix `/mlit-statistics-dashboard/` とローカルroot双方で同じ相対公開URLを使う。ビルドと公開確認はリリース担当の手順で行う。
