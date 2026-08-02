import StatisticsSystemWorkbench from "@/components/StatisticsSystemWorkbench";

export const metadata = {
  title: "国交省統計システム | 必要な項目を表・グラフ・CSVへ",
  description:
    "国交省・日建連の建設統計と、BuildBaseで確定したゼネコン21社の会社別データを、表・グラフ・CSVで比較します。",
};

export default function Home() {
  return <StatisticsSystemWorkbench />;
}
