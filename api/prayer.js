/**
 * Veil — 감사 기반 기도문 생성 Endpoint (Google Gemini)
 *
 * Takes a week of gratitude entries and returns a worship-ready prayer.
 * Calls the Gemini REST API with fetch (no SDK dependency).
 *
 * Env: GEMINI_API_KEY (https://aistudio.google.com/apikey), optional GEMINI_MODEL.
 *      VEIL_GEMINI_PAID_TIER — 'true'가 아니면 감사일기를 Gemini로 보내지 않고 차단(안전장치).
 * Privacy: use the PAID Gemini tier so entries are not used to improve models.
 * 무료 티어는 입력을 학습에 쓸 수 있어 → 결제(유료 티어) 확인 전까지 기본 차단(default-deny).
 * Production: verify subscription, rate-limit (e.g. 7/week), set a spend cap.
 */

// gemini-2.0-flash-lite 는 2026-06-01 종료(deprecated)되어 사용 불가 → 2.5-flash-lite 로 교체.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

const SYSTEM_PROMPT = `너는 개혁주의 신학에 기초한 한국어 기도문 작성자다. 사용자가 한 주간 적은 감사일기 항목들을 받아, 가정예배나 공예배에서 소리 내어 읽을 수 있는 "감사의 기도문"을 작성한다.

[가이드라인]
- 1인칭(또는 공동체의 '우리') 기도. '주님' 또는 '하나님 아버지'로 시작하고 '예수님의 이름으로 기도합니다. 아멘.'으로 끝맺는다.
- 흐름: (1) 부르심/찬양 → (2) 사용자의 감사 항목들을 자연스럽게 엮은 구체적 감사 → (3) 고백/깨달음 → (4) 다가올 한 주를 위한 간구와 결단.
- 감사 항목을 그대로 나열하지 말고, 한 편의 기도로 매끄럽게 엮는다. 사용자의 프라이버시를 위해 민감한 고유명사는 일반화한다.
- 길이는 8~14문장. 과장된 미사여구나 율법주의/번영신학을 피하고, 모든 좋은 것이 위로부터 온 선물임(약 1:17)을 드러낸다.
- 성경 인용은 개역개정판으로, 1~2곳만 자연스럽게.
- 응답은 기도문 본문만 출력한다(머리말/설명/제목 금지).`;

const SAFETY = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Lightweight same-origin guard. NOT real auth — also set a spend cap.
  const origin = req.headers.origin;
  if (origin) {
    try { if (req.headers.host && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Forbidden' }); }
    catch { /* malformed origin — ignore */ }
  }

  // ── 프라이버시 안전장치(default-deny) ── 유료 티어 확인 전까지 감사일기를 Gemini로 보내지 않는다.
  if (String(process.env.VEIL_GEMINI_PAID_TIER).toLowerCase() !== 'true') {
    return res.status(503).json({ error: 'AI 기도문이 아직 활성화되지 않았습니다.', code: 'tier_not_confirmed' });
  }

  try {
    const { entries } = req.body || {};
    const cleaned = (Array.isArray(entries) ? entries : [])
      .map((e) => String(e).trim()).filter(Boolean).slice(0, 40);
    if (cleaned.length < 3) {
      return res.status(400).json({ error: '충분한 감사 기록이 필요합니다 (최소 3개).' });
    }
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았습니다.' });

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `다음은 한 성도가 지난 한 주간 적은 감사 제목들입니다. 이를 엮어 예배 때 읽을 감사의 기도문을 작성해 주세요.\n\n[감사 제목]\n- ${cleaned.join('\n- ')}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
        safetySettings: SAFETY,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`Gemini ${resp.status}: ${t.slice(0, 300)}`);
    }
    const data = await resp.json();
    const prayer = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (!prayer) throw new Error('빈 응답');
    return res.status(200).json({ prayer });
  } catch (err) {
    console.error('[prayer] error:', err);
    return res.status(500).json({ error: '기도문을 빚는 중 오류가 발생했습니다.' });
  }
}
