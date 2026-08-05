# 크레딧 (2026-08-05)

앱이 "이 사람이 얼마나 더 만들 수 있는가"를 안다. 서비스화 세 번째 관문
(저장 계층 → 인증·RLS → **크레딧** → 결제).

빠른 생성이 자동 관통으로 바뀌면서 **[영상 만들기] 한 번 = ~$2.59 가 백그라운드에서
끝까지** 나간다. 중간에 멈출 자리도, 사람이 보고 있는 자리도 없다. 무료 체험 한 편이
그대로 현금 손실이고 어뷰징이 곧 유출이다.

## 확정된 결정

| 결정 | 내용 |
|---|---|
| 범위 | **크레딧만.** 결제(PG·카드·영수증)는 별도 스펙 — PG 심사·통신판매업 신고(1~2주)를 기다리지 않고 지금 구멍을 막는다. 충전은 운영자 수동 |
| 단위 | **영상 편수로 보여준다.** 내부 계산은 USD(원장이 USD 라서), 화면은 `PER_VIDEO_USD` 로 나눠 "3편 남았어요" |
| 차감 | **쓴 만큼.** 실비용이 계속 크레딧을 깎는다 — 예약·확정 2단계를 쓰지 않는다 |
| 두 입구 | 빠른 생성(자동 관통)과 단계별 만들기 **둘 다** 쓴 만큼 차감. 재생성도 자연히 값을 치른다 |
| 시작 잔액 | **0.** 운영자가 백오피스에서 넣어준다(체험이든 유료든). 자동 지급 없음 |

## 아키텍처 — 원장이 곧 잔액 (채택안 A)

**잔액(USD) = `sum_grants(user)` − `sum_costs(actor: user)`**

차감 트랜잭션을 새로 만들지 않는다. 모든 유료 호출이 이미 `cost_records` 에 기록되므로
**그 기록이 곧 차감**이다. 이 결정이 "쓴 만큼 차감"과 "두 입구가 같은 자를 쓴다"를
공짜로 성립시킨다. `request_id` 기본키(멱등키)가 이중 차감을 이미 막는다.

기각한 안:
- **B. `profiles.credit_balance` 컬럼을 두고 UPDATE 로 차감** — 원장과 잔액이 갈라질
  자리가 생기고(기록 실패 시 불일치) 동시 차감에 락이 필요하다. 이 저장소가 이미
  "합계는 DB 가 낸다"로 정리한 것을 되돌린다
- **C. 예약·확정 2단계** — 실패·취소 되돌림 경로가 새로 필요한데, "쓴 만큼"이면
  예약의 이점이 거의 없다

### 스키마

```sql
create table if not exists credit_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount_usd  numeric not null,          -- 양수=충전, 음수=회수(운영자 정정)
  reason      text not null,             -- "체험 1편" · "유료 충전" · "정정"
  granted_by  uuid not null,             -- 운영자 uuid (감사)
  created_at  timestamptz not null default now()
);
create index if not exists credit_grants_user on credit_grants (user_id);
alter table credit_grants enable row level security;   -- 정책 0개 = 전부 거부(앱은 service_role)
```

```sql
create or replace function sum_grants(p_user_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(amount_usd), 0) from credit_grants where user_id = p_user_id;
$$;
```

합계는 **반드시 SQL 함수**가 낸다 — 앱에서 행을 받아 더하면 PostgREST 행 상한(기본 1000)에
걸려 조용히 일부만 더한다. 이 저장소가 `sum_costs` 에서 이미 겪은 함정이다.

이 테이블은 감사 로그이기도 하다: 누가(`granted_by`) 언제 왜(`reason`) 넣었는지가 행으로 남는다.

## 두 개의 게이트

돈이 나가는 자리는 이미 하나다(`assertBudget`, fal 호출 직전). 여기에 **시작 게이트**를 더한다.

1. **시작 게이트** — `POST /api/projects/[id]/auto` 와 단계별의 유료 시작 버튼
   (`/cuts`·`/voice`·`/images`·`/clips`, 그리고 컷별 regen 3종).
   잔액이 그 작업의 하한에 못 미치면 **402**로 막는다.
   - 자동 관통: 하한 = `PER_VIDEO_USD` 한 편치. 잔액 $0.50 으로 시작해 중간에 멈추면
     **돈만 나가고 영상이 없다** — 그걸 막는 자리다
   - 단계별: 하한 = 그 단계의 예상 원가(이미 `estimateCost` 가 낸다)
2. **호출 게이트** — `assertBudget` 의 `limitUser()` 가 고정 $5 대신 **그 사용자의 잔액**을
   돌려준다. 전역(`SHOTFORM_BUDGET_TOTAL_USD`)·프로젝트 상한은 **회사 안전핀으로 그대로** 둔다.

`BudgetExceeded.scope === "user"` 는 이제 "크레딧 소진"을 뜻한다 — 화면 문구를 그에 맞게
가른다(전역·프로젝트 초과는 여전히 운영자 문제라 다른 문구여야 한다).

### 남기는 것 — 병렬 경쟁

자동 관통이 컷마다 동시에 호출하므로 잔액을 **조금 넘길 수 있다**(최대 한 컷 값 ≈ $0.08~0.13).
시작 게이트가 한 편치를 이미 확인했으므로 실제 초과는 소액이고, 잔액이 음수가 되면
다음 시작 게이트가 막는다. 완전 차단(행 락)은 관통을 직렬화해 컷 12개에 3분 24초가 되므로
하지 않는다 — 이 저장소가 저장 계층에서 이미 실측한 트레이드오프다.

## 운영자 충전과 사용자 화면

- **백오피스 `/admin`**: 사용자 행에 잔액(편수 + USD) 표시 + [크레딧 넣기] —
  편수와 사유를 받아 `credit_grants` 에 한 줄(USD 로 환산해 저장). 회수는 음수로 같은 자리.
  라우트는 `POST /api/admin/users/[id]/credits`(운영자 전용, `withUser({adminOnly:true})`).
- **사이드바**: 지금 *"실험 모드 / 무제한 / 테스트 기간에는 크레딧을 차감하지 않아요"* 가
  있는 자리(`components/Sidebar.jsx` 의 `.credit-box`)를 **"크레딧 N편 남음"** 으로 바꾼다.
  화면이 이미 약속한 자리를 채우는 일이다. 잔액은 `GET /api/credits` 가 준다.
- **부족할 때**: 빠른 생성의 [영상 만들기]가 비활성 + *"크레딧이 모자라요 — 운영자에게
  문의해 주세요"*. 결제 전이라 자가 충전 동선은 두지 않는다(YAGNI).
- 편수 표시는 **내림**(`Math.floor`). 정확한 USD 는 비용 기록 화면(`/costs`)에서 본다.

## 테스트 — 지키는 척하지 않게

이 저장소가 아홉 번 잡은 패턴을 피한다:

- 잔액 계산이 **실제 원장·충전 행**을 거친다(모킹한 합계가 아니라). 메모리 스토어에도
  `sumGrants` 를 같은 계약으로 구현하고, 두 스토어가 같은 답을 내는지 본다
- 시작 게이트: 잔액 부족 시 **402 이고 `runAutoPipeline` 이 안 불린다**(파이프라인 미호출까지)
- 호출 게이트: 잔액을 넘기면 **fal 로 실제 요청이 안 나간다** — 옛
  `quick-create-budget.test.js` 가 잡던 그 자리(그 파일은 t2v 와 함께 삭제됐다)
- 충전 → 소비 → 잔액 감소가 **한 흐름으로** 확인된다(관통 없이 원장에 직접 기록해도 된다)
- 운영자 충전이 **감사 가능**하다(`granted_by`·`reason` 이 남는다), 그리고 **운영자만** 가능하다
- 음수 잔액에서 시작 게이트가 막는다(초과 뒤 다음 시작)

## 이번 스펙에 넣지 않는 것

- 결제(PG·카드·영수증·자가 충전) — 별도 스펙
- 크레딧 만료·구독·플랜 — 아직 팔 것이 정해지지 않았다
- 사용자에게 보내는 잔액 부족 알림(메일) — 커스텀 SMTP 가 아직 없다
- 완전한 동시성 차단(행 락) — 위 "남기는 것" 참조
