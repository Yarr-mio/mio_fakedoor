import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { unsetAdminTokenSource } from "@/lib/api/admin";
import {
  AdminSafetyQueue,
  SAFETY_SEGMENT_REVIEW_ENABLED,
} from "./admin-safety-queue";

describe("safety segment review gate", () => {
  it("hides segment and review controls and does not call the server", () => {
    expect(SAFETY_SEGMENT_REVIEW_ENABLED).toBe(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const html = renderToStaticMarkup(
      <AdminSafetyQueue
        tokenSource={unsetAdminTokenSource}
        start=""
        end=""
      />,
    );
    expect(html).toContain(
      "원문 구간과 재검토는 Safety 권한 키가 설정되지 않아 사용할 수 없습니다",
    );
    expect(html).not.toContain("구간 열람");
    expect(html).not.toContain("재검토 기록");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
