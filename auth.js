/* ───────────────────────────────────────────────
   Veil — 계정 & 계정별 저장
   두 가지 모드를 지원합니다.

   • 클라우드 모드 : supabase-config.js 에 url/anonKey 가 채워져 있으면 켜짐.
       Supabase Auth(이메일/비번) + Postgres(RLS)로 계정별 기기-간 동기화.
       로컬은 캐시로 쓰고, store.set 시 백그라운드로 클라우드에 upsert,
       로그인 시 클라우드에서 내려받아 즉시 동기화.
   • 로컬 모드 : 키가 없으면 기존처럼 이 브라우저(localStorage)에만 계정/기록 저장.

   회개 내용은 기본적으로 store 에 쓰지 않으므로 저장/전송되지 않습니다.
   사용자가 "일기에 저장"을 누를 때만 store.set → (클라우드 모드면) 계정에 보관.

   window.Veil = { auth, store, cloud:{ enabled } }
   ─────────────────────────────────────────────── */
(function () {
  const cfg = window.VEIL_SUPABASE || {};
  const CLOUD = !!(cfg.url && cfg.anonKey && !/^https?:\/\/$/.test(cfg.url) && !/YOUR_/i.test(cfg.url));

  const raw = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
    del(k) { localStorage.removeItem(k); },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const listeners = [];
  function emit() { const u = auth.current(); listeners.forEach(cb => { try { cb(u); } catch {} }); renderAllControls(); }

  /* ════════════ 로컬 모드 계정 ════════════ */
  const ACCTS_KEY = 'veil.accounts', SESSION_KEY = 'veil.session';
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
  const localAuth = {
    current() {
      const id = raw.get(SESSION_KEY, null); if (!id) return null;
      const a = raw.get(ACCTS_KEY, {}); const rec = a[id];
      return rec ? { id, email: rec.email, name: rec.name } : null;
    },
    async signup(email, name, pw) {
      email = (email || '').trim(); name = (name || '').trim() || email.split('@')[0];
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('이메일 형식을 확인해 주세요.');
      if ((pw || '').length < 6) throw new Error('비밀번호는 6자 이상으로 정해 주세요.');
      const id = idFromEmail(email); const a = raw.get(ACCTS_KEY, {});
      if (a[id]) throw new Error('이미 가입된 이메일입니다. 로그인해 주세요.');
      a[id] = { id, email, name, pw: await hash(pw), created: Date.now() };
      raw.set(ACCTS_KEY, a); raw.set(SESSION_KEY, id); emit();
    },
    async login(email, pw) {
      const id = idFromEmail(email); const a = raw.get(ACCTS_KEY, {});
      if (!a[id]) throw new Error('가입된 계정이 없습니다. 먼저 가입해 주세요.');
      if (a[id].pw !== await hash(pw || '')) throw new Error('비밀번호가 일치하지 않습니다.');
      raw.set(SESSION_KEY, id); emit();
    },
    logout() { raw.del(SESSION_KEY); emit(); },
  };

  /* ════════════ 클라우드 모드 (Supabase) ════════════ */
  let sb = null, cloudUser = null, lastPulledId = null, initPromise = null;
  const SB_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('네트워크 오류로 로그인 모듈을 불러오지 못했습니다.')); document.head.appendChild(s); });
  }
  function ensureCloud() { if (!initPromise) initPromise = initCloud(); return initPromise; }
  async function initCloud() {
    if (!window.supabase) await loadScript(SB_CDN);
    sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    sb.auth.onAuthStateChange((_e, session) => { handleSession(session); });
    const { data } = await sb.auth.getSession();
    await handleSession(data ? data.session : null);
  }
  function userFromSession(session) {
    if (!session || !session.user) return null;
    const u = session.user;
    return { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || (u.email || '').split('@')[0] };
  }
  async function handleSession(session) {
    cloudUser = userFromSession(session);
    if (cloudUser && cloudUser.id !== lastPulledId) {
      lastPulledId = cloudUser.id;
      try { await pullAll(); } catch (e) { console.warn('[Veil] 동기화(pull) 실패:', e); }
    }
    if (!cloudUser) lastPulledId = null;
    emit();
  }
  async function pullAll() {
    if (!sb || !cloudUser) return;
    const { data, error } = await sb.from('user_data').select('key,value').eq('user_id', cloudUser.id);
    if (error) { console.warn('[Veil] pull 오류:', error.message); return; }
    (data || []).forEach(row => { try { localStorage.setItem(row.key + '::u:' + cloudUser.id, JSON.stringify(row.value)); } catch {} });
  }
  function pushKey(key, value) {
    if (!sb || !cloudUser) return;
    sb.from('user_data').upsert({ user_id: cloudUser.id, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' })
      .then(({ error }) => { if (error) console.warn('[Veil] push 오류:', error.message); });
  }
  function delKey(key) {
    if (!sb || !cloudUser) return;
    sb.from('user_data').delete().eq('user_id', cloudUser.id).eq('key', key)
      .then(({ error }) => { if (error) console.warn('[Veil] delete 오류:', error.message); });
  }
  function mapErr(m) {
    m = m || '';
    if (/already registered|already been registered/i.test(m)) return '이미 가입된 이메일입니다. 로그인해 주세요.';
    if (/invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (/email not confirmed/i.test(m)) return '이메일 인증이 필요합니다. 받은 메일의 링크를 눌러 주세요.';
    if (/password should be at least/i.test(m)) return '비밀번호는 6자 이상이어야 합니다.';
    if (/rate limit|too many/i.test(m)) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
    return m;
  }
  const cloudAuth = {
    current() { return cloudUser; },
    async signup(email, name, pw) {
      email = (email || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('이메일 형식을 확인해 주세요.');
      if ((pw || '').length < 6) throw new Error('비밀번호는 6자 이상으로 정해 주세요.');
      await ensureCloud();
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { name: (name || '').trim() || email.split('@')[0] } } });
      if (error) throw new Error(mapErr(error.message));
      if (!data.session) throw new Error('확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.');
    },
    async login(email, pw) {
      await ensureCloud();
      const { error } = await sb.auth.signInWithPassword({ email: (email || '').trim(), password: pw });
      if (error) throw new Error(mapErr(error.message));
    },
    async logout() { try { await ensureCloud(); await sb.auth.signOut(); } catch (e) { console.warn(e); } },
  };

  const impl = CLOUD ? cloudAuth : localAuth;

  /* ════════════ 공개 API ════════════ */
  const auth = {
    current() { return impl.current(); },
    signup(email, name, pw) { return impl.signup(email, name, pw); },
    login(email, pw) { return impl.login(email, pw); },
    logout() { return impl.logout(); },
    onChange(cb) { if (typeof cb === 'function') listeners.push(cb); },
  };

  const store = {
    _k(k) { const c = auth.current(); return c ? (k + '::u:' + c.id) : k; },
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(this._k(k))); return v == null ? d : v; } catch { return d; } },
    set(k, v) { localStorage.setItem(this._k(k), JSON.stringify(v)); if (CLOUD) pushKey(k, v); },
    del(k) { localStorage.removeItem(this._k(k)); if (CLOUD) delKey(k); },
  };

  /* ════════════ 로그인 / 가입 모달 ════════════ */
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
          <div class="vauth-field" id="vauth-name-wrap"><label for="vauth-name">이름</label><input type="text" id="vauth-name" autocomplete="name" placeholder="표시될 이름" /></div>
          <div class="vauth-field"><label for="vauth-email">이메일</label><input type="email" id="vauth-email" autocomplete="email" placeholder="you@example.com" /></div>
          <div class="vauth-field"><label for="vauth-pw">비밀번호</label><input type="password" id="vauth-pw" autocomplete="current-password" placeholder="6자 이상" /></div>
          <p class="vauth-err" id="vauth-err" hidden></p>
          <button class="btn btn-gold btn-block" type="submit" id="vauth-submit">로그인</button>
        </form>
        <p class="vauth-switch" id="vauth-switch"></p>
        <p class="vauth-note">${CLOUD ? '계정으로 로그인하면 여러 기기에서 같은 기록을 볼 수 있어요. 회개 내용은 “일기에 저장”을 누를 때만 보관됩니다.' : '계정과 기록은 이 브라우저에 저장됩니다. 회개 내용은 “일기에 저장”을 누를 때만 보관됩니다.'}</p>
      </div>`;
    document.body.appendChild(wrap);
    const g = (id) => document.getElementById(id);
    g('vauth-bd').addEventListener('click', closeModal);
    g('vauth-x').addEventListener('click', closeModal);
    g('vauth-switch').addEventListener('click', (e) => { if (e.target.closest('#vauth-switch-btn')) setMode(mode === 'login' ? 'signup' : 'login'); });
    g('vauth-form').addEventListener('submit', onSubmit);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }
  function setMode(m) {
    mode = m; const g = (id) => document.getElementById(id); const signup = m === 'signup';
    g('vauth-title').textContent = signup ? '계정 만들기' : '로그인';
    g('vauth-sub').textContent = signup ? '몇 초면 됩니다. 감사일기와 회개 일기가 이 계정에 보관돼요.' : '기록을 계정에 안전하게 보관하세요.';
    g('vauth-name-wrap').style.display = signup ? '' : 'none';
    g('vauth-pw').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    g('vauth-submit').textContent = signup ? '가입하고 시작하기' : '로그인';
    g('vauth-switch').innerHTML = signup
      ? '이미 계정이 있으신가요? <button type="button" id="vauth-switch-btn">로그인</button>'
      : '계정이 없으신가요? <button type="button" id="vauth-switch-btn">가입하기</button>';
    const err = g('vauth-err'); err.hidden = true; err.textContent = '';
  }
  async function onSubmit(e) {
    e.preventDefault(); const g = (id) => document.getElementById(id);
    const err = g('vauth-err'); err.hidden = true;
    const email = g('vauth-email').value, pw = g('vauth-pw').value, name = g('vauth-name').value;
    const submit = g('vauth-submit'); const label = submit.textContent;
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
    ensureModal(); setMode(m === 'signup' ? 'signup' : 'login');
    document.getElementById('vauth-err').hidden = true;
    document.querySelector('.vauth-root').classList.add('open');
    document.body.classList.add('vauth-lock');
    setTimeout(() => { const f = document.getElementById('vauth-email'); f && f.focus(); }, 60);
  }
  function closeModal() {
    const root = document.querySelector('.vauth-root'); if (root) root.classList.remove('open');
    document.body.classList.remove('vauth-lock');
  }
  auth.openModal = openModal;

  /* ════════════ 헤더 계정 컨트롤 ════════════ */
  const controls = [];
  function controlHTML() {
    const u = auth.current();
    if (!u) return `<button type="button" class="btn btn-text btn-sm vauth-open">로그인</button>`;
    const display = u.name || u.email.split('@')[0];
    const initial = (display || 'V').trim().charAt(0).toUpperCase();
    return `<div class="auth-chip">
      <button type="button" class="auth-chip-btn"><span class="auth-ava">${esc(initial)}</span><span class="auth-chip-name">${esc(display)}</span><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div class="auth-menu"><div class="auth-menu-email">${esc(u.email)}</div><button type="button" class="auth-logout">로그아웃</button></div>
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
  function renderAllControls() { controls.forEach(box => { if (box && box.isConnected) { box.innerHTML = controlHTML(); bindControl(box); } }); }
  auth.mountControl = function (box) { if (!box) return; if (!controls.includes(box)) controls.push(box); box.innerHTML = controlHTML(); bindControl(box); };

  document.addEventListener('click', () => { document.querySelectorAll('.auth-chip.open').forEach(c => c.classList.remove('open')); });

  window.Veil = { auth, store, cloud: { enabled: CLOUD } };

  if (CLOUD) ensureCloud().catch(e => console.warn('[Veil] 클라우드 초기화 실패:', e));
})();
