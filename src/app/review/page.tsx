import { requireAdmin } from '@/lib/require-admin';
import LegacyReview from '@/components/legacy-review';
export const dynamic = 'force-dynamic';
export default async function Page() { await requireAdmin(); return <LegacyReview />; }
