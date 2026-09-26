import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, adminConfig, validAdminSession } from './admin-session';

export async function requireAdmin() {
  if (!validAdminSession((await cookies()).get(ADMIN_COOKIE)?.value, adminConfig())) redirect('/admin/login');
}
