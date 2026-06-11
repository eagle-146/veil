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
  // 한 '일차'가 읽는 장 범위 → "창세기 1–3장" 식으로 묶어 표기
  function dayReading(plan, dayIndex) {
    const days = plan.days || 365;
    const from = Math.floor(dayIndex * TOTAL_CH / days);
    const to = Math.floor((dayIndex + 1) * TOTAL_CH / days);
    const slice = FLAT.slice(from, to);
    if (!slice.length) return '—';
    const parts = [];
    let curBook = null, start = null, prev = null;
    slice.forEach(({ book, ch }) => {
      if (book !== curBook) { if (curBook) parts.push(rng(curBook, start, prev)); curBook = book; start = ch; }
      prev = ch;
    });
    if (curBook) parts.push(rng(curBook, start, prev));
    return parts.join(', ');
    function rng(b, s, e) { return s === e ? `${b} ${s}장` : `${b} ${s}–${e}장`; }
  }

  /* ── 상태 ── */
  let db = null;
  const state = { user: null, churches: [], churchId: null, church: null, role: 'member', view: 'home', editingMemberId: null, attDate: null, attType: '주일오전', attRows: [], groups: [],
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
    await Promise.all([loadPlan(), loadPrayers(), loadGroups()]);
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
      <div class="church-tabs" id="ch-tabs">
        <button data-view="home" class="${state.view==='home'?'active':''}">홈</button>
        <button data-view="members" class="${state.view==='members'?'active':''}">교적 · 생일</button>
        <button data-view="attendance" class="${state.view==='attendance'?'active':''}">출석</button>
        <button data-view="groups" class="${state.view==='groups'?'active':''}">구역·셀</button>
        <button data-view="reading" class="${state.view==='reading'?'active':''}">전교인 통독</button>
        <button data-view="prayer" class="${state.view==='prayer'?'active':''}">기도제목<span class="tab-count">${state.prayers.length||''}</span></button>
      </div>
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
    v.innerHTML = `
      <div class="home-grid">
        <button class="home-card" data-go="members"><span class="hc-num">${state.members.length}</span><span class="hc-label">교인</span></button>
        <button class="home-card" data-go="members"><span class="hc-num">${todays.length}</span><span class="hc-label">오늘의 생일</span></button>
        <button class="home-card" data-go="reading"><span class="hc-num">${state.plan ? planPct()+'%' : '—'}</span><span class="hc-label">통독 진행</span></button>
        <button class="home-card" data-go="prayer"><span class="hc-num">${openP.length}</span><span class="hc-label">기도 중</span></button>
      </div>
      <div class="panel">
        <div class="ch-section-head"><h2>오늘의 생일</h2></div>
        ${todays.length ? todays.map(m => `<span class="bday-chip">${esc(m.name)} 🎂</span>`).join('') : '<p class="plan-meta">오늘 생일인 교인이 없습니다.</p>'}
      </div>
      <div class="panel">
        <div class="ch-section-head"><h2>최근 기도제목</h2><button class="btn btn-text btn-sm" data-go="prayer">전체 보기 →</button></div>
        ${recent.length ? `<div class="pr-list">${recent.map(p => prayerCard(p, isAdmin())).join('')}</div>` : '<div class="ch-empty">아직 기도제목이 없습니다.</div>'}
      </div>`;
    v.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.go; renderDashboard(); }));
    v.querySelectorAll('[data-pr-act]').forEach(b => b.addEventListener('click', () => prayerAction(b.dataset.prAct, b.dataset.id)));
  }

  /* ════════════ 교적 · 생일 ════════════ */
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
          todays.length ? todays.map(m => `<span class="bday-chip">${esc(m.name)} <span class="d">🎂</span></span>`).join('')
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
            <div class="field" style="flex:0 0 150px"><label>시작일</label><input type="date" id="p-start" value="${todayStr()}" /></div>
            <div class="field" style="flex:0 0 120px"><label>기간(일)</label><input type="number" id="p-days" value="365" min="30" max="1189" /></div>
            <button class="btn btn-gold btn-sm" id="p-create" style="margin-bottom:2px">플랜 시작</button>
          </div>
          <p class="ch-err" id="p-err" hidden></p>
        </div>` : '<div class="ch-empty">아직 시작된 통독 플랜이 없습니다. 관리자가 플랜을 만들면 여기에 표시됩니다.</div>';
      if (admin) document.getElementById('p-create').addEventListener('click', async (ev) => {
        const title = document.getElementById('p-title').value.trim() || '성경통독';
        const start = document.getElementById('p-start').value || todayStr();
        const days = Math.max(30, Math.min(1189, +document.getElementById('p-days').value || 365));
        ev.target.disabled = true;
        try {
          const { error } = await db.from('reading_plans').insert({ church_id: state.churchId, title, start_date: start, days });
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
        <span class="pt-day">${esc(plan.title)} · ${beforeStart ? '시작 전' : `${todayIdx+1}일차 / ${plan.days}일`}</span>
        <div class="pt-read">${beforeStart ? `${esc(plan.start_date)}에 시작합니다` : esc(dayReading(plan, todayIdx))}</div>
        ${beforeStart ? '' : `<button class="btn ${todayDone?'btn-ghost':'btn-gold'} btn-sm" id="mark-today">${todayDone ? '✓ 오늘 읽음' : '오늘 분량 읽음으로 표시'}</button>`}
      </div>
      <div class="panel">
        <div class="ch-section-head"><h2>내 진도</h2></div>
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
      <div class="pr-list">${
        state.prayers.length ? state.prayers.map(p => prayerCard(p, admin)).join('')
        : '<div class="ch-empty">아직 올라온 기도제목이 없습니다. 첫 기도제목을 나눠보세요.</div>'}</div>`;

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
  }
  function prayerCard(p, admin) {
    const who = p.is_anonymous ? '익명' : (p.author_name || '교인');
    const mine = p.author_id === state.user.id;
    const canEdit = mine || admin;
    const acts = [];
    if (p.status !== 'praying') acts.push(`<button data-pr-act="pray" data-id="${p.id}">🙏 중보하기</button>`);
    if (canEdit && p.status !== 'answered') acts.push(`<button data-pr-act="answer" data-id="${p.id}">✓ 응답됨</button>`);
    if (canEdit) acts.push(`<button data-pr-act="del" data-id="${p.id}">삭제</button>`);
    return `<div class="pr-card">
      <div class="pr-top"><span class="pr-status st-${p.status}">${ST[p.status]||p.status}</span><h4>${esc(p.title)}</h4></div>
      ${p.body ? `<p class="pr-body">${esc(p.body)}</p>` : ''}
      <div class="pr-foot"><span class="who"><b>${esc(who)}</b> · ${esc((p.created_at||'').slice(0,10))}</span>
        <span class="pr-actions">${acts.join('')}</span></div>
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
