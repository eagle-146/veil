/* 필러 구절 안전 치환 — 소형모델 상투어("진정한 X")를 제거하거나 더 자연스러운 말로 바꾼다.
   문법 안전한 구절 단위만(형용사+명사). 빈 파일 방지·말더듬 재검사 포함.
   사용: node tools/filler-swap.mjs [--apply]  (기본 드라이런) */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const BASE = 'C:/Users/9835h_ztn/veil/';
const APPLY = process.argv.includes('--apply');

// {from, to} — from을 to로 전역 치환. to=명사만이면 형용사 군더더기 제거, '참된 X'면 더 자연스러운 말로 순화.
const RULES = [
  ['진정한 평안', '평안'], ['진정한 위로', '위로'], ['진정한 만족', '만족'],
  ['진정한 평화', '평화'], ['진정한 안식', '안식'], ['진정한 기쁨', '기쁨'],
  ['진정한 행복', '행복'], ['진정한 감사', '감사'], ['진정한 화복', '회복'],
  ['진정한 자유', '참된 자유'], ['진정한 회개', '참된 회개'], ['진정한 사랑', '참된 사랑'],
  ['진정한 가치', '참된 가치'], ['진정한 겸손', '참된 겸손'], ['진정한 변화', '참된 변화'],
  ['진정한 연결', '참된 사귐'], ['진정한 관계', '참된 사귐'], ['진정한 신앙', '참된 믿음'],
  ['진실된 ', ''], ['진실한 감정', '속마음'],
];
// 말더듬 재검사
const _strip = t => t.replace(/[의은는이가을를에과와도만에서로부터,.!?·…"'()]/g, '');
const _REDUP = new Set(['하나', '하루', '조금', '점점', '차츰', '천천', '더욱']);
function stutters(s) { const t = (s || '').split(/\s+/); for (let i = 0; i < t.length - 1; i++) { if (/[,.!?]$/.test(t[i])) continue; const a = _strip(t[i]), b = _strip(t[i + 1]); if (a.length >= 2 && a === b && !_REDUP.has(a)) return true; } return false; }

const GEN = readdirSync(BASE).filter(f => /^confession-extra-r\d+\.js$/.test(f)).sort();
let total = 0, files = 0, stutterHit = 0;
for (const f of GEN) {
  const w = {};
  try { new Function('window', readFileSync(BASE + f, 'utf8'))(w); } catch (e) { console.error(`✗ 로드실패: ${f}`); continue; }
  const ce = w.CONFESSION_EXTRAS;
  const obj = (Array.isArray(ce) && ce.length) ? ce[ce.length - 1] : w.CONFESSION_EXTRA;
  if (!obj || typeof obj !== 'object') { console.error(`✗ 구조없음: ${f}`); continue; }
  let n = 0;
  for (const k in obj) { const e = obj[k]; if (!e) continue;
    for (const fld of ['meditations', 'prayers', 'applications']) {
      if (!Array.isArray(e[fld])) continue;
      e[fld] = e[fld].map(s => {
        let t = s;
        for (const [a, b] of RULES) if (t.includes(a)) { t = t.split(a).join(b); }
        if (t !== s) { n++; if (stutters(t)) { stutterHit++; console.error(`  ⚠ 치환후 말더듬: ${t.slice(0, 50)}`); } }
        return t;
      });
    }
  }
  if (n) { total += n; files++;
    if (APPLY) {
      const json = JSON.stringify(obj, null, 1);
      if (!json || json.length < 50) { console.error(`✗ 쓰기중단: ${f}`); continue; }
      const header = (readFileSync(BASE + f, 'utf8').match(/^\/\*[\s\S]*?\*\//) || ['/* Veil 보충 */'])[0];
      writeFileSync(BASE + f, header + '\n(window.CONFESSION_EXTRAS = window.CONFESSION_EXTRAS || []).push(' + json + ');\n', 'utf8');
    }
    console.log(`${f}: ${n}건 치환`);
  }
}
console.log(`\n총 ${total}건 치환 (${files}파일) · 말더듬 발생 ${stutterHit} · ${APPLY ? '적용됨' : '드라이런'}`);
