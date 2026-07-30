import AnnualBuildingExplorer from "@/components/AnnualBuildingExplorer";
import catalog from "@/data/catalogs/building-annual.json";
import type { AnnualCatalog } from "@/lib/annual-building-types";

export const metadata = {
  title: "建築着工統計・年度データ | 国交省統計パネル",
  description:
    "建築物着工統計の2013年度以降の全Excelを表で閲覧し、任意項目を折れ線・棒・左右2軸でグラフ化できます。",
};

export default function Home() {
  return <AnnualBuildingExplorer catalog={catalog as AnnualCatalog} />;
}
