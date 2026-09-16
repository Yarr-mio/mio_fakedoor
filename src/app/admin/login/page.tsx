import { AdminLogin } from '@/components/admin-login';
import '../../dashboard.css';
export const metadata = { title: 'Mio · 관리자 로그인', robots: { index: false, follow: false } };
export default function LoginPage() { return <AdminLogin />; }
