/**
 * 번아웃 유형 테스트 문항 데이터.
 *
 * 축(axis) 설계 — MBI(Maslach Burnout Inventory)의 3축을 참고하되
 * 2030 취준생·직장인 맥락에 맞게 변형:
 *   e — 소진(Exhaustion): 에너지 고갈, 회복 안 되는 피로
 *   c — 냉소(Cynicism): 의미 상실, 사람·일에 대한 거리두기
 *   r — 과잉사고(Rumination): 반추, 불안, 비교
 *   a — 무기력(Agency loss): 시작 불능, 효능감 저하
 *
 * 태그:
 *   mask — "괜찮은 척" 신호. masked-galaxy 유형 판별에 사용.
 *   그 외 태그는 수집만 하고 유형 판정에는 쓰지 않는다.
 *
 * 본 테스트는 자기 이해를 돕는 콘텐츠이며 의학적 진단 도구가 아니다.
 */

export interface QuizOption {
  id: string;
  text: string;
  scores: { e?: number; c?: number; r?: number; a?: number };
  tags?: string[];
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: QuizOption[];
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    text: "아침에 눈을 떴을 때,\n요즘 나는?",
    options: [
      { id: "q1a", text: "눈 뜨자마자 ‘벌써 아침이야…’ 한숨부터 나온다", scores: { e: 3 } },
      { id: "q1b", text: "알람을 몇 번씩 미루다 겨우 몸을 일으킨다", scores: { a: 2 } },
      { id: "q1c", text: "오늘 해야 할 일들이 머릿속에 와르르 쏟아진다", scores: { r: 2 } },
      { id: "q1d", text: "컨디션 따라 다르지만 대체로 무난하게 일어난다", scores: {} },
    ],
  },
  {
    id: "q2",
    text: "해야 할 일(업무·공부)을\n앞에 두면?",
    options: [
      { id: "q2a", text: "시작 버튼이 고장 났다. 딴짓하다 하루가 간다", scores: { a: 3 } },
      { id: "q2b", text: "하긴 하는데, 예전보다 두 배는 힘들다", scores: { e: 2 } },
      { id: "q2c", text: "‘이걸 한다고 뭐가 달라지나’ 싶다", scores: { c: 2 } },
      { id: "q2d", text: "부담돼도 일단 붙잡으면 하게 된다", scores: { r: 1 } },
    ],
  },
  {
    id: "q3",
    text: "“요즘 어때?”라는\n연락을 받으면?",
    options: [
      {
        id: "q3a",
        text: "“그냥 똑같지 뭐ㅋㅋ” — 사실 하나도 안 괜찮다",
        scores: { e: 2 },
        tags: ["mask"],
      },
      { id: "q3b", text: "답장할 에너지가 없어서 읽고 미뤄둔다", scores: { c: 2 } },
      { id: "q3c", text: "뭐라고 답해야 할지 한참 고민한다", scores: { r: 1 } },
      { id: "q3d", text: "요즘 근황을 편하게 나눈다", scores: {} },
    ],
  },
  {
    id: "q4",
    text: "밤에 침대에 누우면?",
    options: [
      {
        id: "q4a",
        text: "오늘 한 말, 내일 할 일, 3년 뒤 걱정까지 생각 회의가 열린다",
        scores: { r: 3 },
      },
      { id: "q4b", text: "피곤해 죽겠는데 이상하게 잠은 안 온다", scores: { e: 2 } },
      { id: "q4c", text: "아무 생각 없이 폰만 넘기다 새벽이 된다", scores: { a: 2 } },
      { id: "q4d", text: "대체로 금방 잠드는 편이다", scores: {} },
    ],
  },
  {
    id: "q5",
    text: "쉬는 날의 나는?",
    options: [
      { id: "q5a", text: "하루 종일 누워 있어도 회복이 안 된다", scores: { e: 3 } },
      { id: "q5b", text: "하고 싶은 게 없다. 약속도 다 귀찮다", scores: { a: 2, c: 1 } },
      {
        id: "q5c",
        text: "쉬면서도 ‘이래도 되나’ 마음이 편하지 않다",
        scores: { r: 2 },
        tags: ["guilt"],
      },
      { id: "q5d", text: "내 나름의 방식으로 충전하며 보낸다", scores: {} },
    ],
  },
  {
    id: "q6",
    text: "요즘 사람을 만나는 일은?",
    options: [
      { id: "q6a", text: "솔직히 다 피곤하다. 혼자가 제일 편하다", scores: { c: 3 } },
      {
        id: "q6b",
        text: "만나면 잘 웃고 떠들지만, 집에 오면 방전된다",
        scores: { e: 2 },
        tags: ["mask"],
      },
      { id: "q6c", text: "만나고 싶은 마음은 있는데 나갈 힘이 없다", scores: { a: 2 } },
      { id: "q6d", text: "만나면 오히려 에너지를 얻는다", scores: {} },
    ],
  },
  {
    id: "q7",
    text: "요즘 사소한 일에도?",
    options: [
      { id: "q7a", text: "욱하거나 짜증이 훅 올라온다", scores: { c: 3 } },
      { id: "q7b", text: "눈물이 핑 돌 때가 있다", scores: { e: 2 } },
      { id: "q7c", text: "‘내가 뭘 잘못했나’ 하고 곱씹게 된다", scores: { r: 2 } },
      { id: "q7d", text: "크게 흔들리지 않는다", scores: {} },
    ],
  },
  {
    id: "q8",
    text: "SNS나 주변 사람들의\n소식을 보면?",
    options: [
      { id: "q8a", text: "나만 뒤처지는 것 같아 조급해진다", scores: { r: 3 }, tags: ["compare"] },
      { id: "q8b", text: "다 부질없어 보여서 앱을 꺼버린다", scores: { c: 2 } },
      { id: "q8c", text: "부러워할 에너지조차 없다", scores: { e: 1, a: 1 } },
      { id: "q8d", text: "남은 남, 나는 나라고 생각한다", scores: {} },
    ],
  },
  {
    id: "q9",
    text: "최근에 잘된 일(합격·칭찬·완료)이\n생겼을 때?",
    options: [
      { id: "q9a", text: "기쁘지가 않다. ‘그래서 뭐’ 싶다", scores: { c: 3 } },
      { id: "q9b", text: "‘운이었어, 다음엔 못하면 어쩌지’가 먼저 든다", scores: { r: 2 } },
      { id: "q9c", text: "기뻐할 힘도 없이 그냥 지나간다", scores: { e: 2 } },
      { id: "q9d", text: "스스로 꽤 뿌듯해한다", scores: {} },
    ],
  },
  {
    id: "q10",
    text: "‘나 좀 힘든 것 같아’라는\n생각이 들면?",
    options: [
      {
        id: "q10a",
        text: "‘더 힘든 사람도 많은데’ 하며 꾹 눌러 담는다",
        scores: { e: 3 },
        tags: ["mask"],
      },
      { id: "q10b", text: "힘든 건 아는데, 뭘 해야 할지 모르겠다", scores: { a: 2 } },
      { id: "q10c", text: "왜 힘든지 원인 분석만 몇 시간째 하고 있다", scores: { r: 2 } },
      { id: "q10d", text: "주변에 털어놓거나 쉬어갈 방법을 찾는다", scores: {} },
    ],
  },
  {
    id: "q11",
    text: "지금 하는 일(공부)의 의미에 대해\n요즘 나는?",
    options: [
      { id: "q11a", text: "‘이게 다 무슨 소용인가’ 자주 생각한다", scores: { c: 3 } },
      { id: "q11b", text: "목표가 흐릿해졌다. 관성으로 움직인다", scores: { a: 2 } },
      { id: "q11c", text: "의미고 뭐고, 일단 너무 지쳤다", scores: { e: 2 } },
      { id: "q11d", text: "힘들어도 나름의 의미를 느낀다", scores: {} },
    ],
  },
  {
    id: "q12",
    text: "지금 나에게\n가장 필요한 것은?",
    options: [
      { id: "q12a", text: "아무도 없는 곳에서 아무것도 안 하기", scores: { e: 2 } },
      { id: "q12b", text: "뭐라도 시작하게 해줄 작은 계기", scores: { a: 2 } },
      { id: "q12c", text: "엉킨 생각을 같이 정리해 줄 존재", scores: { r: 2 } },
      {
        id: "q12d",
        text: "아무 판단 없이 내 얘기를 들어줄 존재",
        scores: { e: 1 },
        tags: ["listen"],
      },
    ],
  },
];

/** 문항 수 — UI 프로그레스와 검증에 사용 */
export const QUESTION_COUNT = QUIZ_QUESTIONS.length;
