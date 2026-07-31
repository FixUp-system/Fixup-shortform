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

-- 합계는 DB 가 낸다.
--
-- ★ 왜 함수인가: PostgREST 로 est_cost_usd 열을 받아 앱에서 더하면 행 상한(기본 1000)에
-- 걸려 **말없이 일부만** 더해진다. 그러면 예산 가드(assertBudget)의 총액 비교가 영원히
-- 거짓이 되어 $20 상한이 조용히 사라진다. 합계를 DB 안에서 끝내면 그 길이 없다.
-- where 절이 상수 null 이면 전체, 값이 있으면 cost_records_project_idx 를 탄다.
create or replace function sum_costs(p_project_id uuid default null)
returns numeric
language sql
stable
as $$
  select coalesce(sum(est_cost_usd), 0)
  from cost_records
  where p_project_id is null or project_id = p_project_id;
$$;

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
