/* ───────────────────────────────────────────────
   Veil — 은혜의 도구 (Tools dashboard) logic
   All client-side (localStorage). Freemium gated by tier.
   Backend-dependent parts (Kakao/email delivery, AI prayer)
   run as labelled DEMOs until the server is deployed.
   ─────────────────────────────────────────────── */

/* ───────────  shared  ─────────── */
const TIER_KEY = 'golbang.tier';
const tier = {
  isPremium: () => localStorage.getItem(TIER_KEY) === 'premium',
  set: (on) => localStorage.setItem(TIER_KEY, on ? 'premium' : 'free'),
};
/* 로그인 시 계정별로 자동 분리 저장(auth.js). 비로그인은 기존 키 그대로. */
const store = (window.Veil && Veil.store) ? Veil.store : {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
function dateLabel(s) { const [y,m,d] = s.split('-'); return `${y}.${m}.${d}`; }
function dayOfYear() { const d = new Date(); const start = new Date(d.getFullYear(), 0, 0); return Math.floor((d - start) / 86400000); }
const $ = (sel, root=document) => root.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/* ───────────  content pools  ─────────── */
const DAILY_VERSES = [
  { ref: '예레미야애가 3:22-23', text: '여호와의 인자와 긍휼이 무궁하시므로 우리가 진멸되지 아니함이니이다 이것들이 아침마다 새로우니 주의 성실하심이 크시도소이다', theme: 'dawn' },
  { ref: '시편 46:10', text: '너희는 가만히 있어 내가 하나님 됨을 알지어다', theme: 'water' },
  { ref: '이사야 40:31', text: '오직 여호와를 앙망하는 자는 새 힘을 얻으리니 독수리가 날개치며 올라감 같을 것이요', theme: 'mountain' },
  { ref: '마태복음 6:34', text: '그러므로 내일 일을 위하여 염려하지 말라 내일 일은 내일이 염려할 것이요', theme: 'field' },
  { ref: '시편 23:1', text: '여호와는 나의 목자시니 내게 부족함이 없으리로다', theme: 'field' },
  { ref: '빌립보서 4:6-7', text: '아무 것도 염려하지 말고 다만 모든 일에 기도와 간구로 너희 구할 것을 감사함으로 하나님께 아뢰라', theme: 'light' },
  { ref: '잠언 3:5-6', text: '너는 마음을 다하여 여호와를 신뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라', theme: 'mountain' },
  { ref: '요한복음 14:27', text: '평안을 너희에게 끼치노니 곧 나의 평안을 너희에게 주노라', theme: 'night' },
  { ref: '시편 119:105', text: '주의 말씀은 내 발에 등이요 내 길에 빛이니이다', theme: 'night' },
  { ref: '마태복음 11:28', text: '수고하고 무거운 짐 진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라', theme: 'dawn' },
  { ref: '여호수아 1:9', text: '강하고 담대하라 두려워하지 말며 놀라지 말라 네 하나님 여호와가 너와 함께 하느니라', theme: 'mountain' },
  { ref: '시편 121:1-2', text: '내가 산을 향하여 눈을 들리라 나의 도움이 어디서 올까 나의 도움은 천지를 지으신 여호와에게서로다', theme: 'mountain' },
  { ref: '로마서 8:28', text: '하나님을 사랑하는 자 곧 그의 뜻대로 부르심을 입은 자들에게는 모든 것이 합력하여 선을 이루느니라', theme: 'field' },
  { ref: '고린도후서 12:9', text: '내 은혜가 네게 족하도다 이는 내 능력이 약한 데서 온전하여짐이라', theme: 'light' },
];
const VERSE_THEMES = {
  dawn:     'linear-gradient(160deg, #6b5836, #b08a4e 45%, #e7cf9c)',
  water:    'linear-gradient(160deg, #2e3a3c, #4f6b6a 50%, #8aa39b)',
  mountain: 'linear-gradient(160deg, #3a3530, #6d5f4d 50%, #a98f63)',
  field:    'linear-gradient(160deg, #3a3a28, #6f7050 55%, #a7a06a)',
  light:    'linear-gradient(160deg, #4a3c28, #997742 50%, #eedfc2)',
  night:    'linear-gradient(160deg, #1c2230, #38415c 55%, #6b7390)',
};

const QT_PLAN = [
  { ref: '시편 1:1-3', text: '복 있는 사람은 악인들의 꾀를 따르지 아니하며 죄인들의 길에 서지 아니하며 오만한 자들의 자리에 앉지 아니하고 오직 여호와의 율법을 즐거워하여 그의 율법을 주야로 묵상하는도다', q: '이 본문에서 ‘복’의 조건은 무엇이며, 나의 ‘즐거워함’은 지금 어디에 있습니까?' },
  { ref: '마태복음 5:3-6', text: '심령이 가난한 자는 복이 있나니 천국이 그들의 것임이요 애통하는 자는 복이 있나니 그들이 위로를 받을 것임이요 온유한 자는 복이 있나니 그들이 땅을 기업으로 받을 것임이요', q: '주님이 복되다 하신 모습 중, 지금 내게 가장 멀게 느껴지는 것은 무엇입니까?' },
  { ref: '요한복음 15:4-5', text: '내 안에 거하라 나도 너희 안에 거하리라 가지가 포도나무에 붙어 있지 아니하면 스스로 열매를 맺을 수 없음 같이 너희도 내 안에 있지 아니하면 그러하리라', q: '내가 ‘주님 안에 거한다’는 것은 오늘 하루 어떤 모습으로 나타나야 합니까?' },
  { ref: '빌립보서 2:3-5', text: '아무 일에든지 다툼이나 허영으로 하지 말고 오직 겸손한 마음으로 각각 자기보다 남을 낫게 여기고 너희 안에 이 마음을 품으라 곧 그리스도 예수의 마음이니', q: '내가 남보다 낫게 여기려 다투는 자리는 어디입니까? 그리스도의 마음은 어떻게 다릅니까?' },
  { ref: '로마서 12:1-2', text: '너희 몸을 하나님이 기뻐하시는 거룩한 산 제물로 드리라 이는 너희가 드릴 영적 예배니라 너희는 이 세대를 본받지 말고 오직 마음을 새롭게 함으로 변화를 받아', q: '나는 이 세대의 무엇을 본받고 있습니까? 마음을 새롭게 하려면 무엇을 내려놓아야 합니까?' },
  { ref: '갈라디아서 5:22-23', text: '오직 성령의 열매는 사랑과 희락과 화평과 오래 참음과 자비와 양선과 충성과 온유와 절제니 이같은 것을 금지할 법이 없느니라', q: '성령의 아홉 가지 열매 중, 지금 내 삶에 가장 자라야 할 것은 무엇입니까?' },
  { ref: '시편 23:1-4', text: '여호와는 나의 목자시니 내게 부족함이 없으리로다 그가 나를 푸른 풀밭에 누이시며 쉴 만한 물 가로 인도하시는도다 내 영혼을 소생시키시고', q: '‘부족함이 없다’는 고백을 막고 있는 내 마음의 염려는 무엇입니까?' },
];

/* 66 books: [name, chapters, group] */
const BIBLE = [
  ['창세기',50,'pent'],['출애굽기',40,'pent'],['레위기',27,'pent'],['민수기',36,'pent'],['신명기',34,'pent'],
  ['여호수아',24,'hist'],['사사기',21,'hist'],['룻기',4,'hist'],['사무엘상',31,'hist'],['사무엘하',24,'hist'],
  ['열왕기상',22,'hist'],['열왕기하',25,'hist'],['역대상',29,'hist'],['역대하',36,'hist'],['에스라',10,'hist'],
  ['느헤미야',13,'hist'],['에스더',10,'hist'],
  ['욥기',42,'poet'],['시편',150,'poet'],['잠언',31,'poet'],['전도서',12,'poet'],['아가',8,'poet'],
  ['이사야',66,'major'],['예레미야',52,'major'],['예레미야애가',5,'major'],['에스겔',48,'major'],['다니엘',12,'major'],
  ['호세아',14,'minor'],['요엘',3,'minor'],['아모스',9,'minor'],['오바댜',1,'minor'],['요나',4,'minor'],['미가',7,'minor'],
  ['나훔',3,'minor'],['하박국',3,'minor'],['스바냐',3,'minor'],['학개',2,'minor'],['스가랴',14,'minor'],['말라기',4,'minor'],
  ['마태복음',28,'gospel'],['마가복음',16,'gospel'],['누가복음',24,'gospel'],['요한복음',21,'gospel'],
  ['사도행전',28,'acts'],
  ['로마서',16,'paul'],['고린도전서',16,'paul'],['고린도후서',13,'paul'],['갈라디아서',6,'paul'],['에베소서',6,'paul'],
  ['빌립보서',4,'paul'],['골로새서',4,'paul'],['데살로니가전서',5,'paul'],['데살로니가후서',3,'paul'],['디모데전서',6,'paul'],
  ['디모데후서',4,'paul'],['디도서',3,'paul'],['빌레몬서',1,'paul'],
  ['히브리서',13,'gen'],['야고보서',5,'gen'],['베드로전서',5,'gen'],['베드로후서',3,'gen'],['요한일서',5,'gen'],
  ['요한이서',1,'gen'],['요한삼서',1,'gen'],['유다서',1,'gen'],
  ['요한계시록',22,'rev'],
];
const GROUP = {
  pent:  { name: '모세오경', hue: '#E6B23E' },   // 밝은 금
  hist:  { name: '역사서', hue: '#E28E45' },     // 밝은 주황
  poet:  { name: '시가서', hue: '#EC6F57' },     // 밝은 코랄
  major: { name: '대선지서', hue: '#4E9FE3' },   // 밝은 파랑
  minor: { name: '소선지서', hue: '#5FBA6E' },   // 밝은 초록
  gospel:{ name: '복음서', hue: '#ECC23F' },     // 밝은 노랑
  acts:  { name: '사도행전', hue: '#EE9440' },   // 밝은 호박
  paul:  { name: '바울서신', hue: '#3CB6A8' },   // 밝은 청록
  gen:   { name: '일반서신', hue: '#8E78D8' },   // 밝은 보라
  rev:   { name: '요한계시록', hue: '#DC6E8A' }, // 밝은 로즈
};

/* ───────────  tier UI  ─────────── */
function renderTier() {
  const premium = tier.isPremium();
  const badge = $('#tier-badge');
  if (badge) {
    badge.classList.toggle('is-premium', premium);
    badge.innerHTML = `<span class="dot"></span>${premium ? '동행 멤버십' : '무료 (은혜)'}`;
  }
  const demoBtn = $('#demo-toggle');
  if (demoBtn) demoBtn.textContent = premium ? '무료로 전환 (데모)' : '동행 체험 (데모)';
  document.querySelectorAll('.side-lock').forEach(l => l.style.display = premium ? 'none' : '');
}

/* ───────────  router  ─────────── */
const VIEW_IDS = ['gratitude', 'qt', 'prayer', 'bible', 'journal'];  // 'daily'(매일의 말씀) 일단 비활성화
function route() {
  if (commitGratEditor) { commitGratEditor(); commitGratEditor = null; }   // 다른 도구로 가기 전 감사 자동 보존
  let id = (location.hash || '#gratitude').slice(1);
  if (!VIEW_IDS.includes(id)) id = 'gratitude';
  document.querySelectorAll('.tool-view').forEach(v => v.classList.toggle('is-active', v.id === `view-${id}`));
  document.querySelectorAll('.tools-nav a').forEach(a => a.classList.toggle('is-current', a.getAttribute('href') === `#${id}`));
  const r = { gratitude: renderGratitude, qt: renderQT, daily: renderDaily, prayer: renderPrayer, bible: renderBible, journal: renderJournal }[id];
  r && r();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ════════════  감사일기  ════════════ */
const GRAT_KEY = 'veil.gratitude';
const FREE_GRAT_ITEMS = 3, FREE_GRAT_HISTORY = 14;
function getGrat() { return store.get(GRAT_KEY, {}); }
function gratWeekDays() {
  const data = getGrat(); const out = []; const now = new Date();
  for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(now.getDate() - i); const k = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; if ((data[k]||[]).some(x => x.trim())) out.push(k); }
  return out;
}
function gratStreak() {
  const data = getGrat(); let streak = 0; const now = new Date();
  for (let i = 0; i < 366; i++) { const d = new Date(now); d.setDate(now.getDate() - i); const k = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; if ((data[k]||[]).some(x => x.trim())) streak++; else if (i > 0) break; }
  return streak;
}
/* 감사일기 — 365일 원형(12시=1월 1일, 시계방향). 사진 첨부 시 그 칸이 사진으로,
   없으면 감성 색 10가지 중 하나로 채워진다. */
const GRAT_META_KEY = 'veil.gratitude.meta';   // { 'YYYY-MM-DD': { color: 0-9, photo: dataURL } }
const GRAT_COLORS = ['#E2C78A', '#CDB39A', '#AFC1A9', '#DDA993', '#A9BDB1', '#C3B3C9', '#E1B6AD', '#B3C0D1', '#E9D39B', '#C3B9A9'];
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function getGratMeta() { return store.get(GRAT_META_KEY, {}); }
function setGratMeta(m) { store.set(GRAT_META_KEY, m); }
function yearDates(year) {
  const out = []; const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) { out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); d.setDate(d.getDate() + 1); }
  return out;
}
function monthDates(year, month) {
  const out = []; const d = new Date(year, month, 1);
  while (d.getMonth() === month) { out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); d.setDate(d.getDate() + 1); }
  return out;
}
function prettyDate(s) { const [y, m, d] = s.split('-').map(Number); return `${m}월 ${d}일 (${WD[new Date(y, m - 1, d).getDay()]})`; }
function resizePhoto(file, max, cb) {
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onload = () => {
    const sc = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    try { cb(c.toDataURL('image/jpeg', 0.82)); } catch { cb(null); }
  };
  img.onerror = () => { URL.revokeObjectURL(url); cb(null); };
  img.src = url;
}

/* 회전 타원 카루셀: 365개 카드가 타원에 겹쳐 둘러서고 드래그/휠로 회전한다.
   맨 위(12시·●)에 온 날이 포커스되어 가운데에 크게 펼쳐진다. */
let gratOffset = null;     // 12시(위)에 오는 날의 인덱스 (실수 회전값)
let gratFocusIdx = -1;     // 현재 포커스된 정수 인덱스
let gratDates = [];
let gratYear = null, gratMonth = null;   // 현재 보고 있는 달 (월 단위 원)
let gratRX = 360, gratRY = 200;          // 화면 폭에 맞춰 동적으로 계산
const GR_BEND = 0.30;   // 가로형 카드가 너무 비틀리지 않게 회전 완화
let gratHoverIdx = -1, gratPop = 0;      // 마우스 올린 카드의 팝(아이폰 햅틱) 정도
let gratTiltX = 0, gratTiltY = 0;        // 원 전체의 기우뚱(중심 고정)
let commitGratEditor = null;             // 현재 편집 중인 날의 미저장 감사를 조용히 보존(이탈 시 자동 저장)
let gratNavigate = null;                 // 특정 날(인덱스)로 회전 이동 — 에디터의 '오늘로' 버튼 등에서 사용

function renderGratitude() {
  const mount = $('#grat-mount'); if (!mount) return;
  const now = new Date();
  if (gratYear == null) { gratYear = now.getFullYear(); gratMonth = now.getMonth(); }
  gratDates = monthDates(gratYear, gratMonth);
  const ti = gratDates.indexOf(todayStr());
  gratOffset = ti >= 0 ? ti : 0;            // 이번 달이면 오늘, 아니면 1일에 포커스
  gratFocusIdx = -1;

  mount.innerHTML = `
    <div class="gr2-monthnav" id="gr2-monthnav">
      <button class="gr2-mn-btn" id="gr2-prev" type="button" aria-label="이전 달">‹</button>
      <span class="gr2-mn-title" id="gr2-mn-title">${gratYear}년 ${gratMonth + 1}월</span>
      <button class="gr2-mn-btn" id="gr2-next" type="button" aria-label="다음 달">›</button>
      <button class="btn btn-text btn-sm" id="gr2-today" type="button">오늘</button>
    </div>
    <div class="gr2-stage" id="gr2-stage">
      <div class="gr2-world" id="gr2-world">
        <div class="gr2-months" id="gr2-months"></div>
        <div class="gr2-ring" id="gr2-ring"></div>
        <span class="gr2-pin" aria-hidden="true"></span>
        <div class="gr2-center" id="gr2-center"></div>
      </div>
    </div>
    <div class="panel" id="grat-editor"></div>`;

  buildRing();
  computeRingDims();
  bindRing();
  layoutRing();
  renderGratEditor();

  $('#gr2-prev')?.addEventListener('click', () => gratGoMonth(-1));
  $('#gr2-next')?.addEventListener('click', () => gratGoMonth(1));
  $('#gr2-today')?.addEventListener('click', () => { const n = new Date(); gratYear = n.getFullYear(); gratMonth = n.getMonth(); renderGratitude(); });
}

function gratGoMonth(delta) {
  if (commitGratEditor) commitGratEditor();
  let m = gratMonth + delta, y = gratYear;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  gratYear = y; gratMonth = m;
  renderGratitude();
}

/* 화면 폭·높이에 맞춰 원 크기를 키운다 (Clou처럼 화면을 가득 채우되 세로로 넘치지 않게). */
function computeRingDims() {
  const stage = $('#gr2-stage'); if (!stage) return;
  const W = stage.clientWidth || window.innerWidth;
  const H = window.innerHeight || 800;
  let rx = Math.min(W * 0.40, 720);            // 폭 기준 (상한 720)
  rx = Math.min(rx, (H * 0.72 - 60) / 0.95);   // 세로로 넘치지 않게
  gratRX = Math.max(280, rx);
  gratRY = gratRX * 0.40;                       // 약간 납작한 타원
  stage.style.height = Math.round(gratRY * 2 + gratRX * 0.34 + 130) + 'px';
  const pin = stage.querySelector('.gr2-pin');
  if (pin) pin.style.top = `calc(50% + ${Math.round(gratRY)}px)`;
}

function buildRing() {
  const ring = $('#gr2-ring'); if (!ring) return;
  const data = getGrat(); const meta = getGratMeta();
  ring.innerHTML = gratDates.map((ds, i) => {
    const m = meta[ds] || {}; const on = (data[ds] || []).some(x => x.trim()) || !!m.photo;
    let fill = '';
    if (m.photo) fill = `background-image:url('${m.photo}')`;
    else if (on) fill = `background:${GRAT_COLORS[(m.color || 0) % GRAT_COLORS.length]}`;
    return `<button class="gr2-card${on ? ' on' : ''}" data-i="${i}" tabindex="-1" style="${fill}" aria-label="${prettyDate(ds)}"></button>`;
  }).join('');
  // 월 단위 원 — 날짜(일) 라벨을 카드 바깥에 배치
  $('#gr2-months').innerHTML = gratDates.map((ds, i) =>
    `<span class="gr2-mlabel gr2-daylabel" data-i="${i}">${+ds.slice(8, 10)}</span>`).join('');
}

function layoutRing() {
  const ring = $('#gr2-ring'); if (!ring) return;
  const N = gratDates.length;
  const GSF = gratRX / 360;                   // 전역 크기 배율
  ring.querySelectorAll('.gr2-card').forEach(card => {
    const i = +card.dataset.i;
    const ar = (i - gratOffset) * (2 * Math.PI / N);
    const co = Math.cos(ar);
    const nf = (1 + co) / 2;                  // 1 = 앞(아래·포커스), 0 = 뒤(위·멀어짐)
    const x = Math.sin(ar) * gratRX, y = co * gratRY;
    const rot = ar * 180 / Math.PI * GR_BEND;
    const ds = (0.66 + nf * 0.40) * GSF;       // 깊이 스케일 — 가로형 박스 비율 보존(앞 큼·뒤 작음)
    let sx = ds, sy = ds;
    let z = Math.round(nf * 1000);
    if (i === gratHoverIdx && gratPop > 0.002) { const p = 1 + gratPop * 0.18; sx *= p; sy *= p; z += 1500; }   // 마우스 올린 카드 팝
    card.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
    card.style.opacity = (0.24 + nf * 0.76).toFixed(3);
    card.style.zIndex = z;
  });
  $('#gr2-months').querySelectorAll('.gr2-mlabel').forEach(lab => {
    const i = +lab.dataset.i;
    const ar = (i - gratOffset) * (2 * Math.PI / N);
    const co = Math.cos(ar);
    const nf = (1 + co) / 2;
    const x = Math.sin(ar) * (gratRX + 34 * GSF), y = co * (gratRY + 24 * GSF);
    lab.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
    lab.style.opacity = (0.18 + nf * 0.82).toFixed(3);
    lab.style.zIndex = Math.round(nf * 1000) + 1;
  });
  let fi = Math.round(gratOffset) % N; if (fi < 0) fi += N;
  if (fi !== gratFocusIdx) {
    const prev = ring.querySelector('.gr2-card.focus'); if (prev) prev.classList.remove('focus');
    gratFocusIdx = fi;
    const cur = ring.querySelector(`.gr2-card[data-i="${fi}"]`); if (cur) cur.classList.add('focus');
    renderCenter();
  }
}

function renderCenter() {
  const c = $('#gr2-center'); if (!c) return;
  const ds = gratDates[gratFocusIdx]; if (!ds) return;
  const data = getGrat(); const meta = getGratMeta(); const m = meta[ds] || {};
  const items = (data[ds] || []).filter(x => x.trim());
  let media;
  if (m.photo) media = `<div class="gr2c-media" style="background-image:url('${m.photo}')"></div>`;
  else if (items.length) media = `<div class="gr2c-media" style="background:${GRAT_COLORS[(m.color || 0) % GRAT_COLORS.length]}"></div>`;
  else media = `<div class="gr2c-media empty">${ds > todayStr() ? '아직 오지 않은 날' : '아직 비어 있어요'}</div>`;
  const emptyText = ds > todayStr() ? '아직 오지 않은 날이에요' : '이 날의 감사를 적어 보세요';
  c.innerHTML = `<div class="gr2c-date">${prettyDate(ds)}${ds === todayStr() ? ' <span class="grat-today-chip">오늘</span>' : ''}</div>${media}<div class="gr2c-text">${items.length ? items.map(escapeHtml).join(' · ') : emptyText}</div>`;
}

function bindRing() {
  const stage = $('#gr2-stage'); if (!stage) return;
  const world = $('#gr2-world');
  const ring = $('#gr2-ring');
  const N = gratDates.length;

  // 물리 기반 — 호버 추종 + 관성(던지기) + 아이폰식 탄성 스냅 + 카드 팝 + 마우스 방향 기우뚱.
  const MAXV = 0.6;        // 호버 최고 속도 (×1.2)
  const HOVER_EASE = 0.08;
  const DEAD = 0.06;       // 중앙 데드존
  const DRAG_SENS = 0.09;  // 드래그 민감도 (×3)
  const FRICTION = 0.94;   // 관성 감속
  const SNAP_ENTER = 0.18; // 관성 → 스프링 전환 임계 속도
  const STIFF = 0.20, DAMP = 0.76;  // 스프링(탄성 스냅)
  const MAXSTEP = 20;      // 한 프레임 최대 이동
  const MAXTILT = 7;       // 마우스 방향 기우뚱 최대(도)
  const TILT_EASE = 0.10;

  let mode = 'idle';       // idle | hover | momentum | spring
  let vel = 0, targetVel = 0, sTarget = 0;
  let dragging = false, lastX = 0, moved = 0, dragVel = 0;
  let popTarget = 0, popVel = 0;        // 카드 팝
  let tTiltX = 0, tTiltY = 0;           // 기우뚱 목표
  let springDone = null;                // 스냅 완료 후 1회 실행(클릭 시 일기로 이동)
  let raf = 0;
  const clamp = (v) => Math.max(-MAXSTEP, Math.min(MAXSTEP, v));
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const run = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const applyTilt = () => { if (world) world.style.transform = `rotateX(${gratTiltX.toFixed(2)}deg) rotateY(${gratTiltY.toFixed(2)}deg)`; };

  function frame() {
    if (mode === 'hover') {
      vel += (targetVel - vel) * HOVER_EASE; gratOffset += vel;
    } else if (mode === 'momentum') {
      vel *= FRICTION; gratOffset += vel;
      if (Math.abs(vel) < SNAP_ENTER) { mode = 'spring'; sTarget = Math.round(gratOffset); vel = 0; springDone = null; }
    } else if (mode === 'spring') {
      vel = clamp((vel + (sTarget - gratOffset) * STIFF) * DAMP); gratOffset += vel;
      if (Math.abs(sTarget - gratOffset) < 0.003 && Math.abs(vel) < 0.003) {
        gratOffset = sTarget; vel = 0; mode = 'idle'; renderGratEditor();
        if (springDone) { const cb = springDone; springDone = null; cb(); }
      }
    }
    popVel += (popTarget - gratPop) * 0.38; popVel *= 0.62; gratPop += popVel;   // 팝 스프링
    if (gratPop < 0) { gratPop = 0; popVel = 0; }
    gratTiltX += (tTiltX - gratTiltX) * TILT_EASE;                               // 기우뚱 이징
    gratTiltY += (tTiltY - gratTiltY) * TILT_EASE; applyTilt();
    layoutRing();
    const popActive = Math.abs(popTarget - gratPop) > 0.002 || Math.abs(popVel) > 0.002;
    const tiltActive = Math.abs(tTiltX - gratTiltX) > 0.02 || Math.abs(tTiltY - gratTiltY) > 0.02;
    if (mode === 'idle' && !popActive && !tiltActive) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
  }
  function springTo(target, done) { mode = 'spring'; sTarget = target; vel = 0; springDone = done || null; run(); }
  gratNavigate = (idx, scroll) => {        // 외부(에디터 버튼)에서 특정 날로 이동
    if (idx < 0) return;
    if (commitGratEditor) commitGratEditor();
    let diff = ((idx - gratOffset) % N + N) % N; if (diff > N / 2) diff -= N;
    springTo(gratOffset + diff, scroll ? scrollToGratEditor : null);
  };

  function aimSpin(clientX) {
    const r = stage.getBoundingClientRect();
    const nx = (clientX - r.left) / r.width - 0.5;
    let mag = 0;
    if (nx > DEAD) mag = (nx - DEAD) / (0.5 - DEAD);
    else if (nx < -DEAD) mag = (nx + DEAD) / (0.5 - DEAD);
    mag = Math.max(-1, Math.min(1, mag));
    targetVel = Math.sign(mag) * Math.pow(Math.abs(mag), 1.6) * MAXV;
  }
  function aimTilt(clientX, clientY) {
    const r = stage.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((clientX - r.left) / r.width - 0.5) * 2));
    const ny = Math.max(-1, Math.min(1, ((clientY - r.top) / r.height - 0.5) * 2));
    tTiltY = nx * MAXTILT;     // 좌우로 기우뚱
    tTiltX = -ny * MAXTILT;    // 상하로 기우뚱
  }

  stage.addEventListener('pointerenter', (e) => { if (dragging) return; mode = 'hover'; aimSpin(e.clientX); aimTilt(e.clientX, e.clientY); run(); });
  stage.addEventListener('pointerleave', () => { if (dragging) return; mode = 'momentum'; popTarget = 0; tTiltX = 0; tTiltY = 0; run(); });

  // 휠은 원을 돌리지 않고 페이지를 그대로 스크롤한다(요청). 회전은 마우스 이동/드래그로만.

  stage.addEventListener('pointerdown', (e) => {
    dragging = true; moved = 0; lastX = e.clientX; dragVel = 0; vel = 0; mode = 'idle';
    try { stage.setPointerCapture(e.pointerId); } catch {}
    stage.classList.add('dragging'); run();
  });
  stage.addEventListener('pointermove', (e) => {
    if (dragging) {
      const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx);
      const dv = -dx * DRAG_SENS; gratOffset += dv; dragVel = clamp(dv);
      aimTilt(e.clientX, e.clientY); run();
      return;
    }
    mode = 'hover'; aimSpin(e.clientX); aimTilt(e.clientX, e.clientY); run();
  });
  const endDrag = () => {
    if (!dragging) return; dragging = false; stage.classList.remove('dragging');
    vel = dragVel; mode = 'momentum'; run();    // 던진 속도로 관성 시작
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // 마우스 올린 카드 팝 (특히 앞=6시 카드)
  ring.addEventListener('pointerover', (e) => {
    if (dragging) return; const c = e.target.closest('.gr2-card'); if (!c) return;
    gratHoverIdx = +c.dataset.i; popTarget = 1; run();
  });
  ring.addEventListener('pointerout', (e) => {
    const c = e.target.closest('.gr2-card'); if (!c) return;
    if (+c.dataset.i === gratHoverIdx) { popTarget = 0; run(); }
  });

  // 키보드 접근성 — 좌우 화살표로 날짜 회전, Home으로 오늘, Enter로 그 날 일기 열기
  stage.tabIndex = 0;
  stage.setAttribute('role', 'application');
  stage.setAttribute('aria-label', '감사일기 달력 — 좌우 화살표로 날짜를 옮기고, 엔터로 그 날의 일기를 엽니다');
  stage.addEventListener('keydown', (e) => {
    const base = Math.round(gratOffset);
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (commitGratEditor) commitGratEditor(); springTo(base - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (commitGratEditor) commitGratEditor(); springTo(base + 1); }
    else if (e.key === 'Home') { e.preventDefault(); if (commitGratEditor) commitGratEditor(); const ti = gratDates.indexOf(todayStr()); if (ti >= 0) { let diff = ((ti - gratOffset) % N + N) % N; if (diff > N / 2) diff -= N; springTo(gratOffset + diff); } }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollToGratEditor(); }
  });

  // 카드 클릭 → 그 날을 탄성 스냅으로 가운데로 옮긴 뒤, 그 날의 감사일기로 이동
  ring.querySelectorAll('.gr2-card').forEach(card => {
    card.addEventListener('click', () => {
      if (moved > 6) return;                       // 드래그였으면 클릭 무시
      if (commitGratEditor) commitGratEditor();     // 떠나는 날의 미저장 감사를 먼저 보존
      const i = +card.dataset.i;
      let diff = ((i - gratOffset) % N + N) % N; if (diff > N / 2) diff -= N;
      springTo(gratOffset + diff, scrollToGratEditor);
    });
  });

  // 월 라벨 클릭 → 그 달 1일로 회전(둘러보기). 달력처럼 월 단위로 건너뛴다.
  $('#gr2-months').querySelectorAll('.gr2-mlabel').forEach(lab => {
    lab.style.cursor = 'pointer'; lab.title = '이 달로 이동';
    lab.addEventListener('click', () => {
      if (commitGratEditor) commitGratEditor();
      const i = +lab.dataset.i;
      let diff = ((i - gratOffset) % N + N) % N; if (diff > N / 2) diff -= N;
      springTo(gratOffset + diff);
    });
  });
}

/* 클릭한 날의 감사일기(작성·열람) 영역으로 부드럽게 이동 + 바로 쓸 수 있게 빈 칸에 커서 */
function scrollToGratEditor() {
  const ed = document.getElementById('grat-editor'); if (!ed) return;
  const nav = document.querySelector('.tools-topbar');
  const offset = (nav ? nav.offsetHeight : 0) + 16;
  const y = ed.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: y, behavior: 'smooth' });
  const ins = [...ed.querySelectorAll('#grat-items input[type=text]')];
  const target = ins.find(i => !i.value.trim()) || ins[0];   // 첫 빈 칸(없으면 첫 칸)에 바로 커서
  if (target) target.focus({ preventScroll: true });
}

/* 창 크기 바뀌면 원 크기 재계산 */
window.addEventListener('resize', () => { if (document.getElementById('gr2-stage')) { computeRingDims(); layoutRing(); } });
/* 탭을 닫거나 새로고침해도 적던 감사를 잃지 않도록 마지막에 한 번 더 보존 */
window.addEventListener('pagehide', () => { if (commitGratEditor) commitGratEditor(); });

function renderGratEditor() {
  const editor = $('#grat-editor'); if (!editor) return;
  const premium = tier.isPremium();
  const ds = gratDates[gratFocusIdx] || todayStr(); const data = getGrat(); const meta = getGratMeta();
  // 미래 날: 감사는 '받은 은혜'를 돌아보는 것이라, 아직 오지 않은 날엔 적지 않는다(부드럽게 오늘로 안내).
  if (ds > todayStr()) {
    editor.innerHTML = `
      <div class="grat-ed-head" style="display:flex;align-items:center;gap:8px"><h2>${prettyDate(ds)}</h2><button class="btn btn-text btn-sm" id="grat-goto-today" style="padding:2px 8px">오늘로</button></div>
      <p class="panel-sub">아직 오지 않은 날이에요. 받은 은혜는 그 날을 지나며 적게 됩니다.</p>
      <p class="hint" style="margin-top:6px">오늘의 감사부터 남겨 보세요.</p>`;
    const g = $('#grat-goto-today', editor);
    if (g) g.addEventListener('click', () => { if (gratNavigate) gratNavigate(gratDates.indexOf(todayStr()), true); });
    commitGratEditor = null;     // 미래 날은 보존할 입력이 없음
    return;
  }

  const items = data[ds] && data[ds].length ? data[ds].slice() : ['', '', ''];
  const maxItems = premium ? 10 : 3;
  let pendingPhoto = (meta[ds] || {}).photo || null;

  const yr = String(new Date().getFullYear());
  const yearCount = Object.entries(data).filter(([k, v]) => k.slice(0, 4) === yr && v.some(x => x.trim())).length;
  const streak = gratStreak();
  const statLine = yearCount ? `<span class="grat-stat" style="margin-left:auto;font-size:13px;color:var(--gold,#b08a3e);font-weight:600;white-space:nowrap">${streak > 1 ? `연속 ${streak}일 · ` : ''}올해 ${yearCount}일의 감사</span>` : '';

  const isToday = ds === todayStr();
  editor.innerHTML = `
    <div class="grat-ed-head" style="display:flex;align-items:center;gap:8px"><h2>${prettyDate(ds)}</h2>${isToday ? '<span class="grat-today-chip">오늘</span>' : '<button class="btn btn-text btn-sm" id="grat-goto-today" style="padding:2px 8px">오늘로</button>'}${statLine}</div>
    <p class="panel-sub">받은 은혜를 ${premium ? '마음껏' : '3가지까지'} 적어 보세요.</p>
    <div id="grat-items"></div>
    <div class="grat-photo">
      <div class="gphoto-prev${pendingPhoto ? '' : ' empty'}" id="gphoto-prev" style="${pendingPhoto ? `background-image:url('${pendingPhoto}')` : ''}">${pendingPhoto ? '' : '사진 없음'}</div>
      <label class="btn btn-ghost btn-sm">사진 첨부<input type="file" accept="image/*" id="grat-file" hidden></label>
      <button class="btn btn-text btn-sm" id="grat-photo-del"${pendingPhoto ? '' : ' style="display:none"'}>사진 제거</button>
      <span class="hint">사진을 넣으면 원의 그 날 칸이 사진으로 채워집니다.</span>
    </div>
    <div class="grat-actions">
      <button class="btn btn-text btn-sm" id="grat-add">+ 감사 추가${premium ? '' : ' (무료 3개)'}</button>
      <button class="btn btn-gold btn-sm" id="grat-save">이 날의 감사 저장</button>
      <span class="grat-saved" id="grat-saved" role="status" aria-live="polite">✓ 저장되었습니다</span>
    </div>
    <p class="hint" id="grat-limit-hint" hidden style="margin:8px 0 0">무료는 하루 3가지까지 적을 수 있어요. <a href="index.html#pricing">동행 멤버십</a>에선 마음껏 남길 수 있습니다.</p>`;

  const itemsWrap = $('#grat-items', editor);
  function drawItems() {
    itemsWrap.innerHTML = '';
    items.forEach((val, i) => {
      const row = el(`<div class="grat-item"><span class="grat-no">${i + 1}</span><input type="text" value="${escapeHtml(String(val)).replace(/"/g, '&quot;')}" placeholder="감사한 일 ${i + 1}"/><button class="grat-del" title="삭제" tabindex="-1" aria-label="${i + 1}번째 감사 지우기">✕</button></div>`);
      const inp = row.querySelector('input');
      inp.addEventListener('input', e => items[i] = e.target.value);
      inp.addEventListener('keydown', e => {                  // Enter로 다음 칸→새 칸 추가→마지막엔 저장 (손이 키보드를 떠나지 않게)
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const all = itemsWrap.querySelectorAll('input');
        if (i < all.length - 1) all[i + 1].focus();
        else if (items.length < maxItems) { items.push(''); drawItems(); const next = itemsWrap.querySelectorAll('input'); next[next.length - 1].focus(); }
        else doSave(false);
      });
      row.querySelector('.grat-del').addEventListener('click', () => { items.splice(i, 1); if (!items.length) items.push(''); drawItems(); });
      itemsWrap.appendChild(row);
    });
    $('#grat-add', editor).disabled = premium && items.length >= maxItems;   // 무료는 비활성 대신 업셀 안내를 띄움
  }
  drawItems();

  $('#grat-add', editor).addEventListener('click', () => {
    const hint = $('#grat-limit-hint', editor);
    if (items.length >= maxItems) { if (!premium && hint) hint.hidden = false; return; }   // 한도 도달: 페이지 이동 대신 부드러운 안내
    items.push(''); drawItems();
    if (hint) hint.hidden = true;
    const ins = itemsWrap.querySelectorAll('input'); ins[ins.length - 1].focus();   // 새 칸에 바로 커서
  });
  $('#grat-file', editor).addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    resizePhoto(f, 720, (url) => {
      if (!url) return;
      pendingPhoto = url;
      const prev = $('#gphoto-prev', editor);
      prev.style.backgroundImage = `url('${url}')`; prev.classList.remove('empty'); prev.textContent = '';
      $('#grat-photo-del', editor).style.display = '';
    });
  });
  $('#grat-photo-del', editor).addEventListener('click', () => {
    pendingPhoto = null;
    const prev = $('#gphoto-prev', editor);
    prev.style.backgroundImage = ''; prev.classList.add('empty'); prev.textContent = '사진 없음';
    $('#grat-photo-del', editor).style.display = 'none';
  });
  function currentClean() { return items.map(x => x.trim()).filter(Boolean); }
  function isDirty() {
    const clean = currentClean();
    const saved = (getGrat()[ds] || []).filter(x => x.trim());
    const savedPhoto = (getGratMeta()[ds] || {}).photo || null;
    return clean.length !== saved.length || clean.some((v, i) => v !== saved[i]) || (pendingPhoto || null) !== savedPhoto;
  }
  function doSave(silent) {
    if (silent && !isDirty()) return;                       // 바뀐 게 없으면 조용히 통과
    const clean = currentClean();
    const d = getGrat(); if (clean.length) d[ds] = clean; else delete d[ds]; store.set(GRAT_KEY, d);
    const mm = getGratMeta(); const cur = mm[ds] || {};
    if (pendingPhoto) cur.photo = pendingPhoto; else delete cur.photo;
    if (clean.length && !pendingPhoto && cur.color == null) cur.color = Math.floor(Math.random() * GRAT_COLORS.length);
    if (!pendingPhoto && !clean.length) delete mm[ds]; else mm[ds] = cur;
    setGratMeta(mm);
    if (!silent) {                                          // 명시 저장: 전체 재렌더 + 토스트
      renderGratitude();
      const s = $('#grat-saved'); if (s) { s.classList.add('show'); setTimeout(() => s.classList.remove('show'), 1600); }
    } else {
      // silent(이탈 자동저장): 회전·리스너를 깨지 않도록 전체 재렌더 대신 그 날 카드 색만 갱신
      const idx = gratDates.indexOf(ds);
      const card = idx >= 0 && document.querySelector(`.gr2-card[data-i="${idx}"]`);
      if (card) {
        const ph = (getGratMeta()[ds] || {}).photo;
        const has = clean.length > 0 || !!ph;
        card.classList.toggle('on', has);
        if (ph) card.style.backgroundImage = `url('${ph}')`;
        else { card.style.backgroundImage = ''; card.style.background = has ? GRAT_COLORS[((getGratMeta()[ds] || {}).color || 0) % GRAT_COLORS.length] : ''; }
      }
    }
  }
  $('#grat-save', editor).addEventListener('click', () => doSave(false));
  commitGratEditor = () => { try { doSave(true); } catch {} };   // 다른 날/도구로 이탈하거나 창을 닫을 때 자동 보존
  const gotoToday = $('#grat-goto-today', editor);
  if (gotoToday) gotoToday.addEventListener('click', () => { if (gratNavigate) gratNavigate(gratDates.indexOf(todayStr()), true); });
}
function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
/* 클립보드 복사 — 보안 컨텍스트면 Clipboard API, 아니면 execCommand 폴백. 성공 여부(boolean) 반환. */
function fallbackCopy(text) {
  try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok; } catch { return false; }
}
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  return Promise.resolve(fallbackCopy(text));
}

/* ════════════  큐티 (QT)  ════════════ */
const QT_KEY = 'veil.qt';
function renderQT() {
  const premium = tier.isPremium();
  const mount = $('#qt-mount'); if (!mount) return;
  const today = todayStr();
  const passage = QT_PLAN[dayOfYear() % QT_PLAN.length];
  const all = store.get(QT_KEY, {});
  const saved = all[today] || { observe: '', meditate: '', apply: '', pray: '' };
  const steps = [
    { key: 'observe', no: '01', name: '관찰', guide: '본문이 말하는 사실은? 반복되는 단어·인물·흐름을 적어 보세요.' },
    { key: 'meditate', no: '02', name: '묵상', guide: '하나님은 어떤 분이신가요? 나에게 주시는 마음은 무엇인가요?' },
    { key: 'apply', no: '03', name: '적용', guide: '오늘 내 삶에 어떻게 순종할 수 있을까요? 구체적으로.' },
    { key: 'pray', no: '04', name: '기도', guide: '깨달은 말씀으로 결단의 기도를 드려 보세요.' },
  ];
  mount.innerHTML = `
    <div class="panel">
      <h2>오늘의 본문</h2>
      <p class="panel-sub">관찰·묵상·적용·기도 4단계 묵상 · ${dateLabel(today)}</p>
      <div class="qt-passage">
        <div class="qt-ref">${passage.ref}</div>
        <blockquote>${passage.text}</blockquote>
      </div>
      ${premium ? `<div class="upsell" style="background:linear-gradient(135deg,#F7F8F5,var(--bg-2));border-color:var(--sage)"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" style="color:var(--sage)"><path d="M12 3.5c2.6 3.1 4.6 5.4 4.6 8.8a4.6 4.6 0 1 1-9.2 0C7.4 8.9 9.4 6.6 12 3.5Z"/></svg><div class="upsell-text"><strong>묵상 도우미</strong> — 본문 해설과 묵상 질문이 함께 제공됩니다.<p>“${escapeHtml(passage.q)}”</p></div></div>` : ''}
      <div id="qt-steps"></div>
      <div class="grat-actions">
        <button class="btn btn-gold btn-sm" id="qt-save">큐티 저장</button>
        <span class="grat-saved" id="qt-saved">✓ 저장되었습니다</span>
      </div>
    </div>
    ${!premium ? `<div class="upsell"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v9H5z" stroke-linejoin="round"/></svg><div class="upsell-text"><strong>동행 멤버십</strong>: 본문 해설·AI 묵상 질문 · 통독 연계 본문 · 큐티 나눔 · 누적 기록과 연속일 통계.<p>무료는 매일 본문 + 4단계 작성(기기 보관)까지.</p></div><a class="btn btn-gold btn-sm" href="index.html#pricing">멤버십 보기</a></div>` : ''}`;

  const wrap = $('#qt-steps', mount);
  steps.forEach(s => {
    const node = el(`<div class="qt-step"><div class="qt-step-head"><span class="qt-step-no">${s.no}</span><span class="qt-step-name">${s.name}</span><span class="qt-step-guide">${s.guide}</span></div><div class="field" style="margin:0"><textarea data-k="${s.key}" placeholder="${s.name} 내용을 여기에 적어 보세요">${escapeHtml(saved[s.key]||'')}</textarea></div></div>`);
    wrap.appendChild(node);
  });
  $('#qt-save', mount).addEventListener('click', () => {
    const obj = {}; wrap.querySelectorAll('textarea').forEach(t => obj[t.dataset.k] = t.value.trim());
    const a = store.get(QT_KEY, {});
    if (Object.values(obj).some(Boolean)) a[today] = obj; else delete a[today];
    store.set(QT_KEY, a);
    const s = $('#qt-saved', mount); s.classList.add('show'); setTimeout(() => s.classList.remove('show'), 1800);
  });
}

/* ════════════  매일의 말씀 받기  ════════════ */
const DAILY_KEY = 'veil.daily';
function renderDaily() {
  const premium = tier.isPremium();
  const mount = $('#daily-mount'); if (!mount) return;
  const cfg = store.get(DAILY_KEY, { channel: 'widget', time: '06:30', contact: '' });
  const verse = DAILY_VERSES[dayOfYear() % DAILY_VERSES.length];

  mount.innerHTML = `
    <div class="panel-split">
      <div>
        <div class="panel">
          <h2>오늘의 말씀 미리보기</h2>
          <p class="panel-sub">${premium ? '당신의 감사·회개 기록을 반영한 맞춤 말씀' : '무료는 매일 무작위 말씀'}</p>
          <div class="verse-card" style="background:${VERSE_THEMES[verse.theme]}">
            <span class="vc-tag">${premium ? '맞춤 · ' + dateLabel(todayStr()) : '오늘의 말씀'}</span>
            <div class="vc-inner"><div class="vc-verse">“${verse.text}”</div><div class="vc-ref">— ${verse.ref}</div></div>
          </div>
        </div>
      </div>
      <div>
        <div class="panel">
          <h2>받는 방법</h2>
          <p class="panel-sub">아침마다 한 구절과 사진을 원하는 곳으로</p>
          <div class="channel-grid" id="daily-channels">
            <div class="channel" data-ch="kakao"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 4c4.4 0 8 2.8 8 6.3 0 3.4-3.6 6.2-8 6.2-.7 0-1.4-.1-2-.2L6 18l1-3c-1.8-1.1-3-2.8-3-4.7C4 6.8 7.6 4 12 4Z" stroke-linejoin="round"/></svg><span>카카오톡</span></div>
            <div class="channel" data-ch="email"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 6h16v12H4z" stroke-linejoin="round"/><path d="M4 7l8 6 8-6"/></svg><span>이메일</span></div>
            <div class="channel" data-ch="widget"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h6"/></svg><span>홈 위젯</span></div>
          </div>
          <div class="field" id="daily-contact-field" style="margin-top:16px"></div>
          <div class="field"><label>받을 시간</label><input type="time" id="daily-time" value="${cfg.time}"/></div>
          <button class="btn btn-gold btn-sm btn-block" id="daily-save">${premium ? '맞춤 발송 설정 저장' : '설정 저장'}</button>
          <p class="hint" id="daily-note" style="margin-top:12px"></p>
        </div>
      </div>
    </div>
    ${!premium ? `<div class="upsell"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v9H5z" stroke-linejoin="round"/></svg><div class="upsell-text"><strong>동행 멤버십</strong>: 당신의 감사·회개·큐티 데이터를 분석해 <strong>진짜 필요한 말씀</strong>을 카카오톡/이메일로 발송 · 프리미엄 사진 · 말씀 기록 보관.<p>무료는 무작위 말씀의 앱 내 미리보기까지.</p></div><a class="btn btn-gold btn-sm" href="index.html#pricing">멤버십 보기</a></div>` : ''}`;

  let sel = cfg.channel;
  const chWrap = $('#daily-channels', mount);
  function drawContact() {
    const f = $('#daily-contact-field', mount);
    if (sel === 'kakao') f.innerHTML = `<label>카카오톡 연동</label><button class="btn btn-ghost btn-sm btn-block" id="kakao-link">카카오 계정 연결 (데모)</button>`;
    else if (sel === 'email') f.innerHTML = `<label>이메일 주소</label><input type="email" id="daily-contact" placeholder="you@example.com" value="${(cfg.contact||'').replace(/"/g,'&quot;')}"/>`;
    else f.innerHTML = `<label>홈 위젯</label><p class="hint">iOS/Android 위젯에 오늘의 말씀이 표시됩니다. (앱 설치 시)</p>`;
  }
  function paintSel() { chWrap.querySelectorAll('.channel').forEach(c => c.classList.toggle('sel', c.dataset.ch === sel)); }
  chWrap.querySelectorAll('.channel').forEach(c => c.addEventListener('click', () => { sel = c.dataset.ch; paintSel(); drawContact(); }));
  paintSel(); drawContact();
  $('#daily-save', mount).addEventListener('click', () => {
    const contactEl = $('#daily-contact', mount);
    store.set(DAILY_KEY, { channel: sel, time: $('#daily-time', mount).value, contact: contactEl ? contactEl.value : (cfg.contact||'') });
    const note = $('#daily-note', mount);
    note.textContent = premium
      ? `✓ 저장됨 — 매일 ${$('#daily-time', mount).value}에 ${chName(sel)}(으)로 맞춤 말씀이 발송됩니다. (실발송은 서버 연동 후 활성화 · 데모)`
      : `✓ 설정 저장됨. 실제 발송과 맞춤 추천은 동행 멤버십에서 제공됩니다.`;
    note.style.color = 'var(--sage)';
  });
}
function chName(c) { return { kakao: '카카오톡', email: '이메일', widget: '홈 위젯' }[c] || c; }

/* ════════════  감사일기 기반 기도문 생성  ════════════ */
const PRAYER_KEY = 'veil.prayer.last';
function renderPrayer() {
  const premium = tier.isPremium();
  const mount = $('#prayer-mount'); if (!mount) return;
  const data = getGrat();
  // 이번 주 감사를 우선 모으고, 없으면 가장 최근 감사 기록을 사용 (7일 조건 없음)
  let items = gratWeekDays().flatMap(k => data[k] || []).filter(x => x && x.trim());
  if (!items.length) {
    const days = Object.keys(data).filter(k => (data[k] || []).some(x => x.trim())).sort().reverse();
    items = days.flatMap(k => data[k] || []).filter(x => x && x.trim());
  }
  const hasAny = items.length > 0;

  mount.innerHTML = `
    <div class="panel">
      <h2>감사 기반 기도문</h2>
      <p class="panel-sub">적어 둔 감사일기를 모아, 예배 때 그대로 읽을 수 있는 기도문으로 엮어 드립니다.</p>
      <p class="prayer-meta">${hasAny ? `이번에 반영할 감사 <strong>${items.length}</strong>가지` : '아직 적어 둔 감사가 없어요. 한 가지라도 적으면 기도문을 엮어 드릴게요.'}</p>
      <div class="${premium ? '' : 'locked'}">
        ${!premium ? `<div class="lock-overlay"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v9H5z" stroke-linejoin="round"/></svg><p><strong>동행 멤버십</strong> 전용 기능입니다. 적어 둔 감사를 모아 예배용 기도문으로 엮어 드려요.</p><a class="btn btn-gold btn-sm" href="index.html#pricing">멤버십 보기</a></div>` : ''}
        <div class="prayer-cta">
          <button class="btn btn-gold" id="prayer-gen" ${premium && hasAny ? '' : 'disabled'} ${premium ? '' : 'tabindex="-1" aria-hidden="true"'}>${hasAny ? '기도문 생성하기' : '먼저 감사일기를 적어 주세요'}</button>
          ${hasAny ? '' : `<a class="btn btn-text btn-sm" href="#gratitude">감사일기 적으러 가기 →</a>`}
        </div>
        ${premium && hasAny ? `<p class="prayer-privacy hint" style="margin:10px 0 0;line-height:1.6">‘생성하기’를 누르면 이 감사 기록이 맞춤 기도문 작성을 위해 안전한 AI로 전송됩니다. 그 외에는 감사일기가 기기 안에만 보관돼요.</p>` : ''}
        <div id="prayer-out"></div>
      </div>
    </div>`;

  if (premium && hasAny) {
    $('#prayer-gen', mount).addEventListener('click', async () => {
      const btn = $('#prayer-gen', mount);
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = '기도문을 엮는 중…';
      let text = '', demo = false;
      try {
        const res = await fetch('/api/prayer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: items }),
        });
        if (!res.ok) throw new Error('bad');
        text = ((await res.json()).prayer || '').trim();
        if (!text) throw new Error('empty');
      } catch (e) {
        text = composePrayer(items); demo = true;
      }
      store.set(PRAYER_KEY, { date: todayStr(), text, demo });
      $('#prayer-out', mount).innerHTML = renderPrayerOut(text, demo);
      bindPrayerOut(mount);
      btn.disabled = false; btn.textContent = label;
    });
    const last = store.get(PRAYER_KEY, null);
    if (last) { $('#prayer-out', mount).innerHTML = renderPrayerOut(last.text, last.demo); bindPrayerOut(mount); }
  }
}
function renderPrayerOut(text, demo) {
  const hint = demo
    ? '기기에서 엮은 기본 기도문이에요 (AI 연결 시 더 깊고 매끄러운 기도문을 받습니다).'
    : '한 주의 감사를 AI가 한 편의 기도로 엮어 드렸어요.';
  return `<div class="prayer-output"><h3>이번 주 감사의 기도</h3><p>${escapeHtml(text)}</p>
    <div class="po-foot"><button class="btn btn-ghost btn-sm" id="prayer-copy">복사하기</button><button class="btn btn-text btn-sm" id="prayer-regen">다시 만들기</button>
    <span class="hint" style="align-self:center">${hint}</span></div></div>`;
}
function bindPrayerOut(mount) {
  const c = $('#prayer-copy', mount); if (c) c.addEventListener('click', async () => { const ok = await copyText($('.prayer-output p', mount).textContent); c.textContent = ok ? '복사됨 ✓' : '복사 실패 — 직접 선택해 복사하세요'; setTimeout(()=>c.textContent='복사하기',1800); });
  const r = $('#prayer-regen', mount); if (r) r.addEventListener('click', () => $('#prayer-gen', mount).click());
}
function composePrayer(items) {
  const uniq = [...new Set(items.map(s => s.trim().replace(/[.,!?·]+$/, '')).filter(Boolean))];
  const pick = uniq.slice(0, 6);
  const mid = pick.length
    ? `돌아보니 ${pick.join(', ')} — 무엇 하나 당연한 것이 없었습니다. 작고 평범한 일들 속에 주님의 손길이 있었음을 이제야 봅니다.`
    : '작고 평범한 하루하루 속에 주님께서 함께하셨음을 고백합니다.';
  return `사랑이 많으신 하나님 아버지,\n지난 한 주, 베풀어 주신 은혜를 헤아리며 감사함으로 나아갑니다.\n\n${mid}\n\n당연하게 여겼던 것들이 사실은 아침마다 새롭게 부어 주신 자비였습니다(애 3:23). 이 감사가 입술의 고백으로 그치지 않고, 한 주를 살아 내는 삶의 예배가 되게 하소서.\n\n다가오는 한 주도 주님만 신뢰하며 걷게 하시고, 받은 사랑을 이웃에게도 흘려보내게 하옵소서.\n예수님의 이름으로 기도합니다. 아멘.`;
}

/* ════════════  회개 일기 (계정 보관)  ════════════ */
const CONFESSION_JOURNAL_KEY = 'veil.confession.journal';
function renderJournal() {
  const mount = $('#journal-mount'); if (!mount) return;
  const u = window.Veil && Veil.auth.current();
  if (!u) {
    mount.innerHTML = `<div class="panel journal-empty">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v9H5z" stroke-linejoin="round"/></svg>
      <h2>로그인이 필요해요</h2>
      <p class="panel-sub">로그인하면 내가 남긴 회개 일기를 계정에 보관해 다시 펴 볼 수 있어요. ‘일기에 저장’을 누르기 전에는 어디에도 보관되지 않습니다.</p>
      <button class="btn btn-gold btn-sm" id="journal-login">로그인 / 가입</button>
    </div>`;
    const b = $('#journal-login', mount); if (b) b.addEventListener('click', () => Veil.auth.openModal('login'));
    return;
  }
  const list = store.get(CONFESSION_JOURNAL_KEY, []);
  mount.innerHTML = `
    <div class="panel">
      <div class="grat-top">
        <div class="streak"><span class="streak-num">${list.length}</span><span class="streak-label">개의 기록<br/>${escapeHtml(u.name || u.email.split('@')[0])}님</span></div>
        <span class="grat-date">회개의 자리에서 남긴 일기</span>
      </div>
      ${list.length
        ? `<div class="journal-list">${list.map((e, i) => `
            <div class="journal-entry">
              <div class="je-head"><span class="je-cat">${escapeHtml(e.category || '회개')}</span><span class="je-date">${escapeHtml(e.date || '')}</span></div>
              <p class="je-text" style="white-space:pre-wrap">${escapeHtml(e.confession || '')}</p>
              ${e.verseRef ? `<div class="je-verse">받은 말씀 · ${escapeHtml(e.verseRef)}</div>` : ''}
              <button class="je-del" data-i="${i}" title="삭제">✕</button>
            </div>`).join('')}</div>`
        : `<p class="empty-note">아직 저장된 회개 일기가 없어요. <a href="index.html#repent">회개의 자리</a>에서 마음을 적고 “일기에 저장”을 눌러 보세요.</p>`}
    </div>`;
  mount.querySelectorAll('.je-del').forEach(b => b.addEventListener('click', () => {
    if (!confirm('이 회개 일기를 삭제할까요? 되돌릴 수 없어요.')) return;
    const i = +b.dataset.i; const l = store.get(CONFESSION_JOURNAL_KEY, []); l.splice(i, 1); store.set(CONFESSION_JOURNAL_KEY, l); renderJournal();
  }));
}

/* ════════════  성경 책장  ════════════ */
const BIBLE_KEY = 'veil.bible';
function getBible() { return store.get(BIBLE_KEY, {}); }   // { '창세기': [1,2,3...] }
function bookProgress(name) { const ch = (getBible()[name] || []).length; const total = BIBLE.find(b => b[0] === name)[1]; return { ch, total, pct: ch / total }; }
/* 본문 조회: 번들 샘플 → 서버리스 프록시(/api/bible, getBible) 순. 장 단위로 캐시한다. */
const verseCache = {};   // { '시편-23': ['1절', '2절', ...] }
async function fetchVerses(name, ch) {
  const key = `${name}-${ch}`;
  if (verseCache[key]) return verseCache[key];
  const sample = window.BIBLE_TEXT && window.BIBLE_TEXT[name] && window.BIBLE_TEXT[name][ch];
  if (sample) return (verseCache[key] = sample);            // 번들 샘플 우선(오프라인·무비용)
  const book = BIBLE.findIndex(b => b[0] === name) + 1;     // 정경 순서 = getBible 책 번호
  if (!book) throw new Error('unknown book');
  const r = await fetch(`/api/bible?book=${book}&chapter=${ch}`);
  if (!r.ok) throw new Error(`bible api ${r.status}`);
  const { verses } = await r.json();
  return (verseCache[key] = verses || []);
}
function renderBible() {
  const premium = tier.isPremium();
  const mount = $('#bible-mount'); if (!mount) return;
  const data = getBible();
  let readCh = 0, totalCh = 0, doneBooks = 0;
  BIBLE.forEach(([name, total]) => { const r = (data[name]||[]).length; readCh += r; totalCh += total; if (r >= total) doneBooks++; });

  const spineHtml = ([name, total, g]) => {
    const r = (data[name]||[]).length; const pct = Math.round(r/total*100);
    const hue = GROUP[g].hue;
    const h = Math.round(94 + Math.min(total, 60) * 0.95);
    const done = r >= total;
    return `<div class="spine ${done?'done':''}" data-book="${name}" role="button" tabindex="0" aria-label="${name} · ${r}/${total}장 읽음" style="height:${h}px;background:${hexA(hue,0.30)};border-color:${hexA(hue,0.45)}" title="${name} · ${r}/${total}장">
        <div class="spine-fill" style="height:${pct}%;background:${done?hue:hexA(hue,0.82)}"></div>
        <span class="spine-name" style="color:#534b41;text-shadow:0 1px 1px rgba(255,255,255,.45)">${name}</span></div>`;
  };
  // 색(장르)별로 칸막이를 세운 칸에 책을 담는다. 칸들이 가로로 늘어서며 박스를 넓게 채운다.
  const binHtml = (g, books) => {
    const hue = GROUP[g].hue;
    return `<div class="shelf-bin" style="display:flex;flex-direction:column;gap:8px;padding:10px 11px 0;background:${hexA(hue,0.10)};border:1px solid ${hexA(hue,0.38)};border-radius:10px">
        <div style="display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:2px;background:${hue}"></span><span style="font-size:11.5px;font-weight:600;letter-spacing:.02em;color:#6b6157;white-space:nowrap">${GROUP[g].name}</span></div>
        <div style="display:flex;align-items:flex-end;gap:5px;border-bottom:3px solid ${hexA(hue,0.5)};padding-bottom:10px">${books.map(spineHtml).join('')}</div>
      </div>`;
  };
  // 한 권 묶음(구약/신약)을 장르 순서대로 색 칸에 나눠 담아 가로로 펼친다.
  const testament = (label, slice) => {
    const order = []; const map = {};
    slice.forEach(b => { const g = b[2]; if (!map[g]) { map[g] = []; order.push(g); } map[g].push(b); });
    const bins = order.map(g => binHtml(g, map[g])).join('');
    return `<div class="testament-label">${label}</div><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">${bins}</div>`;
  };

  mount.innerHTML = `
    ${!premium ? `<div class="upsell"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v9H5z" stroke-linejoin="round"/></svg><div class="upsell-text"><strong>동행 멤버십</strong>: 1년 통독·맥체인 플랜 · 음성 낭독 · 하이라이트·메모 · 원어/다국어 · 완독 뱃지.<p>무료는 책장에서 읽은 장을 기록하고 색으로 완독을 표시하는 기능까지.</p></div><a class="btn btn-gold btn-sm" href="index.html#pricing">멤버십 보기</a></div>` : ''}
    <div class="shelf-wrap" style="background:linear-gradient(180deg,#FFFDF8,#F3ECDD)">
      <div class="shelf-legend" style="color:#7c7264">
        <span class="lg"><span class="sw" style="background:#E7E0D1"></span>읽기 전</span>
        <span class="lg"><span class="sw" style="background:#E0A24E"></span>읽는 중 (색이 차오름)</span>
        <span class="lg"><span class="sw" style="background:var(--gold-2);box-shadow:0 0 6px var(--gold-2)"></span>완독</span>
      </div>
      ${testament('구약 39권', BIBLE.slice(0,39))}
      ${testament('신약 27권', BIBLE.slice(39))}
    </div>
    <div class="bible-stat">
      <div><div class="bs-num">${Math.round(readCh/totalCh*100)}%</div><div class="bs-label">통독 진행 (${readCh}/${totalCh}장)</div></div>
      <div><div class="bs-num">${doneBooks}</div><div class="bs-label">완독한 책 / 66권</div></div>
      ${premium ? `<a class="btn btn-ghost btn-sm" href="#" id="plan-btn" style="margin-left:auto">1년 통독 플랜 시작</a>` : ''}
    </div>`;

  mount.querySelectorAll('.spine').forEach(s => {
    s.addEventListener('click', () => openBook(s.dataset.book));
    s.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBook(s.dataset.book); } });
  });
  const planBtn = $('#plan-btn', mount); if (planBtn) planBtn.addEventListener('click', e => { e.preventDefault(); alert('1년 통독 플랜: 오늘부터 매일 약 3~4장. (데모 — 실제 플랜 일정/알림은 서버 연동 후)'); });
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; }

function openBook(name) {
  const meta = BIBLE.find(b => b[0] === name); if (!meta) return;
  const [, total, g] = meta;
  const data = getBible(); const read = new Set(data[name] || []);
  const backdrop = $('#book-backdrop'); const panel = $('#book-panel');
  let cur = 1;
  // 본문 글자 크기(배율) — 0.8~1.8, 기기에 기억
  const FS_KEY = 'veil.bible.fontscale';
  const getFS = () => { const v = parseFloat(localStorage.getItem(FS_KEY)); return (v >= 0.8 && v <= 1.8) ? v : 1; };
  const applyFS = () => { const vs = panel.querySelector('.bp-verses'); if (vs) vs.style.fontSize = (1.02 * getFS()).toFixed(3) + 'rem'; };
  const setFS = (v) => { localStorage.setItem(FS_KEY, Math.max(0.8, Math.min(1.8, Math.round(v * 20) / 20))); applyFS(); };
  // 가운데 '펼친 책' — 왼쪽 면(목차·기록), 오른쪽 면(본문 읽기)
  panel.innerHTML = `
    <button class="bp-close" id="bp-close" aria-label="닫기" style="position:absolute;top:12px;right:14px;z-index:3"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M5 5l12 12M17 5L5 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
    <div class="bp-page" style="flex:1 1 300px;max-width:340px;min-width:0;padding:32px 24px 28px;border-right:1px solid rgba(70,52,24,.10);box-shadow:inset -18px 0 28px -22px rgba(70,52,24,.30)">
      <span class="bp-group">${GROUP[g].name}</span>
      <h2 style="margin-top:4px">${name}</h2>
      <p class="bp-meta">전 ${total}장 · 읽은 장 <strong id="bp-count">${read.size}</strong>장 (<span id="bp-pct">${Math.round(read.size/total*100)}</span>%)</p>
      <p class="hint">장을 눌러 본문을 펴 보세요. 읽은 장은 책장에 색으로 차오릅니다.</p>
      <div class="chapter-grid" id="bp-grid"></div>
      <div class="bp-actions">
        <button class="btn btn-ghost btn-sm" id="bp-all">전체 완독 표시</button>
        <button class="btn btn-text btn-sm" id="bp-clear">기록 초기화</button>
      </div>
    </div>
    <div class="bp-reader" id="bp-reader" style="flex:1.6 1 380px;min-width:0;margin-top:0;border-top:none;padding:32px 30px 28px"></div>`;

  const grid = $('#bp-grid', panel);
  function paintCells() {
    grid.querySelectorAll('.chapter-cell').forEach(c => {
      const n = +c.dataset.ch;
      c.classList.toggle('read', read.has(n));
      c.classList.toggle('sel', n === cur);
    });
  }
  function refreshMeta() {
    const c = $('#bp-count', panel), p = $('#bp-pct', panel);
    if (c) c.textContent = read.size; if (p) p.textContent = Math.round(read.size / total * 100);
  }
  for (let i = 1; i <= total; i++) {
    const cell = el(`<button class="chapter-cell" data-ch="${i}">${i}</button>`);
    cell.addEventListener('click', () => selectChapter(i));
    grid.appendChild(cell);
  }
  function renderReader() {
    const reader = $('#bp-reader', panel);
    const isRead = read.has(cur);
    reader.innerHTML = `
      <div class="bp-reader-head">
        <span class="bp-reader-title">${name} ${cur}장</span>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden" role="group" aria-label="본문 글자 크기">
            <button class="btn btn-text btn-sm" id="bp-font-dn" aria-label="글자 작게" title="글자 작게" style="padding:4px 11px;font-size:.8rem;border-radius:0">A−</button>
            <button class="btn btn-text btn-sm" id="bp-font-up" aria-label="글자 크게" title="글자 크게" style="padding:4px 11px;font-size:1.06rem;border-radius:0;border-left:1px solid var(--line)">A+</button>
          </div>
          <button class="btn btn-ghost btn-sm bp-readtoggle ${isRead ? 'is-read' : ''}" id="bp-readtoggle">${isRead ? '✓ 읽음' : '읽음으로 표시'}</button>
        </div>
      </div>
      <div class="bp-versebox" id="bp-versebox"><p class="bp-loading">본문을 불러오는 중…</p></div>
      <div class="bp-nav">
        <button class="btn btn-text btn-sm" id="bp-prev" ${cur <= 1 ? 'disabled' : ''}>← 이전 장</button>
        <button class="btn btn-text btn-sm" id="bp-next" ${cur >= total ? 'disabled' : ''}>다음 장 →</button>
      </div>
      <p class="bp-source">개역성경(개역한글 계열) · getBible 공개 본문 · 정식 출시 시 번역본 라이선스 확인</p>`;
    $('#bp-readtoggle', panel).addEventListener('click', () => {
      read.has(cur) ? read.delete(cur) : read.add(cur);
      saveBook(name, read); paintCells(); refreshMeta(); renderReader();
    });
    $('#bp-font-dn', panel).addEventListener('click', () => setFS(getFS() - 0.1));
    $('#bp-font-up', panel).addEventListener('click', () => setFS(getFS() + 0.1));
    const prev = $('#bp-prev', panel), next = $('#bp-next', panel);
    if (prev) prev.addEventListener('click', () => selectChapter(cur - 1));
    if (next) next.addEventListener('click', () => selectChapter(cur + 1));
    loadVerses(cur);
  }
  async function loadVerses(ch) {
    let verses = null;
    try { verses = await fetchVerses(name, ch); } catch (e) { verses = null; }
    if (ch !== cur) return;                                  // 그새 다른 장으로 이동했으면 폐기
    const box = $('#bp-versebox', panel); if (!box) return;
    box.innerHTML = verses && verses.length
      ? `<div class="bp-verses" style="font-size:${(1.02 * getFS()).toFixed(3)}rem">${verses.map((v, i) => `<span class="v"><span class="vn">${i+1}</span>${escapeHtml(v)}</span>`).join('')}</div>`
      : `<p class="bp-empty">본문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>`;
  }
  function selectChapter(ch) {
    cur = Math.max(1, Math.min(total, ch));
    paintCells(); renderReader();
    panel.scrollTo({ top: 0, behavior: 'smooth' });          // 새 장은 책 위에서부터 보이게
  }
  $('#bp-all', panel).addEventListener('click', () => { if (!confirm(`${name} ${total}장 전체를 ‘읽음’으로 표시할까요?`)) return; for (let i=1;i<=total;i++) read.add(i); saveBook(name, read); paintCells(); refreshMeta(); renderReader(); });
  $('#bp-clear', panel).addEventListener('click', () => { if (!read.size) return; if (!confirm(`${name}의 읽음 기록(${read.size}장)을 모두 지울까요? 되돌릴 수 없어요.`)) return; read.clear(); saveBook(name, read); paintCells(); refreshMeta(); renderReader(); });
  $('#bp-close', panel).addEventListener('click', closeBook);

  selectChapter(1);
  bookOpener = name;                                         // 닫을 때 해당 책등으로 포커스 복귀용
  // 우측 슬라이드 패널 → 화면 가운데 '펼친 책' 모달로 크게 띄운다 (인라인으로 .book-panel CSS 덮어쓰기)
  Object.assign(panel.style, {
    position: 'fixed', left: '50%', top: '50%', right: 'auto', bottom: 'auto',
    width: 'min(960px, 95vw)', height: 'auto', maxHeight: '90vh',
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch',
    padding: '0', overflowY: 'auto', borderRadius: '14px',
    background: 'linear-gradient(180deg,#FFFDF8,#F4EDDF)',
    boxShadow: '0 30px 90px rgba(45,32,12,.36)',
    transition: 'opacity .28s ease, transform .28s ease', pointerEvents: 'auto',
  });
  backdrop.classList.add('open'); panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');               // 열린 패널을 보조기기에 노출
  panel.style.opacity = '0'; panel.style.transform = 'translate(-50%,-50%) scale(.97)';
  void panel.offsetWidth;                                    // 리플로우 → 전환이 적용되도록
  panel.style.opacity = '1'; panel.style.transform = 'translate(-50%,-50%) scale(1)';
  const closeBtn = $('#bp-close', panel); if (closeBtn) closeBtn.focus();
}
function saveBook(name, set) { const d = getBible(); const arr = [...set].sort((a,b)=>a-b); if (arr.length) d[name] = arr; else delete d[name]; store.set(BIBLE_KEY, d); }
let bookOpener = null;
function closeBook() {
  const panel = $('#book-panel');
  if (!panel || !panel.classList.contains('open')) return;   // 열려 있을 때만 동작(불필요한 재렌더 방지)
  $('#book-backdrop').classList.remove('open'); panel.classList.remove('open');
  panel.style.opacity = '0';
  panel.style.transform = 'translate(-50%,-50%) scale(.97)';
  panel.style.pointerEvents = 'none';
  panel.setAttribute('aria-hidden', 'true');
  renderBible();
  if (bookOpener) { const sp = $(`.spine[data-book="${bookOpener}"]`); if (sp) { try { sp.focus(); } catch {} } bookOpener = null; }
}

/* ───────────  boot  ─────────── */
window.addEventListener('hashchange', route);
document.addEventListener('DOMContentLoaded', () => {
  renderTier();
  if (window.Veil && Veil.auth) {
    Veil.auth.mountControl(document.getElementById('auth-slot'));
    Veil.auth.onChange(() => { renderTier(); route(); });
  }
  route();
  // 데모 토글: 누구나 무료로 프리미엄을 켜는 버튼이라, 개발 모드(?dev=1 또는 저장된 플래그)에서만 노출.
  const demo = $('#demo-toggle');
  const devMode = location.search.includes('dev=1') || localStorage.getItem('veil.dev') === '1';
  if (location.search.includes('dev=1')) localStorage.setItem('veil.dev', '1');
  if (demo) {
    if (devMode) demo.addEventListener('click', () => { tier.set(!tier.isPremium()); renderTier(); route(); });
    else demo.style.display = 'none';
  }
  const bd = $('#book-backdrop'); if (bd) bd.addEventListener('click', closeBook);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBook(); });
});
