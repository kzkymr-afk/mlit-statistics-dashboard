# 四半期財務資料の公開表示契約

## 次期候補（未公開、2026-10-19）

Source の採用済み四半期記録から、東亜建設工業・松井建設204件、五洋建設・大成建設282件、竹中工務店・東急建設156件、三井住友建設68件を、保存した公式PDF18版のURL・SHA-256・原表位置へ固定した。既存782 ID と合わせて1,492 ID、収録20社／一覧21社。ただし数値は1,491件で、北野建設の既存1 IDは前年欄の期間対応誤りを示す保留参照へ置き換えた。保留参照は原値・原期間・原文引用・位置を公開assetに持たず、ID・公式PDF・原本SHA・保留理由だけを表示する。JSONの保留参照にも値はなく、CSVにはこの保留行を出さない。既存の他781件は全公開項目が旧版と一致する。三井住友建設グループ内の前田建設は今回の選択資料に型付き値がなく、未確認のまま。未収録や原表のダッシュを0・非開示と判定しない。

竹中工務店の18件は暦年2025-01-01～2025-06-30の中間6か月累計。確認した資料に会計基準の表示がないため `not_disclosed_in_reviewed_source` を保持する。東急建設のQ1～Q3とは同じ期間として扱わない。原表の累計、連結／個別、億円／百万円、比較期、注記、親子カテゴリ、取得UTCと後日の版未確認を残し、単独Q2・Q3、年次値、差分、会社間比較・合算を推定しない。Source export 4本のsnapshotHash・全710 IDの採用元同一性・保存PDFのbytesを照合する。保存パス・raw wrapper・取得ログ・内部資料を公開しない。

以下は公開済み782件版の履歴であり、上記候補の件数を示す記述ではない。

新UIの「四半期」または統合検索の「会社名 · 四半期資料」から、21社の確認状況と収録13社782件を開く。北野建設の既存113件（Q3資料の値105件、Q1資料の値8件）は公開済みの全項目をそのまま保持する。公開済みの大林組54件・鹿島建設102件を含む旧269件を全項目そのまま保持し、長谷工30件・安藤ハザマ42件までの公開済み341件を全項目保持し、奥村組42件・淺沼組42件までの公開済み425件を全項目保持し、錢高組42件・熊谷組48件までの公開済み515件を全項目保持し、インフロニア24件・西松建設99件までの公開済み638件を全項目保持し、清水建設32件・戸田建設112件を追加する。現年と前年の比較欄、連結・単体・連結建設事業・セグメント、金額・比率・1株当たり、原資料の行役割を区別する。782は独立した四半期や経済事実の件数ではなく、原表の表示値の記録数。

内訳は3か月累計217、6か月累計215、9か月累計312、直接報告の単独3か月30、月表記の残高等8。資料別の四半期番号で数えるとQ1の値227、Q2の値225、Q3の値330。鹿島のQ1累計と単独Q1は別の原表行に同じ値を記載する10組20記録で、重複を示すIDと非加算の状態を保持する。累計を引き算して単独四半期へ変換しない。全体受注合計は不動産・開発等を含み、建設事業受注として表示しない。

21社の一覧CSVは `explorer/quarterly-coverage.csv`。保存された四半期財務記録と資料索引の範囲だけを示す。他8社の収録0件は未確認であり、全社IR資料の網羅的調査や非開示の判断ではない。単独Q4直接報告値も未確認。ローカルの年次8件・Q4差分候補8件は今回の投影に含めない。

公開ファイルは `public/explorer/quarterly-financials.json.gz`、同catalog/schema JSON、一覧CSV。原データはSourceの既存 `facts_effective.jsonl` の抽出器 `reviewed_kitano_q3_summary_segments_v1` / `reviewed_kitano_q1_summary_v1` / `reviewed_obayashi_kajima_quarterly_fy2025_v1` / `reviewed_haseko_ando_hazama_quarterly_fy2025_v1` / `reviewed_okumura_asanuma_quarterly_fy2025_v1` / `reviewed_zenitaka_kumagai_quarterly_fy2025_v1` / `reviewed_infr_nishimatsu_quarterly_fy2025_v1` / `reviewed_shimizu_toda_quarterly_fy2025_v1`。生成元をSourceの正規化済み四半期財務記録と明記し、DB・既存派生141件のexportを生成元と扱わない。公開assetは独立し、既存主指標20件、派生141件、旧65指標・21社・236統計表の収録を変更しない。

投影は財務項目とPDF原文位置の明示的許可リストを使う。値の主出典の公開URLは41版（北野2・大林3・鹿島6・長谷工3・安藤ハザマ3・奥村3・淺沼3・錢高3・熊谷3・インフロニア3・西松3・清水3・戸田3）を会社・資料種類・URL・文書SHA-256へ固定し、原本PDFを照合する。今回のSourceの大林/鹿島検証対象は12資料（各6）で、そのうち大林の補助参考資料3つは主出典の公開registryに含めない。大林の元の公式配信provider `data.swcms.net/file/obayashi-ir/` と鹿島の保存索引に記録されたURLを保持し、別のwww URLを推定しない。すべての公開文字列に登録した公式HTTPS URL以外やローカル参照が残っていないことを確認する。保存パス、索引の行番号、非公開Sheet/Drive、個人・連絡先、raw wrapperは公開しない。同一内容をQ2と呼ぶ北野の資料索引の矛盾は、公開タイトル・公式URL・扱いだけを残し、本文と原本hashに基づくQ3をQ2へ変えない。

`value` / `value_raw` / `unit` / 原文と位置はそのまま保持。百万円未満切捨てを含む原資料の表示精度を上げず、鹿島の億円を百万円へ変換しない。億円の正確な円額・端数処理は未確認。親・子・小計の値や表示残差を補正・合算しない。1株当たり値の円銭と原資料の株式分割調整注記・根拠ページを保持する。残高等8件は月までの記録で、`as_of_date` / 開始日 / 終了日はnullのまま。取得日時・現在公式版との一致・資料全体の確認状態を推定しない。直接確定値への昇格、自動比較・合算の公開許可はすべてfalse。

大林の過年度比較欄は会計方針変更の遡及適用後と資料が明記し、原文と元の過年度版との対応未確認を保持する。鹿島の表には正確なGregorian日付の直接記載がなく、確認した年度の実期間・元年次fact ID/hashと四半期/月数の原表ラベルから正規化したことを明示する。正規化された日付を「表に直接書かれた日付」として扱わない。`period_binding_basis` は資料ID/hash・根拠quote・原文位置・状態だけを許可し、元のローカルproofパスを含めない。

原文位置は `coordinate_system=visual_page_relative_points_top_left`、数値の `pdfplumber_page_bbox_origin` と `pdf_page_rotation` を保持。鹿島受注PDFの負のページ原点はnative検証時だけ補正し、公開座標を移動しない。原資料の回転90度の参考資料もその状態を保持する。

UIは25件ずつ全782件を表示でき、会社・27指標・期間種別・連結/単体/連結建設事業/セグメント・原文検索で絞り込む。統合検索の大林・鹿島・長谷工・安藤ハザマ・奥村・淺沼/浅沼・錢高/銭高・熊谷・インフロニア・西松・清水・戸田・税引前利益・完成工事高・受注から当該会社や指標へ到達し、指標の入口を北野だけに固定しない。CSV/JSONは表示ページだけでなく条件に一致する全件を出力する。原値・原状態・株式分割・調整・収益認識・原文位置・出典hash・受注カテゴリ/構造・期間の意味・重複状態と許可情報を残す。CSVには完全な公開原記録JSON列もある。URL stateは `view=quarterly` と独立した `quarterCompany/Metric/Period/Scope/Query` を保持し、主指標・派生141件の条件を上書きしない。既存の詳細設定と認証の契約は変更しない。

再生成は読取専用のSource rootと21社coverage JSONを指定する。Source/DBには書き込まない。

```sh
node scripts/export-atlas-quarterly-public.mjs SOURCE_ROOT COVERAGE_JSON SOURCE_ROOT/data/ai_haseko_ah_quarterly/export.json SOURCE_ROOT/data/ai_okumura_asanuma_quarterly/export.json SOURCE_ROOT/data/ai_zenitaka_kumagai_quarterly/export.json SOURCE_ROOT/data/ai_infr_nishimatsu_quarterly/export.json SOURCE_ROOT/data/ai_shimizu_toda_quarterly/export.json
ATLAS_QUARTER_SOURCE_ROOT=SOURCE_ROOT ATLAS_QUARTER_COVERAGE=COVERAGE_JSON node --test tests/atlas-quarterly-financials.test.mjs
```

公開UIはGitHub Pagesの既存prefix `/mlit-statistics-dashboard/` とローカルroot双方で同じ相対公開URLを使う。ビルドと公開確認はリリース担当の手順で行う。

長谷工・安藤ハザマのQ1は3か月累計の実績として保持する。長谷工の「第1四半期」という欄名だけを根拠に単独四半期へ変更しない。長谷工は億円、安藤ハザマは百万円の表示値を保持し、旧資料の単位へ揃えない。長谷工の元の取得UTCは未収録で、2026-10-14の公式URL照合日時は別記録。安藤ハザマ3資料は実際の公式HTTP取得UTCを記録し、掲載日・PDFの日付を取得日時として代用しない。確認後の版・訂正は未確認。長谷工の連結対象変更は資料間で未確認の注記を保持し、自動比較を許可しない。

追加72件はSourceの独立出力 `data/ai_haseko_ah_quarterly/export.json` の確定snapshotHashと、採用済みfacts_effectiveの全行を照合する。このSource snapshotはsorted JSONの通常の数値表記、Atlasの公開projectionは既存のfloat64を明示するcanonical hashであり、両者を同じhash方式と称さない。出力のraw・coverage・eligibility wrapperは公開せず、catalogにはdataset ID・snapshotHash・件数だけを残す。

catalogの `currentnessSupplement` はSourceの既存11件＋追加12件の台帳から追加12件だけを取り出す明示的許可リスト。大林組6資料は2026-10-14の確認時点で保存PDFと同じbytes、保存した掲載ページに訂正表示なしという限定範囲。鹿島6資料はHTTP500・0bytesのため現在のbytes、動的掲載リンク、訂正状態は未確認。補足のcheck ID・資料SHA・公式URL・確認UTC・結果だけを公開し、取得日時・元factの現在版状態を更新しない。raw HTTP receipt、保存パス、内部proof、個別fact guardは公開しない。大林の補助参考資料3資料はこの補足チェックだけに含まれ、値の主出典41版や数値782件の新規出典として数えない。UIは別枠で補足を開き、資料ごとの原記録と後日のチェックを区別する。

v0.2.7では件数・収録会社数・未確認会社数を実際の投影行から計算する。公開前の検証では旧515件を保存したfixtureと全行・全項目で一致させ、主指標20件と派生141件のasset SHAも保持する。

奥村組・淺沼組の追加84件はQ1/Q2/Q3各28件、すべて百万円表示の累計実績。連結の主要4項目と単体受注の原表カテゴリを区別し、予想欄を投影しない。元の取得UTCは両社とも不明で、2026-10-14の公式URL照合は保存PDFと同じbytesだった後日の確認として保持する。確認以後の版・訂正は未確認。原資料の単位・端数・合計と明細の表示残差を補正しない。

淺沼組Q1は公式掲載ページが `20250819_2.pdf` を訂正版と表示している状態を `correction_status` に保持する。`prior_edition_difference_status=not_reviewed` を保持し、訂正前との数値差・訂正範囲は未確認と日本語で表示する。詳細metadataとCSV/JSONにも両状態を残す。表紙の日付を訂正日や原取得日に変換しない。

淺沼組の選択した補足表には正確な開始・終了日の記載がない。別の公式短信3資料は `QUARTER_PERIOD_COMPANION_REGISTRY` とoriginの `periodCompanionDocuments` に分け、値の主出典41版や782件の新規数値とは数えない。各短信p8の当期・前年の正確な連結累計期間を対応づけ、`period_binding_basis` と公開版 `period_companion` に公式URL・原本SHA・ページ・原文・日付位置を保持する。単体受注の期間にも同法人・同四半期の期間として対応づけるが、連結と単体の対象範囲が同じとは扱わない。画面で値の資料と期間の資料を別々に開ける。期間用短信の取得日時を値の補足資料の未知の取得日時へ転記しない。保存パス、receipt/manifestファイル、private guard wrapperは投影しない。

奥村組の期間は表紙の当期の開始・終了日と同じPDF内の前年/当期の比較期間を対応づける。連結財務表と単体受注表の期間対応を明記し、対象範囲の一致や比較許可に変換しない。原資料の各日付断片・物理ページ・座標を保持する。

独立Source出力はHaseko/AHの72件とOkumura/Asanumaの84件をそれぞれのdataset ID・確定snapshotHash・全行で照合する。旧catalogの `sourceCohortExport` はそのまま残し、`sourceCohortExports` にはこの既存2出力と訂正後の錢高・熊谷90件の計3出力にインフロニア・西松123件までの既存4出力に清水・戸田144件を加えた計5出力を登録する。新84件のSource snapshotは `eb5b76b29d89ef08e5289e1e62660795c1f147e8b6441f3fc91aebbcb490868f`。既存currentnessSupplement12件も全項目・hashを保持する。SourceのJSON数値hashをAtlasのfloat64 canonical hashと同じ方式とは称さない。

錢高組42件・熊谷組48件の追加90件は、各社のQ1/Q2/Q3の直接報告された累計実績です。熊谷組の主な収益の原表見出しは「完成工事高」で、`completed_construction_revenue_consolidated_reported` として保持し、他社の一般的な売上高へ橋渡ししません。熊谷組はこの選択範囲に完成工事高6件、一般の売上高0件です。会社全体や別資料に売上高の項目が存在しないとは判断しません。

熊谷組の単体受注は国内土木・国内建築・海外・報告合計の当期/前年24件を保持します。合計を国内2区分の和に置換せず、海外の原値を省略しません。Q2説明資料の億円表示とQ1/Q3短信の百万円表示を変換・統一しません。錢高組は3期とも百万円です。元の取得UTCは保存された錢高3資料・熊谷Q2資料で未収録、2026-10-14の同じbytesだった後日照合は別記録。熊谷Q1/Q3新規公式取得のUTCは実receiptに基づいて保持します。

熊谷組Q1/Q3の値の出典とQ2期間用短信は、会社公式IRからC1861 feedへ結び付く `pdf.irpocket.com/C1861/` の完全一致3URL・SHAのみを許可します。別会社・未登録path・query付き・非HTTPSのprovider URLは拒否します。Q2の期間用短信は既存の淺沼3資料に加えて4番目の期間companionとして分離し、値の主出典41版や数値782件に数えません。連結の期間は短信p8、単体受注の期間はp17を使い、対応する原文・日付・scopeを保持します。新規取得した期間用短信の取得UTCを保存説明資料の取得UTCへ転記しません。raw feed/receipt/保存pathは公開しません。

熊谷受注24件のSource metadata訂正では、`semantic_category_label` を「説明上の区分（原文引用とは別）」と表示し、`source_quote_kind=joined_verified_native_value_page_fragments` の引用を「原資料から結合した引用（複数箇所の抜粋）」として区別します。`correction_ids` と `metadata_correction_status=reviewed_literal_source_fragments` を公開metadata・CSV/JSONに保持します。数値・ID・原期間・単位・scopeはSourceと一致させ、原文片に説明ラベルを挿入しません。

Sourceの独立出力は既存72件・84件を全項目保持し、訂正後90件の `data/ai_zenitaka_kumagai_quarterly/export.json` を加えます。確定snapshotHashは `d2b6e417bfd5878667205603c1618bdde79e32d546f899ac555cef82e7aacc53`。全90行を採用済みfacts_effectiveと照合し、元factsを訂正後effectiveと混同しません。公開許可・自動比較・合算はfalseのままです。旧currentnessSupplement12と淺沼訂正版/訂正前との差未確認も保持します。

錢高組の単体受注18件は、期間の根拠として同じPDFの連結損益計算書の物理p7・表示p5を使います。値の原表ページ・座標とは別のlocatorを保持し、Source metadata訂正の `metadata_correction_status=reviewed_period_locator_printed_page` と `correction_ids` を残します。画面にも連結損益計算書は期間だけの根拠で、単体受注の対象範囲が同じとは扱わないことを明示します。今回のmetadata訂正は熊谷24件と錢高18件の計42件で、値・ID・期間・単位・scopeを変更しません。

インフロニア・西松の追加123件は各四半期41件、全件百万円表示の当期・前年の累計実績です。6資料とも2026-10-14の公式HTTP取得UTCを保持し、掲載日・PDFの日付を取得日時へ読み替えません。値の主出典には、インフロニア公式の `results/FY2025_1Q.pdf` / `FY2025_2Q.pdf` / `FY2025_3Q.pdf` と、西松公式から結び付いた `ssl4.eir-parts.net/doc/1820/tdnet/` の完全一致3URL・SHAだけを追加します。同providerの別会社・未登録path・query付き・非HTTPSは許可しません。確認後の版・訂正は未確認です。

インフロニアはIFRS連結の売上高・営業利益・税引前利益・親会社の所有者に帰属する利益24件です。`profit_before_tax_consolidated_reported` は「税引前利益（IFRS）」という独立した指標で、日本基準の `ordinary_profit_consolidated_reported` に橋渡ししません。経常利益が適用対象外という記録は選択したIFRS損益表だけを対象とし、会社全体の非開示と扱いません。Q2親会社所有者利益は正式短信p9の24,558を保持します。FACT BOOK p8の24,640とのlabel/scope conflictや、同じ損益表の非支配持分・合計利益など未選択の原文はSourceで保持し、Atlasの数値や公開wrapperへ追加しません。

西松の99件は日本基準の連結財務24件と受注75件です。受注は原表の連結6件と個別69件を分け、土木・建築・計と国内官公庁・国内民間・海外・計の親子カテゴリを保持します。個別の詳細表「計 / 計」6欄は既存の個別合計に重複するため、1件のfactと `corroborating_alias_locators` の照合位置だけを残し、二重計上しません。建築・海外の当期「－」3欄はSourceの未解釈placeholderで、typed factや0として投影しません。合計と内訳を補正・合算せず、連結と個別も自動合算しません。

新profileの正確な累計開始・終了日は同じ正式PDFの損益表または受注表にあるnative日付と位置を保持します。西松の連結財務要約は同じPDFの連結損益計算書の期間を使い、受注へ財務scopeを移しません。受注はその受注表に印字された期間を使います。Q2は6か月累計で、単独Q2へ変換しません。新profileは元recordにない `source_family` / `period_kind` / `period_end_month` / `as_of_date` / `candidate_disposition` / `source_period_semantics` 等を補完せず、専用schemaとruntime検査を使います。旧515件の必須キー・許可リスト・serializerとmetadata訂正42件は保持します。原表の会計区分・行/親カテゴリ・選択表の項目適用状態・期間根拠・重複照合位置はCSV/JSONにも保持し、内部 `source_path` / `source_file` を除きます。正規化123件はすべて `company_id == reporting_entity_id` です。

新Source独立出力 `data/ai_infr_nishimatsu_quarterly/export.json` は確定snapshotHash `d668264cd72c0bd5e7b68b39ed3aefb8f77e4018fdd8155dedb721589eb33192` と全123行を採用済みfacts_effectiveへ照合します。heldの30受注＋20財務補助、dash3、conflict1、保存FACT BOOK/説明資料・provider JS・raw wrapperはSource側のcatalog/queryのみで保持し、Atlasへコピー・公開しません。旧Source出力72/84/訂正後90件、currentnessSupplement12件、期間companion4件の全項目とhashも保持します。Source snapshotとAtlas float64 canonical hashは異なる方式です。


v0.2.8の清水・戸田profileは、採用済みSourceの144件を独立した第8profileで投影します。清水は連結財務24件とQ2・Q3の受注8件、戸田は連結財務24件と個別受注88件です。公開済み638件はfixtureと全行・全項目で一致させ、旧7profileのserializer・必須キー・許可リストを変更しません。元recordにない日付・期間種別・判断状態は補完しません。Source snapshot `a60124646393a40acc7eca029ffdabdcf204c2ba2d4c90c0ae609bcfee8d31b5` と全144行を採用済みfacts_effectiveへ照合し、第5のSource cohortとしてdataset ID・snapshotHash・件数だけをcatalogへ登録します。

値の主PDFは清水の公式IRから結び付く `pdf.irpocket.com/C1803/` の完全一致3URLと、戸田公式の `toda_103_2.pdf` / `toda_103_3.pdf` / `toda_103_04.pdf` の完全一致3URL・SHAだけを追加します。6資料の実際の公式HTTP取得UTCは2026-10-14T18:02〜18:05で、掲載日・表紙の日付に読み替えません。同providerの別会社・未登録path・query付き・非HTTPSを拒否します。掲載feed・JS・manifest・receipt・保存pathは投影しません。値・原文位置のguardは選択したnative断片だけを保持し、`source_text` は原値文字列 `value_raw` と同一に限定します。

両社は日本基準・百万円の当期FY2025開始年度と前年FY2024開始年度の実績で、Q1/Q2/Q3は3/6/9か月累計です。連結財務の正確な日付は同じPDFの連結損益計算書（清水は各p7、戸田はp8/p10/p9）を根拠に保持します。受注はそれぞれの個別受注表の正確な日付を使い、連結財務のscopeを転記しません。Q2を単独四半期へ差分計算しません。`source_subject_scope_as_disclosed` は原文の「連結」「個別」、`source_subject_scope_interpretation` は対象範囲の解釈で、画面・metadata・CSV/JSONでも分けます。主体は採用済みrecordのissuerと一致し、別法人への昇格・自動比較・合算はfalseのままです。

清水Q2・Q3の個別受注合計4件と、別表の連結海外受注参考4件を分けます。海外参考は同じページに繰り返された期間見出しへ対応づけ、原表タイトル「（参考）海外受注高の状況（連結）」・行「合 計」・連結scopeを保持します。画面名は「海外受注高（連結・参考値）」で、会社全体の連結受注合計とは扱いません。個別合計と加算・比較しません。Q1保存databookの四半期受注6候補は、直接公式PDF URL・正確な日付が未確認のためSourceのheldだけに残し、主出典41版や公開782件へ追加しません。

清水Q3の前年連結財務4件は、企業結合に係る暫定的な会計処理の確定を反映する原資料p1の注記・2つの原文片・座標・原本SHAを専用restatement許可リストで保持します。注記の解釈を原文引用と分け、Q1/Q2・当期財務・受注へ転記しません。元の前年版との数値差・資料全体の訂正履歴は未確認です。

戸田の個別受注88件は原表の全体合計6件、建設事業70件（報告された建設小計6件と原表の階層明細64件）、非建設事業12件を区別します。全体合計は建設事業・国内投資開発事業等・環境・エネルギー事業を含み、建設事業の小計へ付け替えません。`source_row_path_as_disclosed` で建築・土木・合計と国内官公庁・国内民間・海外・計の階層を保持し、親子を補正・合算しません。国内投資開発事業等・環境・エネルギー事業12件は独立した `order_value_as_reported` で、「非建設事業の受注高（原表カテゴリ別）」と表示します。Q1の土木・海外の当期/前年「－」2欄は意味未解釈のSource placeholderで、0やtyped factへ変換せず公開しません。

保留6件・placeholder2件・raw・coverage・eligibility・7件の内部document metadata wrapperはSource側だけに残します。Atlasは既存Source cohort72/84/訂正後90/123、currentnessSupplement12、期間companion4、metadata訂正61、主指標20・派生141・旧65指標21社236表のassetを保持します。公開asset・Sourceのhash方式は異なるため同一方式とは称しません。収録13社・未確認8社・782件は投影行から計算し、未確認を非開示・0・将来最新版一致とは判断しません。
