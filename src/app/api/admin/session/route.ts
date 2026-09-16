import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, SESSION_SECONDS, adminConfig, allowLogin, createAdminSession, sameOrigin, validAccessKey, validAdminSession } from '@/lib/admin-session';

export const runtime = 'nodejs';
function reply(message: string, status: number) { return NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } }); }
export async function GET() {
  return validAdminSession((await cookies()).get(ADMIN_COOKIE)?.value, adminConfig()) ? reply('인증됨', 200) : reply('인증이 필요합니다.', 401);
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply('허용되지 않은 요청입니다.', 403);
  const config = adminConfig();
  if (!config) return reply('관리자 인증이 설정되지 않았습니다. 서버 환경변수를 확인해주세요.', 503);
  if (!allowLogin()) return reply('로그인 요청이 많습니다. 15분 후 다시 시도해주세요.', 429);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply('요청 형식이 올바르지 않습니다.', 415);
  // Stream cap also covers missing or forged Content-Length headers.
  const reader = request.body?.getReader();
  if (!reader) return reply('접근 키를 입력해주세요.', 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024) { await reader.cancel(); return reply('요청이 너무 큽니다.', 413); }
      chunks.push(part.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof body.key !== 'string' || !validAccessKey(body.key, config)) return reply('접근 키를 확인해주세요.', 401);
  } catch { return reply('요청 형식이 올바르지 않습니다.', 400); }
  const response = reply('로그인했습니다.', 200);
  response.cookies.set(ADMIN_COOKIE, createAdminSession(config), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: SESSION_SECONDS });
  return response;
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return reply('허용되지 않은 요청입니다.', 403);
  const response = reply('로그아웃했습니다.', 200);
  response.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}
