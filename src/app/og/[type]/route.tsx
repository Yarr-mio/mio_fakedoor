import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { BURNOUT_TYPES, isBurnoutTypeId } from "@/lib/burnout-types";

export const runtime = "nodejs";

async function loadFont(file: string): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "src/assets", file));
}

/** 감정 행성 PNG를 data URI로 인라인한다 — OG 렌더러는 외부 URL을 못 가져온다. */
async function loadPlanetDataUri(planetPath: string): Promise<string | null> {
  try {
    const buffer = await readFile(path.join(process.cwd(), "public", planetPath));
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params;
  if (!isBurnoutTypeId(type)) {
    return new Response("Not found", { status: 404 });
  }
  const burnoutType = BURNOUT_TYPES[type];
  const [colorFrom, colorTo] = burnoutType.colors;

  const [bold, semiBold, planetDataUri] = await Promise.all([
    loadFont("Pretendard-Bold.otf"),
    loadFont("Pretendard-SemiBold.otf"),
    burnoutType.planet ? loadPlanetDataUri(burnoutType.planet) : Promise.resolve(null),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage:
            "radial-gradient(ellipse 90% 60% at 50% -10%, rgba(133,134,240,0.25), rgba(6,6,26,0)), linear-gradient(180deg, #08081F 0%, #06061A 55%, #0D002B 100%)",
          fontFamily: "Pretendard",
          position: "relative",
        }}
      >
        {/* 별 장식 */}
        {[
          { top: 90, left: 140, size: 6, opacity: 0.9 },
          { top: 180, left: 1020, size: 4, opacity: 0.7 },
          { top: 420, left: 90, size: 4, opacity: 0.5 },
          { top: 520, left: 1100, size: 6, opacity: 0.8 },
          { top: 100, left: 620, size: 3, opacity: 0.5 },
          { top: 560, left: 480, size: 3, opacity: 0.6 },
        ].map((star, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              borderRadius: 999,
              backgroundColor: `rgba(245,245,250,${star.opacity})`,
            }}
          />
        ))}

        <div
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: "#B9BBFA",
            letterSpacing: 6,
          }}
        >
          나의 번아웃 유형 테스트
        </div>

        {/* 감정 행성 — 에셋이 있으면 실제 이미지, 없으면 색상 오브 폴백 */}
        {planetDataUri ? (
          <img
            src={planetDataUri}
            width={190}
            height={190}
            alt=""
            style={{ marginTop: 36, objectFit: "contain" }}
          />
        ) : (
          <div
            style={{
              marginTop: 44,
              width: 140,
              height: 140,
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundImage: `linear-gradient(135deg, ${colorFrom}, ${colorTo})`,
              boxShadow: "0 20px 80px rgba(133,134,240,0.45)",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                backgroundColor: "rgba(6,6,26,0.35)",
              }}
            />
          </div>
        )}

        <div
          style={{
            marginTop: 40,
            fontSize: 84,
            fontWeight: 700,
            color: "#F5F5FA",
          }}
        >
          {burnoutType.name}
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 34,
            fontWeight: 600,
            color: "#C9CADF",
          }}
        >
          {`“${burnoutType.tagline}”`}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 44,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 24,
            fontWeight: 600,
            color: "#7F80A0",
          }}
        >
          AI 마음 파트너 · Mio
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Pretendard", data: bold, weight: 700, style: "normal" },
        { name: "Pretendard", data: semiBold, weight: 600, style: "normal" },
      ],
    },
  );
}
