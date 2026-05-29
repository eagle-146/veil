/* ───────────────────────────────────────────────
   골방 — Client script
   - Free tier: keyword-matched curated verse response
   - Premium tier: POST /api/meditate (Claude-backed)
   ─────────────────────────────────────────────── */

/* ─────────  VERSE LIBRARY (개역개정)  ───────── */
const VERSES = {
  anger: {
    label: '분노 · 미움',
    keywords: ['분노','화','짜증','미움','증오','복수','원수','싸움','폭언','욱','성질'],
    verses: [
      { ref: '에베소서 4:26-27', text: '분을 내어도 죄를 짓지 말며 해가 지도록 분을 품지 말고 마귀에게 틈을 주지 말라' },
      { ref: '야고보서 1:19-20', text: '사람마다 듣기는 속히 하고 말하기는 더디 하며 성내기도 더디 하라 사람의 성내는 것이 하나님의 의를 이루지 못함이라' },
      { ref: '잠언 15:1', text: '유순한 대답은 분노를 쉬게 하여도 과격한 말은 노를 격동하느니라' },
    ],
    meditation: '분노 자체가 죄는 아닙니다. 그러나 해가 지도록 품은 분노는 마귀에게 틈을 줍니다. 오늘 마음에 일었던 그 불을, 주님의 십자가 보혈 아래 끄도록 내어드리십시오. 나를 노하게 한 그 사람도, 결국은 주님께서 십자가에서 끌어안으신 죄인입니다.',
    prayer: '주님, 제 마음의 노여움이 정의의 옷을 입고 저를 속였습니다. 분을 품은 채 잠들지 않게 하시고, 주께서 저를 용서하신 그 자비로 그 사람을 다시 바라보게 하소서. 예수님의 이름으로 기도합니다. 아멘.',
  },
  pride: {
    label: '교만',
    keywords: ['교만','자만','자랑','우월','무시','업신','잘난','거만','오만','체면'],
    verses: [
      { ref: '잠언 16:18', text: '교만은 패망의 선봉이요 거만한 마음은 넘어짐의 앞잡이니라' },
      { ref: '베드로전서 5:5-6', text: '하나님은 교만한 자를 대적하시되 겸손한 자들에게는 은혜를 주시느니라 그러므로 하나님의 능하신 손 아래에서 겸손하라 때가 되면 너희를 높이시리라' },
      { ref: '빌립보서 2:3', text: '아무 일에든지 다툼이나 허영으로 하지 말고 오직 겸손한 마음으로 각각 자기보다 남을 낫게 여기고' },
    ],
    meditation: '교만은 가장 깊은 곳에서 가장 늦게 발견되는 죄입니다. 다른 죄와 달리 교만은 회개하는 그 순간조차 “나는 교만을 회개한다”라며 자랑할 위험이 있습니다. 오늘 주님 앞에 가장 낮은 자리로 내려가, 십자가만이 자랑이 되도록 그분의 손 아래 머무르십시오.',
    prayer: '주님, 제 안의 높은 것이 주님의 자리를 빼앗고 있었음을 고백합니다. 저를 낮추소서. 그리하여 주님이 높아지시는 날, 저도 그 은혜로 일으켜 주옵소서. 예수님의 이름으로 기도합니다. 아멘.',
  },
  lust: {
    label: '정욕 · 음란',
    keywords: ['음란','정욕','음행','음탕','색','야동','포르노','자위','외도','불륜','육체','성적'],
    verses: [
      { ref: '마태복음 5:28', text: '나는 너희에게 이르노니 음욕을 품고 여자를 보는 자마다 마음에 이미 간음하였느니라' },
      { ref: '고린도전서 6:18-20', text: '음행을 피하라 사람이 범하는 죄마다 몸 밖에 있거니와 음행하는 자는 자기 몸에 죄를 범하느니라 너희 몸은 너희가 하나님께로부터 받은 바 너희 가운데 계신 성령의 전인 줄을 알지 못하느냐' },
      { ref: '데살로니가전서 4:3-4', text: '하나님의 뜻은 이것이니 너희의 거룩함이라 곧 음란을 버리고 각각 거룩함과 존귀함으로 자기의 아내 대할 줄을 알고' },
    ],
    meditation: '정욕은 갈증이 아니라 우상입니다. 하나님이 주실 친밀함을 거짓 형상으로 미리 훔치려는 시도입니다. 도망치십시오(딤후 2:22). 의지로 이기려 하지 말고, 그 자리에 그리스도의 임재로 채우십시오. 회복은 결심이 아니라 새 사랑입니다.',
    prayer: '주님, 제 몸이 성령의 전인 것을 잊고 살았습니다. 죄책감으로 다시 숨지 않게 하시고, 보혈로 씻으신 그 자리에 주님의 임재로 채워주옵소서. 예수님의 이름으로 기도합니다. 아멘.',
  },
  greed: {
    label: '탐심 · 욕심',
    keywords: ['탐심','욕심','돈','재물','부자','소유','집착','사치','명품','과소비','일중독'],
    verses: [
      { ref: '누가복음 12:15', text: '삼가 모든 탐심을 물리치라 사람의 생명이 그 소유의 넉넉한 데 있지 아니하니라' },
      { ref: '디모데전서 6:10', text: '돈을 사랑함이 일만 악의 뿌리가 되나니 이것을 탐내는 자들은 미혹을 받아 믿음에서 떠나 많은 근심으로써 자기를 찔렀도다' },
      { ref: '히브리서 13:5', text: '돈을 사랑하지 말고 있는 바를 족한 줄로 알라 그가 친히 말씀하시기를 내가 결코 너를 떠나지 아니하고 너를 버리지 아니하리라' },
    ],
    meditation: '탐심은 단순히 더 갖고 싶은 마음이 아닙니다. 하나님이 주신 것으로 만족하지 못하는 우상 숭배입니다(골 3:5). 오늘 가장 손에 꼭 쥐고 있던 것을 펴서, 그분께 다시 올려드리십시오. 비울 때 비로소 채워지는 은혜가 있습니다.',
    prayer: '주님, 저의 안전과 자랑을 주님 외의 것에 두려 했음을 회개합니다. 가진 것으로 자족하게 하시고, 주께서 함께하심으로 부요하게 하옵소서. 예수님의 이름으로 기도합니다. 아멘.',
  },
  lie: {
    label: '거짓 · 위선',
    keywords: ['거짓','속','위선','가식','속였','꾸며','험담','뒷담','이중','감추'],
    verses: [
      { ref: '잠언 12:22', text: '거짓 입술은 여호와께 미움을 받아도 진실하게 행하는 자는 그의 기뻐하심을 받느니라' },
      { ref: '에베소서 4:25', text: '그런즉 거짓을 버리고 각각 그 이웃과 더불어 참된 것을 말하라 이는 우리가 서로 지체가 됨이라' },
      { ref: '요한복음 8:32', text: '진리를 알지니 진리가 너희를 자유롭게 하리라' },
    ],
    meditation: '거짓말은 한 번에 끝나지 않습니다. 한 번의 거짓은 그것을 지키기 위한 또 다른 거짓을 낳습니다. 사슬을 풀려면 어느 한 지점에서 진실을 말해야 합니다. 그 자리는 두렵지만, 그 다음의 자유는 거짓이 결코 줄 수 없는 것입니다.',
    prayer: '주님, 저의 입술과 마음 사이가 갈라져 있음을 회개합니다. 진리이신 주님 안에서, 두려워도 진실을 택하는 용기를 주옵소서. 예수님의 이름으로 기도합니다. 아멘.',
  },
  sloth: {
    label: '게으름 · 미루기',
    keywords: ['게으','미루','나태','늦잠','중독','회피','미디어','유튜브','SNS','폰','시간낭비'],
    verses: [
      { ref: '잠언 6:6', text: '게으른 자여 개미에게 가서 그가 하는 것을 보고 지혜를 얻으라' },
      { ref: '골로새서 3:23', text: '무슨 일을 하든지 마음을 다하여 주께 하듯 하고 사람에게 하듯 하지 말라' },
      { ref: '에베소서 5:15-16', text: '그런즉 너희가 어떻게 행할지를 자세히 주의하여 지혜 없는 자같이 하지 말고 오직 지혜 있는 자같이 하여 세월을 아끼라 때가 악하니라' },
    ],
    meditation: '게으름은 단지 일하지 않는 상태가 아니라, 마땅한 자리에 마땅한 일을 미루는 마음의 무거움입니다. 작은 일 하나, 지금 시작하십시오. 의무가 아닌, 주께 드리는 작은 예배로.',
    prayer: '주님, 시간이 주님의 선물임을 잊고 흘려보냈습니다. 오늘 작은 한 걸음을, 주께 하듯 다시 시작하게 하옵소서. 예수님의 이름으로 기도합니다. 아멘.',
  },
  envy: {
    label: '시기 · 비교',
    keywords: ['시기','질투','비교','부러','열등','SNS','인스타','남과','뒤처'],
    verses: [
      { ref: '야고보서 3:16', text: '시기와 다툼이 있는 곳에는 혼란과 모든 악한 일이 있음이라' },
      { ref: '갈라디아서 5:26', text: '헛된 영광을 구하여 서로 노엽게 하거나 서로 투기하지 말지니라' },
      { ref: '시편 73:25-26', text: '하늘에서는 주 외에 누가 내게 있으리요 땅에서는 주 밖에 내가 사모할 이 없나이다 내 육체와 마음은 쇠약하나 하나님은 내 마음의 반석이시요 영원한 분깃이시라' },
    ],
    meditation: '시기는 다른 이의 은혜를 내 결핍의 증거로 읽는 죄입니다. 그러나 하나님은 한 분의 잔을 채우시기 위해 다른 이의 잔을 비우시는 분이 아닙니다. 오늘 그 사람의 복을 진심으로 축복하며 끝맺으십시오. 그 입술이 시기를 깨뜨립니다.',
    prayer: '주님, 다른 이의 은혜를 보며 제가 받은 은혜를 잊었습니다. 비교의 자리에서 감사의 자리로 옮겨주옵소서. 예수님의 이름으로 기도합니다. 아멘.',
  },
  fear: {
    label: '두려움 · 염려',
    keywords: ['두려','겁','불안','걱정','염려','초조','공황','외로','우울','무서'],
    verses: [
      { ref: '이사야 41:10', text: '두려워하지 말라 내가 너와 함께 함이라 놀라지 말라 나는 네 하나님이 됨이라 내가 너를 굳세게 하리라 참으로 너를 도와 주리라 참으로 나의 의로운 오른손으로 너를 붙들리라' },
      { ref: '빌립보서 4:6-7', text: '아무 것도 염려하지 말고 다만 모든 일에 기도와 간구로, 너희 구할 것을 감사함으로 하나님께 아뢰라 그리하면 모든 지각에 뛰어난 하나님의 평강이 그리스도 예수 안에서 너희 마음과 생각을 지키시리라' },
      { ref: '베드로전서 5:7', text: '너희 염려를 다 주께 맡기라 이는 그가 너희를 돌보심이라' },
    ],
    meditation: '두려움 자체는 죄가 아니지만, 두려움이 주님을 신뢰함의 자리를 빼앗을 때 그것은 우상이 됩니다. 염려를 부정하지 마십시오. 그 무게 그대로 주님께 옮겨 드리십시오. 맡긴 그 짐은 다시 가져오지 않으시는 분이십니다.',
    prayer: '주님, 내일을 미리 살며 오늘의 은혜를 잃었습니다. 무거운 짐을 주께 맡기오니, 평강으로 제 마음과 생각을 지켜주옵소서. 예수님의 이름으로 기도합니다. 아멘.',
  },
  unforgive: {
    label: '용서하지 못함',
    keywords: ['용서','미움','원망','상처','꽁','복수','앙심','품','잊혀'],
    verses: [
      { ref: '마태복음 6:14-15', text: '너희가 사람의 잘못을 용서하면 너희 하늘 아버지께서도 너희 잘못을 용서하시려니와 너희가 사람의 잘못을 용서하지 아니하면 너희 아버지께서도 너희 잘못을 용서하지 아니하시리라' },
      { ref: '에베소서 4:32', text: '서로 친절하게 하며 불쌍히 여기며 서로 용서하기를 하나님이 그리스도 안에서 너희를 용서하심과 같이 하라' },
      { ref: '골로새서 3:13', text: '누가 누구에게 불만이 있거든 서로 용납하여 피차 용서하되 주께서 너희를 용서하신 것 같이 너희도 그리하고' },
    ],
    meditation: '용서는 감정의 회복이 아니라 의지의 결단입니다. 그 일이 “괜찮다”는 뜻이 아니라, 그 빚을 더 이상 내가 받지 않고 주께 넘겨드린다는 선언입니다. 한 번에 끝나지 않을 수 있습니다. 일흔 번씩 일곱 번까지(마 18:22), 다시 결단하십시오.',
    prayer: '주님, 제가 받은 용서의 깊이를 잊은 채 그 사람의 빚만 헤아렸습니다. 그 빚을 오늘 주께 넘겨드립니다. 저를 자유롭게 하소서. 예수님의 이름으로 기도합니다. 아멘.',
  },
  prayerless: {
    label: '기도와 말씀의 게으름',
    keywords: ['기도','말씀','성경','예배','신앙','신앙생활','경건','QT','새벽','주일'],
    verses: [
      { ref: '예레미야 2:13', text: '내 백성이 두 가지 악을 행하였나니 곧 그들이 생수의 근원되는 나를 버린 것과 스스로 웅덩이를 판 것인데 그것은 물을 가두지 못할 터진 웅덩이들이니라' },
      { ref: '시편 42:1-2', text: '하나님이여 사슴이 시냇물을 찾기에 갈급함 같이 내 영혼이 주를 찾기에 갈급하니이다 내 영혼이 하나님 곧 살아 계시는 하나님을 갈망하나니 내가 어느 때에 나아가서 하나님의 얼굴을 뵈올까' },
      { ref: '요한복음 15:5', text: '나는 포도나무요 너희는 가지라 그가 내 안에, 내가 그 안에 거하면 사람이 열매를 많이 맺나니 나를 떠나서는 너희가 아무 것도 할 수 없음이라' },
    ],
    meditation: '기도와 말씀이 멀어진 것은 의지의 문제 이전에 갈증의 문제일 수 있습니다. 다른 우물에서 마셔온 것이지요. 책망보다 먼저 갈망을 회복해야 합니다. 오늘 짧은 한 절이라도, 5분의 침묵이라도, 다시 그 자리로 돌아가십시오. 작게, 그러나 끊지 않고.',
    prayer: '주님, 생수의 근원을 떠나 터진 웅덩이를 팠습니다. 다시 사슴처럼 주님을 갈망하는 마음을 주옵소서. 작은 한 걸음을 오늘 시작합니다. 예수님의 이름으로 기도합니다. 아멘.',
  },
  general: {
    label: '회개',
    keywords: [],
    verses: [
      { ref: '요한일서 1:9', text: '만일 우리가 우리 죄를 자백하면 그는 미쁘시고 의로우사 우리 죄를 사하시며 우리를 모든 불의에서 깨끗하게 하실 것이요' },
      { ref: '시편 51:10-12', text: '하나님이여 내 속에 정한 마음을 창조하시고 내 안에 정직한 영을 새롭게 하소서 나를 주 앞에서 쫓아내지 마시며 주의 성령을 내게서 거두지 마소서 주의 구원의 즐거움을 내게 회복시키시고 자원하는 심령을 주사 나를 붙드소서' },
      { ref: '이사야 1:18', text: '여호와께서 말씀하시되 오라 우리가 서로 변론하자 너희의 죄가 주홍 같을지라도 눈과 같이 희어질 것이요 진홍 같이 붉을지라도 양털 같이 되리라' },
      { ref: '누가복음 15:20', text: '이에 일어나서 아버지께로 돌아가니라 아직도 거리가 먼데 아버지가 그를 보고 측은히 여겨 달려가 목을 안고 입을 맞추니' },
    ],
    meditation: '회개의 자리는 정죄의 자리가 아닙니다. 아직 거리가 먼데도 달려나오시는 아버지의 품 안입니다. 자백한 죄는 이미 사하셨습니다. 일어나십시오. 죄책감의 옷이 아니라, 다시 입혀주신 가장 좋은 옷으로(눅 15:22).',
    prayer: '아버지, 죄로 인해 멀어진 것은 저였으나, 먼저 달려오신 분은 주님이셨습니다. 보혈로 씻으신 자리에서 다시 자녀로 일어섭니다. 자원하는 심령으로 주님을 따르게 하소서. 예수님의 이름으로 기도합니다. 아멘.',
  },
};

/* ─────────  KEYWORD MATCH (free tier)  ───────── */
function matchCategory(text) {
  if (!text) return 'general';
  const lower = text.toLowerCase();
  let best = { key: 'general', score: 0 };
  for (const [key, data] of Object.entries(VERSES)) {
    if (key === 'general') continue;
    let score = 0;
    for (const kw of data.keywords) {
      if (lower.includes(kw.toLowerCase())) score += 1;
    }
    if (score > best.score) best = { key, score };
  }
  return best.key;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildFreeResponse(text) {
  const key = matchCategory(text);
  const cat = VERSES[key];
  const verse = pick(cat.verses);
  return {
    tier: 'free',
    category: cat.label,
    verse,
    meditation: cat.meditation,
    prayer: cat.prayer,
  };
}

/* ─────────  PREMIUM TIER (Claude API)  ─────────
   Tries the deployed serverless endpoint (api/meditate.js → Claude).
   When no backend is reachable (opened as a static file / no `vercel dev`),
   falls back to a richer CLIENT-SIDE DEMO so the 동행 difference is visible. */
async function buildPremiumResponse(text) {
  try {
    const res = await fetch('/api/meditate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confession: text }),
    });
    if (!res.ok) throw new Error('서버 응답 오류');
    return await res.json();
  } catch (e) {
    console.warn('[meditate] API 미연결 — 데모 프리미엄으로 응답합니다.', e);
    return buildPremiumDemo(text);
  }
}

/* Richer local stand-in for the AI response (no server required). */
function buildPremiumDemo(text) {
  const key = matchCategory(text);
  const cat = VERSES[key];
  const verse = pick(cat.verses);
  const snippet = text.trim().replace(/\s+/g, ' ').slice(0, 28);
  const meditation =
    `${cat.meditation} 오늘 적어 주신 마음(“${snippet}…”)을 주님은 이미 다 아시고, 정죄가 아니라 회복의 자리로 부르십니다. ` +
    `이 죄의 뿌리를 깊이 들여다보면 결국 ‘스스로 주인 되려는 마음’과 닿아 있습니다. 그 자리를 오늘 그리스도께 다시 내어드리십시오.`;
  const prayer =
    `${cat.prayer.replace(/ 아멘\.$/, '')} 제가 적은 그 구체적인 자리에까지 주님의 보혈이 임하게 하시고, ` +
    `오늘 하루 이 마음을 다시 붙드시는 성령님을 의지하게 하소서. 예수님의 이름으로 기도합니다. 아멘.`;
  return {
    tier: 'premium',
    demo: true,
    category: cat.label,
    verse,
    meditation,
    prayer,
    application: '오늘 잠들기 전, 이 자백을 한 문장으로 다시 주님께 아뢰기.',
  };
}

/* ─────────  USER TIER STATE  ───────── */
const tierState = {
  isPremium() { return localStorage.getItem('golbang.tier') === 'premium'; },
  setPremium(on) { localStorage.setItem('golbang.tier', on ? 'premium' : 'free'); },
};

/* ─────────  FREE DAILY LIMIT  ───────── */
const FREE_LIMIT = 1;
function getFreeUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const data = JSON.parse(localStorage.getItem('golbang.usage') || '{}');
  return data[today] || 0;
}
function incFreeUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const data = JSON.parse(localStorage.getItem('golbang.usage') || '{}');
  data[today] = (data[today] || 0) + 1;
  localStorage.setItem('golbang.usage', JSON.stringify(data));
}

/* ─────────  STEP NAVIGATION  ───────── */
const steps = document.querySelectorAll('.app-step');
const appCard = document.querySelector('.app-card');
let currentStep = 1;
function goTo(n) {
  if (appCard) appCard.classList.toggle('is-back', n < currentStep);
  currentStep = n;
  steps.forEach(s => s.classList.toggle('is-active', +s.dataset.step === n));
  appCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => goTo(2)));
document.querySelectorAll('[data-prev]').forEach(b => b.addEventListener('click', () => goTo(1)));

/* ─────────  CHIPS → seed textarea  ───────── */
const SEED = {
  anger:      '주님, 오늘 ___에게 분노가 일어났습니다. 마음에 미움이 자리잡았고, 해가 지도록 풀지 못했습니다.',
  pride:      '주님, 제 마음에 교만이 있음을 봅니다. ___의 자리에서 저를 높이고 다른 이를 낮춰 보았습니다.',
  lust:       '주님, 정욕에 굴복하였습니다. 눈과 마음을 지키지 못하고 ___로 갔습니다.',
  greed:      '주님, 가진 것에 만족하지 못하고 ___을(를) 끝없이 갈망했습니다. 돈과 소유가 제 마음의 주인이 되었습니다.',
  lie:        '주님, ___에게 거짓을 말했습니다. 진실을 두려워하고 저를 꾸미려 했습니다.',
  sloth:      '주님, 마땅히 해야 할 ___을(를) 미루었습니다. 시간을 흘려보내며 주께서 맡기신 자리를 비웠습니다.',
  envy:       '주님, ___의 모습을 보며 시기와 비교에 사로잡혔습니다. 받은 은혜를 잊었습니다.',
  fear:       '주님, ___에 대한 두려움이 제 마음을 점령했습니다. 주님을 신뢰하지 못했습니다.',
  unforgive:  '주님, ___을(를) 용서하지 못합니다. 그 상처가 아직 살아있어 마음에서 놓아주지 못합니다.',
  prayerless: '주님, 기도와 말씀에서 멀어졌습니다. ___에 시간을 쓰며 주님의 얼굴 구하기를 게을리하였습니다.',
};

const textarea = document.getElementById('confession-input');
const charCount = document.getElementById('char-count');

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const key = chip.dataset.prompt;
    const seed = SEED[key];
    if (seed && textarea) {
      textarea.value = (textarea.value ? textarea.value + '\n\n' : '') + seed;
      textarea.focus();
      const len = textarea.value.length;
      textarea.setSelectionRange(len, len);
      updateCount();
    }
    chip.classList.add('is-selected');
  });
});

function updateCount() {
  if (charCount && textarea) charCount.textContent = textarea.value.length;
}
textarea?.addEventListener('input', updateCount);

/* ─────────  SUBMIT & RESPONSE  ───────── */
const loadingMessages = [
  '말씀을 펼치고 있어요.',
  '주님 앞에 그 마음을 가지고 갑니다.',
  '적합한 본문을 찾고 있어요.',
  '잠시 함께 침묵하십시다.',
];

document.getElementById('submit-confession')?.addEventListener('click', async () => {
  const text = textarea.value.trim();
  if (!text) {
    textarea.focus();
    textarea.style.borderColor = 'var(--gold)';
    setTimeout(() => textarea.style.borderColor = '', 1200);
    return;
  }

  const wantPremium = document.getElementById('opt-detailed').checked;
  const usePremium = wantPremium && tierState.isPremium();

  // Free tier daily limit check
  if (!usePremium && !tierState.isPremium() && getFreeUsage() >= FREE_LIMIT) {
    if (confirm('오늘 무료 회개는 사용하셨습니다.\n동행 멤버십에서는 무제한으로 깊은 묵상을 받으실 수 있습니다.\n\n멤버십을 살펴보시겠습니까?')) {
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
    }
    return;
  }

  goTo(3);

  // animate loading message
  const msgEl = document.getElementById('loading-msg');
  let mi = 0;
  const msgTimer = setInterval(() => {
    mi = (mi + 1) % loadingMessages.length;
    if (msgEl) msgEl.textContent = loadingMessages[mi];
  }, 1800);

  let response;
  try {
    if (usePremium) {
      response = await buildPremiumResponse(text);
    } else {
      // simulate gentle wait (don't rush the sacred moment)
      await new Promise(r => setTimeout(r, 2200));
      response = buildFreeResponse(text);
      incFreeUsage();
    }
  } catch (e) {
    console.error(e);
    // graceful fallback to free response
    response = buildFreeResponse(text);
    response.tier = 'free-fallback';
  } finally {
    clearInterval(msgTimer);
  }

  renderResponse(response);
  goTo(4);
});

function renderResponse(r) {
  document.getElementById('resp-verse-text').textContent = `“${r.verse.text}”`;
  document.getElementById('resp-verse-ref').textContent  = `— ${r.verse.ref}`;
  document.getElementById('resp-meditation').textContent = r.meditation;
  document.getElementById('resp-prayer').textContent     = r.prayer;

  const applyBlock = document.getElementById('resp-apply-block');
  if (r.application) {
    document.getElementById('resp-application').textContent = r.application;
    applyBlock.hidden = false;
  } else {
    applyBlock.hidden = true;
  }

  const tierBanner = document.getElementById('tier-banner');
  const icoSeal = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" style="vertical-align:-3px;margin-right:7px"><path d="M8 1.6l1.7 4.7H14l-3.5 2.7 1.3 4.7L8 10.9 4.2 13.7l1.3-4.7L2 6.3h4.3z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const icoWarn = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" style="vertical-align:-3px;margin-right:7px"><path d="M8 2.2 1.6 13.4h12.8z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6.6v3.1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8" cy="11.5" r=".7" fill="currentColor"/></svg>';
  const icoGate = '<svg width="15" height="15" viewBox="0 0 64 64" fill="currentColor" style="vertical-align:-3px;margin-right:7px"><path d="M14 13 H50 a2.4 2.4 0 0 1 2.34 2.92 L49.3 49.1 A2.4 2.4 0 0 1 46.96 51 H42 a2 2 0 0 1 -1.95 -2.44 C41.6 42 33.9 24.6 32 21 C30.1 24.6 22.4 42 23.95 48.56 A2 2 0 0 1 22 51 H17.04 A2.4 2.4 0 0 1 14.7 49.1 L11.66 15.92 A2.4 2.4 0 0 1 14 13 Z"/></svg>';
  if (r.tier === 'premium') {
    tierBanner.className = 'response-tier tier-premium';
    tierBanner.innerHTML = icoSeal + '<strong>동행 멤버십</strong> — 당신의 자백에 맞춰 빚은 묵상입니다.'
      + (r.demo ? ' <span style="opacity:.7">(데모 · 실제 AI 묵상은 서버 배포 후)</span>' : '');
  } else if (r.tier === 'free-fallback') {
    tierBanner.className = 'response-tier tier-free';
    tierBanner.innerHTML = icoWarn + '맞춤 묵상 연결에 문제가 있어 큐레이션 응답으로 대신했습니다.';
  } else {
    tierBanner.className = 'response-tier tier-free';
    tierBanner.innerHTML = `${icoGate}<strong>${r.category}</strong>의 자리. 깊은 맞춤 묵상은 <a href="#pricing" style="color:var(--gold);text-decoration:underline;">동행 멤버십</a>에서 받으실 수 있습니다.`;
  }
}

/* ─────────  RESPONSE ACTIONS  ───────── */
document.getElementById('btn-restart')?.addEventListener('click', () => {
  textarea.value = '';
  updateCount();
  goTo(1);
});

document.getElementById('btn-amen')?.addEventListener('click', () => {
  textarea.value = '';
  updateCount();
  goTo(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('btn-save')?.addEventListener('click', (e) => {
  if (!tierState.isPremium()) {
    e.preventDefault();
    if (confirm('회개 일기는 동행 멤버십의 기능입니다.\n멤버십을 살펴보시겠습니까?')) {
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
    }
  } else {
    // In a real app: POST to /api/journal
    alert('회개 일기에 저장되었습니다.');
  }
});

/* ─────────  PLAN BUTTONS (mock checkout)  ───────── */
document.querySelectorAll('[data-plan]').forEach(btn => {
  btn.addEventListener('click', () => {
    const plan = btn.dataset.plan;
    if (confirm(`[데모] ${plan === 'companion' ? '동행' : '가정'} 멤버십 결제로 이동합니다.\n실제 결제 연동(토스페이먼츠/스트라이프) 전까지는 데모 모드로 활성화됩니다.\n\n계속하시겠습니까?`)) {
      tierState.setPremium(true);
      alert('데모 모드에서 멤버십이 활성화되었습니다.\n이제 "맞춤 묵상으로 받기" 옵션을 체크하면 Claude API가 호출됩니다.\n(api/meditate.js 배포 후)');
    }
  });
});

/* ─────────  SCROLL REVEAL  ───────── */
const reveals = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('is-visible');
      io.unobserve(e.target);
    }
  }
}, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
reveals.forEach(el => io.observe(el));

/* ─────────  NAV SCROLL STATE  ───────── */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 12);
}, { passive: true });

/* ─────────  BREATHING TEXT CYCLE  ───────── */
const breathText = document.querySelector('.breath-text');
if (breathText) {
  const phrases = ['들이쉬세요', '잠시 머무세요', '내쉬세요', '주님 앞에 머무세요'];
  let bi = 0;
  setInterval(() => {
    bi = (bi + 1) % phrases.length;
    breathText.textContent = phrases[bi];
  }, 3500);
}

/* ─────────  SCROLL PROGRESS LINE  ───────── */
const navProgress = document.getElementById('nav-progress');
if (navProgress) {
  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    navProgress.style.transform = `scaleX(${p})`;
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
}

/* ─────────  SCROLL-SPY (active nav link)  ───────── */
const navLinkMap = new Map();
document.querySelectorAll('.nav-links a').forEach(a => {
  const id = a.getAttribute('href');
  if (id && id.startsWith('#') && id.length > 1) navLinkMap.set(id.slice(1), a);
});
const spyTargets = [...navLinkMap.keys()].map(id => document.getElementById(id)).filter(Boolean);
if (spyTargets.length) {
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        navLinkMap.forEach(a => a.classList.remove('is-current'));
        navLinkMap.get(e.target.id)?.classList.add('is-current');
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  spyTargets.forEach(t => spy.observe(t));
}

/* ─────────  MOBILE NAV SHEET  ───────── */
const navSheet = document.getElementById('nav-sheet');
const navToggle = document.getElementById('nav-toggle');
const navSheetClose = document.getElementById('nav-sheet-close');
function openSheet() {
  navSheet?.classList.add('open');
  navSheet?.setAttribute('aria-hidden', 'false');
  navToggle?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('nav-open');
}
function closeSheet() {
  navSheet?.classList.remove('open');
  navSheet?.setAttribute('aria-hidden', 'true');
  navToggle?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('nav-open');
}
navToggle?.addEventListener('click', openSheet);
navSheetClose?.addEventListener('click', closeSheet);
navSheet?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeSheet));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ─────────  VEIL-TEAR SIGNATURE (Matt 27:51)  ───────── */
const veilTear = document.querySelector('.veil-tear');
if (veilTear) {
  const vio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('torn'); vio.unobserve(e.target); }
    }
  }, { threshold: 0.45 });
  vio.observe(veilTear);
}

/* ─────────  LANGUAGE SWITCH (demo)  ───────── */
document.querySelectorAll('.lang-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-opt').forEach(b => b.classList.remove('is-current'));
    btn.classList.add('is-current');
  });
});
