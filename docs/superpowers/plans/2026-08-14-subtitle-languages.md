# 자막 언어(일본어·중국어) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사장님이 자막 언어를 한국어·일본어·중국어(간체) 중에 고르면, 컷 문장을 번역해 보여 주고 고칠 수 있게 한 뒤 그 글자로 자막을 굽는다.

**Architecture:** 언어는 **자막의 축이지 프로젝트의 축이 아니다.** 원고·낭독·클립은 이 값을 모르고, 자막을 굽는 자리에서만 읽는다. 번역은 컷에 붙는 파생물이고 각인(`of`)으로 낡음을 판정한다. 언어가 폰트를 정한다.

**Tech Stack:** 순수 JavaScript(ESM) · Next.js 15 App Router · vitest · ffmpeg(libass) · OpenAI(현재 `lib/llm.js` 는 gpt-4o)

**Spec:** `docs/superpowers/specs/2026-08-14-subtitle-languages-design.md`

## Global Constraints

- **한국어 프로젝트의 자막 출력은 지금과 글자 그대로 같아야 한다. 회귀 0.**
- **원고·낭독·클립을 건드리지 않는다.** 구조적 보장(비무음 컷의 `sentence` 를 이어붙이면 원고와 같다) 유지.
- **광고 경로(`lib/ad/*`)와 `AD_LANGS` 를 건드리지 않는다** — 그쪽은 소리의 언어, 이쪽은 글자의 언어다.
- 언어 목록은 `lib/subtitle-langs.js` **한 곳**에만. 폰트 대응도 한 곳에만.
- `lib/subtitles.js`·`lib/clauses.js`·`lib/subtitle-langs.js` 는 화면("use client")이 import 한다 — **`fs` 에 닿는 import 를 더하지 마라.**
- `git add -A` 금지(파일을 이름으로). `next.config.mjs` 커밋 금지.
- 유일한 관문은 `npx vitest run`. 화면 파일을 손대면 `SHOTFORM_DIST_DIR=.next-verify npx next build` 도.
- **유료 fal 호출 금지.** `tests/compose-live.test.js` 는 로컬 ffmpeg 라 0원 — 그것을 쓴다.
- ⚠️ **Windows 시스템 폰트(Meiryo·Yu Gothic·SimSun 등)를 저장소에 넣지 마라.** 재배포 라이선스가 없다.

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `assets/subtitle-ja.otf` · `assets/subtitle-zh.otf` | CJK 자막 폰트(OFL) | 1 |
| `lib/subtitle-langs.js` | 언어 목록 · 언어→폰트 대응 (신설, import 없음) | 1, 2 |
| `lib/subtitles.js` | 폭 계산(`WIDE`) · 줄바꿈 폴백 · ASS 폰트 선택 · 자막 텍스트 선택 | 2, 5 |
| `lib/translate.js` | 컷 문장 번역(LLM) (신설) | 3 |
| `app/api/projects/[id]/subtitle-lang/route.js` | 언어 저장 + 번역 실행 (신설) | 4 |
| `app/create/[id]/done/page.js` | 언어 선택 · 번역 검토·수정 | 6 |
| `lib/steps.js` | 자막 각인에 언어를 넣는다(낡음 판정) | 5 |

---

### Task 1: 폰트를 들이고, 실제로 덮는지 코드가 판정한다

**Files:**
- Create: `assets/subtitle-ja.otf` · `assets/subtitle-zh.otf`
- Create: `lib/subtitle-langs.js`
- Test: `tests/subtitle-fonts.test.js`

**Interfaces:**
- Produces: `SUBTITLE_LANGS` (배열) · `subtitleFontFor(langId) → { file, family }`

**★ 이 태스크가 이 계획의 관문이다.** 폰트가 없으면 나머지는 전부 두부를 굽는 코드다.

**폰트 조달 — 순서대로 시도한다:**
1. npm: `@fontsource/noto-sans-jp` · `@fontsource/noto-sans-sc` 에 **TTF/OTF 가 있는지** 확인.
   ⚠️ fontsource 는 woff2 만 담는 경우가 많고 **libass 는 woff2 를 못 읽는다.** 있으면 쓰고, 없으면 2번.
2. 공식 Noto CJK 릴리스에서 내려받는다(OFL, 재배포 가능):
   `https://github.com/notofonts/noto-cjk/releases` 의 `NotoSansJP-Regular.otf` · `NotoSansSC-Regular.otf`
3. **둘 다 안 되면 멈추고 BLOCKED 로 보고한다.** 시스템 폰트를 대신 쓰지 마라 — 라이선스가 없다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/subtitle-fonts.test.js` 를 새로 만든다. 이 저장소가 08-14 에 cmap 을 직접 읽어
"자막 폰트 셋 다 한자가 없다"를 알아낸 그 방법을 **테스트로 못 박는다** — 폰트 파일이
바뀌면 빨개진다.

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SUBTITLE_LANGS, subtitleFontFor } from "../lib/subtitle-langs.js";

// 폰트에 글리프가 없으면 ffmpeg 는 오류 없이 **두부(□)** 를 굽는다.
// 테스트가 그린인데 화면이 깨지는 것이 이 자리의 실패 방식이라, 코드가 판정한다.
function cmapCodes(buf) {
  const u16 = (o) => buf.readUInt16BE(o);
  const u32 = (o) => buf.readUInt32BE(o);
  let base = 0;
  if (u32(0) === 0x74746366) base = u32(12); // ttcf
  let cmapOff = 0;
  for (let i = 0; i < u16(base + 4); i++) {
    const rec = base + 12 + i * 16;
    if (buf.toString("latin1", rec, rec + 4) === "cmap") cmapOff = u32(rec + 8);
  }
  if (!cmapOff) return null;
  const subs = [];
  for (let i = 0; i < u16(cmapOff + 2); i++) {
    const r = cmapOff + 4 + i * 8;
    subs.push({ plat: u16(r), enc: u16(r + 2), off: cmapOff + u32(r + 4) });
  }
  const pick = subs.find((s) => s.plat === 3 && s.enc === 10)
    || subs.find((s) => s.plat === 3 && s.enc === 1) || subs.find((s) => s.plat === 0);
  if (!pick) return null;
  const fmt = u16(pick.off);
  const has = new Set();
  if (fmt === 4) {
    const segX2 = u16(pick.off + 6);
    const endO = pick.off + 14, startO = endO + segX2 + 2;
    for (let i = 0; i < segX2 / 2; i++) {
      const end = u16(endO + i * 2), start = u16(startO + i * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end && c !== 0x10000; c++) has.add(c);
    }
  } else if (fmt === 12) {
    for (let i = 0; i < u32(pick.off + 12); i++) {
      const g = pick.off + 16 + i * 12;
      const s = u32(g), e = u32(g + 4);
      for (let c = s; c <= e && c - s < 70000; c++) has.add(c);
    }
  } else return null;
  return has;
}

const NEED = {
  ko: [0xac00, 0xd7a3],                    // 가, 힣
  ja: [0x3042, 0x30a2, 0x6f22, 0x8a9e],    // あ, ア, 漢, 語
  zh: [0x56fd, 0x8f66, 0x8fd9, 0x6c49],    // 国, 车, 这, 汉
};

describe("자막 폰트가 그 언어를 실제로 덮는가", () => {
  for (const lang of ["ko", "ja", "zh"]) {
    it(`${lang} 폰트에 필요한 글자가 다 있다`, () => {
      const { file } = subtitleFontFor(lang);
      const set = cmapCodes(readFileSync(file));
      expect(set, `${file} cmap 파싱 실패`).toBeTruthy();
      for (const cp of NEED[lang]) {
        expect(set.has(cp), `${file} 에 U+${cp.toString(16)} 없음 — 두부가 된다`).toBe(true);
      }
    });
  }

  it("언어 목록과 폰트 대응이 짝이 맞는다", () => {
    for (const l of SUBTITLE_LANGS) {
      const f = subtitleFontFor(l.id);
      expect(f.file).toBeTruthy();
      expect(f.family).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitle-fonts.test.js`
Expected: FAIL — `lib/subtitle-langs.js` 가 없다.

- [ ] **Step 3: 폰트를 넣고 목록을 만든다**

폰트 두 개를 `assets/` 에 넣는다. **파일을 넣은 뒤 내부 이름을 확인한다** — ASS 의 `Fontname`
은 파일명이 아니라 **폰트 파일 내부 이름**이고, 어긋나면 ffmpeg 가 **조용히 기본 폰트로 굽는다**
(`lib/subtitles.js:394` 주석). `name` 테이블의 nameID 1(family) 을 읽어 확인하고 그 값을 적는다.

`lib/subtitle-langs.js` (⚠️ **import 를 두지 마라** — 화면이 그대로 읽는다):

```js
// 자막 언어 — **글자의 언어**다. 소리(나레이션·TTS·클립 발음)는 이 값을 모른다.
//
// ⚠️ lib/ad/options.js 의 AD_LANGS 와 합치지 마라. 그쪽은 **나레이션 언어**(소리)이고
//    이쪽은 자막 언어(글자)다. 뜻이 달라 합치면 한쪽을 바꿀 때 다른 쪽이 끌려간다.
export const SUBTITLE_LANGS = [
  { id: "ko", label: "한국어", line: "Korean" },
  { id: "ja", label: "일본어", line: "Japanese" },
  { id: "zh", label: "중국어(간체)", line: "Simplified Chinese" },
];

export const DEFAULT_SUBTITLE_LANG = "ko";

// ★ 언어가 폰트를 정한다. 일본어·중국어는 폰트가 한 벌뿐이라 스타일(기본·강조·부드럽게)을
//   고를 수 없다 — 화면이 그 언어에서 스타일 칩을 숨긴다.
// ★ family 는 **폰트 파일 내부 이름**이다(파일명이 아니다).
const LANG_FONTS = {
  ja: { file: "assets/subtitle-ja.otf", family: "Noto Sans JP" },
  zh: { file: "assets/subtitle-zh.otf", family: "Noto Sans SC" },
};

// 한국어는 스타일이 폰트를 정하므로 여기서 기본값만 돌려준다(lib/subtitles.js 의 SUBTITLE_FONTS).
export function subtitleFontFor(langId) {
  return LANG_FONTS[langId] || { file: "assets/subtitle-font.otf", family: "Pretendard" };
}

export function isSubtitleLang(id) {
  return SUBTITLE_LANGS.some((l) => l.id === id);
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 그린. cmap 테스트가 세 언어 다 통과해야 한다.

- [ ] **Step 5: 커밋**

```bash
git add assets/subtitle-ja.otf assets/subtitle-zh.otf lib/subtitle-langs.js tests/subtitle-fonts.test.js
git commit -m "feat(subtitle): CJK 자막 폰트를 들이고 덮는지 코드가 판정한다"
```

---

### Task 2: 공백 없는 언어에서도 폭과 줄바꿈이 맞는다

**Files:**
- Modify: `lib/subtitles.js` (`WIDE` · `breakTwoLines` · 자막 분할)
- Test: `tests/subtitles.test.js`

**Interfaces:**
- Consumes: 없음(순수 로직)
- Produces: 없음(기존 함수의 동작 확장)

**배경.** `WIDE` 의 `　-〿` 는 U+3000~303F 라 **가나(U+3040~30FF)가 범위 밖**이다 — 히라가나·
가타카나를 반각으로 세어 일본어 자막이 계산보다 넓어진다. 그리고 `breakTwoLines` 는
`matchAll(/\S+/g)` 로 토큰을 세고 `toks.length <= 1` 이면 그대로 반환하는데, **중국어는
띄어쓰기가 없어 늘 토큰 1개**다 — 줄이 안 나뉘고 화면을 넘친다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/subtitles.test.js` 에 추가:

```js
describe("공백 없는 언어의 폭과 줄바꿈", () => {
  // ★ WIDE 에 가나가 빠져 있었다(2026-08-14). 반각으로 세면 일본어가 계산보다 넓어져 넘친다.
  it("가나를 전각으로 센다", () => {
    expect(textUnits("あ")).toBe(1.0);
    expect(textUnits("ア")).toBe(1.0);
    expect(textUnits("漢")).toBe(1.0); // 한자는 원래 됐다 — 회귀 확인
    expect(textUnits("A")).toBe(0.5);  // 라틴은 그대로
  });

  // ★ 중국어는 공백이 없어 토큰이 늘 1개다 → 옛 코드는 통째로 반환해 화면을 넘겼다
  it("공백 없는 문장도 두 줄로 나눈다", () => {
    const zh = "这款跑车的设计线条非常流畅而且动力强劲令人印象深刻";
    const out = breakTwoLines(zh, 10);
    expect(out).toContain("\n");
    const [a, b] = out.split("\n");
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a + b).toBe(zh); // 글자를 잃지 않는다
  });

  it("일본어도 나눈다", () => {
    const ja = "このスポーツカーはとても速くてデザインも美しいです";
    const out = breakTwoLines(ja, 10);
    expect(out).toContain("\n");
    expect(out.replace("\n", "")).toBe(ja);
  });

  // 회귀 0 — 한국어는 지금 그대로 공백에서 나뉜다
  it("한국어는 지금처럼 공백에서 나눈다", () => {
    const ko = "이 스포츠카는 빠르고 역동적인 디자인으로 자유를 줍니다";
    const out = breakTwoLines(ko, 10);
    expect(out).toContain("\n");
    for (const line of out.split("\n")) expect(line.startsWith(" ")).toBe(false);
  });

  it("나눌 만큼 길지 않으면 그대로 둔다", () => {
    expect(breakTwoLines("짧다", 10)).toBe("짧다");
    expect(breakTwoLines("短", 10)).toBe("短");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js -t "공백 없는"`
Expected: FAIL — 가나가 0.5 로 세어지고, 중국어가 `\n` 없이 반환된다.

- [ ] **Step 3: 구현한다**

`WIDE` 에 가나를 더한다:

```js
// ⚠️ `　-〿` 는 U+3000~303F(CJK 기호)까지라 **가나(U+3040~30FF)가 빠져 있었다**(2026-08-14).
//    반각으로 세면 일본어 자막이 계산보다 넓어져 화면을 넘친다.
const WIDE = /[ᄀ-ᇿ㄰-㆏가-힯　-〿ぁ-ヿ一-鿿！-｠\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
```

`breakTwoLines` 에 **글자 단위 폴백**을 넣는다. 공백 경계가 없을 때만 쓰는 길이라
한국어 경로는 한 줄도 안 바뀐다:

```js
export function breakTwoLines(text, lineUnits) {
  const s = text || "";
  if (textUnits(s) <= lineUnits) return s;
  const toks = [...s.matchAll(/\S+/g)];
  // ★ 공백 경계가 없으면(중국어·일본어) 글자 사이에서 가른다.
  //   옛 코드는 여기서 통째로 반환해 자막이 한 줄로 화면을 넘쳤다.
  const cuts = toks.length > 1
    ? toks.slice(1).map((t) => t.index)
    : [...s].reduce((acc, ch, i) => (i > 0 ? (acc.push(i), acc) : acc), []);
  if (!cuts.length) return s;
  let best = null, bestDiff = Infinity;
  for (const at of cuts) {
    const diff = Math.abs(textUnits(s.slice(0, at).trim()) - textUnits(s.slice(at).trim()));
    if (diff < bestDiff) { bestDiff = diff; best = at; }
  }
  return `${s.slice(0, best).trim()}\n${s.slice(best).trim()}`;
}
```

⚠️ **`[...s]` 로 순회한다** — `s[i]` 는 서로게이트 쌍(이모지·확장 한자)을 반으로 자른다.
위 코드의 인덱스는 `matchAll` 과 같은 자를 써야 하므로, 코드포인트 경계 배열을 만들 때
`[...s]` 로 세되 **슬라이스에 쓸 인덱스는 UTF-16 오프셋**이어야 한다. 구현할 때
`Array.from(s, (ch, i) => i)` 가 아니라 오프셋을 누적해 만든다:

```js
const offsets = [];
let off = 0;
for (const ch of s) { if (off > 0) offsets.push(off); off += ch.length; }
```

같은 폴백을 자막 조각 분할(`lib/subtitles.js` 의 `matchAll(/\S+/g)` 를 쓰는 나머지 두 자리,
:181·:253)에도 적용한다 — 한 자리만 고치면 컷이 길 때 조각이 안 나뉜다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 그린. **기존 자막 테스트가 하나라도 깨지면 회귀다** — 고치지 말고 보고한다.

- [ ] **Step 5: 커밋**

```bash
git add lib/subtitles.js tests/subtitles.test.js
git commit -m "fix(subtitle): 가나 폭과 공백 없는 언어의 줄바꿈"
```

---

### Task 3: 번역을 만들고 각인으로 낡음을 판정한다

**Files:**
- Create: `lib/translate.js`
- Test: `tests/translate.test.js`

**Interfaces:**
- Consumes: `callJson`(또는 `lib/llm.js` 가 export 하는 JSON 호출 헬퍼 — 파일을 열어 실제 이름을 확인한다)
- Produces: `buildTranslateMessages(cuts, lang) → { system, messages }` · `validateTranslation(obj, cutCount) → string[]|null` · `isSubtitleStale(cut, lang) → boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { describe, it, expect } from "vitest";
import { buildTranslateMessages, validateTranslation, isSubtitleStale } from "../lib/translate.js";

const cuts = [
  { idx: 0, sentence: "이 스포츠카는 빠릅니다." },
  { idx: 1, sentence: "디자인도 아름답습니다." },
];

describe("buildTranslateMessages", () => {
  it("컷 문장을 번호와 함께 싣고 목표 언어를 말한다", () => {
    const { system, messages } = buildTranslateMessages(cuts, "ja");
    expect(system).toContain("Japanese");
    const user = messages[0].content;
    expect(user).toContain("이 스포츠카는 빠릅니다.");
    expect(user).toContain("디자인도 아름답습니다.");
  });

  // ★ 자막은 화면에 박히는 글자다 — 길이가 넘치면 잘린다
  it("자막용이라는 것과 길이 제약을 지시한다", () => {
    const { system } = buildTranslateMessages(cuts, "zh");
    expect(system).toContain("자막");
    expect(system).toContain("Simplified Chinese");
  });

  it("모르는 언어는 던진다 — 조용히 한국어로 떨어지면 안 된다", () => {
    expect(() => buildTranslateMessages(cuts, "fr")).toThrow();
  });
});

describe("validateTranslation — 개수가 안 맞으면 통째로 버린다", () => {
  it("컷 수만큼 오면 받는다", () => {
    expect(validateTranslation({ lines: ["速い", "美しい"] }, 2)).toEqual(["速い", "美しい"]);
  });

  // 짝이 밀리면 엉뚱한 컷에 엉뚱한 자막이 붙는다 — 개수가 다르면 통째로 버린다
  it("개수가 다르면 null", () => {
    expect(validateTranslation({ lines: ["速い"] }, 2)).toBe(null);
    expect(validateTranslation({ lines: ["a", "b", "c"] }, 2)).toBe(null);
  });

  it("빈 줄이 섞이면 null", () => {
    expect(validateTranslation({ lines: ["速い", "  "] }, 2)).toBe(null);
    expect(validateTranslation(null, 2)).toBe(null);
  });
});

describe("isSubtitleStale — 각인으로 판정한다", () => {
  it("원고를 고치면 번역이 낡는다", () => {
    const cut = { sentence: "고친 문장입니다.", subtitles: { ja: { text: "速い", of: "옛 문장입니다." } } };
    expect(isSubtitleStale(cut, "ja")).toBe(true);
  });

  it("각인이 맞으면 안 낡았다", () => {
    const cut = { sentence: "그대로입니다.", subtitles: { ja: { text: "速い", of: "그대로입니다." } } };
    expect(isSubtitleStale(cut, "ja")).toBe(false);
  });

  it("번역이 아예 없으면 낡은 것으로 본다 — 만들어야 한다", () => {
    expect(isSubtitleStale({ sentence: "가.", subtitles: {} }, "ja")).toBe(true);
  });

  it("한국어는 번역이 없어도 안 낡았다 — 원문이 곧 자막이다", () => {
    expect(isSubtitleStale({ sentence: "가." }, "ko")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/translate.test.js`
Expected: FAIL — `lib/translate.js` 가 없다.

- [ ] **Step 3: 구현한다**

`lib/translate.js` 를 만든다. 지문의 요지:

```
너는 짧은 영상의 자막을 옮기는 번역가다. 출력은 JSON 하나: {"lines": ["...", ...]}
규칙:
- 줄 수는 받은 문장 수와 **정확히 같아야 한다**. 합치거나 나누지 마라 — 컷마다 화면에 뜨는 자막이다.
- 자막이다. 화면에 박히는 글자라 **짧고 읽기 쉬워야 한다**. 원문보다 길어지지 않게 한다.
- 제품명·브랜드·수치·단위는 **그대로 둔다**. 옮기면 사실이 달라진다.
- 설명을 더하지 않는다. 원문에 없는 말을 넣지 않는다.
- 문장 부호는 그 언어의 관습을 따른다(중국어 。，, 일본어 。、).
```

`validateTranslation` 은 이 저장소의 `validateShows` 와 같은 모양이다 — **개수가 안 맞으면
통째로 버린다**(짝이 밀리면 엉뚱한 컷에 엉뚱한 자막이 붙는다).

`isSubtitleStale(cut, lang)`: `lang === "ko"` 면 `false`. 아니면
`cut?.subtitles?.[lang]?.of !== cut?.sentence`.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`

- [ ] **Step 5: 커밋**

```bash
git add lib/translate.js tests/translate.test.js
git commit -m "feat(subtitle): 자막 번역과 각인 낡음 판정"
```

---

### Task 4: 언어를 저장하고 번역을 실행하는 라우트

**Files:**
- Create: `app/api/projects/[id]/subtitle-lang/route.js`
- Test: `tests/routes.test.js` (기존 파일에 describe 추가)

**Interfaces:**
- Consumes: Task 3 의 `buildTranslateMessages`·`validateTranslation`·`isSubtitleStale` · `isSubtitleLang`(Task 1)
- Produces: `POST /api/projects/[id]/subtitle-lang` — body `{ lang }`, 저장 후 낡은 컷만 번역

**⚠️ 기존 라우트를 먼저 읽어라.** `app/api/projects/[id]/subtitle/route.js` 가 이미 자막 설정을
저장한다. 그 파일의 `withUser` 사용법·`updateProject` 호출 모양·에러 처리를 그대로 따른다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/routes.test.js` 에 추가한다(그 파일의 기존 라우트 테스트 패턴을 그대로 쓴다 — 가짜
`deps` 주입 방식을 파일에서 확인할 것):

```js
describe("POST /subtitle-lang", () => {
  it("모르는 언어는 400 — 조용히 저장되면 안 된다", async () => { /* 위 패턴대로 */ });

  it("한국어를 고르면 번역을 안 부른다 — 원문이 곧 자막이다", async () => {
    // llm 가짜를 주입하고 호출 횟수 0 을 단정
  });

  // ★ 값이 나가는 자리다. 이미 번역이 있고 각인이 맞으면 다시 안 부른다.
  it("각인이 맞는 컷은 다시 번역하지 않는다", async () => {
    // 컷 2개 중 1개만 낡게 두고, LLM 에 넘어간 문장이 그 하나뿐인지 단정
  });

  it("개수가 안 맞는 응답은 통째로 버리고 저장하지 않는다", async () => {
    // validateTranslation null → 컷의 subtitles 가 안 바뀐다
  });

  it("성공하면 컷마다 text 와 of 가 찍힌다", async () => {
    // of === cut.sentence
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/routes.test.js -t "subtitle-lang"`
Expected: FAIL — 라우트가 없다.

- [ ] **Step 3: 구현한다**

- `isSubtitleLang(lang)` 이 false 면 **400**
- `settings.subtitle_lang` 를 저장한다
- `lang === "ko"` 면 번역하지 않고 끝낸다
- `isSubtitleStale(cut, lang)` 인 컷만 모아 한 번에 번역한다(컷마다 부르지 않는다 — 호출 수가 곧 값이다)
- `validateTranslation` 이 null 이면 **저장하지 않고** 오류를 돌려준다
- 성공하면 컷마다 `subtitles[lang] = { text, of: cut.sentence }`
- ⚠️ 무음 컷(`cut.silent`)은 문장이 없다 — **번역 대상에서 뺀다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`

- [ ] **Step 5: 커밋**

```bash
git add "app/api/projects/[id]/subtitle-lang/route.js" tests/routes.test.js
git commit -m "feat(subtitle): 자막 언어 저장과 번역 실행"
```

---

### Task 5: 자막이 그 언어로 구워진다

**Files:**
- Modify: `lib/subtitles.js` (`buildCues` 의 텍스트 선택 · ASS 스타일의 `Fontname`)
- Modify: `lib/compose.js`(폰트 파일 경로를 넘기는 자리 — **그 파일에서 확인할 것**)
- Modify: `lib/steps.js` (자막 각인에 언어를 넣는다)
- Test: `tests/subtitles.test.js` · `tests/steps.test.js`

**Interfaces:**
- Consumes: `subtitleFontFor(lang)`(Task 1) · `cut.subtitles[lang].text`(Task 3)
- Produces: 자막 텍스트·폰트가 언어를 따른다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
it("언어를 주면 그 번역으로 자막을 만든다", () => {
  const cuts = [{ idx: 0, sentence: "빠릅니다.", spoken_seconds: 2, seconds: 5,
                  subtitles: { ja: { text: "速いです。", of: "빠릅니다." } } }];
  expect(buildCues(cuts, { lang: "ja" })[0].text).toBe("速いです。");
});

it("한국어는 원문을 쓴다 — 회귀 0", () => {
  const cuts = [{ idx: 0, sentence: "빠릅니다.", spoken_seconds: 2, seconds: 5 }];
  expect(buildCues(cuts, { lang: "ko" })[0].text).toBe("빠릅니다.");
  expect(buildCues(cuts)[0].text).toBe("빠릅니다."); // 안 주면 지금 그대로
});

// ★ 번역이 낡았으면 옛 글자를 구우면 안 된다
it("각인이 어긋난 번역은 쓰지 않고 원문으로 떨어진다", () => {
  const cuts = [{ idx: 0, sentence: "고쳤습니다.", spoken_seconds: 2, seconds: 5,
                  subtitles: { ja: { text: "速いです。", of: "옛 문장." } } }];
  expect(buildCues(cuts, { lang: "ja" })[0].text).toBe("고쳤습니다.");
});

it("ASS 스타일이 언어의 폰트 이름을 쓴다", () => {
  const ass = toAss([], { width: 1080, height: 1920, lang: "ja" });
  expect(ass).toContain("Noto Sans JP");
});

// 자막 각인에 언어가 들어가야 언어를 바꿨을 때 완성본이 낡는다
it("언어를 바꾸면 완성본이 낡는다", () => {
  const a = { settings: { subtitle_lang: "ko" } };
  const b = { settings: { subtitle_lang: "ja" } };
  expect(subtitleStamp(a)).not.toBe(subtitleStamp(b));
});
```

⚠️ `subtitleStamp` 는 `lib/steps.js:182-193` 의 실제 함수 이름으로 바꾼다(파일에서 확인).

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js tests/steps.test.js`

- [ ] **Step 3: 구현한다**

- `buildCues(cuts, opts)` 의 텍스트 선택을 함수로 뽑는다:
  ```js
  // ★ 낡은 번역은 쓰지 않는다 — 원고를 고쳤는데 옛 글자를 구우면 화면과 말이 어긋난다.
  //   그때는 원문(한국어)으로 떨어진다. 두부보다 낫고, 화면이 "다시 번역" 을 띄운다.
  function subtitleTextFor(cut, lang) {
    if (!lang || lang === "ko") return (cut.sentence || "").trim();
    const t = cut?.subtitles?.[lang];
    return t && t.of === cut.sentence ? (t.text || "").trim() : (cut.sentence || "").trim();
  }
  ```
- `toAss` 의 `Fontname` 이 `lang` 을 보게 한다. **한국어일 때만** `SUBTITLE_FONTS` 의 스타일을 쓴다
- 합성이 ffmpeg 에 넘기는 **폰트 파일 경로**도 언어를 따라야 한다 — `lib/compose.js` 에서
  자막 폰트를 넘기는 자리를 찾아 `subtitleFontFor(lang).file` 로 바꾼다.
  ⚠️ 이걸 빠뜨리면 ASS 이름만 바뀌고 파일은 한국어 폰트라 **두부가 나온다**
- `lib/steps.js` 의 자막 각인에 `subtitle_lang` 을 넣는다

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`

- [ ] **Step 5: 커밋**

```bash
git add lib/subtitles.js lib/compose.js lib/steps.js tests/subtitles.test.js tests/steps.test.js
git commit -m "feat(subtitle): 자막 텍스트와 폰트가 언어를 따른다"
```

---

### Task 6: 화면 — 언어를 고르고 번역을 검토한다

**Files:**
- Modify: `app/create/[id]/done/page.js`
- Test: `tests/*-ui.test.js` (그 저장소의 화면 계약 테스트 파일에 맞춰 추가)

**⚠️ 이 저장소의 화면 테스트는 소스 문자열을 훑는다 — 문법이 깨진 파일을 못 잡는다.**
그래서 이 태스크는 `SHOTFORM_DIST_DIR=.next-verify npx next build` 가 **필수**다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

화면 계약을 단정한다: 언어 칩 3종이 있고, 일본어·중국어를 고르면 **자막 스타일 칩이 안 뜨고**,
번역이 낡았을 때 **다시 번역 버튼**이 뜬다.

- [ ] **Step 2: 실패를 확인한다**

- [ ] **Step 3: 구현한다**

- 자막 설정 자리에 언어 칩(한국어·일본어·중국어)을 놓는다
- 고르면 `POST /api/projects/[id]/subtitle-lang`
- 일본어·중국어에서는 **스타일 칩을 감춘다**(폰트가 한 벌이라 고를 것이 없다).
  ⚠️ 감추는 이유를 한 줄로 말한다 — 말없이 사라지면 고장으로 보인다
- 컷별로 원문과 번역을 나란히 보여 주고, 번역문을 **눌러서 고친다**
  (②대본 화면의 `contentEditable` 방식을 그대로 따른다). 고치면 `of` 를 지금 원문으로 다시 찍는다
- 번역이 낡은 컷은 표시하고 [다시 번역] 을 준다

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Run: `SHOTFORM_DIST_DIR=.next-verify npx next build`
Expected: 둘 다 통과.

- [ ] **Step 5: 커밋**

---

### Task 7: 실제로 구워서 **글자가 보이는지** 본다

**Files:**
- Modify: `tests/compose-live.test.js`

**★ 이 태스크가 이 계획의 판정이다.** 앞의 여섯이 다 그린이어도 두부가 나오면 실패다.
이 하네스는 로컬 ffmpeg 라 **0원**이다.

- [ ] **Step 1: 케이스를 더한다**

일본어·중국어 자막을 실제로 굽는다. 확인할 것:
1. ffmpeg 가 오류 없이 끝나는가
2. 출력 프레임에 **글자가 두부(□)가 아닌가** — 자막 영역의 픽셀 분포로 판정한다
   (두부는 같은 사각형이 반복되어 단순하다. 빈 화면과도 다르다)
3. 긴 문장이 **두 줄로 나뉘고 화면 폭 안에 있는가**

- [ ] **Step 2: 돌린다**

Run: `npx vitest run tests/compose-live.test.js`

- [ ] **Step 3: 눈으로 본다**

프레임을 파일로 뽑아 **사람이 본다.** 픽셀 판정이 통과해도 글자가 이상할 수 있다.
결과를 보고에 적고, 이상하면 멈추고 보고한다.

- [ ] **Step 4: 커밋**

---

### Task 8: 한국어 자막 폰트의 라이선스도 기록한다 — **사용자 지시로 추가**

> ★ 이 태스크는 계획에 없었다. Task 1 리뷰가 "기존 한국어 폰트 3종에 라이선스 기록이
> 저장소 어디에도 없다"를 확인했고, 사용자가 함께 넣으라고 지시했다(2026-08-14).

**Files:**
- Modify: `assets/SUBTITLE-FONTS-LICENSE-NOTE.md` (또는 필요하면 폰트별 파일 추가)
- Modify: `tests/subtitle-fonts.test.js`

**대상:** `assets/subtitle-font.otf`(Pretendard) · `assets/subtitle-impact.ttf`(Black Han Sans) ·
`assets/subtitle-soft.ttf`(Gowun Dodum) — 전부 이 저장소가 재배포하는 폰트인데 라이선스가 없다.

⚠️ **라이선스를 기억이나 짐작으로 적지 마라. 폰트 파일이 답을 갖고 있다.**
`name` 테이블의 **nameID 13(라이선스 설명)** 과 **nameID 14(라이선스 URL)** 을 읽어라.
Task 1 의 cmap 파서가 이미 `name` 테이블을 찾는 법을 보여 준다 — 같은 방식으로 파싱한다.
셋 다 그 필드가 비어 있으면 **거기서 멈추고 보고한다** — 출처를 모른 채 라이선스를 적는 것이
기록이 없는 것보다 나쁘다.

⚠️ **OFL 전문을 직접 타이핑하지 마라.** 이미 `assets/SUBTITLE-FONTS-LICENSE.txt` 에 OFL-1.1 이
있다(Task 1 이 내려받았다). 셋 다 OFL-1.1 로 확인되면 **그 파일이 다섯 폰트를 함께 덮는다**고
노트에 적으면 된다. 다른 라이선스가 나오면 그때는 그 라이선스 원문을 **내려받아** 넣는다.
(1차 시도가 전문을 타이핑하려다 콘텐츠 필터로 중단됐다.)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/subtitle-fonts.test.js` 에 추가한다 — 라이선스 기록이 **다섯 폰트 전부**를 덮는지 코드가 판정한다:

```js
import { readFileSync } from "node:fs";

// ★ 재배포하는 폰트는 라이선스를 동봉해야 한다(OFL-1.1 의 조건이다).
//   CJK 만 적어 두고 한국어 폰트를 빠뜨리면 "왜 절반만 있지"를 다음 사람이 다시 조사한다.
it("자막 폰트 다섯 개가 모두 라이선스 노트에 적혀 있다", () => {
  const note = readFileSync("assets/SUBTITLE-FONTS-LICENSE-NOTE.md", "utf8");
  for (const f of [
    "subtitle-font.otf", "subtitle-impact.ttf", "subtitle-soft.ttf",
    "subtitle-ja.otf", "subtitle-zh.otf",
  ]) {
    expect(note, `${f} 가 라이선스 노트에 없다`).toContain(f);
  }
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitle-fonts.test.js`
Expected: FAIL — 노트에 한국어 폰트 셋이 없다.

- [ ] **Step 3: 폰트에서 라이선스를 읽고 기록한다**

세 폰트의 `name` 테이블 nameID 13·14 를 읽어 **실제 값을 보고서에 그대로 적는다.**
그 값에 근거해 노트를 채운다: 파일명 · 폰트 이름 · 라이선스 · 출처(가능하면 URL).

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`

- [ ] **Step 5: 커밋**

```bash
git add assets/SUBTITLE-FONTS-LICENSE-NOTE.md tests/subtitle-fonts.test.js
git commit -m "docs(assets): 한국어 자막 폰트의 라이선스도 기록한다"
```

---

### Task 9: 미리보기가 CJK 를 예측 가능하게 그린다 — **사용자 지시로 추가**

> ★ Task 6 리뷰가 "미리보기는 OS 대체 폰트로 그린다"를 지적했고 사용자가 처리를 지시했다(2026-08-14).

**Files:**
- Modify: `lib/subtitle-langs.js` (`previewFontStackFor` 신설)
- Modify: `app/create/[id]/done/page.js` (미리보기 `fontFamily`)
- Test: `tests/subtitle-lang-ui.test.js` · `tests/subtitle-fonts.test.js` 중 맞는 자리

**★ 먼저 확인한 것 — 우려의 절반은 사실이 아니었다.**

리뷰는 "미리보기와 굽기의 **줄바꿈**이 어긋날 수 있다"고 했는데, 코드를 보니 **아니다**:

```js
// ★ 줄바꿈은 이미 lib 이 정했다(buildCues) — 여기서 폭을 걸어 **다시** 접으면 완성본과 다르다
whiteSpace: "pre",
```

줄바꿈은 `breakTwoLines` 가 정하고 미리보기는 `pre` 로 그대로 그린다. **미리보기와 굽기의 줄바꿈
지점은 같은 함수에서 나와 항상 같다.** 폰트가 달라 바뀌는 것은 **글자 모양뿐**이다.

→ 그래서 **Noto CJK 웹폰트(4.5~8.3MB)를 들이지 않는다.** 그 무게는 얻는 것에 비해 과하고,
서브셋 파이프라인이라는 별개 과제를 끌고 온다.

**대신 하는 것: 언어별 시스템 폰트 스택.** 내려받는 바이트가 **0** 이고, 브라우저의 임의 대체
대신 **우리가 고른 순서**로 고르게 한다. Noto CJK 가 깔린 기기에서는 **굽는 것과 같은 서체**가 뜬다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// ★ 미리보기는 ffmpeg 가 아니라 브라우저가 그린다 — cssFamily 축이 따로 있는 이유다.
//   일본어·중국어에는 그 항목이 없어 브라우저 임의 대체에 맡겨져 있었다(Task 6 리뷰).
//   웹폰트를 들이지 않는 이유는 계획에 적혀 있다: 줄바꿈은 이미 같고, 무게가 과하다.
describe("previewFontStackFor — 미리보기의 CJK 서체", () => {
  it("한국어는 지금 쓰던 자막 폰트 이름을 그대로 돌려준다 — 회귀 0", () => {
    expect(previewFontStackFor("ko", "Pretendard Subtitle")).toBe("Pretendard Subtitle");
  });

  it("일본어·중국어는 그 언어를 그릴 수 있는 스택을 준다", () => {
    const ja = previewFontStackFor("ja");
    const zh = previewFontStackFor("zh");
    // 굽는 폰트를 맨 앞에 둔다 — 깔려 있으면 완성본과 같은 서체가 보인다
    expect(ja).toContain("Noto Sans JP");
    expect(zh).toContain("Noto Sans SC");
    // 없을 때를 대비한 시스템 후보가 뒤에 있다
    expect(ja.split(",").length).toBeGreaterThan(2);
    expect(zh.split(",").length).toBeGreaterThan(2);
    expect(ja).toMatch(/sans-serif\s*$/);
    expect(zh).toMatch(/sans-serif\s*$/);
    // 한국어 전용 서체를 앞에 두면 안 된다 — 한자가 없어 글자마다 대체가 튄다
    expect(ja).not.toContain("Black Han Sans");
    expect(zh).not.toContain("Black Han Sans");
  });

  it("모르는 언어는 한국어와 같게 떨어진다", () => {
    expect(previewFontStackFor("fr", "Pretendard Subtitle")).toBe("Pretendard Subtitle");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run -t "previewFontStackFor"`
Expected: FAIL — 함수가 없다.

- [ ] **Step 3: 구현한다**

`lib/subtitle-langs.js` 에 더한다(⚠️ **import 를 두지 마라** — 화면이 그대로 읽는다):

```js
// 미리보기(브라우저)가 쓸 글꼴 스택. **ffmpeg 가 쓰는 것과 다른 축이다** —
// 굽기는 파일을 읽고(subtitleFontFor), 미리보기는 브라우저가 이름으로 고른다.
//
// ★ 웹폰트를 안 쓴다. Noto CJK 는 4.5~8.3MB 라 화면 한 장에 지우기엔 무겁고,
//   **줄바꿈은 이미 미리보기와 굽기가 같다**(둘 다 breakTwoLines 가 정하고 화면은 pre 로 그린다).
//   달라지는 것은 글자 모양뿐이라 시스템 글꼴로 충분하다.
// ★ 굽는 폰트 이름을 맨 앞에 둔다 — 그 폰트가 깔린 기기에서는 완성본과 같은 서체가 보인다.
// ★ 한국어 자막 폰트를 앞에 두면 안 된다: 한자가 없어 글자마다 대체가 일어나 들쭉날쭉해진다.
const PREVIEW_STACKS = {
  ja: `"Noto Sans JP", "Hiragino Sans", "Yu Gothic", Meiryo, "MS PGothic", sans-serif`,
  zh: `"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", SimHei, sans-serif`,
};

export function previewFontStackFor(langId, koFamily) {
  return PREVIEW_STACKS[langId] || koFamily;
}
```

`app/create/[id]/done/page.js` 의 미리보기 `fontFamily` 를 `previewFontStackFor(lang, <지금 쓰던 cssFamily>)`
로 바꾼다. **한국어 경로는 지금 값이 그대로 나와야 한다.**

번역 검토 목록의 번역문에도 같은 스택을 쓴다 — 거기가 사장님이 실제로 읽는 자리다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Run: `SHOTFORM_DIST_DIR=.next-verify npx next build`

- [ ] **Step 5: 커밋**

```bash
git add lib/subtitle-langs.js "app/create/[id]/done/page.js" tests/subtitle-lang-ui.test.js
git commit -m "fix(subtitle-ui): 미리보기가 CJK 를 예측 가능한 글꼴로 그린다"
```

---

## 마무리

- wiki 반영(저장소 세션 마무리 규칙)
- ⚠️ **폰트가 배포 함수에 실리는지 확인할 것** — `outputFileTracingIncludes` 로 ffmpeg 를 실은 것과
  같은 종류의 함정이다(08-14 실측: postinstall 로 생기는 파일은 import 추적이 못 본다).
  `assets/` 가 이미 실리는지 `next.config.mjs` 와 08-14 배포 기록을 확인한다
- 후속 후보: 폰트 서브셋(파일이 크다) · 금칙 처리 · 번체 중국어·영어
