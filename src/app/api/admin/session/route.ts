import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  SESSION_SECONDS,
  adminConfig,
  adminConfigProblems,
  allowLogin,
  createAdminSession,
  sameOrigin,
  validAccessKey,
  validAdminSession,
} from "@/lib/admin-session";

export const runtime = "nodejs";
type SessionErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "ORIGIN_MISMATCH"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "ADMIN_AUTH_NOT_CONFIGURED";
function reply(message: string, status: number, code?: SessionErrorCode) {
  return NextResponse.json(code ? { message, code } : { message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function GET() {
  return validAdminSession(
    (await cookies()).get(ADMIN_COOKIE)?.value,
    adminConfig(),
  )
    ? reply("인증됨", 200)
    : reply("인증이 필요합니다.", 401, "UNAUTHORIZED");
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return reply("허용되지 않은 요청입니다.", 403, "ORIGIN_MISMATCH");
  const config = adminConfig();
  if (!config) {
    const problems = adminConfigProblems();
    console.error(
      "[admin-session] ADMIN_AUTH_NOT_CONFIGURED",
      problems.length ? problems.join(", ") : "조건 판별 불가",
    );
    return reply(
      "관리자 인증이 설정되지 않았습니다. 서버 환경변수를 확인해주세요.",
      503,
      "ADMIN_AUTH_NOT_CONFIGURED",
    );
  }
  if (!allowLogin())
    return reply(
      "로그인 요청이 많습니다. 15분 후 다시 시도해주세요.",
      429,
      "RATE_LIMITED",
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply(
      "요청 형식이 올바르지 않습니다.",
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    );
  // Stream cap also covers missing or forged Content-Length headers.
  const reader = request.body?.getReader();
  if (!reader) return reply("접근 키를 입력해주세요.", 400, "VALIDATION_ERROR");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return reply("요청이 너무 큽니다.", 413, "PAYLOAD_TOO_LARGE");
      }
      chunks.push(part.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      key?: unknown;
    } | null;
    if (!body || typeof body !== "object" || typeof body.key !== "string")
      return reply("요청 형식이 올바르지 않습니다.", 400, "VALIDATION_ERROR");
    if (!validAccessKey(body.key, config))
      return reply("접근 키를 확인해주세요.", 401, "UNAUTHORIZED");
  } catch {
    return reply("요청 형식이 올바르지 않습니다.", 400, "VALIDATION_ERROR");
  }
  const response = reply("로그인했습니다.", 200);
  response.cookies.set(ADMIN_COOKIE, createAdminSession(config), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return response;
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return reply("허용되지 않은 요청입니다.", 403, "ORIGIN_MISMATCH");
  const response = reply("로그아웃했습니다.", 200);
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
