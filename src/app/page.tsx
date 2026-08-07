import Image from "next/image";
import Link from "next/link";
import PageViewTracker from "@/components/PageViewTracker";
import { ALL_TYPE_IDS, BURNOUT_TYPES } from "@/lib/burnout-types";

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 pb-12 pt-14 text-center">
      <PageViewTracker page="landing" />

      <p className="rounded-full border border-mio-500/40 bg-mio-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-mio-300">
        Mio 마음 테스트
      </p>

      <h1 className="mt-6 text-[1.9rem] font-bold leading-snug">
        요즘 나, 왜 이렇게
        <br />
        지쳐 있을까?
      </h1>

      <p className="mt-4 text-[0.95rem] leading-relaxed text-ink-400">
        12개의 질문으로 알아보는 <span className="text-ink-300">나의 번아웃 유형.</span>
        <br />
        지금 내 마음이 어떤 궤도에 있는지
        <br />
        1분 만에 확인해 보세요.
      </p>

      <div className="relative mt-8 h-44 w-44">
        <div
          className="absolute inset-0 rounded-full bg-mio-500/25 blur-3xl"
          aria-hidden
        />
        <Image
          src="/characters/mio.png"
          alt="미오 — Mio의 펭귄 캐릭터"
          fill
          priority
          sizes="176px"
          className="fade-up object-contain drop-shadow-[0_12px_32px_rgba(133,134,240,0.35)]"
        />
      </div>

      <div className="mt-8 flex items-center gap-4 text-xs text-ink-500">
        <span>⏱️ 소요 1분</span>
        <span aria-hidden>·</span>
        <span>🔒 로그인 없음</span>
        <span aria-hidden>·</span>
        <span>💌 유형별 회복 처방</span>
      </div>

      <Link
        href="/test"
        className="mt-6 block w-full rounded-2xl bg-mio-500 px-6 py-4 text-base font-bold text-night-950 shadow-[0_8px_28px_rgba(133,134,240,0.45)] transition hover:bg-mio-400 active:scale-[0.98]"
      >
        내 유형 확인하기
      </Link>

      <section className="mt-12 w-full">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-500">
          이런 유형들이 기다리고 있어요
        </h2>
        <ul className="mt-4 grid grid-cols-3 gap-2">
          {ALL_TYPE_IDS.map((id) => {
            const type = BURNOUT_TYPES[id];
            return (
              <li
                key={id}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-3"
              >
                <span className="block text-xl" aria-hidden>
                  {type.glyph}
                </span>
                <span className="mt-1 block text-[0.7rem] font-medium text-ink-400">
                  {type.name}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="mt-auto pt-12 text-[0.65rem] leading-relaxed text-ink-500">
        <p>
          본 테스트는 자기 이해를 돕는 콘텐츠로, 의학적 진단이 아니에요.
          <br />ⓒ 폴라리스 · AI 마음 파트너 <span className="text-ink-400">Mio</span>
        </p>
      </footer>
    </main>
  );
}
