/* ───────────────────────────────────────────────
   골방 — Client script
   - Free tier: keyword-matched curated verse response
   - Premium tier: POST /api/meditate (Claude-backed)
   ─────────────────────────────────────────────── */

/* 회개 응답 데이터는 confession-data.js (window.CONFESSION_DATA) 로 분리되었습니다.
   신학 자문이 코드 없이 편집할 수 있도록 한 콘텐츠 파일입니다. */

/* ─────────  CURATED RESPONSE (사람이 작성·검수한 데이터셋)  ─────────
   데이터: confession-data.js (window.CONFESSION_DATA). 실시간 AI 미사용 →
   교리 안전 + 프라이버시(고백 내용이 기기 밖으로 나가지 않음). */
const DATA = (window.CONFESSION_DATA && window.CONFESSION_DATA.categories) || [];
const GENERAL = (window.CONFESSION_DATA && window.CONFESSION_DATA.general) || null;

/* 구체적 고백 사례 100선 (confession-cases.js). 카테고리보다 먼저, 더 정밀하게 매칭한다. */
const CASES = (window.CONFESSION_CASES) || [];
const CAT_BY_KEY = {};
DATA.forEach(c => { CAT_BY_KEY[c.key] = c; });
function catLabel(key) { return CAT_BY_KEY[key] ? CAT_BY_KEY[key].label : '회개'; }
function careForCat(key) { return CAT_BY_KEY[key] ? (CAT_BY_KEY[key].care || null) : null; }

/* 키워드 가중 점수: 긴(구체적) 구가 짧은 단어보다 크게 기여 */
function scoreKeywords(lower, keywords) {
  let s = 0;
  for (const kw of (keywords || [])) {
    if (kw && lower.includes(kw.toLowerCase())) s += Math.max(2, kw.length);
  }
  return s;
}

/* 100개 사례 중 가장 구체적으로 일치하는 항목(임계점 이상)을 고른다. 없으면 null → 카테고리 폴백. */
function matchCase(text) {
  if (!text || !CASES.length) return null;
  const lower = text.toLowerCase();
  let best = null, bestScore = 0;
  for (const c of CASES) {
    const s = scoreKeywords(lower, c.keywords);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return bestScore >= 4 ? best : null;
}

function matchCategory(text) {
  if (!text || !DATA.length) return GENERAL;
  const lower = text.toLowerCase();
  let best = null, bestScore = 0;
  for (const cat of DATA) {
    let score = 0;
    for (const kw of (cat.keywords || [])) {
      if (kw && lower.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return bestScore > 0 ? best : GENERAL;
}

/* 같은 항목이 연속으로 반복되지 않도록 회전하며 무작위 선택 */
function pickRotating(arr, memKey) {
  if (!arr || !arr.length) return null;
  if (arr.length === 1) return arr[0];
  let last = -1;
  try { last = parseInt(localStorage.getItem('veil.rot.' + memKey), 10); } catch {}
  let i = Math.floor(Math.random() * arr.length);
  if (i === last) i = (i + 1) % arr.length;
  try { localStorage.setItem('veil.rot.' + memKey, String(i)); } catch {}
  return arr[i];
}

function buildResponse(text) {
  // 1) 구체적 고백 사례(100선)에 정밀 매칭되면 그 맞춤 응답을 그대로 사용
  const matched = matchCase(text);
  if (matched) {
    return {
      tier: 'free',
      category: catLabel(matched.cat),
      verse: matched.verse,
      meditation: matched.meditation,
      prayer: matched.prayer,
      application: matched.application,
      care: matched.care || careForCat(matched.cat),
    };
  }
  // 2) 폴백: 18개 카테고리(변이 회전) → general
  const cat = matchCategory(text) || GENERAL;
  return {
    tier: 'free',
    category: cat.label,
    verse: pickRotating(cat.verses, cat.key + '.v'),
    meditation: pickRotating(cat.meditations, cat.key + '.m'),
    prayer: pickRotating(cat.prayers, cat.key + '.p'),
    application: pickRotating(cat.applications, cat.key + '.a'),
    care: cat.care || null,
  };
}

/* ─────────  USER TIER STATE  ───────── */
const tierState = {
  isPremium() { return localStorage.getItem('golbang.tier') === 'premium'; },
  setPremium(on) { localStorage.setItem('golbang.tier', on ? 'premium' : 'free'); },
};

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

  goTo(3);

  // animate loading message
  const msgEl = document.getElementById('loading-msg');
  let mi = 0;
  const msgTimer = setInterval(() => {
    mi = (mi + 1) % loadingMessages.length;
    if (msgEl) msgEl.textContent = loadingMessages[mi];
  }, 1800);

  // 거룩한 순간을 서두르지 않도록 잠시 머무릅니다 (응답은 기기 안에서 즉시 준비됨)
  await new Promise(r => setTimeout(r, 2000));
  clearInterval(msgTimer);

  renderResponse(buildResponse(text));
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
  const icoGate = '<svg width="15" height="15" viewBox="0 0 64 64" fill="currentColor" style="vertical-align:-3px;margin-right:7px"><path d="M14 13 H50 a2.4 2.4 0 0 1 2.34 2.92 L49.3 49.1 A2.4 2.4 0 0 1 46.96 51 H42 a2 2 0 0 1 -1.95 -2.44 C41.6 42 33.9 24.6 32 21 C30.1 24.6 22.4 42 23.95 48.56 A2 2 0 0 1 22 51 H17.04 A2.4 2.4 0 0 1 14.7 49.1 L11.66 15.92 A2.4 2.4 0 0 1 14 13 Z"/></svg>';
  tierBanner.className = 'response-tier tier-free';
  tierBanner.innerHTML = `${icoGate}<strong>${r.category}</strong>의 자리. 이 은혜를 <a href="tools.html#gratitude" style="color:var(--gold);text-decoration:underline;">감사일기</a>에 남겨 두면 다시 펴 볼 수 있어요.`;

  const careEl = document.getElementById('resp-care');
  if (careEl) {
    if (r.care) { careEl.textContent = r.care; careEl.hidden = false; }
    else careEl.hidden = true;
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
      alert('데모 모드에서 동행 멤버십이 활성화되었습니다.\n무제한 회개와 멤버 전용 도구를 둘러보실 수 있어요.\n실제 결제 연동은 준비 중입니다.');
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
