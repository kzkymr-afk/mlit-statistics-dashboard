import AnnualBuildingExplorer from "@/components/AnnualBuildingExplorer";
import buildingCatalog from "@/data/catalogs/building-annual.json";
import ordersCatalog from "@/data/catalogs/orders-major50-annual.json";
import type { AnnualCatalog } from "@/lib/annual-building-types";

export const metadata = {
  title: "建設統計・年度データ | 国交省統計パネル",
  description:
    "建築物着工統計と受注動態（大手50社）の2013年度以降の全Excelを表で閲覧し、任意項目を折れ線・棒・左右2軸でグラフ化できます。",
};

export default function Home() {
  return (
    <AnnualBuildingExplorer
      catalogs={
        [buildingCatalog, ordersCatalog] as AnnualCatalog[]
      }
    />
  );
}
