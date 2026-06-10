/**
 * Veil — 성경 본문 프록시 (getBible)
 *
 * Vercel-style serverless function. 성경 책장이 장 본문을 요청하면
 * getBible 공개 API(개역성경, 키 불필요)를 중계해서 절 배열로 돌려준다.
 *
 *   GET /api/bible?book=<1..66>&chapter=<n>
 *   → { book, chapter, name, translation, verses: ["1절", "2절", ...] }
 *
 * 소스를 다른 API나 자체 DB(예: 라이선스 받은 개역개정)로 바꾸려면
 * fetchVerses()만 교체하면 된다. 프런트(tools.js)는 그대로 둔다.
 *
 * ⚠ 라이선스: getBible의 'korean'(개역성경)은 공개 본문으로 표기되어 있으나,
 *   상업 서비스로 정식 출시할 때는 사용할 번역본의 저작권을 반드시 확인할 것.
 *   개역개정은 대한성서공회 사용 허락(유료)이 별도로 필요하다.
 */

// 환경변수로 번역본/캐시 시간을 바꿀 수 있게 둔다 (기본 getBible 'korean').
const TRANSLATION = process.env.BIBLE_TRANSLATION || 'korean';
const CACHE_SECONDS = Number(process.env.BIBLE_CACHE_SECONDS || 86400); // 본문은 안 바뀜 → 하루 캐시

async function fetchVerses(book, chapter) {
  const url = `https://api.getbible.net/v2/${TRANSLATION}/${book}/${chapter}.json`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) {
    const err = new Error(`getBible ${resp.status}`);
    err.status = resp.status === 404 ? 404 : 502;
    throw err;
  }
  const data = await resp.json();
  const verses = Array.isArray(data.verses)
    ? data.verses.map(v => String(v.text || '').trim())
    : [];
  return { verses, name: data.name, translation: data.translation };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Lightweight same-origin guard (본문은 민감정보는 아니지만 외부 무단 프록시 사용 방지).
  const origin = req.headers.origin;
  if (origin) {
    try { if (req.headers.host && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Forbidden' }); }
    catch { /* malformed origin — ignore */ }
  }

  const book = Number(req.query.book);
  const chapter = Number(req.query.chapter);
  if (!Number.isInteger(book) || book < 1 || book > 66) {
    return res.status(400).json({ error: 'book은 1~66 사이의 정수여야 합니다.' });
  }
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 150) {
    return res.status(400).json({ error: 'chapter가 올바르지 않습니다.' });
  }

  try {
    const { verses, name, translation } = await fetchVerses(book, chapter);
    if (!verses.length) return res.status(404).json({ error: '본문을 찾지 못했습니다.', book, chapter });
    // 본문은 불변 → CDN/브라우저 캐시로 호출량과 비용을 줄인다.
    res.setHeader('Cache-Control', `public, s-maxage=${CACHE_SECONDS}, max-age=${CACHE_SECONDS}, stale-while-revalidate=604800`);
    return res.status(200).json({ book, chapter, name, translation, verses });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: '본문을 불러오지 못했습니다.', detail: String(e.message || e) });
  }
}
