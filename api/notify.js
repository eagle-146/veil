/**
 * Veil 교회(B2B) — 알림톡/문자 발송 스텁
 *
 * 실제 카카오 알림톡 발송에는 다음이 필요하다:
 *   1) 사업자등록  2) 카카오 비즈니스 채널(발신 프로필)  3) 알림톡 템플릿 사전승인
 *   4) 발송대행사(솔라피/알리고/NHN Toast 등) 가입 + API 키
 * 키가 설정되기 전까지는 not_configured 를 돌려주고, 프런트는 안내만 표시한다.
 *
 * 환경변수(예: 솔라피):
 *   SOLAPI_API_KEY      — 솔라피 API Key
 *   SOLAPI_API_SECRET   — 솔라피 API Secret
 *   SOLAPI_PFID         — 카카오 발신 프로필 ID(채널)
 *   SOLAPI_SENDER       — 발신 번호(SMS 대체발송용)
 *
 *   POST /api/notify  { template, church, recipients:[{name, phone}] }
 */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 동일 출처 가드
  const origin = req.headers.origin;
  if (origin) {
    try { if (req.headers.host && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Forbidden' }); }
    catch { /* malformed origin */ }
  }

  const { template, recipients } = req.body || {};
  const list = Array.isArray(recipients) ? recipients.filter(r => r && r.phone) : [];
  if (!template) return res.status(400).json({ error: 'template이 필요합니다.' });

  const key = process.env.SOLAPI_API_KEY, secret = process.env.SOLAPI_API_SECRET;
  if (!key || !secret) {
    // 아직 발송대행사가 연결되지 않음 — 프런트는 안내만 표시한다.
    return res.status(200).json({
      status: 'not_configured',
      would_send: list.length,
      message: '알림톡 발송이 아직 설정되지 않았습니다. 발송대행사(솔라피 등) 키를 등록하면 활성화됩니다.',
    });
  }

  // TODO: 실제 발송 연동 — 대행사 계약/템플릿 승인 후 구현.
  //   예) 솔라피: POST https://api.solapi.com/messages/v4/send-many (HMAC-SHA256 서명 인증),
  //       각 수신자에 kakaoOptions.pfId/templateId + 변수 매핑, 실패 시 SMS 대체발송.
  return res.status(501).json({
    status: 'not_implemented',
    message: '발송 연동 코드는 대행사 계약·템플릿 승인 후 구현됩니다.',
  });
}
