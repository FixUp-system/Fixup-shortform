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

-- 업로드 버킷은 비공개다. 서명 URL 을 프론트에 주지 않고 /api/uploads 라우트가 흘려준다 —
-- 문서에 저장된 url 이 영구히 유효해야 하고, 인증이 붙으면 그 라우트가 소유자 검사 자리가 된다.
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;
