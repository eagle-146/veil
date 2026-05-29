/**
 * Veil — 감사 기반 기도문 생성 Endpoint
 *
 * Vercel-style serverless function. Takes a week of gratitude entries and
 * returns a worship-ready prayer. The client (tools.js) uses a local demo
 * generator until this is deployed.
 *
 * Env: ANTHROPIC_API_KEY
 * Production: verify the caller has an active 동반자/동행 subscription,
 * rate-limit (e.g. 7 generations/week), and never store raw entries longer
 * than needed.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `너는 개혁주의 신학에 기초한 한국어 기도문 작성자다. 사용자가 한 주간 적은 감사일기 항목들을 받아, 가정예배나 공예배에서 소리 내어 읽을 수 있는 "감사의 기도문"을 작성한다.

[가이드라인]
- 1인칭(또는 공동체의 '우리') 기도. '주님' 또는 '하나님 아버지'로 시작하고 '예수님의 이름으로 기도합니다. 아멘.'으로 끝맺는다.
- 흐름: (1) 부르심/찬양 → (2) 사용자의 감사 항목들을 자연스럽게 엮은 구체적 감사 → (3) 고백/깨달음 → (4) 다가올 한 주를 위한 간구와 결단.
- 감사 항목을 그대로 나열하지 말고, 한 편의 기도로 매끄럽게 엮는다. 사용자의 프라이버시를 위해 민감한 고유명사는 일반화한다.
- 길이는 8~14문장. 과장된 미사여구나 율법주의/번영신학을 피하고, 모든 좋은 것이 위로부터 온 선물임(약 1:17)을 드러낸다.
- 성경 인용은 개역개정판으로, 1~2곳만 자연스럽게.
- 응답은 기도문 본문만 출력한다(머리말/설명 금지).`;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // TODO: production — verify 동반자/동행 subscription before calling Claude.

  try {
    const { entries } = req.body || {};
    if (!Array.isArray(entries) || entries.filter((e) => typeof e === 'string' && e.trim()).length < 3) {
      return res.status(400).json({ error: '충분한 감사 기록이 필요합니다 (최소 3개).' });
    }
    const cleaned = entries.map((e) => String(e).trim()).filter(Boolean).slice(0, 40);

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      temperature: 0.7,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `다음은 한 성도가 지난 한 주간 적은 감사 제목들입니다. 이를 엮어 예배 때 읽을 감사의 기도문을 작성해 주세요.\n\n[감사 제목]\n- ${cleaned.join('\n- ')}`,
        },
      ],
    });

    const prayer = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return res.status(200).json({ prayer });
  } catch (err) {
    console.error('[prayer] error:', err);
    return res.status(500).json({ error: '기도문을 빚는 중 오류가 발생했습니다.' });
  }
}
