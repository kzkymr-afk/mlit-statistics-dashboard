import { NextResponse } from "next/server";

import { loadAnnualValue } from "@/lib/annual-building";
import type { CellDescriptor } from "@/lib/annual-building-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      statInfId?: string;
      sheetName?: string;
      descriptor?: CellDescriptor;
    };
    if (!body.statInfId || !body.descriptor) {
      throw new Error("統計ファイルとセルの指定が必要です。");
    }
    const payload = await loadAnnualValue({
      statInfId: body.statInfId,
      sheetName: body.sheetName,
      descriptor: body.descriptor,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "年度推移の値を読み込めませんでした。",
      },
      { status: 400 },
    );
  }
}
