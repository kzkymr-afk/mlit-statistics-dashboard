import { NextResponse } from "next/server";

import { loadAnnualTable } from "@/lib/annual-building";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const statInfId = parameters.get("statInfId") ?? "";

  try {
    const payload = await loadAnnualTable({
      datasetId: parameters.get("dataset") ?? undefined,
      statInfId,
      sheetName: parameters.get("sheet") ?? undefined,
      offset: Number(parameters.get("offset") ?? 0),
      limit: Number(parameters.get("limit") ?? 80),
      query: parameters.get("q") ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "統計表を読み込めませんでした。",
      },
      { status: 400 },
    );
  }
}
