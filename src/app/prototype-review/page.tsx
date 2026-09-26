import { requireAdmin } from '@/lib/require-admin';
import { EvidenceDashboard } from '@/components/evidence-dashboard';
import '../dashboard.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mio · Evidence dashboard', robots: { index: false, follow: false } };
export default async function Page() { await requireAdmin(); return <EvidenceDashboard />; }
