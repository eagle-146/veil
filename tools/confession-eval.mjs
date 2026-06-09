/* ───────────────────────────────────────────────
   Veil 회개 로컬응답 평가 하니스 (개발 자동화 엔진)
   - script.js 의 매칭 로직을 그대로 미러링한다 (★로직 변경 시 두 곳 동기화).
   - 18개 카테고리 전체에 "사용자가 실제로 적을 법한" 자유서술 고백을 돌려
     사례매칭/카테고리/ GENERAL 분포와 오라우팅(엉뚱 카테고리)·위기 care 처리를 측정.
   - PASS = 구체 사례 매칭 + 카테고리가 허용집합 안. FAIL = GENERAL 또는 엉뚱.
   사용법: node tools/confession-eval.mjs
   ─────────────────────────────────────────────── */
import { readFileSync } from 'node:fs';
const base = 'C:/Users/9835h_ztn/veil/';
const w = {}; for (const f of ['confession-data.js', 'confession-cases.js']) new Function('window', readFileSync(base + f, 'utf8'))(w);
const DATA = w.CONFESSION_DATA.categories, GENERAL = w.CONFESSION_DATA.general, CASES = w.CONFESSION_CASES;
const CAT_BY_KEY = {}; DATA.forEach(c => CAT_BY_KEY[c.key] = c);

/* ── script.js 미러: 의미 유사도(bigram) + 키워드 보정 ── */
const CASE_TH = 0.20, CAT_TH = 0.12, KW_BONUS = 0.07, KW_CAP = 0.20, CAT_BONUS = 0.06, CAT_BCAP = 0.18;
const catKw = k => (CAT_BY_KEY[k] && CAT_BY_KEY[k].keywords) || [];
const norm = s => (s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const bigrams = s => { const n = norm(s); const set = new Set(); if (n.length === 1) set.add(n); for (let i = 0; i < n.length - 1; i++) set.add(n.slice(i, i + 2)); return set; };
const overlap = (a, b) => { if (!a.size || !b.size) return 0; let c = 0; for (const x of a) if (b.has(x)) c++; return c / Math.min(a.size, b.size); };
const kwHits = (lower, kws) => { let h = 0; for (const k of (kws || [])) if (k && lower.includes(k.toLowerCase())) h++; return h; };
const CASE_BG = CASES.map(c => ({ c, bg: bigrams((c.situation || '') + ' ' + (c.keywords || []).join(' ')) }));
const CAT_BG = DATA.map(cat => ({ cat, bg: bigrams((cat.label || '') + ' ' + (cat.keywords || []).join(' ')) }));
const CAT_CONF = 0.16, CAT_KW_W = 0.12;
function matchCase(text) {
  const q = bigrams(text), lower = text.toLowerCase();
  // 1단계: 정제된 카테고리 키워드로 '유력 카테고리' 판정
  let topCat = null, topCatScore = 0;
  for (const { cat, bg } of CAT_BG) { const s = overlap(q, bg) + kwHits(lower, cat.keywords) * CAT_KW_W; if (s > topCatScore) { topCatScore = s; topCat = cat; } }
  // 2단계: 전체 최고 사례 + 유력 카테고리 내 최고 사례
  let best = null, bs = 0, bestIn = null, bsIn = 0;
  for (const { c, bg } of CASE_BG) {
    const s = overlap(q, bg) + Math.min(KW_CAP, kwHits(lower, c.keywords) * KW_BONUS) + Math.min(CAT_BCAP, kwHits(lower, catKw(c.cat)) * CAT_BONUS);
    if (s > bs) { bs = s; best = c; }
    if (topCat && c.cat === topCat.key && s > bsIn) { bsIn = s; bestIn = c; }
  }
  // 카테고리 신호가 분명하고 전체 최고가 다른 카테고리면 → 카테고리 내 최고로 교정
  if (topCat && topCatScore >= CAT_CONF && bestIn && best && best.cat !== topCat.key) return { hit: bestIn, score: bsIn };
  return { hit: bs >= CASE_TH ? best : null, score: bs };
}
function matchCategory(text) {
  const q = bigrams(text), lower = text.toLowerCase(); let best = null, bs = 0;
  for (const { cat, bg } of CAT_BG) { const s = overlap(q, bg) + Math.min(KW_CAP, kwHits(lower, cat.keywords) * KW_BONUS); if (s > bs) { bs = s; best = cat; } }
  return { cat: bs >= CAT_TH ? best : GENERAL, score: bs };
}

/* ── 배터리: [고백, 허용 카테고리들, 위기여부] ── */
const T = [
  ['남편이랑 크게 싸우고 막말을 퍼부었어요', ['anger', 'conflict']],
  ['운전 중에 끼어든 차에 욕이 나왔어요', ['anger']],
  ['속으로 남을 깔보고 잘난 척했어요', ['pride']],
  ['내가 제일 옳다고 끝까지 우겼어요', ['pride', 'conflict']],
  ['자꾸 야한 영상에 손이 가요', ['lust']],
  ['이성을 음란한 눈으로 자꾸 보게 돼요', ['lust']],
  ['돈 욕심에 무리하게 투자했어요', ['greed']],
  ['더 가지고 싶은 마음이 끝이 없어요', ['greed']],
  ['위기를 모면하려고 거짓말을 했어요', ['lie']],
  ['겉과 속이 다른 위선을 떨었어요', ['lie']],
  ['해야 할 일을 자꾸 뒤로 미루기만 해요', ['sloth']],
  ['하루 종일 아무것도 안 하고 빈둥거렸어요', ['sloth']],
  ['동료가 잘 되는 걸 보니 속이 쓰려요', ['envy']],
  ['남들과 자꾸 비교하며 열등감에 빠져요', ['envy', 'shame']],
  ['앞날이 너무 불안하고 걱정만 돼요', ['fear']],
  ['미래가 두려워서 잠이 안 옵니다', ['fear']],
  ['그 사람을 도무지 용서가 안 됩니다', ['unforgive']],
  ['상처 준 사람이 미워서 놓아지지 않아요', ['unforgive', 'anger']],
  ['요즘 기도도 말씀도 통 손에 안 잡혀요', ['prayerless', 'doubt', 'despair']],
  ['예배가 형식적이 되고 마음이 멀어졌어요', ['prayerless', 'doubt']],
  ['내 자신이 너무 부끄럽고 싫습니다', ['shame']],
  ['과거의 잘못이 자꾸 떠올라 괴로워요', ['shame', 'despair']],
  ['다 포기하고 싶을 만큼 낙심됩니다', ['despair']],
  ['희망이 안 보이고 무기력해요', ['despair', 'sloth']],
  ['술을 끊지 못하고 어젯밤 또 마셨어요', ['addiction']],
  ['스마트폰을 손에서 놓지 못하겠어요', ['addiction']],
  ['직장 사람들 뒷담화에 끼었어요', ['gossip', 'lie']],
  ['남의 험담을 여기저기 옮겼습니다', ['gossip']],
  ['가족과 크게 다투고 관계가 상했어요', ['conflict', 'anger']],
  ['친구와 사이가 틀어져서 마음이 무거워요', ['conflict']],
  ['가진 것에 감사 못 하고 불평만 했어요', ['ingratitude', 'greed']],
  ['자꾸 원망하는 마음이 올라옵니다', ['ingratitude', 'unforgive']],
  ['하나님이 정말 계신지 의심이 듭니다', ['doubt']],
  ['신앙이 흔들리고 회의가 밀려와요', ['doubt', 'despair']],
  ['내 생각만 하고 남을 돌보지 않았어요', ['selfishness']],
  ['이기적으로 행동해서 사람을 서운하게 했어요', ['selfishness', 'conflict']],
  ['죽고 싶다는 생각이 자꾸 듭니다', ['despair', 'addiction'], true], // 위기 → care 필수
  ['남편한테 화내고 거짓말까지 했어요', ['anger', 'lie', 'conflict']],
  // ── 확장 배터리(회차4+): 구어/오타/복합/모호/위기 변형 ──
  ['빡쳐서 동료한테 한마디 쏘아붙였어요', ['anger', 'conflict']],
  ['현타가 오고 다 의미 없게 느껴져요', ['despair', 'doubt']],
  ['쇼핑 현질을 멈출 수가 없어요', ['greed', 'addiction']],
  ['거짓말 햇어요 들킬까봐 또 거짓말', ['lie']],
  ['요즘 기도 안하게되요', ['prayerless']],
  ['친구 험담하고 거짓말도 보탰어요', ['gossip', 'lie']],
  ['돈 때문에 부모님께 거짓말했어요', ['lie', 'greed']],
  ['자꾸 남이랑 비교돼서 우울해요', ['envy', 'shame', 'despair']],
  ['예배 시간 내내 딴생각만 했어요', ['prayerless', 'doubt']],
  ['성경만 펴면 졸리고 안 읽게 돼요', ['prayerless', 'sloth']],
  ['다 끝내버리고 싶다는 생각이 들어요', ['despair', 'addiction'], true],
  ['자해 충동이 자꾸 올라와요', ['despair', 'addiction'], true],
  ['마음이 너무 힘들고 지쳐요', ['despair', 'shame', 'fear']],
  ['회사 욕하면서 불평만 하며 일했어요', ['ingratitude', 'anger']],
  ['배달음식 시키고 돈을 펑펑 썼어요', ['greed', 'addiction']],
  ['게임에 또 과금을 해버렸어요', ['addiction', 'greed']],
  ['해야 할 답장이며 일을 다 미뤘어요', ['sloth']],
  ['부모님께 버럭 짜증을 냈어요', ['anger', 'conflict']],
  ['배우자를 은근히 무시했어요', ['pride', 'conflict', 'selfishness']],
  ['기도해도 응답이 없는 것 같아 회의가 들어요', ['doubt', 'despair']],
  ['내가 다 맞다고 남 조언을 무시했어요', ['pride']],
  ['SNS만 들여다보며 시간을 버렸어요', ['sloth', 'addiction']],
  ['남이 잘되는 꼴을 못 보겠어요', ['envy']],
  ['교회 사람들을 속으로 판단하고 정죄했어요', ['pride', 'selfishness', 'gossip']],
  ['술 없이는 잠들지 못해요', ['addiction']],
  ['아내에게 고맙다는 말 한 번 안 했어요', ['ingratitude', 'selfishness']],
  ['두렵고 불안해서 아무 결정도 못 하겠어요', ['fear']],
  ['과거에 지은 죄가 용서받을 수 있을까 두려워요', ['shame', 'doubt', 'despair']],
  // ── 확장 배터리(회차6): 초단문/장문/복합/비죄성/까다로운 신학 ──
  ['화나', ['anger']],
  ['짜증나 죽겠어요', ['anger']],
  ['우울하고 무기력해요', ['despair', 'sloth']],
  ['오늘 상사한테 부당하게 당해 화가 났고 집에 와 가족한테 괜히 짜증내고는 또 미안하고 자책이 들어요', ['anger', 'conflict', 'shame']],
  ['하나님을 원망하는 마음이 들었어요', ['ingratitude', 'doubt', 'unforgive']],
  ['예배보다 일이 늘 우선이 돼버렸어요', ['prayerless', 'greed']],
  ['운전하다 보복운전을 하고 말았어요', ['anger']],
  ['면접에서 떨어지고 자존감이 무너졌어요', ['shame', 'despair']],
  ['헌금을 드리는 게 아까웠어요', ['greed', 'ingratitude']],
  ['교회 봉사가 하기 싫어 핑계 대고 빠졌어요', ['sloth', 'selfishness']],
  ['기도 제목을 자랑하듯 떠벌렸어요', ['pride']],
  ['이성 친구와 선을 넘고 말았어요', ['lust']],
  ['부모님 말씀에 대들고 말대꾸했어요', ['anger', 'conflict']],
  ['직장 동료를 은근히 따돌렸어요', ['selfishness', 'conflict']],
  ['SNS 도파민에 중독된 것 같아요', ['addiction', 'sloth']],
  ['그냥 다 내려놓고 쉬고 싶을 만큼 지쳐요', ['despair']],
  ['십일조를 떼먹고 싶은 마음이 들었어요', ['greed']],
  ['믿음이 다 거짓이었나 의심이 들어요', ['doubt']],
  ['약속을 어기고도 변명만 늘어놨어요', ['lie']],
  ['남의 성공에 진심으로 축하를 못 했어요', ['envy']],
  ['게을러서 새벽기도를 또 빠졌어요', ['sloth', 'prayerless']],
  ['화를 못 참고 물건을 집어던졌어요', ['anger']],
  ['외로워서 자꾸 나쁜 관계에 기대요', ['despair', 'lust', 'addiction']],
  ['돈을 더 벌려고 주일까지 일했어요', ['greed', 'prayerless']],
  ['자꾸 죽음을 생각하게 됩니다', ['despair', 'addiction'], true],
  // E2E에서 잡은 회귀: 내가 가해한 분노("상처를 줬다")가 피해/용서못함으로 새던 케이스
  ['아내한테 화를 참지 못하고 모진 말을 쏟아내 상처를 줬어요', ['anger', 'conflict']],
  ['홧김에 아이에게 모진 말로 상처를 줬습니다', ['anger', 'conflict']],
];

let pass = 0, caseHit = 0; const fails = [];
console.log('── 회개 로컬응답 평가 (배터리 ' + T.length + '건) ──\n');
for (const [text, ok, crisis] of T) {
  const mc = matchCase(text);
  let kind, cat, score;
  if (mc.hit) { kind = 'CASE'; cat = mc.hit.cat; score = mc.score; }
  else { const cm = matchCategory(text); score = cm.score; if (cm.cat === GENERAL) { kind = 'GENERAL'; cat = 'GENERAL'; } else { kind = 'CAT'; cat = cm.cat.key; } }
  const careOK = !crisis || (mc.hit && (mc.hit.care || (CAT_BY_KEY[cat] && CAT_BY_KEY[cat].care)));
  // 합격 = 응답이 나오고(CASE 또는 CAT) 카테고리가 허용집합 안 + 위기 care. (GENERAL/오라우팅/위기care누락만 실패)
  const good = (kind === 'CASE' || kind === 'CAT') && ok.includes(cat) && careOK;
  if (good) { pass++; if (kind === 'CASE') caseHit++; }
  else fails.push({ text, ok, kind, cat, score: score.toFixed(2), id: mc.hit ? mc.hit.id : null, crisis: !!crisis, careOK });
  console.log(`${good ? '✅' : '❌'} ${kind.padEnd(7)} ${String(cat).padEnd(11)} (${score.toFixed(2)})${crisis ? (careOK ? ' [care✓]' : ' [care✗]') : ''}  ⟵ "${text}"  [기대:${ok.join('/')}]`);
}
console.log(`\n── 요약 ──`);
console.log(`PASS ${pass}/${T.length} = ${Math.round(pass / T.length * 100)}%  (구체사례 ${caseHit}/${T.length} = ${Math.round(caseHit / T.length * 100)}%)`);
if (fails.length) {
  console.log(`\nFAIL ${fails.length}건:`);
  for (const f of fails) console.log(`  · "${f.text}" → ${f.kind}/${f.cat} (${f.score})${f.crisis && !f.careOK ? ' ⚠위기 care누락' : ''}  기대[${f.ok.join('/')}]`);
}
process.exit(fails.length ? 1 : 0);
