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

/* 보충 데이터셋 병합 — confession-extra*.js(단일 객체 CONFESSION_EXTRA + 누적 배열 CONFESSION_EXTRAS).
   응답 회전 풀을 키워 반복감↓. 라우팅엔 영향 없음. 새 라운드는 파일만 추가하면 자동 병합. */
{
  const _exs = [];
  if (window.CONFESSION_EXTRA) _exs.push(window.CONFESSION_EXTRA);
  if (Array.isArray(window.CONFESSION_EXTRAS)) _exs.push(...window.CONFESSION_EXTRAS);
  for (const ex of _exs) for (const cat of DATA) {
    const e = ex[cat.key]; if (!e) continue;
    for (const fld of ['verses', 'meditations', 'prayers', 'applications'])
      if (Array.isArray(e[fld]) && Array.isArray(cat[fld])) cat[fld].push(...e[fld]);
  }
}
function catLabel(key) { return CAT_BY_KEY[key] ? CAT_BY_KEY[key].label : '회개'; }
function careForCat(key) { return CAT_BY_KEY[key] ? (CAT_BY_KEY[key].care || null) : null; }

/* ── 의미 유사도 매칭: 글자 bigram 겹침 + 키워드 정밀 보정 ──
   기존 키워드 substring 방식은 표현이 조금만 달라도 빗나가 GENERAL로 떨어졌다
   (실측: 자유서술 고백의 약 87%가 일반/엉뚱 응답). bigram 유사도로 "의미가 가까운"
   사례를 고르고, 키워드가 정확히 들어오면 가산해 정밀도를 높인다.
   온디바이스 순수 JS → 비용 0, 고백이 기기 밖으로 나가지 않음(프라이버시 유지). */
function _norm(s) { return (s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ''); }
function _bigrams(s) {
  const n = _norm(s); const set = new Set();
  if (n.length === 1) set.add(n);
  for (let i = 0; i < n.length - 1; i++) set.add(n.slice(i, i + 2));
  return set;
}
function _overlap(a, b) { if (!a.size || !b.size) return 0; let c = 0; for (const x of a) if (b.has(x)) c++; return c / Math.min(a.size, b.size); }
function _kwHits(lower, kws) { let h = 0; for (const k of (kws || [])) if (k && lower.includes(k.toLowerCase())) h++; return h; }

/* 사례·카테고리의 bigram을 1회 precompute (200사례 ≈ 즉시) */
const CASE_BG = CASES.map(c => ({ c, bg: _bigrams((c.situation || '') + ' ' + (c.keywords || []).join(' ')) }));
const CAT_BG = DATA.map(cat => ({ cat, bg: _bigrams((cat.label || '') + ' ' + (cat.keywords || []).join(' ')) }));

function _catKw(k) { return (CAT_BY_KEY[k] && CAT_BY_KEY[k].keywords) || []; }

/* 2단계 매칭(개발 자동화로 검증, tools/confession-eval.mjs):
   ① 정제된 카테고리 키워드로 '유력 카테고리'를 먼저 판정
   ② 전체 최고 사례를 찾되, 유력 카테고리와 다르면 그 카테고리 내 최고 사례로 교정
   → 무관한 사례가 우연히 bigram 겹쳐 엉뚱하게 매칭되던 오라우팅을 해소. */
function matchCase(text) {
  if (!text || !CASE_BG.length) return null;
  const q = _bigrams(text), lower = text.toLowerCase();
  let topCat = null, topCatScore = 0;
  for (const { cat, bg } of CAT_BG) { const s = _overlap(q, bg) + _kwHits(lower, cat.keywords) * 0.12; if (s > topCatScore) { topCatScore = s; topCat = cat; } }
  let best = null, bs = 0, bestIn = null, bsIn = 0;
  for (const { c, bg } of CASE_BG) {
    const s = _overlap(q, bg) + Math.min(0.20, _kwHits(lower, c.keywords) * 0.07) + Math.min(0.18, _kwHits(lower, _catKw(c.cat)) * 0.06);
    if (s > bs) { bs = s; best = c; }
    if (topCat && c.cat === topCat.key && s > bsIn) { bsIn = s; bestIn = c; }
  }
  if (topCat && topCatScore >= 0.16 && bestIn && best && best.cat !== topCat.key) return bestIn;
  return bs >= 0.20 ? best : null;
}

function matchCategory(text) {
  if (!text || !CAT_BG.length) return GENERAL;
  const q = _bigrams(text), lower = text.toLowerCase();
  let best = null, bestScore = 0;
  for (const { cat, bg } of CAT_BG) {
    const s = _overlap(q, bg) + Math.min(0.20, _kwHits(lower, cat.keywords) * 0.07);
    if (s > bestScore) { bestScore = s; best = cat; }
  }
  return bestScore >= 0.12 ? best : GENERAL;
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

/* 동행(유료) 멤버 전용 — 고백을 서버 AI(/api/meditate, Gemini)로 보내 맞춤 묵상을 받는다.
   ⚠ 프라이버시: 무료 응답은 기기 밖으로 나가지 않는다. 이 호출은 멤버가 결과 화면에서
   '직접 버튼을 눌렀을 때만'(명시적 동의) 실행된다. 위기 care 안내는 로컬에서 계산해 항상 유지. */
async function fetchPremiumMeditation(text) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch('/api/meditate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confession: text }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if (!d || !d.meditation || !d.prayer || !d.verse || !d.verse.text) throw new Error('malformed');
    return {
      category: d.category || (lastResp && lastResp.category) || '회개',
      verse: d.verse,
      meditation: d.meditation,
      prayer: d.prayer,
      application: d.application || null,
    };
  } finally { clearTimeout(timer); }
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
  anger:      '주님, ___에게 분노와 미움이 일어났습니다. 그를 아직 용서하지 못하고, 해가 지도록 마음에 품고 있습니다.',
  pride:      '주님, 제 마음에 교만이 있음을 봅니다. ___의 자리에서 저를 높이고, 다른 이를 시기하며 비교했습니다.',
  lust:       '주님, 정욕과 탐심에 굴복하였습니다. 눈과 마음을 지키지 못하고, 더 갖고 더 누리려 ___로 갔습니다.',
  greed:      '주님, 가진 것에 만족하지 못하고 ___을(를) 끝없이 갈망했습니다. 돈과 소유가 제 마음의 주인이 되었습니다.',
  lie:        '주님, ___에게 거짓을 말했습니다. 진실을 두려워하고 저를 꾸미려 했습니다.',
  sloth:      '주님, 마땅히 해야 할 ___을(를) 미루고, 기도와 말씀에서도 멀어졌습니다. 주님의 얼굴 구하기를 게을리했습니다.',
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
/* 책장에서 해당 책을 뽑아 촤르륵 펼쳐 구절을 찾는 연출 (응답은 기기 안에서 즉시 준비됨) */
const SHELF_HEIGHTS = [78, 104, 90, 120, 86, 112, 96, 128, 82, 116, 100];
const SHELF_TARGET = 5;
function bssDelay(ms) { return new Promise(r => setTimeout(r, ms)); }
function bssCaption(t) { const c = document.getElementById('bss-caption'); if (c) c.textContent = t; }
async function runBookSearch(bookName, refText) {
  const scene = document.getElementById('book-search');
  if (!scene) { await bssDelay(1400); return; }
  scene.classList.remove('target-on', 'to-book', 'flip', 'found');
  const shelf = document.getElementById('bss-shelf');
  if (shelf) shelf.innerHTML = SHELF_HEIGHTS.map((h, i) =>
    `<div class="sp${i === SHELF_TARGET ? ' is-target' : ''}" style="height:${h}px">${i === SHELF_TARGET ? `<span class="sp-name">${bookName}</span>` : ''}</div>`).join('');
  const flipper = document.getElementById('bss-flipper');
  if (flipper) flipper.innerHTML = Array.from({ length: 7 }, () => '<div class="pg"></div>').join('');
  const refEl = document.getElementById('bss-found-ref');
  if (refEl) refEl.textContent = refText || '';
  bssCaption('말씀의 자리를 찾고 있어요');
  void scene.offsetWidth;                                   // reflow so transitions apply
  await bssDelay(420);
  scene.classList.add('target-on');
  bssCaption(`${bookName} 말씀을 펼칩니다`);
  await bssDelay(880);
  scene.classList.add('to-book');
  await bssDelay(540);
  scene.classList.add('flip');
  bssCaption('말씀을 한 장 한 장 넘깁니다');
  await bssDelay(1200);
  scene.classList.add('found');
  bssCaption('말씀을 찾았습니다');
  await bssDelay(760);
}

let lastResp = null, lastText = '';
document.getElementById('submit-confession')?.addEventListener('click', async () => {
  const text = textarea.value.trim();
  if (!text) {
    textarea.focus();
    textarea.style.borderColor = 'var(--gold)';
    setTimeout(() => textarea.style.borderColor = '', 1200);
    return;
  }

  goTo(3);

  const resp = buildResponse(text);
  lastResp = resp; lastText = text;
  const ref = (resp.verse && resp.verse.ref) ? resp.verse.ref : '말씀';
  const book = ref.trim().split(/\s+/)[0] || '말씀';

  await runBookSearch(book, ref);

  renderResponse(resp);
  goTo(4);
  updateJournalAcct();
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
  const icoStar = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px;margin-right:7px"><path d="M12 2.2l2.3 6.5 6.7.3-5.3 4.2 1.9 6.6L12 16.3 6.4 20.1l1.9-6.6L3 9.3l6.7-.3L12 2.2z"/></svg>';
  const premiumBlock = document.getElementById('premium-ai');
  const aiBtn = document.getElementById('btn-ai-meditate');
  const aiStatus = document.getElementById('ai-status');

  if (r.tier === 'premium') {
    tierBanner.className = 'response-tier tier-premium';
    tierBanner.innerHTML = `${icoStar}<strong>${r.category}</strong> · 동행 멤버를 위한 AI 맞춤 묵상이에요.`;
    if (premiumBlock) {
      premiumBlock.hidden = false;
      if (aiBtn) aiBtn.hidden = true;                       // 이미 AI 묵상을 받음 → 버튼 숨김
      if (aiStatus) { aiStatus.hidden = false; aiStatus.className = 'premium-ai-status is-done'; aiStatus.textContent = '✓ 이 고백을 깊이 읽고 빚어진 묵상입니다.'; }
    }
  } else {
    tierBanner.className = 'response-tier tier-free';
    tierBanner.innerHTML = `${icoGate}<strong>${r.category}</strong>의 자리. 이 은혜를 <a href="tools.html#gratitude" style="color:var(--gold);text-decoration:underline;">감사일기</a>에 남겨 두면 다시 펴 볼 수 있어요.`;
    if (premiumBlock) {
      if (tierState.isPremium()) {                          // 멤버 → 로컬 응답 위에 AI 묵상 받기 제안
        premiumBlock.hidden = false;
        if (aiBtn) { aiBtn.hidden = false; aiBtn.disabled = false; }
        if (aiStatus) { aiStatus.hidden = true; aiStatus.textContent = ''; aiStatus.className = 'premium-ai-status'; }
      } else {
        premiumBlock.hidden = true;                         // 무료 사용자 → AI 옵션 미노출
      }
    }
  }

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
  goTo(2);
});

document.getElementById('btn-amen')?.addEventListener('click', () => {
  textarea.value = '';
  updateCount();
  goTo(2);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('btn-save')?.addEventListener('click', () => {
  const A = window.Veil && Veil.auth;
  if (!A || !A.current()) {                        // 계정에 보관하려면 로그인
    if (A) A.openModal('login');
    return;
  }
  if (!lastResp) return;
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  const journal = Veil.store.get('veil.confession.journal', []);
  journal.unshift({
    at: now.toISOString(), date,
    category: lastResp.category || '회개',
    verseRef: lastResp.verse ? lastResp.verse.ref : '',
    confession: lastText,
  });
  Veil.store.set('veil.confession.journal', journal);
  const btn = document.getElementById('btn-save');
  const orig = btn.innerHTML;
  btn.innerHTML = '✓ 계정에 저장됨';
  setTimeout(() => { btn.innerHTML = orig; }, 1900);
  updateJournalAcct();
});

/* ─────────  PREMIUM AI MEDITATION (동행 멤버, 명시적 동의 후 호출)  ───────── */
document.getElementById('btn-ai-meditate')?.addEventListener('click', async () => {
  if (!lastText) return;
  const aiBtn = document.getElementById('btn-ai-meditate');
  const aiStatus = document.getElementById('ai-status');
  if (aiBtn) aiBtn.disabled = true;
  if (aiStatus) { aiStatus.hidden = false; aiStatus.className = 'premium-ai-status'; aiStatus.textContent = '주님 앞에서 이 고백을 깊이 읽고 묵상을 빚고 있어요…'; }
  try {
    const ai = await fetchPremiumMeditation(lastText);
    const merged = { ...ai, tier: 'premium', care: (lastResp && lastResp.care) || null };  // 위기 care는 로컬값 유지
    lastResp = merged;                                   // 일기 저장도 새 응답 기준
    renderResponse(merged);
  } catch (e) {
    if (aiStatus) { aiStatus.className = 'premium-ai-status is-error'; aiStatus.textContent = '지금은 AI 묵상을 불러오지 못했어요. 기기 안의 말씀으로도 충분히 주님과 만나실 수 있습니다.'; }
    if (aiBtn) aiBtn.disabled = false;
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

/* ─────────  ACCOUNT (login + 계정별 회개 일기 안내)  ───────── */
function updateJournalAcct() {
  const el = document.getElementById('journal-acct');
  if (!el) return;
  const u = (window.Veil && Veil.auth.current()) || null;
  if (u) {
    const n = (Veil.store.get('veil.confession.journal', []) || []).length;
    el.textContent = `${u.name || u.email} 계정에 저장됩니다${n ? ` · 지금까지 ${n}개 보관 중` : ''}`;
  } else {
    el.textContent = '로그인하면 이 회개 일기를 내 계정에 보관할 수 있어요.';
  }
  el.hidden = false;
}
if (window.Veil && Veil.auth) {
  Veil.auth.mountControl(document.getElementById('auth-slot'));
  Veil.auth.mountControl(document.getElementById('auth-slot-m'));
  Veil.auth.onChange(updateJournalAcct);
  updateJournalAcct();
}
