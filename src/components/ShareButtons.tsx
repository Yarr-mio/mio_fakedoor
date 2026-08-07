"use client";

import { useState } from "react";
import { track } from "@/lib/funnel-client";

interface Props {
  type: string;
  typeName: string;
  shareLine: string;
}

export default function ShareButtons({ type, typeName, shareLine }: Props) {
  const [copied, setCopied] = useState(false);

  function shareUrl(): string {
    return `${window.location.origin}/result/${type}`;
  }

  async function handleWebShare() {
    track("share_clicked", { type, method: "webshare" });
    try {
      await navigator.share({
        title: `나의 번아웃 유형: ${typeName}`,
        text: `${shareLine} — 너는 어떤 유형이야?`,
        url: shareUrl(),
      });
    } catch {
      // 사용자가 공유 시트를 닫은 경우 등 — 무시
    }
  }

  async function handleCopy() {
    track("share_clicked", { type, method: "copy" });
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard 권한 거부 — 무시
    }
  }

  const canWebShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="flex gap-2">
      {canWebShare && (
        <button
          type="button"
          onClick={handleWebShare}
          className="flex-1 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-sm font-semibold text-ink-100 transition hover:bg-white/[0.1] active:scale-[0.98]"
        >
          결과 공유하기 📤
        </button>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="flex-1 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-sm font-semibold text-ink-100 transition hover:bg-white/[0.1] active:scale-[0.98]"
      >
        {copied ? "복사됐어요! ✓" : "링크 복사 🔗"}
      </button>
    </div>
  );
}
