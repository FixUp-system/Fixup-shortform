# 생성 상태 가시화 — 설계

2026-08-14

사장님이 [이미지 만들기]·[영상 만들기]를 누른 뒤, **지금 되고 있는지 / 멈췄는지 /
실패했는지**를 화면에서 알 수 없다. 이 문서는 그 셋을 구분해 말하게 만드는 설계다.

캐시(같은 자료를 이동할 때마다 다시 받는 문제)는 **별도 스펙**으로 뺐다 — 이 문서 마지막
「다음 스펙」 절에 방향만 적어 둔다. 순서를 이렇게 잡은 이유: 캐시는 데이터가 화면으로
들어오는 길을 감싸는 층인데, 이 스펙이 그 길(폴링 다섯 벌)을 먼저 정리한다.

## 1. 지금 무슨 일이 일어나는가

세 가지가 겹쳐 "알 수 없음"을 만든다.

### 1-1. 실패가 응답에 안 실린다 (버그)

이미지 파이프라인 실패는 `images_error` 에 기록된다
(`app/api/projects/[id]/images/route.js:58-63`).

그런데 이미지 화면이 2초마다 두드리는 `GET /api/projects/[id]/cuts/status` 는
`cuts_error`·`voice_error`·`video_error` 만 돌려주고 **`images_error` 를 응답에 담지
않는다**(`lib/store/supabase.js:177-198`).

그래서 이미지 생성이 실패해도 화면은 그것을 모른 채 폴링을 계속하다가, 5분 뒤
"생성 상태 확인이 오래 걸리고 있어요" 를 띄운다. 실제로는 오래 걸린 것이 아니라
**이미 실패한 것이고, 그 사유는 서버에 적혀 있는데 전달되지 않았을 뿐이다.**

### 1-2. 조용한 죽음

생성 라우트는 파이프라인을 await 하지 않고 응답한다:

```js
runImagesPipeline(id, user.id).catch(async (e) => { /* images_error 기록 */ });
return Response.json({ started: true });
```

서버리스에서 응답 뒤 함수가 얼면 이 catch 조차 돌지 않는다. 컷은 `generating` 인 채로
남고 **오류 필드도 비어 있다.** 화면에서 보면 "영원히 만드는 중"이다.

### 1-3. 사유가 없다

오류가 남더라도 `e?.message` 한 줄이다. 크레딧이 모자란 것인지, 모델이 거부한 것인지,
네트워크가 끊긴 것인지 사장님이 알 길이 없고, **다시 눌러도 되는지**도 알 수 없다.

## 2. 설계

다섯 조각. ①이 버그 수정, ②③이 새 정보, ④가 화면, ⑤가 정리다.

### ① 실패 필드를 응답에 싣는다 — 그리고 한 표에서 온다

`selectProjectCuts` 에 `images_error` 를 추가하고 `/cuts/status` 가 돌려준다.

다만 필드를 하나 더 넣는 것으로 끝내지 않는다. 지금 상태 라우트 다섯이 **각자 다른 오류
필드 조합**을 손으로 싣고 있고, 이번 버그가 정확히 그 어긋남이다. 그래서
"이 단계가 봐야 할 오류 필드"를 **한 곳의 표**로 두고 스토어·라우트·화면이 같은 표를 본다.

자리는 `lib/steps.js` 옆(단계에 관한 지식이 이미 사는 곳)이다.

```
STEP_ERROR_FIELDS = {
  script: ["cuts_error"],
  voice:  ["voice_error", "cuts_error"],
  images: ["images_error", "cuts_error"],
  video:  ["video_error"],
  done:   ["render_error"],
}
```

표를 읽는 자리가 셋이므로, 표에 없는 필드를 화면이 보거나 라우트가 빠뜨리는 일이
구조적으로 생기지 않는다.

### ② 심장박동 — 조용한 죽음을 감지한다

파이프라인은 이미 컷마다 `updateProject` 를 부른다(`lib/pipeline.js` 의 `setCut`).
그 저장에 진척 표식을 **함께** 얹는다 — 쓰기 횟수는 늘지 않는다.

```
doc.progress = { at, phase, done, total }
```

- `at` — 저장 시각(ms epoch). **patchFn 밖에서 계산해 닫아 넣는다**: `updateProject` 는
  낙관적 락이라 CAS 에 지면 같은 patchFn 을 다시 부른다. 안에서 `Date.now()` 를 부르면
  시도마다 값이 달라진다(치명적이진 않지만, 이 저장소의 규약은 patchFn 을 순수하게 두는
  것이다 — `lib/projects.js:25-40` 주석).
- `phase` — `"images" | "voice" | "video" | "render"`
- `done` / `total` — 끝난 컷 수 / 전체 컷 수. 화면이 "3/8" 로 쓴다.

**시작 시각도 찍는다.** 생성 라우트가 `pending` 으로 바꾸는 그 저장에서 `progress` 를
`{ at: now, phase, done: 0, total }` 로 초기화한다. 이것이 없으면 첫 컷이 끝나기 전에
함수가 얼었을 때 `progress` 자체가 없어 판정할 근거가 없다.

**멈춤 판정은 서버가 잰다.** 상태 응답에 `stalled_for_ms = now - progress.at` 를 실어
보낸다. 화면이 `Date.now()` 로 직접 빼면 브라우저와 서버의 시계 차이가 그대로 오판이 된다
(사장님 PC 시계가 3분 빠르면 시작하자마자 "멈췄어요"가 뜬다).

`progress` 를 통째로 내보내지 않고 **서버가 뺀 숫자 하나만** 내보낸다. 상태 라우트
**다섯 곳 모두**(`/status`·`/cuts/status`·`/voice/status`·`/clips/status`·`/render/status`)
가 `stalled_for_ms` 와 `progress.done`·`progress.total` 을 싣는다 — 다섯이 서로 다른
것을 싣는 것이 이번 버그의 뿌리라, 새로 넣는 값은 처음부터 다섯에 다 넣는다.
스토어의 부분 읽기 함수들이 `doc->progress` 를 함께 뽑고, 라우트가 그 자리에서 뺀다.
`progress` 가 없는 옛 문서는 `stalled_for_ms: null` — 판정 불가이지 "멈춤"이 아니다.

임계는 **120초**. 클립 하나가 30초쯤 걸리므로 2분이면 정상 진행으로 설명되지 않는다.
값은 상수 한 곳(`lib/progress.js`)에 둔다.

### ③ 사유를 사장님 말로 옮긴다

`lib/failure.js` — import 0 개의 순수 모듈(가격표·단계표와 같은 부류라 화면에서도 안전).

```
classifyFailure(rawMessage) → { code, message, retryable }
```

| code | 언제 | 사장님에게 보이는 말 | 재시도 |
|---|---|---|---|
| `no_credits` | 크레딧 부족(402·NoCredits) | 크레딧이 모자라요 — 충전 후 다시 시도해 주세요 | ✗ |
| `rejected` | 모델이 거부(안전 필터) | 이 장면은 모델이 만들지 못했어요 — 문장을 조금 바꿔 다시 시도해 주세요 | ✓ |
| `timeout` | 시간 초과 | 만드는 데 너무 오래 걸렸어요 | ✓ |
| `network` | 연결 실패 | 잠시 연결이 끊겼어요 | ✓ |
| `provider` | fal·LLM 5xx | 만드는 쪽 서비스에 문제가 있어요 | ✓ |
| `unknown` | 그 밖 | **원문 그대로** | ✓ |

**`unknown` 이 원문을 그대로 내보내는 것이 이 표의 핵심이다.** 분류에 실패했다고
"알 수 없는 오류"로 뭉개면, 지금보다 정보가 **줄어든다** — 삼키지 않는다.

분류는 문자열 판정이라 vitest 로 표째 물 수 있다.

### ④ 화면이 네 상태를 구분해 말한다

지금은 사실상 "만드는 중…" 하나다. 넷으로 나눈다.

| 상태 | 판정 | 표시 |
|---|---|---|
| 진행 중 | 미완 컷 있음 · `stalled_for_ms < 120초` | 스피너 + `컷 3/8 만드는 중 · 1분 20초 경과` |
| 멈춤 의심 | 미완 컷 있음 · `stalled_for_ms ≥ 120초` · 오류 없음 | ⚠ `진행이 2분째 멈춰 있어요` + [다시 시도] |
| 실패 | 단계 오류 필드에 값 있음 | ⚠ 분류된 사유 + `retryable` 이면 [다시 시도] |
| 완료 | 미완 컷 없음 | 지금대로 |

판정은 화면이 아니라 `lib/progress.js` 의 순수 함수 하나가 낸다:

```
generationState({ cuts, errors, stalled_for_ms, busy }) → { kind, done, total, reason }
```

이 저장소에는 컴포넌트 렌더 테스트 인프라가 없다(`lib/projects-client.js:2` 주석).
그래서 **판정을 순수 모듈로 빼는 것이 기존 규약**이고, 네 상태의 경계는 전부 vitest 로
직접 잰다. 화면은 `kind` 를 받아 그리기만 한다.

[다시 시도] 는 새 경로를 만들지 않는다 — 이미 있는 컷별 재생성(`/cuts/[idx]/regen`,
`/clips/[idx]/regen`)으로 잇는다.

### ⑤ 폴링을 한 곳으로

`images`·`video`·`voice`·`script`·`done` 다섯 페이지가 interval·타임아웃·연속실패
카운트를 각자 복붙해 두었고, 조금씩 다르게 틀려 있다(1-1 의 버그가 그 결과다).

`lib/poll.js` 로 뺀다. fetch 와 timer 를 **주입받아** 순수하게 돌린다 — 그래야 2초를
실제로 기다리지 않고 vitest 가 회차를 밀어 볼 수 있다.

```
startPolling({ url, fetchImpl, setTimer, clearTimer, intervalMs, timeoutMs,
               maxFailures, onTick, onStop })
```

지금 다섯 곳의 동작(2초 간격 · 5분 상한 · 연속 5회 실패면 중단 · 언마운트 시 ref 까지
비우기)을 그대로 옮긴다. **동작을 바꾸는 것이 아니라 한 벌로 만드는 것**이다 — 바뀌는
것은 ①~④ 뿐이고, 여기서 동작까지 함께 바꾸면 회귀가 어디서 났는지 못 가른다.

## 3. 데이터 흐름

```
[이미지 만들기] 누름
  → POST /images : 청구 → cuts=pending + progress={at:now,phase,done:0,total} 저장
                 → runImagesPipeline 을 await 없이 던짐 → { started:true }
  → 화면: lib/poll.js 가 2초마다 GET /cuts/status

GET /cuts/status 응답
  { status, cuts, cuts_error, voice_error, video_error, images_error, stalled_for_ms }
                                            ^^^^^^^^^^^^  ^^^^^^^^^^^^^^^ 새로 추가

  → lib/progress.js generationState(...) → { kind, done, total, reason }
  → 화면이 kind 로 갈라 그림

파이프라인이 컷 하나를 끝낼 때마다
  → setCut 이 컷과 progress 를 **한 번의 저장으로** 함께 갱신 (at 이 갱신됨)

파이프라인이 얼어 죽으면
  → progress.at 이 멈춤 → stalled_for_ms 가 자람 → 120초에서 "멈춤 의심"
```

## 4. 오류 처리

- **파이프라인 실패**: 지금처럼 `*_error` 에 기록. 달라지는 것은 그것이 화면까지
  도착한다는 것과, `classifyFailure` 를 거쳐 사람의 말이 된다는 것.
- **폴링 자체의 실패**: 지금 규칙 유지(연속 5회 실패면 중단). 다만 중단 문구가
  "확인이 오래 걸려요"가 아니라 "상태를 확인하지 못했어요 — 새로고침해 주세요"로
  바뀐다. 둘은 다른 사건이고, 지금은 같은 문구를 쓴다.
- **멈춤 의심은 오류가 아니다.** 실제로 느린 것일 수 있으므로 폴링을 멈추지 않는다 —
  경고만 띄우고 계속 두드린다. 뒤늦게 끝나면 경고가 사라진다.
- **분류 실패**: 원문 노출(위 ③).

## 5. 테스트

컴포넌트 렌더 테스트 인프라가 없으므로 전부 순수 모듈 단위로 잰다.

| 모듈 | 재는 것 |
|---|---|
| `lib/failure.js` | 표의 여섯 갈래 각각 + `unknown` 이 원문을 보존하는가 |
| `lib/progress.js` | 네 상태의 경계(119초/120초), `progress` 가 아예 없는 옛 문서, 컷 0개 |
| `lib/poll.js` | 주입 timer 로 회차 진행·5분 상한·연속 5회 실패 중단·정리 |
| `lib/steps.js` | `STEP_ERROR_FIELDS` 가 다섯 단계를 모두 덮는가 |
| 스토어 | `selectProjectCuts` 가 `images_error` 를 돌려주는가 (**1-1 회귀 방어**) |
| 라우트 | `/cuts/status` 응답에 `images_error`·`stalled_for_ms` 가 있는가 |

기존 2,272 그린이 유지되어야 한다.

## 6. 하지 않는 것

- **작업 큐·워커 도입.** 조용한 죽음의 근본 해법이지만 배포 구조를 바꾸는 별개
  프로젝트다. 여기서는 *감지하고 · 알리고 · 다시 시도할 수 있게* 까지만 한다.
- **새 의존성.** 없다.
- **폴링 주기·상한 조정.** ⑤에서 동작을 그대로 옮기기만 한다.
- **`*_error` 를 지우는 서버 경로.** 지금 없고, 이번에도 만들지 않는다 — 화면의 접기와
  컷별 재생성으로 빠져나가는 기존 길을 그대로 쓴다.

## 7. 다음 스펙 — 캐시 (여기서는 구현하지 않음)

이동할 때마다 같은 문서(실측 13KB)를 통째로 다시 받는 문제. 열쇠는 이미 DB 에 있다 —
`projects.version`(낙관적 락용).

- **서버**: `GET /api/projects/[id]` 에 `ETag: "v{version}.c{charged}"`. `If-None-Match`
  가 같으면 304·본문 없음. 먼저 `version` 만 뽑는 초경량 쿼리를 던지고, 달라졌을 때만
  13KB 를 읽는다.
- **클라이언트**: 모듈 스코프 캐시 + stale-while-revalidate. 이동하면 캐시본을 즉시 그리고
  ("불러오는 중…" 이 안 뜬다) 뒤에서 ETag 만 확인한다.
- **갱신 시점** — DB 는 먼저 알려주지 않으므로 세 갈래로 덮는다: ⑴ 내가 쓰면 그 자리에서
  무효화, ⑵ 뒷단 파이프라인이 쓰면 이 스펙의 폴링이 캐시에 반영, ⑶ 다른 탭·기기는 화면이
  다시 보일 때(`visibilitychange`) 값싼 재검증 한 번.
- **Supabase Realtime 은 쓰지 않는다** — 진짜 push 지만 RLS·인증 설정이 새로 붙고, 지금
  아픈 것은 ETag 로 사라진다.
- **새로고침을 넘겨 살리지 않는다**(메모리만).
