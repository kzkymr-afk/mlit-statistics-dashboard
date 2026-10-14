# Atlas の検索・比較画面

トップページは `AtlasExplorer` を表示し、共通 layout のログインゲートとビルド表示を引き継ぐ。画面の HTML は iframe の srcDoc としてのみ作り、独立した公開 HTML の URL は設けない。「詳細な統計設定」で従来の workbench を開く。従来の分類指定、グラフ、保存条件、分析、書き出しはそこから利用できる。

## 公開データの読み込み

`system/catalog.json` と会社別表の metadata/availability を読み、65指標・21社を提示する。236表の検索分類名と時間軸の範囲は `explorer/search-index.json.gz` に保存した公開メタデータの索引から読む。観測値は含まない。

指標・会社を選ぶと、time 以外の全分類コードを指定し、既存 `comboIdentity` と SHA-256 で系列IDを求め、その prefix の gzip shard だけ読む。公的統計も分類ドロワーで全分類を指定し、初期値は metadata.defaultSelection を使う。圧縮系列の時間 mask は既存 `publishedWorkbenchSelection` で、dataset.fiscalYearFrom 以降の全時間軸をコード昇順に並べて復元する。年度選択後の軸で mask を解釈しない。

会社別の原表値と一般統計は原表参照であり、出典・実期間・比較許可の確認済みデータへ変換しない。未読込、未収録、公表待ち、範囲未確認の非開示記録、省略による0を区別する。省略による0は数値グラフ・分析へ入れない。年は元の時間コードを優先し、安全に読める年ラベルだけを補助的に使う。年を判定できない記録は「年未判定」として原値表・CSVに残し、グラフには入れない。原表の年ラベルから開始日・終了日を補完しない。月次・四半期は会社の年度グラフへ重ねず、元の期間表と詳細画面で表示する。

出典確認済みパケットは従来の `system/buildbase/source-verified-comparison.json` をそのまま読む。原Fact、permissions、origin、reviewWindow は変更しない。指数・相関は共有の検証・期間・定義・許可条件を通過した系列だけに適用する。

CSV は会社、表ID、系列ID、分類コード、元の期間コード・名称、単位、原状態、表示状態、注記、省略0、出典URL、公開日・取得日、disclosure_scope、recorded_combo_status を保存する。recorded_combo_status は組合せ単位の原記録であり、年度・資料・非開示範囲の確定を意味しない。実期間が未収録なら日付欄は空欄にする。確認済みFactと原表の参照レコードIDは別の欄に保存する。主指標と参照統計の書き出し範囲はメニューに明記する。

## URL と検証

親ページの hash に主指標・会社・年度・追加指標・参照表・分類・表示方法を保存する。親は同一 origin の自身の iframe から来たメッセージだけ受け取り、既知キーの hash だけを適用する。srcDoc の location.origin に依存せず、親が渡す origin で送受信する。詳細な統計設定の表示中は iframe の hash 受信と復元を止め、その画面の URL 状態を上書きしない。外部の出典リンクは HTTPS URL だけ有効にする。公開パスは Next 設定の `/mlit-statistics-dashboard/` またはローカル `/` に合わせる。

共有ブラウザモジュールは `public/explorer/lib/` に置く。共有 `lib/` の変更時はこのコピーも更新する。テストで両者のバイト一致を確認する。

```sh
ATLAS_PUBLIC_DATA_ROOT=/path/to/unchanged-public node --test tests/atlas-explorer.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

公開baselineを指定すると236表・65指標・21社、旧年度の2社、状態記録、年度次・月次の公的統計、取得shard数、CSVの出典を検証する。公開データがない環境ではbaselineの検証だけskipする。パケットのSHA-256と20観測・8系列、確認済み分析の年度制約は常に検証する。

## 派生指標141件

v0.2.1は、新UIの検索から5定義・23開示主体の保存派生結果141件へ進める。Sourceの既存export snapshot `5414e48ae0c900934a07303dc41c63f5b8b9a7f5434db9c0baa1a9c92dbd4ab1` を公開金融metadataへ投影した独立snapshotであり、Atlas DBの既存95結果を同期・更新したという意味ではない。旧95 result IDs・値・期間・単位・権限を保持し、追加46件は保存済み営業利益率の結果である。

`public/explorer/derived-indicators.catalog.json` が5定義・23会社IDと公開投影hash・gzip bytes hashを持つ。`derived-indicators.schema.json` は公開金融fieldを明示し、任意fieldや非公開ファイル位置・Sheet/Drive・秘密・個人/連絡先情報を許可しない。`derived-indicators.json.gz` は141結果、式、入力・原引用・原文位置・hash、実期間、計算状態と利用条件を保持する。Source完全wrapper、加工Sheetや施工案件のcoverage、ローカル保存資料は配信しない。除外内容はorigin.projectionOmissionsに残す。全金融metadata文字列のURLは公式5ドメインのHTTPSだけを許可し、秘密のquery parameterを拒否する。原URL未収録の入力250件はnullのままで、公式URLを推定しない。

「派生指標」検索結果、または「全5定義・141件を開く」から独立した結果一覧へ進む。指標、23会社ID、資料の確認期間、状態、結果IDや資料名で検索する。25件ずつ全6ページを表示し、条件をクリアすると141件に戻る。旧会社指標と公的統計の選択、派生指標の選択は別のURLキーで保存する。CSV/JSONは選択した派生結果だけを書き出し、Source snapshot、公開投影hash、結果ID、式・入力・実期間・単位・状態・出典・権限を残す。

派生値を直接開示Factや確認済み20観測として扱わない。自動会社間比較・集計・canonical昇格はfalseのまま。営業利益率の同じ3月期・J-GAAP19主体、IFRS1主体、実期間の異なる3主体を区別し、前田建設工業の過年度・三井住友建設の前年度・竹中工務店の暦年を現在の4月–3月へ変換しない。前年差・前年比は前期と当期の別の実期間を表示する。連結と自社単体の売上差額3件は連結消去などを含み、子会社売上や海外・改修売上として解釈しない。

再生成は既存Sourceの機械exportを読み取り、repository内の公開投影3ファイルだけを書き出す。原DBや原資料を開かず、財務計算を再実行しない。

```sh
node scripts/export-atlas-derived-public.mjs /path/to/reusable_indicators.json
ATLAS_DERIVED_SOURCE_EXPORT=/path/to/reusable_indicators.json \
ATLAS_DERIVED_OLD_CATALOG=/path/to/previous-buildbase-analysis.json \
node --test tests/atlas-derived-indicators.test.mjs
```

source exportを指定すると141件の原値・入力・期間・単位・式ID・状態・権限の一致を検証する。旧catalogを指定すると先頭95件の保持も検証する。公開snapshotのhash/schema・private marker拒否・141件の検索と全ページ到達・期間差・未収録URL・CSV/JSONのprovenanceはSourceファイルのない環境でも検証する。
