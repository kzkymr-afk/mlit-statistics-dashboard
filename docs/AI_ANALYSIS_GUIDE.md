# AIによる建設統計の取得・分析・作図

このアプリは、人がブラウザで使う画面と、Codex / Claude Codeが直接使う
機械向け入口を同じ正規化DBの上に持ちます。AIは巨大なSQLiteを自分で全表走査せず、
MCPまたはCLIから統計表IDと公式分類コードを使って系列を取得します。

## 用意した入口

| 入口 | 用途 | 主な出力 |
|---|---|---|
| `mlit-statistics` MCP | Codex / Claude Codeとの対話分析 | 検索、分類、系列、資料一式 |
| `npm run ai:stats` | 自動処理、検証、他ツールとの連携 | JSON / CSV / SVG |
| `system/ai/catalog.json` | GitHub Pagesを読むAI | 統計表と分類スキーマ |
| 画面の「AI用JSON」 | 人が選んだ条件をAIへ渡す | 値、軸、出典を含むJSON |

## Codexから使う

プロジェクトの `.codex/config.toml` にMCP設定があります。プロジェクトを信頼した
状態でCodexを再起動すると、`mlit_statistics` の各ツールを利用できます。

例:

> 建築着工統計から全国・事務所の床面積を2013年度以降で取得し、
> 民間建築受注高と2軸グラフにして。表、SVG、出典JSONも保存して。

Codexは `AGENTS.md` の手順に従い、検索 → 分類確認 → 取得 →
`outputs/ai/` への素材作成を行います。

## Claude Codeから使う

プロジェクトルートでClaude Codeを起動してください。`.mcp.json` はプロジェクト共有の
MCP設定なので、初回だけ利用許可を求められます。

```bash
cd /Volumes/SSD_External/Business/Apps/2026-07_mlit-statistics-dashboard
claude
```

`/mcp` または `claude mcp list` で `mlit-statistics` を確認できます。
Claude Codeは `CLAUDE.md` に記載した同じ検索手順を使います。

## MCPツール

1. `list_statistical_datasets`
   - 収録統計の全体像を確認する。
2. `search_statistical_tables`
   - 「着工 床面積」「受注 民間」のような語で表を探す。
3. `get_table_schema`
   - `tab`、`area`、`cat01`などの分類と公式コードを確認する。
   - 値が多い地域分類は `dimension` と `valueSearch` で絞る。
4. `query_statistics`
   - time以外の全分類と期間を指定し、1系列を取得する。
   - 値、単位、注記、状態、出典を返す。
5. `create_report_bundle`
   - 最大10系列を、折れ線/棒、左右2軸、任意の軸範囲で作図する。
   - 社内・他社データも `customSeries` で混在できる。

## CLI

```bash
# 収録分野
npm run ai:stats -- datasets

# 統計表の検索
npm run ai:stats -- search --query "着工 床面積" --cycle 年度次

# 分類コードの確認
npm run ai:stats -- schema --table nikkenren-group-orders-annual

# 系列取得（JSON）
npm run ai:stats -- query \
  --table nikkenren-group-orders-annual \
  --select tab=building-total \
  --select cat01=1 \
  --from 2013 --to 2025

# 同じ系列をCSVで標準出力
npm run ai:stats -- query \
  --table nikkenren-group-orders-annual \
  --select tab=building-total \
  --select cat01=1 \
  --from 2013 --to 2025 --format csv

# 表・グラフ・出典一式
npm run ai:stats -- bundle \
  --spec examples/ai-report-spec.json \
  --out outputs/ai/nikkenren-group1
```

## 資料パッケージ

`bundle` / `create_report_bundle` は次を同じフォルダへ出力します。

- `chart.svg` — PowerPointへ貼れるベクターグラフ
- `data.csv` — 期間が行、系列が列の横持ち表
- `data_long.csv` — AI、Python、BI向けの縦持ち表
- `data.json` — 観測値とグラフ設定を省略せず保持
- `provenance.json` — 統計表ID、分類コード、原典、取得日時
- `query-spec.json` — 同じ結果を再生成する定義
- `README.md` — 内容説明

軸の `min`、`max`、`step` を `null` にすると、画面と同じ1・2・5刻みの
自動目盛りになります。数値を指定すれば固定できます。

## 社内・他社データと比較する

統計系列に加えて、仕様の `customSeries` に決算・受注データを渡せます。

```json
{
  "title": "当社受注高と市場統計",
  "series": [
    {
      "tableId": "nikkenren-group-orders-annual",
      "selections": { "tab": "building-total", "cat01": "1" },
      "from": "2019",
      "to": "2025",
      "label": "日建連 第1グループ",
      "chartKind": "bar",
      "axis": "left"
    }
  ],
  "customSeries": [
    {
      "label": "当社 建築受注高",
      "unit": "百万円",
      "chartKind": "line",
      "axis": "right",
      "values": [
        { "timeCode": "2024100000", "timeLabel": "2024年度", "value": 100000 }
      ],
      "source": {
        "id": "company-results-2024",
        "kind": "internal-report",
        "localPath": "社内資料の保管先",
        "publishedAt": "2025-05-01",
        "note": "連結/単体、消費税込/抜など集計条件を記載"
      }
    }
  ]
}
```

サンプルの100000は構造例であり、実データではありません。社内・他社データには
必ず資料名、連結/単体、対象期間、単位、取得日を記録してください。

## データ解釈上のルール

- `numericValue = 0` と欠測は区別する。
- `implicitNumericZero = true` は、公表された0をDB内で省容量保持し、取得時に
  復元したもの。欠測ではない。
- `status` が `missing`、`suppressed`、`non_numeric` の値を0に置換しない。
- `annotation` を落とさない。日建連は年度により会員社数が異なる。
- レポートには `tableId`、`selections`、期間、単位、`sourceUrl` を残す。
- 異なる統計を比較するときは、年度/暦年、名目/実質、単体/連結、単位を揃える。

## 公開Webから読む場合

公開URLの `/llms.txt` と `/system/ai/catalog.json` を入口にできます。各統計表の
`aiMetaUrl` は非圧縮JSONで、分類コードと公開シャードの復元仕様を持ちます。
ただし、ローカルDBを使えるCodex / Claude CodeではMCPの方が高速で、誤った分類の
組み合わせも検出できるため、MCPを優先してください。
