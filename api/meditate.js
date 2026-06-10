/**
 * Veil — Premium Meditation Endpoint (Google Gemini)
 *
 * Vercel-style serverless function. Calls the Gemini REST API with fetch
 * (no SDK dependency). Returns a verse + meditation + prayer + application.
 *
 * Environment variables:
 *   GEMINI_API_KEY          — Google AI Studio key (https://aistudio.google.com/apikey)
 *   GEMINI_MODEL            — optional, default 'gemini-2.5-flash-lite' (cheapest)
 *   VEIL_GEMINI_PAID_TIER   — 안전장치. 'true'가 아니면 고백을 Gemini로 보내지 않고 차단한다.
 *                             Google Cloud 결제(유료 티어)를 켠 뒤에만 'true'로 설정할 것.
 *
 * Privacy: confession content is sensitive. Use the PAID Gemini tier (enable
 * billing) so inputs are NOT used to improve models. The free tier may be.
 * 무료 티어는 입력을 학습에 쓸 수 있어 veil의 프라이버시 약속과 충돌 → 기본 차단(default-deny).
 * Production: verify subscription, rate-limit, and set a spend cap.
 */

// gemini-2.0-flash-lite 는 2026-06-01 종료(deprecated)되어 사용 불가 → 2.5-flash-lite 로 교체.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

const SYSTEM_PROMPT = `너는 개혁주의 신학에 기초한 한국어 영성 지도자다. 너의 역할은 사용자가 적은 회개의 내용을 깊이 읽고, 사죄 선언이 아닌 "묵상의 마중물"을 제공하는 것이다.

[엄격한 신학적 가이드라인]
- 너는 사제가 아니다. 죄를 사하는 권세는 오직 하나님께 있으며, 유일한 중보자는 예수 그리스도뿐이다(딤전 2:5).
- "내가 너의 죄를 사한다" 같은 표현을 절대 쓰지 말 것. 대신 요한일서 1:9, 시편 51 등 성경의 약속을 가리켜라.
- 모든 인용 성경 본문은 반드시 개역개정판이어야 한다. 본문이 확실치 않으면 인용하지 말고 다른 본문을 택하라.
- 천주교적 고해, 마리아 중보, 연옥, 공로 사상 등 비개혁주의 요소를 결코 도입하지 말 것.
- 율법주의("이렇게 해야 용서받는다") 또는 값싼 은혜("괜찮다, 신경쓰지 말라") 어느 쪽으로도 기울지 말 것.
- 사용자가 자살, 자해, 학대 피해, 또는 타인에 대한 범죄(아동학대·성폭력 등)를 언급하면 반드시 "전문가/목회자/긴급 연락처와 즉시 상담" 권고를 묵상에 포함하라.

[응답 형식]
반드시 다음 JSON 스키마로만 응답하라. 다른 텍스트는 포함하지 말라:
{
  "category": "분류한 회개의 주제 (예: 분노, 교만, 정욕, 탐심, 거짓, 게으름, 시기, 두려움, 용서하지 못함, 기도와 말씀의 게으름, 일반 회개)",
  "verse": {
    "ref": "성경 책 장:절 (예: 시편 51:10-12)",
    "text": "개역개정 본문 (한 단락, 인용부호 없이)"
  },
  "meditation": "사용자의 자백을 깊이 읽은 후, 그 죄의 본질을 복음의 빛으로 비추는 4-6문장의 묵상. 정죄가 아닌, 그러나 죄의 무게를 가볍게 만들지 않으며, 결국 그리스도의 십자가와 부활을 향하게 한다. 사용자의 구체적인 상황을 반영하되 인용하지 말 것(프라이버시).",
  "prayer": "사용자가 그대로 따라 기도할 수 있는 1인칭 기도문. '주님'으로 시작, '예수님의 이름으로 기도합니다. 아멘.'으로 끝맺음. 3-5문장. 자백 → 간구 → 결단의 흐름.",
  "application": "오늘 안에 실천할 수 있는 구체적인 한 가지 적용 (한 문장, 30자 이내)"
}`;

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Lightweight same-origin guard. NOT real auth — also set a spend cap and add
  // subscription/rate-limit in production.
  const origin = req.headers.origin;
  if (origin) {
    try { if (req.headers.host && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Forbidden' }); }
    catch { /* malformed origin — ignore */ }
  }

  // ── 프라이버시 안전장치(default-deny) ──
  // 유료(결제) 티어를 VEIL_GEMINI_PAID_TIER='true'로 명시적으로 확인하기 전까지 AI 호출을 차단한다.
  // 무료 티어는 입력(고백)을 모델 학습에 쓸 수 있으므로, 실제 고백이 Gemini로 전송되지 않도록 막는다.
  if (String(process.env.VEIL_GEMINI_PAID_TIER).toLowerCase() !== 'true') {
    return res.status(503).json({ error: 'AI 묵상이 아직 활성화되지 않았습니다.', code: 'tier_not_confirmed' });
  }

  try {
    const { confession } = req.body || {};
    if (!confession || typeof confession !== 'string' || confession.trim().length < 4) {
      return res.status(400).json({ error: '회개 내용을 입력해 주세요.' });
    }
    if (confession.length > 4000) {
      return res.status(400).json({ error: '입력이 너무 깁니다. 4000자 이내로 요약해 주세요.' });
    }
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았습니다.' });

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `다음은 한 형제/자매가 골방에서 적은 자백입니다. 위 가이드라인을 따라 묵상을 빚어주세요.\n\n[자백]\n${confession.trim()}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1500, responseMimeType: 'application/json' },
        safetySettings: SAFETY,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`Gemini ${resp.status}: ${t.slice(0, 300)}`);
    }
    const data = await resp.json();
    const raw = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (!raw) throw new Error('빈 응답');
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);

    return res.status(200).json({
      tier: 'premium',
      category: parsed.category,
      verse: parsed.verse,
      meditation: parsed.meditation,
      prayer: parsed.prayer,
      application: parsed.application,
    });
  } catch (err) {
    console.error('[meditate] error:', err);
    return res.status(500).json({ error: '묵상을 빚는 중 오류가 발생했습니다.' });
  }
}
