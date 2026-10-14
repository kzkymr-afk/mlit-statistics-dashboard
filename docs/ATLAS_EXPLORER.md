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
