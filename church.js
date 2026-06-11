/* ───────────────────────────────────────────────
   Veil — 교회(B2B) 대시보드 로직
   • 교회 생성/합류 → 교적·생일 · 전교인 통독 · 기도제목/중보
   • 데이터: Supabase 테이블(churches, church_members, reading_plans,
     reading_progress, prayer_requests) — 스키마는 CHURCH_SETUP.md 참고.
   • 모든 접근은 RLS로 교회 단위 격리. 클라이언트는 Veil.cloud.client()로 획득.
   ─────────────────────────────────────────────── */
(function () {
  'use strict';

  /* ── 성경 66권(장수) — 통독 분배용. tools.js의 BIBLE와 동일 순서 ── */
  const BIBLE = [
    ['창세기',50],['출애굽기',40],['레위기',27],['민수기',36],['신명기',34],
    ['여호수아',24],['사사기',21],['룻기',4],['사무엘상',31],['사무엘하',24],
    ['열왕기상',22],['열왕기하',25],['역대상',29],['역대하',36],['에스라',10],
    ['느헤미야',13],['에스더',10],['욥기',42],['시편',150],['잠언',31],
    ['전도서',12],['아가',8],['이사야',66],['예레미야',52],['예레미야애가',5],
    ['에스겔',48],['다니엘',12],['호세아',14],['요엘',3],['아모스',9],
    ['오바댜',1],['요나',4],['미가',7],['나훔',3],['하박국',3],
    ['스바냐',3],['학개',2],['스가랴',14],['말라기',4],
    ['마태복음',28],['마가복음',16],['누가복음',24],['요한복음',21],['사도행전',28],
    ['로마서',16],['고린도전서',16],['고린도후서',13],['갈라디아서',6],['에베소서',6],
    ['빌립보서',4],['골로새서',4],['데살로니가전서',5],['데살로니가후서',3],['디모데전서',6],
    ['디모데후서',4],['디도서',3],['빌레몬서',1],['히브리서',13],['야고보서',5],
    ['베드로전서',5],['베드로후서',3],['요한일서',5],['요한이서',1],['요한삼서',1],
    ['유다서',1],['요한계시록',22],
  ];
  // 1189장을 [{book, ch}] 평탄화
  const FLAT = [];
  BIBLE.forEach(([name, n]) => { for (let c = 1; c <= n; c++) FLAT.push({ book: name, ch: c }); });
  const TOTAL_CH = FLAT.length; // 1189

  /* ── 유틸 ── */
  const app = document.getElementById('church-app');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  function toast(msg) {
    let t = document.querySelector('.ch-toast');
    if (!t) { t = el('<div class="ch-toast"></div>'); document.body.appendChild(t); }
    t.textContent = msg; requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  function daysBetween(fromStr, toStr) {
    const a = new Date(fromStr + 'T00:00:00'), b = new Date(toStr + 'T00:00:00');
    return Math.floor((b - a) / 86400000);
  }
  function genCode() {
    const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const a = new Uint8Array(6); crypto.getRandomValues(a);
    return [...a].map(x => cs[x % cs.length]).join('');
  }
  // 장 묶음 → "창세기 1–3장" 식으로 표기
  function groupChapters(slice) {
    if (!slice.length) return '—';
    const parts = []; let curBook = null, start = null, prev = null;
    slice.forEach(({ book, ch }) => {
      if (book !== curBook) { if (curBook) parts.push(rng(curBook, start, prev)); curBook = book; start = ch; }
      prev = ch;
    });
    if (curBook) parts.push(rng(curBook, start, prev));
    return parts.join(', ');
    function rng(b, s, e) { return s === e ? `${b} ${s}장` : `${b} ${s}–${e}장`; }
  }
  // 한 '일차'가 읽는 분량 (순차 또는 맥체인식 4트랙)
  function dayReading(plan, dayIndex) {
    const days = plan.days || 365;
    if (plan.kind === 'mccheyne') {
      const q = Math.floor(TOTAL_CH / 4);
      const tracks = [[0, q], [q, 2*q], [2*q, 3*q], [3*q, TOTAL_CH]];
      const slice = tracks.flatMap(([s, e]) => { const len = e - s; return FLAT.slice(s + Math.floor(dayIndex*len/days), s + Math.floor((dayIndex+1)*len/days)); });
      return groupChapters(slice);
    }
    return groupChapters(FLAT.slice(Math.floor(dayIndex*TOTAL_CH/days), Math.floor((dayIndex+1)*TOTAL_CH/days)));
  }

  /* ── 상태 ── */
  let db = null;
  const state = { user: null, churches: [], churchId: null, church: null, role: 'member', view: 'home', editingMemberId: null, attDate: null, attType: '주일오전', attRows: [], groups: [], qtShares: [], servicePlans: [], openPlanId: null, sermons: [], openSermonId: null, editingSermonId: null, bulletins: [], openBulletinId: null, editingBulletinId: null, newcomers: [], notices: [], serveSlots: [], finance: [], prayerComments: {}, prayerFilter: 'all', openPrayerId: null,
                  members: [], plan: null, myProgress: new Set(), allProgress: [], prayers: [] };
  const LAST_KEY = 'veil.church.last';
  const isAdmin = () => state.role === 'admin' || (state.church && state.church.owner_id === state.user?.id);
  const myMember = () => state.members.find(m => m.user_id === state.user?.id) || null;

  /* ════════════ 부팅 ════════════ */
  let booting = false;
  async function boot() {
    if (booting) return; booting = true;
    try {
      if (!window.Veil) { app.innerHTML = '<div class="ch-empty">초기화 오류: Veil 로드 실패</div>'; return; }
      if (!Veil.cloud.enabled) { renderCloudOff(); return; }
      state.user = Veil.auth.current();
      if (!state.user) { renderLoginGate(); return; }
      db = await Veil.cloud.client();
      await loadChurches();
      if (!state.churches.length) { renderSetup(); return; }
      // 선택된 교회 결정
      const last = localStorage.getItem(LAST_KEY);
      state.churchId = (state.churches.find(c => c.id === last) ? last : state.churches[0].id);
      await selectChurch(state.churchId);
    } catch (e) {
      console.error('[Veil 교회] boot 오류', e);
      app.innerHTML = `<div class="ch-empty">불러오기 오류: ${esc(e.message || e)}</div>`;
    } finally { booting = false; }
  }

  async function loadChurches() {
    const { data, error } = await db.from('churches').select('*').order('created_at');
    if (error) throw error;
    state.churches = data || [];
  }
  async function selectChurch(cid) {
    state.churchId = cid; localStorage.setItem(LAST_KEY, cid);
    state.church = state.churches.find(c => c.id === cid);
    await loadMembers();
    const me = myMember();
    state.role = me ? me.role : (state.church.owner_id === state.user.id ? 'admin' : 'member');
    await Promise.all([loadPlan(), loadPrayers(), loadGroups(), loadQtShares(), loadServicePlans(), loadSermons(), loadBulletins(), loadNewcomers(), loadNotices(), loadServeSlots(), loadFinance()]);
    renderDashboard();
  }
  async function loadMembers() {
    const { data, error } = await db.from('church_members').select('*').eq('church_id', state.churchId).order('name');
    if (error) throw error;
    state.members = data || [];
  }
  async function loadPlan() {
    const { data, error } = await db.from('reading_plans').select('*').eq('church_id', state.churchId).order('created_at', { ascending: false }).limit(1);
    if (error) throw error;
    state.plan = (data && data[0]) || null;
    state.myProgress = new Set(); state.allProgress = [];
    if (state.plan) {
      const { data: mine } = await db.from('reading_progress').select('day_index').eq('plan_id', state.plan.id).eq('user_id', state.user.id);
      (mine || []).forEach(r => state.myProgress.add(r.day_index));
      if (isAdmin()) {
        const { data: all } = await db.from('reading_progress').select('user_id,day_index').eq('plan_id', state.plan.id);
        state.allProgress = all || [];
      }
    }
  }
  async function loadPrayers() {
    const { data, error } = await db.from('prayer_requests').select('*').eq('church_id', state.churchId).order('created_at', { ascending: false });
    if (error) throw error;
    state.prayers = data || [];
    const { data: cm } = await db.from('prayer_comments').select('*').eq('church_id', state.churchId).order('created_at');
    state.prayerComments = {};
    (cm || []).forEach(c => { (state.prayerComments[c.prayer_id] = state.prayerComments[c.prayer_id] || []).push(c); });
  }

  /* ════════════ 화면: 클라우드 꺼짐 / 로그인 ════════════ */
  function renderCloudOff() {
    app.innerHTML = `<div class="church-gate"><h1>교회 기능 준비 중</h1>
      <p>교회 대시보드는 클라우드(Supabase) 연결이 필요합니다. 관리자에게 문의해 주세요.</p>
      <a class="btn btn-ghost" href="index.html">홈으로</a></div>`;
  }
  function renderLoginGate() {
    app.innerHTML = `<div class="church-gate">
      <svg class="gate-mark" viewBox="0 0 64 64" fill="currentColor"><path d="M14 13 H50 a2.4 2.4 0 0 1 2.34 2.92 L49.3 49.1 A2.4 2.4 0 0 1 46.96 51 H42 a2 2 0 0 1 -1.95 -2.44 C41.6 42 33.9 24.6 32 21 C30.1 24.6 22.4 42 23.95 48.56 A2 2 0 0 1 22 51 H17.04 A2.4 2.4 0 0 1 14.7 49.1 L11.66 15.92 A2.4 2.4 0 0 1 14 13 Z"/></svg>
      <h1>교회 관리</h1>
      <p>로그인하면 교회를 만들거나, 초대코드로 합류할 수 있어요.</p>
      <button class="btn btn-gold" id="gate-login">로그인 / 가입</button></div>`;
    document.getElementById('gate-login').addEventListener('click', () => Veil.auth.openModal('login'));
  }

  /* ════════════ 화면: 교회 생성/합류 ════════════ */
  function renderSetup() {
    setBadge(null);
    const myName = state.user.name || (state.user.email || '').split('@')[0];
    app.innerHTML = `<div class="church-gate">
      <h1>교회 시작하기</h1>
      <p>교회를 새로 만들거나, 담당자에게 받은 초대코드로 합류하세요.</p>
      <div class="setup-grid">
        <div class="setup-card">
          <h3>① 교회 만들기</h3><p class="sub">목회자·관리자용. 만들면 초대코드가 생성됩니다.</p>
          <div class="field"><label>교회 이름</label><input type="text" id="new-church-name" placeholder="예) 빛드림교회" /></div>
          <div class="field"><label>내 이름(표시용)</label><input type="text" id="new-admin-name" value="${esc(myName)}" /></div>
          <p class="ch-err" id="create-err" hidden></p>
          <button class="btn btn-gold btn-block" id="create-church">교회 만들기</button>
        </div>
        <div class="setup-card">
          <h3>② 초대코드로 합류</h3><p class="sub">교인용. 담당자에게 받은 6자리 코드를 입력하세요.</p>
          <div class="field"><label>초대코드</label><input type="text" id="join-code" placeholder="예) K7M2QP" style="text-transform:uppercase;letter-spacing:.12em" /></div>
          <div class="field"><label>내 이름</label><input type="text" id="join-name" value="${esc(myName)}" /></div>
          <p class="ch-err" id="join-err" hidden></p>
          <button class="btn btn-ghost btn-block" id="join-church">합류하기</button>
        </div>
      </div></div>`;

    const showErr = (id, msg) => { const e = document.getElementById(id); e.textContent = msg; e.hidden = false; };
    document.getElementById('create-church').addEventListener('click', async (ev) => {
      const name = document.getElementById('new-church-name').value.trim();
      const admin = document.getElementById('new-admin-name').value.trim();
      if (!name) return showErr('create-err', '교회 이름을 입력해 주세요.');
      ev.target.disabled = true; ev.target.textContent = '생성 중…';
      try {
        const code = genCode();
        const { data: ch, error } = await db.from('churches').insert({ name, owner_id: state.user.id, invite_code: code }).select().single();
        if (error) throw error;
        const { error: e2 } = await db.from('church_members').insert({ church_id: ch.id, user_id: state.user.id, name: admin || '관리자', role: 'admin' });
        if (e2) throw e2;
        toast('교회가 만들어졌습니다.');
        await loadChurches(); await selectChurch(ch.id);
      } catch (e) { showErr('create-err', e.message || '생성 실패'); ev.target.disabled = false; ev.target.textContent = '교회 만들기'; }
    });
    document.getElementById('join-church').addEventListener('click', async (ev) => {
      const code = document.getElementById('join-code').value.trim().toUpperCase();
      const name = document.getElementById('join-name').value.trim();
      if (!code) return showErr('join-err', '초대코드를 입력해 주세요.');
      ev.target.disabled = true; ev.target.textContent = '합류 중…';
      try {
        const { data: cid, error } = await db.rpc('join_church', { code, display_name: name });
        if (error) throw error;
        toast('교회에 합류했습니다.');
        await loadChurches(); await selectChurch(cid);
      } catch (e) { showErr('join-err', e.message || '합류 실패. 코드를 확인해 주세요.'); ev.target.disabled = false; ev.target.textContent = '합류하기'; }
    });
  }

  /* ════════════ 대시보드 ════════════ */
  const PLAN_LABEL = { seed: '씨앗', lamp: '등불', beacon: '등대', temple: '성전' };
  const TAB_GROUPS = [
    { label: '', tabs: [['home', '홈']] },
    { label: '목양', tabs: [['members', '교적·생일'], ['attendance', '출석'], ['groups', '구역·셀'], ['newcomer', '새가족']] },
    { label: '말씀', tabs: [['reading', '통독'], ['qt', '큐티']] },
    { label: '예배', tabs: [['worship', '콘티'], ['sermon', '설교'], ['bulletin', '주보']] },
    { label: '소통', tabs: [['prayer', '기도제목'], ['notice', '공지']] },
    { label: '운영', tabs: [['serve', '봉사'], ['finance', '헌금·재정'], ['settings', '설정']] },
  ];
  function tabsHtml() {
    return TAB_GROUPS.map(g =>
      `<div class="tab-group">${g.label ? `<span class="tab-glabel">${g.label}</span>` : ''}${g.tabs.map(([id, label]) =>
        `<button data-view="${id}" class="${state.view === id ? 'active' : ''}">${label}${id === 'prayer' && state.prayers.length ? `<span class="tab-count">${state.prayers.length}</span>` : ''}</button>`).join('')}</div>`
    ).join('');
  }
  function setBadge(name) {
    const b = document.getElementById('church-badge');
    if (!b) return;
    if (name) { document.getElementById('church-badge-name').textContent = name; b.hidden = false; } else b.hidden = true;
  }
  function renderDashboard() {
    setBadge(state.church.name);
    const admin = isAdmin();
    const switcher = state.churches.length > 1
      ? `<select class="ch-switch" id="ch-switch">${state.churches.map(c => `<option value="${c.id}" ${c.id===state.churchId?'selected':''}>${esc(c.name)}</option>`).join('')}</select>` : '';
    app.innerHTML = `
      <div class="church-head">
        <div class="ch-title">
          <h1>${esc(state.church.name)}</h1>
          <div class="ch-meta">
            <span class="ch-plan">${PLAN_LABEL[state.church.plan] || '씨앗'}</span>
            <span>교인 ${state.members.length}명</span>
            ${admin ? `<span class="ch-invite">초대코드 <code>${esc(state.church.invite_code)}</code><button id="copy-code">복사</button></span>` : ''}
          </div>
        </div>
        ${switcher}
      </div>
      <div class="church-tabs" id="ch-tabs">${tabsHtml()}</div>
      <div id="ch-view"></div>`;
    const sw = document.getElementById('ch-switch');
    if (sw) sw.addEventListener('change', e => selectChurch(e.target.value));
    const copy = document.getElementById('copy-code');
    if (copy) copy.addEventListener('click', () => { navigator.clipboard?.writeText(state.church.invite_code); toast('초대코드를 복사했습니다.'); });
    document.querySelectorAll('#ch-tabs button').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.view; renderDashboard(); }));
    renderView();
  }
  function renderView() {
    if (state.view === 'home') return renderHome();
    if (state.view === 'members') return renderMembers();
    if (state.view === 'attendance') return renderAttendance();
    if (state.view === 'groups') return renderGroups();
    if (state.view === 'qt') return renderQt();
    if (state.view === 'worship') return renderWorship();
    if (state.view === 'sermon') return renderSermon();
    if (state.view === 'bulletin') return renderBulletin();
    if (state.view === 'newcomer') return renderNewcomer();
    if (state.view === 'notice') return renderNotice();
    if (state.view === 'serve') return renderServe();
    if (state.view === 'finance') return renderFinance();
    if (state.view === 'settings') return renderSettings();
    if (state.view === 'reading') return renderReading();
    if (state.view === 'prayer') return renderPrayer();
  }

  /* ════════════ 홈 요약 ════════════ */
  function planPct() { return state.plan ? Math.round(state.myProgress.size / state.plan.days * 100) : 0; }
  function renderHome() {
    const v = document.getElementById('ch-view');
    const t = new Date(), tm = t.getMonth()+1, td = t.getDate();
    const todays = state.members.filter(m => m.birthday && +m.birthday.split('-')[1] === tm && +m.birthday.split('-')[2] === td);
    const openP = state.prayers.filter(p => p.status !== 'answered');
    const recent = state.prayers.slice(0, 4);
    const topNotice = state.notices[0];
    const nextServeDate = state.serveSlots.length ? state.serveSlots[0].serve_date : null;
    const nextServe = nextServeDate ? state.serveSlots.filter(s => s.serve_date === nextServeDate) : [];
    v.innerHTML = `
      <div class="home-grid">
        <button class="home-card" data-go="members"><span class="hc-num">${state.members.length}</span><span class="hc-label">교인</span></button>
        <button class="home-card" data-go="members"><span class="hc-num">${todays.length}</span><span class="hc-label">오늘의 생일</span></button>
        <button class="home-card" data-go="reading"><span class="hc-num">${state.plan ? planPct()+'%' : '—'}</span><span class="hc-label">통독 진행</span></button>
        <button class="home-card" data-go="prayer"><span class="hc-num">${openP.length}</span><span class="hc-label">기도 중</span></button>
      </div>
      ${topNotice ? `<div class="panel notice-card ${topNotice.pinned?'pinned':''}" style="cursor:pointer" data-go="notice">
        <div class="no-head">${topNotice.pinned?'<span class="no-pin">📌</span>':''}<strong>${esc(topNotice.title)}</strong><span class="no-date">${esc((topNotice.created_at||'').slice(0,10))}</span></div>
        ${topNotice.body ? `<p class="no-body">${esc(topNotice.body)}</p>` : ''}
      </div>` : ''}
      <div class="panel">
        <div class="ch-section-head"><h2>오늘의 생일</h2></div>
        ${todays.length ? todays.map(m => `<span class="bday-chip">${esc(m.name)} 🎂</span>`).join('') : '<p class="plan-meta">오늘 생일인 교인이 없습니다.</p>'}
      </div>
      ${nextServe.length ? `<div class="panel"><div class="ch-section-head"><h2>봉사 <span class="plan-meta">${esc((nextServeDate||'').slice(0,10))}</span></h2><button class="btn btn-text btn-sm" data-go="serve">전체 →</button></div>
        <div class="sv-list">${nextServe.slice(0,8).map(s => `<div class="sv-row"><span class="sv-role">${esc(s.role)}</span><span class="sv-assignee">${esc(s.assignee||'미정')}</span></div>`).join('')}</div></div>` : ''}
      <div class="panel">
        <div class="ch-section-head"><h2>최근 기도제목</h2><button class="btn btn-text btn-sm" data-go="prayer">전체 보기 →</button></div>
        ${recent.length ? `<div class="pr-list">${recent.map(p => prayerCard(p, isAdmin())).join('')}</div>` : '<div class="ch-empty">아직 기도제목이 없습니다.</div>'}
      </div>`;
    v.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.go; renderDashboard(); }));
    v.querySelectorAll('[data-pr-act]').forEach(b => b.addEventListener('click', () => prayerAction(b.dataset.prAct, b.dataset.id)));
  }

  /* ════════════ 교적 · 생일 ════════════ */
  async function sendBirthdayAlimtalk() {
    const t = new Date(), tm = t.getMonth() + 1, td = t.getDate();
    const todays = state.members.filter(m => m.birthday && +m.birthday.split('-')[1] === tm && +m.birthday.split('-')[2] === td);
    const recipients = todays.filter(m => m.phone).map(m => ({ name: m.name, phone: m.phone }));
    if (!recipients.length) { toast('연락처가 등록된 오늘 생일자가 없습니다.'); return; }
    try {
      const r = await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'birthday', church: state.church.name, recipients }) });
      const data = await r.json();
      if (data.status === 'not_configured') toast(`알림톡 미설정 — 대상 ${data.would_send}명. 대행사 키 등록 후 발송됩니다.`);
      else if (data.status === 'sent') toast(`${recipients.length}명에게 생일 축하를 보냈습니다. 🎂`);
      else toast(data.message || '알림톡 발송은 준비 중입니다.');
    } catch (e) { toast('발송 요청 실패: ' + (e.message || e)); }
  }
  function renderMembers() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    const editing = admin ? state.members.find(m => m.id === state.editingMemberId) : null;
    const md = (b) => { if (!b) return null; const p = b.split('-'); return { m: +p[1], d: +p[2] }; };
    const t = new Date(), tm = t.getMonth()+1, td = t.getDate();
    const withB = state.members.filter(m => m.birthday).map(m => ({ ...m, _b: md(m.birthday) }));
    const todays = withB.filter(m => m._b.m === tm && m._b.d === td);
    const month = withB.filter(m => m._b.m === tm).sort((a,b) => a._b.d - b._b.d);
    const cake = '<svg class="cake" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 21h16v-7H4zM4 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2M12 8V5M9 6l3-3 3 3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    v.innerHTML = `
      <div class="bday-strip">
        <div class="bday-box today"><h3>${cake} 오늘의 생일</h3>${
          todays.length ? todays.map(m => `<span class="bday-chip">${esc(m.name)} <span class="d">🎂</span></span>`).join('') + (admin ? '<div style="margin-top:10px"><button class="btn btn-gold btn-sm" id="bday-alimtalk">🎂 축하 알림톡 보내기</button></div>' : '')
          : '<p class="plan-meta">오늘 생일인 교인이 없습니다.</p>'}</div>
        <div class="bday-box"><h3>${cake} 이번 달 생일</h3>${
          month.length ? month.map(m => `<span class="bday-chip"><span class="d">${m._b.d}일</span> ${esc(m.name)}</span>`).join('')
          : '<p class="plan-meta">이번 달 생일이 없습니다.</p>'}</div>
      </div>
      ${admin ? `
      <div class="panel" id="m-form-panel">
        <div class="ch-section-head"><h2>${editing ? '교인 정보 수정' : '교인 등록'}</h2></div>
        <div class="ch-form-row">
          <div class="field"><label>이름</label><input type="text" id="m-name" placeholder="홍길동" value="${editing ? esc(editing.name) : ''}" /></div>
          <div class="field"><label>생일</label><input type="date" id="m-bday" value="${editing && editing.birthday ? editing.birthday : ''}" /></div>
          <div class="field"><label>연락처</label><input type="text" id="m-phone" placeholder="010-0000-0000" value="${editing ? esc(editing.phone||'') : ''}" /></div>
          <div class="field" style="flex:0 0 110px"><label>역할</label><select id="m-role">${['member','leader','admin'].map(r => `<option value="${r}" ${editing&&editing.role===r?'selected':''}>${({member:'교인',leader:'리더',admin:'관리자'})[r]}</option>`).join('')}</select></div>
          <button class="btn btn-gold btn-sm" id="m-add" style="margin-bottom:2px">${editing ? '저장' : '추가'}</button>
          ${editing ? '<button class="btn btn-ghost btn-sm" id="m-cancel" style="margin-bottom:2px">취소</button>' : ''}
        </div>
        <p class="ch-err" id="m-err" hidden></p>
      </div>` : ''}
      <div class="panel">
        <div class="ch-section-head"><h2>교적부 <span class="plan-meta">${state.members.length}명</span></h2>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="m-search" class="ch-search" placeholder="이름 검색" />
            ${admin && state.members.length ? '<button class="btn btn-ghost btn-sm" id="m-csv">CSV</button>' : ''}
          </div></div>
        ${state.members.length ? `<table class="member-table"><thead><tr><th>이름</th><th>역할</th><th>생일</th><th>연락처</th>${admin?'<th></th>':''}</tr></thead><tbody>${
          state.members.map(m => `<tr>
            <td><strong>${esc(m.name)}</strong>${m.user_id?' <span class="plan-meta">·앱</span>':''}</td>
            <td><span class="role-tag role-${m.role}">${({admin:'관리자',leader:'리더',member:'교인'})[m.role]||'교인'}</span></td>
            <td>${m.birthday ? esc(m.birthday.slice(5).replace('-','월 ')+'일') : '—'}</td>
            <td>${esc(m.phone||'—')}</td>
            ${admin?`<td style="text-align:right;white-space:nowrap"><button class="row-edit" data-id="${m.id}" title="수정">✎</button> <button class="row-del" data-id="${m.id}" title="삭제">✕</button></td>`:''}
          </tr>`).join('')}</tbody></table>` : '<div class="ch-empty">아직 등록된 교인이 없습니다.</div>'}
      </div>`;

    const btBtn = document.getElementById('bday-alimtalk');
    if (btBtn) btBtn.addEventListener('click', sendBirthdayAlimtalk);
    if (admin) {
      const addBtn = document.getElementById('m-add');
      addBtn.addEventListener('click', async () => {
        const name = document.getElementById('m-name').value.trim();
        const err = document.getElementById('m-err');
        if (!name) { err.textContent = '이름을 입력해 주세요.'; err.hidden = false; return; }
        err.hidden = true; addBtn.disabled = true;
        const row = { name,
          birthday: document.getElementById('m-bday').value || null,
          phone: document.getElementById('m-phone').value.trim() || null,
          role: document.getElementById('m-role').value };
        try {
          if (editing) {
            const { error } = await db.from('church_members').update(row).eq('id', editing.id);
            if (error) throw error;
            state.editingMemberId = null; toast('수정했습니다.');
          } else {
            const { error } = await db.from('church_members').insert({ church_id: state.churchId, ...row });
            if (error) throw error;
            toast('교인을 등록했습니다.');
          }
          await loadMembers(); renderDashboard();
        } catch (e) { err.textContent = e.message || '저장 실패'; err.hidden = false; addBtn.disabled = false; }
      });
      const cancelBtn = document.getElementById('m-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => { state.editingMemberId = null; renderDashboard(); });
      v.querySelectorAll('.row-edit').forEach(b => b.addEventListener('click', () => {
        state.editingMemberId = b.dataset.id; renderDashboard();
        const fp = document.getElementById('m-form-panel'); if (fp) fp.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }));
      v.querySelectorAll('.row-del').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('이 교인을 교적에서 삭제할까요?')) return;
        const { error } = await db.from('church_members').delete().eq('id', b.dataset.id);
        if (error) { toast('삭제 실패: ' + error.message); return; }
        if (state.editingMemberId === b.dataset.id) state.editingMemberId = null;
        toast('삭제했습니다.'); await loadMembers(); renderDashboard();
      }));
      const csvBtn = document.getElementById('m-csv');
      if (csvBtn) csvBtn.addEventListener('click', () => {
        const label = { admin: '관리자', leader: '리더', member: '교인' };
        const head = ['이름', '역할', '생일', '연락처', '앱연결'];
        const rows = state.members.map(m => [m.name, label[m.role] || m.role, m.birthday || '', m.phone || '', m.user_id ? 'Y' : 'N']);
        const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `${state.church.name}_교적_${todayStr()}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast('CSV를 내보냈습니다.');
      });
    }
    const search = document.getElementById('m-search');
    if (search) search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      v.querySelectorAll('.member-table tbody tr').forEach(tr => {
        const nm = ((tr.querySelector('td strong') || {}).textContent || '').toLowerCase();
        tr.style.display = (!q || nm.includes(q)) ? '' : 'none';
      });
    });
  }

  /* ════════════ 출석 ════════════ */
  const SERVICE_TYPES = ['주일오전', '주일오후', '수요예배', '금요기도', '새벽기도'];
  async function loadAttendance() {
    const { data, error } = await db.from('attendance').select('member_id')
      .eq('church_id', state.churchId).eq('service_date', state.attDate).eq('service_type', state.attType);
    state.attRows = error ? [] : (data || []);
  }
  async function renderAttendance() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    if (!state.attDate) state.attDate = todayStr();
    v.innerHTML = '<div class="church-loading">출석 불러오는 중…</div>';
    await loadAttendance();
    if (state.view !== 'attendance') return;
    const present = new Set(state.attRows.map(r => r.member_id));
    const mine = myMember();
    const iAmPresent = mine && present.has(mine.id);
    v.innerHTML = `
      <div class="panel">
        <div class="ch-section-head"><h2>출석 체크</h2><span class="att-count">출석 <strong>${present.size}</strong> · 교인 ${state.members.length}명</span></div>
        <div class="ch-form-row" style="margin-bottom:14px">
          <div class="field" style="flex:0 0 160px"><label>날짜</label><input type="date" id="att-date" value="${state.attDate}" /></div>
          <div class="field" style="flex:0 0 150px"><label>예배</label><select id="att-type">${SERVICE_TYPES.map(s => `<option ${s===state.attType?'selected':''}>${s}</option>`).join('')}</select></div>
        </div>
        ${mine ? `<button class="btn ${iAmPresent?'btn-ghost':'btn-gold'} btn-sm" id="att-self">${iAmPresent ? '✓ 출석 체크됨' : '나 출석 체크'}</button>`
               : '<p class="plan-meta">앱에 연결된 교인만 셀프 출석 체크가 가능합니다.</p>'}
      </div>
      ${admin ? `<div class="panel">
        <div class="ch-section-head"><h2>출석부 <span class="plan-meta">${state.attDate} · ${esc(state.attType)}</span></h2></div>
        ${state.members.length ? `<div class="att-roster">${state.members.map(m => `
          <label class="att-item ${present.has(m.id)?'on':''}"><input type="checkbox" data-mid="${m.id}" ${present.has(m.id)?'checked':''} /><span>${esc(m.name)}</span></label>`).join('')}</div>`
          : '<div class="ch-empty">먼저 교적에 교인을 등록하세요.</div>'}
      </div>` : ''}`;
    const dateEl = document.getElementById('att-date');
    if (dateEl) dateEl.addEventListener('change', e => { state.attDate = e.target.value; renderAttendance(); });
    const typeEl = document.getElementById('att-type');
    if (typeEl) typeEl.addEventListener('change', e => { state.attType = e.target.value; renderAttendance(); });
    const selfBtn = document.getElementById('att-self');
    if (selfBtn && mine) selfBtn.addEventListener('click', () => toggleAttendance(mine.id, !iAmPresent));
    if (admin) v.querySelectorAll('.att-roster input').forEach(cb => cb.addEventListener('change', () => toggleAttendance(cb.dataset.mid, cb.checked)));
  }
  async function toggleAttendance(memberId, present) {
    try {
      if (present) {
        const { error } = await db.from('attendance').insert({ church_id: state.churchId, member_id: memberId, service_date: state.attDate, service_type: state.attType });
        if (error && !/duplicate|unique/i.test(error.message)) throw error;
      } else {
        const { error } = await db.from('attendance').delete()
          .eq('church_id', state.churchId).eq('member_id', memberId).eq('service_date', state.attDate).eq('service_type', state.attType);
        if (error) throw error;
      }
      await renderAttendance();
    } catch (e) { toast('출석 저장 실패: ' + (e.message || e)); }
  }

  /* ════════════ 구역 / 셀 ════════════ */
  async function loadGroups() {
    const { data, error } = await db.from('church_groups').select('*').eq('church_id', state.churchId).order('name');
    state.groups = error ? [] : (data || []);
  }
  async function reloadGroupData() { await Promise.all([loadMembers(), loadGroups()]); renderDashboard(); }
  function renderGroups() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    const byGroup = (gid) => state.members.filter(m => m.group_id === gid);
    const unassigned = state.members.filter(m => !m.group_id);
    v.innerHTML = `
      ${admin ? `<div class="panel">
        <div class="ch-section-head"><h2>구역 / 셀 만들기</h2></div>
        <div class="ch-form-row">
          <div class="field"><label>이름</label><input type="text" id="g-name" placeholder="예) 1구역 · 청년셀" /></div>
          <button class="btn btn-gold btn-sm" id="g-add" style="margin-bottom:2px">추가</button>
        </div>
        <p class="ch-err" id="g-err" hidden></p>
      </div>` : ''}
      ${state.groups.length ? state.groups.map(g => {
        const ms = byGroup(g.id);
        return `<div class="panel group-card">
          <div class="ch-section-head"><h2>${esc(g.name)} <span class="plan-meta">${ms.length}명</span></h2>${admin ? `<button class="btn btn-text btn-sm g-del" data-id="${g.id}">삭제</button>` : ''}</div>
          <div class="group-members">${ms.length ? ms.map(m => `<span class="group-chip ${m.id===g.leader_member_id?'leader':''}">${m.id===g.leader_member_id?'★ ':''}${esc(m.name)}${admin ? ` <button class="gm-remove" data-mid="${m.id}" title="제외">✕</button>` : ''}</span>`).join('') : '<span class="plan-meta">배정된 교인이 없습니다.</span>'}</div>
          ${admin ? `<div class="ch-form-row" style="margin-top:12px">
            <select class="ch-search g-assign" data-gid="${g.id}"><option value="">+ 교인 배정</option>${unassigned.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
            ${ms.length ? `<select class="ch-search g-leader" data-gid="${g.id}"><option value="">리더 지정</option>${ms.map(m => `<option value="${m.id}" ${m.id===g.leader_member_id?'selected':''}>${esc(m.name)}</option>`).join('')}</select>` : ''}
          </div>` : ''}
        </div>`;
      }).join('') : `<div class="ch-empty">아직 구역/셀이 없습니다.${admin ? ' 위에서 만들어 보세요.' : ''}</div>`}
      ${admin && unassigned.length ? `<div class="panel"><div class="ch-section-head"><h2>미배정 <span class="plan-meta">${unassigned.length}명</span></h2></div><div class="group-members">${unassigned.map(m => `<span class="group-chip">${esc(m.name)}</span>`).join('')}</div></div>` : ''}`;
    if (!admin) return;
    const addBtn = document.getElementById('g-add');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const name = document.getElementById('g-name').value.trim();
      const err = document.getElementById('g-err');
      if (!name) { err.textContent = '이름을 입력해 주세요.'; err.hidden = false; return; }
      addBtn.disabled = true;
      try { const { error } = await db.from('church_groups').insert({ church_id: state.churchId, name }); if (error) throw error; toast('구역을 만들었습니다.'); await reloadGroupData(); }
      catch (e) { err.textContent = e.message || '생성 실패'; err.hidden = false; addBtn.disabled = false; }
    });
    v.querySelectorAll('.g-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('이 구역을 삭제할까요? (교인은 미배정으로 돌아갑니다)')) return;
      const { error } = await db.from('church_groups').delete().eq('id', b.dataset.id);
      if (error) { toast('삭제 실패: ' + error.message); return; } toast('삭제했습니다.'); await reloadGroupData();
    }));
    v.querySelectorAll('.gm-remove').forEach(b => b.addEventListener('click', async () => {
      const { error } = await db.from('church_members').update({ group_id: null }).eq('id', b.dataset.mid);
      if (error) { toast('실패: ' + error.message); return; } await reloadGroupData();
    }));
    v.querySelectorAll('.g-assign').forEach(s => s.addEventListener('change', async () => {
      if (!s.value) return;
      const { error } = await db.from('church_members').update({ group_id: s.dataset.gid }).eq('id', s.value);
      if (error) { toast('배정 실패: ' + error.message); return; } toast('배정했습니다.'); await reloadGroupData();
    }));
    v.querySelectorAll('.g-leader').forEach(s => s.addEventListener('change', async () => {
      const { error } = await db.from('church_groups').update({ leader_member_id: s.value || null }).eq('id', s.dataset.gid);
      if (error) { toast('실패: ' + error.message); return; } await reloadGroupData();
    }));
  }

  /* ════════════ 전교인 통독 ════════════ */
  function renderReading() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    if (!state.plan) {
      v.innerHTML = admin ? `
        <div class="panel">
          <div class="ch-section-head"><h2>통독 플랜 만들기</h2></div>
          <p class="panel-sub">시작일과 기간을 정하면 성경 66권(1189장)을 매일 분량으로 자동 분배합니다.</p>
          <div class="ch-form-row">
            <div class="field"><label>플랜 이름</label><input type="text" id="p-title" value="${esc(state.church.name)} 1년 통독" /></div>
            <div class="field" style="flex:0 0 150px"><label>유형</label><select id="p-kind"><option value="sequential">순차 통독</option><option value="mccheyne">맥체인식(4트랙)</option></select></div>
            <div class="field" style="flex:0 0 140px"><label>시작일</label><input type="date" id="p-start" value="${todayStr()}" /></div>
            <div class="field" style="flex:0 0 110px"><label>기간(일)</label><input type="number" id="p-days" value="365" min="30" max="1189" /></div>
            <button class="btn btn-gold btn-sm" id="p-create" style="margin-bottom:2px">플랜 시작</button>
          </div>
          <p class="ch-err" id="p-err" hidden></p>
        </div>` : '<div class="ch-empty">아직 시작된 통독 플랜이 없습니다. 관리자가 플랜을 만들면 여기에 표시됩니다.</div>';
      if (admin) document.getElementById('p-create').addEventListener('click', async (ev) => {
        const title = document.getElementById('p-title').value.trim() || '성경통독';
        const start = document.getElementById('p-start').value || todayStr();
        const days = Math.max(30, Math.min(1189, +document.getElementById('p-days').value || 365));
        const kind = document.getElementById('p-kind').value;
        ev.target.disabled = true;
        try {
          const { error } = await db.from('reading_plans').insert({ church_id: state.churchId, title, start_date: start, days, kind });
          if (error) throw error;
          toast('통독 플랜을 시작했습니다.'); await loadPlan(); renderReading();
        } catch (e) { const er = document.getElementById('p-err'); er.textContent = e.message || '생성 실패'; er.hidden = false; ev.target.disabled = false; }
      });
      return;
    }

    const plan = state.plan;
    const todayIdx = Math.max(0, Math.min(plan.days - 1, daysBetween(plan.start_date, todayStr())));
    const beforeStart = daysBetween(plan.start_date, todayStr()) < 0;
    const doneCount = state.myProgress.size;
    const myPct = Math.round(doneCount / plan.days * 100);
    const todayDone = state.myProgress.has(todayIdx);

    v.innerHTML = `
      <div class="plan-today">
        <span class="pt-day">${esc(plan.title)} · ${plan.kind === 'mccheyne' ? '맥체인식 · ' : ''}${beforeStart ? '시작 전' : `${todayIdx+1}일차 / ${plan.days}일`}</span>
        <div class="pt-read">${beforeStart ? `${esc(plan.start_date)}에 시작합니다` : esc(dayReading(plan, todayIdx))}</div>
        ${beforeStart ? '' : `<button class="btn ${todayDone?'btn-ghost':'btn-gold'} btn-sm" id="mark-today">${todayDone ? '✓ 오늘 읽음' : '오늘 분량 읽음으로 표시'}</button>`}
      </div>
      <div class="panel">
        <div class="ch-section-head"><h2>내 진도</h2>${admin ? '<button class="btn btn-text btn-sm" id="plan-del">플랜 삭제</button>' : ''}</div>
        <div class="plan-bar"><span style="width:${myPct}%"></span></div>
        <p class="plan-meta">${doneCount}/${plan.days}일 (${myPct}%) 완료</p>
      </div>
      ${admin ? renderAdminProgress(plan) : ''}`;

    const mt = document.getElementById('mark-today');
    if (mt) mt.addEventListener('click', async () => {
      mt.disabled = true;
      try {
        if (todayDone) {
          await db.from('reading_progress').delete().eq('plan_id', plan.id).eq('user_id', state.user.id).eq('day_index', todayIdx);
          state.myProgress.delete(todayIdx);
        } else {
          await db.from('reading_progress').insert({ plan_id: plan.id, user_id: state.user.id, day_index: todayIdx });
          state.myProgress.add(todayIdx);
          toast('오늘 분량을 읽었습니다. 잘하셨어요!');
        }
        if (isAdmin()) { const { data } = await db.from('reading_progress').select('user_id,day_index').eq('plan_id', plan.id); state.allProgress = data || []; }
        renderReading();
      } catch (e) { toast('저장 실패: ' + (e.message||e)); mt.disabled = false; }
    });
    const pd = document.getElementById('plan-del');
    if (pd) pd.addEventListener('click', async () => {
      if (!confirm('통독 플랜을 삭제할까요? 모든 교인의 진도 기록도 함께 삭제됩니다.')) return;
      const { error } = await db.from('reading_plans').delete().eq('id', plan.id);
      if (error) { toast('삭제 실패: ' + error.message); return; }
      toast('플랜을 삭제했습니다.'); await loadPlan(); renderReading();
    });
  }
  function renderAdminProgress(plan) {
    // user_id별 완료 일수 집계 → 앱 연결 교인 이름 매핑
    const byUser = {};
    state.allProgress.forEach(r => { byUser[r.user_id] = (byUser[r.user_id] || 0) + 1; });
    const rows = state.members.filter(m => m.user_id).map(m => ({ name: m.name, n: byUser[m.user_id] || 0 }))
      .sort((a,b) => b.n - a.n);
    if (!rows.length) return `<div class="panel"><div class="ch-section-head"><h2>전교인 진도</h2></div><div class="ch-empty">앱에 로그인해 합류한 교인의 진도가 여기에 표시됩니다.</div></div>`;
    return `<div class="panel"><div class="ch-section-head"><h2>전교인 진도 <span class="plan-meta">${rows.length}명</span></h2></div>
      <div class="progress-list">${rows.map(r => { const pct = Math.round(r.n/plan.days*100); return `
        <div class="progress-row"><span class="pr-name">${esc(r.name)}</span><span class="plan-bar"><span style="width:${pct}%"></span></span><span class="pr-pct">${pct}%</span></div>`; }).join('')}</div></div>`;
  }

  /* ════════════ 큐티 나눔 ════════════ */
  async function loadQtShares() {
    const { data, error } = await db.from('qt_shares').select('*').eq('church_id', state.churchId).order('created_at', { ascending: false }).limit(50);
    state.qtShares = error ? [] : (data || []);
  }
  function qtCard(q) {
    const canDel = q.author_id === state.user.id || isAdmin();
    return `<div class="qt-card">
      <div class="qt-head"><span class="qt-author">${esc(q.author_name || '교인')}</span><span class="qt-date">${esc((q.share_date || q.created_at || '').slice(0,10))}</span>${canDel ? `<button class="qt-del" data-id="${q.id}" title="삭제">✕</button>` : ''}</div>
      ${q.verse_ref ? `<div class="qt-ref">${esc(q.verse_ref)}</div>` : ''}
      <p class="qt-body">${esc(q.content)}</p>
    </div>`;
  }
  function renderQt() {
    const v = document.getElementById('ch-view');
    const myName = (myMember() && myMember().name) || state.user.name || (state.user.email || '').split('@')[0];
    v.innerHTML = `
      <div class="panel">
        <div class="ch-section-head"><h2>오늘의 큐티 나눔</h2></div>
        <div class="field" style="max-width:240px"><label>본문 (선택)</label><input type="text" id="qt-ref" placeholder="예) 시편 23:1-3" /></div>
        <div class="field"><label>묵상 나눔</label><textarea id="qt-body" rows="3" placeholder="오늘 말씀에서 받은 은혜를 나눠주세요"></textarea></div>
        <div style="display:flex;justify-content:flex-end"><button class="btn btn-gold btn-sm" id="qt-add">나눔 올리기</button></div>
        <p class="ch-err" id="qt-err" hidden></p>
      </div>
      <div class="qt-feed">${state.qtShares.length ? state.qtShares.map(qtCard).join('') : '<div class="ch-empty">아직 나눔이 없습니다. 첫 묵상을 나눠보세요.</div>'}</div>`;
    document.getElementById('qt-add').addEventListener('click', async (ev) => {
      const body = document.getElementById('qt-body').value.trim();
      const err = document.getElementById('qt-err');
      if (!body) { err.textContent = '나눔 내용을 입력해 주세요.'; err.hidden = false; return; }
      err.hidden = true; ev.target.disabled = true;
      try {
        const { error } = await db.from('qt_shares').insert({ church_id: state.churchId, author_id: state.user.id, author_name: myName, share_date: todayStr(), verse_ref: document.getElementById('qt-ref').value.trim() || null, content: body });
        if (error) throw error;
        toast('나눔을 올렸습니다.'); await loadQtShares(); renderDashboard();
      } catch (e) { err.textContent = e.message || '등록 실패'; err.hidden = false; ev.target.disabled = false; }
    });
    v.querySelectorAll('.qt-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('이 나눔을 삭제할까요?')) return;
      const { error } = await db.from('qt_shares').delete().eq('id', b.dataset.id);
      if (error) { toast('삭제 실패: ' + error.message); return; }
      toast('삭제했습니다.'); await loadQtShares(); renderDashboard();
    }));
  }

  /* ════════════ 예배 콘티 ════════════ */
  const WORSHIP_KINDS = ['찬양', '기도', '말씀', '봉헌', '성찬', '광고', '축도', '특송', '기타'];
  async function loadServicePlans() {
    const { data, error } = await db.from('service_plans').select('*').eq('church_id', state.churchId).order('service_date', { ascending: false }).limit(30);
    state.servicePlans = error ? [] : (data || []);
  }
  async function updatePlanItems(planId, items) {
    const { error } = await db.from('service_plans').update({ items }).eq('id', planId);
    if (error) { toast('저장 실패: ' + error.message); return; }
    await loadServicePlans(); renderDashboard();
  }
  function worshipCard(p, admin) {
    const open = state.openPlanId === p.id;
    const items = Array.isArray(p.items) ? p.items : [];
    return `<div class="panel worship-card">
      <div class="ch-section-head w-toggle" style="cursor:pointer" data-toggle="${p.id}"><h2>${esc(p.title)} <span class="plan-meta">${esc((p.service_date||'').slice(0,10))} · ${items.length}순서</span></h2>${admin ? `<button class="btn btn-text btn-sm w-del" data-id="${p.id}">삭제</button>` : ''}</div>
      ${open ? `
        <ol class="worship-items">${items.length ? items.map((it,i) => `<li class="worship-item"><span class="wi-kind">${esc(it.kind||'')}</span><span class="wi-title">${esc(it.title||'')}</span>${it.detail?`<span class="wi-detail">${esc(it.detail)}</span>`:''}${admin ? `<span class="wi-ops"><button data-pid="${p.id}" data-mv="up" data-i="${i}" ${i===0?'disabled':''}>↑</button><button data-pid="${p.id}" data-mv="down" data-i="${i}" ${i===items.length-1?'disabled':''}>↓</button><button data-pid="${p.id}" data-mv="del" data-i="${i}">✕</button></span>` : ''}</li>`).join('') : '<li class="plan-meta" style="list-style:none">순서가 없습니다.</li>'}</ol>
        ${admin ? `<div class="ch-form-row" style="margin-top:10px">
          <div class="field" style="flex:0 0 100px"><label>구분</label><select id="wi-kind-${p.id}">${WORSHIP_KINDS.map(k => `<option>${k}</option>`).join('')}</select></div>
          <div class="field"><label>제목</label><input type="text" id="wi-title-${p.id}" placeholder="곡명/내용" /></div>
          <div class="field" style="flex:0 0 130px"><label>비고</label><input type="text" id="wi-detail-${p.id}" placeholder="키/인도자" /></div>
          <button class="btn btn-ghost btn-sm wi-add" data-id="${p.id}" style="margin-bottom:2px">+ 순서</button>
        </div>` : ''}` : ''}
    </div>`;
  }
  function renderWorship() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    v.innerHTML = `
      ${admin ? `<div class="panel">
        <div class="ch-section-head"><h2>예배 콘티 만들기</h2></div>
        <div class="ch-form-row">
          <div class="field" style="flex:0 0 160px"><label>날짜</label><input type="date" id="w-date" value="${todayStr()}" /></div>
          <div class="field"><label>제목</label><input type="text" id="w-title" placeholder="예) 주일 1부 예배" /></div>
          <button class="btn btn-gold btn-sm" id="w-add" style="margin-bottom:2px">만들기</button>
        </div>
      </div>` : ''}
      ${state.servicePlans.length ? state.servicePlans.map(p => worshipCard(p, admin)).join('') : '<div class="ch-empty">아직 예배 콘티가 없습니다.</div>'}
      ${admin ? '<p class="ch-empty" style="text-align:left;background:none;color:var(--muted);font-size:.78rem;padding:8px 2px">⚠ 찬송가·CCM 가사는 저작권이 있어 본문을 그대로 싣지 마세요. 곡 제목·순서·키 표기만 권장합니다.</p>' : ''}`;
    v.querySelectorAll('.w-toggle').forEach(t => t.addEventListener('click', (e) => {
      if (e.target.closest('.w-del')) return;
      const id = t.dataset.toggle;
      state.openPlanId = state.openPlanId === id ? null : id;
      renderDashboard();
    }));
    if (!admin) return;
    const addBtn = document.getElementById('w-add');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const title = document.getElementById('w-title').value.trim() || '예배';
      const date = document.getElementById('w-date').value || todayStr();
      const { data, error } = await db.from('service_plans').insert({ church_id: state.churchId, service_date: date, title, items: [] }).select().single();
      if (error) { toast('생성 실패: ' + error.message); return; }
      state.openPlanId = data.id; toast('콘티를 만들었습니다.'); await loadServicePlans(); renderDashboard();
    });
    v.querySelectorAll('.w-del').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('이 콘티를 삭제할까요?')) return;
      const { error } = await db.from('service_plans').delete().eq('id', b.dataset.id);
      if (error) { toast('삭제 실패: ' + error.message); return; }
      toast('삭제했습니다.'); await loadServicePlans(); renderDashboard();
    }));
    v.querySelectorAll('.wi-add').forEach(b => b.addEventListener('click', async () => {
      const pid = b.dataset.id;
      const plan = state.servicePlans.find(p => p.id === pid); if (!plan) return;
      const title = document.getElementById('wi-title-' + pid).value.trim();
      if (!title) { toast('제목을 입력해 주세요.'); return; }
      const item = { kind: document.getElementById('wi-kind-' + pid).value, title, detail: document.getElementById('wi-detail-' + pid).value.trim() };
      const items = (Array.isArray(plan.items) ? plan.items : []).concat([item]);
      await updatePlanItems(pid, items);
    }));
    v.querySelectorAll('.wi-ops button').forEach(b => b.addEventListener('click', async () => {
      const pid = b.dataset.pid, i = +b.dataset.i, mv = b.dataset.mv;
      const plan = state.servicePlans.find(p => p.id === pid); if (!plan) return;
      const items = (Array.isArray(plan.items) ? plan.items : []).slice();
      if (mv === 'del') items.splice(i, 1);
      else if (mv === 'up' && i > 0) { [items[i-1], items[i]] = [items[i], items[i-1]]; }
      else if (mv === 'down' && i < items.length - 1) { [items[i+1], items[i]] = [items[i], items[i+1]]; }
      await updatePlanItems(pid, items);
    }));
  }

  /* ════════════ 설교 노트 ════════════ */
  async function loadSermons() {
    const { data, error } = await db.from('sermons').select('*').eq('church_id', state.churchId).order('sermon_date', { ascending: false }).limit(40);
    state.sermons = error ? [] : (data || []);
  }
  function sermonCard(s, admin) {
    const open = state.openSermonId === s.id;
    const body = esc(s.content || '').replace(/_{3,}/g, '<span class="se-blank"></span>');
    return `<div class="sermon-card ${open ? 'open' : ''}">
      <div class="se-head" data-toggle="${s.id}">
        <div><strong>${esc(s.title)}</strong><div class="se-meta">${esc((s.sermon_date||'').slice(0,10))}${s.preacher ? ' · ' + esc(s.preacher) : ''}${s.scripture ? ' · ' + esc(s.scripture) : ''}</div></div>
        <span class="se-caret">${open ? '▲' : '▼'}</span>
      </div>
      ${open ? `<div class="se-content">${body || '<span class="plan-meta">내용 없음</span>'}</div>${admin ? `<div class="se-actions"><button class="btn btn-text btn-sm se-edit" data-id="${s.id}">수정</button><button class="btn btn-text btn-sm se-del" data-id="${s.id}">삭제</button></div>` : ''}` : ''}
    </div>`;
  }
  function renderSermon() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    const editing = admin ? state.sermons.find(s => s.id === state.editingSermonId) : null;
    v.innerHTML = `
      ${admin ? `<div class="panel" id="se-form">
        <div class="ch-section-head"><h2>${editing ? '설교 노트 수정' : '설교 노트 작성'}</h2></div>
        <div class="ch-form-row">
          <div class="field" style="flex:0 0 150px"><label>날짜</label><input type="date" id="se-date" value="${editing ? editing.sermon_date : todayStr()}" /></div>
          <div class="field"><label>제목</label><input type="text" id="se-title" placeholder="설교 제목" value="${editing ? esc(editing.title) : ''}" /></div>
          <div class="field" style="flex:0 0 120px"><label>설교자</label><input type="text" id="se-preacher" value="${editing ? esc(editing.preacher||'') : ''}" /></div>
        </div>
        <div class="field"><label>본문</label><input type="text" id="se-scripture" placeholder="예) 요한복음 3:16" value="${editing ? esc(editing.scripture||'') : ''}" /></div>
        <div class="field"><label>노트 (빈칸은 ___ 세 개 이상)</label><textarea id="se-content" rows="5" placeholder="설교 요지·빈칸노트">${editing ? esc(editing.content||'') : ''}</textarea></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-gold btn-sm" id="se-save">${editing ? '저장' : '올리기'}</button>${editing ? '<button class="btn btn-ghost btn-sm" id="se-cancel">취소</button>' : ''}</div>
        <p class="ch-err" id="se-err" hidden></p>
      </div>` : ''}
      <div class="panel">
        <div class="ch-section-head"><h2>설교 노트</h2><button class="btn btn-ghost btn-sm" id="se-qr">📱 QR로 열기</button></div>
        ${state.sermons.length ? `<div class="sermon-list">${state.sermons.map(s => sermonCard(s, admin)).join('')}</div>` : '<div class="ch-empty">아직 설교 노트가 없습니다.</div>'}
      </div>`;
    v.querySelectorAll('.se-head').forEach(h => h.addEventListener('click', () => {
      const id = h.dataset.toggle;
      state.openSermonId = state.openSermonId === id ? null : id;
      renderDashboard();
    }));
    const qrBtn = document.getElementById('se-qr');
    if (qrBtn) qrBtn.addEventListener('click', () => {
      const url = location.origin + location.pathname;
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(url)}`;
      const ov = el(`<div class="qr-overlay"><div class="qr-box"><button class="qr-close" aria-label="닫기">✕</button><h3>교회 페이지 QR</h3><img src="${qr}" alt="QR" width="220" height="220" /><p>교인이 휴대폰으로 스캔하면 이 페이지가 열립니다.</p><code>${esc(url)}</code></div></div>`);
      ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.qr-close')) ov.remove(); });
      document.body.appendChild(ov);
    });
    if (!admin) return;
    const saveBtn = document.getElementById('se-save');
    saveBtn.addEventListener('click', async () => {
      const title = document.getElementById('se-title').value.trim();
      const err = document.getElementById('se-err');
      if (!title) { err.textContent = '제목을 입력해 주세요.'; err.hidden = false; return; }
      err.hidden = true; saveBtn.disabled = true;
      const row = { sermon_date: document.getElementById('se-date').value || todayStr(), title, preacher: document.getElementById('se-preacher').value.trim() || null, scripture: document.getElementById('se-scripture').value.trim() || null, content: document.getElementById('se-content').value.trim() || null };
      try {
        if (editing) { const { error } = await db.from('sermons').update(row).eq('id', editing.id); if (error) throw error; state.editingSermonId = null; toast('수정했습니다.'); }
        else { const { error } = await db.from('sermons').insert({ church_id: state.churchId, ...row }); if (error) throw error; toast('설교 노트를 올렸습니다.'); }
        await loadSermons(); renderDashboard();
      } catch (e) { err.textContent = e.message || '저장 실패'; err.hidden = false; saveBtn.disabled = false; }
    });
    const cancelBtn = document.getElementById('se-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { state.editingSermonId = null; renderDashboard(); });
    v.querySelectorAll('.se-edit').forEach(b => b.addEventListener('click', () => {
      state.editingSermonId = b.dataset.id; state.openSermonId = b.dataset.id; renderDashboard();
      const f = document.getElementById('se-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    v.querySelectorAll('.se-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('이 설교 노트를 삭제할까요?')) return;
      const { error } = await db.from('sermons').delete().eq('id', b.dataset.id);
      if (error) { toast('삭제 실패: ' + error.message); return; }
      toast('삭제했습니다.'); await loadSermons(); renderDashboard();
    }));
  }

  /* ════════════ 주보 (디지털) ════════════ */
  function showPageQr() {
    const url = location.origin + location.pathname;
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(url)}`;
    const ov = el(`<div class="qr-overlay"><div class="qr-box"><button class="qr-close" aria-label="닫기">✕</button><h3>교회 페이지 QR</h3><img src="${qr}" alt="QR" width="220" height="220" /><p>교인이 휴대폰으로 스캔하면 이 페이지가 열립니다.</p><code>${esc(url)}</code></div></div>`);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.qr-close')) ov.remove(); });
    document.body.appendChild(ov);
  }
  function thisWeekBirthdays() {
    const today = new Date(); const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const mm = d.getMonth() + 1, dd = d.getDate();
      state.members.forEach(m => { if (m.birthday) { const p = m.birthday.split('-'); if (+p[1] === mm && +p[2] === dd) out.push({ name: m.name, label: `${mm}/${dd}` }); } });
    }
    return out;
  }
  async function loadBulletins() {
    const { data, error } = await db.from('bulletins').select('*').eq('church_id', state.churchId).order('week_date', { ascending: false }).limit(30);
    state.bulletins = error ? [] : (data || []);
  }
  function bulletinCard(b, admin) {
    const open = state.openBulletinId === b.id;
    let extra = '';
    if (open) { const bd = thisWeekBirthdays(); extra = bd.length ? `<div class="bl-extra"><strong>🎂 이번 주 생일</strong> ${bd.map(x => `${esc(x.name)}(${x.label})`).join(', ')}</div>` : ''; }
    return `<div class="sermon-card ${open ? 'open' : ''}">
      <div class="se-head" data-bl="${b.id}"><div><strong>${esc(b.title)}</strong><div class="se-meta">${esc((b.week_date||'').slice(0,10))}</div></div><span class="se-caret">${open ? '▲' : '▼'}</span></div>
      ${open ? `<div class="se-content">${esc(b.content||'') || '<span class="plan-meta">내용 없음</span>'}${extra}</div>${admin ? `<div class="se-actions"><button class="btn btn-text btn-sm bl-edit" data-id="${b.id}">수정</button><button class="btn btn-text btn-sm bl-del" data-id="${b.id}">삭제</button></div>` : ''}` : ''}
    </div>`;
  }
  function renderBulletin() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    const editing = admin ? state.bulletins.find(b => b.id === state.editingBulletinId) : null;
    v.innerHTML = `
      ${admin ? `<div class="panel" id="bl-form">
        <div class="ch-section-head"><h2>${editing ? '주보 수정' : '주보 작성'}</h2></div>
        <div class="ch-form-row">
          <div class="field"><label>제목</label><input type="text" id="bl-title" placeholder="예) 6월 둘째 주 주보" value="${editing ? esc(editing.title) : ''}" /></div>
          <div class="field" style="flex:0 0 160px"><label>주일 날짜</label><input type="date" id="bl-date" value="${editing ? editing.week_date : todayStr()}" /></div>
        </div>
        <div class="field"><label>내용 (광고·소식)</label><textarea id="bl-content" rows="6" placeholder="예배 안내, 광고, 헌금 안내 등">${editing ? esc(editing.content||'') : ''}</textarea></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-gold btn-sm" id="bl-save">${editing ? '저장' : '발행'}</button>${editing ? '<button class="btn btn-ghost btn-sm" id="bl-cancel">취소</button>' : ''}</div>
        <p class="ch-err" id="bl-err" hidden></p>
      </div>` : ''}
      <div class="panel">
        <div class="ch-section-head"><h2>주보</h2><button class="btn btn-ghost btn-sm" id="bl-qr">📱 QR로 열기</button></div>
        ${state.bulletins.length ? `<div class="sermon-list">${state.bulletins.map(b => bulletinCard(b, admin)).join('')}</div>` : '<div class="ch-empty">아직 발행된 주보가 없습니다.</div>'}
      </div>`;
    v.querySelectorAll('.se-head[data-bl]').forEach(h => h.addEventListener('click', () => {
      const id = h.dataset.bl; state.openBulletinId = state.openBulletinId === id ? null : id; renderDashboard();
    }));
    const qrBtn = document.getElementById('bl-qr');
    if (qrBtn) qrBtn.addEventListener('click', showPageQr);
    if (!admin) return;
    const saveBtn = document.getElementById('bl-save');
    saveBtn.addEventListener('click', async () => {
      const title = document.getElementById('bl-title').value.trim();
      const err = document.getElementById('bl-err');
      if (!title) { err.textContent = '제목을 입력해 주세요.'; err.hidden = false; return; }
      err.hidden = true; saveBtn.disabled = true;
      const row = { title, week_date: document.getElementById('bl-date').value || todayStr(), content: document.getElementById('bl-content').value.trim() || null };
      try {
        if (editing) { const { error } = await db.from('bulletins').update(row).eq('id', editing.id); if (error) throw error; state.editingBulletinId = null; toast('수정했습니다.'); }
        else { const { error } = await db.from('bulletins').insert({ church_id: state.churchId, ...row }); if (error) throw error; toast('주보를 발행했습니다.'); }
        await loadBulletins(); renderDashboard();
      } catch (e) { err.textContent = e.message || '저장 실패'; err.hidden = false; saveBtn.disabled = false; }
    });
    const cancelBtn = document.getElementById('bl-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { state.editingBulletinId = null; renderDashboard(); });
    v.querySelectorAll('.bl-edit').forEach(b => b.addEventListener('click', () => {
      state.editingBulletinId = b.dataset.id; state.openBulletinId = b.dataset.id; renderDashboard();
      const f = document.getElementById('bl-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    v.querySelectorAll('.bl-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('이 주보를 삭제할까요?')) return;
      const { error } = await db.from('bulletins').delete().eq('id', b.dataset.id);
      if (error) { toast('삭제 실패: ' + error.message); return; }
      toast('삭제했습니다.'); await loadBulletins(); renderDashboard();
    }));
  }

  /* ════════════ 새가족 양육 트랙 ════════════ */
  const NC_STAGES = ['새가족등록', '양육중', '정착완료'];
  async function loadNewcomers() {
    const { data, error } = await db.from('newcomers').select('*').eq('church_id', state.churchId).order('registered_date', { ascending: false });
    state.newcomers = error ? [] : (data || []);
  }
  function ncCard(n, admin) {
    return `<div class="nc-card">
      <div class="nc-top"><strong>${esc(n.name)}</strong><span class="nc-meta">${esc((n.registered_date||'').slice(0,10))}${n.contact ? ' · ' + esc(n.contact) : ''}</span></div>
      ${n.note ? `<p class="nc-note">${esc(n.note)}</p>` : ''}
      ${admin ? `<div class="nc-ops">
        <select class="nc-stage" data-id="${n.id}">${NC_STAGES.map(s => `<option ${s===n.stage?'selected':''}>${s}</option>`).join('')}</select>
        <input type="text" class="nc-care" data-id="${n.id}" placeholder="양육자" value="${esc(n.care_giver||'')}" />
        <button class="nc-del" data-id="${n.id}" title="삭제">✕</button>
      </div>` : (n.care_giver ? `<div class="nc-meta">양육: ${esc(n.care_giver)}</div>` : '')}
    </div>`;
  }
  function renderNewcomer() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    const byStage = (s) => state.newcomers.filter(n => n.stage === s);
    v.innerHTML = `
      ${admin ? `<div class="panel">
        <div class="ch-section-head"><h2>새가족 등록</h2></div>
        <div class="ch-form-row">
          <div class="field"><label>이름</label><input type="text" id="nc-name" placeholder="홍길동" /></div>
          <div class="field" style="flex:0 0 150px"><label>연락처</label><input type="text" id="nc-contact" placeholder="010-..." /></div>
          <div class="field" style="flex:0 0 150px"><label>등록일</label><input type="date" id="nc-date" value="${todayStr()}" /></div>
          <button class="btn btn-gold btn-sm" id="nc-add" style="margin-bottom:2px">추가</button>
        </div>
        <p class="ch-err" id="nc-err" hidden></p>
      </div>` : ''}
      ${state.newcomers.length ? NC_STAGES.map(s => {
        const list = byStage(s);
        return `<div class="panel"><div class="ch-section-head"><h2>${s} <span class="plan-meta">${list.length}명</span></h2></div>
          ${list.length ? `<div class="nc-list">${list.map(n => ncCard(n, admin)).join('')}</div>` : '<p class="plan-meta">해당 단계의 새가족이 없습니다.</p>'}</div>`;
      }).join('') : '<div class="ch-empty">아직 등록된 새가족이 없습니다.</div>'}`;
    if (!admin) return;
    const addBtn = document.getElementById('nc-add');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const name = document.getElementById('nc-name').value.trim();
      const err = document.getElementById('nc-err');
      if (!name) { err.textContent = '이름을 입력해 주세요.'; err.hidden = false; return; }
      err.hidden = true; addBtn.disabled = true;
      const row = { church_id: state.churchId, name, contact: document.getElementById('nc-contact').value.trim() || null, registered_date: document.getElementById('nc-date').value || todayStr() };
      try { const { error } = await db.from('newcomers').insert(row); if (error) throw error; toast('새가족을 등록했습니다.'); await loadNewcomers(); renderDashboard(); }
      catch (e) { err.textContent = e.message || '등록 실패'; err.hidden = false; addBtn.disabled = false; }
    });
    v.querySelectorAll('.nc-stage').forEach(s => s.addEventListener('change', async () => {
      const { error } = await db.from('newcomers').update({ stage: s.value }).eq('id', s.dataset.id);
      if (error) { toast('변경 실패: ' + error.message); return; } toast('단계를 변경했습니다.'); await loadNewcomers(); renderDashboard();
    }));
    v.querySelectorAll('.nc-care').forEach(inp => inp.addEventListener('change', async () => {
      const { error } = await db.from('newcomers').update({ care_giver: inp.value.trim() || null }).eq('id', inp.dataset.id);
      if (error) toast('저장 실패: ' + error.message); else toast('양육자를 저장했습니다.');
    }));
    v.querySelectorAll('.nc-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('이 새가족 기록을 삭제할까요?')) return;
      const { error } = await db.from('newcomers').delete().eq('id', b.dataset.id);
      if (error) { toast('삭제 실패: ' + error.message); return; } toast('삭제했습니다.'); await loadNewcomers(); renderDashboard();
    }));
  }

  /* ════════════ 공지 ════════════ */
  async function loadNotices() {
    const { data, error } = await db.from('notices').select('*').eq('church_id', state.churchId).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(50);
    state.notices = error ? [] : (data || []);
  }
  function noticeCard(n, admin) {
    return `<div class="notice-card ${n.pinned ? 'pinned' : ''}">
      <div class="no-head">${n.pinned ? '<span class="no-pin">📌</span>' : ''}<strong>${esc(n.title)}</strong><span class="no-date">${esc((n.created_at||'').slice(0,10))}</span></div>
      ${n.body ? `<p class="no-body">${esc(n.body)}</p>` : ''}
      ${admin ? `<div class="no-actions"><button class="btn btn-text btn-sm no-pin-btn" data-id="${n.id}" data-pin="${n.pinned ? 0 : 1}">${n.pinned ? '고정 해제' : '상단 고정'}</button><button class="btn btn-text btn-sm no-del" data-id="${n.id}">삭제</button></div>` : ''}
    </div>`;
  }
  function renderNotice() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    const myName = (myMember() && myMember().name) || state.user.name || (state.user.email || '').split('@')[0];
    v.innerHTML = `
      ${admin ? `<div class="panel">
        <div class="ch-section-head"><h2>공지 작성</h2></div>
        <div class="field"><label>제목</label><input type="text" id="no-title" placeholder="공지 제목" /></div>
        <div class="field"><label>내용</label><textarea id="no-body" rows="3" placeholder="공지 내용"></textarea></div>
        <div style="display:flex;align-items:center;gap:12px;justify-content:flex-end">
          <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--ink-2)"><input type="checkbox" id="no-pin" style="width:15px;height:15px;accent-color:var(--gold)" /> 상단 고정</label>
          <button class="btn btn-gold btn-sm" id="no-add">공지 올리기</button>
        </div>
        <p class="ch-err" id="no-err" hidden></p>
      </div>` : ''}
      <div class="notice-list">${state.notices.length ? state.notices.map(n => noticeCard(n, admin)).join('') : '<div class="ch-empty">아직 공지가 없습니다.</div>'}</div>`;
    if (!admin) return;
    const addBtn = document.getElementById('no-add');
    addBtn.addEventListener('click', async () => {
      const title = document.getElementById('no-title').value.trim();
      const err = document.getElementById('no-err');
      if (!title) { err.textContent = '제목을 입력해 주세요.'; err.hidden = false; return; }
      err.hidden = true; addBtn.disabled = true;
      try {
        const { error } = await db.from('notices').insert({ church_id: state.churchId, title, body: document.getElementById('no-body').value.trim() || null, pinned: document.getElementById('no-pin').checked, author_name: myName });
        if (error) throw error;
        toast('공지를 올렸습니다.'); await loadNotices(); renderDashboard();
      } catch (e) { err.textContent = e.message || '등록 실패'; err.hidden = false; addBtn.disabled = false; }
    });
    v.querySelectorAll('.no-pin-btn').forEach(b => b.addEventListener('click', async () => {
      const { error } = await db.from('notices').update({ pinned: b.dataset.pin === '1' }).eq('id', b.dataset.id);
      if (error) { toast('실패: ' + error.message); return; } await loadNotices(); renderDashboard();
    }));
    v.querySelectorAll('.no-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('이 공지를 삭제할까요?')) return;
      const { error } = await db.from('notices').delete().eq('id', b.dataset.id);
      if (error) { toast('삭제 실패: ' + error.message); return; } toast('삭제했습니다.'); await loadNotices(); renderDashboard();
    }));
  }

  /* ════════════ 봉사 스케줄 ════════════ */
  const SERVE_ROLES = ['반주', '찬양 인도', '싱어', '안내', '방송/음향', '주차', '주방', '헌금위원', '새가족 환영', '교사', '기타'];
  async function loadServeSlots() {
    const { data, error } = await db.from('serve_slots').select('*').eq('church_id', state.churchId).order('serve_date', { ascending: false }).order('role').limit(200);
    state.serveSlots = error ? [] : (data || []);
  }
  function renderServe() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    const dates = [...new Set(state.serveSlots.map(s => s.serve_date))];
    v.innerHTML = `
      ${admin ? `<div class="panel">
        <div class="ch-section-head"><h2>봉사 배정</h2></div>
        <div class="ch-form-row">
          <div class="field" style="flex:0 0 150px"><label>날짜</label><input type="date" id="sv-date" value="${todayStr()}" /></div>
          <div class="field" style="flex:0 0 140px"><label>역할</label><select id="sv-role">${SERVE_ROLES.map(r => `<option>${r}</option>`).join('')}</select></div>
          <div class="field"><label>봉사자</label><input type="text" id="sv-assignee" placeholder="이름" /></div>
          <button class="btn btn-gold btn-sm" id="sv-add" style="margin-bottom:2px">배정</button>
        </div>
        <p class="ch-err" id="sv-err" hidden></p>
      </div>` : ''}
      ${dates.length ? dates.map(d => {
        const slots = state.serveSlots.filter(s => s.serve_date === d);
        return `<div class="panel"><div class="ch-section-head"><h2>${esc((d||'').slice(0,10))} <span class="plan-meta">${slots.length}건</span></h2></div>
          <div class="sv-list">${slots.map(s => `<div class="sv-row"><span class="sv-role">${esc(s.role)}</span><span class="sv-assignee">${esc(s.assignee||'미정')}</span>${admin ? `<button class="sv-del" data-id="${s.id}" title="삭제">✕</button>` : ''}</div>`).join('')}</div></div>`;
      }).join('') : '<div class="ch-empty">아직 봉사 배정이 없습니다.</div>'}`;
    if (!admin) return;
    const addBtn = document.getElementById('sv-add');
    addBtn.addEventListener('click', async () => {
      const assignee = document.getElementById('sv-assignee').value.trim();
      const err = document.getElementById('sv-err');
      if (!assignee) { err.textContent = '봉사자 이름을 입력해 주세요.'; err.hidden = false; return; }
      err.hidden = true; addBtn.disabled = true;
      const row = { church_id: state.churchId, serve_date: document.getElementById('sv-date').value || todayStr(), role: document.getElementById('sv-role').value, assignee };
      try { const { error } = await db.from('serve_slots').insert(row); if (error) throw error; toast('봉사를 배정했습니다.'); await loadServeSlots(); renderDashboard(); }
      catch (e) { err.textContent = e.message || '배정 실패'; err.hidden = false; addBtn.disabled = false; }
    });
    v.querySelectorAll('.sv-del').forEach(b => b.addEventListener('click', async () => {
      const { error } = await db.from('serve_slots').delete().eq('id', b.dataset.id);
      if (error) { toast('삭제 실패: ' + error.message); return; } toast('삭제했습니다.'); await loadServeSlots(); renderDashboard();
    }));
  }

  /* ════════════ 헌금 · 재정 ════════════ */
  const FIN_CATS = { income: ['주일헌금', '십일조', '감사헌금', '선교헌금', '건축헌금', '기타'], expense: ['사역비', '선교비', '시설/관리', '구제', '인건비', '기타'] };
  function won(n) { return '₩' + Number(n || 0).toLocaleString('ko-KR'); }
  async function loadFinance() {
    const { data, error } = await db.from('finance_entries').select('*').eq('church_id', state.churchId).order('entry_date', { ascending: false }).limit(200);
    state.finance = error ? [] : (data || []);
  }
  function renderFinance() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    const ym = todayStr().slice(0, 7);
    const month = state.finance.filter(e => (e.entry_date || '').slice(0, 7) === ym);
    const income = month.filter(e => e.kind === 'income').reduce((s, e) => s + Number(e.amount || 0), 0);
    const expense = month.filter(e => e.kind === 'expense').reduce((s, e) => s + Number(e.amount || 0), 0);
    v.innerHTML = `
      <div class="home-grid">
        <div class="home-card" style="cursor:default"><span class="hc-num" style="font-size:1.25rem">${won(income)}</span><span class="hc-label">이번 달 수입</span></div>
        <div class="home-card" style="cursor:default"><span class="hc-num" style="font-size:1.25rem;color:#A6493B">${won(expense)}</span><span class="hc-label">이번 달 지출</span></div>
        <div class="home-card" style="cursor:default"><span class="hc-num" style="font-size:1.25rem">${won(income - expense)}</span><span class="hc-label">잔액</span></div>
      </div>
      ${admin ? `<div class="panel">
        <div class="ch-section-head"><h2>수입·지출 기록</h2></div>
        <div class="ch-form-row">
          <div class="field" style="flex:0 0 140px"><label>날짜</label><input type="date" id="fi-date" value="${todayStr()}" /></div>
          <div class="field" style="flex:0 0 92px"><label>구분</label><select id="fi-kind"><option value="income">수입</option><option value="expense">지출</option></select></div>
          <div class="field" style="flex:0 0 120px"><label>분류</label><select id="fi-cat">${FIN_CATS.income.map(c => `<option>${c}</option>`).join('')}</select></div>
          <div class="field" style="flex:0 0 120px"><label>금액</label><input type="number" id="fi-amount" placeholder="0" min="0" /></div>
          <div class="field"><label>메모</label><input type="text" id="fi-memo" /></div>
          <button class="btn btn-gold btn-sm" id="fi-add" style="margin-bottom:2px">기록</button>
        </div>
        <p class="ch-err" id="fi-err" hidden></p>
      </div>` : ''}
      <div class="panel">
        <div class="ch-section-head"><h2>재정 내역 <span class="plan-meta">투명 공개</span></h2></div>
        ${state.finance.length ? `<div class="fi-list">${state.finance.slice(0, 50).map(e => `<div class="fi-row"><span class="fi-date">${esc((e.entry_date||'').slice(5))}</span><span class="fi-cat ${e.kind}">${esc(e.category)}</span><span class="fi-memo">${esc(e.memo||'')}</span><span class="fi-amt ${e.kind}">${e.kind === 'expense' ? '-' : '+'}${won(e.amount)}</span>${admin ? `<button class="fi-del" data-id="${e.id}" title="삭제">✕</button>` : ''}</div>`).join('')}</div>` : '<div class="ch-empty">아직 기록된 재정 내역이 없습니다.</div>'}
      </div>
      <div class="panel fi-online">
        <div class="ch-section-head"><h2>온라인 헌금</h2></div>
        <p class="plan-meta">헌금 계좌 안내 또는 간편결제(토스페이먼츠·카카오페이) 연동으로 온라인 헌금을 받을 수 있습니다.</p>
        <button class="btn btn-ghost btn-sm" id="fi-online-btn" style="margin-top:8px">온라인 헌금하기</button>
        <p class="ch-empty" style="text-align:left;background:none;color:var(--muted);font-size:.78rem;padding:8px 2px">⚠ 실제 결제·기부금영수증 연동은 사업자/PG 계약 후 활성화됩니다(현재 스텁).</p>
      </div>`;
    const onlineBtn = document.getElementById('fi-online-btn');
    if (onlineBtn) onlineBtn.addEventListener('click', () => toast('온라인 헌금 결제 연동은 준비 중입니다. (PG 계약 후 활성화)'));
    if (!admin) return;
    const kindSel = document.getElementById('fi-kind');
    kindSel.addEventListener('change', () => { document.getElementById('fi-cat').innerHTML = FIN_CATS[kindSel.value].map(c => `<option>${c}</option>`).join(''); });
    const addBtn = document.getElementById('fi-add');
    addBtn.addEventListener('click', async () => {
      const amount = Number(document.getElementById('fi-amount').value);
      const err = document.getElementById('fi-err');
      if (!amount || amount <= 0) { err.textContent = '금액을 입력해 주세요.'; err.hidden = false; return; }
      err.hidden = true; addBtn.disabled = true;
      const row = { church_id: state.churchId, entry_date: document.getElementById('fi-date').value || todayStr(), kind: kindSel.value, category: document.getElementById('fi-cat').value, amount, memo: document.getElementById('fi-memo').value.trim() || null };
      try { const { error } = await db.from('finance_entries').insert(row); if (error) throw error; toast('재정 내역을 기록했습니다.'); await loadFinance(); renderDashboard(); }
      catch (e) { err.textContent = e.message || '기록 실패'; err.hidden = false; addBtn.disabled = false; }
    });
    v.querySelectorAll('.fi-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('이 재정 내역을 삭제할까요?')) return;
      const { error } = await db.from('finance_entries').delete().eq('id', b.dataset.id);
      if (error) { toast('삭제 실패: ' + error.message); return; } toast('삭제했습니다.'); await loadFinance(); renderDashboard();
    }));
  }

  /* ════════════ 교회 설정 · 권한 ════════════ */
  const ROLE_LABEL = { admin: '관리자', leader: '리더', member: '교인' };
  function renderSettings() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    if (!admin) { v.innerHTML = '<div class="ch-empty">관리자만 접근할 수 있는 설정입니다.</div>'; return; }
    const isOwner = state.church.owner_id === state.user.id;
    const appMembers = state.members.filter(m => m.user_id);
    v.innerHTML = `
      <div class="panel">
        <div class="ch-section-head"><h2>교회 정보</h2></div>
        <div class="ch-form-row">
          <div class="field"><label>교회 이름</label><input type="text" id="set-name" value="${esc(state.church.name)}" /></div>
          <button class="btn btn-gold btn-sm" id="set-name-save" style="margin-bottom:2px">저장</button>
        </div>
        <div class="set-row"><span>현재 플랜</span><span><span class="ch-plan">${PLAN_LABEL[state.church.plan]||'씨앗'}</span> &nbsp;<a href="membership.html#church" target="_blank" rel="noopener" style="font-size:.82rem;color:var(--gold)">플랜 변경 문의 →</a></span></div>
        <div class="set-row"><span>초대코드</span><span><code class="invite-code">${esc(state.church.invite_code)}</code> ${isOwner ? '<button class="btn btn-text btn-sm" id="set-recode">재발급</button>' : ''}</span></div>
      </div>
      <div class="panel">
        <div class="ch-section-head"><h2>멤버 권한 <span class="plan-meta">${appMembers.length}명 (앱 연결)</span></h2></div>
        ${appMembers.length ? `<div class="set-members">${appMembers.map(m => `
          <div class="set-member"><span class="sm-name">${esc(m.name)}${m.user_id===state.user.id ? ' (나)' : ''}${m.user_id===state.church.owner_id ? ' · 소유자' : ''}</span>
          ${(isOwner && m.user_id !== state.church.owner_id) ? `<select class="sm-role" data-id="${m.id}">${['member','leader','admin'].map(r => `<option value="${r}" ${m.role===r?'selected':''}>${ROLE_LABEL[r]}</option>`).join('')}</select>` : `<span class="role-tag role-${m.role}">${ROLE_LABEL[m.role]||'교인'}</span>`}</div>`).join('')}</div>`
          : '<div class="ch-empty">앱에 로그인해 합류한 멤버가 없습니다. 초대코드로 합류하면 여기에 표시됩니다.</div>'}
        <p class="plan-meta" style="margin-top:10px">관리자는 교적·예배·재정 등 모든 관리 기능에 접근합니다. 소유자만 권한을 변경할 수 있습니다.</p>
      </div>
      ${isOwner ? `<div class="panel set-danger">
        <div class="ch-section-head"><h2 style="color:#A6493B">교회 삭제</h2></div>
        <p class="plan-meta">교회와 모든 데이터(교적·출석·통독·기도제목 등)가 영구 삭제됩니다. 되돌릴 수 없습니다.</p>
        <button class="btn btn-ghost btn-sm" id="set-delete" style="color:#A6493B;border-color:#E5C5BD;margin-top:8px">교회 삭제</button>
      </div>` : ''}`;

    document.getElementById('set-name-save').addEventListener('click', async (ev) => {
      const name = document.getElementById('set-name').value.trim();
      if (!name) { toast('교회 이름을 입력해 주세요.'); return; }
      ev.target.disabled = true;
      const { error } = await db.from('churches').update({ name }).eq('id', state.churchId);
      if (error) { toast('저장 실패: ' + error.message); ev.target.disabled = false; return; }
      toast('교회 이름을 저장했습니다.');
      await loadChurches(); state.church = state.churches.find(c => c.id === state.churchId); renderDashboard();
    });
    const recode = document.getElementById('set-recode');
    if (recode) recode.addEventListener('click', async () => {
      if (!confirm('초대코드를 새로 발급할까요? 기존 코드는 더 이상 쓸 수 없습니다.')) return;
      const { error } = await db.from('churches').update({ invite_code: genCode() }).eq('id', state.churchId);
      if (error) { toast('재발급 실패: ' + error.message); return; }
      toast('초대코드를 재발급했습니다.');
      await loadChurches(); state.church = state.churches.find(c => c.id === state.churchId); renderDashboard();
    });
    v.querySelectorAll('.sm-role').forEach(s => s.addEventListener('change', async () => {
      const { error } = await db.from('church_members').update({ role: s.value }).eq('id', s.dataset.id);
      if (error) { toast('변경 실패: ' + error.message); return; }
      toast('권한을 변경했습니다.'); await loadMembers(); renderDashboard();
    }));
    const del = document.getElementById('set-delete');
    if (del) del.addEventListener('click', async () => {
      if (!confirm('정말 교회를 삭제할까요? 모든 데이터가 사라집니다.')) return;
      if (!confirm('되돌릴 수 없습니다. 한 번 더 확인합니다 — 삭제할까요?')) return;
      const { error } = await db.from('churches').delete().eq('id', state.churchId);
      if (error) { toast('삭제 실패: ' + error.message); return; }
      toast('교회를 삭제했습니다.');
      localStorage.removeItem(LAST_KEY); state.churchId = null; state.church = null;
      await loadChurches();
      if (state.churches.length) await selectChurch(state.churches[0].id); else renderSetup();
    });
  }

  /* ════════════ 기도제목 / 중보기도 ════════════ */
  const ST = { open: '기도 요청', praying: '중보 중', answered: '응답됨' };
  function renderPrayer() {
    const v = document.getElementById('ch-view');
    const admin = isAdmin();
    const myName = (myMember() && myMember().name) || state.user.name || (state.user.email||'').split('@')[0];
    v.innerHTML = `
      <div class="panel">
        <div class="ch-section-head"><h2>기도제목 나누기</h2></div>
        <div class="field"><label>제목</label><input type="text" id="pr-title" placeholder="무엇을 위해 기도할까요?" /></div>
        <div class="field"><label>내용 (선택)</label><textarea id="pr-body" rows="2" placeholder="자세한 내용을 적어주세요"></textarea></div>
        <div class="ch-form-row" style="align-items:center">
          <label style="display:flex;align-items:center;gap:8px;font-size:.86rem;color:var(--ink-2);margin:0"><input type="checkbox" id="pr-anon" style="width:16px;height:16px;accent-color:var(--gold)" /> 익명으로</label>
          <button class="btn btn-gold btn-sm" id="pr-add" style="margin-left:auto">기도제목 올리기</button>
        </div>
        <p class="ch-err" id="pr-err" hidden></p>
      </div>
      <div class="pr-filter"><button class="${state.prayerFilter==='all'?'on':''}" data-flt="all">전체</button><button class="${state.prayerFilter==='mine'?'on':''}" data-flt="mine">🙏 내 중보</button></div>
      <div class="pr-list">${(() => {
        const list = state.prayerFilter === 'mine' ? state.prayers.filter(p => p.intercessor_id === state.user.id) : state.prayers;
        return list.length ? list.map(p => prayerCard(p, admin)).join('')
          : `<div class="ch-empty">${state.prayerFilter === 'mine' ? '내가 중보 중인 기도제목이 없습니다.' : '아직 올라온 기도제목이 없습니다. 첫 기도제목을 나눠보세요.'}</div>`;
      })()}</div>`;

    document.getElementById('pr-add').addEventListener('click', async (ev) => {
      const title = document.getElementById('pr-title').value.trim();
      const err = document.getElementById('pr-err');
      if (!title) { err.textContent = '제목을 입력해 주세요.'; err.hidden = false; return; }
      const anon = document.getElementById('pr-anon').checked;
      err.hidden = true; ev.target.disabled = true;
      try {
        const { error } = await db.from('prayer_requests').insert({
          church_id: state.churchId, author_id: state.user.id,
          author_name: anon ? null : myName, is_anonymous: anon,
          title, body: document.getElementById('pr-body').value.trim() || null,
        });
        if (error) throw error;
        toast('기도제목을 올렸습니다.'); await loadPrayers(); renderDashboard();
      } catch (e) { err.textContent = e.message || '등록 실패'; err.hidden = false; ev.target.disabled = false; }
    });

    v.querySelectorAll('[data-pr-act]').forEach(b => b.addEventListener('click', () => prayerAction(b.dataset.prAct, b.dataset.id)));
    v.querySelectorAll('[data-flt]').forEach(b => b.addEventListener('click', () => { state.prayerFilter = b.dataset.flt; renderDashboard(); }));
    v.querySelectorAll('.pr-cmt-toggle').forEach(b => b.addEventListener('click', () => { state.openPrayerId = state.openPrayerId === b.dataset.id ? null : b.dataset.id; renderDashboard(); }));
    v.querySelectorAll('.pr-cmt-add').forEach(b => b.addEventListener('click', async () => {
      const inp = v.querySelector('.pr-cmt-input[data-id="' + b.dataset.id + '"]');
      const body = inp.value.trim(); if (!body) return;
      const { error } = await db.from('prayer_comments').insert({ prayer_id: b.dataset.id, church_id: state.churchId, author_id: state.user.id, author_name: myName, body });
      if (error) { toast('댓글 실패: ' + error.message); return; }
      await loadPrayers(); renderDashboard();
    }));
    v.querySelectorAll('.pr-cmt-input').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const btn = v.querySelector('.pr-cmt-add[data-id="' + inp.dataset.id + '"]'); if (btn) btn.click(); } }));
    v.querySelectorAll('.pr-cmt-del').forEach(b => b.addEventListener('click', async () => {
      const { error } = await db.from('prayer_comments').delete().eq('id', b.dataset.id);
      if (error) { toast('삭제 실패: ' + error.message); return; }
      await loadPrayers(); renderDashboard();
    }));
  }
  function prayerCard(p, admin) {
    const who = p.is_anonymous ? '익명' : (p.author_name || '교인');
    const canEdit = p.author_id === state.user.id || admin;
    const comments = state.prayerComments[p.id] || [];
    const open = state.openPrayerId === p.id;
    const iIntercede = p.intercessor_id === state.user.id;
    const acts = [];
    if (p.status !== 'praying') acts.push(`<button data-pr-act="pray" data-id="${p.id}">🙏 중보하기</button>`);
    if (canEdit && p.status !== 'answered') acts.push(`<button data-pr-act="answer" data-id="${p.id}">✓ 응답됨</button>`);
    if (canEdit) acts.push(`<button data-pr-act="del" data-id="${p.id}">삭제</button>`);
    return `<div class="pr-card">
      <div class="pr-top"><span class="pr-status st-${p.status}">${ST[p.status]||p.status}</span><h4>${esc(p.title)}</h4></div>
      ${p.body ? `<p class="pr-body">${esc(p.body)}</p>` : ''}
      <div class="pr-foot"><span class="who"><b>${esc(who)}</b> · ${esc((p.created_at||'').slice(0,10))}${iIntercede ? ' · <span class="pr-mine">내가 중보 중</span>' : ''}</span>
        <span class="pr-actions"><button class="pr-cmt-toggle" data-id="${p.id}">💬 ${comments.length||''}</button>${acts.join('')}</span></div>
      ${open ? `<div class="pr-comments">
        ${comments.map(c => `<div class="pr-cmt"><b>${esc(c.author_name||'교인')}</b>${esc(c.body)}${(c.author_id===state.user.id||admin) ? ` <button class="pr-cmt-del" data-id="${c.id}" title="삭제">✕</button>` : ''}</div>`).join('') || '<p class="plan-meta">첫 댓글을 남겨보세요.</p>'}
        <div class="pr-cmt-form"><input type="text" class="pr-cmt-input" data-id="${p.id}" placeholder="격려·함께 기도 한마디" /><button class="btn btn-ghost btn-sm pr-cmt-add" data-id="${p.id}">등록</button></div>
      </div>` : ''}
    </div>`;
  }
  async function prayerAction(act, id) {
    try {
      if (act === 'del') {
        if (!confirm('이 기도제목을 삭제할까요?')) return;
        const { error } = await db.from('prayer_requests').delete().eq('id', id); if (error) throw error;
        toast('삭제했습니다.');
      } else if (act === 'pray') {
        const { error } = await db.from('prayer_requests').update({ status: 'praying', intercessor_id: state.user.id }).eq('id', id); if (error) throw error;
        toast('중보기도에 함께합니다. 🙏');
      } else if (act === 'answer') {
        const { error } = await db.from('prayer_requests').update({ status: 'answered' }).eq('id', id); if (error) throw error;
        toast('응답을 함께 기뻐합니다!');
      }
      await loadPrayers(); renderDashboard();
    } catch (e) { toast('처리 실패: ' + (e.message || e)); }
  }

  /* ════════════ 시작 ════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    if (window.Veil && Veil.auth) {
      Veil.auth.mountControl(document.getElementById('auth-slot'));
      Veil.auth.onChange(() => boot());
    }
    boot();
  });
})();
