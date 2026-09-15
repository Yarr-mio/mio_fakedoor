> 보관본: v4 당시 README. 현재 구현 기준은 저장소 루트의 [README](../README.md)와 v5.2 인수인계 문서입니다.

# Mio · AI 심리상담 챗봇 프런트

현재 동작 버전은 v4, 디자인은 v3입니다. [실험 설계·이벤트 계약](experiment-v4.md)에 진입 4개 선택, 10턴, 핵심 전환율, 정성 피드백과 판단 기준을 정리했습니다.

v3 디자인: 실사 프로필을 일러스트형 AI 페르소나로 교체하고, 수평 Mio 헤더·보라색 토큰·둥근 카드를 적용했습니다. 자세한 변경과 생성 프롬프트는 [v3 디자인 노트](mio-v3-design.md)를 참고하세요. 아래 레퍼런스·이미지 기록은 v2 작업 이력입니다.

사람 형태의 가상 AI 상담사 프로필 → 상담실 → 행동·표정 묘사가 포함된 대화 → 피드백 흐름입니다. 기존 동물 캐릭터/우주 랜딩을 교체했습니다.

## 실행

```sh
cd /Users/jh/Documents/mio/mio_fakedoor
npm run dev -- --webpack -p 3100
```

- http://localhost:3100 : 상담사 탐색 및 대화
- http://localhost:3100/review : 현재 브라우저 체험 기록 / JSON 다운로드 / 삭제
- 검증: `npm run build -- --webpack`, `npm run lint`, `npm test`
- 정적 결과물: `out/`. 백엔드·DB·AI 호출·배포 없음.

현재 원본 mio_funnel의 node_modules를 심볼릭 링크로 사용합니다. 다른 컴퓨터에서는 링크를 제외하고 `npm ci`로 설치하세요. 원본 프로젝트는 수정하지 않았습니다. 기존 Next.js/React 구조, lockfile, Pretendard, 익명 이벤트 패턴을 재사용했습니다.

## 반영한 레퍼런스

사용자 Discord 이미지: 회색 기울임꼴 행동 묘사 + 밝은 대사 + 사람 프로필 아바타 + 보라색 사용자 말풍선.

- https://www.polybuzz.ai/ : 인물 프로필을 먼저 탐색하고 대화로 진입하는 구조
- https://book.polybuzz.ai/character-profile/basic-setting/greeting : 첫 인사로 인물과 상황을 설정, 대사와 행동/배경을 기울임꼴로 구분
- https://book.polybuzz.ai/character-profile/advanced-settings/dialogue-style : 페르소나별 말투와 예시 대사

`src/lib/counselors.ts`에서 상담사별 인사·상담실·대사·행동을 관리합니다. `Scene`은 `action`, `speech`, 선택적 `after`로 분리되어 있습니다. 임의 HTML/Markdown 삽입 대신 React 텍스트 노드로 표시합니다.

## 체험과 실험 경계

사진·이름은 모두 가상 인물입니다. 실제 전문가의 자격이나 경력을 주장하지 않습니다. 대화는 미리 작성된 3턴 예시이며 사용자 입력을 분석하지 않습니다. 입력 원문은 React 메모리에만 있고 홈 복귀·완료·새로고침 시 사라집니다.

이전 버전 localStorage `mio_fakedoor_counselor_events_v3`에 최근 최대 1,000개 이벤트만 저장합니다. 이전 동물 캐릭터 버전 기록과 분리합니다. 서버 전송은 없습니다. 노출, 상담사 선택, 체험 시작, 직접 입력/추천 문장, 3턴 완료, 편안함, 비언어적 묘사 영향, 향후 이용 의향, 동일 방문 내 재체험을 구분합니다. 대화 원문과 연락처는 수집하지 않습니다.

이 기록은 실제 AI 대화 품질·치료 효과·D1/D3 재방문을 증명하지 않습니다. 이용 의향과 비언어 묘사 선호를 보는 프런트 프로토타입입니다. 다른 방문자의 기록은 중앙에서 조회할 수 없습니다.

## 생성 이미지

도구: built-in Imagegen. 파일: `public/counselors/portraits.png`. 세 인물의 트립틱을 CSS background-position으로 구분해 사용합니다.

최종 프롬프트:

> Create a photorealistic editorial portrait triptych for a Korean AI psychological counseling chatbot prototype. One single wide image divided into THREE EQUAL vertical panels, each independently croppable at exactly one-third width. Each panel is a waist-up seated portrait, eyes at same level, of a DISTINCT FICTIONAL Korean adult counselor looking gently toward camera in a quiet tastefully furnished counseling room. Left: woman age 35, shoulder-length dark hair, cream knit cardigan, relaxed warm subtle smile, hands softly folded, warm beige bookshelf backdrop. Center: man age 40, short dark hair, navy casual blazer over light shirt, thoughtful kind attentive expression, neutral olive room backdrop. Right: woman age 45, short dark bob, muted sage blouse, composed gentle expression, softly sunlit neutral backdrop. Natural realistic skin texture, understated professional clothing, not fashion glamour, no medical coats. Muted cinematic natural daylight, beautiful photographic quality, premium calm atmosphere. No text, no letters, no logos, no borders between panels. Aspect ratio 3:2 overall. Each portrait occupies own panel, no cross-panel overlap. These are fictional AI personas, not actual professionals.
