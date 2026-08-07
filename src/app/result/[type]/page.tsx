import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import BetaCta from "@/components/BetaCta";
import ResultTracker from "@/components/ResultTracker";
import ShareButtons from "@/components/ShareButtons";
import { ALL_TYPE_IDS, BURNOUT_TYPES, isBurnoutTypeId } from "@/lib/burnout-types";
import { CHARACTERS } from "@/lib/characters";

interface Props {
  params: Promise<{ type: string }>;
}

export function generateStaticParams() {
  return ALL_TYPE_IDS.map((type) => ({ type }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params;
  if (!isBurnoutTypeId(type)) return {};
  const burnoutType = BURNOUT_TYPES[type];
  const title = `나의 번아웃 유형: ${burnoutType.name}`;
  const description = `${burnoutType.tagline} — 너는 어떤 유형이야? 1분 만에 확인해 봐.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `/og/${type}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/og/${type}`],
    },
  };
}

export default async function ResultPage({ params }: Props) {
  const { type } = await params;
  if (!isBurnoutTypeId(type)) notFound();

  const burnoutType = BURNOUT_TYPES[type];
  const character = CHARACTERS[burnoutType.characterId];
  const [colorFrom, colorTo] = burnoutType.colors;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-12 pt-10">
      <Suspense fallback={null}>
        <ResultTracker type={type} />
      </Suspense>

      {/* 유형 헤더 */}
      <header className="fade-up text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
          나의 번아웃 유형
        </p>
        <div
          className="mx-auto mt-5 flex h-24 w-24 items-center justify-center rounded-full text-5xl shadow-[0_12px_40px_rgba(133,134,240,0.3)]"
          style={{ background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})` }}
          aria-hidden
        >
          {burnoutType.glyph}
        </div>
        <h1 className="mt-5 text-3xl font-bold">{burnoutType.name}</h1>
        <p
          className="mt-2 bg-clip-text text-[0.95rem] font-semibold text-transparent"
          style={{ backgroundImage: `linear-gradient(90deg, ${colorFrom}, ${colorTo})` }}
        >
          “{burnoutType.tagline}”
        </p>
      </header>

      {/* 설명 */}
      <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <p className="text-[0.95rem] leading-relaxed text-ink-300">
          {burnoutType.description}
        </p>
      </section>

      {/* 특징 */}
      <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <h2 className="text-sm font-bold text-ink-100">이런 모습, 익숙하지 않나요?</h2>
        <ul className="mt-3 flex flex-col gap-2.5">
          {burnoutType.traits.map((trait) => (
            <li key={trait} className="flex gap-2.5 text-[0.9rem] leading-relaxed text-ink-300">
              <span className="text-mio-400" aria-hidden>
                ✦
              </span>
              {trait}
            </li>
          ))}
        </ul>
      </section>

      {/* 필요한 것 */}
      <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <h2 className="text-sm font-bold text-ink-100">지금 나에게 필요한 것</h2>
        <ul className="mt-3 flex flex-col gap-2.5">
          {burnoutType.needs.map((need) => (
            <li key={need} className="flex gap-2.5 text-[0.9rem] leading-relaxed text-ink-300">
              <span className="text-gold-400" aria-hidden>
                ✧
              </span>
              {need}
            </li>
          ))}
        </ul>
      </section>

      {/* 캐릭터 매칭 + CTA */}
      <section className="mt-6 rounded-3xl border border-mio-500/30 bg-gradient-to-b from-mio-500/15 to-transparent p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-mio-300">
          당신의 마음 파트너
        </p>
        <div className="relative mx-auto mt-4 h-32 w-32">
          <div className="absolute inset-0 rounded-full bg-mio-500/25 blur-2xl" aria-hidden />
          <Image
            src={character.image}
            alt={`${character.name} — ${character.specialty}`}
            fill
            sizes="128px"
            className="object-contain drop-shadow-[0_10px_28px_rgba(133,134,240,0.4)]"
          />
        </div>
        <h2 className="mt-3 text-xl font-bold">
          {character.name}
          <span className="ml-2 align-middle text-xs font-medium text-ink-400">
            {character.specialty}
          </span>
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">
          {burnoutType.characterReason}
        </p>
        <p className="mt-3 rounded-2xl bg-night-950/50 px-4 py-3 text-sm leading-relaxed text-mio-300">
          “{character.line}”
        </p>

        <div className="mt-5">
          <BetaCta type={type} characterName={character.name} />
        </div>
      </section>

      {/* 공유 + 다시하기 */}
      <section className="mt-6 flex flex-col gap-2.5">
        <ShareButtons
          type={type}
          typeName={burnoutType.name}
          shareLine={burnoutType.shareLine}
        />
        <Link
          href="/test"
          className="rounded-2xl border border-white/10 px-4 py-3.5 text-center text-sm font-semibold text-ink-400 transition hover:bg-white/[0.05]"
        >
          테스트 다시 하기
        </Link>
        <Link
          href="/"
          className="py-2 text-center text-xs text-ink-500 underline-offset-4 hover:underline"
        >
          나도 내 유형 알아보기 →
        </Link>
      </section>

      {/* 마음 돌봄 안내 (강도 높은 유형) */}
      {burnoutType.heavy && (
        <aside className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-[0.7rem] leading-relaxed text-ink-500">
          마음이 많이 무거운 날이 이어진다면 혼자 견디지 마세요.
          <br />
          자살예방상담 <span className="text-ink-400">☎ 109</span> · 정신건강위기상담{" "}
          <span className="text-ink-400">☎ 1577-0199</span> (24시간)
        </aside>
      )}

      <footer className="mt-8 text-center text-[0.65rem] leading-relaxed text-ink-500">
        본 테스트는 자기 이해를 돕는 콘텐츠로, 의학적 진단이 아니에요.
        <br />ⓒ 폴라리스 · AI 마음 파트너 Mio
      </footer>
    </main>
  );
}
