# LLM 을 Claude 로 옮긴다 — OpenAI gpt-4o → Claude Opus 5

> 2026-08-12 · 대상: `lib/llm.js` 의 `callJson` 과 `app/api/chat/route.js`.
> 이미지 검수(`lib/vlm.js`)는 **이번 범위가 아니다** — gpt-4o vision 그대로 둔다.

## 무엇을 바꾸나

글을 쓰는 모델을 OpenAI gpt-4o 에서 **Claude Opus 5** 로 바꾼다.

사장님 입장에서는 **아무것도 안 바뀐다.** 대본이 나오고, 컷이 나뉘고, 화면이 설계되는
흐름은 그대로다. 바뀌는 것은 그 글을 누가 쓰느냐다.

## 왜 `callJson` 하나면 되나

`lib/llm.js` 의 `callJson` 이 LLM 호출 **다섯 자리**를 전부 받는다:

| 자리 | 부르는 곳 |
|---|---|
| 대본 생성 | `lib/script-gen.js:18` |
| 컷 분할 | `lib/pipeline.js:38` |
| 화면 설계 | `lib/pipeline.js:94` |
| 캐스팅 | `lib/pipeline.js:130` |
| 브리핑 | `lib/briefing-extract.js:9` · `app/api/projects/[id]/briefing/route.js` |

그래서 이 함수 하나를 바꾸면 다섯 자리가 함께 옮겨간다. **호출처는 한 줄도 안 고친다.**

여섯 번째 자리가 `app/api/chat/route.js` 다. `callJson` 을 안 거치고 OpenAI 를 직접 부르는데,
**스트리밍이 아니라 `callJson` 과 똑같은 모양을 복제한 것**이다(같은 재시도, 같은 원장 기록
규칙, 같은 JSON 파싱). 사용자 결정으로 이번에 함께 옮긴다.

## 구조

### 1. SDK 를 쓴다 — `fetchImpl` 주입은 살아 있다

`@anthropic-ai/sdk` 를 쓴다(설치 완료). 이 저장소는 테스트에서 `fetchImpl` 을 주입해
실제 요청을 잡는데, SDK 클라이언트가 `fetch` 옵션을 받는다(`node_modules/@anthropic-ai/sdk/client.d.ts:103`
— `fetch?: Fetch`). 그래서 **주입 구조를 그대로 유지한다**:

```js
const client = new Anthropic({ apiKey, fetch: fetchImpl });
```

★ 테스트가 다시 쓰이는 것은 **요청/응답의 모양**뿐이다. 주입 방식은 안 바뀐다.

### 2. 키 — 이미 넣어 둔 이름을 먼저 본다

`process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY`.

`.env.local` 에 이미 `CLAUDE_API_KEY` 가 있고, SDK·공식 문서는 `ANTHROPIC_API_KEY` 를 쓴다.
둘 다 받되 **오류 문구는 `CLAUDE_API_KEY` 를 말한다** — 이 저장소에 실제로 있는 이름이다.

`.env.local.example` 에도 더한다.

### 3. 모델과 요청

- 모델: **`claude-opus-5`**
- **`temperature` 를 보내지 않는다** — Claude Opus 5 는 400 이다(아래 ★)
- **`max_tokens: 16000`** — 지금 OpenAI 호출에는 이 값이 아예 없다(모델 기본값에 맡겼다).
  Claude 는 필수다. ★ Opus 5 는 **사고가 기본으로 켜져 있고 `max_tokens` 가 사고+본문의
  합계 상한**이라, 낮게 잡으면 대본이 중간에 잘린다. 스트리밍 없이 안전한 값이 16000 이다
- 시스템 프롬프트는 `system` 파라미터로, 나머지는 `messages` 로. 지금 OpenAI 호출은
  system 을 `messages[0]` 에 넣는데 Claude 는 별도 필드다
- **JSON 은 지금처럼 본문을 파싱한다.** `output_config.format` 은 호출마다 스키마가 필요한데
  `callJson` 은 다섯 자리가 서로 다른 모양을 받는 범용 함수라 스키마가 하나로 안 잡힌다.
  기존 "파싱 실패 시 1회 재시도" 를 그대로 유지한다

### 4. 원장과 가격

- 엔드포인트 문자열: **`anthropic/claude-opus-5`** — `openai/gpt-4o` 와 같은 모양이라
  원가 화면·집계·라벨이 그대로 돈다
- `lib/costs.js` 의 LLM 가격표에 더한다: **입력 $5/1M · 출력 $25/1M**
- 토큰 수는 응답의 `usage.input_tokens`·`usage.output_tokens` 에서 읽는다
  (OpenAI 의 `prompt_tokens`·`completion_tokens` 와 이름이 다르다).
  `duration` 필드에 적는 `N+Mtok` 표기는 그대로 유지한다
- ★ **가짜 모드 판정은 손대지 않는다.** `anthropic/…` 은 `fal-ai/`·`bytedance/` 가 아니라
  `fakeLlm()` 축으로 떨어지고, 그것이 맞다(LLM 이다). `assertBudget` 의 `amount: 0` 규칙도
  그대로 — LLM 은 부른 뒤에야 토큰을 안다

### 5. `app/api/chat/route.js`

같은 모양의 복제이므로 같은 방식으로 옮긴다. 기존 계약을 지킨다:
재시도 2회, 파싱 **앞에서** 원장 기록, 실패 시 502 + "대화 모델 호출에 실패했어요".

⚠️ 이 자리는 `fakeLlm()` 을 안 본다(알려진 함정 — raw fetch 라 가짜 모드가 안 먹는다).
**이번에 고치지 않는다** — 옮기는 것과 가짜 모드를 붙이는 것은 다른 일이고, 섞으면
"바꿨더니 뭐가 달라졌는지" 를 못 가른다. 옮긴 뒤 별도로 판단한다.

## ★ 실측 없이는 끝난 것이 아니다

이 저장소의 원칙이 **"측정 없이 품질을 주장하지 않는다"** 이고, `.claude/skills/` 에
`measuring-llm-prompt-changes` 스킬이 있다. 공급자를 통째로 바꾸는 것은 프롬프트 수정보다
큰 변경이다.

**반드시 재야 할 것 둘:**

1. **되돌리기 다양성** — `temperature: 0.4` 가 사라진다. 지금 대본 생성은
   초안 → 되돌리기(최대 3회) → 교정 구조이고, 되돌리기가 매번 비슷한 답을 내면 그 루프가
   무의미해진다. `scripts/measure/run-pipeline.mjs tailor 3 30` 으로 같은 자료에서
   되돌리기 회차별 결과가 실제로 갈리는지 본다
2. **대본 품질** — 서버 로그의 `[대본 xxxxxxxx]` 가 라운드별 글자 수·결함·점수·채택 여부를
   남긴다. 전환 전후로 결함 수와 목표 길이 거리를 비교한다

**사용자 결정:** 다양성이 실제로 무너졌을 때만 프롬프트로 보완한다. 없는 문제를 미리
막느라 프롬프트를 흔들지 않는다.

## 지켜야 할 것

- ★ **`temperature` 를 보내면 400 이다.** `callJson` 의 인자에서 지운다 — 남겨 두면
  다음 사람이 넘겼다가 라이브에서 죽는다
- ★ **`fetchImpl` 주입을 깨지 않는다.** SDK 의 `fetch` 옵션으로 넘긴다
- 호출처 다섯 자리의 시그니처를 바꾸지 않는다
- `lib/vlm.js` 를 건드리지 않는다(이번 범위 밖)
- 가짜 모드 판정(`isFakeFor`)을 건드리지 않는다
- 원장 기록의 자리(파싱 **앞**)와 필드 모양을 유지한다
- **예상 못 한 실패는 고치지 말고 보고한다**

## 어떻게 확인하나

- **단위**: 키 없으면 던진다 · 가짜 모드면 API 없이 돈다 · 재시도가 2회다 ·
  파싱 실패 뒤에도 원장에 기록이 남는다 · `temperature` 가 요청 본문에 **없다**
- **배선**: 요청이 `https://api.anthropic.com/v1/messages` 로 가고 `model` 이
  `claude-opus-5` 이며 `system` 이 별도 필드다 — `fetchImpl` 로 실제 body 를 잡아 잰다
- **원장**: 엔드포인트가 `anthropic/claude-opus-5` 로 남고 원가가 0 이 아니다
- **예산**: `assertBudget` 이 전과 같이 걸린다(축은 LLM)
- **전체**: `npx vitest run` 전부 그린
- **라이브(유료)**: 대본 한 편을 실제로 만들어 ①잘리지 않는지 ②JSON 이 파싱되는지
  ③되돌리기 다양성 ④원장 원가. `SHOTFORM_FAKE=fal` 이면 OpenAI 대신 Claude 만 진짜로 나간다

## 이번에 안 하는 것

- `lib/vlm.js`(이미지 검수·사진 설명) — gpt-4o vision 그대로
- `chat` 라우트에 가짜 모드 붙이기 — 별도 판단
- 구조화 출력(`output_config.format`) 도입 — 범용 함수라 스키마가 안 잡힌다
- 프롬프트 재작성 — 실측 결과를 보고 정한다
