# 컷을 문장보다 잘게, 무음은 합성이 흡수, 화면은 글자를 안 그린다 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 컷에 너무 많이 담겨 이미지가 무너지던 것을 고친다 — 컷이 문장 안에서도 나뉘고, 남는 클립은 합성이 잘라내고, 화면은 글자를 그리도록 요구받지 않는다.

**Architecture:** 셋이 맞물린다. **합성**이 클립을 낭독 길이로 맞춰(짧으면 늘리고 길면 자른다) 컷 길이를 모델 눈금에서 풀어 준다. 그 위에서 **분할**이 8초를 넘는 문장 안에 쉼표·연결어미를 자를 후보로 더한다 — LLM은 여전히 번호만 고르므로 원고 보존 보장이 유지된다. **화면 설계**는 읽히는 글자를 요구하지 않는다.

**Tech Stack:** Next.js 15 App Router, OpenAI(gpt-4o), ffmpeg-static, vitest

설계 문서: `docs/superpowers/specs/2026-07-29-cut-granularity-design.md` (커밋 `2d71a29`)

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다.** 커밋 직전 `git rev-parse --abbrev-ref HEAD`로 브랜치도 확인한다
- 기존 테스트 **481개 그린이 하한선**
- **fal(유료 이미지·영상)을 부르지 않는다.** Task 5의 측정은 OpenAI만 쓰며 몇 센트다
- **"컷을 이어붙이면 원고와 글자 그대로 같다"** — 이 파이프라인의 유일한 구조적 보장이다. LLM은 경계 번호만 고르고 코드가 원고를 자른다. 이 보장을 깨는 변경은 어떤 이유로도 안 된다
- **상한이 둘이고 섞지 않는다.** **콘텐츠 상한 8초**는 이미지 한 장에 담기는 정보량으로 모델과 무관하다. **모델 상한**은 눈금의 최대값(지금 20초)이다
- **프롬프트에 모델 숫자를 하드코딩하지 않는다.** `lib/clip-limits.js`의 눈금에서 읽어 문장을 만든다
- Korean 문구는 사장님이 읽는 말로. 커밋 메시지는 한국어, 기존 이력의 어조
- **테스트를 통과시키려고 프로덕션 코드를 맞추지 않는다.** 반대도 마찬가지다. 테스트를 지우거나 skip 하지 않는다

## 알아 둘 것 — import 안전성

`lib/cuts.js`는 **서버 전용**이다(화면이 import 하지 않는다). 그리고 `lib/script.js`는 이미
`"use client"` 화면들이 import 하고 있어 클라이언트 안전하다. 따라서 `lib/cuts.js`가
`lib/script.js`·`lib/clip-limits.js`를 import 해도 번들 문제가 없다.

---

## File Structure

**수정**
- `lib/subtitles.js` — `cutSeconds`가 낭독을 쓴다 (Task 1)
- `lib/compose.js` — `buildFfmpegArgs`에 자르기 필터 (Task 1)
- `lib/cuts.js` — `splitUnits` 신설 (Task 2) · `SPLIT_SYSTEM` 재작성 (Task 3) · `SHOWS_SYSTEM` 글자 금지 (Task 4)
- `lib/pipeline.js` — `splitUnits` 사용, 8초 초과 재시도·로그 (Task 3)
- `tests/subtitles.test.js` · `tests/compose.test.js` · `tests/compose-live.test.js` · `tests/cuts.test.js` · `tests/pipeline.test.js`

**건드리지 않음**
- `lib/validate.js`의 `validateCutRanges` — 번호가 가리키는 단위만 넓어질 뿐 검사는 같다
- `lib/clip-limits.js` — 눈금이 사는 자리다. 읽기만 한다
- `lib/imagegen.js` · `lib/vlm.js` · `lib/cast.js`

---

## Task 1: 합성이 클립을 낭독 길이로 맞춘다

이것이 먼저다. 무음이 사라져야 컷 길이가 모델 눈금에서 풀리고, 그래야 Task 2·3이 의미를 갖는다.

**Files:**
- Modify: `lib/subtitles.js` (`cutSeconds`와 파일 상단 주석)
- Modify: `lib/compose.js` (`buildFfmpegArgs`)
- Test: `tests/subtitles.test.js`, `tests/compose.test.js`, `tests/compose-live.test.js`

**Interfaces:**
- Produces: `cutSeconds(cut)` — **낭독이 있으면 낭독 길이**, 없으면 클립 길이. `max`가 아니다
- Produces: `buildFfmpegArgs(...)` — 클립이 낭독보다 길면 `trim` 필터가 들어간다

- [ ] **Step 1: 실패하는 테스트를 쓴다 — `cutSeconds`**

`tests/subtitles.test.js` 의 `cutSeconds` 관련 describe 를 찾아 더한다(없으면 파일 끝에 새로 만든다):

```js
describe("cutSeconds — 한 컷이 완성본에서 차지하는 시간", () => {
  it("낭독이 있으면 낭독 길이다 — 클립이 길어도 잘라 쓴다", () => {
    // 눈금 올림 때문에 클립이 낭독보다 긴 것이 보통이다(낭독 3초 → 클립 6초).
    // 예전에는 긴 쪽을 써서 3초가 무음이 됐다.
    expect(cutSeconds({ seconds: 3, video: { seconds: 6 } })).toBe(3);
  });

  it("낭독이 클립보다 길면 낭독이다 — 상한을 넘어 잘린 클립은 늘려서 맞춘다", () => {
    expect(cutSeconds({ seconds: 25, video: { seconds: 20 } })).toBe(25);
  });

  it("낭독이 없으면 클립 길이로 떨어진다 — 목소리가 실패해도 합성은 돌아야 한다", () => {
    expect(cutSeconds({ video: { seconds: 6 } })).toBe(6);
    expect(cutSeconds({ seconds: 0, video: { seconds: 6 } })).toBe(6);
  });

  it("둘 다 없으면 0", () => {
    expect(cutSeconds({})).toBe(0);
    expect(cutSeconds(null)).toBe(0);
  });
});

describe("buildCues — 자막 자리가 낭독 합과 맞는다", () => {
  it("무음이 사라져 자막 누적이 낭독 합과 같다", () => {
    // 예전에는 뜨는 자리를 max(낭독,클립)로 누적해 자막이 갈수록 밀렸다.
    const cuts = [
      { seconds: 3, video: { seconds: 6 }, sentence: "첫 문장." },
      { seconds: 4, video: { seconds: 6 }, sentence: "둘째 문장." },
    ];
    const cues = buildCues(cuts);
    expect(cues[0]).toEqual({ start: 0, end: 3, text: "첫 문장." });
    expect(cues[1]).toEqual({ start: 3, end: 7, text: "둘째 문장." });
  });
});
```

`tests/subtitles.test.js` 첫 줄 import 에 `cutSeconds`·`buildCues` 가 없으면 더한다(기존 이름은 남긴다).

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: FAIL — `cutSeconds({seconds:3, video:{seconds:6}})` 가 6을 준다

- [ ] **Step 3: `cutSeconds` 를 고친다**

`lib/subtitles.js` 의 함수와 그 위 주석을 통째로 바꾼다:

```js
// 완성본에서 이 컷이 차지하는 시간 = **낭독 길이**.
//
// 예전에는 max(낭독, 클립)이었다. i2v 눈금(6·8·10…)이 올림이라 클립이 낭독보다 긴 것이
// 보통이고, 그 차이가 그대로 무음이 됐다(30초 요청에 완성본 32.8초, 정적 4.8초).
// 이제 합성이 남는 클립을 잘라내므로(lib/compose.js) 구간 길이는 낭독이다.
//
// 낭독이 없으면(목소리 실패) 클립 길이로 떨어진다 — 합성은 그래도 돌아야 한다.
export function cutSeconds(cut) {
  const spoken = Number(cut?.seconds) || 0;
  const clip = Number(cut?.video?.seconds) || 0;
  return spoken || clip;
}
```

파일 **맨 위 주석**의 이 문단도 더는 사실이 아니므로 바꾼다:

```js
// 자막 — 컷 경계가 곧 자막 경계다.
// cut.seconds 는 ③목소리에서 실측된 낭독 길이라, 자막이 화면에 머무는 시간이 그 값이다.
//
// 합성이 클립을 낭독 길이로 맞추므로(짧으면 tpad 로 늘리고 길면 trim 으로 자른다)
// 자막이 뜨는 자리도 낭독 길이로 누적하면 맞는다. 예전에는 둘이 갈라져 있어
// 자막이 갈수록 앞서고 마지막 몇 초는 말하는데 자막이 없었다.
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: PASS

- [ ] **Step 5: 실패하는 테스트를 쓴다 — 자르기 필터**

`tests/compose.test.js` 의 `buildFfmpegArgs` describe 에 더한다:

```js
  it("클립이 낭독보다 길면 잘라낸다 — 남는 시간이 무음이 되던 자리다", () => {
    const args = buildFfmpegArgs({
      local: [{ video: "v0.mp4", audio: "a0.m4a", wantSeconds: 3, haveSeconds: 6 }],
      assPath: "s.ass", out: "out.mp4", width: 1080, height: 1920,
    });
    const filter = args.join(" ");
    expect(filter).toContain("trim=duration=3.00");
    expect(filter, "자른 뒤에는 타임스탬프를 0부터 다시 매겨야 concat 이 어긋나지 않는다")
      .toContain("setpts=PTS-STARTPTS");
    expect(filter, "자를 때는 늘리지 않는다").not.toContain("tpad");
  });

  it("클립이 낭독보다 짧으면 지금처럼 마지막 프레임을 늘린다", () => {
    const args = buildFfmpegArgs({
      local: [{ video: "v0.mp4", audio: "a0.m4a", wantSeconds: 25, haveSeconds: 20 }],
      assPath: "s.ass", out: "out.mp4", width: 1080, height: 1920,
    });
    const filter = args.join(" ");
    expect(filter).toContain("tpad=stop_mode=clone:stop_duration=5.00");
    expect(filter).not.toContain("trim=");
  });

  it("낭독을 모르면 클립을 그대로 쓴다 — 목소리가 실패해도 합성은 돌아야 한다", () => {
    const args = buildFfmpegArgs({
      local: [{ video: "v0.mp4", audio: "a0.m4a", wantSeconds: 0, haveSeconds: 6 }],
      assPath: "s.ass", out: "out.mp4", width: 1080, height: 1920,
    });
    const filter = args.join(" ");
    expect(filter).not.toContain("trim=");
    expect(filter).not.toContain("tpad");
  });
```

- [ ] **Step 6: 실패를 확인한다**

Run: `npx vitest run tests/compose.test.js`
Expected: FAIL — `trim=duration=3.00` 이 없다

- [ ] **Step 7: `buildFfmpegArgs` 에 자르기를 더한다**

`lib/compose.js` 의 `local.forEach` 블록을 바꾼다:

```js
  local.forEach((l, i) => {
    const want = Number(l.wantSeconds) || 0;
    const have = Number(l.haveSeconds) || 0;
    // 클립을 낭독 길이에 맞춘다. 둘은 서로 배타적이다.
    //  - 클립이 짧으면 마지막 프레임을 늘린다(상한을 넘어 잘린 컷).
    //  - 클립이 길면 잘라낸다. 눈금 올림 때문에 이쪽이 훨씬 흔하고, 예전에는
    //    이 차이가 그대로 무음이었다(30초 요청에 정적 4.8초).
    // setpts 로 타임스탬프를 0부터 다시 매긴다 — 안 하면 concat 이 어긋난다.
    const pad = Math.max(0, want - have);
    const tpad = pad > 0 ? `tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)},` : "";
    const trim = want > 0 && have > want
      ? `trim=duration=${want.toFixed(2)},setpts=PTS-STARTPTS,`
      : "";
    filters.push(`[${i * 2}:v]${tpad}${trim}scale=${width}:${height},setsar=1[v${i}]`);
    filters.push(`[${i * 2 + 1}:a]anull[a${i}]`);
  });
```

- [ ] **Step 8: 통과를 확인한다**

Run: `npx vitest run tests/compose.test.js tests/subtitles.test.js`
Expected: PASS

- [ ] **Step 9: 실제 ffmpeg 로 확인한다 — 이것이 이 태스크의 핵심 검증이다**

이 저장소는 ffmpeg 결함을 유닛 테스트로 **두 번** 못 잡았다(콜론 이스케이프, 번들링).
필터 문자열이 맞다는 것과 ffmpeg 가 실제로 그 길이를 뱉는다는 것은 다르다.

`tests/compose-live.test.js` 의 `describe` 안에 더한다(기존 `run`·`W`·`H` 헬퍼를 그대로 쓴다):

```js
  it("클립이 낭독보다 길면 잘라내 낭독 길이로 맞춘다", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compose-trim-"));
    // 클립 6초 / 소리 3초 — 눈금 올림이 만드는 흔한 모양이다.
    await run(["-y", "-f", "lavfi", "-i", "color=c=0x2A3040:s=1080x1920:d=6,format=yuv420p", "-c:v", "libx264", path.join(dir, "v0.mp4")]);
    await run(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "3", "-c:a", "aac", path.join(dir, "a0.m4a")]);

    const cuts = [{ idx: 0, sentence: "30ml에 39,000원입니다.", seconds: 3 }];
    const assPath = path.join(dir, "sub.ass");
    await fs.writeFile(assPath, toAss(buildCues(cuts), { width: W, height: H }), "utf8");

    const local = [{ video: path.join(dir, "v0.mp4"), audio: path.join(dir, "a0.m4a"), wantSeconds: 3, haveSeconds: 6 }];
    const out = path.join(dir, "out.mp4");
    const { code, tail } = await run(buildFfmpegArgs({ local, assPath, out, width: W, height: H }));
    expect(code, `ffmpeg stderr:\n${tail}`).toBe(0);

    const probe = await new Promise((res) => {
      const p = spawn(ffmpegPath, ["-i", out]);
      let t = "";
      p.stderr.on("data", (d) => { t += d; });
      p.on("close", () => res(t));
    });
    const m = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const seconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
    console.log("자르기 결과 길이:", seconds, "초 (낭독 3초)");
    // 예전에는 6초가 나오고 뒤 3초가 무음이었다
    expect(seconds).toBeGreaterThan(2.7);
    expect(seconds).toBeLessThan(3.4);
  }, 120000);
```

- [ ] **Step 10: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

> ⚠️ dev 서버가 떠 있어도 vitest 는 안전하다(`.next` 를 건드리지 않는다). 다만
> `npm run build` 는 돌리지 마라 — dev 서버가 죽는다.

- [ ] **Step 11: 커밋**

```bash
git add lib/subtitles.js lib/compose.js tests/subtitles.test.js tests/compose.test.js tests/compose-live.test.js
git commit -m "fix: 합성이 남는 클립을 잘라낸다 — 컷 길이를 모델 눈금에서 푼다

i2v 눈금이 올림이라 클립이 낭독보다 긴 것이 보통인데, 합성은 늘리기만 하고 자르지 않았다.
그 차이가 그대로 무음이었다(30초 요청에 완성본 32.8초, 정적 4.8초).

이제 한 컷이 차지하는 시간은 낭독 길이다. max 가 아니다. 그래서 자막 자리도 낭독으로
누적하면 맞는다 — 예전에는 둘이 갈라져 자막이 갈수록 앞섰다.

이것이 컷을 짧게 만들 수 있는 전제다. 무음이 사라져야 컷 길이가 모델 눈금에서 풀린다."
```

---

## Task 2: 컷이 문장보다 잘아질 수 있게 — `splitUnits`

순수 함수만 만든다. 파이프라인은 아직 부르지 않으므로 **동작이 바뀌지 않는다.**

**Files:**
- Modify: `lib/cuts.js` (`splitUnits` 신설, `splitSentences` 는 남긴다)
- Test: `tests/cuts.test.js`

**Interfaces:**
- Produces: `splitUnits(text) -> string[]` — 컷 경계 후보. 8초 이하 문장은 통째, 넘는 문장은 절로 나뉜다
- `splitSentences(text)` 는 **그대로 남는다**(다른 곳에서 쓴다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 첫 줄 import 에 `splitUnits` 를 더하고(기존 이름은 남긴다), `splitSentences` describe 아래에 더한다:

```js
describe("splitUnits — 긴 문장은 절로 나눈다", () => {
  // 8초(= 공백 빼고 44자)를 넘는 문장만 나눈다. 짧은 문장은 통째로 둔다.
  const LONG = "이 앰플은 PDRN과 엑소좀, 시카가 함께 들어 있어 자기 전에 토너를 바른 후, 2~3방울을 얼굴에 펴 바르고 자면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";

  it("짧은 문장은 통째로 둔다", () => {
    const text = "30ml에 39,000원입니다. 재구매가 많습니다.";
    expect(splitUnits(text)).toEqual(["30ml에 39,000원입니다.", "재구매가 많습니다."]);
  });

  it("8초를 넘는 문장은 여러 조각이 된다", () => {
    const units = splitUnits(LONG);
    expect(units.length).toBeGreaterThan(1);
  });

  it("★ 이어붙이면 원문과 같다 — 이 파이프라인의 유일한 구조적 보장이다", () => {
    expect(splitUnits(LONG).join(" ")).toBe(LONG);
  });

  it("쉼표 뒤에서 나뉜다", () => {
    const units = splitUnits(LONG);
    expect(units.some((u) => u.endsWith(","))).toBe(true);
  });

  it("연결어미 뒤에서 나뉜다", () => {
    const units = splitUnits(LONG);
    expect(units.some((u) => u.endsWith("바르고"))).toBe(true);
  });

  it("너무 짧은 조각은 앞에 붙인다 — 한두 낱말짜리 컷은 쓸모가 없다", () => {
    // "자면" 처럼 한 낱말만 떨어지는 자리가 생긴다. 그런 조각은 앞 조각에 붙인다.
    expect(splitUnits(LONG).every((u) => u.replace(/\s/g, "").length >= 6)).toBe(true);
  });

  it("나눌 자리가 없는 긴 문장은 통째로 둔다 — 쪼갤 수 없는 문장도 있다", () => {
    const noBreak = "아주아주아주아주아주아주아주아주아주아주아주아주아주아주긴한덩어리입니다.";
    expect(splitUnits(noBreak)).toEqual([noBreak]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(splitUnits("")).toEqual([]);
    expect(splitUnits(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: FAIL — `splitUnits is not a function`

- [ ] **Step 3: `lib/cuts.js` 에 `splitUnits` 를 더한다**

파일 맨 위에 import 를 더한다(`lib/cuts.js` 는 서버 전용이고 `lib/script.js` 는 클라이언트
안전하므로 번들 문제가 없다):

```js
import { secondsForText } from "./script";
```

`splitSentences` **바로 아래**에 붙인다:

```js
// 컷 경계 후보. 컷은 여기서 나온 조각의 번호로만 이야기한다.
//
// 왜 문장만으로는 모자란가: 원고 한 문장이 12초인 경우가 있고(실측), 그 안에 성분·사용
// 순서·후기가 다 들어 있었다. 화면 설계가 그것을 한 장면으로 만들려다 동시에 일어날 수 없는
// 동작 둘을 요구했고, 이미지에 **손이 셋** 나왔다.
//
// 8초를 넘는 문장만 나눈다. 이 8초는 **콘텐츠 상한**이다 — 이미지 한 장에 담기는 정보량이지
// 모델 사정이 아니다. 모델을 바꿔도 이 값은 안 바뀐다.
// (모델 상한은 눈금의 최대값이고 lib/clip-limits.js 에 있다. 둘을 섞지 않는다.)
//
// 나눠도 원문은 그대로다: 공백이 있는 자리에서만 자르고 다시 " " 로 이으면 같은 글이 된다.
// **컷을 이어붙이면 원고와 글자 그대로 같다** 는 보장이 이렇게 유지된다.
//
// export 하는 이유: 파이프라인이 "8초를 넘는 컷이 있는가"를 판정할 때 같은 값을 쓴다.
export const CONTENT_MAX_SECONDS = 8;

// 연결어미는 **닫힌 목록**이다. 한국어 연결어미를 다 담으려 하지 않는다 —
// 못 담은 어미는 그 문장이 안 나뉠 뿐이고, 그때는 지금 동작(문장 통째)으로 떨어진다.
// 늘리는 것은 나중에 한 줄이면 된다.
const CLAUSE_ENDINGS = ["고", "며", "면", "어서", "아서", "지만", "는데"];

// 한두 낱말짜리 조각은 컷으로 쓸모가 없다("자면" 같은 것). 앞 조각에 도로 붙인다.
// 연결어미 매칭은 낱말 끝만 보므로 "장면"·"라면"처럼 어미가 아닌 것도 걸리는데,
// 이 하한이 그런 자리를 대부분 걸러 준다.
const MIN_UNIT_CHARS = 6;

const noSpace = (s) => (s || "").replace(/\s/g, "").length;

function isClauseEnd(token) {
  if (token.endsWith(",")) return true;
  return CLAUSE_ENDINGS.some((e) => token.endsWith(e));
}

function splitClauses(sentence) {
  const parts = [];
  let buf = "";
  for (const token of sentence.split(/\s+/).filter(Boolean)) {
    buf = buf ? `${buf} ${token}` : token;
    // 조각이 너무 짧으면 자르지 않고 계속 모은다
    if (isClauseEnd(token) && noSpace(buf) >= MIN_UNIT_CHARS) {
      parts.push(buf);
      buf = "";
    }
  }
  // 마지막 조각이 너무 짧으면 앞에 붙인다 — 꼬리가 한 낱말로 떨어지지 않게
  if (buf) {
    if (parts.length && noSpace(buf) < MIN_UNIT_CHARS) parts[parts.length - 1] += ` ${buf}`;
    else parts.push(buf);
  }
  return parts.length ? parts : [sentence];
}

export function splitUnits(text) {
  const out = [];
  for (const s of splitSentences(text)) {
    if (secondsForText(s) <= CONTENT_MAX_SECONDS) out.push(s);
    else out.push(...splitClauses(s));
  }
  return out;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: PASS

`★ 이어붙이면 원문과 같다` 가 실패하면 **자르는 자리가 공백이 아닌 곳**이라는 뜻이다.
`splitClauses` 를 고쳐라 — 테스트를 고치지 마라.

- [ ] **Step 5: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS (아직 아무도 `splitUnits` 를 부르지 않으므로 동작은 그대로다)

- [ ] **Step 6: 커밋**

```bash
git add lib/cuts.js tests/cuts.test.js
git commit -m "feat: 컷 경계 후보를 문장 안까지 넓힌다 — splitUnits

원고 한 문장이 12초인 경우가 있었고(실측) 그 안에 성분·사용 순서·후기가 다 들어 있었다.
화면 설계가 한 장면으로 만들려다 동시에 일어날 수 없는 동작 둘을 요구했고 이미지에 손이
셋 나왔다. 컷이 문장보다 잘아질 수 없어 손쓸 데가 없었다.

8초를 넘는 문장만 쉼표·연결어미 뒤에서 나눈다. 공백이 있는 자리에서만 자르므로 다시 이으면
원문과 같다 — 컷을 이어붙이면 원고와 글자 그대로 같다는 보장이 유지된다.

연결어미는 닫힌 목록이다. 못 담은 어미는 그 문장이 안 나뉠 뿐이다.

아직 아무도 부르지 않는다 — 배선은 다음 태스크다."
```

---

## Task 3: 분할이 시나리오로 나누되 모델 길이를 고려한다

**Files:**
- Modify: `lib/cuts.js` (`SPLIT_SYSTEM` → `buildSplitMessages` 가 문장을 만든다)
- Modify: `lib/pipeline.js` (`splitUnits` 사용, 8초 초과 재시도·로그)
- Test: `tests/cuts.test.js`, `tests/pipeline.test.js`

**Interfaces:**
- Consumes: `splitUnits(text)` (Task 2)
- Produces: `buildSplitMessages(units)` — 서명 그대로. **시스템 문구가 상수가 아니라 눈금에서 만들어진다**

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 의 `buildSplitMessages` describe 에 더한다:

```js
  it("모델이 만들 수 있는 길이를 사실로 알려 준다 — 눈금에서 읽는다", () => {
    const { system } = buildSplitMessages(["한 문장."]);
    // lib/clip-limits.js 의 눈금(지금 6·8·10…20)에서 하한·상한을 읽어야 한다.
    // 숫자를 프롬프트에 박으면 모델을 바꿀 때 지시가 어긋난다.
    expect(system).toContain(String(I2V_STEPS[0]));
    expect(system).toContain(String(I2V_MAX_SECONDS));
  });

  it("길이를 맞추려고 장면을 붙이거나 끊지 말라고 못 박는다", () => {
    // 나누는 것은 시나리오다. 모델 길이는 목표가 아니라 고려할 사실이다.
    expect(buildSplitMessages(["한 문장."]).system).toContain("억지로");
  });

  it("화면이 바뀌는 자리에서 끊으라는 규칙은 그대로다", () => {
    expect(buildSplitMessages(["한 문장."]).system).toContain("화면이 바뀔 자리");
  });
```

`tests/cuts.test.js` 첫 줄 import 에 눈금을 더한다:

```js
import { I2V_STEPS, I2V_MAX_SECONDS } from "../lib/clip-limits.js";
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: FAIL — 시스템 문구에 눈금 숫자와 "억지로" 가 없다

- [ ] **Step 3: `SPLIT_SYSTEM` 을 눈금에서 만든다**

`lib/cuts.js` 맨 위 import 에 더한다:

```js
import { I2V_STEPS, I2V_MAX_SECONDS } from "./clip-limits";
```

기존 `const SPLIT_SYSTEM = \`...\`` 를 **함수로 바꾼다.** 길이 규칙 세 줄
(`- 컷 하나는 3~8초를 겨냥한다 …`, `- 문장을 쪼개지 않는다 …`, `- 짧은 문장 여럿이 …`,
`- 어떤 경우에도 컷 하나가 15초를 넘지 않게 한다.`)을 아래로 갈아 끼운다:

```js
// 나누는 것은 시나리오다. 모델이 만들 수 있는 길이는 **목표가 아니라 알려 주는 사실**로 넣는다.
//
// 상한이 둘이라 섞지 않는다:
//  - 콘텐츠 상한(8초) — 이미지 한 장에 담기는 정보량. 모델과 무관하다.
//    실측에서 12초 컷의 화면 설계가 동시에 불가능한 동작 둘을 요구해 손이 셋 나왔다.
//  - 모델 상한(눈금의 최대값) — 넘으면 클립 뒷부분이 움직이지 않는다.
//
// 숫자를 하드코딩하지 않는다. 모델이 바뀌면 눈금 표만 바뀌고 이 문장은 따라 바뀐다.
function splitSystem() {
  const lo = I2V_STEPS[0];
  const hi = I2V_MAX_SECONDS;
  return `너는 숏폼 영상 편집자다. 완성된 나레이션 원고를 컷으로 나눈다.
번호가 매겨진 조각 목록을 받는다. 각 컷이 어느 조각부터 어느 조각까지인지만 고른다.
반드시 JSON 하나만 출력: {"cuts":[{"from":시작 조각 번호,"to":끝 조각 번호}]}
규칙:
- 조각을 고쳐 쓰지 않는다. 너는 경계만 고른다 — 문장은 이미 사장님이 승인했다.
- 컷은 1번 조각에서 시작해 마지막 조각에서 끝난다. 빈틈도 겹침도 없다(앞 컷의 to 다음이 뒤 컷의 from이다).
- 한 컷은 화면 하나다. 화면이 바뀔 자리에서 끊는다 — 말하는 대상이 바뀌거나, 시간·장소가 옮겨가거나, 근거에서 결과로 넘어가는 자리.
- 한 컷에 동시에 일어날 수 없는 동작 둘을 담지 않는다. 정지 화면 하나로 그려지므로, "덜어서 바른다" 처럼 순서가 있는 동작이 한 컷에 들어가면 그림이 무너진다.
- 한국어 낭독은 초당 5.5자 남짓이다. 한 컷이 8초(공백 빼고 44자)를 넘지 않게 한다 — 이미지 한 장이 그보다 오래 머물면 눈이 지친다.
- 이 영상 모델은 ${lo}~${hi}초 클립을 만든다. ${hi}초를 넘는 컷은 뒷부분이 움직이지 않고, ${lo}초보다 짧은 컷은 남는 시간이 생긴다.
- 장면이 바뀌는 자리를 먼저 잡고, 그 안에서 위를 고려한다. 억지로 길이를 맞추려고 장면을 붙이거나 끊지 않는다.`;
}
```

`buildSplitMessages` 를 바꾼다:

```js
export function buildSplitMessages(units) {
  const numbered = units.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return {
    system: splitSystem(),
    messages: [{ role: "user", content: `[원고 — 조각 ${units.length}개]\n${numbered}` }],
  };
}
```

- [ ] **Step 4: 실패하는 테스트를 쓴다 — 파이프라인 배선과 판정**

`tests/pipeline.test.js` 파일 끝에 더한다:

```js
describe("컷 길이 — 쪼갤 수 있는데 안 쪼갰으면 다시 묻는다", () => {
  // 8초를 넘는 컷이 있고 그 컷 안에 아직 안 쓴 후보가 남아 있으면 한 번 더 묻는다.
  // 후보가 없으면(쪼갤 수 없는 문장) 통과시킨다 — 영영 실패하지 않게.
  const LONG = "이 앰플은 PDRN과 엑소좀, 시카가 함께 들어 있어 자기 전에 토너를 바른 후, 2~3방울을 얼굴에 펴 바르고 자면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";

  async function projectWithLongSentence() {
    const p = await projects.createProject({
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [] },
    });
    return projects.updateProject(p.id, (proj) => ({
      ...proj, briefing: { topic: "앰플" }, script: { text: LONG },
    }));
  }

  const splitCallCount = () =>
    llmMock.callJson.mock.calls.filter((c) => c[0]?.stage === "컷 분할").length;

  it("쪼갤 수 있는데 한 컷에 다 몰아넣으면 한 번 더 묻는다", async () => {
    const p = await projectWithLongSentence();
    const units = splitUnits(LONG);
    expect(units.length, "이 문장이 여러 조각으로 나뉘어야 이 테스트가 의미가 있다").toBeGreaterThan(1);
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: units.length }] })                    // 1차 — 통째로
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: units.length }] }) // 2차 — 나눔
      .mockResolvedValueOnce({ shots: [] })                                                 // 화면 설계
      .mockResolvedValueOnce({ cast: [] });                                                 // 캐스팅
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(splitCallCount()).toBe(2);
    expect(cuts.length).toBe(2);
  });

  it("쪼갤 수 없는 문장은 다시 묻지 않는다 — 영영 실패하지 않게", async () => {
    // 조각 하나로 이뤄진 컷은 8초를 넘어도 더 쪼갤 수 없다. 되물어도 답이 같다.
    const NO_BREAK = "아주긴한덩어리로이어져서끊을자리가전혀없는문장이길게이어지고또이어져서마침내끝납니다.";
    const p = await projects.createProject({ settings: {}, material: { text: "자료", photos: [] } });
    await projects.updateProject(p.id, (proj) => ({
      ...proj, briefing: { topic: "t" }, script: { text: NO_BREAK },
    }));
    const units = splitUnits(NO_BREAK);
    expect(units.length, "이 문장은 나눌 자리가 없어야 한다").toBe(1);
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }] })
      .mockResolvedValueOnce({ shots: [] })
      .mockResolvedValueOnce({ cast: [] });
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(cuts[0].seconds, "이 컷은 8초를 넘는다 — 그런데도 되묻지 않아야 한다").toBeGreaterThan(8);
    expect(splitCallCount()).toBe(1);
  });
});
```

`tests/pipeline.test.js` 첫 줄 import 에 `splitUnits` 를 더한다:

```js
import { splitUnits } from "../lib/cuts.js";
```

- [ ] **Step 5: 파이프라인을 고친다**

`lib/pipeline.js` 의 import 에서 `splitSentences` 를 `splitUnits` 로 바꾸고, `defaultDeps.splitCuts`
안의 분할 블록을 바꾼다:

import 를 바꾼다 — `splitSentences` → `splitUnits`, 그리고 `CONTENT_MAX_SECONDS` 를 더한다:

```js
import { splitUnits, buildSplitMessages, buildShowsMessages, buildImagePrompt, buildClipPrompt, CONTENT_MAX_SECONDS } from "./cuts";
```

`defaultDeps.splitCuts` 안의 분할 블록(`const sentences = splitSentences(...)` 부터 폴백까지)을
통째로 바꾼다:

```js
    const units = splitUnits(project.script?.text);
    if (units.length === 0) throw new Error("컷 분할 실패");

    const split = buildSplitMessages(units);

    // 8초를 넘으면서 **두 조각 이상**으로 이뤄진 컷이 있으면, 쪼갤 수 있는데 안 쪼갠 것이다.
    // 조각 하나로 이뤄진 컷은 더 쪼갤 수 없으므로 통과시킨다 — 되물어도 답이 같고 영영 실패한다.
    //
    // validateCutRanges 는 조각 범위를 안 돌려주므로 LLM 응답의 from/to 를 함께 본다.
    // 검증을 통과한 응답은 컷과 순서가 같다(그 함수가 obj.cuts 순서대로 담는다).
    const splittableLong = (made, raw) => {
      const ranges = Array.isArray(raw?.cuts) ? raw.cuts : [];
      return made.some((c, i) => {
        const r = ranges[i];
        const spans = r ? r.to - r.from + 1 : 1;
        return c.seconds > CONTENT_MAX_SECONDS && spans > 1;
      });
    };

    let cuts = null;
    for (let i = 0; i < 2 && !cuts; i++) {
      const raw = await callJson({ system: split.system, messages: split.messages, stage: "컷 분할", projectId: project.id });
      cuts = validateCutRanges(raw, units);
      // 첫 판에서만 되묻는다. 두 번째 답은 그대로 쓴다.
      if (cuts && i === 0 && splittableLong(cuts, raw)) cuts = null;
    }
    // 경계를 못 받으면 조각 하나에 컷 하나 — 분할은 실패해도 대본은 살아 있다
    if (!cuts) {
      cuts = validateCutRanges({ cuts: units.map((_, i) => ({ from: i + 1, to: i + 1 })) }, units);
    }

    // 컷이 얼마나 긴지 남긴다. 막지는 않는다 — 못 쪼개는 문장도 있다.
    const over = cuts.filter((c) => c.seconds > CONTENT_MAX_SECONDS).length;
    console.log(`[분할 ${project.id.slice(0, 8)}] 조각 ${units.length}개 → 컷 ${cuts.length}개 · 8초 초과 ${over}개`);
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/cuts.js lib/pipeline.js tests/cuts.test.js tests/pipeline.test.js
git commit -m "feat: 분할이 시나리오로 나누되 모델 길이를 고려한다

나누는 것은 시나리오다. 모델이 만들 수 있는 길이는 목표가 아니라 알려 주는 사실로 넣고,
억지로 길이를 맞추려고 장면을 붙이거나 끊지 말라고 못 박았다.

숫자는 눈금에서 읽는다. 모델을 바꾸면 눈금 표만 바뀌고 분할 지시는 따라 바뀐다.

상한이 둘이라 섞지 않는다. 콘텐츠 상한 8초는 이미지 한 장에 담기는 정보량이고 모델과
무관하다. 모델 상한은 눈금의 최대값이다.

8초를 넘으면서 두 조각 이상인 컷이 있으면 한 번 더 묻는다. 지금까지 이 규칙은 프롬프트에만
있었고 실측 28%가 어겼다 — 고칠 방법이 없었기 때문이다(문장보다 잘게 못 잘랐다)."
```

---

## Task 4: 화면이 글자를 그리도록 요구하지 않는다

**Files:**
- Modify: `lib/cuts.js` (`SHOWS_SYSTEM`)
- Test: `tests/cuts.test.js`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 의 `buildShowsMessages` describe 에 더한다:

```js
  it("화면 안에 읽히는 글자·숫자를 요구하지 말라고 한다", () => {
    // 이미지 프롬프트에 이미 no text or letters 가 있는데도 가격표에 79,000원이 나왔다
    // (대본은 39,000원). 같은 프롬프트의 장면 서술이 글자를 요구해 두 지시가 모순됐고
    // 장면이 이겼다. 막을 자리는 shows 다.
    const { system } = buildShowsMessages(project, [{ sentence: "한 문장." }]);
    expect(system).toContain("가격표");
    expect(system).toContain("자막");
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: FAIL

- [ ] **Step 3: `SHOWS_SYSTEM` 에 규칙을 더한다**

거울 규칙(`- 거울·유리창처럼 비치는 면에 …`) **바로 아래**에 넣는다. 같은 결의 판단이라
붙여 두는 것이 읽는 사람에게 낫다:

```
- 화면 안에서 읽히는 글자·숫자가 보이는 장면은 적지 않는다 — 가격표·간판·메뉴판·문서·화면 속 글자.
  지금 기술로는 글자가 무늬로 그려져 틀린 값이 나온다(실측: VT PDRN → VT PORN, 39,000 → 79,000).
  가격·이름처럼 정확해야 하는 것은 자막이 맡는다.
  ✗ "앰플 병과 가격표가 함께 놓인 테이블 클로즈업"
  ✓ "앰플 병 하나만 놓인 테이블 클로즈업, 아침 햇살"
```

**제품을 비추는 규칙은 건드리지 마라.** 금지하는 것은 "글자가 읽히기를 요구하는 것"이지
제품이 아니다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/cuts.js tests/cuts.test.js
git commit -m "fix: 화면이 글자를 그리도록 요구하지 않는다

이미지 프롬프트에 no text or letters 가 이미 있는데도 가격표에 79,000원이 나왔다(대본은
39,000원). 같은 프롬프트의 Scene 서술이 가격표를 요구해 두 지시가 모순됐고 장면이 이겼다.
금지를 하나 더 붙이는 것은 소용없다.

막을 자리는 shows 다. 거울 규칙과 같은 판단이라 그 아래에 붙였다 — 못 그리는 것은 애초에
요구하지 않는다.

라벨도 같은 자리에서 무너졌다(VT PDRN → VT PORN). 레퍼런스가 형태·색은 지키지만 글자는
못 지킨다. 정확해야 하는 것은 자막이 맡는다."
```

---

## Task 5: 가짜 모드로 잰다 (fal 호출 없음)

**Files:** 없음 (검증). 발견한 것만 고친다.

- [ ] **Step 1: 서버를 새로 띄우지 말고 이미 떠 있는 것을 쓴다**

`localhost:3000` 에 dev 서버가 이미 떠 있다. **끄지도, 새로 띄우지도, `.next` 를 지우지도 마라** —
같은 폴더에 두 번 띄우면 `.next` 가 겹쳐 서버가 죽는다(이 저장소 `CLAUDE.md` 의 경고다).

컷 분할까지는 **fal 을 한 번도 부르지 않는다**(분할·화면 설계·캐스팅은 OpenAI 만 쓴다).
`curl` 로 API 를 직접 두드린다:

```bash
cd /c/Users/fixup/shotform-video
curl -s -X POST http://localhost:3000/api/projects -H "Content-Type: application/json" \
  -d '{"material":{"text":"<자료>","photos":[]},"settings":{"target_seconds":30}}'
curl -s -X POST http://localhost:3000/api/projects/<id>/briefing -H "Content-Type: application/json" -d '{}'
curl -s -X POST http://localhost:3000/api/projects/<id>/script   -H "Content-Type: application/json" -d '{}'
curl -s -X POST http://localhost:3000/api/projects/<id>/cuts     -H "Content-Type: application/json" -d '{}'
curl -s http://localhost:3000/api/projects/<id>
```

**`/images`·`/video`·`/render` 는 부르지 마라.** 거기서 돈이 나간다.

자료는 서로 다른 셋을 쓴다 — 긴 문장이 나올 것(화장품 설명), 짧은 문장이 많을 것(가격·영업시간
안내), 이야기체 하나.

- [ ] **Step 2: 되는가 안 되는가를 본다**

저장된 프로젝트(`data/projects/<id>.json`)와 서버 로그를 본다. 로그는 이 파일에 쌓인다:
`C:\Users\fixup\AppData\Local\Temp\claude\C--Users-fixup\6d98b389-a027-4d87-b8f6-0f910b488d81\tasks\b08gv4trl.output`

- [ ] **8초를 넘는 컷이 줄었는가.** 이전 실측은 컷의 **28%가 8초 초과**였다
- [ ] **컷을 이어붙이면 원고와 같은가** — `cuts.map(c => c.sentence).join(" ")` 이 `script.text` 와
      같은지 직접 비교해라. 이것이 깨지면 즉시 멈추고 보고해라
- [ ] 한 컷 안에 **동시에 불가능한 동작 둘**이 담긴 `shows` 가 있는가(예: "덜어서 바르는")
- [ ] `shows` 에 **가격표·간판·글자**를 요구한 것이 있는가
- [ ] 짧은 문장이 많은 자료에서 컷이 잘게 부서지지 않았는가

- [ ] **Step 3: 어긋난 것을 고친다**

**무엇이 어긋났는지 한 줄로 적을 수 있을 때만 고친다.** 적을 수 없으면 사장님에게 가져간다 —
프롬프트 왕복은 이 저장소에서 네 번 다 다른 형태로 샜다.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "fix: 컷 분할 관통에서 드러난 것을 고친다

[무엇이 어긋났는지]"
```

---

## 다음 — 실제 이미지·완성본 확인은 사장님 검토 게이트

이 계획은 **가짜 모드까지**다. 두 가지는 유료라 **사장님 승인 없이 시작하지 않는다.**

- **이미지**(컷당 후보 2장 × $0.04) — 손이 셋 나오던 컷이 나뉜 뒤에도 그런지
- **완성본 합성**(0원이지만 그 앞의 클립이 유료) — 무음이 실제로 사라졌는지, 완성본 길이가
  낭독 합과 맞는지
