import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Mio · 마음을 나누는 AI 상담', description: '말하기 어려웠던 마음을 꺼내는 시간. 표정과 몸짓이 담긴 가상의 AI 상담사 대화 체험.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
