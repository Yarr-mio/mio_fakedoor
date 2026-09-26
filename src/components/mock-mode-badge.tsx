"use client";

import { useEffect } from "react";
import { isMockMode } from "@/lib/api/config";
import { installMockConsole } from "@/lib/api/mock-api";

export function MockModeBadge() {
  const mock = isMockMode();
  useEffect(() => {
    if (mock) installMockConsole();
  }, [mock]);
  if (!mock) return null;
  return (
    <div className="nf-mock-badge" role="status">
      MOCK MODE
    </div>
  );
}
