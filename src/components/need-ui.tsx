import Image from 'next/image';
import type { ReactNode } from 'react';

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    chat: <><path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1-7A8 8 0 1 1 21 11Z" /><path d="M8 10h8M8 14h5" /></>,
    note: <><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2 6-6 2 2-6Z" /></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    shield: <><path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6Z" /><path d="m8 12 3 3 5-6" /></>,
    external: <><path d="M14 3h7v7M21 3l-10 10M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
    edit: <><path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z" /></>,
    spark: <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.spark}</svg>;
}
export function Mio({ size = 44, hero = false }: { size?: number; hero?: boolean }) {
  return <Image src="/characters/mio.png" width={462} height={499} alt={hero ? '손을 흔드는 미오 캐릭터' : ''} className={hero ? 'nf-mio-hero' : 'nf-mio'} style={hero ? undefined : { width: size, height: size }} loading={hero ? 'eager' : 'lazy'} />;
}
export function Primary({ children, onClick, disabled = false, icon = 'arrow' }: { children: ReactNode; onClick: () => void; disabled?: boolean; icon?: string }) {
  return <button className="nf-primary" onClick={onClick} disabled={disabled}>{children}<Icon name={icon} size={19} /></button>;
}
export function Choice({ title, description, icon, onClick }: { title: string; description?: string; icon: string; onClick: () => void }) {
  return <button onClick={onClick}><span className="nf-icon-tile"><Icon name={icon} /></span><span><strong>{title}</strong>{description && <small>{description}</small>}</span><Icon name="arrow" size={18} /></button>;
}
