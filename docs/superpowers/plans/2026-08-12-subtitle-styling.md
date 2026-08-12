# 자막을 사장님이 고친다 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ⑥완성에서 완성본을 보며 자막을 드래그해 옮기고 폰트·색·크기를 고른다.

**Architecture:** 완성본을 두 벌로 나눈다 — 자막 없는 **원본**과 자막을 구운 **완성본**. 미리보기는 원본 위에 HTML 자막을 겹치고, [적용]하면 원본에 자막만 다시 굽는다(로컬 ffmpeg, 0원). 자막 설정은 각인 머리에 한 줄 JSON 으로 들어가되 **기본값이면 아예 안 붙는다**.

**Tech Stack:** 새 의존성 없음 · ffmpeg(ass 필터) · Vitest

## Global Constraints

설계 `docs/superpowers/specs/2026-08-12-subtitle-styling-design.md` 의 "지켜야 할 것" 그대로다.

- ★★ **완성본 URL 을 바꾸지 않는다** — `/api/renders/{id}.mp4`. `render.of` 각인이 이 문자열로 낡음을 판정하고 사장님이 받아 간 링크도 이 모양이다
- ★★ **옛 각인을 깨지 않는다.** 기본 설정이면 각인 머리를 **안 붙인다**(지금 규칙과 같다). 붙이면 이미 만든 완성본이 전부 낡아 다시 굽게 된다. 옛 각인(`top\n…`)도 계속 읽혀야 한다
- ★★ **자막만 바뀌었을 때 클립·그림이 낡으면 안 된다**
- ★ 줄바꿈·글자 크기 계산은 화면과 ffmpeg 가 **같은 함수**(`lib/subtitles.js`)에서 가져온다
- ★ 자막 글자는 계속 **원고 그대로** 태운다
- **새 npm 의존성 금지** — 색 피커·드래그는 표준 입력과 포인터 이벤트로
- **예상 못 한 실패는 고치지 말고 보고한다**

**값 (여러 태스크가 쓴다 — 글자 그대로):**

| | 값 |
|---|---|
| 설정 필드 | `settings.subtitle` = `{ pos:[x,y], font, color, size }` |
| 위치 | `pos` 는 **비율**(0~1). 기본 `[0.5, 0.82]` |
| 폰트 id | `basic` · `impact` · `soft` (기본 `basic`) |
| 색 | `#RRGGBB` 문자열. 기본 `#FFFFFF` |
| 크기 | 배율. 기본 `1.0`, 범위 **0.7 ~ 1.6** |
| 안전 여백 | 가로 6%, 세로 6% — `pos` 를 이 안으로 되돌린다 |
| 원본 저장 키 | `renders/{projectId}-raw.mp4` |

**기준 테스트 수:** 시작 시 `npx vitest run` 으로 세라. 매 태스크 끝에서 유지되거나 늘어야 한다.

## ★ 병렬 조

파일이 갈리는 것만 동시에 돈다.

| 차수 | 동시에 | 파일 |
|---|---|---|
| 1 | **Task 1** · **Task 2** | `lib/subtitles.js`(설정 모델) / `assets/`(폰트 파일) |
| 2 | **Task 3** · **Task 4** | `lib/subtitles.js`(toAss) / `lib/steps.js`(각인) |
| 3 | **Task 5** · **Task 6** | `lib/compose.js`(원본·재굽기) / `app/create/[id]/done/page.js`(화면) |
| 4 | **Task 7** | 라우트·파이프라인 배선 |

★ 2차의 두 태스크는 **같은 파일을 안 만진다** — Task 3 은 `lib/subtitles.js`, Task 4 는 `lib/steps.js` 다. Task 1 이 만든 순수 함수를 둘 다 쓴다.

---

### Task 1: 자막 설정 — 값과 판정을 한 자리에

**Files:**
- Modify: `lib/subtitles.js`(하단에 추가)
- Test: `tests/subtitles.test.js`

**Interfaces:**
- Produces: `SUBTITLE_FONTS` · `DEFAULT_SUBTITLE` · `normalizeSubtitle(raw)` · `outlineFor(color)` · `clampPos([x,y])`

★ 이 태스크는 **순수 함수만** 만든다. 소비자(각인·ASS·화면)는 뒤 태스크가 붙인다.

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/subtitles.test.js` 에 더한다:

```js
import {
  SUBTITLE_FONTS, DEFAULT_SUBTITLE, normalizeSubtitle, outlineFor, clampPos,
} from "../lib/subtitles.js";

describe("자막 설정 — 자유롭되 코드가 막는다", () => {
  it("기본값이 있다", () => {
    expect(DEFAULT_SUBTITLE).toEqual({ pos: [0.5, 0.82], font: "basic", color: "#FFFFFF", size: 1 });
  });

  it("폰트는 셋이고 basic 이 기본이다", () => {
    expect(SUBTITLE_FONTS.map((f) => f.id)).toEqual(["basic", "impact", "soft"]);
    expect(SUBTITLE_FONTS.every((f) => f.label && f.family)).toBe(true);
  });

  // ★ 목록 밖 값은 조용히 기본으로 — 자막 하나 때문에 합성이 죽으면 안 된다
  it("모르는 폰트·잘못된 색은 기본으로 떨어진다", () => {
    expect(normalizeSubtitle({ font: "코믹산스" }).font).toBe("basic");
    expect(normalizeSubtitle({ color: "빨강" }).color).toBe("#FFFFFF");
    expect(normalizeSubtitle({ color: "#GGG" }).color).toBe("#FFFFFF");
    expect(normalizeSubtitle(null)).toEqual(DEFAULT_SUBTITLE);
    expect(normalizeSubtitle("문자열")).toEqual(DEFAULT_SUBTITLE);
  });

  it("색은 대소문자를 가리지 않고 #RRGGBB 로 정규화한다", () => {
    expect(normalizeSubtitle({ color: "#ffcc00" }).color).toBe("#FFCC00");
  });

  it("크기는 0.7~1.6 안으로 되돌린다", () => {
    expect(normalizeSubtitle({ size: 0.1 }).size).toBe(0.7);
    expect(normalizeSubtitle({ size: 9 }).size).toBe(1.6);
    expect(normalizeSubtitle({ size: 1.2 }).size).toBe(1.2);
    expect(normalizeSubtitle({ size: "크게" }).size).toBe(1);
  });

  // ★ 화면 밖으로 나가면 자막이 안 보인다 — 안전 여백 6%
  it("위치는 안전 여백 안으로 되돌린다", () => {
    expect(clampPos([0.5, 0.82])).toEqual([0.5, 0.82]);
    expect(clampPos([-1, 2])).toEqual([0.06, 0.94]);
    expect(clampPos([0.02, 0.01])).toEqual([0.06, 0.06]);
    expect(clampPos(["가", null])).toEqual([0.5, 0.82]);
    expect(clampPos(undefined)).toEqual([0.5, 0.82]);
  });

  // ★ 배경을 분석하지 않는다 — 글자색의 반대 명도로 외곽선을 정하면 어디서든 읽힌다
  it("밝은 글자는 검정 외곽, 어두운 글자는 흰 외곽", () => {
    expect(outlineFor("#FFFFFF")).toBe("#000000");
    expect(outlineFor("#FFCC00")).toBe("#000000");
    expect(outlineFor("#000000")).toBe("#FFFFFF");
    expect(outlineFor("#203040")).toBe("#FFFFFF");
  });

  it("normalizeSubtitle 은 위치도 함께 되돌린다", () => {
    expect(normalizeSubtitle({ pos: [5, 5] }).pos).toEqual([0.94, 0.94]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: FAIL — 함수가 없다.

- [ ] **Step 3: 구현한다**

`lib/subtitles.js` **맨 아래**에 더한다(기존 코드를 건드리지 마라):

```js
// ── 자막 설정 ────────────────────────────────────────────────────────────
//
// 사장님이 ⑥완성에서 고치는 값들이다. **자유롭되 코드가 막는다**(사용자 결정):
// 목록 밖 폰트·잘못된 색·범위 밖 크기·화면 밖 위치는 조용히 되돌린다.
// 던지지 않는 이유는 subtitleStyle 과 같다 — 자막 하나 때문에 합성이 통째로 죽으면 안 된다.

// 폰트는 assets/ 에 실제로 있는 파일만 고를 수 있다. family 는 **폰트 파일 내부 이름**이고
// ASS 의 Fontname 과 브라우저 font-family 양쪽에 그대로 실린다 — 두 벌로 적으면 갈린다.
export const SUBTITLE_FONTS = [
  { id: "basic", label: "기본", family: "Pretendard" },
  { id: "impact", label: "강조", family: "Black Han Sans" },
  { id: "soft", label: "부드럽게", family: "Gowun Dodum" },
];

export const DEFAULT_SUBTITLE = { pos: [0.5, 0.82], font: "basic", color: "#FFFFFF", size: 1 };

// 화면 가장자리 안전 여백. 이보다 밖이면 잘리거나 UI 에 가린다.
const SAFE = 0.06;
const SIZE_MIN = 0.7;
const SIZE_MAX = 1.6;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function clampPos(pos) {
  if (!Array.isArray(pos)) return [...DEFAULT_SUBTITLE.pos];
  const x = Number(pos[0]);
  const y = Number(pos[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [...DEFAULT_SUBTITLE.pos];
  return [clamp(x, SAFE, 1 - SAFE), clamp(y, SAFE, 1 - SAFE)];
}

// ★ 배경 밝기를 재지 않는다 — 프레임을 뜯어야 해서 무겁다.
// 글자색의 반대 명도로 외곽선을 정하면(지금도 외곽선 두께 3) 어떤 배경에서도 읽힌다.
export function outlineFor(color) {
  const hex = String(color || "").replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  // 사람 눈이 느끼는 밝기(ITU-R BT.601)
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#000000" : "#FFFFFF";
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeSubtitle(raw) {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const font = SUBTITLE_FONTS.some((f) => f.id === s.font) ? s.font : DEFAULT_SUBTITLE.font;
  const color = HEX.test(s.color || "") ? String(s.color).toUpperCase() : DEFAULT_SUBTITLE.color;
  const sizeNum = Number(s.size);
  const size = Number.isFinite(sizeNum) ? clamp(sizeNum, SIZE_MIN, SIZE_MAX) : DEFAULT_SUBTITLE.size;
  return { pos: clampPos(s.pos), font, color, size };
}
```

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: PASS 전부

- [ ] **Step 5: ★ 되돌리기가 실제로 무는지 변이로 확인한다**

`clamp(x, SAFE, 1 - SAFE)` 를 잠깐 `x` 로 바꾸고 돌린다.
Expected: "위치는 안전 여백 안으로 되돌린다" 가 FAIL. 확인했으면 되돌린다(편집기로 — `git checkout` 금지).

- [ ] **Step 6: 커밋**

```bash
git add lib/subtitles.js tests/subtitles.test.js
git commit -m "feat(subtitle): 자막 설정 — 자유롭되 코드가 막는다

위치·폰트·색·크기를 사장님이 고르되 목록 밖 값·화면 밖 위치·범위 밖 크기는 조용히
되돌린다. 던지지 않는 이유는 subtitleStyle 과 같다 — 자막 하나 때문에 합성이 죽으면 안 된다.

★ 배경 밝기를 재지 않는다. 글자색의 반대 명도로 외곽선을 정하면 어떤 배경에서도 읽힌다."
```

---

### Task 2: 폰트 파일 셋

**Files:**
- Create: `assets/subtitle-impact.otf`(또는 .ttf) · `assets/subtitle-soft.otf`
- Test: `tests/assets.test.js`(신규)

★ 이 태스크는 **파일을 놓는 일**이다. 코드는 Task 1 이 이미 이름을 정해 뒀다.

- [ ] **Step 1: 지금 무엇이 있는지 본다**

Run: `ls -la assets/`

`subtitle-font.otf` 하나가 있고 `lib/compose.js:93` 이 `assets` 를 통째로 `fontsdir` 로 넘긴다. **그 폴더에 파일을 놓기만 하면 ffmpeg 가 찾는다.**

- [ ] **Step 2: 폰트를 받는다**

무료 상업 이용이 가능한 한글 폰트 둘이 필요하다. Google Fonts 의 OFL 폰트를 쓴다:

```bash
curl -L -o assets/subtitle-impact.ttf "https://github.com/google/fonts/raw/main/ofl/blackhansans/BlackHanSans-Regular.ttf"
curl -L -o assets/subtitle-soft.ttf "https://github.com/google/fonts/raw/main/ofl/gowundodum/GowunDodum-Regular.ttf"
ls -la assets/
```

★ 받은 파일이 **HTML 오류 페이지가 아니라 폰트인지** 확인하라: `file assets/subtitle-impact.ttf` 또는 크기가 수백 KB~수 MB 인지. 아니면 **고치지 말고 보고하라** — 네트워크가 막혔거나 경로가 바뀐 것이다.

- [ ] **Step 3: 폰트 내부 이름을 확인한다**

`Task 1` 이 `family` 를 `"Black Han Sans"`·`"Gowun Dodum"` 으로 적어 뒀다. **파일 내부 이름이 그것과 같아야** ffmpeg 가 찾는다.

```bash
node -e "const b=require('fs').readFileSync('assets/subtitle-impact.ttf');const s=b.toString('latin1');const m=s.match(/[A-Za-z ]{4,40}/g)||[];console.log(m.filter(x=>/Han|Sans|Black/.test(x)).slice(0,8))"
```

이름이 다르면 **`lib/subtitles.js` 의 `family` 를 실제 이름에 맞춰 고쳐라**(그 한 줄만). 다르다는 사실을 보고서에 적어라.

- [ ] **Step 4: 파일이 있는지 재는 테스트를 쓴다**

`tests/assets.test.js` 를 만든다:

```js
import { describe, it, expect } from "vitest";
import { existsSync, statSync } from "node:fs";
import { SUBTITLE_FONTS } from "../lib/subtitles.js";

// ★ 폰트는 코드가 아니라 파일이다. 목록에만 있고 파일이 없으면 ffmpeg 가 조용히
// 기본 폰트로 그려 사장님이 고른 것과 다른 자막이 나온다 — 아무도 못 알아챈다.
describe("자막 폰트 파일", () => {
  const FILES = {
    basic: "assets/subtitle-font.otf",
    impact: "assets/subtitle-impact.ttf",
    soft: "assets/subtitle-soft.ttf",
  };

  for (const f of SUBTITLE_FONTS) {
    it(`${f.id}(${f.label}) 파일이 있다`, () => {
      const p = FILES[f.id];
      expect(p, `${f.id} 의 파일 경로가 목록에 없다`).toBeTruthy();
      expect(existsSync(p), `${p} 가 없다`).toBe(true);
      // 오류 HTML 을 받아 놓고 폰트라고 믿는 것을 막는다
      expect(statSync(p).size).toBeGreaterThan(50_000);
    });
  }
});
```

★ 확장자가 `.otf` 인지 `.ttf` 인지 실제로 받은 것에 맞춰라.

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run tests/assets.test.js`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add assets/subtitle-impact.ttf assets/subtitle-soft.ttf tests/assets.test.js
git commit -m "feat(subtitle): 폰트 셋 — 기본·강조·부드럽게

lib/compose.js 가 assets 를 통째로 fontsdir 로 넘기므로 파일을 놓기만 하면 ffmpeg 가 찾는다.
둘 다 OFL(무료 상업 이용 가능)이다.

★ 파일 존재를 테스트가 잰다 — 목록에만 있고 파일이 없으면 ffmpeg 가 조용히 기본 폰트로
그려 사장님이 고른 것과 다른 자막이 나오고, 아무도 못 알아챈다."
```

---

### Task 3: `toAss` 가 설정을 받는다

**Files:**
- Modify: `lib/subtitles.js`(`subtitleStyle`·`toAss`)
- Test: `tests/subtitles.test.js`

**Interfaces:**
- Consumes: Task 1 의 `normalizeSubtitle`·`outlineFor`·`SUBTITLE_FONTS`
- Produces: `toAss(cues, { width, height, subtitle })` — `position` 대신 `subtitle` 을 받는다

★ **옛 호출을 깨지 않는다.** `position` 만 넘기는 호출이 남아 있으면 지금 동작 그대로여야 한다.

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
describe("toAss — 자막 설정을 싣는다", () => {
  const cues = [{ start: 0, end: 2, text: "안녕하세요" }];
  const size = { width: 1080, height: 1920 };

  it("설정을 안 주면 지금과 같다 — 옛 완성본이 낡지 않는다", () => {
    const ass = toAss(cues, { ...size });
    expect(ass).toContain("Pretendard");
    expect(ass).toContain("&H00FFFFFF");   // 흰 글자
    expect(ass).toContain("Alignment"); // 헤더가 그대로다
  });

  it("폰트를 실는다", () => {
    const ass = toAss(cues, { ...size, subtitle: { font: "impact" } });
    expect(ass).toContain("Black Han Sans");
  });

  // ★ ASS 색은 &HAABBGGRR — RGB 가 아니라 **BGR 역순**이다. 뒤집으면 빨강이 파랑이 된다.
  it("색을 BGR 로 뒤집어 싣는다", () => {
    const ass = toAss(cues, { ...size, subtitle: { color: "#FF0000" } });
    expect(ass).toContain("&H000000FF");   // 빨강 = BGR 00 00 FF
  });

  it("외곽선은 코드가 정한다 — 밝은 글자면 검정", () => {
    const ass = toAss(cues, { ...size, subtitle: { color: "#FFCC00" } });
    expect(ass).toContain("&H00000000");   // 검정 외곽
  });

  it("어두운 글자면 흰 외곽", () => {
    const ass = toAss(cues, { ...size, subtitle: { color: "#101010" } });
    expect(ass).toContain("&H00FFFFFF");
  });

  it("크기 배율이 글자 크기에 곱해진다", () => {
    const base = toAss(cues, { ...size });
    const big = toAss(cues, { ...size, subtitle: { size: 1.5 } });
    const num = (s) => Number(s.match(/Style: Main,[^,]+,(\d+)/)[1]);
    expect(num(big)).toBe(Math.round(num(base) * 1.5));
  });

  // ★ 자유 위치는 \pos 로 절대 좌표를 준다 — Alignment 만으로는 아홉 칸뿐이다
  it("위치를 \\pos 로 싣고 정렬을 가운데로 잡는다", () => {
    const ass = toAss(cues, { ...size, subtitle: { pos: [0.5, 0.5] } });
    expect(ass).toContain("\\pos(540,960)");
    expect(ass).toMatch(/Style: Main,.*,5,/);   // Alignment 5 = 가운데
  });

  it("화면 밖 위치는 되돌아온 자리에 실린다", () => {
    const ass = toAss(cues, { ...size, subtitle: { pos: [9, 9] } });
    expect(ass).toContain(`\\pos(${Math.round(1080 * 0.94)},${Math.round(1920 * 0.94)})`);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: FAIL

- [ ] **Step 3: 구현한다**

`subtitleStyle` 에 `subtitle` 을 받아 크기 배율을 곱하고, `toAss` 가 폰트·색·`\pos` 를 싣게 한다.

```js
// ASS 색은 &HAABBGGRR 다 — RGB 가 아니라 **BGR 역순**이고 앞이 알파(00 = 불투명).
// 뒤집으면 빨강이 파랑으로 나간다. 한 자리에서만 만든다.
export function assColor(hex) {
  const h = String(hex || "").replace("#", "").toUpperCase();
  const rr = h.slice(0, 2) || "FF";
  const gg = h.slice(2, 4) || "FF";
  const bb = h.slice(4, 6) || "FF";
  return `&H00${bb}${gg}${rr}`;
}
```

`toAss` 안에서:

```js
  const s = normalizeSubtitle(subtitle);
  const font = SUBTITLE_FONTS.find((f) => f.id === s.font) || SUBTITLE_FONTS[0];
  const [px, py] = s.pos;
  // 자유 위치는 \pos 로 절대 좌표를 준다 — Alignment 만으로는 아홉 칸뿐이다.
  // \pos 를 쓰면 Alignment 는 **기준점**이 되므로 5(가운데)로 고정한다.
  const posTag = `{\\pos(${Math.round(width * px)},${Math.round(height * py)})}`;
```

`Dialogue` 줄의 텍스트 앞에 `posTag` 를 붙이고, Style 줄의 `Fontname`·`Fontsize`·`PrimaryColour`·`OutlineColour`·`Alignment` 를 위 값으로 채운다.

★ **`subtitle` 을 안 주면 지금과 똑같아야 한다.** 기본값이 `[0.5, 0.82]`·`Pretendard`·흰색·1.0 이므로 `\pos` 가 붙는 것 말고는 화면 결과가 같다. 옛 호출(`position` 만 주는 것)이 남아 있으면 **지우지 말고 그대로 두어라** — 그 경로가 살아 있어야 옛 프로젝트가 안 깨진다.

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: PASS 전부

- [ ] **Step 5: ★ 색 뒤집기를 변이로 확인한다**

`assColor` 의 `${bb}${gg}${rr}` 을 `${rr}${gg}${bb}` 로 잠깐 바꾸고 돌린다.
Expected: "색을 BGR 로 뒤집어 싣는다" 가 FAIL. 확인했으면 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add lib/subtitles.js tests/subtitles.test.js
git commit -m "feat(subtitle): toAss 가 폰트·색·크기·자유 위치를 싣는다

★ ASS 색은 &HAABBGGRR — RGB 가 아니라 BGR 역순이다. 뒤집으면 빨강이 파랑으로 나간다.
한 자리(assColor)에서만 만든다.

자유 위치는 \\pos 로 절대 좌표를 준다 — Alignment 만으로는 아홉 칸뿐이다.
설정을 안 주면 지금과 같은 자막이 나온다."
```

---

### Task 4: 각인이 자막 설정을 안다

**Files:**
- Modify: `lib/steps.js`(`renderKey`·`renderKeyBody`·`isSubtitlePositionOnlyStale`)
- Test: `tests/steps.test.js`

**Interfaces:**
- Consumes: Task 1 의 `normalizeSubtitle`·`DEFAULT_SUBTITLE`
- Produces: `isSubtitleOnlyStale(project)` (옛 이름 `isSubtitlePositionOnlyStale` 은 그대로 두고 새 이름을 별칭으로)

★★ **이 태스크가 이 계획에서 가장 조심할 자리다.** 각인을 잘못 바꾸면 **이미 만든 완성본이 전부 낡아** 다시 굽게 된다.

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
describe("renderKey — 자막 설정", () => {
  const base = { cuts: [{ audio: { url: "a" }, video: { url: "v" }, sentence: "가" }] };

  // ★★ 기본 설정이면 머리를 안 붙인다 — 붙이면 이미 만든 완성본이 전부 낡는다
  it("기본 설정이면 각인이 지금과 글자 그대로 같다", () => {
    expect(renderKey(base)).toBe("a|v|가");
    expect(renderKey({ ...base, settings: { subtitle: { ...DEFAULT_SUBTITLE } } })).toBe("a|v|가");
  });

  it("옛 각인(위치 낱말 머리)도 계속 읽힌다", () => {
    const old = { ...base, settings: { subtitle_position: "top" } };
    expect(renderKey(old)).toBe("top\na|v|가");
  });

  it("설정을 바꾸면 각인이 달라진다", () => {
    const k = renderKey({ ...base, settings: { subtitle: { ...DEFAULT_SUBTITLE, color: "#FF0000" } } });
    expect(k).not.toBe("a|v|가");
    expect(k).toContain("subtitle:");
    expect(k.endsWith("a|v|가")).toBe(true);   // 몸통은 그대로
  });
});

describe("isSubtitleOnlyStale — 자막만 바뀌었는가", () => {
  const project = (settings, of) => ({
    settings,
    cuts: [{ audio: { url: "a" }, video: { url: "v", of: "img|3|천천히" }, sentence: "가",
             image: { url: "i" } }],
    render: { of },
  });

  it("자막 설정만 바뀌었으면 참이다 — 클립을 다시 사지 않는다", () => {
    const p = project({ subtitle: { ...DEFAULT_SUBTITLE, size: 1.4 } }, "a|v|가");
    expect(isRenderStale(p)).toBe(true);
    expect(isSubtitleOnlyStale(p)).toBe(true);
  });

  it("문장이 바뀌었으면 거짓이다 — 더 큰 사실이 있다", () => {
    const p = project({ subtitle: { ...DEFAULT_SUBTITLE } }, "a|v|옛문장");
    expect(isSubtitleOnlyStale(p)).toBe(false);
  });

  it("낡지 않았으면 거짓이다", () => {
    const p = project({ subtitle: { ...DEFAULT_SUBTITLE } }, "a|v|가");
    expect(isSubtitleOnlyStale(p)).toBe(false);
  });
});
```

★ `isRenderStale`·`DEFAULT_SUBTITLE` import 를 상단에 더하라.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: FAIL

- [ ] **Step 3: 구현한다**

```js
// 자막 설정을 각인 머리에 한 줄로 둔다. 본문 줄은 언제나 "소리|클립|문장" 꼴이라 섞이지 않는다.
//
// ⚠️ **기본 설정이면 아무것도 안 붙인다.** 붙이면 이미 만든 완성본의 각인이 전부 불일치가
//    되어 픽셀이 같은 mp4 를 다시 굽게 된다 — 옛 subtitle_position 이 같은 이유로
//    기본값일 때 머리를 안 붙였다.
function subtitleHead(project) {
  const raw = project?.settings?.subtitle;
  if (!raw) {
    // 옛 필드 — 그대로 읽는다. 이것이 있어야 옛 프로젝트의 각인이 안 바뀐다.
    const pos = project?.settings?.subtitle_position;
    return pos && pos !== DEFAULT_SUBTITLE_POSITION ? pos : null;
  }
  const s = normalizeSubtitle(raw);
  const isDefault = JSON.stringify(s) === JSON.stringify(normalizeSubtitle(DEFAULT_SUBTITLE));
  return isDefault ? null : `subtitle:${JSON.stringify(s)}`;
}
```

`renderKey` 가 그 머리를 붙이고, `renderKeyBody` 가 **두 모양을 다 떼게** 한다:

```js
function renderKeyBody(key) {
  const s = key || "";
  const nl = s.indexOf("\n");
  if (nl === -1) return s;
  const head = s.slice(0, nl);
  // 옛 모양(위치 낱말)과 새 모양(subtitle:{…}) 둘 다 뗀다
  if (SUBTITLE_POSITIONS.includes(head) || head.startsWith("subtitle:")) return s.slice(nl + 1);
  return s;
}
```

`isSubtitlePositionOnlyStale` 의 본문은 그대로 두고 이름만 `isSubtitleOnlyStale` 로 바꾼 뒤, **옛 이름을 별칭으로 export** 한다(호출처를 한 번에 못 고칠 수 있다):

```js
export const isSubtitlePositionOnlyStale = isSubtitleOnlyStale;
```

★ 호출처를 세어라: `grep -rn "isSubtitlePositionOnlyStale" lib/ app/ tests/`

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: PASS 전부

- [ ] **Step 5: ★ 옛 각인 보존을 변이로 확인한다**

`isDefault ? null : …` 를 잠깐 `` `subtitle:${JSON.stringify(s)}` `` 로 바꾸고(항상 붙이게) 돌린다.
Expected: "기본 설정이면 각인이 지금과 글자 그대로 같다" 가 FAIL. 확인했으면 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add lib/steps.js tests/steps.test.js
git commit -m "feat(subtitle): 각인이 자막 설정을 안다 — 기본값이면 안 붙인다

★ 기본 설정이면 각인에 아무것도 안 붙인다. 붙이면 이미 만든 완성본이 전부 낡아 픽셀이
같은 mp4 를 다시 굽게 된다 — 옛 subtitle_position 이 같은 이유로 그랬다.

옛 각인(위치 낱말 머리)도 계속 읽힌다. 자막만 바뀌면 클립·그림은 낡지 않는다."
```

---

### Task 5: 합성이 원본과 완성본을 나눈다

**Files:**
- Modify: `lib/compose.js`
- Test: `tests/compose.test.js`

**Interfaces:**
- Consumes: Task 3 의 `toAss(cues, { width, height, subtitle })`
- Produces: `composeVideo` 가 `{ url, rawUrl, seconds }` 를 돌려준다 · `burnSubtitles({ projectId, subtitle, ... })`

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
describe("원본과 완성본을 나눈다", () => {
  it("자막 없는 원본도 함께 올린다", async () => {
    const put = vi.fn(async () => {});
    const r = await composeVideo({ ...deps, projectId: "p1", cuts: CUTS, putObjectImpl: put });
    const keys = put.mock.calls.map((c) => c[1]);
    expect(keys).toContain("p1.mp4");
    expect(keys).toContain("p1-raw.mp4");
    expect(r.rawUrl).toBe("/api/renders/p1-raw.mp4");
    expect(r.url).toBe("/api/renders/p1.mp4");   // ★ 완성본 URL 은 안 바뀐다
  });

  it("자막만 다시 굽는다 — 클립을 안 받는다", async () => {
    const download = vi.fn(async (url, p) => p);
    const put = vi.fn(async () => {});
    await burnSubtitles({
      ...deps, projectId: "p1", cuts: CUTS, subtitle: { color: "#FF0000" },
      downloadImpl: download, putObjectImpl: put,
    });
    // 원본 하나만 받는다(클립·소리를 다시 안 받는다)
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][0]).toContain("p1-raw.mp4");
    expect(put.mock.calls.map((c) => c[1])).toEqual(["p1.mp4"]);
  });
});
```

★ `deps`·`CUTS` 는 그 파일이 이미 쓰는 이름을 따르라.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/compose.test.js`
Expected: FAIL

- [ ] **Step 3: 구현한다**

`composeVideo` 의 조립 단계를 둘로 나눈다:

```js
    // 3) 자막 없는 원본을 먼저 만든다.
    //
    // ★ 원본이 있어야 사장님이 자막을 고칠 수 있다 — 지금 완성본에는 자막이 구워져 있어
    // 그 위에 미리보기를 얹으면 옛 자막과 새 자막이 둘 다 보인다.
    // 원본은 자막을 몇 번을 고쳐도 그대로라, 클립을 다시 살 일이 없다.
    const raw = path.join(dir, `${projectId}-raw.mp4`);
    await runFfmpeg(buildFfmpegArgs({ local, out: raw, width, height }));   // assPath 없음
    await putObjectImpl("renders", `${projectId}-raw.mp4`, await readFileImpl(raw), "video/mp4");

    // 4) 원본에 자막을 굽는다
    const out = path.join(dir, `${projectId}.mp4`);
    await runFfmpeg(burnArgs({ raw, assPath, out }));
    await putObjectImpl("renders", `${projectId}.mp4`, await readFileImpl(out), "video/mp4");
```

`buildFfmpegArgs` 가 `assPath` 없이도 돌게 한다(자막 필터를 안 건다). **자막이 있을 때의 동작은 한 글자도 바꾸지 마라** — 옛 테스트가 그것을 잰다.

`burnArgs` 는 원본 하나를 입력으로 받아 자막만 건다:

```js
// 원본에 자막만 굽는다 — 클립을 다시 받지 않으므로 전체 합성보다 훨씬 싸다.
export function burnArgs({ raw, assPath, out }) {
  const fontsdir = ...;   // 지금 것과 같은 계산
  return ["-y", "-i", raw, "-vf", `subtitles='${esc(assPath)}':fontsdir='${fontsdir}'`,
          "-c:a", "copy", out];
}
```

`burnSubtitles` 는 원본을 내려받아 `burnArgs` 를 돌리고 완성본만 올린다.

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run tests/compose.test.js`
Expected: PASS 전부

- [ ] **Step 5: 커밋**

```bash
git add lib/compose.js tests/compose.test.js
git commit -m "feat(subtitle): 원본과 완성본을 나눈다 — 자막만 다시 굽는다

원본(자막 없음)이 있어야 사장님이 자막을 고칠 수 있다. 지금 완성본에는 자막이 구워져
있어 그 위에 미리보기를 얹으면 옛 자막과 새 자막이 둘 다 보인다.

자막만 굽는 것은 원본 하나를 입력으로 받아 필터만 거는 일이라 클립을 다시 안 받는다.
완성본 URL 은 안 바뀐다."
```

---

### Task 6: ⑥완성 화면 — 드래그와 컨트롤

**Files:**
- Modify: `app/create/[id]/done/page.js`
- Test: `tests/subtitle-ui.test.js`(신규, 소스 정규식)

**Interfaces:**
- Consumes: Task 1 의 `SUBTITLE_FONTS`·`DEFAULT_SUBTITLE`·`normalizeSubtitle`·`outlineFor`

★ 이 저장소는 화면을 **소스 정규식**으로 잰다(`tests/staleness-ui.test.js`·`credits-ui.test.js`). 같은 방식을 따르라.

- [ ] **Step 1: 지금 화면을 읽는다**

Run: `sed -n '1,140p' "app/create/[id]/done/page.js"`

완성본을 어떻게 재생하는지, `render`·`render_error` 를 어떻게 읽는지 확인하라. **아래를 그 파일의 실제 이름에 맞춰 쓰라.**

- [ ] **Step 2: 실패 테스트를 쓴다**

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const src = readFileSync("app/create/[id]/done/page.js", "utf8");

describe("⑥완성 — 자막 조절", () => {
  it("원본을 재생한다 — 자막 구운 것 위에 미리보기를 얹지 않는다", () => {
    expect(src).toMatch(/rawUrl|raw_url/);
  });

  it("가격표·설정을 화면이 손으로 적지 않는다", () => {
    expect(src).toMatch(/SUBTITLE_FONTS/);
    expect(src).toMatch(/DEFAULT_SUBTITLE|normalizeSubtitle/);
  });

  it("외곽선을 화면이 스스로 정하지 않는다 — 같은 규칙을 쓴다", () => {
    expect(src).toMatch(/outlineFor/);
  });

  it("드래그로 위치를 옮긴다", () => {
    expect(src).toMatch(/onPointerDown|onPointerMove/);
  });

  it("적용하면 다시 굽는다", () => {
    expect(src).toMatch(/subtitle/);
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run tests/subtitle-ui.test.js`
Expected: FAIL

- [ ] **Step 4: 화면을 만든다**

- 완성본 대신 **원본**(`project.render?.raw_url`)을 `<video>` 로 재생한다. 없으면(옛 프로젝트) 완성본을 재생하고 조절 UI 를 숨긴다
- 영상 위에 자막을 절대 위치로 겹친다. 글자 크기는 **`lib/subtitles.js` 의 계산과 같은 비율**로 — 화면 폭 기준으로 환산한다
- 포인터 이벤트로 드래그해 `pos` 를 바꾸고 `clampPos` 로 되돌린다
- 폰트는 `SUBTITLE_FONTS` 의 `family` 를 `font-family` 에 그대로 쓴다.
  ★ **웹폰트 로드가 필요하다** — `assets/` 의 파일은 브라우저가 못 읽는다. `public/` 로 복사하거나 `@font-face` 로 API 라우트를 통해 내려주는 방법이 있는데, **이 태스크에서 정하지 말고 컨트롤러에게 보고하라**(폰트 파일을 두 벌 두는 문제가 된다)
- 색은 `<input type="color">`, 크기는 `<input type="range" min="0.7" max="1.6" step="0.05">`
- [적용]이 `PATCH /api/projects/[id]` 로 `settings.subtitle` 을 저장한 뒤 자막 재굽기를 요청한다(Task 7 이 만든다)

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run tests/subtitle-ui.test.js`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add "app/create/[id]/done/page.js" tests/subtitle-ui.test.js
git commit -m "feat(subtitle): ⑥완성에서 자막을 드래그해 옮기고 폰트·색·크기를 고른다

원본(자막 없는 것)을 재생하고 그 위에 브라우저가 자막을 그린다 — 구워진 자막 위에
미리보기를 얹으면 자막이 둘로 보인다.

외곽선·되돌리기 규칙을 화면이 스스로 정하지 않는다. lib/subtitles.js 의 같은 함수를 쓴다."
```

---

### Task 7: 자막만 다시 굽는 길

**Files:**
- Create: `app/api/projects/[id]/subtitle/route.js`
- Modify: `lib/pipeline.js`(`runRenderPipeline` 또는 새 함수) · `app/api/projects/[id]/route.js`(설정 검증)
- Test: `tests/routes.test.js`

**Interfaces:**
- Consumes: Task 5 의 `burnSubtitles` · Task 1 의 `normalizeSubtitle`

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
describe("POST /api/projects/[id]/subtitle", () => {
  it("원본이 없으면 400 이다 — 먼저 완성본을 만들어야 한다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "가", photos: [] } });
    const res = await subtitlePOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
  });

  it("원본이 있으면 자막만 다시 굽는다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "가", photos: [] } });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj, render: { url: "/api/renders/x.mp4", raw_url: "/api/renders/x-raw.mp4", of: "..." },
    }));
    const res = await subtitlePOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
  });
});

describe("PATCH — 자막 설정", () => {
  it("모르는 값은 되돌려 저장한다 — 400 으로 막지 않는다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {}, material: { text: "가", photos: [] } });
    await PATCH(patchReq({ settings: { subtitle: { font: "코믹산스", size: 99, pos: [9, 9] } } }), ctx(p.id));
    const after = await getProject(p.id, OWNER);
    expect(after.settings.subtitle.font).toBe("basic");
    expect(after.settings.subtitle.size).toBe(1.6);
    expect(after.settings.subtitle.pos).toEqual([0.94, 0.94]);
  });
});
```

★ 자막 설정은 **400 으로 막지 않는다** — 닫힌 목록인 모델·길이와 다르다. 자막은 되돌려도 사장님이 잃는 것이 없고(다시 고르면 된다), 400 은 조절하다가 뜨면 성가시다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: FAIL

- [ ] **Step 3: 구현한다**

- `PATCH /api/projects/[id]` 가 `settings.subtitle` 을 `normalizeSubtitle` 로 되돌려 저장한다
- `POST /api/projects/[id]/subtitle` 이 원본 유무를 확인하고(`project.render?.raw_url`) 없으면 400, 있으면 백그라운드로 `burnSubtitles` 를 돌린 뒤 `render.url`·`render.of` 를 갱신한다
- **`/render` 라우트는 건드리지 마라** — 전체 합성은 그대로다

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run`
Expected: 전부 그린

- [ ] **Step 5: 커밋**

```bash
git add "app/api/projects/[id]/subtitle" "app/api/projects/[id]/route.js" lib/pipeline.js tests/
git commit -m "feat(subtitle): 자막만 다시 굽는 길

원본이 있으면 클립을 다시 받지 않고 자막만 굽는다. 원본이 없는 옛 프로젝트는 400 으로
알려 준다 — 전체 합성을 한 번 하면 원본이 생긴다.

자막 설정은 400 으로 막지 않고 되돌려 저장한다. 닫힌 목록인 모델·길이와 다르다 —
되돌려도 사장님이 잃는 것이 없고, 조절하다가 400 이 뜨면 성가시다."
```

---

## 되돌리는 법

- **Task 4(각인)만 되돌리면** 자막을 바꿔도 완성본이 안 낡는다 — 고친 자막이 반영 안 된다
- **Task 5(합성)를 되돌리면** 원본이 안 생겨 화면이 조절 UI 를 숨긴다(옛 프로젝트와 같은 취급)
- 가장 안전한 되돌리기는 **화면(Task 6)만 되돌리는 것** — 나머지는 값이 기본이면 지금과 같은 자막을 낸다
