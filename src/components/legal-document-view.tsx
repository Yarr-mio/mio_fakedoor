"use client";

import { useEffect, useState } from "react";
import {
  LegalDocument,
  type LegalDocumentId,
} from "@/components/legal-document";
import { bootstrapVisit } from "@/lib/visit-session";
import type { ServerMode } from "@/lib/api/types";

export function LegalDocumentWithVisitMode({
  document,
}: {
  document: LegalDocumentId;
}) {
  const [mode, setMode] = useState<ServerMode | null>(null);
  useEffect(() => {
    void bootstrapVisit().then((visit) => {
      if (visit) setMode(visit.mode);
    });
  }, []);
  return <LegalDocument document={document} mode={mode} />;
}
