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
  // ── 자동화2 R1: 직장·돈·디지털·관계·신체상 ──
  ['상사 뒷담화를 동료들과 실컷 했어요', ['gossip', 'lie']],
  ['주식 손실에 분노가 치밀어 밤새 잠을 못 잤어요', ['anger', 'greed', 'fear']],
  ['게임 아이템에 또 큰돈을 질러버렸어요', ['addiction', 'greed']],
  ['소개팅 상대를 외모로만 판단하고 속으로 무시했어요', ['pride', 'selfishness']],
  ['거울 속 내 몸이 혐오스러워 먹고 토하기를 반복해요', ['shame', 'addiction', 'despair'], true],
  ['교회 봉사를 생색내며 칭찬받으려 했어요', ['pride']],
  ['친구가 믿고 말한 비밀을 다른 사람에게 흘렸어요', ['gossip', 'lie']],
  ['부모님께 손 벌리면서도 고마운 줄 몰랐어요', ['ingratitude', 'selfishness']],
  ['예배 시간 내내 핸드폰만 들여다봤어요', ['prayerless', 'addiction']],
  ['동생과 유산 문제로 크게 다투고 등을 돌렸어요', ['conflict', 'greed', 'anger']],
  ['야근에 지쳐 하나님을 원망하는 말이 터져나왔어요', ['ingratitude', 'doubt', 'despair']],
  ['끊겠다고 약속한 음란물을 또 보고 말았어요', ['lust', 'addiction']],
  // ── 자동화2 R2: 가정·부모·자녀·형제 ──
  ['시어머니 말씀에 속으로 욕을 퍼부었어요', ['anger', 'conflict']],
  ['늙으신 부모님 모시는 게 짐처럼 느껴졌어요', ['ingratitude', 'selfishness', 'conflict']],
  ['아이 성적을 옆집 아이와 비교하며 다그쳤어요', ['envy', 'anger', 'pride']],
  ['형제와 재산 때문에 연을 끊다시피 했어요', ['conflict', 'greed', 'unforgive']],
  ['배우자의 말을 끝까지 듣지 않고 무시했어요', ['selfishness', 'pride', 'conflict']],
  ['집안일을 배우자에게만 떠넘기고 모른 척했어요', ['sloth', 'selfishness']],
  ['가족 단톡방에서 동생을 깎아내렸어요', ['gossip', 'conflict']],
  ['명절에 친척들과 비교당해 열등감에 휩싸였어요', ['envy', 'shame']],
  ['자녀를 믿어주지 못하고 의심과 잔소리만 했어요', ['conflict', 'fear', 'selfishness']],
  ['부모님 전화를 귀찮아하며 받지 않았어요', ['selfishness', 'sloth', 'ingratitude']],
  // ── 자동화2 R3: 성·연애·결혼 ──
  ['데이트 상대에게 잘 보이려 거짓으로 꾸몄어요', ['lie', 'pride']],
  ['배우자가 아닌 사람에게 자꾸 마음이 흔들려요', ['lust']],
  ['혼전 순결을 지키지 못한 죄책감에 시달려요', ['shame', 'lust']],
  ['배우자와 잠자리를 무기처럼 거부하며 벌줬어요', ['conflict', 'selfishness']],
  ['이혼하자는 말을 입에 달고 살며 위협했어요', ['conflict', 'anger']],
  ['옛 연인을 계속 SNS로 훔쳐보며 미련을 못 버려요', ['lust', 'envy']],
  ['결혼 생활이 권태로워 다른 이성에게 선을 넘을 뻔했어요', ['lust']],
  ['배우자를 다른 집 남편과 비교하며 깎아내렸어요', ['envy', 'conflict', 'pride']],
  ['음란물 중독에서 벗어나려다 또 무너졌어요', ['lust', 'addiction']],
  ['연인에게 집착하며 일거수일투족을 통제하려 했어요', ['lust', 'selfishness', 'fear']],
  // ── 자동화2 R4: 돈·일·직장 윤리 ──
  ['회삿돈을 사적으로 슬쩍 빼서 썼어요', ['lie', 'greed']],
  ['세금을 줄이려 소득을 속여서 신고했어요', ['lie', 'greed']],
  ['동료의 공을 가로채 내 실적으로 보고했어요', ['lie', 'pride', 'selfishness']],
  ['일확천금을 노리고 도박에 다시 손댔어요', ['addiction', 'greed']],
  ['승진하려 윗사람에게 아부하고 동료를 짓밟았어요', ['pride', 'selfishness', 'lie']],
  ['주말까지 일하느라 예배를 등한시했어요', ['prayerless', 'greed']],
  ['가난한 사람을 속으로 업신여기고 무시했어요', ['pride', 'selfishness']],
  ['헌금을 떼어 내 욕심을 채웠어요', ['greed', 'lie']],
  ['도울 능력이 있으면서 어려운 이웃을 외면했어요', ['selfishness', 'greed']],
  ['빚 독촉을 피해 연락을 끊고 회피했어요', ['lie', 'fear', 'sloth']],
  // ── 자동화2 R5: 교회 생활 ──
  ['목사님 설교를 속으로 비판하고 판단했어요', ['pride', 'gossip']],
  ['교회 직분을 두고 다른 성도와 신경전을 벌였어요', ['conflict', 'pride', 'envy']],
  ['새 신자를 겉모습으로 판단하고 차별했어요', ['pride', 'selfishness']],
  ['교회 봉사에 지쳐 공동체를 원망하게 됐어요', ['ingratitude', 'despair']],
  ['헌금 액수로 사람의 신앙을 평가했어요', ['pride', 'greed']],
  ['소그룹 기도제목을 가십거리로 떠벌렸어요', ['gossip']],
  ['믿음 좋은 척 가식적으로 행동했어요', ['lie', 'pride']],
  ['교회 봉사를 핑계로 가정을 소홀히 했어요', ['selfishness', 'sloth']],
  ['다른 교인의 헌신을 시기하고 깎아내렸어요', ['envy', 'gossip']],
  ['예배보다 사람들 시선을 더 의식했어요', ['pride', 'fear']],
  // ── 자동화2 R6: 영적 침체·의심 ──
  ['하나님이 내 기도를 외면하시는 것 같아요', ['doubt', 'despair']],
  ['교회는 다니지만 마음은 차갑게 식어버렸어요', ['prayerless', 'doubt']],
  ['고난이 계속되니 하나님 사랑을 의심하게 돼요', ['doubt', 'despair']],
  ['성경이 그저 옛날 이야기처럼 느껴져요', ['doubt', 'prayerless']],
  ['구원의 확신이 흔들려 불안합니다', ['doubt', 'fear']],
  ['찬양에도 은혜가 메말라 버렸어요', ['prayerless', 'despair']],
  ['주일성수가 형식적인 의무처럼 됐어요', ['prayerless']],
  ['하나님보다 세상 즐거움이 더 좋아졌어요', ['prayerless', 'lust', 'greed']],
  ['믿는다면서 제 삶은 하나도 변하지 않았어요', ['lie', 'doubt', 'shame']],
  ['기도 응답이 없어 신앙을 놓아버리고 싶어요', ['doubt', 'despair']],
  // ── 자동화2 R7: 중독 유형 ──
  ['담배를 끊겠다고 다짐하고 또 피웠어요', ['addiction']],
  ['밤새 유튜브에 빠져 시간을 허비했어요', ['addiction', 'sloth']],
  ['커피와 자극에 의존하지 않으면 못 버팁니다', ['addiction']],
  ['일 중독으로 가정도 건강도 망가뜨렸어요', ['addiction', 'greed']],
  ['홈쇼핑을 멈추지 못하고 또 결제했어요', ['addiction', 'greed']],
  ['술에 취해 했던 말과 행동이 부끄럽습니다', ['addiction', 'shame']],
  ['도박 빚이 늘어가는데도 끊지를 못해요', ['addiction', 'greed']],
  ['자극적인 영상만 찾으며 폰을 놓지 못해요', ['addiction', 'lust']],
  ['단 음식 폭식 뒤 죄책감과 자기혐오에 빠져요', ['addiction', 'shame']],
  ['게임 때문에 밤을 새우고 일상이 무너졌어요', ['addiction', 'sloth']],
  // ── 자동화2 R8: 감정(분노·두려움·불안) ──
  ['사소한 일에도 욱하고 폭발해버립니다', ['anger']],
  ['운전 중 보복운전 충동을 못 참았어요', ['anger']],
  ['미래가 불안해 공황이 올 것만 같아요', ['fear', 'despair']],
  ['실패할까 두려워 시작도 못 하고 있어요', ['fear', 'sloth']],
  ['작은 비난에도 며칠씩 잠을 못 잡니다', ['fear', 'shame']],
  ['분이 풀리지 않아 물건을 부숴버렸어요', ['anger']],
  ['건강 걱정에 사로잡혀 매일 불안합니다', ['fear']],
  ['화를 속으로 삭이다 우울로 가라앉았어요', ['anger', 'despair']],
  ['남이 나를 어떻게 볼지 두려워 위축됩니다', ['fear', 'shame']],
  ['짜증과 신경질을 애꿎은 가족에게 쏟아냈어요', ['anger', 'conflict']],
  // ── 자동화2 R9: 자기혐오·수치심 ──
  ['거울을 볼 때마다 내 외모가 혐오스럽습니다', ['shame']],
  ['과거의 큰 실수가 떠올라 밤마다 자책합니다', ['shame', 'despair']],
  ['나는 무가치한 존재라는 생각에서 못 벗어나요', ['shame', 'despair']],
  ['남들과 비교하며 늘 초라함을 느낍니다', ['shame', 'envy']],
  ['실패한 인생이라고 스스로를 정죄합니다', ['shame', 'despair']],
  ['용서받을 자격이 없다고 느껴 숨고만 싶어요', ['shame', 'doubt']],
  ['SNS 속 완벽한 사람들을 보며 자존감이 무너져요', ['shame', 'envy']],
  ['내 몸을 학대하듯 굶다가 폭식하기를 반복해요', ['shame', 'addiction', 'despair'], true],
  ['칭찬을 받아도 나는 가짜라는 생각이 듭니다', ['shame']],
  ['죄책감이 너무 커서 기도조차 못 하겠어요', ['shame', 'prayerless', 'despair']],
  // ── 자동화2 R10: 위기·안전 (care 필수) ──
  ['더는 살 이유가 없다는 생각이 떠나질 않아요', ['despair', 'addiction'], true],
  ['손목을 그어서라도 이 고통을 멈추고 싶어요', ['despair', 'addiction'], true],
  ['세상에서 사라져 버리고 싶다는 충동이 듭니다', ['despair', 'addiction'], true],
  ['배우자의 폭력을 더는 견딜 수 없습니다', ['despair', 'fear', 'conflict'], true],
  ['먹고 토하기를 멈출 수 없어 몸이 망가져요', ['addiction', 'shame', 'despair'], true],
  ['술 없이는 단 하루도 버틸 수가 없어요', ['addiction'], true],
  ['모든 걸 끝내면 편해질 것 같다는 생각이 듭니다', ['despair', 'addiction'], true],
  ['도박으로 전 재산을 잃고 극단적 생각까지 했어요', ['addiction', 'despair', 'greed'], true],
  ['자해한 흉터를 보며 또 무너집니다', ['despair', 'addiction', 'shame'], true],
  ['희망이 없어 모든 걸 포기하고 떠나고 싶어요', ['despair'], true],
  // ── 자동화2 R11: 초단문·슬랭·신조어 ──
  ['현타 와서 다 부질없게 느껴져', ['despair', 'doubt']],
  ['빡쳐서 미치겠어', ['anger']],
  ['그냥 다 귀찮고 일하기 싫어', ['sloth', 'despair']],
  ['멘붕와서 아무것도 못 하겠어', ['despair', 'fear']],
  ['자꾸 폰만 붙잡고 있어', ['addiction', 'sloth']],
  ['남친이랑 또 크게 싸웠어', ['conflict', 'anger']],
  ['교회 가기가 싫어졌어', ['prayerless', 'doubt']],
  ['돈 없어서 자꾸 짜증나', ['greed', 'anger', 'ingratitude']],
  ['기도 안 한 지 한 달 넘었어', ['prayerless']],
  ['남 잘되는 거 보면 배 아파', ['envy']],
  // ── 자동화2 R12: 복합죄 ──
  ['거짓말로 돈을 빌리고 갚지 않아 관계를 망쳤어요', ['lie', 'greed', 'conflict']],
  ['술 취해 가족에게 폭언하고 다음날 자책했어요', ['addiction', 'anger', 'shame']],
  ['시기심에 동료를 험담하고 깎아내렸어요', ['envy', 'gossip']],
  ['게으름 피우다 거짓말로 변명하고 책임을 미뤘어요', ['sloth', 'lie']],
  ['음란물을 보고 죄책감에 기도마저 멀어졌어요', ['lust', 'shame', 'prayerless']],
  ['교만하게 굴다 다투고 사과도 안 했어요', ['pride', 'conflict']],
  ['불평하며 가족에게 짜증내고 감사를 잊었어요', ['ingratitude', 'anger']],
  ['두려움에 거짓말하고 책임을 회피했어요', ['fear', 'lie', 'sloth']],
  ['돈 욕심에 무리하다 불안과 분노에 휩싸였어요', ['greed', 'fear', 'anger']],
  ['외로움에 음란과 폭식으로 도망쳤어요', ['lust', 'addiction', 'despair']],
  // ── 자동화2 R13: 모호·비죄성 토로 ──
  ['그냥 요즘 마음이 너무 공허해요', ['despair', 'doubt']],
  ['아무 이유 없이 눈물이 나고 무기력해요', ['despair']],
  ['삶이 의미 없게 느껴지고 자꾸 지쳐요', ['despair']],
  ['괜히 모든 게 짜증나고 예민해졌어요', ['anger', 'despair']],
  ['열심히 사는데도 늘 부족한 것만 같아요', ['shame', 'ingratitude', 'despair']],
  ['사람들과 함께 있어도 외롭고 공허합니다', ['despair']],
  ['뭘 해도 만족이 안 되고 허전해요', ['greed', 'despair', 'ingratitude']],
  ['미래가 막막하고 답이 안 보입니다', ['fear', 'despair']],
  ['마음이 무겁고 죄책감이 떠나질 않아요', ['shame', 'despair']],
  ['요즘 모든 게 버겁고 다 놓아버리고 싶어요', ['despair']],
  // ── 자동화2 R14: 신학적으로 까다로운 고백 ──
  ['고난이 내 죄 때문인가 싶어 자책하게 돼요', ['shame', 'doubt']],
  ['다 예정하셨다면 내 노력이 무슨 소용인가 회의가 듭니다', ['doubt']],
  ['헌신했는데 시련뿐이라 하나님이 원망스러워요', ['ingratitude', 'doubt', 'despair']],
  ['용서받았다면서도 죄책감을 못 떨치고 율법적으로 자책해요', ['shame', 'doubt']],
  ['하나님이 침묵하시는 것 같아 기도가 공허합니다', ['doubt', 'prayerless', 'despair']],
  ['내 의로 구원을 얻으려는 교만이 있었어요', ['pride']],
  ['시험을 주신 하나님을 탓하며 불평했어요', ['ingratitude', 'doubt']],
  ['믿음으로 산다면서 늘 불안에 떨었어요', ['fear', 'doubt']],
  ['회개해도 또 지을까 두려워 절망합니다', ['despair', 'fear', 'shame']],
  ['은혜를 값싸게 여기며 죄를 가볍게 봤어요', ['pride', 'ingratitude']],
  // ── 자동화2 R15: 혼합 마무리 ──
  ['카톡 답장을 계속 미루며 사람들을 피했어요', ['sloth', 'selfishness', 'fear']],
  ['남의 불행을 보며 안도감을 느낀 제가 부끄럽습니다', ['shame', 'envy', 'selfishness']],
  ['완벽주의 때문에 시작조차 못 하고 미뤘어요', ['sloth', 'fear', 'pride']],
  ['약자를 함부로 대하고 갑질을 했어요', ['pride', 'selfishness', 'anger']],
  ['받은 은혜를 까맣게 잊고 당연하게 여겼어요', ['ingratitude']],
  ['예배 중에도 일 걱정만 가득했어요', ['prayerless', 'greed', 'fear']],
  ['사소한 거짓말이 어느새 습관이 돼버렸어요', ['lie']],
  ['형편이 어려운 친구를 모른 척 외면했어요', ['selfishness']],
  ['분노를 운전대에서 풀며 위험하게 몰았어요', ['anger']],
  ['중보기도 부탁을 받고도 까맣게 잊어버렸어요', ['sloth', 'selfishness', 'prayerless']],
];

let pass = 0, caseHit = 0; const fails = [];
console.log('── 회개 로컬응답 평가 (배터리 ' + T.length + '건) ──\n');
for (const [text, ok, crisis] of T) {
  const mc = matchCase(text);
  let kind, cat, score;
  if (mc.hit) { kind = 'CASE'; cat = mc.hit.cat; score = mc.score; }
  else { const cm = matchCategory(text); score = cm.score; if (cm.cat === GENERAL) { kind = 'GENERAL'; cat = 'GENERAL'; } else { kind = 'CAT'; cat = cm.cat.key; } }
  const careOK = !crisis || (mc.hit && mc.hit.care) || (CAT_BY_KEY[cat] && CAT_BY_KEY[cat].care);
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
