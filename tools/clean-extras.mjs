/* 자동생성 보충물 정제 — 소형모델 말더듬/결함 항목 제거 후 원본 형식대로 재기록.
   사용: node tools/clean-extras.mjs <파일글롭접두> [--apply]
   기본은 드라이런(보고만). --apply 시 실제 파일 덮어씀. 묵상·기도는 독립 회전이라 개별 제거 안전. */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const BASE = 'C:/Users/9835h_ztn/veil/';
const APPLY = process.argv.includes('--apply');
const onlyRange = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null; // 예: r1 (r11~r19,r10,r1..)

// 결함 판정 ─ '인접 토큰 중복(말더듬)'만 제거. 명백한 결함만 잡아 오탐(좋은 내용 삭제) 방지.
// 예: "다윗의 다윗은", "말씀의 말씀을", "베드로의 베드로" → 어근이 인접 반복.
const strip = t => t.replace(/[의은는이가을를에과와도만에서로부터,.!?·…"'()]/g, '');
const REDUP = new Set(['하나', '하루', '조금', '점점', '차츰', '천천', '더욱', '한걸음', '한발', '가지각']); // 정상 첩어
function stutter(s) {
  const toks = (s || '').split(/\s+/);
  for (let i = 0; i < toks.length - 1; i++) {
    if (/[,.!?]$/.test(toks[i])) continue;                // 절 경계("주님, 주님과")는 말더듬 아님
    const a = strip(toks[i]), b = strip(toks[i + 1]);
    if (a.length >= 2 && a === b && !REDUP.has(a)) return true; // "다윗의 다윗은"O · "하나 하나"·"주님, 주님과"X
  }
  return false;
}
const badMed = s => !s || stutter(s);
const badPr  = s => !s || stutter(s);

function loadObj(file) {            // 각 파일의 보충 객체 1개를 꺼냄(EXTRA 또는 EXTRAS.push분)
  const w = {};
  new Function('window', readFileSync(BASE + file, 'utf8'))(w);
  if (Array.isArray(w.CONFESSION_EXTRAS) && w.CONFESSION_EXTRAS.length) return { obj: w.CONFESSION_EXTRAS[w.CONFESSION_EXTRAS.length - 1], form: 'arr' };
  if (w.CONFESSION_EXTRA) return { obj: w.CONFESSION_EXTRA, form: 'obj' };
  return null;
}
function clean(obj) {
  let medCut = 0, prCut = 0;
  for (const k in obj) {
    const e = obj[k]; if (!e) continue;
    if (Array.isArray(e.meditations)) { const before = e.meditations.length; e.meditations = e.meditations.filter(m => !badMed(m)); medCut += before - e.meditations.length; }
    if (Array.isArray(e.prayers))     { const before = e.prayers.length;     e.prayers     = e.prayers.filter(p => !badPr(p));     prCut  += before - e.prayers.length; }
  }
  return { medCut, prCut };
}

const files = readdirSync(BASE).filter(f => /^confession-extra.*\.js$/.test(f)).filter(f => !onlyRange || f.includes(onlyRange)).sort();
let tMed = 0, tPr = 0;
for (const file of files) {
  const loaded = loadObj(file); if (!loaded) { console.log(`${file}: (보충객체 없음, 건너뜀)`); continue; }
  const { medCut, prCut } = clean(loaded.obj);
  tMed += medCut; tPr += prCut;
  if (medCut || prCut) {
    console.log(`${file}: 묵상 -${medCut} · 기도 -${prCut}${APPLY ? ' [적용]' : ' [드라이런]'}`);
    if (APPLY) {
      const header = (readFileSync(BASE + file, 'utf8').match(/^\/\*[\s\S]*?\*\//) || ['/* Veil 보충 */'])[0];
      const body = loaded.form === 'arr'
        ? `(window.CONFESSION_EXTRAS = window.CONFESSION_EXTRAS || []).push(${JSON.stringify(loaded.obj, null, 1)});\n`
        : `window.CONFESSION_EXTRA = ${JSON.stringify(loaded.obj, null, 1)};\n`;
      writeFileSync(BASE + file, header + '\n' + body, 'utf8');
    }
  }
}
console.log(`\n합계: 묵상 -${tMed} · 기도 -${tPr}  (${APPLY ? '적용 완료' : '드라이런 — 적용하려면 --apply'})`);
