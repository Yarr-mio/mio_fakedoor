"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { captureUtm, track } from "@/lib/funnel-client";

/**
 * 결과 페이지 조회 이벤트.
 * ?d=1 (테스트 직후 이동)이 없으면 공유 링크로 들어온 방문으로 본다.
 */
export default function ResultTracker({ type }: { type: string }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    captureUtm();
    const sharedVisit = searchParams.get("d") !== "1";
    track("result_viewed", { type, shared_visit: sharedVisit });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회
  }, [type]);

  return null;
}
