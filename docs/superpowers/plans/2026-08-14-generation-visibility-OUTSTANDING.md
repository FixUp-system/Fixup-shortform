# 생성 상태 가시화 — 병합 후 남은 일

2026-08-14. 이 브랜치(`wt/session-isolated`, 32커밋)는 **최종 리뷰의 Critical 을 알고도 그대로 병합**했다
(사용자 결정, 세션 시간 소진). 아래가 그 대가와 갚을 순서다.

## 1. ★ 돈 이중 청구 — 최우선

**`app/create/[id]/video/page.js`** 의 CTA `disabled` 식.

```js
// 지금 (구멍 있음)
disabled={gen.kind === "running" || (gen.kind === "stalled" && !pollTimedOut)}
```

`isCutDone(c,"video")` 는 `video || video_error` 를 끝난 것으로 센다. 그런데 `POST /clips` 도
`runVideoPipeline` 도 **실행 시작 시 `video_error` 를 지우지 않는다**(`lib/pipeline.js` 는 성공했을 때만
`video_error: null` 을 쓴다). 그래서 모든 컷이 클립이나 오류를 하나씩 갖고 있으면 재시도가 **도는 내내**
`done >= total` → `kind === "done"` → 버튼이 열려 있다. 스피너도 안 뜨고 멈춤 감지도 무장 해제된다.

도달 가능한 두 경우:
- **전 컷 실패 뒤 재시도** — 두 번째 누름이 같은 컷들에 `runVideoPipeline` 을 하나 더 띄운다.
  정가는 멱등이라 크레딧은 안 새지만 **fal 비용이 이중**(컷당 $0.42~1.51).
- **낡은 클립 재생성** — 두 번째 누름이 `chargeRegen` 을 **다음 단가 등급으로 다시** 걷고
  컷당 3회 쿼터도 하나 더 태운다. **실제 크레딧이 두 번 나간다.**

기준선 `cfe1251` 에는 없던 회귀다(그때는 `disabled={busy}` 가 눌린 순간부터 폴링 끝까지 잠갔다).

**수정(리뷰어 제안, ~3줄):**

```js
const inFlight = busy && !pollTimedOut;
disabled={inFlight || gen.kind === "running" || (gen.kind === "stalled" && !pollTimedOut)}
```

`busy` 는 모든 `onStop` 경로에서 풀리므로 5분 타임아웃 탈출구는 그대로 산다.
함께 고쳐야 할 테스트 둘: `tests/video-status-ui.test.js:136` 의 `not.toMatch(/\bbusy\b/)` 와
`:160` 의 `new Function` 인자 수. 그 단언의 **뜻**("멈춤 동안 사장님을 가두지 마라")은 유지되고
수단만 바뀐다.

## 2. ③목소리 멈춤 배너가 잠긴 버튼을 가리킨다

`app/create/[id]/voice/page.js:277` 이 "아래에서 컷별로 다시 읽혀 보세요"라고 하는데,
그 컨트롤들은 `:342`·`:354` 에서 `disabled={busy || …}` 다. 멈춤은 폴링을 멈추지 않으므로
배너가 떠 있는 **내내** `busy` 가 참이고 버튼은 회색이다.

④이미지·⑤영상에서 이미 두 번 고친 바로 그 결함인데, 병행으로 돈 세 번째 에이전트가 못 받았다.
**수정:** 두 자리 다 `disabled={gen.kind === "running" || …}` 로. ⑤영상과 같은 모양.

## 3. 멈춤에 대한 화면 셋의 입장이 서로 다르다 — 결정하고 적을 것

| 화면 | 멈춤일 때 |
|---|---|
| ④이미지 | 유료 컷별 재생성 `[그냥 다시]` 를 **권한다**, 그리고 일부러 연다 |
| ⑤영상 | 유료 경로를 **잠그고** "아직 만들고 있을 수도 있어요 … 새로고침"이라 한다 |
| ③목소리 | 유료 경로를 가리키는데 **우연히** 잠겨 있다(위 2번) |

⑤영상의 논리가 옳고 그 근거가 코드에 적혀 있다(`video/page.js:191-198`) — 살아 있는 파이프라인이
나중에 그 컷을 덮어쓰면 유료 재생성 값이 통째로 날아간다. **④이미지에 그대로 적용하든지, 왜 다른지
적든지 하나를 골라야 한다.** 지금 차이는 결정이 아니라 병행 작업의 산물이다.

## 4. 이미지 실패의 **주된 경로**가 아직 사유를 못 보여준다 — 다음 스펙감

fal 429 를 끝까지 따라가면: `deps.genImage` 가 던짐 → `processCut` catch(`lib/pipeline.js:343-350`)가
`state: "needs_attention"` 을 쓰고 메시지를 **`cut.vlm.note`** 에 넣음 → `runImagesPipeline` 은
**정상 종료**하고 `status: "images"` 를 씀. 최상위 `images_error` 는 **안 쓰인다** → `firstError` 가 null →
`isCutDone` 이 그 컷을 끝난 것으로 셈 → `kind === "done"`. 사장님은 "품질 확인 필요" 자리표시자만 보고
**사유는 어디에도 없다.**

`images_error` 는 `runImagesPipeline` 자체가 거부될 때만(=`setCut` 이 CAS 5회를 다 지거나 `getProject`
실패) 쓰인다. 즉 스펙 §1-1 의 "이미지 실패는 `images_error` 에 기록된다"는 **절반만 참**이고,
§2③ 은 컷 단위 채널을 아예 언급하지 않는다. 헤드라인 약속("실패했는지, 그리고 왜")이 가장 흔한
이미지 실패에서 안 지켜진다.

**싼 판:** `needs_attention` 카드에 `classifyFailure(cut.vlm?.note).message` 를 그린다.
**제대로:** 컷 단위 실패 채널을 스펙에 넣고 `*_error` 와 나란히 다룬다.

## 5. 작은 것들

- `app/create/[id]/video/page.js:66` 만 옛 타임아웃 문구를 쓴다("상태 확인이 오래 걸리고 있어요").
  나머지 셋은 스펙 §4 의 "상태를 확인하지 못했어요"를 쓴다. **다만** 5분/10분 천장에 닿은 경우엔
  ⑤영상 문구가 더 정확하다 — 네 화면을 **한 번에** 맞출 것(읽기 실패와 천장 도달을 가르는 게 선결).
- `lib/pipeline.js:222` 의 `setCut` 이 `phase: "images"` 를 하드코딩해, video/render 단계 프로젝트에서
  `regenCut` 이 낡은 단계를 다시 찍는다. `generationState` 의 `mine` 규칙이 흡수하고 있으나
  그 의존이 스탬프 자리에서 안 보인다 — 주석 한 줄.
- `classifyFailure` 의 `\((\d{3})\)` 는 괄호 안 아무 세 자리나 문다. 잘못 물면 원문을 **엉뚱한 정형
  문구로 갈아치운다** — `unknown` 이 막으려던 바로 그 결과다. `실패 \((\d{3})\)` 로 조이면 공짜.
- `firstError` 가 프로토타입 체인에 닿는다(`firstError({}, "constructor")` 는 throw). 지금 모든
  `stepKey` 가 리터럴이라 미도달. `Object.hasOwn` 한 줄.

## 6. ★ 라이브에서 가장 먼저 볼 것

`progress:doc->progress` 가 실제 PostgREST 에서 **문자열이 아니라 객체**로 오는가.
형태는 이미 live 인 `render:doc->render` 와 문자 그대로 같지만, 테스트로는 구조적으로 못 덮는다.

**판별법:** 배포 뒤 이미지 생성을 한 번 돌려서 화면에 `컷 N/M 만드는 중` 이 뜨는지만 보면 된다.
안 뜨면 이 값이 문자열로 오고 있는 것이고, 멈춤 판정 전체가 죽는다.
