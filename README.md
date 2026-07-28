# 国交省統計パネル

国土交通省の公式統計から必要な項目だけを収集し、グラフ・表・CSVで使えるようにするウェブアプリです。

初版では「建築着工統計調査・住宅着工統計」を対象に、全国月次と都道府県別のデータを扱います。

## 現在の収集項目

- 新設住宅着工戸数（総数）
- 持家
- 貸家
- 給与住宅
- 分譲住宅
- マンション
- 一戸建て
- 床面積
- 前年同月比

## データ取得

国土交通省が e-Stat で公開する最新Excelを自動検出し、全国時系列と47都道府県のデータに整形します。

- 公式説明: https://www.mlit.go.jp/statistics/details/t-other-2_tk_000214.html
- e-Stat掲載一覧: https://www.e-stat.go.jp/stat-search/files?cycle=1&layout=datalist&page=1&tclass1=000001048390&tclass2val=0&toukei=00600120&tstat=000001016966

取得に失敗した場合も、最後に保存した公式データを表示します。保存値の更新は `npm run sync:data` で行います。

## 起動と確認

```bash
npm install
npm run sync:data
npm run dev
npm run build
node --test tests/rendered-html.test.mjs
```

## 項目追加の考え方

新しい統計は、公式掲載先・統計表・必要な分類・単位・更新周期を確定してから、取得処理と画面の項目定義を追加します。各出力には統計名、調査年月、公式掲載先を残します。
