/* 응답 변주 폭 측정 — confession-extra*.js 전부 자동 병합 후의 실제 회전 풀.
   사용: node tools/variety-report.mjs */
import { readFileSync, readdirSync } from 'node:fs';
const base = 'C:/Users/9835h_ztn/veil/';
const w = {};
new Function('window', readFileSync(base + 'confession-data.js', 'utf8'))(w);
new Function('window', readFileSync(base + 'confession-cases.js', 'utf8'))(w);
const extraFiles = readdirSync(base).filter(f => /^confession-extra.*\.js$/.test(f)).sort();
for (const f of extraFiles) new Function('window', readFileSync(base + f, 'utf8'))(w);
const DATA = w.CONFESSION_DATA.categories;
const exs = [];
if (w.CONFESSION_EXTRA) exs.push(w.CONFESSION_EXTRA);
if (Array.isArray(w.CONFESSION_EXTRAS)) exs.push(...w.CONFESSION_EXTRAS);
for (const ex of exs) for (const cat of DATA) { const e = ex[cat.key]; if (!e) continue; for (const fld of ['verses', 'meditations', 'prayers', 'applications']) if (Array.isArray(e[fld]) && Array.isArray(cat[fld])) cat[fld].push(...e[fld]); }
console.log('카테고리      | 말씀 | 묵상 | 기도 | 적용 | 회전조합(묵상×기도)');
console.log('-'.repeat(64));
let tot = 0, thin = 0, minM = 999;
for (const c of DATA) {
  const v = (c.verses || []).length, m = (c.meditations || []).length, p = (c.prayers || []).length, a = (c.applications || []).length;
  const combo = m * p; tot += combo; if (m < 8) thin++; if (m < minM) minM = m;
  console.log(`${c.key.padEnd(13)}| ${String(v).padStart(3)} | ${String(m).padStart(3)} | ${String(p).padStart(3)} | ${String(a).padStart(3)} | ${combo}`);
}
console.log('-'.repeat(64));
console.log(`총 회전조합(묵상×기도): ${tot}  ·  최소 묵상 수: ${minM}  ·  묵상 8개 미만 카테고리: ${thin}/${DATA.length}`);
console.log(`보충 파일: ${extraFiles.length}개 (${extraFiles.join(', ')})`);
