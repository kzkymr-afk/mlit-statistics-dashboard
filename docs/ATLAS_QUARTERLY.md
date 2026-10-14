# 四半期財務資料の公開表示契約

新UIの「四半期」または統合検索の「会社名 · 四半期資料」から、21社の確認状況と収録5社341件を開く。北野建設の既存113件（Q3資料の値105件、Q1資料の値8件）は公開済みの全項目をそのまま保持する。公開済みの大林組54件・鹿島建設102件を含む旧269件を全項目そのまま保持し、長谷工30件・安藤ハザマ42件を追加する。現年と前年の比較欄、連結・単体・連結建設事業・セグメント、金額・比率・1株当たり、原資料の行役割を区別する。341は独立した四半期や経済事実の件数ではなく、原表の表示値の記録数。

内訳は3か月累計74、6か月累計66、9か月累計163、直接報告の単独3か月30、月表記の残高等8。資料別の四半期番号で数えるとQ1の値84、Q2の値76、Q3の値181。鹿島のQ1累計と単独Q1は別の原表行に同じ値を記載する10組20記録で、重複を示すIDと非加算の状態を保持する。累計を引き算して単独四半期へ変換しない。全体受注合計は不動産・開発等を含み、建設事業受注として表示しない。

21社の一覧CSVは `explorer/quarterly-coverage.csv`。保存された四半期財務記録と資料索引の範囲だけを示す。他16社の収録0件は未確認であり、全社IR資料の網羅的調査や非開示の判断ではない。単独Q4直接報告値も未確認。ローカルの年次8件・Q4差分候補8件は今回の投影に含めない。

公開ファイルは `public/explorer/quarterly-financials.json.gz`、同catalog/schema JSON、一覧CSV。原データはSourceの既存 `facts_effective.jsonl` の抽出器 `reviewed_kitano_q3_summary_segments_v1` / `reviewed_kitano_q1_summary_v1` / `reviewed_obayashi_kajima_quarterly_fy2025_v1` / `reviewed_haseko_ando_hazama_quarterly_fy2025_v1`。生成元をSourceの正規化済み四半期財務記録と明記し、DB・既存派生141件のexportを生成元と扱わない。公開assetは独立し、既存主指標20件、派生141件、旧65指標・21社・236統計表の収録を変更しない。

投影は財務項目とPDF原文位置の明示的許可リストを使う。主出典の公開URLは17版（北野2・大林3・鹿島6・長谷工3・安藤ハザマ3）を会社・資料種類・URL・文書SHA-256へ固定し、原本PDFを照合する。今回のSourceの大林/鹿島検証対象は12資料（各6）で、そのうち大林の補助参考資料3つは主出典の公開registryに含めない。大林の元の公式配信provider `data.swcms.net/file/obayashi-ir/` と鹿島の保存索引に記録されたURLを保持し、別のwww URLを推定しない。すべての公開文字列に登録した公式HTTPS URL以外やローカル参照が残っていないことを確認する。保存パス、索引の行番号、非公開Sheet/Drive、個人・連絡先、raw wrapperは公開しない。同一内容をQ2と呼ぶ北野の資料索引の矛盾は、公開タイトル・公式URL・扱いだけを残し、本文と原本hashに基づくQ3をQ2へ変えない。

`value` / `value_raw` / `unit` / 原文と位置はそのまま保持。百万円未満切捨てを含む原資料の表示精度を上げず、鹿島の億円を百万円へ変換しない。億円の正確な円額・端数処理は未確認。親・子・小計の値や表示残差を補正・合算しない。1株当たり値の円銭と原資料の株式分割調整注記・根拠ページを保持する。残高等8件は月までの記録で、`as_of_date` / 開始日 / 終了日はnullのまま。取得日時・現在公式版との一致・資料全体の確認状態を推定しない。直接確定値への昇格、自動比較・合算の公開許可はすべてfalse。

大林の過年度比較欄は会計方針変更の遡及適用後と資料が明記し、原文と元の過年度版との対応未確認を保持する。鹿島の表には正確なGregorian日付の直接記載がなく、確認した年度の実期間・元年次fact ID/hashと四半期/月数の原表ラベルから正規化したことを明示する。正規化された日付を「表に直接書かれた日付」として扱わない。`period_binding_basis` は資料ID/hash・根拠quote・原文位置・状態だけを許可し、元のローカルproofパスを含めない。

原文位置は `coordinate_system=visual_page_relative_points_top_left`、数値の `pdfplumber_page_bbox_origin` と `pdf_page_rotation` を保持。鹿島受注PDFの負のページ原点はnative検証時だけ補正し、公開座標を移動しない。原資料の回転90度の参考資料もその状態を保持する。

UIは25件ずつ全341件を表示でき、会社・24指標・期間種別・連結/単体/連結建設事業/セグメント・原文検索で絞り込む。統合検索の大林・鹿島・長谷工・安藤ハザマ・受注から当該会社や指標へ到達し、指標の入口を北野だけに固定しない。CSV/JSONは表示ページだけでなく条件に一致する全件を出力する。原値・原状態・株式分割・調整・収益認識・原文位置・出典hash・受注カテゴリ/構造・期間の意味・重複状態と許可情報を残す。CSVには完全な公開原記録JSON列もある。URL stateは `view=quarterly` と独立した `quarterCompany/Metric/Period/Scope/Query` を保持し、主指標・派生141件の条件を上書きしない。既存の詳細設定と認証の契約は変更しない。

再生成は読取専用のSource rootと21社coverage JSONを指定する。Source/DBには書き込まない。

```sh
node scripts/export-atlas-quarterly-public.mjs SOURCE_ROOT COVERAGE_JSON SOURCE_ROOT/data/ai_haseko_ah_quarterly/export.json
ATLAS_QUARTER_SOURCE_ROOT=SOURCE_ROOT ATLAS_QUARTER_COVERAGE=COVERAGE_JSON node --test tests/atlas-quarterly-financials.test.mjs
```

公開UIはGitHub Pagesの既存prefix `/mlit-statistics-dashboard/` とローカルroot双方で同じ相対公開URLを使う。ビルドと公開確認はリリース担当の手順で行う。

長谷工・安藤ハザマのQ1は3か月累計の実績として保持する。長谷工の「第1四半期」という欄名だけを根拠に単独四半期へ変更しない。長谷工は億円、安藤ハザマは百万円の表示値を保持し、旧資料の単位へ揃えない。長谷工の元の取得UTCは未収録で、2026-10-14の公式URL照合日時は別記録。安藤ハザマ3資料は実際の公式HTTP取得UTCを記録し、掲載日・PDFの日付を取得日時として代用しない。確認後の版・訂正は未確認。長谷工の連結対象変更は資料間で未確認の注記を保持し、自動比較を許可しない。

追加72件はSourceの独立出力 `data/ai_haseko_ah_quarterly/export.json` の確定snapshotHashと、採用済みfacts_effectiveの全行を照合する。このSource snapshotはsorted JSONの通常の数値表記、Atlasの公開projectionは既存のfloat64を明示するcanonical hashであり、両者を同じhash方式と称さない。出力のraw・coverage・eligibility wrapperは公開せず、catalogにはdataset ID・snapshotHash・件数だけを残す。

catalogの `currentnessSupplement` はSourceの既存11件＋追加12件の台帳から追加12件だけを取り出す明示的許可リスト。大林組6資料は2026-10-14の確認時点で保存PDFと同じbytes、保存した掲載ページに訂正表示なしという限定範囲。鹿島6資料はHTTP500・0bytesのため現在のbytes、動的掲載リンク、訂正状態は未確認。補足のcheck ID・資料SHA・公式URL・確認UTC・結果だけを公開し、取得日時・元factの現在版状態を更新しない。raw HTTP receipt、保存パス、内部proof、個別fact guardは公開しない。大林の補助参考資料3資料はこの補足チェックだけに含まれ、主出典17版や数値341件の新規出典として数えない。UIは別枠で補足を開き、資料ごとの原記録と後日のチェックを区別する。

v0.2.4では件数・収録会社数・未確認会社数を実際の投影行から計算する。公開前の検証では旧269件を保存したfixtureと全行・全項目で一致させ、主指標20件と派生141件のasset SHAも保持する。
