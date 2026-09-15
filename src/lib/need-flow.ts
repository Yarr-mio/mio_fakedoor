import { TONE_EXAMPLES } from './chat-mock';
import { CONVERSATION_SCENARIOS } from './conversation-scenarios';

export const NEEDS = [
  { id: 'listen', number: '01', title: '일단 이야기하고 싶어요', description: '마음에 남은 이야기를 꺼내는 것부터.', icon: 'chat' },
  { id: 'organize', number: '02', title: '생각을 정리하고 싶어요', description: '복잡한 상황을 하나씩 살펴보고 싶을 때.', icon: 'note' },
  { id: 'perspective', number: '03', title: '다른 관점이 필요해요', description: '내가 놓친 점이나 확인할 정보를 살펴보고 싶을 때.', icon: 'spark' },
  { id: 'support', number: '04', title: '도움을 알아보고 싶어요', description: '상담이나 지원 정보를 직접 찾아볼게요.', icon: 'compass' },
] as const;
export type Need = typeof NEEDS[number]['id'] | 'unsure';
export type Screen = 'landing' | 'intro' | 'needs' | 'chat' | 'summary' | 'support' | 'finish' | 'feedback' | 'done' | 'interest' | 'quiet_done';
export type DemoMessage = { role: 'mio' | 'user'; text: string; source?: 'fixture' | 'typed' | 'mock'; fixtureId?: string };
export const SUPPORT_RESOURCES = [
  { id: 'mentalhealth', title: '내 주변 정신건강 관련 기관', organization: '국립정신건강센터 · 국가정신건강정보포털', description: '공식 포털의 「정신건강관련기관」에서 지역 기관 정보를 확인할 수 있어요.', url: 'https://www.mentalhealth.go.kr/portal/main/index.do' },
  { id: 'welfare', title: '이용할 수 있는 복지 지원 정보', organization: '보건복지상담센터 129', description: '보건복지 서비스와 상담 이용 방법을 공식 사이트에서 살펴보세요.', url: 'https://www.129.go.kr/' },
] as const;
export function openingFor(need: Need): string {
  if (need === 'organize') return '어떤 부분을 정리하고 싶은가요? 어디서 막혔는지부터 같이 볼게요.';
  if (need === 'perspective') return '혼자 생각하다 막힌 부분이 있나요? 같이 다른 쪽에서도 살펴봐요.';
  if (need === 'unsure') return '어디서 시작할지 아직 몰라도 괜찮아요. 지금 떠오르는 이야기부터 꺼내볼까요?';
  return '안녕하세요, 미오예요. 지금 어떤 이야기를 나누고 싶나요? 편한 만큼만 들려주세요.';
}
export function summaryCases(messages: DemoMessage[]) {
  // Only exact authored fixtures; never classify arbitrary user text or merge unrelated cases.
  const selected = TONE_EXAMPLES.filter(example => messages.some(message => message.role === 'user' && message.source === 'fixture' && message.text === example.user));
  const scenarioCases = CONVERSATION_SCENARIOS.flatMap(scenario => {
    // Cumulative summaries are available only for the contiguous authored prefix.
    let last;
    for (const turn of scenario.turns) {
      if (!messages.some(message => message.role === 'user' && message.source === 'fixture' && message.fixtureId === turn.id && message.text === turn.user)) break;
      last = turn;
    }
    return last ? [{ ...last, id:scenario.id, label:scenario.title }] : [];
  });
  return selected.length || scenarioCases.length ? [...selected, ...scenarioCases] : [TONE_EXAMPLES[0]];
}
export function summaryOf(messages: DemoMessage[]): string {
  return summaryCases(messages).map(example => `대화 예시 · ${example.label}\n“${example.user}”\n\n상황\n${example.summary.situation}\n\n표현한 감정\n${example.summary.feeling}\n\n남아 있는 고민·요청\n${example.summary.concern}`).join('\n\n────────\n\n');
}
