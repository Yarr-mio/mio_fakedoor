import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Mio · 지금, 당신의 마음 곁에', description: '필요한 만큼 이야기하고, 생각을 정리하고. 지금 나에게 맞는 다음을 찾아가는 Mio 화면 체험.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
