"""Regenerate only the authored dialogue appendix; preserve human handoff prose."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
rows = json.loads((root / 'src/lib/conversation-scenarios.json').read_text())
path = root / 'docs/CONVERSATION_MOCK_HANDOFF.md'
marker = '<!-- GENERATED_SCENARIOS -->'
head = path.read_text().split(marker)[0]
parts = [head.rstrip(), '\n' + marker]
for scenario in rows:
    parts.append(f"\n## {scenario['title']}\n\n{scenario['description']}\n\n검토할 결말: {scenario['outcome']}")
    for i, turn in enumerate(scenario['turns'], 1):
        parts.append(f"\n### {i} · {turn['id']}\n\n**가상 사용자:** {turn['user']}\n\n**미오:** {turn['reply']}\n\n- 의도: {turn['principle']}\n- 후속 동작: {turn['followUp']}\n- 피할 응답: {turn['avoid']}\n- 이 시점의 상황: {turn['summary']['situation']}\n- 표현된 감정: {turn['summary']['feeling']}\n- 남은 고민/요청: {turn['summary']['concern']}")
path.write_text('\n'.join(parts) + '\n')
