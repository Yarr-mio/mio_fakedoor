import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "나의 번아웃 유형 테스트 | Mio",
    template: "%s | Mio",
  },
  description:
    "요즘 나, 왜 이렇게 지쳤지? 1분 만에 알아보는 나의 번아웃 유형 — 미오의 마음 친구들이 결과에 맞는 회복 방법을 알려드려요.",
  openGraph: {
    type: "website",
    siteName: "Mio",
    title: "나의 번아웃 유형 테스트",
    description: "요즘 나, 왜 이렇게 지쳤지? 1분 만에 알아보는 나의 번아웃 유형",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  themeColor: "#06061a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <div className="starfield" aria-hidden />
        {children}
      </body>
    </html>
  );
}
