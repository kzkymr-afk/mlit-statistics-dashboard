# 国交省統計システム

国土交通省と日建連の建設統計を、Excelの行列ではなく
「統計項目・分類条件・期間」で選び、表・グラフ・CSVへ出力するための
データ基盤兼ウェブアプリです。

## 現在の状態

2026年8月1日時点で、e-Stat DB/APIを主系、APIにDB表がない統計の
公式Excelを補完系として、2013年・2013年度以降を正規化SQLiteへ
格納済みです。

- 統計カテゴリ: 13（需要・受注、出来高、業界、コスト、供給、ストック）
- 統計表: 226表
- 公式分類の組み合わせ: 17,761,589系列
- 2013年・2013年度以降の公表値: 185,482,197件
- 正規化SQLite: 約29GB
- GitHub Pages用の圧縮データ: 約501MB

公表された数値の0は、年度マスクと組み合わせて欠測と区別しながら
暗黙保持します。このため、SQLiteの観測値行は非0・欠測・秘匿・
注記付きの43,078,402行に抑え、画面では元の公表値を復元します。

旧公開版のExcel原本ビュー、取得台帳、SHA-256は原典確認用に残しますが、
シートやセルを選ぶ操作と、そのための`sheet_payloads` /
旧`series_bundles`は統計システムの正本にはしません。

新しい正本は次の単位で保持します。

- 統計表レジストリ
- 表章事項・地域・分類事項の公式コードと名称
- 分類条件の組み合わせで定義した系列
- 時間コードごとの観測値、単位、注釈
- e-Stat DB/APIまたはExcel原本まで辿れる出典
- Excel補完項目の対応状況とレビュー結果

利用者は「床面積」「東京都」「鉄骨造」「事務所」「2013年度以降」のように
条件を選び、必要な系列だけを表・折れ線・棒・左右2軸・CSVで利用します。
左右のY軸は最小値・最大値・目盛間隔を個別指定でき、空欄時は
データ範囲から1・2・5刻みの読みやすい目盛りを自動設定します。
統計表・分類条件・表示期間は「よく使う項目」として保存でき、左カラム
最上部から再選択できます。お気に入りはブラウザごとの端末内設定です。
通常の選択は、左カラムで年度・年次・月次・四半期を先に絞り、その周期に
収録されている統計だけを選びます。「すべて」では全周期を横断して探せます。
Excelシートの選択は通常画面に出しません。

## AIから利用する

CodexとClaude Code向けに、同じ正規化SQLiteを直接検索する
`mlit-statistics` MCPを同梱しています。AIは画面をクリックせず、統計表の検索、
公式分類コードの確認、系列取得、複数系列の表・グラフ・CSV・出典一式の作成を
再現可能な手順で行えます。画面で人が選んだ条件は「AI用JSON」でも出力できます。

```bash
npm run ai:stats -- help
npm run ai:stats -- search --query "着工 床面積"
npm run ai:stats -- bundle \
  --spec examples/ai-report-spec.json \
  --out outputs/ai/example
```

資料パッケージはSVG、横持ち/縦持ちCSV、完全JSON、出典JSON、再生成定義を
同時に出力します。社内・他社データも `customSeries` として加えられます。
詳しいMCPツール、Codex / Claude Codeの接続、データ解釈ルールは
[`docs/AI_ANALYSIS_GUIDE.md`](docs/AI_ANALYSIS_GUIDE.md)を参照してください。

GitHub Pagesには `/llms.txt`、`/llms-full.txt`、
`/system/ai/catalog.json` も置き、公開ページを参照するAIが統計表と分類構造を
機械可読形式で確認できるようにします。

## 配置

運用アプリとして、Businessワークスペースの次の場所に配置します。

```text
/Volumes/SSD_External/Business/Apps/2026-07_mlit-statistics-dashboard
```

アプリのソースコードとデータ格納領域を同じプロジェクト内に置きつつ、
取得データやDBはGit管理対象から外します。詳しい用途は `data/README.md` を参照してください。

```text
data/
├── catalogs/     アプリが読み込む収集台帳・項目定義
├── raw/          公式APIレスポンス・Excel原本
├── normalized/   共通形式へ整形したデータ
├── database/     ローカルSQLiteなどの永続DB
├── snapshots/    アプリ同梱の表示用スナップショット
├── exports/      CSV・Excelなどの利用者向け出力
└── cache/        再生成できる一時データ
```

## 収録範囲

### 需要・受注

- 建築着工統計調査・建築物着工統計（年次全106表、月次主要22表）
- 建設工事受注動態統計調査・大手50社（年次7表、月次14表）
- 建築物リフォーム・リニューアル調査（年度次・四半期43表）
- 建設投資見通し（全国・地域別の最新長期時系列2表）
- 日建連会員・企業規模別受注高（第1～第5グループ、年度次、5指標）

### 出来高・業界

- 建設総合統計（出来高・手持ちの主要7表）
- 建設工事施工統計調査（完成工事高・就業者・受注高・付加価値・原価の17表）

### コスト・供給

- 建設工事費デフレーター（現行2020年度基準の月次・四半期・年度次3表）
- 建設労働需給調査（10職種の全国過不足率・月次、Excel補完）
- 主要建設資材需給・価格動向調査（都道府県別の価格・需給・在庫、Excel補完）

### 建築ストック

- 建築物ストック統計（住宅、法人等非住宅、公共非住宅、Excel補完）

### 共通条件

- 周期: 月次・四半期・年次・年度次
- 時点: 2013年・2013年度以降
- 主系: e-Stat DB/APIの統計表、公式分類、全観測値
- 補完原本: e-Stat掲載の公式Excel、日建連の受注実績調査Excel
- 出典: 統計表ID、公式URL、公表・取得日時、単位、注釈

建築着工の月次DB全59表は、2013年以降だけでも約6.8億観測となり
GitHub Pagesの公開容量を超えるため、全国・都道府県・用途・構造・
建築主・民間非居住・季節調整など、営業・経営で継続比較する22表を
統計表レジストリで明示選定しています。追加したい表はIDを同じ
レジストリへ登録する方式です。

## データ取得

主系はe-Stat DB/APIです。APIから統計表一覧、公式分類、2013年・
2013年度以降の観測値を取得し、正規化SQLiteへ保存します。

- e-Stat掲載一覧: https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00600120&tstat=000001016965&cycle=8&tclass1val=0
- 大手50社: https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00600130&tstat=000001015811&cycle=8&tclass1=000001015812&tclass2val=0
- リニューアル: https://www.e-stat.go.jp/stat-search/files?toukei=00600900&tstat=000001031111
- 建設総合統計: https://www.e-stat.go.jp/stat-search?toukei=00600260
- 建設工事費デフレーター: https://www.e-stat.go.jp/stat-search?toukei=00600270
- 建設投資見通し: https://www.e-stat.go.jp/stat-search/database?toukei=00600870
- 建設工事施工統計調査: https://www.e-stat.go.jp/stat-search/database?toukei=00600130&tstat=000001015810
- 建設労働需給調査: https://www.e-stat.go.jp/stat-search/files?toukei=00600050
- 主要建設資材需給・価格動向調査: https://www.e-stat.go.jp/stat-search/files?toukei=00600060
- 建築物ストック統計: https://www.e-stat.go.jp/statistics/00600940
- 日建連・受注実績調査: https://www.nikkenren.com/publication/research.html
- 日建連・月別調査アーカイブ: https://www.nikkenren.com/publication/archive.html

建築物着工統計の年度次Excelを2013年度以降まとめて取得する場合は、
`npm run sync:building-annual` を使います。原本は
`data/raw/building-starts/annual/`、収集台帳は
`data/catalogs/building-annual.json` に保存します。

大手50社の受注動態を取得する場合は、
`npm run sync:orders-major50-annual` を使います。原本は
`data/raw/construction-orders-major-50/annual/`、収集台帳は
`data/catalogs/orders-major50-annual.json` に保存します。

リニューアル調査はe-Stat DB/APIの年度次・四半期43表を主系として
`data/raw/api/renovation/`へ保存します。100時点を超える月別時間軸は
可変長マスクで保持し、0と欠測を区別します。公開データだけを差分生成する場合は
`npm run data:publish-system:renovation`を使います。

経営・営業向けの追加統計は、DB表を
`npm run sync:estat-api:management`、Excel補完統計を
`npm run sync:estat-excel`で更新します。どちらも同じSQLite構造へ入り、
画面では取得方式を意識せず同じ表・グラフ・CSV機能で利用できます。

日建連の企業規模別受注高は、2013～2025年度について第1～第5グループの
「建築全体・国内建築・海外建築・民間建築・官庁建築」を収録します。
原表の合計行とその他建築は検算だけに使い、表示系列にはしません。
年度ごとの対象社数（96～98社）を時間軸名と注釈に保持するため、対象社数の
変化を確認したうえで比較できます。正規化DBへの登録は
`npm run sync:nikkenren-orders`、公開差分生成は
`npm run data:publish-system:nikkenren`です。

Excel原本と正規化SQLiteはローカルだけに保持します。GitHub Pagesには
画面、項目レジストリと、系列IDの先頭2桁でデータセットごとに
分割した圧縮観測値を配置します。
画面は選択した系列を含む1分割だけを取得するため、巨大DB全体を
読み込まず、表示時のe-StatアクセスやExcel解析も行いません。

## データと閲覧の構成（再構築後）

```text
指定項目
   ↓
統計項目レジストリ
   ├─ e-Stat DB/API（主系）
   ├─ e-Stat Excel取得（DB未収録・確認中）
   └─ 日建連 Excel取得（企業規模別受注高）
             ↓
data/database/mlit-statistics-system.sqlite
  ├─ statistical_tables
  ├─ dimensions / dimension_values
  ├─ statistical_concepts / concept_mappings
  ├─ series / series_dimensions
  └─ observations / observation_sources
             ↓ 閲覧用スナップショット
public/system/（項目レジストリ＋系列ID先頭2桁の圧縮観測値）
        ↓ GitHub Pages
GitHub Pages（会社PCから閲覧）
```

- 正本: ローカルの正規化SQLite
- 主系: e-Stat APIの統計表・メタ情報・数値
- 補完: API未収録・確認中のExcel
- 公開: Pagesの項目レジストリ＋系列ID先頭2桁の圧縮観測値
- 旧Excelビュー: 原典確認専用へ降格

本番アプリ:
https://kzkymr-afk.github.io/mlit-statistics-dashboard/

## 起動と確認

```bash
npm install
npm run sync:estat-api:resume
npm run sync:estat-excel
npm run sync:nikkenren-orders
npm run data:publish-system
npm run build:pages
npm run dev:pages
```

Finderから `公開データを更新.command` を開くと、公式データ確認から
GitHub Pages更新開始までを一括実行します。

大型SQLiteの更新は空き容量のあるこのMacで行います。GitHub Actionsは
生成済みの項目レジストリを展開してPagesを公開するだけで、API全件取得や
大型SQLiteの再解析は行いません。

e-Stat APIを主系として利用するには、ローカルの `.env.local` に
`ESTAT_APP_ID` を設定します。API同期処理はID未設定時にExcelへ戻さず
明示的に停止します。API未収録表だけを、別の対応レジストリを通して
Excel補完します。IDはGit、Pages、Releaseには保存しません。

```bash
npm run sync:estat-inventory  # DB統計表と公式分類の棚卸し
npm run sync:estat-api        # 2013年度以降の数値を正規化DBへ保存
npm run sync:estat-api:resume # 完了表・取得済みページを再利用して更新
npm run sync:estat-api:management # 追加した経営・営業向けDB表だけを更新
npm run sync:estat-excel      # 労務・資材・ストックのExcel補完を更新
npm run sync:nikkenren-orders # 日建連の5グループ×5指標を正規化DBへ登録
npm run test:system           # 項目・分類・系列・値・出典の経路を検証
```

ターミナルを使わない場合は、最初に `e-Stat APIを設定.command` を開いてIDを
保存し、その後 `公開データを更新.command` を開きます。IDは
`.env.local` だけに保存し、Pages、Release、Git履歴には出しません。

## 項目追加の考え方

新しい統計は、公式掲載先・DB統計表ID・表章事項・分類コード・単位・更新周期を
レジストリへ登録します。Excelしかない項目は、対応表をレビューしてから同じ系列へ
統合します。各出力には統計名、統計表ID、分類条件、調査年月、公式掲載先を残します。
