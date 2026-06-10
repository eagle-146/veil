/* 변주물 사람검수 보조 — 생성물(Ollama r1~r20)의 약점을 정량 진단해 가장 약한 항목을 위로 올린다.
   사람이 직접 읽고 고치기 위한 '주의 배분' 도구일 뿐, 자동 수정은 하지 않는다.
   사용: node tools/review-scan.mjs [top] [field] [--stats]
     top   : 출력할 최악 항목 수(기본 25)
     field : meditations|prayers|applications (기본 meditations)
     --stats : 상투구 빈도 집계만 출력 */
import { readFileSync, readdirSync } from 'node:fs';
const BASE = 'C:/Users/9835h_ztn/veil/';
const TOP = parseInt(process.argv.find(a => /^\d+$/.test(a)) || '25', 10);
const FIELD = (process.argv.find(a => /^(meditations|prayers|applications)$/.test(a))) || 'meditations';
const STATS = process.argv.includes('--stats');

// 생성물만 검수: r1~r20 (손작성 extra.js/extra-2.js 제외)
const GEN = readdirSync(BASE).filter(f => /^confession-extra-r\d+\.js$/.test(f)).sort();
const items = [];
for (const f of GEN) {
  const w = {};
  new Function('window', readFileSync(BASE + f, 'utf8'))(w);
  const o = (Array.isArray(w.CONFESSION_EXTRAS) && w.CONFESSION_EXTRAS[w.CONFESSION_EXTRAS.length - 1]) || w.CONFESSION_EXTRA;
  for (const k in o) { const e = o[k]; if (!e || !Array.isArray(e[FIELD])) continue; for (const s of e[FIELD]) items.push({ f, k, s }); }
}

// ── 약점 신호 ──
// 1) 상투적 명령형 종결(자기계발 앱 말투) — 묵상이 권면으로 끝나며 '느껴보세요/시작해보세요'류
const STOCK_END = /(느껴\s*보세요|시작해\s*보세요|기억하세요|가져\s*보세요|찾아\s*보세요|만들어\s*보세요|품어\s*보세요|되새기세요|해\s*보세요|드려\s*보세요|걸어\s*보세요|열어\s*보세요)\.?\s*$/;
// 2) 추상·영성 상투어(구체 이미지 없이 떠다니는 단어들)
const FILLER = ['영적', '내면', '진정한', '진실된', '여정', '성장', '참된', '고요', '깊은 곳', '마음속', '빛이 되어', '씨앗이', '굴레', '울타리', '손길', '동행', '치유', '회복의 길', '새로운 시작', '평안', '위로'];
// 3) 구체성 신호(좋은 쪽) — 실제 상황/대상/성경 고유명사/숫자
const CONCRETE = ['회의실', '식탁', '직장', '동료', '상사', '가족', '자녀', '부모', '아내', '남편', '친구', '카톡', '문자', '전화', '돈', '월급', '시험', '학교', '교회', '예배', '주일', '엘리야', '다윗', '베드로', '바울', '탕자', '욥', '요나', '로뎀나무'];
const num = s => (s.match(/[0-9]/g) || []).length;
const cnt = (s, arr) => arr.reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0);
const wc = s => s.replace(/\s+/g, '').length;

function score(s) {
  const fill = cnt(s, FILLER), conc = cnt(s, CONCRETE) + (num(s) ? 1 : 0);
  const end = STOCK_END.test(s) ? 1 : 0;
  const len = wc(s);
  // 높을수록 약함: 추상어 밀도↑, 상투종결, 구체성 결여, 과장/과소 길이
  let sc = fill * 1.0 + end * 2.5 - conc * 2.0;
  if (len < 45) sc += 1.5; if (len > 230) sc += 1.0;
  return { sc, fill, conc, end, len };
}

const HAS = (process.argv.find(a => a.startsWith('--has=')) || '').slice(6);
const ENDONLY = process.argv.includes('--end');
let pool = items;
if (HAS) pool = pool.filter(it => it.s.includes(HAS));
if (ENDONLY) pool = pool.filter(it => STOCK_END.test(it.s));

const DUPS = process.argv.includes('--dups');
if (DUPS) {
  const TH = parseFloat((process.argv.find(a => a.startsWith('--th=')) || '--th=0.5').slice(5));
  const bg = s => { const n = s.replace(/\s+/g, ''), S = new Set(); for (let i = 0; i < n.length - 1; i++) S.add(n.slice(i, i + 2)); return S; };
  const ov = (A, B) => { let c = 0; for (const x of A) if (B.has(x)) c++; return c / Math.min(A.size, B.size); };
  const byCat = {};
  for (const it of items) (byCat[it.k] = byCat[it.k] || []).push({ ...it, bg: bg(it.s) });
  let pairs = 0;
  for (const k in byCat) {
    const a = byCat[k];
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      const o = ov(a[i].bg, a[j].bg);
      if (o >= TH) { pairs++; console.log(`[${k}] sim=${o.toFixed(2)}  ${a[i].f.replace(/confession-extra-|\.js/g, '')} ↔ ${a[j].f.replace(/confession-extra-|\.js/g, '')}`); console.log(`   A: ${a[i].s.slice(0, 78)}`); console.log(`   B: ${a[j].s.slice(0, 78)}\n`); }
    }
  }
  console.log(`근접중복 쌍 ${pairs}개 (임계 ${TH}, [${FIELD}])`);
} else if (STATS) {
  // 상투구·종결 패턴 집계
  const endMap = {}; let endTot = 0;
  const tailRe = /([가-힣]{2,6}(?:세요|보세요|합니다|습니다|십시오))\.?\s*$/;
  for (const it of items) { const m = it.s.match(tailRe); if (m) { endMap[m[1]] = (endMap[m[1]] || 0) + 1; if (STOCK_END.test(it.s)) endTot++; } }
  const top = Object.entries(endMap).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log(`[${FIELD}] 총 ${items.length}개 · 상투 명령형 종결 ${endTot}개(${(endTot / items.length * 100).toFixed(0)}%)`);
  console.log('— 종결어미 빈도 top20 —'); for (const [k, v] of top) console.log(`  ${String(v).padStart(3)}  …${k}`);
  const fillHist = {}; for (const w of FILLER) fillHist[w] = items.filter(it => it.s.includes(w)).length;
  console.log('— 추상·상투어 출현 항목수 —'); for (const [k, v] of Object.entries(fillHist).sort((a, b) => b[1] - a[1])) if (v) console.log(`  ${String(v).padStart(3)}  ${k}`);
} else {
  const ranked = pool.map(it => ({ ...it, ...score(it.s) })).sort((a, b) => b.sc - a.sc).slice(0, TOP);
  console.log(`[${FIELD}] 풀 ${pool.length}개${HAS ? ` (has "${HAS}")` : ''}${ENDONLY ? ' (상투종결)' : ''} 중 약점 상위 ${TOP} (sc·f추상·c구체·e종결·L길이)\n`);
  ranked.forEach((it, i) => console.log(`${String(i + 1).padStart(2)}. [sc${it.sc.toFixed(1)} f${it.fill} c${it.conc} e${it.end} L${it.len}] ${it.f.replace('confession-extra-', '').replace('.js', '')}/${it.k}\n    ${it.s}\n`));
}
