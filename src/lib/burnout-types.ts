/**
 * 번아웃 유형 6종 — 미오 세계관(밤하늘·별·행성)의 코스믹 메타포.
 * 각 유형은 Mio 캐릭터 1명과 매칭되어 베타 유도 CTA의 근거가 된다.
 */
import type { CharacterId } from "./characters";

export type BurnoutTypeId =
  | "burning-star"
  | "masked-galaxy"
  | "foggy-nebula"
  | "drifting-comet"
  | "storm-planet"
  | "dawn-star";

export interface BurnoutType {
  id: BurnoutTypeId;
  name: string;
  glyph: string;
  tagline: string;
  /** 결과 페이지 본문 (2~3문장, 해요체) */
  description: string;
  traits: string[];
  needs: string[];
  characterId: CharacterId;
  /** 이 유형에게 이 캐릭터를 권하는 한 줄 이유 */
  characterReason: string;
  /** 공유 카드/문구용 짧은 한 줄 */
  shareLine: string;
  /** 강도가 높은 유형이면 결과 페이지에 마음 돌봄 안내를 함께 노출 */
  heavy: boolean;
  /** 유형 대표 색 (그라디언트 시작/끝) */
  colors: [string, string];
}

export const BURNOUT_TYPES: Record<BurnoutTypeId, BurnoutType> = {
  "burning-star": {
    id: "burning-star",
    name: "과열 항성형",
    glyph: "🔥",
    tagline: "멈추는 법을 잊은 채, 계속 타오르는 중",
    description:
      "해야 할 일은 오늘도 해냈지만, 연료는 이미 바닥에 가까워요. 쉬어도 쉰 것 같지 않고, ‘조금만 더’가 입버릇이 된 지 오래죠. 지금 필요한 건 더 열심히가 아니라, 자책 없이 멈춰 서는 연습이에요.",
    traits: [
      "쉬는 날에도 회복되지 않는 만성 피로",
      "할 일은 해내지만 끝나면 완전 방전",
      "‘조금만 더 버티자’를 반복하는 중",
    ],
    needs: [
      "죄책감 없이 쉬는 연습",
      "에너지를 쓰는 일과 채우는 일 구분하기",
      "‘오늘은 여기까지’를 정해주는 존재",
    ],
    characterId: "momo",
    characterReason: "지친 마음을 있는 그대로 안아주는 모모가 ‘잘 멈추는 법’부터 함께해요.",
    shareLine: "나, 멈추는 법을 잊은 채 계속 타오르는 중이래",
    heavy: true,
    colors: ["#FF8A5C", "#E4536B"],
  },
  "masked-galaxy": {
    id: "masked-galaxy",
    name: "가면 은하형",
    glyph: "🎭",
    tagline: "겉은 반짝반짝, 속은 조용히 소진 중",
    description:
      "“괜찮아?”라는 말에 반사적으로 “응”이 나와요. 사람들 앞에선 잘 웃지만, 혼자가 되는 순간 급격히 방전되죠. 남의 마음은 잘 챙기면서 내 감정은 늘 뒷전 — 이제 내 얘기를 꺼낼 차례예요.",
    traits: [
      "“괜찮아”가 자동 응답이 된 지 오래",
      "모임에선 밝지만 집에 오면 급격히 방전",
      "내 감정을 꺼내놓을 곳이 마땅히 없음",
    ],
    needs: [
      "판단 없이 들어주는 존재",
      "‘괜찮은 척’ 말고 진짜 상태 말해보기",
      "감정을 이름 붙여 꺼내놓는 연습",
    ],
    characterId: "mio",
    characterReason: "공감 전문가 미오는 아무 판단 없이, 가면 뒤의 진짜 이야기를 들어줘요.",
    shareLine: "나, 겉은 반짝이는데 속은 조용히 소진 중이래",
    heavy: true,
    colors: ["#9B8CFF", "#E48AC8"],
  },
  "foggy-nebula": {
    id: "foggy-nebula",
    name: "안개 성운형",
    glyph: "🌫️",
    tagline: "생각의 안개가 걷히지 않는 중",
    description:
      "자려고 누우면 그때부터 머릿속 회의가 시작돼요. 지나간 말을 곱씹고, 최악의 시나리오를 미리 살고, 남들과 비교하며 스스로를 깎아내리죠. 생각이 많은 게 아니라, 생각이 엉켜 있는 것뿐이에요.",
    traits: [
      "밤마다 열리는 머릿속 무한 회의",
      "최악의 시나리오 시뮬레이션 전문가",
      "비교와 곱씹기로 스스로를 소모 중",
    ],
    needs: [
      "엉킨 생각을 겉으로 꺼내 정리하기",
      "사실과 걱정을 분리하는 연습",
      "생각의 마감 시간 정하기",
    ],
    characterId: "rumi",
    characterReason: "생각 패턴 전문가 루미가 엉킨 생각의 실타래를 하나씩 함께 풀어요.",
    shareLine: "나, 생각의 안개가 걷히질 않는 유형이래",
    heavy: false,
    colors: ["#6FA8FF", "#8B90F5"],
  },
  "drifting-comet": {
    id: "drifting-comet",
    name: "표류 혜성형",
    glyph: "💫",
    tagline: "방향을 잃고, 궤도만 돌고 있는 중",
    description:
      "해야 하는 건 아는데 몸이 움직이질 않아요. 시작이 세상에서 제일 어렵고, 폰만 보다가 하루가 통째로 사라지곤 하죠. 게으른 게 아니라, 에너지와 방향을 잃었을 뿐이에요.",
    traits: [
      "시작 버튼이 고장 난 듯한 무기력",
      "미루기 → 자책 → 더 미루기의 루프",
      "하고 싶은 것 자체가 사라져가는 중",
    ],
    needs: [
      "아주 작은 것부터 다시 시작하는 경험",
      "완벽한 계획 말고 5분짜리 실천",
      "함께 페이스를 맞춰줄 파트너",
    ],
    characterId: "bau",
    characterReason: "행동 파트너 바우가 아주 작은 실천부터 페이스를 맞춰 같이 뛰어요.",
    shareLine: "나, 방향을 잃고 궤도만 돌고 있는 중이래",
    heavy: false,
    colors: ["#5CD6C0", "#4FA8E8"],
  },
  "storm-planet": {
    id: "storm-planet",
    name: "폭풍 행성형",
    glyph: "🌪️",
    tagline: "속에서 폭풍이 몰아치는 중",
    description:
      "요즘 사소한 일에도 욱하고, ‘내가 왜 이걸 하고 있지’라는 회의감이 자주 올라와요. 사람도 일도 다 피곤하게 느껴지죠. 그 짜증은 사실, 너무 오래 참아온 마음이 보내는 신호예요.",
    traits: [
      "사소한 일에도 훅 올라오는 짜증",
      "‘이게 다 무슨 소용’이라는 회의감",
      "사람들과 거리를 두고 싶은 마음",
    ],
    needs: [
      "짜증 밑에 깔린 진짜 원인 찾기",
      "바꿀 수 있는 것과 없는 것 구분하기",
      "감정을 행동 에너지로 바꾸는 전략",
    ],
    characterId: "chichi",
    characterReason: "현실 해결 전문가 치치가 폭풍의 원인을 짚고, 바꿀 수 있는 것부터 함께 정리해요.",
    shareLine: "나, 속에서 폭풍이 몰아치는 중이래",
    heavy: true,
    colors: ["#FFC145", "#F0704F"],
  },
  "dawn-star": {
    id: "dawn-star",
    name: "새벽 별형",
    glyph: "🌅",
    tagline: "아직 반짝이는 중 — 지금이 지킬 타이밍",
    description:
      "전반적으로 궤도를 잘 지키고 있어요. 다만 가끔 스치는 피로 신호를 무시하다 보면, 번아웃은 소리 없이 다가오죠. 컨디션이 괜찮은 지금이야말로 마음 루틴을 만들기 가장 좋은 때예요.",
    traits: [
      "대체로 안정적인 에너지 궤도",
      "가끔 스치는 피로·불안 신호",
      "지금 습관이 6개월 뒤를 결정하는 시기",
    ],
    needs: [
      "하루 30초, 내 마음 컨디션 체크 습관",
      "스트레스 신호를 조기에 알아채는 눈",
      "좋은 상태를 기록으로 남겨두기",
    ],
    characterId: "mio",
    characterReason: "미오와 함께 하루 한 번, 마음 날씨를 기록하는 것만으로 좋은 궤도가 유지돼요.",
    shareLine: "나, 아직 반짝이는 새벽 별이래 ✨",
    heavy: false,
    colors: ["#FFD97A", "#FF9E64"],
  },
};

export const ALL_TYPE_IDS = Object.keys(BURNOUT_TYPES) as BurnoutTypeId[];

export function isBurnoutTypeId(v: string): v is BurnoutTypeId {
  return v in BURNOUT_TYPES;
}
