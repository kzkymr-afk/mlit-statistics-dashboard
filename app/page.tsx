import StatisticsSystemWorkbench from "@/components/StatisticsSystemWorkbench";

export const metadata = {
  title: "国交省統計システム | 必要な項目を表・グラフ・CSVへ",
  description:
    "建築着工統計、受注動態（大手50社）、建築物リフォーム・リニューアル調査を、e-Statの公式分類コードで選び、2013年度以降の表・グラフ・CSVへ出力します。",
};

export default function Home() {
  return <StatisticsSystemWorkbench />;
}
