// ============================================
// GET /api/history
// 获取分析历史和上传历史
// ============================================

import { NextResponse } from "next/server";
import { readHistory, getAllDatasets } from "@/lib/history";

export async function GET() {
  try {
    const [history, datasets] = await Promise.all([
      readHistory(),
      getAllDatasets(),
    ]);

    return NextResponse.json({
      history,
      datasets,
    });
  } catch (err) {
    console.error("History API error:", err);
    return NextResponse.json(
      { error: "获取历史记录失败" },
      { status: 500 }
    );
  }
}
