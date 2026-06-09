/* ───────────────────────────────────────────────
   Veil 자동 생성 라운드 — 로컬 LLM(Ollama) 생성 → 규칙 QA → 병합 파일 출력
   사용: node tools/generate-round.mjs <라운드번호> <카테고리당개수>
   - 로컬 모델이 카테고리별 묵상/기도/적용 후보를 생성
   - QA: 교리 금칙어·기도 종결형('아멘.')·길이·중복(bigram>0.8) 자동 필터
   - 통과분만 confession-extra-r<라운드>.js 로 출력(누적 병합 구조)
   ⚠ 소형 모델 산출물 → 신학 검수 권장. 자동 QA는 형식·금칙·중복까지만 보장.
   ─────────────────────────────────────────────── */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const BASE = 'C:/Users/9835h_ztn/veil/';
const MODEL = process.env.VEIL_GEN_MODEL || 'exaone3.5:2.4b';
const API = 'http://localhost:11434/api/chat';
const round = process.argv[2] || 'x';
const N = parseInt(process.argv[3] || '2', 10);

const w = {};
new Function('window', readFileSync(BASE + 'confession-data.js', 'utf8'))(w);
new Function('window', readFileSync(BASE + 'confession-cases.js', 'utf8'))(w);
for (const f of readdirSync(BASE).filter(f => /^confession-extra.*\.js$/.test(f))) new Function('window', readFileSync(BASE + f, 'utf8'))(w);
const DATA = w.CONFESSION_DATA.categories;
const exs = []; if (w.CONFESSION_EXTRA) exs.push(w.CONFESSION_EXTRA); if (Array.isArray(w.CONFESSION_EXTRAS)) exs.push(...w.CONFESSION_EXTRAS);
const seen = {};
for (const c of DATA) seen[c.key] = { label: c.label, meds: [...(c.meditations || [])] };
for (const ex of exs) for (const k in ex) if (seen[k] && Array.isArray(ex[k].meditations)) seen[k].meds.push(...ex[k].meditations);

const SYS = `너는 개혁주의(개신교) 신학에 기초한 한국어 영성 작가다. 회개하는 성도를 위한 '묵상·기도·적용'을 쓴다.
[엄격 규칙]
- 천주교 요소 금지: 고해성사·사제·마리아 중보·연옥·공로사상.
- 사죄 선언 금지("내가 너의 죄를 사한다" 류). 유일한 중보자는 예수 그리스도(딤전 2:5).
- 율법주의도 값싼 은혜도 금지. 죄를 가볍게 하지 않되 그리스도의 십자가와 은혜로 인도.
- 오직 한국어로만 작성한다. 영어 단어(frustration, weekly 등)를 절대 섞지 마라.
- 묵상: 2~3문장, 간결하고 구체적으로(장황 금지).
- 기도: 1인칭. 반드시 '주님,' 또는 '하나님 아버지,'로 시작하고 '예수님의 이름으로 기도합니다. 아멘.'으로 끝낸다.
- 적용: 25자 이내의 완결된 실천 한 문장(잘리지 않게).
- 출력은 JSON 배열만: [{"meditation":"...","prayer":"...","application":"..."}]`;

function userPrompt(cat) {
  const ex = seen[cat.key].meds.slice(-4).map(e => '- ' + e).join('\n');
  return `회개 주제: "${cat.label}". 아래 기존 묵상과 겹치지 않게 다른 각도로 새로 써라.\n[기존]\n${ex}\n\n${N}개를 JSON 배열로만 출력.`;
}

async function gen(cat) {
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, stream: false, options: { temperature: 0.85 }, messages: [{ role: 'system', content: SYS }, { role: 'user', content: userPrompt(cat) }] }) });
    const j = await r.json();
    const txt = j.message?.content || '';
    const m = txt.match(/\[[\s\S]*\]/);
    if (!m) return [];
    return JSON.parse(m[0]);
  } catch { return []; }
}

const BAD = ['고해성사', '마리아', '연옥', '공로사상', '사제', '신부님', '죄를 사한', '사하노라', '면죄'];
const norm = s => (s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const bg = s => { const n = norm(s), S = new Set(); for (let i = 0; i < n.length - 1; i++) S.add(n.slice(i, i + 2)); return S; };
function dup(s, pool) { const A = bg(s); for (const p of pool) { const B = bg(p); if (!A.size || !B.size) continue; let c = 0; for (const x of A) if (B.has(x)) c++; if (c / Math.min(A.size, B.size) > 0.8) return true; } return false; }
function qa(it, cat, fresh) {
  const med = (it.meditation || '').trim(), pr = (it.prayer || '').trim(); let ap = (it.application || '').trim();
  if (med.length < 35 || med.length > 320 || pr.length < 25 || pr.length > 320) return null;
  if (/[A-Za-z]/.test(med + pr)) return null;                    // 영어 혼입 금지
  if (!/^(주님|하나님|아버지|주\s*예수)/.test(pr)) return null;    // 기도 시작 구조
  if (!/아멘\.?\s*$/.test(pr)) return null;                       // 기도 종결
  for (const b of BAD) if ((med + pr).includes(b)) return null;
  if (/너의 |너를 |너께|너에게/.test(pr)) return null;          // 하나님을 '너'로 지칭(불경) 차단
  if (dup(med, seen[cat.key].meds) || dup(med, fresh)) return null;
  if (ap && (/[A-Za-z]/.test(ap) || ap.length > 35 || ap.length < 4)) ap = '';  // 불량 적용은 버림(자르지 않음)
  return { meditation: med, prayer: pr, application: ap || null };
}

const out = {}; let acc = 0, rej = 0;
for (const cat of DATA) {
  const got = [];
  for (let t = 0; t < 3 && got.length < N; t++) {
    const cand = await gen(cat);
    for (const it of cand) { if (got.length >= N) break; const q = qa(it, cat, got.map(g => g.meditation)); if (q) { got.push(q); seen[cat.key].meds.push(q.meditation); } else rej++; }
  }
  acc += got.length;
  out[cat.key] = { meditations: got.map(g => g.meditation), prayers: got.map(g => g.prayer), applications: got.map(g => g.application).filter(Boolean) };
  process.stderr.write(`${cat.key}:+${got.length} `);
}
const file = `confession-extra-r${round}.js`;
writeFileSync(BASE + file, `/* Veil 보충 — 자동생성 라운드 ${round} (Ollama ${MODEL} + 규칙 QA). 신학 검수 권장. */\n(window.CONFESSION_EXTRAS = window.CONFESSION_EXTRAS || []).push(${JSON.stringify(out, null, 1)});\n`, 'utf8');
console.log(`\n라운드 ${round}: 채택 ${acc} · 반려 ${rej} → ${file}`);
