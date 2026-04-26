// ============================================
// GET /api/history/[id]
// 获取单条历史记录（含扩展报告 URL）
// ============================================

import { NextResponse } from "next/server";
import { readHistory } from "@/lib/history";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const records = await readHistory();
    const record = records.find((r) => r.id === id);

    if (!record) {
      return NextResponse.json({ error: "记录未找到" }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (err) {
    console.error("History detail API error:", err);
    return NextResponse.json(
      { error: "获取历史记录失败" },
      { status: 500 }
    );
  }
}
