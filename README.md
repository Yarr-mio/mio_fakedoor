# mio_funnel — 번아웃 유형 테스트

Mio 클로즈 베타 유입을 위한 심리테스트 기반 fake door 퍼널.
본 서비스(mio_server / mio_app)와 **완전히 분리**되어 있으며, 자체 이벤트 수집으로 수요를 검증한다.

```
랜딩 → 12문항 테스트 → 번아웃 유형 결과(6종) → 캐릭터 매칭 → 베타 CTA (A/B)
```

## 콘텐츠 구조

- **문항**: 12문항 × 4선택지. MBI 3축을 참고한 4축 스코어링 — 소진(e) · 냉소(c) · 과잉사고(r) · 무기력(a) + `mask`(괜찮은 척) 태그. → `src/lib/quiz-data.ts`
- **유형 6종**: 과열 항성 · 가면 은하 · 안개 성운 · 표류 혜성 · 폭풍 행성 · 새벽 별. 유형마다 Mio 캐릭터 1명(미오/바우/루미/모모/치치)이 매칭된다. → `src/lib/burnout-types.ts`
- **판정 규칙**(결정적, 단위 테스트로 고정): mask ≥ 2 & e ≥ 6 → 가면 은하 / 총점 < 12 → 새벽 별 / 그 외 최고 축(동률 시 e > a > r > c). → `src/lib/scoring.ts`

## A/B fake door

variant는 최초 방문 시 50/50 배정 후 localStorage에 고정 (`?v=form` / `?v=link`로 QA 오버라이드).

| variant | CTA | 측정 |
|---|---|---|
| `form` | 베타 신청 폼 (이메일) | `cta_clicked` → `beta_submitted` |
| `link` | 직행 버튼 | `NEXT_PUBLIC_BETA_LINK_URL` 있으면 리다이렉트, **없으면 fake door**: "정원 마감" 안내 + 이메일 폴백 폼 (`fakedoor_shown` → `beta_submitted`) |

## 이벤트

화이트리스트(`src/lib/funnel-events.ts`) 밖 이름은 서버가 조용히 드롭한다 — mio_server의 event-whitelist.yml과 같은 정책.

`page_viewed` `test_started` `question_answered` `test_completed` `result_viewed`
`share_clicked` `cta_clicked` `beta_form_opened` `beta_submitted` `beta_link_redirected` `fakedoor_shown`

모든 이벤트에 익명 ID(localStorage UUID)·variant·첫 유입 UTM이 붙는다. 로그인 없음.

## 실행

```bash
npm install
cp .env.example .env.local   # 로컬은 전부 비워도 동작 (수집이 콘솔 로그로 폴백)
npm run dev
```

- 테스트: `npm test` (스코어링 엔진 15케이스)
- 통계: `/admin?token=<ADMIN_TOKEN>` — 퍼널 전환율, A/B 비교, 유형 분포, 신청 목록

## 배포 (Vercel)

1. 이 레포를 Vercel에 연결
2. Storage에서 Postgres(Neon) 생성 → `DATABASE_URL` 자동 주입 (스키마는 첫 요청 시 자동 생성, `db/schema.sql` 참고)
3. 환경변수: `NEXT_PUBLIC_SITE_URL`(배포 도메인), `ADMIN_TOKEN`, (선택) `NEXT_PUBLIC_BETA_LINK_URL`
4. 유입 링크에 UTM을 붙여 배포: `?utm_source=everytime&utm_campaign=burnout1`

## 구조

```
src/
├── app/
│   ├── page.tsx               # 랜딩
│   ├── test/page.tsx          # 문항 진행
│   ├── result/[type]/page.tsx # 결과 + 캐릭터 매칭 + A/B CTA
│   ├── og/[type]/route.tsx    # 유형별 동적 OG 이미지
│   ├── admin/page.tsx         # 퍼널 통계 (ADMIN_TOKEN)
│   └── api/{events,submit}/   # 수집 API
├── components/                # BetaCta(A/B), ShareButtons, 트래커
└── lib/                       # 문항·유형·캐릭터 데이터, 스코어링, DB, 클라이언트 트래킹
```
