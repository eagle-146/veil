/* ───────────────────────────────────────────────
   Veil — 계정 & 계정별 저장
   두 가지 모드를 지원합니다.

   • 클라우드 모드 : supabase-config.js 에 url/anonKey 가 채워져 있으면 켜짐.
       Supabase Auth(이메일/비번 + 소셜) + Postgres(RLS)로 계정별 기기-간 동기화.
       로컬은 캐시로 쓰고, store.set 시 백그라운드로 클라우드에 upsert,
       로그인 시 클라우드에서 내려받아 즉시 동기화.
   • 로컬 모드 : 키가 없으면 기존처럼 이 브라우저(localStorage)에만 계정/기록 저장.

   로그인 방법(클라우드 모드):
     1) Google   — Supabase 기본 OAuth (provider: 'google')
     2) Kakao    — Supabase 기본 OAuth (provider: 'kakao')
     3) 이메일/비밀번호 — 자체 회원가입/로그인
   (네이버는 Supabase 기본 미지원이라 현재 미포함. 로컬 모드에선 소셜이 숨겨지고 이메일만.)

   가입 시 개인정보 동의(이용약관·개인정보 수집·이용[필수], 마케팅[선택])를 받고,
   동의 이력(veil.consent: 버전·시각)을 계정에 기록합니다. 소셜 가입은 리다이렉트
   전에 veil.pendingConsent 로 보관했다가 복귀 후 계정에 기록합니다.

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

  /* ════════════ 동의(개인정보·약관) 상수 ════════════ */
  const CONSENT_VERSION = '2026-06-11';
  const CONSENT_KEY = 'veil.consent';
  const PENDING_CONSENT_KEY = 'veil.pendingConsent';

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
    async oauth() { throw new Error('소셜 로그인은 클라우드(Supabase) 연결 후 사용할 수 있어요. 지금은 이메일로 가입해 주세요.'); },
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
    const meta = u.user_metadata || {};
    return { id: u.id, email: u.email, name: meta.name || meta.full_name || meta.nickname || (u.email || '').split('@')[0] };
  }
  async function handleSession(session) {
    cloudUser = userFromSession(session);
    if (cloudUser && cloudUser.id !== lastPulledId) {
      lastPulledId = cloudUser.id;
      try { await pullAll(); } catch (e) { console.warn('[Veil] 동기화(pull) 실패:', e); }
    }
    if (!cloudUser) lastPulledId = null;
    try { applyPendingConsent(); } catch (e) { console.warn('[Veil] 동의 기록 실패:', e); }
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
    if (/provider is not enabled|Unsupported provider/i.test(m)) return '이 소셜 로그인은 아직 설정되지 않았습니다(관리자 설정 필요).';
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
    async oauth(provider) {
      await ensureCloud();
      const redirectTo = location.origin + location.pathname;
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) throw new Error(mapErr(error.message));
    },
  };

  const impl = CLOUD ? cloudAuth : localAuth;

  /* ════════════ 공개 API ════════════ */
  const auth = {
    current() { return impl.current(); },
    signup(email, name, pw) { return impl.signup(email, name, pw); },
    login(email, pw) { return impl.login(email, pw); },
    oauth(provider) { return impl.oauth(provider); },
    logout() { return impl.logout(); },
    hasConsent() { return hasValidConsent(); },
    onChange(cb) { if (typeof cb === 'function') listeners.push(cb); },
  };

  const store = {
    _k(k) { const c = auth.current(); return c ? (k + '::u:' + c.id) : k; },
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(this._k(k))); return v == null ? d : v; } catch { return d; } },
    set(k, v) { localStorage.setItem(this._k(k), JSON.stringify(v)); if (CLOUD) pushKey(k, v); },
    del(k) { localStorage.removeItem(this._k(k)); if (CLOUD) delKey(k); },
  };

  /* ════════════ 동의 기록 ════════════ */
  function getConsent() { return store.get(CONSENT_KEY, null); }
  function hasValidConsent() { const c = getConsent(); return !!(c && c.terms && c.privacy); }
  // 로그인 직후 호출: 보류된(pending) 동의가 있으면 현재 계정에 기록한다(중복/기존 동의는 보존).
  function applyPendingConsent() {
    const u = auth.current(); if (!u) return;
    if (hasValidConsent()) { raw.del(PENDING_CONSENT_KEY); return; }
    const p = raw.get(PENDING_CONSENT_KEY, null); if (!p) return;
    store.set(CONSENT_KEY, { version: p.version || CONSENT_VERSION, at: p.at || new Date().toISOString(), terms: true, privacy: true, marketing: !!p.marketing });
    raw.del(PENDING_CONSENT_KEY);
  }

  /* ════════════ 로그인 / 가입 모달 ════════════ */
  const GATE = 'M14 13 H50 a2.4 2.4 0 0 1 2.34 2.92 L49.3 49.1 A2.4 2.4 0 0 1 46.96 51 H42 a2 2 0 0 1 -1.95 -2.44 C41.6 42 33.9 24.6 32 21 C30.1 24.6 22.4 42 23.95 48.56 A2 2 0 0 1 22 51 H17.04 A2.4 2.4 0 0 1 14.7 49.1 L11.66 15.92 A2.4 2.4 0 0 1 14 13 Z';
  const GOOGLE_IC = '<svg class="soc-ic" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.79 2.71v2.26h2.9c1.7-1.56 2.68-3.87 2.68-6.62Z"/><path fill="#34A853" d="M9 18c2.43 0 4.46-.8 5.95-2.18l-2.9-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"/></svg>';
  const KAKAO_IC = '<svg class="soc-ic" viewBox="0 0 18 18" aria-hidden="true"><path fill="#191600" d="M9 1.6C4.86 1.6 1.5 4.2 1.5 7.42c0 2.08 1.38 3.9 3.47 4.94-.15.54-.55 1.98-.63 2.29-.1.39.14.39.3.28.12-.08 1.98-1.34 2.78-1.89.35.05.7.08 1.06.08 4.14 0 7.5-2.6 7.5-5.82S13.14 1.6 9 1.6Z"/></svg>';
  let mode = 'login';

  function consentRequired() { return mode === 'signup'; }
  function consentOk() {
    if (!consentRequired()) return true;
    const t = document.getElementById('vc-terms'), p = document.getElementById('vc-privacy');
    return !!(t && p && t.checked && p.checked);
  }
  function updateConsentState() {
    const g = (id) => document.getElementById(id);
    const all = g('vc-all'), t = g('vc-terms'), p = g('vc-privacy'), m = g('vc-marketing');
    if (all && t && p && m) all.checked = t.checked && p.checked && m.checked;
    const ok = consentOk();
    const submit = g('vauth-submit'); if (submit) submit.disabled = !ok;
    const social = g('vauth-social');
    if (social) social.querySelectorAll('.soc-btn').forEach(b => { b.disabled = consentRequired() && !ok; });
  }

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
        ${CLOUD ? `
        <div class="vauth-social" id="vauth-social">
          <button type="button" class="soc-btn soc-google" data-provider="google">${GOOGLE_IC}<span>Google로 계속하기</span></button>
          <button type="button" class="soc-btn soc-kakao" data-provider="kakao">${KAKAO_IC}<span>카카오로 계속하기</span></button>
          <div class="vauth-or"><span>또는 이메일로</span></div>
        </div>` : ''}
        <form id="vauth-form" novalidate>
          <div class="vauth-field" id="vauth-name-wrap"><label for="vauth-name">이름</label><input type="text" id="vauth-name" autocomplete="name" placeholder="표시될 이름" /></div>
          <div class="vauth-field"><label for="vauth-email">이메일</label><input type="email" id="vauth-email" autocomplete="email" placeholder="you@example.com" /></div>
          <div class="vauth-field"><label for="vauth-pw">비밀번호</label><input type="password" id="vauth-pw" autocomplete="current-password" placeholder="6자 이상" /></div>
          <div class="vauth-consent" id="vauth-consent" hidden>
            <label class="vc-all"><input type="checkbox" id="vc-all" /><span>전체 동의</span></label>
            <label class="vc-item"><input type="checkbox" id="vc-terms" /><span><b>[필수]</b> <a href="policy.html#terms" target="_blank" rel="noopener">이용약관</a>에 동의합니다.</span></label>
            <label class="vc-item"><input type="checkbox" id="vc-privacy" /><span><b>[필수]</b> <a href="policy.html#privacy" target="_blank" rel="noopener">개인정보 수집·이용</a>에 동의합니다.</span></label>
            <label class="vc-item"><input type="checkbox" id="vc-marketing" /><span><b class="opt">[선택]</b> 마케팅·이벤트 정보 수신에 동의합니다.</span></label>
          </div>
          <p class="vauth-legal" id="vauth-legal">로그인 시 <a href="policy.html#terms" target="_blank" rel="noopener">이용약관</a>과 <a href="policy.html#privacy" target="_blank" rel="noopener">개인정보처리방침</a>에 동의한 것으로 간주됩니다.</p>
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
    const social = g('vauth-social');
    if (social) social.querySelectorAll('.soc-btn').forEach(b => b.addEventListener('click', () => onSocial(b.dataset.provider)));
    const all = g('vc-all');
    if (all) all.addEventListener('change', () => { ['vc-terms', 'vc-privacy', 'vc-marketing'].forEach(id => { const el = g(id); if (el) el.checked = all.checked; }); updateConsentState(); });
    ['vc-terms', 'vc-privacy', 'vc-marketing'].forEach(id => { const el = g(id); if (el) el.addEventListener('change', updateConsentState); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }
  function setMode(m) {
    mode = m; const g = (id) => document.getElementById(id); const signup = m === 'signup';
    g('vauth-title').textContent = signup ? '계정 만들기' : '로그인';
    g('vauth-sub').textContent = signup ? '몇 초면 됩니다. 감사일기와 회개 일기가 이 계정에 보관돼요.' : '기록을 계정에 안전하게 보관하세요.';
    g('vauth-name-wrap').style.display = signup ? '' : 'none';
    g('vauth-pw').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    g('vauth-submit').textContent = signup ? '가입하고 시작하기' : '로그인';
    const consent = g('vauth-consent'), legal = g('vauth-legal');
    if (consent) consent.hidden = !signup;
    if (legal) legal.hidden = signup;
    g('vauth-switch').innerHTML = signup
      ? '이미 계정이 있으신가요? <button type="button" id="vauth-switch-btn">로그인</button>'
      : '계정이 없으신가요? <button type="button" id="vauth-switch-btn">가입하기</button>';
    const err = g('vauth-err'); err.hidden = true; err.textContent = '';
    updateConsentState();
  }
  function onSocial(provider) {
    const g = (id) => document.getElementById(id);
    const err = g('vauth-err'); err.hidden = true;
    if (!consentOk()) { err.textContent = '필수 약관에 동의해 주세요.'; err.hidden = false; return; }
    const marketing = !!(consentRequired() && g('vc-marketing') && g('vc-marketing').checked);
    try { raw.set(PENDING_CONSENT_KEY, { version: CONSENT_VERSION, at: new Date().toISOString(), marketing }); } catch {}
    Promise.resolve(auth.oauth(provider)).catch(ex => {
      try { raw.del(PENDING_CONSENT_KEY); } catch {}
      err.textContent = (ex && ex.message) || '소셜 로그인에 실패했습니다.'; err.hidden = false;
    });
  }
  async function onSubmit(e) {
    e.preventDefault(); const g = (id) => document.getElementById(id);
    const err = g('vauth-err'); err.hidden = true;
    const email = g('vauth-email').value, pw = g('vauth-pw').value, name = g('vauth-name').value;
    if (mode === 'signup' && !consentOk()) { err.textContent = '필수 약관에 동의해 주세요.'; err.hidden = false; return; }
    const submit = g('vauth-submit'); const label = submit.textContent;
    submit.disabled = true; submit.textContent = '처리 중…';
    try {
      if (mode === 'signup') {
        const marketing = !!(g('vc-marketing') && g('vc-marketing').checked);
        try { raw.set(PENDING_CONSENT_KEY, { version: CONSENT_VERSION, at: new Date().toISOString(), marketing }); } catch {}
        await auth.signup(email, name, pw);
        applyPendingConsent();   // 세션이 있으면(로컬/즉시가입) 바로 기록, 없으면 다음 로그인 시 기록
      } else {
        await auth.login(email, pw);
      }
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
