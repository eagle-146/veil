# Veil — Supabase 클라우드 동기화 설정 (5분)

코드는 이미 다 붙어 있습니다. 아래 4단계만 하면 "여러 기기 로그인 + 동기화"가 켜집니다.
키를 넣기 전까지는 자동으로 기기-로컬 모드로 동작하므로, 사이트는 지금도 정상입니다.

> 무료 플랜으로 시작하면 됩니다(이 앱은 텍스트 위주라 무료 한도로 충분).

---

## 1) 프로젝트 만들기
1. https://supabase.com 가입 → **New project**
2. 이름/비밀번호(DB 비번) 정하고 Region은 **Northeast Asia (Seoul)** 권장 → 생성(1~2분)

## 2) 테이블 + 보안(RLS) 만들기
좌측 **SQL Editor → New query** 에 아래를 붙여넣고 **Run**:

```sql
create table if not exists public.user_data (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

alter table public.user_data enable row level security;

create policy "own rows - select" on public.user_data
  for select using (auth.uid() = user_id);
create policy "own rows - insert" on public.user_data
  for insert with check (auth.uid() = user_id);
create policy "own rows - update" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows - delete" on public.user_data
  for delete using (auth.uid() = user_id);
```

이 정책 덕분에 **각 사용자는 오직 자기 행(row)만** 읽고 쓸 수 있습니다(계정 단위 보안).

## 3) (권장) 이메일 확인 끄기 — 즉시 가입/로그인되게
**Authentication → Sign In / Providers → Email** 에서 **"Confirm email"** 을 **끄면**,
가입하자마자 바로 로그인됩니다(테스트가 편함). 켜 두면 가입 후 메일의 링크를 눌러야 로그인됩니다.

또한 **Authentication → URL Configuration** 의 Site URL 에 배포 주소
(예: `https://veil-liard.vercel.app`)를 넣어 두세요.

## 4) 키 2개를 코드에 넣기
**Project Settings → API** 에서 두 값을 복사:
- **Project URL** (예: `https://abcd1234.supabase.co`)
- **anon public** key (`eyJhbGci...` 로 시작하는 긴 문자열)

`supabase-config.js` 파일을 열어 채웁니다:

```js
window.VEIL_SUPABASE = {
  url: 'https://abcd1234.supabase.co',
  anonKey: 'eyJhbGci....(anon public)',
};
```

저장하고 `git push` 하면(자동 배포) 클라우드 동기화가 켜집니다.

> anon(공개) 키는 클라이언트에 노출돼도 안전합니다. 데이터는 위 RLS가 보호합니다.
> **service_role 키는 절대 여기에 넣지 마세요.**

---

## 동작 방식 / 프라이버시
- 로그인하면 감사일기·큐티·매일말씀·성경책장·회개 일기가 **계정에 동기화**되어 다른 기기에서도 보입니다.
- **회개 내용은 기본적으로 저장되지 않습니다.** 사용자가 "일기에 저장"을 누를 때만
  본인 계정에 보관됩니다(B안). 그 외 고백·응답 과정은 기기 안에서만 처리됩니다.
- 로컬-우선 구조: 화면은 localStorage 캐시로 즉시 뜨고, 백그라운드로 클라우드와 동기화합니다.

저장 위치: 단일 테이블 `user_data(user_id, key, value jsonb)` 에 키별 JSON으로 보관
(`veil.gratitude`, `veil.qt`, `veil.daily`, `veil.bible`, `veil.confession.journal` 등).
