import { requireAdmin } from "@/lib/require-admin";
import "../dashboard.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Mio · Evidence dashboard",
  robots: { index: false, follow: false },
};

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return children;
}
