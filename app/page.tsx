import StatsDashboard from "@/components/StatsDashboard";
import snapshot from "@/data/official-snapshot.json";
import type { StatisticsPayload } from "@/lib/types";

export const metadata = {
  title: "住宅着工ダッシュボード | 国交省統計パネル",
  description:
    "国土交通省の住宅着工統計から、必要な項目だけを表とグラフで確認・出力できます。",
};

export default function Home() {
  return <StatsDashboard initialData={snapshot as StatisticsPayload} />;
}
