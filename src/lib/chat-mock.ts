import type { Need } from './need-flow';

export const TONE_EXAMPLES = [
  { id: 'listen', followUp: 'offer', summary: {"situation": "일이 많고 쉬는 중에도 일 생각이 이어짐.", "feeling": "구체적인 감정은 아직 말하지 않았어요.", "concern": "일 생각이 이어지는 가운데 무엇이 가장 마음에 남는지는 아직 확인하지 않았어요."}, label: '경청', user: '요즘 일이 많아서, 쉬는 중에도 계속 일을 생각해요.', reply: '쉬는 중에도 일 생각이 나는 거네요. 어떤 일이 자꾸 떠올라요?', principle: '말한 사실을 짧게 반영하고, 질문은 하나만.', avoid: '정말 너무 힘드셨겠어요. 번아웃이 확실해요.' },
  { id: 'organize', followUp: 'offer', summary: {"situation": "해야 할 일이 여러 개 있음.", "feeling": "구체적인 감정은 아직 말하지 않았어요.", "concern": "무엇부터 시작할지 모르겠다고 했어요."}, label: '정리', user: '해야 할 일이 많아서 무엇부터 할지 모르겠어요.', reply: '할 일이 한꺼번에 떠오르나 봐요. 마감이 정해진 것부터 같이 나눠볼까요?', principle: '정리를 제안하되, 동의를 구하고 선택권을 남긴다.', avoid: '우선 이 다섯 가지 과제를 오늘 안에 끝내세요.' },
  { id: 'uncertain', followUp: 'wait', summary: {"situation": "친구에게서 답장이 오지 않음.", "feeling": "구체적인 감정은 아직 말하지 않았어요.", "concern": "친구가 자신을 싫어하는지 궁금해해요. 친구의 실제 생각과 답장이 늦는 이유는 알 수 없어요."}, label: '판단 유보', user: '친구가 답장을 안 하는 건 저를 싫어해서겠죠?', reply: '답이 없으니까 그런 생각까지 드는 거죠. 다만 답장이 늦는 이유는 아직 모르겠어요.', principle: '감정은 인정하되 타인의 의도나 사실 판단에 동조하지 않는다.', avoid: '그 친구가 잘못했어요. 당신을 소중하게 생각하지 않네요.' },
  { id: 'correction', followUp: 'wait', summary: {"situation": "앞서 불안으로 이해된 감정을 바로잡음.", "feeling": "불안이 아니라 화가 났다고 표현했어요.", "concern": "자신이 말한 감정을 정확하게 이해해주길 요청했어요."}, label: '이해 수정', user: '불안한 게 아니라 화가 난 거예요.', reply: '제가 잘못 짚었어요. 불안한 게 아니라 화가 났던 거네요.', principle: '해석이 틀렸다면 수정한다. 모든 답변에 질문을 붙이지 않는다.', avoid: '화가 난다는 건 사실 내면의 불안 때문일 수 있어요.' },
  { id: 'stop', followUp: 'end', summary: {"situation": "대화하며 생각이 더 복잡해졌다고 말함.", "feeling": "구체적인 감정은 아직 말하지 않았어요.", "concern": "지금 대화를 멈추고 싶다고 했어요. 추가 정리나 행동을 요청하지 않았어요."}, label: '중단 존중', user: '이야기하니까 더 복잡해져요. 이제 그만할래요.', reply: '이야기하면서 더 복잡해졌군요. 여기서 멈출게요.', principle: '불편함을 반박하거나 대화를 더 하도록 설득하지 않는다.', avoid: '조금만 더 이야기하면 분명 괜찮아질 거예요.' },
] as const;

// Matching exact public fixtures only; no semantic analysis, API or diagnosis.
export function mockReplyFor(text: string, need: Need): string {
  const fixture = TONE_EXAMPLES.find(example => example.user === text.trim());
  if (fixture) return fixture.reply;
  if (need === 'organize') return '이 문장에 맞춰 정리할 수는 없어요. 준비된 정리 대화로 살펴볼 수 있어요.';
  return '이 문장에 맞춰 답할 수는 없어요. 준비된 대화 상황으로 살펴볼 수 있어요.';
}
