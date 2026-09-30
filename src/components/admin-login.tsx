'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { rememberAdminApiKey, takeAdminLoginNotice } from '@/lib/admin-api-key';
export function AdminLogin() {
  const [key, setKey] = useState(''); const [message, setMessage] = useState(takeAdminLoginNotice); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
      if (response.ok) { rememberAdminApiKey(key); setKey(''); window.location.replace('/prototype-review'); return; }
      setKey('');
      setMessage((await response.json()).message);
    } catch { setMessage('연결하지 못했습니다. 다시 시도해주세요.'); }
    setBusy(false);
  }
  return <main className="dash-login"><Link href="/" className="dash-logo">Mio</Link><p className="dash-eyebrow">TEAM WORKSPACE</p><h1>관리자 로그인</h1><p>대시보드와 팀 검토 자료는 서버에서 접근 권한을 확인합니다.</p><p>팀이 공유한 접근 키 원문을 입력하세요. SHA-256 해시 값이 아닙니다.</p><form onSubmit={submit}><label htmlFor="access-key">관리자 접근 키</label><input id="access-key" type="password" value={key} onChange={e => setKey(e.target.value)} required maxLength={256} autoComplete="current-password"/><button disabled={busy || !key}>{busy ? '확인 중…' : '대시보드 열기'}</button><p role="status">{message}</p></form><small>키를 URL이나 채팅에 붙이지 마세요. 팀의 비밀 관리 도구를 통해 전달받으세요.</small></main>;
}
