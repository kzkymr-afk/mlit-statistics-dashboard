// System-bundled presets for the workbench (components/StatisticsSystemWorkbench.tsx).
//
// Unlike "よく使う項目" (lib/statistics-favorites.mjs), which is a single saved
// selection stored per-browser in localStorage, a preset is a *named group of
// series* shipped with the app: pick one table, hold a set of dimensions
// fixed (baseSelections), and expand one remaining dimension across a list of
// codes (expandDimensionApiKey/expandCodes) — the same shape addManySeries()
// already understands (see lib/statistics-series-compare.mjs). Every
// tableId/baseSelections/expandCodes combination below is verified against
// the published public/system data in
// tests/statistics-presets.test.mjs — do not add a preset without extending
// that test to cover it.

export const STATISTICS_PRESETS = [
  {
    id: "buildbase-office-orders-company-comparison",
    title: "用途別受注・会社比較（事務所・庁舎）",
    description:
      "BuildBase会社別データの建築受注高（用途別・事務所・庁舎）を主要12社で比較する表です。会社・用途は読み込み後に選び直せます。",
    notes:
      "事務所・庁舎の用途別受注高が公表されている14社（安藤・間/淺沼組/鹿島建設/熊谷組/前田建設工業/西松建設/大林組/奥村組/五洋建設/清水建設/三井住友建設/大成建設/東亜建設工業/東急建設）のうち、系列上限12に合わせて淺沼組・東亜建設工業を除いた12社を既定表示にしています。",
    datasetId: "buildbase-company-comparison",
    tableId: "buildbase-company-annual",
    cycle: "年度次",
    displayFormat: "table",
    chartKind: "bar",
    axis: "left",
    baseSelections: { tab: "building_orders_use_office" },
    expandDimensionApiKey: "cat01",
    expandCodes: [
      "ANDO_HAZAMA",
      "KAJIMA",
      "KUMAGAI",
      "MAEDA",
      "NISHIMATSU",
      "OBAYASHI",
      "OKUMURA",
      "PENTA",
      "SHIMIZU",
      "SMCC",
      "TAISEI",
      "TOKYU",
    ],
  },
  {
    id: "orders-major50-private-orders-by-use",
    title: "大手50社受注高・用途別（民間建築）",
    description:
      "受注動態統計（大手50社）の民間発注・用途別建築受注高を年度別に比較する棒グラフです。安藤ハザマの用途別実績と突き合わせるシェアの分母として使えます。",
    notes: "",
    datasetId: "orders-major50",
    tableId: "0003126265",
    cycle: "年度次",
    displayFormat: "bar",
    chartKind: "bar",
    axis: "left",
    baseSelections: { tab: "300", cat02: "220" },
    expandDimensionApiKey: "cat01",
    expandCodes: [
      "100",
      "110",
      "120",
      "130",
      "140",
      "150",
      "160",
      "170",
      "180",
    ],
  },
  {
    id: "buildbase-total-building-orders-company-comparison",
    title: "21社主要指標・建築受注高比較",
    description:
      "BuildBase会社別データの建築受注高（合計）を、スーパーゼネコン5社と主要準大手7社の計12社で比較する折れ線グラフです。",
    notes: "",
    datasetId: "buildbase-company-comparison",
    tableId: "buildbase-company-annual",
    cycle: "年度次",
    displayFormat: "line",
    chartKind: "line",
    axis: "left",
    baseSelections: { tab: "building_orders_total" },
    expandDimensionApiKey: "cat01",
    expandCodes: [
      "TAISEI",
      "OBAYASHI",
      "SHIMIZU",
      "KAJIMA",
      "TAKENAKA",
      "ANDO_HAZAMA",
      "TOKYU",
      "TOA",
      "SMCC",
      "PENTA",
      "KUMAGAI",
      "NISHIMATSU",
    ],
  },
  {
    id: "construction-deflator-building-trend",
    title: "建設工事費デフレーター（建築系）",
    description:
      "建設工事費デフレーター（2020年度基準）のうち、建設総合・建築総合・住宅総合・非住宅総合の年度推移を比較する折れ線グラフです。",
    notes: "",
    datasetId: "construction-deflator",
    tableId: "0004055085",
    cycle: "年度次",
    displayFormat: "line",
    chartKind: "line",
    axis: "left",
    baseSelections: { tab: "100", cat02: "2020" },
    expandDimensionApiKey: "cat01",
    expandCodes: ["100", "110", "120", "190"],
  },
  {
    id: "building-starts-floor-area-by-use",
    title: "建築着工床面積・用途別（民間非居住）",
    description:
      "建築着工統計（月次）の民間非居住建築物について、事務所・店舗・工場・倉庫・医療福祉・その他サービス業の用途別着工床面積を比較する折れ線グラフです。",
    notes: "",
    datasetId: "building-starts-monthly",
    tableId: "0003119745",
    cycle: "月次",
    displayFormat: "line",
    chartKind: "line",
    axis: "left",
    baseSelections: { tab: "13" },
    expandDimensionApiKey: "cat01",
    expandCodes: ["14", "15", "16", "17", "25", "26"],
  },
];

/**
 * Expands one preset into the explicit list of coordinate maps it would load
 * — one per series, [...baseSelections, expandDimensionApiKey: code]. Shared
 * by the workbench (to drive addManySeries-style loading) and by tests (to
 * verify every combination resolves to a real, published series).
 */
export function presetSeriesCoordinates(preset) {
  return preset.expandCodes.map((code) => ({
    ...preset.baseSelections,
    [preset.expandDimensionApiKey]: code,
  }));
}
