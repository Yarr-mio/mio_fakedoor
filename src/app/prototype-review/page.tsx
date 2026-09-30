"use client";

import { EvidenceDashboard } from "@/components/evidence-dashboard";
import {
  adminApiKeyTokenSource,
  clearAdminApiKey,
  rememberAdminLoginNotice,
} from "@/lib/admin-api-key";

export default function Page() {
  return (
    <EvidenceDashboard
      tokenSource={adminApiKeyTokenSource}
      onUnauthorized={(message) => {
        clearAdminApiKey();
        rememberAdminLoginNotice(message);
        window.location.replace("/admin/login");
      }}
    />
  );
}
