# 国交省統計システム

国土交通省の公式統計を、Excelの行列ではなく「統計項目・分類条件・期間」で選び、
表・グラフ・CSVへ出力するためのデータ基盤兼ウェブアプリです。

## 現在の状態

2026年7月31日時点で、e-Stat DB/APIから2013年度以降を取得し、
正規化SQLiteへ格納済みです。

- 統計表: 113表（建築着工106表、大手50社7表）
- 公式分類の組み合わせ: 17,738,304系列
- 2013年度以降の公表値: 184,037,295件
- 正規化SQLite: 約28GB
- 取得済み公式API原本: 約27GB

公表された数値の0は、年度マスクと組み合わせて欠測と区別しながら
暗黙保持します。このため、SQLiteの観測値行は非0・欠測・秘匿・
注記付きの42,976,170行に抑え、画面では元の184,037,295件を復元します。

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
Excelシートの選択は通常画面に出しません。

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

- 統計: 建築着工統計調査・建築物着工統計
- 統計: 建設工事受注動態統計調査・大手50社
- 周期: 年次・年度次
- 時点: 2013年・2013年度以降
- 主系: e-Stat DB/APIの統計表、公式分類、全観測値
- 補完原本: e-Stat掲載の年度次Excel
- 出典: 統計表ID、公式URL、公表・取得日時、単位、注釈

## データ取得

主系はe-Stat DB/APIです。APIから統計表一覧、公式分類、2013年・
2013年度以降の観測値を取得し、正規化SQLiteへ保存します。

- e-Stat掲載一覧: https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00600120&tstat=000001016965&cycle=8&tclass1val=0
- 大手50社: https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00600130&tstat=000001015811&cycle=8&tclass1=000001015812&tclass2val=0

建築物着工統計の年度次Excelを2013年度以降まとめて取得する場合は、
`npm run sync:building-annual` を使います。原本は
`data/raw/building-starts/annual/`、収集台帳は
`data/catalogs/building-annual.json` に保存します。

大手50社の受注動態を取得する場合は、
`npm run sync:orders-major50-annual` を使います。原本は
`data/raw/construction-orders-major-50/annual/`、収集台帳は
`data/catalogs/orders-major50-annual.json` に保存します。

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
   └─ Excel取得（DB未収録・確認中）
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
npm run test:system           # 項目・分類・系列・値・出典の経路を検証
```

ターミナルを使わない場合は、最初に `e-Stat APIを設定.command` を開いてIDを
保存し、その後 `公開データを更新.command` を開きます。IDは
`.env.local` だけに保存し、Pages、Release、Git履歴には出しません。

## 項目追加の考え方

新しい統計は、公式掲載先・DB統計表ID・表章事項・分類コード・単位・更新周期を
レジストリへ登録します。Excelしかない項目は、対応表をレビューしてから同じ系列へ
統合します。各出力には統計名、統計表ID、分類条件、調査年月、公式掲載先を残します。
