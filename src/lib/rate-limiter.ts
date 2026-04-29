// ============================================
// Rate Limiter — API 限流中间件
// ============================================

import { RateLimiterMemory } from "rate-limiter-flexible";
import { NextRequest, NextResponse } from "next/server";

/** 上传接口限流：每 IP 每分钟最多 10 次上传 */
const uploadLimiter = new RateLimiterMemory({
  keyPrefix: "upload",
  points: 10, // 10 次
  duration: 60, // 每 60 秒
});

/** 分析接口限流：每 IP 每分钟最多 5 次分析 */
const analysisLimiter = new RateLimiterMemory({
  keyPrefix: "analysis",
  points: 5,
  duration: 60,
});

function getClientIp(request: NextRequest): string {
  // 优先使用 X-Forwarded-For（代理后），fallback 到 socket address
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  // Next.js 14+ 使用 request.ip
  return (request as unknown as { ip?: string }).ip || "unknown";
}

export async function checkUploadLimit(request: NextRequest): Promise<NextResponse | null> {
  try {
    const ip = getClientIp(request);
    await uploadLimiter.consume(ip);
    return null;
  } catch {
    return NextResponse.json(
      { error: "上传过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
}

export async function checkAnalysisLimit(request: NextRequest): Promise<NextResponse | null> {
  try {
    const ip = getClientIp(request);
    await analysisLimiter.consume(ip);
    return null;
  } catch {
    return NextResponse.json(
      { error: "分析请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
}
