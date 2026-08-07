"use client";

import { useEffect } from "react";
import { captureUtm, track } from "@/lib/funnel-client";

/** 마운트 시 1회: 첫 유입 UTM 보존 + page_viewed 이벤트 */
export default function PageViewTracker({ page }: { page: string }) {
  useEffect(() => {
    captureUtm();
    track("page_viewed", { page });
  }, [page]);

  return null;
}
