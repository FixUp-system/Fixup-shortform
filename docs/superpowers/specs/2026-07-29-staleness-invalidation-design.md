# 낡은 것을 낡았다고 말한다 — 무효화 판정

**한 줄:** 컷을 고친 뒤에도 옛 소리·옛 그림으로 만든 클립과 완성본이 그대로 남아 있고,
화면은 그것을 멀쩡한 것처럼 보여준다. **조용히 틀린 영상이 사장님 손에 간다.**

워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`.

## 지금 무엇이 틀리나

전부 실제 코드에서 확인한 것이다.

| 사장님이 한 일 | 낡는 것 | 지금 |
|---|---|---|
| 컷 문장·화면·움직임 손편집 (`PATCH /api/projects/:id`, `body.cut`) | 그 컷의 소리·그림·클립 | 아무 표시 없음 |
| 그림만 다시 만듦 (`regenCut`) | 그 그림으로 만든 클립 | 아무 표시 없음 |
| 소리만 다시 만듦 (`regenVoice`) | 길이가 바뀌므로 클립·자막 타이밍 | `cut.seconds`만 덮음 |
| 무엇이든 고침 | 완성본 `project.render` | 옛 mp4 가 남아 내려받힘 |
| 원고를 다시 써서 컷 재분할 (`POST /cuts`) | 컷은 지워지는데 `render`는 안 지워짐 | ⑥에 옛 완성본이 남음 |

저장소에 판정의 원형이 하나 있다 — `areCutsStale()`(`lib/steps.js:57`). 원고를 다시 쓰면
`script.version`이 오르고, 컷에 각인된 `cuts_script_version`과 달라지면 컷이 낡았다고 본다.
**그 판정이 컷에서 멈춰 있다.** 소리·그림·클립·완성본에는 대응물이 없다.

## 결정 넷 (사장님 확인)

1. **표시하고 막는다.** 파일은 지우지 않는다(클립 10초 = $0.40). 대신 낡은 것이 남아 있는
   동안 다음 단계로 못 가고, 완성본은 내려받기가 잠긴다.
2. **다음 단계 버튼을 막는다.** 낡은 컷이 하나라도 있으면 잠근다. 낡은 그림으로 클립을 사는
   것(=돈 버림)까지 막힌다.
3. **산출물별로 따로 판정한다.** 문장만 고치면 소리만 낡고 그림은 살아남는다.
4. **각인 방식**(버전 번호가 아니라 "무엇에서 나왔는지"). 이유는 아래.

## 왜 버전 번호가 아니라 각인인가

버전 번호(`cuts_script_version` 방식)는 **번호를 올려주는 자리를 사람이 기억해야 한다.**
지금 컷을 건드리는 곳이 넷이다 — `PATCH`·`regenCut`·`runSplitPipeline`·초점 변경. 한 군데라도
빠뜨리면 **낡았는데 안 낡았다고 나온다. 지금 고치려는 결함과 똑같은 실패 모드다.**

실제로 저장소가 이미 밟았다: `cuts_script_version`은 컷은 챙겼지만 `render`를 빠뜨렸고,
그래서 재분할 뒤 옛 완성본이 남는다.

각인은 판정이 **지금 값에서 파생**된다. 어디서 어떻게 고쳐도 — 손편집이든 재분할이든 아직
없는 미래의 경로든 — 값이 달라지면 자동으로 안 맞는다. **빠뜨릴 자리가 없다.**

## 데이터 모델

산출물마다 `of` 한 줄이 붙는다. "이건 무엇에서 나온 것이다".

```js
cut.audio  = { url, seconds, of: cut.sentence }               // ③ 읽은 문장
cut.image  = { url, of: cut.shows }                            // ④ 그릴 때 본 화면 설명
cut.video  = { url, seconds, truncated, of: clipKey(cut) }     // ⑤
project.render = { url, seconds, ts, of: renderKey(project) }  // ⑥
```

```js
clipKey(cut)    = `${cut.image?.url}|${cut.seconds}|${cut.motion || ""}`
renderKey(proj) = 컷마다 `${audio?.url}|${video?.url}|${sentence}` 를 이은 것
```

`clipKey`에 `image.url`이 들어가는 것이 핵심이다 — 그림을 다시 만들면 주소가 바뀌므로 클립이
자동으로 안 맞는다. 같은 이유로 `renderKey`에 소리·클립 주소가 들어간다. `sentence`도 넣는
것은 **자막이 문장에서 나오기 때문**이다(`lib/subtitles.js`).

## 판정 — `lib/steps.js` 순수 함수 넷

`areCutsStale()` 바로 아래. 같은 파일, 같은 결. 화면이 import 하므로 서버 전용 의존을 끌고
오면 안 된다(`lib/voices.js`·`lib/refs.js`와 같은 제약).

```js
isAudioStale(cut)       // cut.audio 가 있고 of ≠ 지금 sentence
isImageStale(cut)       // cut.image 가 있고 of ≠ 지금 shows
isClipStale(cut)        // cut.video 가 있고 of ≠ clipKey(cut)
isRenderStale(project)  // project.render 가 있고 of ≠ renderKey(project)
```

**연쇄를 만들지 않는다.** "그림이 낡았으니 클립도 낡았다"를 코드로 잇지 않는다 — 그림이
낡으면 ④에서 이미 막히므로 ⑤로 갈 수 없고, 그림을 실제로 다시 만들면 주소가 바뀌어 클립은
그때 자동으로 낡는다. 연쇄 규칙은 없어도 되는데, 두면 규칙끼리 어긋날 자리가 생긴다.

### 이 설계가 이미 답하는 것

| 상황 | 결과 |
|---|---|
| 문장 오타 하나 | 소리만 낡음. 그림 두 장($0.08)은 살아남음 |
| 그림만 다시 만듦 | 클립만 낡음. 소리는 살아남음 |
| 소리만 다시 만듦 | 길이가 바뀌어 `clipKey`가 안 맞음 → 클립이 낡음 |
| 원고 다시 씀 → 재분할 | `renderKey`가 완전히 달라짐 → 완성본이 낡음. **`POST /cuts`에 코드를 더할 필요가 없다** |

## 화면 — 각 단계는 자기 산출물만 본다

| 화면 | 막는 조건 | 사장님이 보는 것 |
|---|---|---|
| ③ 목소리 | 낡은 소리 하나 이상 | 그 컷에 배지 + `④ 이미지 만들러 가기` 잠김 |
| ④ 이미지 | 낡은 그림 | 그 컷에 배지 + `⑤ 영상 만들러 가기` 잠김 |
| ⑤ 영상 | 낡은 클립 | 그 컷에 배지 + `⑥ 완성하러 가기` 잠김 |
| ⑥ 완성 | 완성본이 낡음 | **내려받기 잠김**, 주 버튼이 `다시 합치기`로 |

잠그는 방식은 기존 그대로다 — `disabled={busy || doneCount === 0}`(`voice/page.js:235`) 옆에
조건 하나가 붙는다.

배지 문구는 **무엇을 하면 풀리는지**까지 말한다. "낡음"·"stale" 같은 말은 쓰지 않는다:

> 문장을 고친 뒤라 소리가 옛 문장이에요 — 이 컷만 다시 읽히면 됩니다

⑥만 다르다. 합성은 **0원**이고 재실행이 이미 정상 흐름이라(`render/route.js`가 멱등 가드를
일부러 두지 않는다), 막을 게 아니라 바로 고치게 하는 것이 맞다.

## 옛 프로젝트 — 각인이 없으면 낡지 않은 것으로 본다

`of`가 `undefined`인 산출물은 판정하지 않는다.

근거는 `areCutsStale`에 이미 적힌 원칙이다 — **거짓 경고는 유료 호출 버튼을 띄운다.** 여기서는
더하다: 07-29 이전 프로젝트를 전부 "다시 만들어라"로 만들면 진짜 소리·클립이 통째로 잠긴다.
`data/projects`에 있는 것은 개발 중 산출물이라 새로 만들면 된다.

`areCutsStale`은 반대로 골랐다(각인이 없으면 낡음). 그쪽은 컷 재분할이 **OpenAI만 써서
공짜**이기 때문이고, 여기는 유료라 판단이 갈린다. **이 차이를 코드 주석에 남긴다** — 다음에
읽는 사람이 둘 중 하나를 실수로 맞추지 않게.

## 오류 처리

새로 생기는 실패 경로가 **없다.** 각인은 산출물을 저장할 때 같은 객체에 함께 들어가므로 따로
실패할 수 없다. 만들기가 실패하면 `audio` 자체가 없고(`voice_error`만 남음), 없는 것은 판정
대상이 아니다.

## 건드리는 곳

**수정**
- `lib/steps.js` — 판정 함수 넷 + `clipKey`·`renderKey`
- `lib/pipeline.js` — 각인 여섯 자리: `processCut`(그림) · `runVoicePipeline`·`regenVoice`(소리) ·
  `runClipPipeline`·`regenClip`(클립) · `runRenderPipeline`(완성본)
- `app/create/[id]/voice/page.js` · `images/page.js` · `video/page.js` · `done/page.js` — 배지와 잠금
- `tests/steps.test.js` · `tests/pipeline.test.js` · `tests/routes.test.js`

**건드리지 않음**
- `app/api/projects/[id]/cuts/route.js` — 재분할 시 `render`를 지울 필요가 없다(`renderKey`가 잡는다)
- `app/api/projects/[id]/render/route.js` — 멱등 가드 없음이 옳다
- `lib/compose.js` · `lib/subtitles.js` · `lib/tts.js` · `lib/i2v.js`

## 테스트

1. **순수 함수**(`tests/steps.test.js`) — 넷 각각에 ①각인이 같으면 안 낡음 ②다르면 낡음
   ③각인이 없으면 안 낡음 ④산출물이 없으면 안 낡음
2. **각인이 실제로 박히는가**(`tests/pipeline.test.js`) — 소리·그림·클립·완성본 네 자리
3. **관통**(`tests/routes.test.js`) — 문장을 고치면 **소리만** 낡고 그림은 안 낡는다 /
   소리를 다시 만들면 클립이 낡는다 / 컷을 재분할하면 완성본이 낡는다
4. 회귀 하한선 **426 그린**

## 하지 않는 것 (YAGNI)

- 낡은 것을 **자동으로 다시 만들지 않는다** — 사장님 승인 없이 돈이 나가면 안 된다
- 낡은 파일을 **지우지 않는다** — 되돌릴 길이 없어진다
- 무효화 **이력을 남기지 않는다** — 지금 필요한 것은 "지금 낡았는가" 하나다
- `renderKey`를 해시하지 않는다 — `crypto`는 서버 전용이라 화면이 import 할 수 없다.
  문자열 그대로 둔다(컷 6개 기준 수백 바이트)
