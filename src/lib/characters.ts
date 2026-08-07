/**
 * Mio 캐릭터 5종 — 본 서비스(mio_server CharacterPersona / 온보딩 화면)와 동일한 포지셔닝.
 */

export type CharacterId = "mio" | "bau" | "rumi" | "momo" | "chichi";

export interface Character {
  id: CharacterId;
  name: string;
  animal: string;
  specialty: string;
  /** 온보딩 화면의 캐릭터 소개 멘트 톤과 통일 */
  line: string;
  image: string;
}

export const CHARACTERS: Record<CharacterId, Character> = {
  mio: {
    id: "mio",
    name: "미오",
    animal: "펭귄",
    specialty: "공감·감정 정리 전문가",
    line: "지금 느끼는 감정, 함께 천천히 들여다봐요.",
    image: "/characters/mio.png",
  },
  bau: {
    id: "bau",
    name: "바우",
    animal: "강아지",
    specialty: "행동 파트너",
    line: "작은 실천이 큰 변화를 만들어요. 같이 해 봐요!",
    image: "/characters/bau.png",
  },
  rumi: {
    id: "rumi",
    name: "루미",
    animal: "올빼미",
    specialty: "생각 패턴 전문가",
    line: "차분하게 생각을 정리하는 걸 도와드릴게요.",
    image: "/characters/rumi.png",
  },
  momo: {
    id: "momo",
    name: "모모",
    animal: "곰",
    specialty: "감정 수용 전문가",
    line: "자책하지 않아도 괜찮아요. 있는 그대로 함께해요.",
    image: "/characters/momo.png",
  },
  chichi: {
    id: "chichi",
    name: "치치",
    animal: "고양이",
    specialty: "현실 해결 전문가",
    line: "현실적인 시선으로 함께 답을 찾아드릴게요.",
    image: "/characters/chichi.png",
  },
};
