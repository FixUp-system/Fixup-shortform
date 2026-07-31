# 인증 켜기 — 처음 한 번 해야 하는 것

인증·RLS 를 붙인 뒤 **사람이 직접 해야 하는 설정**이다. 순서대로 하면 된다.
이 문서의 각 단계는 실제 코드와 대조해 확인했다(파일:줄 표기가 그 근거다).

> ⚠️ 이 설정을 마치기 전에는 **배포하지 마라.** 소유자 검사가 `owner_id` 로 걸리는데
> 백필(5단계) 전에는 그 값이 비어 있어 기존 프로젝트가 전부 안 보인다.

---

## 1. 스키마 올리기

Supabase 대시보드 → **SQL Editor** → New query.
`db/schema.sql` **전체**를 복사해 붙여넣고 실행한다.

`if not exists`·`or replace` 로 짜여 있어 **통째로 다시 올려도 안전하다.**

확인: `select sum_costs(null, null);` 이 숫자를 돌려주면 된다.

## 2. `.env.local` 에 anon 키 추가

대시보드 → **Project Settings → API** 에서 `anon` `public` 키를 복사한다.

```
SUPABASE_ANON_KEY=<anon public key>
NEXT_PUBLIC_SUPABASE_URL=https://<프로젝트>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 는 이미 있을 것이다.

> ★ `NEXT_PUBLIC_` 접두어는 **브라우저 번들에 값을 박는다.** anon 키는 공개값이라 괜찮다.
> **`SUPABASE_SERVICE_ROLE_KEY` 에는 절대 붙이지 마라** — 붙는 순간 모든 방문자가
> RLS 를 우회하는 열쇠를 갖는다.

## 3. 매직링크·리다이렉트 URL

대시보드 → **Authentication → Providers → Email**
- "Enable Email provider" 켜기

대시보드 → **Authentication → URL Configuration**
- Site URL: `http://localhost:3000` (나중에 배포 도메인으로 교체)
- Redirect URLs 에 `http://localhost:3000/**` 추가
  — 매직링크가 `/auth/callback` 으로 돌아온다(`app/login/page.js` 의 `emailRedirectTo`)

## 4. 첫 관리자 계정 — ★ 두 곳을 다 고쳐야 한다

1. 앱 `/login` 에서 사장님 이메일로 매직링크를 받아 로그인한다
2. SQL 편집기에서 원장을 올린다:
   ```sql
   update profiles set status = 'approved', role = 'admin'
   where email = '<사장님 이메일>';
   ```
3. **`app_metadata` 도 반드시 맞춘다. 선택이 아니다.**
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin","status":"approved"}'::jsonb
   where email = '<사장님 이메일>';
   ```
4. **로그아웃 후 다시 로그인**한다(`app_metadata` 는 토큰 발급 시점 스냅샷이다)

> **왜 두 곳인가**: `middleware.js` 가 매 요청 `app_metadata.role` 과 `app_metadata.status` 를
> **각각** 읽는다. `profiles` 는 인가에 쓰이지 않는다 — 운영자 화면이 보는 원장이고,
> `profiles.role` 은 원장 화면의 표시 이름에만 쓰인다.
>
> 2번만 하고 3번을 건너뛰면 `status` 가 기본값 `"pending"` 으로 남아 **`/admin` 뿐 아니라
> 앱 전체가 `/pending` 으로 튕긴다.** 승인된 관리자인데 아무 데도 못 들어가는 상태가 된다.
>
> 이후 운영자 화면의 승인 버튼은 이 두 곳을 **자동으로 함께** 쓴다. 손으로 하는 것은
> 첫 계정 한 번뿐이다.

## 5. 기존 데이터 백필

대시보드 → Authentication → Users 에서 사장님 uuid 를 복사한다.

```bash
node scripts/backfill-owner.mjs <사장님-uuid>
```

- 그 uuid 가 `profiles` 에 **실제로 있는지 먼저 확인**하고, 없으면 아무것도 안 바꾸고 죽는다
- 바꾼 건수를 출력한다 — 기대치와 맞는지 본다
- **두 번 돌려도 안전하다.** 중간에 실패해도 그냥 다시 돌리면 남은 것만 이어서 채운다
- `cost_records.actor` 의 `"local"` 은 **그대로 둔다** — 과거 지출을 특정 사용자 앞으로
  옮기면 사용자별 상한이 첫날부터 잘못 물린다

## 6. RLS 가 실제로 무는지 확인

```bash
npx vitest run tests/rls-anon.test.js
```

기대: **PASS 4개**.

> ★ 이 테스트가 **RLS 정책을 실제로 검증하는 유일한 자리**다. 앱은 `service_role` 로 붙어
> 정책을 우회하므로 다른 테스트는 정책을 통과하는 게 아니라 무시한다.
> 하나라도 실패하면 anon 키로 뭔가를 읽거나 쓸 수 있다는 뜻이니 1단계를 다시 확인한다.

## 7. 손으로 관통 확인

```bash
SHOTFORM_FAKE=all npm run build && SHOTFORM_FAKE=all npm run start
```

⚠️ **`npm run dev` 로 하지 마라** — dev 의 라우트별 컴파일 때문에 저장 직후 조회가 404 나는
현상이 관찰됐다. `SHOTFORM_FAKE=all` 이라 **돈은 0원**이다.

- [ ] 로그인 → 홈에 백필된 프로젝트들이 보인다
- [ ] 새 프로젝트를 만들어 ②대본까지 진행한다
- [ ] SQL 편집기에서 확인:
      ```sql
      select actor, count(*), sum(est_cost_usd) from cost_records group by actor;
      ```
      **새 기록의 actor 가 사장님 uuid 여야 한다.** 새로 `"local"` 행이 생기면
      감싸지 않은 자리가 남은 것이다 — 어느 화면에서 났는지 알려 달라
- [ ] 시크릿 창에서 `/api/projects` 를 열면 **401**
- [ ] `/costs` 를 일반 사용자로 열면 **403**

## 8. 헤더 위조가 막히는지

서버가 뜬 상태에서:

```bash
curl -i http://localhost:3000/api/projects -H "x-shotform-user: 11111111-1111-1111-1111-111111111111"
```

기대: **401**. middleware 가 이 헤더를 지우고 세션으로만 판정한다.

**200 이 나오면 심각하다** — 클라이언트가 보낸 헤더로 사용자를 위조할 수 있다는 뜻이니
즉시 알려 달라.

---

## 알아둘 것

- **승인 반영은 즉시다.** middleware 가 매 요청 `getUser()` 로 Auth 서버에서 상태를 다시
  받는다. 차단도 다음 요청에 바로 걸린다
- **`/admin` 으로 가는 링크가 화면에 없다.** URL 을 직접 입력한다
- **Supabase 무료 플랜은 며칠 요청이 없으면 일시정지된다.** 갑자기 전부 로그인 화면으로
  튕기면 대시보드에서 재개한다(서버 로그에 `getUser 실패` 가 남는다)
- 배포는 아직 막혀 있다 — `lib/compose.js` 가 ffmpeg 자식 프로세스와 로컬 경로를 요구한다
