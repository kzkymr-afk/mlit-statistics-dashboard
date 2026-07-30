import { NextResponse } from "next/server";
import snapshot from "@/data/snapshots/official-snapshot.json";
import { loadOfficialStatistics } from "@/lib/official-statistics";
import type { StatisticsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await loadOfficialStatistics();
    return NextResponse.json(payload, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "公式データを取得できませんでした。";
    const fallback = structuredClone(snapshot) as StatisticsPayload;
    fallback.metadata.mode = "snapshot";
    fallback.metadata.note = `公式サイトへの接続に失敗したため、保存済みデータを表示しています。${message}`;
    return NextResponse.json(fallback, {
      headers: {
        "cache-control": "no-store",
        "x-statistics-fallback": "snapshot",
      },
    });
  }
}
