# Veil 교회(B2B) — Supabase 스키마 설정

교회 기능(전교인 통독 · 기도제목/중보 · 교적/생일)은 **교회(조직)–교인** 멀티테넌트 구조라
개인용 `user_data` 와는 별도 테이블이 필요합니다. 아래 SQL을 **한 번만** 실행하면 됩니다.

> Supabase 대시보드 → **SQL Editor → New query** 에 붙여넣고 **Run**.
> 정책을 먼저 지우고 다시 만들기 때문에 **여러 번 실행해도 안전**합니다(idempotent).

```sql
-- ════════════════════════════════════════════════
-- Veil 교회(B2B) 스키마 + RLS
-- ════════════════════════════════════════════════

-- 1) 테이블 ----------------------------------------------------------
create table if not exists public.churches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'seed',          -- seed|lamp|beacon|temple
  owner_id    uuid not null references auth.users on delete cascade,
  invite_code text unique not null,                  -- 교인 합류 코드(앱이 생성)
  created_at  timestamptz default now()
);

create table if not exists public.church_members (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches on delete cascade,
  user_id    uuid references auth.users on delete set null,  -- null = 관리자 등록 교적(계정 없음)
  name       text not null,
  birthday   date,
  phone      text,
  role       text not null default 'member',         -- admin|leader|member
  note       text,
  created_at timestamptz default now()
);
-- 한 계정은 한 교회에 한 번만(관리자 등록 교적은 user_id가 null이라 제외)
create unique index if not exists church_members_unique_user
  on public.church_members(church_id, user_id) where user_id is not null;

create table if not exists public.reading_plans (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches on delete cascade,
  title      text not null,
  start_date date not null default current_date,
  days       int  not null default 365,              -- 통독 기간(일). 1189장을 days로 분배
  created_at timestamptz default now()
);
-- 통독 유형: sequential | mccheyne (맥체인식 4트랙)
alter table public.reading_plans add column if not exists kind text not null default 'sequential';

create table if not exists public.reading_progress (
  id        uuid primary key default gen_random_uuid(),
  plan_id   uuid not null references public.reading_plans on delete cascade,
  user_id   uuid not null references auth.users on delete cascade,
  day_index int  not null,                           -- 완료한 '일차'(0-base)
  read_at   timestamptz default now(),
  unique (plan_id, user_id, day_index)
);

create table if not exists public.prayer_requests (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches on delete cascade,
  author_id     uuid references auth.users on delete set null,
  author_name   text,
  title         text not null,
  body          text,
  is_anonymous  boolean not null default false,
  status        text not null default 'open',        -- open|praying|answered
  intercessor_id uuid references auth.users on delete set null,
  created_at    timestamptz default now()
);

-- 2) 보안 헬퍼 함수 (SECURITY DEFINER → RLS 재귀 방지) -----------------
create or replace function public.is_church_member(cid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists(
    select 1 from church_members m
    where m.church_id = cid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_church_admin(cid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from churches c where c.id = cid and c.owner_id = auth.uid())
      or exists(select 1 from church_members m
                where m.church_id = cid and m.user_id = auth.uid() and m.role = 'admin');
$$;

-- 초대코드로 교회 합류 (비회원은 churches를 조회 못 하므로 RPC로 처리)
create or replace function public.join_church(code text, display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select id into cid from churches where invite_code = code;
  if cid is null then raise exception '유효하지 않은 초대코드입니다.'; end if;
  if not exists(select 1 from church_members where church_id = cid and user_id = auth.uid()) then
    insert into church_members(church_id, user_id, name, role)
      values (cid, auth.uid(), coalesce(nullif(display_name,''), '교인'), 'member');
  end if;
  return cid;
end; $$;

-- 3) RLS 켜기 --------------------------------------------------------
alter table public.churches         enable row level security;
alter table public.church_members   enable row level security;
alter table public.reading_plans    enable row level security;
alter table public.reading_progress enable row level security;
alter table public.prayer_requests  enable row level security;

-- 4) 정책 (재실행 안전) ----------------------------------------------
-- churches
drop policy if exists ch_sel on public.churches;
drop policy if exists ch_ins on public.churches;
drop policy if exists ch_upd on public.churches;
drop policy if exists ch_del on public.churches;
create policy ch_sel on public.churches for select
  using (owner_id = auth.uid() or is_church_member(id));
create policy ch_ins on public.churches for insert
  with check (owner_id = auth.uid());
create policy ch_upd on public.churches for update
  using (is_church_admin(id)) with check (is_church_admin(id));
create policy ch_del on public.churches for delete
  using (owner_id = auth.uid());

-- church_members
drop policy if exists cm_sel on public.church_members;
drop policy if exists cm_ins on public.church_members;
drop policy if exists cm_upd on public.church_members;
drop policy if exists cm_del on public.church_members;
create policy cm_sel on public.church_members for select
  using (is_church_member(church_id) or is_church_admin(church_id));
create policy cm_ins on public.church_members for insert
  with check (is_church_admin(church_id));
create policy cm_upd on public.church_members for update
  using (is_church_admin(church_id) or user_id = auth.uid())
  with check (is_church_admin(church_id) or user_id = auth.uid());
create policy cm_del on public.church_members for delete
  using (is_church_admin(church_id));

-- reading_plans
drop policy if exists rp_sel on public.reading_plans;
drop policy if exists rp_ins on public.reading_plans;
drop policy if exists rp_upd on public.reading_plans;
drop policy if exists rp_del on public.reading_plans;
create policy rp_sel on public.reading_plans for select
  using (is_church_member(church_id) or is_church_admin(church_id));
create policy rp_ins on public.reading_plans for insert
  with check (is_church_admin(church_id));
create policy rp_upd on public.reading_plans for update
  using (is_church_admin(church_id)) with check (is_church_admin(church_id));
create policy rp_del on public.reading_plans for delete
  using (is_church_admin(church_id));

-- reading_progress (본인 것 + 관리자는 자기 교회 플랜 진도 열람)
drop policy if exists pg_sel on public.reading_progress;
drop policy if exists pg_ins on public.reading_progress;
drop policy if exists pg_del on public.reading_progress;
create policy pg_sel on public.reading_progress for select
  using (user_id = auth.uid()
         or is_church_admin((select church_id from reading_plans where id = plan_id)));
create policy pg_ins on public.reading_progress for insert
  with check (user_id = auth.uid());
create policy pg_del on public.reading_progress for delete
  using (user_id = auth.uid());

-- prayer_requests
drop policy if exists pr_sel on public.prayer_requests;
drop policy if exists pr_ins on public.prayer_requests;
drop policy if exists pr_upd on public.prayer_requests;
drop policy if exists pr_del on public.prayer_requests;
create policy pr_sel on public.prayer_requests for select
  using (is_church_member(church_id) or is_church_admin(church_id));
create policy pr_ins on public.prayer_requests for insert
  with check (is_church_member(church_id) or is_church_admin(church_id));
create policy pr_upd on public.prayer_requests for update
  using (author_id = auth.uid() or intercessor_id = auth.uid() or is_church_admin(church_id))
  with check (author_id = auth.uid() or intercessor_id = auth.uid() or is_church_admin(church_id));
create policy pr_del on public.prayer_requests for delete
  using (author_id = auth.uid() or is_church_admin(church_id));

-- 5) 출석 (attendance) -----------------------------------------------
create table if not exists public.attendance (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches on delete cascade,
  member_id    uuid not null references public.church_members on delete cascade,
  service_date date not null,
  service_type text not null default '주일오전',
  created_at   timestamptz default now(),
  unique (church_id, member_id, service_date, service_type)
);

-- 내 교인 id(현재 교회) — 셀프 출석 체크 RLS용
create or replace function public.my_member_id(cid uuid)
returns uuid language sql security definer set search_path = public as $$
  select id from church_members where church_id = cid and user_id = auth.uid() limit 1;
$$;

alter table public.attendance enable row level security;
drop policy if exists at_sel on public.attendance;
drop policy if exists at_ins on public.attendance;
drop policy if exists at_del on public.attendance;
create policy at_sel on public.attendance for select
  using (is_church_member(church_id) or is_church_admin(church_id));
create policy at_ins on public.attendance for insert
  with check (is_church_admin(church_id) or member_id = my_member_id(church_id));
create policy at_del on public.attendance for delete
  using (is_church_admin(church_id) or member_id = my_member_id(church_id));

-- 6) 구역 / 셀 (church_groups) ---------------------------------------
create table if not exists public.church_groups (
  id        uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches on delete cascade,
  name      text not null,
  leader_member_id uuid references public.church_members on delete set null,
  created_at timestamptz default now()
);
-- 교인을 구역/셀에 배정 (한 교인은 한 구역)
alter table public.church_members add column if not exists group_id uuid references public.church_groups on delete set null;

alter table public.church_groups enable row level security;
drop policy if exists g_sel on public.church_groups;
drop policy if exists g_ins on public.church_groups;
drop policy if exists g_upd on public.church_groups;
drop policy if exists g_del on public.church_groups;
create policy g_sel on public.church_groups for select using (is_church_member(church_id) or is_church_admin(church_id));
create policy g_ins on public.church_groups for insert with check (is_church_admin(church_id));
create policy g_upd on public.church_groups for update using (is_church_admin(church_id)) with check (is_church_admin(church_id));
create policy g_del on public.church_groups for delete using (is_church_admin(church_id));

-- 7) 큐티 나눔 (qt_shares) -------------------------------------------
create table if not exists public.qt_shares (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches on delete cascade,
  author_id  uuid references auth.users on delete set null,
  author_name text,
  share_date date default current_date,
  verse_ref  text,
  content    text not null,
  created_at timestamptz default now()
);
alter table public.qt_shares enable row level security;
drop policy if exists qt_sel on public.qt_shares;
drop policy if exists qt_ins on public.qt_shares;
drop policy if exists qt_del on public.qt_shares;
create policy qt_sel on public.qt_shares for select using (is_church_member(church_id) or is_church_admin(church_id));
create policy qt_ins on public.qt_shares for insert with check (is_church_member(church_id) or is_church_admin(church_id));
create policy qt_del on public.qt_shares for delete using (author_id = auth.uid() or is_church_admin(church_id));

-- 8) 예배 콘티 (service_plans) — 순서 항목은 jsonb 배열 -------------
-- ⚠ 찬송가/CCM 가사 저작권: 가사 본문은 저장하지 말 것. 곡명·순서·키만.
create table if not exists public.service_plans (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches on delete cascade,
  service_date date not null default current_date,
  title        text not null,
  items        jsonb not null default '[]',   -- [{kind,title,detail}, ...]
  created_at   timestamptz default now()
);
alter table public.service_plans enable row level security;
drop policy if exists sp_sel on public.service_plans;
drop policy if exists sp_ins on public.service_plans;
drop policy if exists sp_upd on public.service_plans;
drop policy if exists sp_del on public.service_plans;
create policy sp_sel on public.service_plans for select using (is_church_member(church_id) or is_church_admin(church_id));
create policy sp_ins on public.service_plans for insert with check (is_church_admin(church_id));
create policy sp_upd on public.service_plans for update using (is_church_admin(church_id)) with check (is_church_admin(church_id));
create policy sp_del on public.service_plans for delete using (is_church_admin(church_id));

-- 9) 설교 노트 (sermons) --------------------------------------------
create table if not exists public.sermons (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches on delete cascade,
  sermon_date date not null default current_date,
  title       text not null,
  preacher    text,
  scripture   text,
  content     text,
  created_at  timestamptz default now()
);
alter table public.sermons enable row level security;
drop policy if exists se_sel on public.sermons;
drop policy if exists se_ins on public.sermons;
drop policy if exists se_upd on public.sermons;
drop policy if exists se_del on public.sermons;
create policy se_sel on public.sermons for select using (is_church_member(church_id) or is_church_admin(church_id));
create policy se_ins on public.sermons for insert with check (is_church_admin(church_id));
create policy se_upd on public.sermons for update using (is_church_admin(church_id)) with check (is_church_admin(church_id));
create policy se_del on public.sermons for delete using (is_church_admin(church_id));

-- 10) 주보 (bulletins) ----------------------------------------------
create table if not exists public.bulletins (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches on delete cascade,
  title      text not null,
  week_date  date not null default current_date,
  content    text,
  created_at timestamptz default now()
);
alter table public.bulletins enable row level security;
drop policy if exists bl_sel on public.bulletins;
drop policy if exists bl_ins on public.bulletins;
drop policy if exists bl_upd on public.bulletins;
drop policy if exists bl_del on public.bulletins;
create policy bl_sel on public.bulletins for select using (is_church_member(church_id) or is_church_admin(church_id));
create policy bl_ins on public.bulletins for insert with check (is_church_admin(church_id));
create policy bl_upd on public.bulletins for update using (is_church_admin(church_id)) with check (is_church_admin(church_id));
create policy bl_del on public.bulletins for delete using (is_church_admin(church_id));

-- 11) 새가족 양육 트랙 (newcomers) ----------------------------------
create table if not exists public.newcomers (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid not null references public.churches on delete cascade,
  name            text not null,
  contact         text,
  registered_date date default current_date,
  stage           text not null default '새가족등록',  -- 새가족등록|양육중|정착완료
  care_giver      text,
  note            text,
  created_at      timestamptz default now()
);
alter table public.newcomers enable row level security;
drop policy if exists nc_sel on public.newcomers;
drop policy if exists nc_ins on public.newcomers;
drop policy if exists nc_upd on public.newcomers;
drop policy if exists nc_del on public.newcomers;
create policy nc_sel on public.newcomers for select using (is_church_member(church_id) or is_church_admin(church_id));
create policy nc_ins on public.newcomers for insert with check (is_church_admin(church_id));
create policy nc_upd on public.newcomers for update using (is_church_admin(church_id)) with check (is_church_admin(church_id));
create policy nc_del on public.newcomers for delete using (is_church_admin(church_id));

-- 12) 공지 (notices) ------------------------------------------------
create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches on delete cascade,
  title       text not null,
  body        text,
  pinned      boolean not null default false,
  author_name text,
  created_at  timestamptz default now()
);
alter table public.notices enable row level security;
drop policy if exists no_sel on public.notices;
drop policy if exists no_ins on public.notices;
drop policy if exists no_upd on public.notices;
drop policy if exists no_del on public.notices;
create policy no_sel on public.notices for select using (is_church_member(church_id) or is_church_admin(church_id));
create policy no_ins on public.notices for insert with check (is_church_admin(church_id));
create policy no_upd on public.notices for update using (is_church_admin(church_id)) with check (is_church_admin(church_id));
create policy no_del on public.notices for delete using (is_church_admin(church_id));

-- 13) 봉사 스케줄 (serve_slots) -------------------------------------
create table if not exists public.serve_slots (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches on delete cascade,
  serve_date date not null default current_date,
  role       text not null,
  assignee   text,
  note       text,
  created_at timestamptz default now()
);
alter table public.serve_slots enable row level security;
drop policy if exists sv_sel on public.serve_slots;
drop policy if exists sv_ins on public.serve_slots;
drop policy if exists sv_upd on public.serve_slots;
drop policy if exists sv_del on public.serve_slots;
create policy sv_sel on public.serve_slots for select using (is_church_member(church_id) or is_church_admin(church_id));
create policy sv_ins on public.serve_slots for insert with check (is_church_admin(church_id));
create policy sv_upd on public.serve_slots for update using (is_church_admin(church_id)) with check (is_church_admin(church_id));
create policy sv_del on public.serve_slots for delete using (is_church_admin(church_id));

-- 14) 헌금·재정 (finance_entries) — 집계 공개, 입력은 관리자 ----------
create table if not exists public.finance_entries (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches on delete cascade,
  entry_date date not null default current_date,
  kind       text not null default 'income',   -- income|expense
  category   text not null,
  amount     numeric not null default 0,
  memo       text,
  created_at timestamptz default now()
);
alter table public.finance_entries enable row level security;
drop policy if exists fi_sel on public.finance_entries;
drop policy if exists fi_ins on public.finance_entries;
drop policy if exists fi_upd on public.finance_entries;
drop policy if exists fi_del on public.finance_entries;
create policy fi_sel on public.finance_entries for select using (is_church_member(church_id) or is_church_admin(church_id));
create policy fi_ins on public.finance_entries for insert with check (is_church_admin(church_id));
create policy fi_upd on public.finance_entries for update using (is_church_admin(church_id)) with check (is_church_admin(church_id));
create policy fi_del on public.finance_entries for delete using (is_church_admin(church_id));

-- 15) 기도제목 댓글 (prayer_comments) -------------------------------
create table if not exists public.prayer_comments (
  id          uuid primary key default gen_random_uuid(),
  prayer_id   uuid not null references public.prayer_requests on delete cascade,
  church_id   uuid not null references public.churches on delete cascade,
  author_id   uuid references auth.users on delete set null,
  author_name text,
  body        text not null,
  created_at  timestamptz default now()
);
alter table public.prayer_comments enable row level security;
drop policy if exists pc_sel on public.prayer_comments;
drop policy if exists pc_ins on public.prayer_comments;
drop policy if exists pc_del on public.prayer_comments;
create policy pc_sel on public.prayer_comments for select using (is_church_member(church_id) or is_church_admin(church_id));
create policy pc_ins on public.prayer_comments for insert with check (is_church_member(church_id) or is_church_admin(church_id));
create policy pc_del on public.prayer_comments for delete using (author_id = auth.uid() or is_church_admin(church_id));
```

확인:
```sql
select tablename, count(*) from pg_policies
where tablename in ('churches','church_members','reading_plans','reading_progress','prayer_requests','attendance','church_groups','qt_shares','service_plans','sermons','bulletins','newcomers','notices','serve_slots','finance_entries','prayer_comments')
group by tablename;
```
16개 테이블이 모두 보이면 정상입니다.

## 동작 개념
- **교회 생성** = 로그인한 사용자가 `churches`에 insert(자동으로 owner=admin) → 본인 `church_members`(admin) 추가.
- **교인 합류** = 관리자가 알려준 **초대코드**로 `join_church(code, 이름)` RPC 호출.
- **교적/생일** = 관리자가 `church_members`에 등록(계정 없는 교인도 가능, user_id null).
- **통독** = 관리자가 `reading_plans` 생성 → 교인이 `reading_progress`에 일차별 체크.
- **기도제목** = 교인이 `prayer_requests` 작성 → 중보자 배정/상태 변경.

## 알림톡(생일 자동축하) 설정

실제 카카오 알림톡 발송은 **사업자등록 + 카카오 비즈니스 채널(발신 프로필) + 알림톡 템플릿 사전승인 + 발송대행사(솔라피/알리고/NHN Toast 등) API 키**가 모두 갖춰져야 합니다.

코드에는 발송부가 분리돼 있습니다(`api/notify.js`). 키가 없으면 `not_configured`를 돌려주고, 교적·생일 화면의 **"🎂 축하 알림톡 보내기"** 버튼은 대상 인원만 안내합니다("오늘의 생일" 대시보드로 수동 축하 가능).

발송대행사(예: 솔라피) 키를 Vercel 환경변수에 등록한 뒤 `api/notify.js`의 `TODO`(대행사 send API 호출)를 구현하면 활성화됩니다:
```powershell
vercel env add SOLAPI_API_KEY
vercel env add SOLAPI_API_SECRET
vercel env add SOLAPI_PFID      # 카카오 발신 프로필(채널) ID
vercel env add SOLAPI_SENDER    # 발신 번호(SMS 대체발송용)
```
