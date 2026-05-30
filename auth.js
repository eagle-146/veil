/* ───────────────────────────────────────────────
   Veil — 계정 & 계정별 저장 (클라이언트 전용 / 기기 로컬)
   ⚠ 이 인증은 정적 프로토타입용으로, 계정과 기록이 "이 브라우저의
      localStorage"에 저장됩니다(서버 없음). 같은 기기 안에서 계정별
      분리는 동작하지만, 기기 간 동기화는 백엔드가 있어야 합니다.
      비밀번호는 해시로 보관하되, 실제 서버 인증을 대체하지 않습니다.

   window.Veil = {
     auth: { current, signup, login, logout, onChange, openModal, mountControl },
     store: { get, set, del }   // 현재 로그인 계정으로 자동 네임스페이스
   }
   - 비로그인(게스트)은 기존 키(base) 그대로 사용 → 기존 데이터 보존.
   - 로그인 시 base + '::u:<id>' 로 분리 저장 → 계정별 기록.
   ─────────────────────────────────────────────── */
(function () {
  const ACCTS_KEY = 'veil.accounts';   // { id: { id, email, name, pw, created } }
  const SESSION_KEY = 'veil.session';  // 현재 로그인 id

  const raw = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
    del(k) { localStorage.removeItem(k); },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const idFromEmail = (e) => (e || '').trim().toLowerCase();

  async function hash(s) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
    } catch {
      let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
      return 'x' + h.toString(16);
    }
  }

  const listeners = [];
  function emit() { const u = auth.current(); listeners.forEach(cb => { try { cb(u); } catch {} }); renderAllControls(); }

  const auth = {
    current() {
      const id = raw.get(SESSION_KEY, null); if (!id) return null;
      const a = raw.get(ACCTS_KEY, {}); const rec = a[id];
      return rec ? { id, email: rec.email, name: rec.name } : null;
    },
    async signup(email, name, pw) {
      email = (email || '').trim();
      name = (name || '').trim() || email.split('@')[0];
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('이메일 형식을 확인해 주세요.');
      if ((pw || '').length < 4) throw new Error('비밀번호는 4자 이상으로 정해 주세요.');
      const id = idFromEmail(email); const a = raw.get(ACCTS_KEY, {});
      if (a[id]) throw new Error('이미 가입된 이메일입니다. 로그인해 주세요.');
      a[id] = { id, email, name, pw: await hash(pw), created: Date.now() };
      raw.set(ACCTS_KEY, a); raw.set(SESSION_KEY, id); emit(); return auth.current();
    },
    async login(email, pw) {
      const id = idFromEmail(email); const a = raw.get(ACCTS_KEY, {});
      if (!a[id]) throw new Error('가입된 계정이 없습니다. 먼저 가입해 주세요.');
      if (a[id].pw !== await hash(pw || '')) throw new Error('비밀번호가 일치하지 않습니다.');
      raw.set(SESSION_KEY, id); emit(); return auth.current();
    },
    logout() { raw.del(SESSION_KEY); emit(); },
    onChange(cb) { if (typeof cb === 'function') { listeners.push(cb); } },
    suffix() { const c = auth.current(); return c ? ('::u:' + c.id) : ''; },
  };

  /* 계정별 네임스페이스 저장 */
  const store = {
    _k(k) { return k + auth.suffix(); },
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(this._k(k))); return v == null ? d : v; } catch { return d; } },
    set(k, v) { localStorage.setItem(this._k(k), JSON.stringify(v)); },
    del(k) { localStorage.removeItem(this._k(k)); },
  };

  /* ─────────  로그인/가입 모달  ───────── */
  const GATE = 'M14 13 H50 a2.4 2.4 0 0 1 2.34 2.92 L49.3 49.1 A2.4 2.4 0 0 1 46.96 51 H42 a2 2 0 0 1 -1.95 -2.44 C41.6 42 33.9 24.6 32 21 C30.1 24.6 22.4 42 23.95 48.56 A2 2 0 0 1 22 51 H17.04 A2.4 2.4 0 0 1 14.7 49.1 L11.66 15.92 A2.4 2.4 0 0 1 14 13 Z';
  let mode = 'login';

  function ensureModal() {
    if (document.getElementById('vauth')) return;
    const wrap = document.createElement('div');
    wrap.className = 'vauth-root';
    wrap.innerHTML = `
      <div class="vauth-backdrop" id="vauth-bd"></div>
      <div class="vauth" id="vauth" role="dialog" aria-modal="true" aria-labelledby="vauth-title">
        <button class="vauth-x" id="vauth-x" aria-label="닫기"><svg width="20" height="20" viewBox="0 0 22 22" fill="none"><path d="M5 5l12 12M17 5L5 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
        <span class="vauth-mark" aria-hidden="true"><svg viewBox="0 0 64 64" fill="currentColor"><path d="${GATE}"/></svg></span>
        <h3 id="vauth-title">로그인</h3>
        <p class="vauth-sub" id="vauth-sub">기록을 계정에 안전하게 보관하세요.</p>
        <form id="vauth-form" novalidate>
          <div class="vauth-field" id="vauth-name-wrap">
            <label for="vauth-name">이름</label>
            <input type="text" id="vauth-name" autocomplete="name" placeholder="표시될 이름" />
          </div>
          <div class="vauth-field">
            <label for="vauth-email">이메일</label>
            <input type="email" id="vauth-email" autocomplete="email" placeholder="you@example.com" />
          </div>
          <div class="vauth-field">
            <label for="vauth-pw">비밀번호</label>
            <input type="password" id="vauth-pw" autocomplete="current-password" placeholder="4자 이상" />
          </div>
          <p class="vauth-err" id="vauth-err" hidden></p>
          <button class="btn btn-gold btn-block" type="submit" id="vauth-submit">로그인</button>
        </form>
        <p class="vauth-switch" id="vauth-switch"></p>
        <p class="vauth-note">계정과 기록은 이 브라우저에 저장됩니다. 회개 내용은 기기 밖으로 나가지 않습니다.</p>
      </div>`;
    document.body.appendChild(wrap);

    const $ = (id) => document.getElementById(id);
    $('vauth-bd').addEventListener('click', closeModal);
    $('vauth-x').addEventListener('click', closeModal);
    $('vauth-switch').addEventListener('click', (e) => {
      if (e.target.closest('#vauth-switch-btn')) { setMode(mode === 'login' ? 'signup' : 'login'); }
    });
    $('vauth-form').addEventListener('submit', onSubmit);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }

  function setMode(m) {
    mode = m;
    const $ = (id) => document.getElementById(id);
    const signup = m === 'signup';
    $('vauth-title').textContent = signup ? '계정 만들기' : '로그인';
    $('vauth-sub').textContent = signup ? '몇 초면 됩니다. 감사일기와 회개 일기가 이 계정에 보관돼요.' : '기록을 계정에 안전하게 보관하세요.';
    $('vauth-name-wrap').style.display = signup ? '' : 'none';
    $('vauth-pw').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    $('vauth-submit').textContent = signup ? '가입하고 시작하기' : '로그인';
    $('vauth-switch').innerHTML = signup
      ? '이미 계정이 있으신가요? <button type="button" id="vauth-switch-btn">로그인</button>'
      : '계정이 없으신가요? <button type="button" id="vauth-switch-btn">가입하기</button>';
    const err = $('vauth-err'); err.hidden = true; err.textContent = '';
  }

  async function onSubmit(e) {
    e.preventDefault();
    const $ = (id) => document.getElementById(id);
    const err = $('vauth-err'); err.hidden = true;
    const email = $('vauth-email').value, pw = $('vauth-pw').value, name = $('vauth-name').value;
    const submit = $('vauth-submit'); const label = submit.textContent;
    submit.disabled = true; submit.textContent = '처리 중…';
    try {
      if (mode === 'signup') await auth.signup(email, name, pw);
      else await auth.login(email, pw);
      closeModal();
    } catch (ex) {
      err.textContent = ex.message || '문제가 발생했습니다.'; err.hidden = false;
    } finally {
      submit.disabled = false; submit.textContent = label;
    }
  }

  function openModal(m) {
    ensureModal();
    setMode(m === 'signup' ? 'signup' : 'login');
    document.getElementById('vauth-err').hidden = true;
    document.querySelector('.vauth-root').classList.add('open');
    document.body.classList.add('vauth-lock');
    setTimeout(() => { const f = document.getElementById('vauth-email'); f && f.focus(); }, 60);
  }
  function closeModal() {
    const root = document.querySelector('.vauth-root');
    if (root) root.classList.remove('open');
    document.body.classList.remove('vauth-lock');
  }
  auth.openModal = openModal;

  /* ─────────  헤더 로그인 컨트롤 (계정 칩 / 로그인 버튼)  ───────── */
  const controls = [];
  function controlHTML() {
    const u = auth.current();
    if (!u) return `<button type="button" class="btn btn-text btn-sm vauth-open">로그인</button>`;
    const display = u.name || u.email.split('@')[0];
    const initial = (display || 'V').trim().charAt(0).toUpperCase();
    return `<div class="auth-chip">
      <button type="button" class="auth-chip-btn">
        <span class="auth-ava">${esc(initial)}</span>
        <span class="auth-chip-name">${esc(display)}</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="auth-menu">
        <div class="auth-menu-email">${esc(u.email)}</div>
        <button type="button" class="auth-logout">로그아웃</button>
      </div>
    </div>`;
  }
  function bindControl(box) {
    const openBtn = box.querySelector('.vauth-open');
    if (openBtn) openBtn.addEventListener('click', () => openModal('login'));
    const chipBtn = box.querySelector('.auth-chip-btn');
    if (chipBtn) chipBtn.addEventListener('click', (e) => { e.stopPropagation(); box.querySelector('.auth-chip').classList.toggle('open'); });
    const logout = box.querySelector('.auth-logout');
    if (logout) logout.addEventListener('click', () => { auth.logout(); });
  }
  function renderAllControls() {
    controls.forEach(box => { if (box && box.isConnected) { box.innerHTML = controlHTML(); bindControl(box); } });
  }
  auth.mountControl = function (box) {
    if (!box) return;
    if (!controls.includes(box)) controls.push(box);
    box.innerHTML = controlHTML(); bindControl(box);
  };

  // 메뉴 바깥 클릭 시 닫기
  document.addEventListener('click', () => {
    document.querySelectorAll('.auth-chip.open').forEach(c => c.classList.remove('open'));
  });

  window.Veil = { auth, store };
})();
