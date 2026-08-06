-- shotform 저장 계층. Supabase SQL 편집기에 그대로 붙여 넣는다.
--
-- 문서(projects)는 jsonb 통짜다: 스키마가 아직 흔들려서(2026-07-31 하루에도 vlm.passed 가
-- 2값→3값이 됐다) 컬럼을 못 박으면 매번 마이그레이션을 쓰게 된다.
-- 원장(cost_records)은 행이다: 단일 INSERT 라 락이 필요 없고 SUM 이 인덱스로 끝난다.

create table if not exists projects (
  id          uuid primary key,
  owner_id    uuid,                                -- 지금은 null. 인증이 붙으면 채운다
  status      text not null,
  version     bigint not null default 0,           -- 낙관적 락
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  doc         jsonb not null
);

create table if not exists cost_records (
  request_id    text primary key,                  -- 멱등키: 같은 호출을 두 번 기록하지 않는다
  ts            timestamptz not null,
  endpoint      text not null,
  stage         text,
  actor         text not null,
  project_id    uuid,
  est_cost_usd  numeric(12,6) not null default 0,
  status        text,
  meta          jsonb                              -- prompt·duration·aspect_ratio·video_url
);

create index if not exists cost_records_project_idx on cost_records (project_id);
create index if not exists cost_records_actor_ts_idx on cost_records (actor, ts);

-- 합계는 DB 가 낸다(함수 정의는 이 파일 끝의 "인증·소유자" 절에 있다 — actor 축이 더해졌다).
--
-- ★ 왜 함수인가: PostgREST 로 est_cost_usd 열을 받아 앱에서 더하면 행 상한(기본 1000)에
-- 걸려 **말없이 일부만** 더해진다. 그러면 예산 가드(assertBudget)의 총액 비교가 영원히
-- 거짓이 되어 $20 상한이 조용히 사라진다. 합계를 DB 안에서 끝내면 그 길이 없다.

-- RLS 를 켠다. 정책은 하나도 만들지 않는다 = 익명·로그인 사용자 모두 전부 거부.
--
-- ★ 왜 지금 켜는가: Supabase 는 만든 테이블을 자동으로 PostgREST 에 노출한다. RLS 가
-- 꺼져 있으면 **공개값인 anon 키만 있으면 누구나** projects·cost_records 를 읽고 쓴다.
-- "인증·RLS 는 다음 작업"이라고 미룬 것은 **정책 설계**이지 문을 열어두라는 뜻이 아니다.
-- 앱은 service_role 키로 붙어 RLS 를 우회하므로 지금 코드는 그대로 돈다.
-- 사용자 토큰으로 갈아탈 때 여기에 소유자 정책(owner_id = auth.uid())을 얹는다.
alter table projects enable row level security;
alter table cost_records enable row level security;

-- 업로드 버킷은 비공개다. 서명 URL 을 프론트에 주지 않고 /api/uploads 라우트가 흘려준다 —
-- 문서에 저장된 url 이 영구히 유효해야 하고, 인증이 붙으면 그 라우트가 소유자 검사 자리가 된다.
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

-- ── 인증·소유자 (2026-07-31) ──────────────────────────────────────────────

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  status      text not null default 'pending',   -- pending | approved | blocked
  role        text not null default 'user',      -- user | admin
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);

-- 업로드는 프로젝트가 생기기 전에 일어나서 역조회할 대상이 없다.
-- Storage 키에 owner 를 접두어로 넣는 방법도 있으나 URL 형태가 바뀌어
-- 문서에 박힌 material.photos[].url 이 깨진다 — 이관에서 지킨 불변조건이다.
create table if not exists upload_owners (
  key        text primary key,          -- '<uuid>.jpg' — Storage 객체 키 그대로
  owner_id   uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists upload_owners_owner_idx on upload_owners (owner_id);

-- 가입하면 profiles 행이 자동으로 생긴다.
-- ★ 앱 코드가 만들면 매직링크로 처음 들어온 사용자가 profiles 없이 떠도는 순간이 생긴다.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 합계에 actor 축을 더한다.
--
-- ★ 옛 1인자 정의를 **먼저 지워야 한다.** create or replace 는 인자 개수가 다르면
-- 교체가 아니라 **오버로드**를 만든다. 그러면 sum_costs(null) 호출이 1인자 버전과
-- 2인자 버전(둘 다 default null) 사이에서 모호해져 Postgres 가
-- "function sum_costs(unknown) is not unique" 로 거부한다 — 예산 가드가 통째로 죽는다.
drop function if exists sum_costs(uuid);

create or replace function sum_costs(
  p_project_id uuid default null,
  p_actor      text default null
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(est_cost_usd), 0)
  from cost_records
  where (p_project_id is null or project_id = p_project_id)
    and (p_actor is null or actor = p_actor);
$$;

-- RLS.
--
-- ★ 앱은 service_role 로 붙어 이 정책들을 **우회한다.** 이건 anon 키가 샜을 때의
-- 방어선이지 우리 앱의 방어선이 아니다. "정책을 얹었으니 안전하다"고 착각하면 안 된다 —
-- 진짜 방어는 lib/projects.js 의 소유자 필수 인자다.
alter table profiles      enable row level security;
alter table upload_owners enable row level security;

drop policy if exists projects_owner on projects;
create policy projects_owner on projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for select using (id = auth.uid());

-- cost_records·upload_owners 는 정책을 만들지 않는다 = 전부 거부.
-- 원장은 사용자가 읽을 이유도 쓸 이유도 없다.

-- ── 크레딧 ──────────────────────────────────────────────────────────────
-- 장부가 둘이다. 알갱이가 다르기 때문이다:
--   cost_records  = 우리가 쓴 돈(USD, fal 호출 단위)   ← 회계
--   credit_charges= 사장님이 낸 값(크레딧, 행위 단위)  ← 청구
-- 잔액 = sum_grants - sum_charges (둘 다 크레딧이라 단위가 안 섞인다).
create table if not exists credit_grants (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  amount_credits numeric not null,        -- 양수=충전, 음수=회수(운영자 정정)
  reason         text not null,
  granted_by     uuid not null,
  created_at     timestamptz not null default now()
);
create index if not exists credit_grants_user on credit_grants (user_id);

create table if not exists credit_charges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid,
  kind        text not null,             -- video | regen_image | regen_clip | regen_voice | refund
  credits     numeric not null,          -- 양수=청구, 음수=환불
  idem_key    text not null unique,      -- 같은 청구를 두 번 하지 않는다
  created_at  timestamptz not null default now()
);
create index if not exists credit_charges_user on credit_charges (user_id);

-- 옛 열 이름 이관(2026-08-06). 있으면 바꾸고, 이미 새 이름이면 아무 일도 안 한다.
--
-- ★ 이 블록이 아래 sum_grants 정의보다 **먼저** 와야 한다. 위 `create table if not
-- exists` 는 이미 있는 테이블을 바꾸지 못하므로, 옛 DB 에는 아직 amount_usd 가 남아 있다.
-- 그 상태에서 `sum(amount_credits)` 를 세는 함수를 만들면 Postgres 가 함수 본문을
-- 생성 시점에 검사해(check_function_bodies 기본 on) "column amount_credits does not
-- exist" 로 거부한다 — 파일을 통째로 다시 올릴 수 없게 된다.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='credit_grants' and column_name='amount_usd') then
    alter table credit_grants rename column amount_usd to amount_credits;
  end if;
end $$;

-- 합계는 DB 가 낸다. 앱에서 행을 받아 더하면 PostgREST 행 상한(기본 1000)에 걸려
-- 조용히 일부만 더한다 — 잔액이 부풀어 없는 크레딧이 생긴다.
create or replace function sum_grants(p_user_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(amount_credits), 0) from credit_grants where user_id = p_user_id;
$$;

create or replace function sum_charges(p_user_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(credits), 0) from credit_charges where user_id = p_user_id;
$$;

alter table credit_grants  enable row level security;  -- 정책 0개 = 전부 거부(앱은 service_role)
alter table credit_charges enable row level security;
