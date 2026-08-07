import { NextRequest, NextResponse } from "next/server";
import { insertEvents, insertSignup } from "@/lib/db";
import { MAX_ANON_ID_LENGTH, VARIANTS } from "@/lib/funnel-events";
import { isBurnoutTypeId } from "@/lib/burnout-types";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SOURCES = new Set(["result_cta", "fakedoor_fallback"]);

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const anonId =
    typeof body.anonId === "string" ? body.anonId.slice(0, MAX_ANON_ID_LENGTH) : null;
  const variant =
    typeof body.variant === "string" && (VARIANTS as readonly string[]).includes(body.variant)
      ? body.variant
      : null;
  const resultType =
    typeof body.resultType === "string" && isBurnoutTypeId(body.resultType)
      ? body.resultType
      : null;
  const source =
    typeof body.source === "string" && SOURCES.has(body.source) ? body.source : "result_cta";

  const utm: Record<string, string> = {};
  if (body.utm && typeof body.utm === "object") {
    for (const [key, value] of Object.entries(body.utm as Record<string, unknown>)) {
      if (typeof value === "string" && /^[a-z_]{3,32}$/.test(key)) {
        utm[key] = value.slice(0, 256);
      }
    }
  }

  try {
    const { duplicated } = await insertSignup({
      email,
      anonId,
      variant,
      resultType,
      source,
      utm,
    });

    // 제출 이벤트는 신뢰 가능한 서버 기록으로도 남긴다
    if (anonId) {
      await insertEvents([
        {
          anonId,
          variant,
          name: "beta_submitted",
          props: { type: resultType, source, duplicated },
          utm,
          ua: request.headers.get("user-agent")?.slice(0, 256) ?? null,
        },
      ]);
    }

    return NextResponse.json({ ok: true, duplicated });
  } catch (err) {
    console.error("[submit] failed", err);
    return NextResponse.json({ error: "storage_error" }, { status: 500 });
  }
}
