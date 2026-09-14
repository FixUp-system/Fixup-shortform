# 크레딧 코드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 이번 회차는 사장님 "구현 진행해줘"에 따라 **같은 세션에서 인라인으로** 실행한다.

**Goal:** 운영자가 와디즈 명단을 붙여 넣어 고유 크레딧 코드를 만들고 CSV 로 내려받으며, 서포터는 승인 대기 중에도 코드를 등록해 크레딧을 받는다.

**Architecture:** 순수 함수(`lib/credit-codes.js`: 코드 생성·정규화·붙여 넣기 파싱·CSV) → 저장소 4함수(메모리·Supabase, 등록은 SQL 함수 한 트랜잭션) → 라우트 4개(`withUser` 에 `pending` 옵션) → 화면(`/admin/codes` 새 페이지 · 공용 입력 컴포넌트를 `/pending`·`/me` 에 한 줄씩).

**Tech Stack:** Next.js App Router · plain JS · vitest · Supabase(Postgres)

**Spec:** `docs/superpowers/specs/2026-09-14-credit-codes-design.md`

## Global Constraints

- 브랜치 `feat/credit-codes` 워크트리에서만 — `feat/credit-unit` 은 프론트 작업 중
- `app/admin/page.js` 는 고치지 않는다 · `app/me/page.js` 는 입력칸 삽입만
- 새 의존성 없음
- `lib/credit-codes.js` 는 화면이 import 한다 → **import 문 0**(fs 금지 규칙)
- 코드: 12자, 알파벳 `23456789ABCDEFGHJKMNPQRSTUVWXYZ`(31자), 표시 `XXXX-XXXX-XXXX`
- 한 번에 최대 2,000행 · credits 는 양의 정수
- 등록 결과는 `ok` / `used` / `not_found` 셋 · 라우트 200 / 409 / 404
- 충전 사유 `크레딧 코드 XXXX-XXXX-XXXX`, `granted_by` = 등록한 본인
- CSV 는 UTF-8 BOM
- 판정은 `npx vitest run` 전부 그린 + `npx next build` exit 0

---

### Task 1: 순수 함수 `lib/credit-codes.js`

**Files:** Create `lib/credit-codes.js` · Test `tests/credit-codes-lib.test.js`

**Produces:**
- `CODE_ALPHABET`, `CODE_LENGTH = 12`, `MAX_CODE_ROWS = 2000`
- `generateCode(randomInt: (n) => int) → "ABCD2345EFGH"`(하이픈 없는 정규형)
- `normalizeCode(input) → string`(대문자·하이픈/공백 제거) · `isCodeShape(s) → bool`
- `formatCode(code) → "ABCD-2345-EFGH"`
- `redeemReason(code) → "크레딧 코드 ABCD-2345-EFGH"`
- `parsePasted(text) → { headers: string[], rows: object[] }` — 탭 구분, 엑셀 따옴표 칸(탭·줄바꿈 포함) 처리, 빈 줄 무시, 머리글 중복은 `이름 (2)`
- `toCsv(headers, rows) → string` — BOM + CRLF, `, " \n` 이스케이프

- [ ] 테스트: 길이·알파벳, 정규화(소문자·하이픈·공백), 모양 판정, 표시형, 파서(따옴표 칸 · 빈 줄 · 중복 머리글 · CRLF), CSV(BOM · 이스케이프)
- [ ] 실패 확인 → 구현 → 통과 → 커밋

### Task 2: 저장소 + 스키마

**Files:** Modify `lib/store/memory.js`, `lib/store/supabase.js`, `db/schema.sql` · Test `tests/credit-codes-store.test.js`

**Produces (두 저장소 같은 모양):**
- `insertCreditCodes(rows: {code, amount_credits, batch, meta, created_by}[]) → boolean`(코드 충돌이면 false, 아무것도 안 넣음)
- `listCreditCodes() → row[]`(최신 먼저, 전부)
- `deleteCreditCode(code) → "deleted" | "used" | "not_found"`
- `redeemCreditCode(code, userId, reason) → { result: "ok"|"used"|"not_found", credits: number|null }` — ok 이면 `credit_grants` 행이 함께 생긴다

- [ ] 테스트(메모리): 삽입·목록 순서 / 충돌 시 false·부분 삽입 없음 / 등록 ok → sumGrants 증가·사유·granted_by / 두 번째 used / 없는 코드 / `Promise.all` 동시 등록 둘 중 하나만 ok / 쓴 코드 삭제 used · 안 쓴 코드 deleted
- [ ] 스키마: `credit_codes` 표 · `redeem_credit_code` plpgsql 함수 · RLS enable
- [ ] Supabase 구현(23505 → false · 목록 1000행씩 range 로 끝까지 · rpc)
- [ ] 통과 → 커밋

### Task 3: 라우트 + `withUser({ pending })`

**Files:** Modify `lib/auth/require-user.js` · Create `app/api/admin/codes/route.js`, `app/api/admin/codes/[code]/route.js`, `app/api/credits/redeem/route.js` · Test `tests/credit-codes-routes.test.js`

**Consumes:** Task 1·2 전부. **Produces:**
- `POST /api/admin/codes` `{batch, rows:[{credits, meta}]}` → 200 `{codes:[{code, amount_credits, meta}]}` · 400(묶음 이름 없음·행 0·2,000 초과·credits 비정수/≤0)
- `GET /api/admin/codes` → `{codes:[{code, amount_credits, batch, meta, created_at, redeemed_at, redeemed_by, redeemer:{email, display_name, status}|null}]}`
- `DELETE /api/admin/codes/[code]` → 200 / 409 / 404
- `POST /api/credits/redeem` `{code}` → 200 `{credits, balance}` / 400 모양 틀림 / 404 / 409

- [ ] 테스트: 일반 사용자 403(셋 다) · 입력 검증 · 생성 코드 수·고유 · 목록에 등록자 정보 · 삭제 409 · 승인 대기 등록 200 · 차단 403 · 소문자·하이픈 입력 통과 · 두 번째 409
- [ ] `withUser` 에 `pending` 옵션(pending 만 통과, blocked 403) → 라우트 구현 → 통과 → 커밋

### Task 4: 화면

**Files:** Create `components/CreditCodeForm.jsx`, `app/admin/codes/page.js` · Modify `app/pending/page.js`, `app/me/page.js`(삽입), `components/Sidebar.jsx`(운영자 링크 한 블록) · Test `tests/credit-codes-ui.test.js`

- `CreditCodeForm({ onRedeemed, pending })` — 입력 + [등록] · 200 이면 "N 크레딧이 들어왔어요" (+pending 이면 "승인되면 바로 쓰실 수 있어요") · 404/409 문구 그대로
- `/admin/codes`: 묶음 이름 · 붙여 넣기 textarea · 리워드 열 select · 리워드 값별 크레딧 input · [코드 만들기] · [CSV 내려받기](Blob) · 목록(묶음 필터 · 묶음 CSV 다시 받기 · 안 쓴 코드 [지우기] · 승인 대기 등록자 [승인] = `PATCH /api/admin/users/[id] {status:"approved"}`)

- [ ] 소스 판 테스트: 페이지들이 라우트 주소를 부른다 · `/me`·`/pending` 이 컴포넌트를 쓴다 · 사이드바 링크가 `isAdmin` 안 · `setInterval` 없음
- [ ] 구현 → 전체 `npx vitest run` → `npx next build` → 커밋

### Task 5: 인계

- [ ] `OUTSTANDING.md`(이 브랜치) 에 상태·배포 전 스키마 반영 적기 → 커밋
