import buildBaseCatalog from "@/data/catalogs/buildbase-company-data.json";

export const DEFAULT_BUILDING_USE_FIELD_ID = "building_orders_use_office";

const BUILDING_USE_FIELDS = [
  { id: DEFAULT_BUILDING_USE_FIELD_ID, label: "事務所・庁舎" },
  { id: "building_orders_use_lodging", label: "宿泊施設" },
  { id: "building_orders_use_commercial", label: "店舗・商業" },
  { id: "building_orders_use_factory", label: "工場・発電所" },
  { id: "building_orders_use_logistics", label: "倉庫・流通" },
  { id: "building_orders_use_housing", label: "住宅" },
  { id: "building_orders_use_education_research", label: "教育・研究・文化" },
  { id: "building_orders_use_medical_welfare", label: "医療・福祉" },
  { id: "building_orders_use_entertainment_other", label: "娯楽・その他" },
] as const;

type Props = {
  selectedFieldId: string;
  onSelect: (fieldId: string) => void;
};

export default function BuildBaseBuildingUseShortcut({
  selectedFieldId,
  onSelect,
}: Props) {
  const period =
    buildBaseCatalog.buildingUseFiscalYearFrom ===
    buildBaseCatalog.buildingUseFiscalYearTo
      ? `${buildBaseCatalog.buildingUseFiscalYearFrom}年度`
      : `${buildBaseCatalog.buildingUseFiscalYearFrom}〜${buildBaseCatalog.buildingUseFiscalYearTo}年度`;

  return (
    <section
      className="buildbase-use-shortcut"
      aria-labelledby="buildbase-use-heading"
    >
      <header>
        <div>
          <span>FACTBOOK ORDERS</span>
          <h3 id="buildbase-use-heading">建物用途別受注実績</h3>
        </div>
        <a href="/buildbase-data/">収録基準</a>
      </header>
      <div className="buildbase-use-status">
        <strong>
          {buildBaseCatalog.factbookBuildingUseFilledCount.toLocaleString("ja-JP")}
          件 反映済み
        </strong>
        <span>
          {buildBaseCatalog.buildingUseCompanyCount}社 · {period} · 公式ファクトブック
        </span>
      </div>
      <div className="buildbase-use-options" aria-label="建物用途">
        {BUILDING_USE_FIELDS.map((field) => (
          <button
            type="button"
            key={field.id}
            className={selectedFieldId === field.id ? "active" : ""}
            aria-pressed={selectedFieldId === field.id}
            onClick={() => onSelect(field.id)}
          >
            {field.label}
          </button>
        ))}
      </div>
    </section>
  );
}
