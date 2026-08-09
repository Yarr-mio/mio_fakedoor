"use client";

/**
 * fake door A/B CTA.
 *  - variant "form": 베타 신청 폼 (이메일 수집)
 *  - variant "link": 직행 버튼. OS별 스토어 링크가 있으면 그리로 보내고
 *    (iOS→NEXT_PUBLIC_BETA_LINK_URL=TestFlight, Android→NEXT_PUBLIC_BETA_LINK_URL_ANDROID),
 *    없으면 fake door("정원이 가득 찼어요") → 이메일 폼 폴백으로 수요를 측정한다.
 *    데스크톱 등 설치 불가 환경도 폼 폴백으로 보낸다.
 */
import { useEffect, useState, type FormEvent } from "react";
import { getAnonId, getUtm, getVariant, track } from "@/lib/funnel-client";
import type { Variant } from "@/lib/funnel-events";

type Platform = "ios" | "android" | "other";

function getPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function betaLinkFor(platform: Platform): string | undefined {
  if (platform === "ios") return process.env.NEXT_PUBLIC_BETA_LINK_URL;
  if (platform === "android") return process.env.NEXT_PUBLIC_BETA_LINK_URL_ANDROID;
  return undefined;
}

interface Props {
  type: string;
  characterName: string;
}

type FormState = "idle" | "submitting" | "done" | "error";

export default function BetaCta({ type, characterName }: Props) {
  // variant는 클라이언트에서만 알 수 있다 — hydration mismatch를 피하려고 mount 후 결정
  const [variant, setVariant] = useState<Variant | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [fakedoor, setFakedoor] = useState(false);
  const [email, setEmail] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [duplicated, setDuplicated] = useState(false);

  useEffect(() => {
    setVariant(getVariant());
  }, []);

  function openForm() {
    track("cta_clicked", { type, variant: "form", kind: "beta_form" });
    track("beta_form_opened", { type, variant: "form" });
    setFormOpen(true);
  }

  function handleLinkClick() {
    const platform = getPlatform();
    track("cta_clicked", { type, variant: "link", kind: "beta_link", platform });
    const url = betaLinkFor(platform);
    if (url) {
      track("beta_link_redirected", { type, platform });
      // keepalive 이벤트가 나갈 시간을 살짝 준다
      setTimeout(() => {
        window.location.href = url;
      }, 150);
      return;
    }
    // fake door: 이 플랫폼용 도착지가 없다 — 수요만 측정하고 폴백 폼으로 전환
    track("fakedoor_shown", { type, platform });
    setFakedoor(true);
    setFormOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (formState === "submitting") return;
    setFormState("submitting");
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          anonId: getAnonId(),
          variant,
          resultType: type,
          source: fakedoor ? "fakedoor_fallback" : "result_cta",
          utm: getUtm(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === "invalid_email") {
          setFormState("error");
          return;
        }
        throw new Error("submit_failed");
      }
      const data = (await res.json()) as { duplicated?: boolean };
      setDuplicated(Boolean(data.duplicated));
      setFormState("done");
    } catch {
      setFormState("error");
    }
  }

  // variant 결정 전에는 자리만 잡아둔다 (레이아웃 점프 방지)
  if (!variant) {
    return <div className="h-[3.75rem] w-full rounded-2xl bg-white/[0.04]" aria-hidden />;
  }

  if (formState === "done") {
    return (
      <div className="fade-up rounded-2xl border border-mio-500/40 bg-mio-500/10 px-5 py-5 text-center">
        <p className="text-base font-bold text-ink-100">
          {duplicated ? "이미 신청되어 있어요 ✓" : "신청 완료! 💌"}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-400">
          자리가 나는 대로 {characterName}와 만날 수 있는
          <br />
          초대장을 보내드릴게요.
        </p>
      </div>
    );
  }

  if (formOpen) {
    return (
      <form onSubmit={handleSubmit} className="fade-up flex flex-col gap-2.5">
        {fakedoor && (
          <div className="rounded-2xl border border-gold-400/30 bg-gold-400/10 px-4 py-3 text-sm leading-relaxed text-gold-300">
            지금은 베타 정원이 가득 찼어요 😢
            <br />
            이메일을 남겨주시면 자리가 나는 대로 알려드릴게요.
          </div>
        )}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일 주소"
          autoComplete="email"
          className="w-full rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 text-base text-ink-100 placeholder:text-ink-500 focus:border-mio-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={formState === "submitting"}
          className="w-full rounded-2xl bg-mio-500 px-6 py-4 text-base font-bold text-night-950 shadow-[0_8px_28px_rgba(133,134,240,0.45)] transition hover:bg-mio-400 active:scale-[0.98] disabled:opacity-60"
        >
          {formState === "submitting" ? "신청 중…" : "베타 초대 받기"}
        </button>
        {formState === "error" && (
          <p className="text-center text-xs text-[#ff9d9d]">
            제출에 실패했어요. 이메일 주소를 확인하고 다시 시도해 주세요.
          </p>
        )}
        <p className="text-center text-[0.65rem] leading-relaxed text-ink-500">
          이메일은 베타 초대 안내에만 사용하고, 요청 시 바로 삭제해요.
        </p>
      </form>
    );
  }

  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={handleLinkClick}
        className="w-full rounded-2xl bg-mio-500 px-6 py-4 text-base font-bold text-night-950 shadow-[0_8px_28px_rgba(133,134,240,0.45)] transition hover:bg-mio-400 active:scale-[0.98]"
      >
        지금 바로 {characterName} 만나러 가기
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openForm}
      className="w-full rounded-2xl bg-mio-500 px-6 py-4 text-base font-bold text-night-950 shadow-[0_8px_28px_rgba(133,134,240,0.45)] transition hover:bg-mio-400 active:scale-[0.98]"
    >
      베타 신청하고 {characterName} 만나기
    </button>
  );
}
