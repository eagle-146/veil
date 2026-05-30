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
  { ref: '시편 1:1-3', text: '복 있는 사람은 악인들의 꾀를 따르지 아니하며 죄인들의 길에 서지 아니하며 오만한 자들의 자리에 앉지 아니하고 오직 여호와의 율법을 즐거워하여 그의 율법을 주야로 묵상하는도다' },
  { ref: '마태복음 5:3-6', text: '심령이 가난한 자는 복이 있나니 천국이 그들의 것임이요 애통하는 자는 복이 있나니 그들이 위로를 받을 것임이요 온유한 자는 복이 있나니 그들이 땅을 기업으로 받을 것임이요' },
  { ref: '요한복음 15:4-5', text: '내 안에 거하라 나도 너희 안에 거하리라 가지가 포도나무에 붙어 있지 아니하면 스스로 열매를 맺을 수 없음 같이 너희도 내 안에 있지 아니하면 그러하리라' },
  { ref: '빌립보서 2:3-5', text: '아무 일에든지 다툼이나 허영으로 하지 말고 오직 겸손한 마음으로 각각 자기보다 남을 낫게 여기고 너희 안에 이 마음을 품으라 곧 그리스도 예수의 마음이니' },
  { ref: '로마서 12:1-2', text: '너희 몸을 하나님이 기뻐하시는 거룩한 산 제물로 드리라 이는 너희가 드릴 영적 예배니라 너희는 이 세대를 본받지 말고 오직 마음을 새롭게 함으로 변화를 받아' },
  { ref: '갈라디아서 5:22-23', text: '오직 성령의 열매는 사랑과 희락과 화평과 오래 참음과 자비와 양선과 충성과 온유와 절제니 이같은 것을 금지할 법이 없느니라' },
  { ref: '시편 23:1-4', text: '여호와는 나의 목자시니 내게 부족함이 없으리로다 그가 나를 푸른 풀밭에 누이시며 쉴 만한 물 가로 인도하시는도다 내 영혼을 소생시키시고' },
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
  pent:  { name: '모세오경', hue: '#C9A961' },
  hist:  { name: '역사서', hue: '#A88762' },
  poet:  { name: '시가서', hue: '#C58A6B' },
  major: { name: '대선지서', hue: '#8A93A0' },
  minor: { name: '소선지서', hue: '#8A9A8B' },
  gospel:{ name: '복음서', hue: '#D4B36A' },
  acts:  { name: '사도행전', hue: '#A88762' },
  paul:  { name: '바울서신', hue: '#6F8E86' },
  gen:   { name: '일반서신', hue: '#B08D5B' },
  rev:   { name: '요한계시록', hue: '#9A6B6B' },
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
const VIEW_IDS = ['gratitude', 'qt', 'daily', 'prayer', 'bible', 'journal'];
function route() {
  let id = (location.hash || '#gratitude').slice(1);
  if (!VIEW_IDS.includes(id)) id = 'gratitude';
  document.querySelectorAll('.tool-view').forEach(v => v.classList.toggle('is-active', v.id === `view-${id}`));
  document.querySelectorAll('.tools-side a').forEach(a => a.classList.toggle('is-current', a.getAttribute('href') === `#${id}`));
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
function renderGratitude() {
  const premium = tier.isPremium();
  const mount = $('#grat-mount'); if (!mount) return;
  const data = getGrat(); const today = todayStr();
  const items = data[today] && data[today].length ? data[today].slice() : ['', '', ''];
  const maxItems = premium ? 10 : FREE_GRAT_ITEMS;
  const history = Object.keys(data).filter(k => k !== today && (data[k]||[]).some(x => x.trim())).sort().reverse();
  const shownHistory = premium ? history : history.slice(0, FREE_GRAT_HISTORY);

  mount.innerHTML = `
    <div class="panel">
      <div class="grat-top">
        <div class="streak"><span class="streak-num">${gratStreak()}</span><span class="streak-label">일 연속<br/>감사의 기록</span></div>
        <span class="grat-date">${dateLabel(today)} · 오늘의 감사</span>
      </div>
      <p class="panel-sub">오늘 하루, 받은 은혜를 ${premium ? '마음껏' : `${FREE_GRAT_ITEMS}가지까지`} 적어 보세요. 당연하게 지나친 일들 속에서 감사를 발견하는 시간입니다.</p>
      <div id="grat-items"></div>
      <div class="grat-actions">
        <button class="btn btn-text btn-sm" id="grat-add" ${items.length >= maxItems ? 'disabled' : ''}>+ 감사 추가${premium ? '' : ` (무료 ${FREE_GRAT_ITEMS}개)`}</button>
        <button class="btn btn-gold btn-sm" id="grat-save">감사 저장</button>
        <span class="grat-saved" id="grat-saved">✓ 저장되었습니다</span>
      </div>
    </div>
    ${!premium ? `<div class="upsell"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v9H5z" stroke-linejoin="round"/></svg><div class="upsell-text"><strong>동행 멤버십</strong>에서는 하루 감사 무제한 · 사진 첨부 · 전체 기록 보관 · 감사 단어 통계 · 기도문 생성과 연동됩니다.<p>무료는 하루 ${FREE_GRAT_ITEMS}개 · 최근 ${FREE_GRAT_HISTORY}일 보관</p></div><a class="btn btn-gold btn-sm" href="index.html#pricing">멤버십 보기</a></div>` : ''}
    <div class="panel">
      <h2>지난 감사</h2>
      <p class="panel-sub">${premium ? '전체 기록' : `최근 ${FREE_GRAT_HISTORY}일`}</p>
      <div class="grat-history" id="grat-history"></div>
    </div>`;

  const itemsWrap = $('#grat-items', mount);
  function drawItems() {
    itemsWrap.innerHTML = '';
    items.forEach((val, i) => {
      const row = el(`<div class="grat-item"><span class="grat-no">${i+1}</span><input type="text" value="${val.replace(/"/g,'&quot;')}" placeholder="감사한 일 ${i+1}"/><button class="grat-del" title="삭제">✕</button></div>`);
      row.querySelector('input').addEventListener('input', e => items[i] = e.target.value);
      row.querySelector('.grat-del').addEventListener('click', () => { items.splice(i,1); if (!items.length) items.push(''); drawItems(); $('#grat-add', mount).disabled = items.length >= maxItems; });
      itemsWrap.appendChild(row);
    });
  }
  drawItems();
  $('#grat-add', mount).addEventListener('click', () => {
    if (items.length >= maxItems) { if (!premium) location.href = 'index.html#pricing'; return; }
    items.push(''); drawItems(); $('#grat-add', mount).disabled = items.length >= maxItems;
  });
  $('#grat-save', mount).addEventListener('click', () => {
    const clean = items.map(x => x.trim()).filter(Boolean);
    const d = getGrat(); if (clean.length) d[today] = clean; else delete d[today];
    store.set(GRAT_KEY, d);
    const s = $('#grat-saved', mount); s.classList.add('show'); setTimeout(() => s.classList.remove('show'), 1800);
    renderGratitude();
  });

  const hist = $('#grat-history', mount);
  if (!shownHistory.length) hist.innerHTML = `<p class="empty-note">아직 지난 기록이 없어요. 오늘의 첫 감사를 적어 보세요.</p>`;
  else hist.innerHTML = shownHistory.map(k => `<div class="grat-card"><div class="gc-date">${dateLabel(k)}</div><ul>${data[k].map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`).join('');
}
function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

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
      <p class="panel-sub">매일성경 식 4단계 묵상 · ${dateLabel(today)}</p>
      <div class="qt-passage">
        <div class="qt-ref">${passage.ref}</div>
        <blockquote>${passage.text}</blockquote>
      </div>
      ${premium ? `<div class="upsell" style="background:linear-gradient(135deg,#F7F8F5,var(--bg-2));border-color:var(--sage)"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" style="color:var(--sage)"><path d="M12 3.5c2.6 3.1 4.6 5.4 4.6 8.8a4.6 4.6 0 1 1-9.2 0C7.4 8.9 9.4 6.6 12 3.5Z"/></svg><div class="upsell-text"><strong>묵상 도우미</strong> — 본문 해설과 묵상 질문이 함께 제공됩니다.<p>“이 본문에서 ‘복’의 조건은 무엇이며, 나의 ‘즐거워함’은 어디에 있습니까?”</p></div></div>` : ''}
      <div id="qt-steps"></div>
      <div class="grat-actions">
        <button class="btn btn-gold btn-sm" id="qt-save">큐티 저장</button>
        <span class="grat-saved" id="qt-saved">✓ 저장되었습니다</span>
      </div>
    </div>
    ${!premium ? `<div class="upsell"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v9H5z" stroke-linejoin="round"/></svg><div class="upsell-text"><strong>동행 멤버십</strong>: 본문 해설·AI 묵상 질문 · 통독 연계 본문 · 큐티 나눔 · 누적 기록과 연속일 통계.<p>무료는 매일 본문 + 4단계 작성(기기 보관)까지.</p></div><a class="btn btn-gold btn-sm" href="index.html#pricing">멤버십 보기</a></div>` : ''}`;

  const wrap = $('#qt-steps', mount);
  steps.forEach(s => {
    const node = el(`<div class="qt-step"><div class="qt-step-head"><span class="qt-step-no">${s.no}</span><span class="qt-step-name">${s.name}</span><span class="qt-step-guide">${s.guide}</span></div><div class="field" style="margin:0"><textarea data-k="${s.key}" placeholder="${s.name}을(를) 적어 보세요">${escapeHtml(saved[s.key]||'')}</textarea></div></div>`);
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
          <button class="btn btn-gold" id="prayer-gen" ${hasAny ? '' : 'disabled'}>${hasAny ? '기도문 생성하기' : '먼저 감사일기를 적어 주세요'}</button>
          ${hasAny ? '' : `<a class="btn btn-text btn-sm" href="#gratitude">감사일기 적으러 가기 →</a>`}
        </div>
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
  return `<div class="prayer-output"><h3>이번 주 감사의 기도</h3><p>${escapeHtml(text)}</p>
    <div class="po-foot"><button class="btn btn-ghost btn-sm" id="prayer-copy">복사하기</button><button class="btn btn-text btn-sm" id="prayer-regen">다시 만들기</button>
    <span class="hint" style="align-self:center">한 주의 감사를 엮어 만든 기도문입니다</span></div></div>`;
}
function bindPrayerOut(mount) {
  const c = $('#prayer-copy', mount); if (c) c.addEventListener('click', () => { navigator.clipboard?.writeText($('.prayer-output p', mount).textContent); c.textContent = '복사됨 ✓'; setTimeout(()=>c.textContent='복사하기',1500); });
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
      <p class="panel-sub">회개 일기는 계정에 보관됩니다. 로그인하면 내가 남긴 기록을 다시 펴 볼 수 있어요. (회개 내용은 이 기기 안에만 저장됩니다.)</p>
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
              <p class="je-text">${escapeHtml(e.confession || '')}</p>
              ${e.verseRef ? `<div class="je-verse">받은 말씀 · ${escapeHtml(e.verseRef)}</div>` : ''}
              <button class="je-del" data-i="${i}" title="삭제">✕</button>
            </div>`).join('')}</div>`
        : `<p class="empty-note">아직 저장된 회개 일기가 없어요. <a href="index.html#repent">회개의 자리</a>에서 마음을 적고 “일기에 저장”을 눌러 보세요.</p>`}
    </div>`;
  mount.querySelectorAll('.je-del').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i; const l = store.get(CONFESSION_JOURNAL_KEY, []); l.splice(i, 1); store.set(CONFESSION_JOURNAL_KEY, l); renderJournal();
  }));
}

/* ════════════  성경 책장  ════════════ */
const BIBLE_KEY = 'veil.bible';
function getBible() { return store.get(BIBLE_KEY, {}); }   // { '창세기': [1,2,3...] }
function bookProgress(name) { const ch = (getBible()[name] || []).length; const total = BIBLE.find(b => b[0] === name)[1]; return { ch, total, pct: ch / total }; }
function renderBible() {
  const premium = tier.isPremium();
  const mount = $('#bible-mount'); if (!mount) return;
  const data = getBible();
  let readCh = 0, totalCh = 0, doneBooks = 0;
  BIBLE.forEach(([name, total]) => { const r = (data[name]||[]).length; readCh += r; totalCh += total; if (r >= total) doneBooks++; });

  const renderTestament = (label, slice) => {
    const spines = slice.map(([name, total, g]) => {
      const r = (data[name]||[]).length; const pct = Math.round(r/total*100);
      const hue = GROUP[g].hue;
      const h = Math.round(94 + Math.min(total, 60) * 0.95);
      const done = r >= total;
      return `<div class="spine ${done?'done':''}" data-book="${name}" style="height:${h}px;background:${hexA(hue,0.13)}" title="${name} · ${r}/${total}장">
        <div class="spine-fill" style="height:${pct}%;background:${done?hue:hexA(hue,0.75)}"></div>
        <span class="spine-name">${name}</span></div>`;
    }).join('');
    return `<div class="testament-label">${label}</div><div class="shelf">${spines}</div>`;
  };

  mount.innerHTML = `
    ${!premium ? `<div class="upsell"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v9H5z" stroke-linejoin="round"/></svg><div class="upsell-text"><strong>동행 멤버십</strong>: 1년 통독·맥체인 플랜 · 음성 낭독 · 하이라이트·메모 · 원어/다국어 · 완독 뱃지.<p>무료는 책장에서 읽은 장을 기록하고 색으로 완독을 표시하는 기능까지.</p></div><a class="btn btn-gold btn-sm" href="index.html#pricing">멤버십 보기</a></div>` : ''}
    <div class="shelf-wrap">
      <div class="shelf-legend">
        <span class="lg"><span class="sw" style="background:rgba(255,255,255,.12)"></span>읽기 전</span>
        <span class="lg"><span class="sw" style="background:#A88762"></span>읽는 중 (색이 차오름)</span>
        <span class="lg"><span class="sw" style="background:var(--gold-2);box-shadow:0 0 6px var(--gold-2)"></span>완독</span>
      </div>
      ${renderTestament('구약 39권', BIBLE.slice(0,39))}
      ${renderTestament('신약 27권', BIBLE.slice(39))}
    </div>
    <div class="bible-stat">
      <div><div class="bs-num">${Math.round(readCh/totalCh*100)}%</div><div class="bs-label">통독 진행 (${readCh}/${totalCh}장)</div></div>
      <div><div class="bs-num">${doneBooks}</div><div class="bs-label">완독한 책 / 66권</div></div>
      ${premium ? `<a class="btn btn-ghost btn-sm" href="#" id="plan-btn" style="margin-left:auto">1년 통독 플랜 시작</a>` : ''}
    </div>`;

  mount.querySelectorAll('.spine').forEach(s => s.addEventListener('click', () => openBook(s.dataset.book)));
  const planBtn = $('#plan-btn', mount); if (planBtn) planBtn.addEventListener('click', e => { e.preventDefault(); alert('1년 통독 플랜: 오늘부터 매일 약 3~4장. (데모 — 실제 플랜 일정/알림은 서버 연동 후)'); });
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; }

function openBook(name) {
  const meta = BIBLE.find(b => b[0] === name); if (!meta) return;
  const [, total, g] = meta;
  const data = getBible(); const read = new Set(data[name] || []);
  const backdrop = $('#book-backdrop'); const panel = $('#book-panel');
  let cur = 1;
  panel.innerHTML = `
    <button class="bp-close" id="bp-close" aria-label="닫기"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M5 5l12 12M17 5L5 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
    <span class="bp-group">${GROUP[g].name}</span>
    <h2>${name}</h2>
    <p class="bp-meta">전 ${total}장 · 읽은 장 <strong id="bp-count">${read.size}</strong>장 (<span id="bp-pct">${Math.round(read.size/total*100)}</span>%)</p>
    <p class="hint">장을 눌러 본문을 펴 보세요. 읽은 장은 책장에 색으로 차오릅니다.</p>
    <div class="chapter-grid" id="bp-grid"></div>
    <div class="bp-actions">
      <button class="btn btn-ghost btn-sm" id="bp-all">전체 완독 표시</button>
      <button class="btn btn-text btn-sm" id="bp-clear">기록 초기화</button>
    </div>
    <div class="bp-reader" id="bp-reader"></div>`;

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
    const verses = (window.BIBLE_TEXT && window.BIBLE_TEXT[name] && window.BIBLE_TEXT[name][cur]) || null;
    const isRead = read.has(cur);
    reader.innerHTML = `
      <div class="bp-reader-head">
        <span class="bp-reader-title">${name} ${cur}장</span>
        <button class="btn btn-ghost btn-sm bp-readtoggle ${isRead ? 'is-read' : ''}" id="bp-readtoggle">${isRead ? '✓ 읽음' : '읽음으로 표시'}</button>
      </div>
      ${verses
        ? `<div class="bp-verses">${verses.map((v, i) => `<span class="v"><span class="vn">${i+1}</span>${escapeHtml(v)}</span>`).join('')}</div>`
        : `<p class="bp-empty">이 장의 본문은 곧 제공됩니다.<br/>(현재는 일부 장만 본문을 제공하며, 전체 66권 본문은 라이선스 연동 후 추가됩니다.)</p>`}
      <div class="bp-nav">
        <button class="btn btn-text btn-sm" id="bp-prev" ${cur <= 1 ? 'disabled' : ''}>← 이전 장</button>
        <button class="btn btn-text btn-sm" id="bp-next" ${cur >= total ? 'disabled' : ''}>다음 장 →</button>
      </div>
      <p class="bp-source">샘플 본문 · 개역개정 (전체 본문은 대한성서공회 라이선스 연동 후 제공)</p>`;
    $('#bp-readtoggle', panel).addEventListener('click', () => {
      read.has(cur) ? read.delete(cur) : read.add(cur);
      saveBook(name, read); paintCells(); refreshMeta(); renderReader();
    });
    const prev = $('#bp-prev', panel), next = $('#bp-next', panel);
    if (prev) prev.addEventListener('click', () => selectChapter(cur - 1));
    if (next) next.addEventListener('click', () => selectChapter(cur + 1));
  }
  function selectChapter(ch) {
    cur = Math.max(1, Math.min(total, ch));
    paintCells(); renderReader();
    $('#bp-reader', panel).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  $('#bp-all', panel).addEventListener('click', () => { for (let i=1;i<=total;i++) read.add(i); saveBook(name, read); paintCells(); refreshMeta(); renderReader(); });
  $('#bp-clear', panel).addEventListener('click', () => { read.clear(); saveBook(name, read); paintCells(); refreshMeta(); renderReader(); });
  $('#bp-close', panel).addEventListener('click', closeBook);

  selectChapter(1);
  backdrop.classList.add('open'); panel.classList.add('open');
}
function saveBook(name, set) { const d = getBible(); const arr = [...set].sort((a,b)=>a-b); if (arr.length) d[name] = arr; else delete d[name]; store.set(BIBLE_KEY, d); }
function closeBook() { $('#book-backdrop').classList.remove('open'); $('#book-panel').classList.remove('open'); renderBible(); }

/* ───────────  boot  ─────────── */
window.addEventListener('hashchange', route);
document.addEventListener('DOMContentLoaded', () => {
  renderTier();
  if (window.Veil && Veil.auth) {
    Veil.auth.mountControl(document.getElementById('auth-slot'));
    Veil.auth.onChange(() => { renderTier(); route(); });
  }
  route();
  const demo = $('#demo-toggle');
  if (demo) demo.addEventListener('click', () => { tier.set(!tier.isPremium()); renderTier(); route(); });
  const bd = $('#book-backdrop'); if (bd) bd.addEventListener('click', closeBook);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBook(); });
});
