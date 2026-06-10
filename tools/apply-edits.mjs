/* 검수 수정 적용기 — review-edits.json의 항목을 r-파일에 안전 적용(재작성/삭제).
   각 edit: { cat, field, match(고유부분문자열), new(전체대체문 | "" 또는 생략시 삭제) }
   - cat+field 배열에서 match를 포함하는 '첫' 항목을 찾아 교체/삭제. 다중매치는 경고.
   - new가 있으면 기본 QA(영어·말더듬·기도구조) 검사 후 교체. 실패시 건너뜀.
   사용: node tools/apply-edits.mjs [edits.json] [--apply]   (기본 드라이런) */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const BASE = 'C:/Users/9835h_ztn/veil/';
const APPLY = process.argv.includes('--apply');
const EDITS = JSON.parse(readFileSync(BASE + (process.argv.find(a => a.endsWith('.json')) || 'tools/review-edits.json'), 'utf8'));

const _strip = t => t.replace(/[의은는이가을를에과와도만에서로부터,.!?·…"'()]/g, '');
const _REDUP = new Set(['하나', '하루', '조금', '점점', '차츰', '천천', '더욱', '한걸음', '한발', '가지각']);
function stutters(s) { const t = (s || '').split(/\s+/); for (let i = 0; i < t.length - 1; i++) { if (/[,.!?]$/.test(t[i])) continue; const a = _strip(t[i]), b = _strip(t[i + 1]); if (a.length >= 2 && a === b && !_REDUP.has(a)) return true; } return false; }
function qaNew(s, field) {
  if (/[A-Za-z]/.test(s)) return '영어 혼입';
  if (stutters(s)) return '말더듬';
  if (field === 'prayers') { if (!/^(주님|하나님|아버지|주\s*예수)/.test(s.trim())) return '기도 시작구조'; if (!/아멘\.?\s*$/.test(s.trim())) return '기도 종결'; }
  if (field === 'meditations' && (s.length < 40 || s.length > 320)) return '길이';
  if (field === 'applications' && (s.length < 4 || s.length > 60)) return '길이';
  return null;
}

// 파일 로드(객체 1개 + 형식)
const GEN = readdirSync(BASE).filter(f => /^confession-extra-r\d+\.js$/.test(f)).sort();
const loaded = {};
for (const f of GEN) {
  const w = {};
  try { new Function('window', readFileSync(BASE + f, 'utf8'))(w); } catch (e) { console.error(`✗ 로드실패(건너뜀): ${f} :: ${e.message}`); continue; }
  const ce = w.CONFESSION_EXTRAS;
  const obj = (Array.isArray(ce) && ce.length) ? ce[ce.length - 1] : w.CONFESSION_EXTRA;
  if (!obj || typeof obj !== 'object') { console.error(`✗ 구조없음(건너뜀): ${f}`); continue; }
  loaded[f] = { obj, dirty: false };
}

let done = 0, del = 0, skip = 0, miss = 0;
for (const e of EDITS) {
  const isDel = !e.new || e.new === '';
  let hit = null;
  for (const f of GEN) {
    const arr = loaded[f]?.obj?.[e.cat]?.[e.field];
    if (!Array.isArray(arr)) continue;
    const idxs = arr.map((s, i) => s.includes(e.match) ? i : -1).filter(i => i >= 0);
    if (idxs.length) { if (hit || idxs.length > 1) console.log(`⚠ 다중매치: [${e.cat}/${e.field}] "${e.match}"`); hit = { f, arr, i: idxs[0] }; break; }
  }
  if (!hit) { console.log(`✗ 미매치: [${e.cat}/${e.field}] "${e.match}"`); miss++; continue; }
  if (isDel) { console.log(`− 삭제: [${e.cat}/${e.field}] ${hit.arr[hit.i].slice(0, 40)}…`); if (APPLY) { hit.arr.splice(hit.i, 1); loaded[hit.f].dirty = true; } del++; }
  else {
    const bad = qaNew(e.new, e.field);
    if (bad) { console.log(`✗ QA실패(${bad}) 건너뜀: [${e.cat}/${e.field}] "${e.match}"`); skip++; continue; }
    console.log(`✎ 교체: [${e.cat}/${e.field}] ${hit.arr[hit.i].slice(0, 30)}… → ${e.new.slice(0, 30)}…`); if (APPLY) { hit.arr[hit.i] = e.new; loaded[hit.f].dirty = true; } done++;
  }
}
if (APPLY) for (const f of GEN) if (loaded[f] && loaded[f].dirty) {
  if (!loaded[f].obj || typeof loaded[f].obj !== 'object') { console.error(`✗ 쓰기중단(obj없음): ${f}`); continue; }
  const json = JSON.stringify(loaded[f].obj, null, 1);
  if (!json || json === 'undefined' || json.length < 50) { console.error(`✗ 쓰기중단(직렬화 비정상): ${f}`); continue; }
  const header = (readFileSync(BASE + f, 'utf8').match(/^\/\*[\s\S]*?\*\//) || ['/* Veil 보충 */'])[0];
  writeFileSync(BASE + f, header + '\n(window.CONFESSION_EXTRAS = window.CONFESSION_EXTRAS || []).push(' + json + ');\n', 'utf8');
}
console.log(`\n교체 ${done} · 삭제 ${del} · QA건너뜀 ${skip} · 미매치 ${miss}  (${APPLY ? '적용됨' : '드라이런'})`);
