# 国交省統計パネル

国土交通省の公式統計から必要な項目だけを収集し、グラフ・表・CSVで使えるようにするウェブアプリです。

現在は次の年度次統計を対象に、2013〜2025年度の公式データを扱います。

- 建築着工統計調査・建築物着工統計：351件、約385MB
- 建設工事受注動態統計調査・大手50社：48件、約1.62MB

- 任意の統計表・年度・シートを表形式で閲覧
- 表内検索とページ移動
- 数値セルから同一項目の年度推移を自動照合
- 折れ線／棒グラフ、左軸／右軸、最大4系列
- グラフ用データのCSV出力
- 2024年度の分割表は年度推移上で合算

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

## 現在の収録範囲

- 統計: 建築着工統計調査・建築物着工統計
- 統計: 建設工事受注動態統計調査・大手50社
- 周期: 年度次
- 年度: 2013〜2025年度
- 原本: e-Stat掲載のExcel 合計399件（約386.5MB）
- 目録: 出典URL、統計表ID、公開日、容量、SHA-256

## データ取得

国土交通省が e-Stat で公開する年度次Excelを年度別に自動検出して保存します。

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

約385MBのExcel原本はローカルだけに保持します。更新時にSQLiteへ
正規化し、GitHub Pagesには表ページと年度系列へ分割した読み取り専用
データだけを公開します。画面表示時のe-StatアクセスやExcel解析は
行いません。

2026年7月30日の実測:

- SQLite: 約322MB
- Pages用分割データ: 約359MB
- 公開目録: 約477KB
- 表ページ: 80行単位
- 最大個別ファイル: 約0.47MB

## データと閲覧の構成

```text
e-Stat API／Excel原本
        ↓ 自宅Macで更新
data/database/mlit-statistics.sqlite
        ↓ 閲覧用に分割
public/data/
        ↓ GitHub Actions
GitHub Pages（会社PCから閲覧）
```

- 正本: ローカルSQLite
- 主系: e-Stat API（`ESTAT_APP_ID`設定後）
- 補完: API未収録・確認中のExcel
- 公開: GitHub Pagesの静的JSON
- GitHub Release: Pages再構築用の最新SQLite圧縮版
- GitHub Release: Ubuntu側で再変換しないためのPages用データアーカイブ

会社PCからの接続確認:
https://kzkymr-afk.github.io/mlit-data-orders-major50/

本番アプリ:
https://kzkymr-afk.github.io/mlit-statistics-dashboard/

## 起動と確認

```bash
npm install
npm run sync:building-annual
npm run sync:orders-major50-annual
npm run db:build-local
npm run data:export-pages
npm run build:pages
npm run dev
npm run build
node --test tests/rendered-html.test.mjs
```

Finderから `公開データを更新.command` を開くと、公式データ確認から
GitHub Pages更新開始までを一括実行します。

GitHub Actionsは毎週火曜05:23（日本時間）にもExcelの更新確認、
DB再構築、Pages再公開をmacOSランナーで行います。通常のPages公開は
Releaseに保存した生成済みデータを展開するだけなので、大型SQLiteを
Ubuntu上で再解析しません。手動実行時に `refresh_data` を有効にすると、
GitHub上でも同じ全更新を実行できます。

e-Stat APIを主系として統計表IDを照合するには、GitHubリポジトリの
Actions secret `ESTAT_APP_ID` と、ローカルの同名環境変数にe-Statの
アプリケーションIDを設定します。未設定・API未収録・照合中の項目は
Excel取得を利用します。

## 項目追加の考え方

新しい統計は、公式掲載先・統計表・必要な分類・単位・更新周期を確定してから、取得処理と画面の項目定義を追加します。各出力には統計名、調査年月、公式掲載先を残します。
