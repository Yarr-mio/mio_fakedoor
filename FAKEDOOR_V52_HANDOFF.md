# Mio Fake Door v5.2 — need-led preview

Current local implementation. No deployment, LLM integration, signup, marketing dispatch or server event transport.

## Changes
- Shared brand phrase: 말하기 어려웠던 마음을 꺼내는 곳. White/lavender and purple retained. Smaller repetitive labels removed; mobile paragraph wrapping improved.
- Home CTA now 미오와 시작하기, with notice that the consent flow is a preview. v1.1 separate consents and whole-select behavior preserved. No legal consent evidence is sent/stored.
- Added perspective need alongside listening, organizing, support; no-chat support access and optional ending preserved. Not all users routed into summaries/actions.
- Three public authored starters displayed initially. Selecting fills composer; user submits. Hidden after first user message, including on returning to chat. Mock notice centralized in visible chat banner. No actual input interpretation.
- Authored fixture-specific summaries separate situation, explicitly expressed feeling, unresolved concern/request. Missing feeling remains unknown. Exact fixture identity and source=fixture required. Multiple cases remain separate. No fixture => explicitly labeled default fictional sample. Summary editable/downloadable; manual edits included in download, typed chat excluded. New messages do not silently overwrite edited summary.
- Completion offers interview interest, need for perspective/information, existing alternatives sufficient, or no further need. Alternatives are not counted as AI rejection/harm.
- Interview page provides mailto to the supplied policy contact mio.official402@gmail.com. No automatic email sent; user must send. No invented appointment, incentive, duration or confirmed recruitment. Inquiry is not therapy; interviews/recording/quotation require separate arrangements/consent.

## Measurement
Local storage key mio_need_flow_events_v5_2, version need-flow-v5.2, mode scripted_demo. Previous v4/v5/v5.1 storage preserved.
- summary_opened rating=selected_fixtures/default_sample.
- followup_choice rating=perspective/existing/none: reported current preference, not behavior validation.
- interview_interest_selected: entry into interview details, not application.
- interview_contact_opened: mailto click only, not sent email, received inquiry or completed interview.
No central metrics or verified unique-person count. No real disclosure/helpfulness/retention/clinical outcome inference. Health narrative excluded from event props. Review still internal=1 UI only, not authenticated.

## Evidence alignment
Research files remain unchanged. H5–H7 incremental value not established; no mandatory CBT, notification or action work added. J1/J2/J3 and J8 considered. Sample summary is a product illustration, not evidence that summary is superior or necessary. Pre-professional-care gap remains one unvalidated situation hypothesis. Existing research recommendations for non-leading interviews before conditional actual LLM observation still apply.

## Validation
Latest validation after conversation policy v1.0: 22 Vitest tests passed; changed-file ESLint and TypeScript passed; Webpack build passed. Original v5.2 browser verification and screenshots: ../output/fakedoor-v5.2/. Latest 8-scenario/32-pair mobile checks: ../output/fakedoor-tone-v1/validation.json (local artifacts outside this repository). Wait/pause/resume, support return, quiet exit, and cumulative summaries passed; no page errors or POST requests were observed in that run. Public-flow checks cover consent optional marketing, initial starters, summary provenance, raw-input exclusion, downloads, followup choices, and interview link without sending. Webpack static build used due to existing dependency symlink.

Next FE/BE integration must provide versioned server-side consent checking, an actual recruitment workflow if central intake is desired, verified data handling, and distinguish interest clicks from completed actions. Current email inquiry is the only outward handoff. No customer outreach performed.

## 연속 대화 목업 추가
8개 상황·32쌍(64개 메시지), 단계별 예시 선택·실패/중단 재개·누적 샘플 정리를 추가했다. 창작 데이터이며 실제 연구/LLM 결과가 아니다. 상세 역할·전체 대사·응답 의도·예외·실제 연동 범위는 docs/CONVERSATION_MOCK_HANDOFF.md 참조. 기존 자료와 단일 톤 예시 5쌍은 유지한다.

## 대화 정책 v1.0 적용
- 상세 BE/LLM 전달 문서: [BACKEND_LLM_CONVERSATION_POLICY.md](docs/BACKEND_LLM_CONVERSATION_POLICY.md). 근거 한계, 문체, 요청별 전환, 프롬프트 초안, 서버/FE 계약과 검증 항목 포함.
- 32개 연속 응답과 5개 단일 응답, 기본 진입/미지원 입력 응답 수정. 기록자 언어 제거, 공감 뒤 자동 질문 감소, 요청한 정리는 바로 제공.
- `followUp`: offer / wait / pause / end. fixture 기반이며 자유 입력의 의미·위험을 분석하지 않음. wait/pause에서는 다음 예시가 숨겨지며 명시적 재개로 다시 표시. end는 정리·입력·추가 제안을 숨기고 quiet_done으로 종료 가능.
- `conversation_ended_quietly`는 단순 UI 종료 기록이며 임상 악화/실제 위해로 해석하지 않음. 이 경로에서는 피드백·인터뷰 자동 진입 없음.
- 대사 JSON 수정 후 `python3 scripts/render-conversation-handoff.py`로 전체 대사 부록을 갱신할 수 있음.
