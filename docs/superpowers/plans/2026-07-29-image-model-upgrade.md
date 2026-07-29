# 이미지 모델 교체 + 후보 한 장 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nano-banana` → `nano-banana 2`로 올리고 컷당 후보를 2장에서 1장으로 줄인다 — 컷당 $0.08 그대로, 모델만 한 세대 위.

**Architecture:** 모델은 코드에 박지 않는다. `FAL_IMAGE_ENDPOINT` 한 줄로 갈아 끼우고 되돌린다. 후보가 하나가 되면 VLM은 "고르기"를 잃고 합격·불합격만 남는다. 좋아졌는지는 **사장님이 눈으로 판정**하고, 그러려면 같은 컷을 두 모델로 만들어 나란히 놓는 측정 스크립트가 필요하다.

**Tech Stack:** Next.js 15 App Router, fal.ai, OpenAI(gpt-4o vision), vitest

설계 문서: `docs/superpowers/specs/2026-07-29-image-model-upgrade-design.md` (커밋 `aff196f`)

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다.** 커밋 직전 `git rev-parse --abbrev-ref HEAD`로 브랜치도 확인한다
- 기존 테스트 **506개 그린이 하한선**
- **Task 1~3은 유료 API를 한 번도 부르지 않는다.** 실제 비교(Task 4)는 **사장님 승인 게이트**다
- **모델 이름을 코드에 박지 않는다** — `lib/imagegen.js`의 `FAL_IMAGE_ENDPOINT` 기본값 외에는 어디에도 넣지 않는다
- **`.env.local`을 고치지 않는다.** 채택이 결정된 뒤에 바꾼다 — 미리 바꾸면 비교 대상이던 옛 모델이 사라진다
- Korean 문구는 사장님이 읽는 말로. 커밋 메시지는 한국어, 기존 이력의 어조
- **테스트를 통과시키려고 프로덕션 코드를 맞추지 않는다.** 반대도 마찬가지다. 테스트를 지우거나 skip 하지 않는다
- `npm run build`를 돌리지 않는다 — dev 서버가 3000번에 떠 있고 `.next`가 겹쳐 죽는다

---

## File Structure

**수정**
- `lib/costs.js` — `PRICE_TABLE`에 `fal-ai/nano-banana-2` 한 줄 (Task 1)
- `lib/pipeline.js` — `processCut`이 후보를 하나만 만든다 (Task 2)
- `lib/vlm.js` — 프롬프트를 "한 장 검수"로, 스키마에서 `selectedIndex` 제거 (Task 2)
- `lib/cuts.js` · `lib/script.js` · `lib/cast.js` — import 에 `.js` 확장자 (Task 3)
- `.env.local.example` — 새 모델을 주석으로 안내 (Task 3)
- **신설** `scripts/measure/compare-image-models.mjs` (Task 3)
- `tests/costs.test.js` · `tests/pipeline.test.js` · `tests/vlm.test.js`

**건드리지 않음**
- `lib/imagegen.js` — `base` + `/edit` 조립이 이미 맞다
- `lib/cuts.js`의 `buildImagePrompt` 본문 · `lib/refs.js` · `lib/clip-limits.js`
- `.env.local` (저장소에 없다. 채택 뒤 사장님이 바꾼다)

---

## Task 1: 단가표에 새 모델을 넣는다

이것이 먼저다. 뒤 태스크가 fal 을 부르면 잘못된 값으로 기록되고, 예산 가드도 잘못 잰다.

**Files:**
- Modify: `lib/costs.js` (`PRICE_TABLE`)
- Test: `tests/costs.test.js`

**Interfaces:**
- Produces: `estimateCost("fal-ai/nano-banana-2/edit", 1)` → `0.08`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/costs.test.js` 파일 끝에 더한다. 이 파일은 이미 `estimateCost` 를 import 하고 있고,
머리말이 *"단가표는 prefix 매칭이라 '순서'가 곧 로직이다"* 라고 적고 있다 — 바로 그 자리다.
**import 를 새로 추가할 필요가 없다.**

```js
describe("이미지 모델 단가 — prefix 순서가 뒤집히면 조용히 틀린다", () => {
  it("nano-banana 2 는 장당 $0.08 이다", () => {
    expect(estimateCost("fal-ai/nano-banana-2", 1)).toBeCloseTo(0.08, 4);
    expect(estimateCost("fal-ai/nano-banana-2/edit", 1)).toBeCloseTo(0.08, 4);
  });

  it("옛 nano-banana 는 여전히 장당 $0.04 다", () => {
    expect(estimateCost("fal-ai/nano-banana", 1)).toBeCloseTo(0.04, 4);
    expect(estimateCost("fal-ai/nano-banana/edit", 1)).toBeCloseTo(0.04, 4);
  });

  it("컷당 한 장이면 컷당 $0.08 이다", () => {
    // 예전에는 후보 2장 × $0.04 = $0.08 이었다. 모델을 올리고 장수를 줄여 같은 값이 된다.
    expect(estimateCost("fal-ai/nano-banana-2/edit", 1)).toBeCloseTo(
      estimateCost("fal-ai/nano-banana/edit", 2), 4
    );
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/costs.test.js`
Expected: FAIL — `nano-banana-2` 가 기존 `fal-ai/nano-banana` 줄에 걸려 `0.04` 를 준다

- [ ] **Step 3: `PRICE_TABLE` 에 줄을 더한다**

`lib/costs.js` 의 이미지 항목을 이렇게 바꾼다. **새 줄이 기존 줄보다 위에 있어야 한다** —
`PRICE_TABLE` 은 prefix 매칭이고 `"fal-ai/nano-banana"` 가 `"fal-ai/nano-banana-2"` 도 삼킨다
(파일 위쪽 주석: *"더 구체적인 prefix를 위에 둘 것"*, `ltx-2.3`/`ltx-2` 가 같은 이유로 정렬돼 있다):

```js
  // 이미지 — 장당. "fal-ai/nano-banana/edit"(레퍼런스 사진이 있을 때)도 이 prefix 에 걸린다.
  //
  // 구글 직접 요금은 토큰 과금이다(nano-banana-2-lite 기준 이미지 출력 $37.50/1M —
  // 1024×1024 한 장이 1290토큰이면 ≈$0.048). 우리가 부르는 것은 fal 이고, fal 은 그것을
  // 장당 고정가로 재포장해 판다. 그래서 여기 값은 fal 의 장당 가격이다.
  //
  // ⚠️ nano-banana-2 를 위에 둔다 — "fal-ai/nano-banana" 가 "-2" 도 삼킨다.
  //    /edit 가 $0.08 인 것은 확인했고(2026-07-29) base 는 미확인이라 같은 값으로 둔다.
  //    과대 기록 쪽이 안전하다: 예산 가드가 보수적으로 돈다. 실제 호출 뒤 fal 대시보드와 대조한다.
  { prefix: "fal-ai/nano-banana-2", perSec: 0.08 },
  { prefix: "fal-ai/nano-banana", perSec: 0.04 },
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/costs.js tests/costs.test.js
git commit -m "feat: 단가표에 nano-banana 2 를 넣는다 — prefix 순서가 뒤집히면 조용히 틀린다

PRICE_TABLE 은 prefix 매칭이라 기존 fal-ai/nano-banana 줄이 nano-banana-2/edit 도 삼킨다.
그대로 두면 \$0.08 짜리가 \$0.04 로 절반만 기록된다. ltx-2.3/ltx-2 가 같은 이유로 정렬돼 있다.

base 가격은 미확인이라 /edit 와 같은 값으로 둔다. 과대 기록 쪽이 안전하다 — 예산 가드가
보수적으로 돈다. 실제 호출 뒤 대시보드와 대조한다.

순서가 뒤집혀도 아무도 모르던 자리라 회귀 테스트를 함께 넣었다."
```

---

## Task 2: 후보를 한 장으로 줄이고 VLM 문구를 고친다

**Files:**
- Modify: `lib/pipeline.js` (`processCut` 의 후보 생성)
- Modify: `lib/vlm.js` (`selectCandidate` 의 프롬프트와 반환)
- Test: `tests/pipeline.test.js`, `tests/vlm.test.js`

**Interfaces:**
- Produces: `selectCandidate(...)` → `{ selectedIndex: 0, passed, note }` — **`selectedIndex` 는 항상 0**.
  호출부(`candidates[verdict.selectedIndex]`)는 그대로 둔다

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 후보 한 장**

`tests/pipeline.test.js` 의 이미지 관련 describe 에 더한다:

```js
  it("컷마다 그림을 한 장만 만든다 — 후보 2장이던 것을 줄였다", async () => {
    const p = await makeProject();
    let calls = 0;
    const d = { ...deps(), genImage: async () => { calls += 1; return { url: "http://img/" + calls }; } };
    await runBoth(p.id, d);
    const saved = await projects.getProject(p.id);
    const aiCuts = saved.cuts.filter((c) => c.source === "ai").length;
    expect(calls).toBe(aiCuts);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: FAIL — `calls` 가 AI 컷 수의 두 배다

- [ ] **Step 3: `processCut` 이 한 장만 만들게 한다**

`lib/pipeline.js` 의 `processCut` 안, `const candidates = await Promise.all([...])` 를 바꾼다:

```js
      // 컷당 한 장. 예전에는 후보 2장을 뽑아 VLM 이 골랐는데, 모델을 한 세대 올리면서
      // 장수를 줄여 컷당 값을 그대로 뒀다($0.04×2 → $0.08×1).
      // 배열로 두는 이유는 검수(deps.select)와 아래 선택 코드를 그대로 쓰기 위해서다.
      const candidates = [
        await deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refs, projectId }),
      ];
```

`candidates[verdict.selectedIndex]` 는 **그대로 둔다** — `selectedIndex` 가 항상 0 이라 안전하다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: PASS

- [ ] **Step 5: 실패하는 테스트를 쓴다 — VLM 문구**

`tests/vlm.test.js` 의 `describe("selectCandidate 검수 기준", ...)` 안에 더한다.

이 파일에는 이미 헬퍼 둘이 있다 — `capturingFetch(store)`(보낸 body 를 붙잡는 가짜 OpenAI)와
`promptText(store)`(첫 텍스트 블록을 꺼낸다). **그것들을 쓴다.** `beforeEach` 가
`SHOTFORM_FAKE_IMAGES` 를 지우므로 가짜 모드 조기 반환은 일어나지 않는다.

```js
  it("고르라고 하지 않는다 — 후보가 한 장이라 고를 것이 없다", async () => {
    const store = {};
    const got = await selectCandidate({
      cut: { sentence: "문장." }, scene: { shows: "화면" },
      candidates: [{ url: "http://a" }], fetchImpl: capturingFetch(store), apiKey: "k",
    });
    expect(promptText(store), "스키마에 selectedIndex 가 남아 있다").not.toContain("selectedIndex");
    expect(got.selectedIndex, "호출부 호환을 위해 0 을 돌려준다").toBe(0);
    expect(got.passed).toBe(true);
  });

  it("불합격은 그대로 전한다 — 이것이 다시 만들기를 부르는 유일한 신호다", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ passed: false, note: "손가락 오류" }) } }] }),
    });
    const got = await selectCandidate({
      cut: { sentence: "문장." }, scene: { shows: "화면" },
      candidates: [{ url: "http://a" }], fetchImpl, apiKey: "k",
    });
    expect(got.passed).toBe(false);
    expect(got.note).toBe("손가락 오류");
  });
```

- [ ] **Step 6: 실패를 확인한다**

Run: `npx vitest run tests/vlm.test.js`
Expected: FAIL — 프롬프트에 `selectedIndex` 가 들어 있다

- [ ] **Step 7: `lib/vlm.js` 를 고친다**

파일 첫 줄 주석과 함수 위 주석을 바꾼다:

```js
// VLM 검수 — gpt-4o vision 으로 그림 한 장을 합격·불합격 판정한다.
//
// 예전에는 후보 2장 중 고르는 일도 했다. 모델을 한 세대 올리면서 컷당 한 장만 만들게 되어
// 고를 것이 없어졌다(2026-07-29). 함수 이름은 그대로 두었다 — 검수를 제대로 손볼 때 함께
// 정리한다. 지금 바꾸면 모델 교체의 효과를 재는 diff 가 커진다.
//
// ⚠️ 이 검수는 지금 사실상 아무것도 걸러내지 못하고 있다(통과율 100%·재시도 0회, 명백한
//    오류를 여섯 번 통과시켰다). 왜 그런지는 별도 과제다. 그럼에도 남기는 이유는
//    나쁜 그림을 걸러낼 유일한 장치이기 때문이다.
```

프롬프트의 JSON 스키마 줄을 바꾼다(`검수 기준:` 줄은 **그대로 둔다**):

```js
    { type: "text", text: `숏폼 컷 검수. 장면 설명: "${shows}"
이 이미지를 보고 JSON만 출력: {"passed":true|false,"note":"한국어 한 줄 사유"}
검수 기준: 장면 설명과 일치 / 신체·손가락 오류 / 이미지 안 글자 깨짐 / 거울·유리 반사가 실제와 어긋남(등지고 선 사람이 거울에 정면으로 비치는 등) / 그림자 방향이 빛과 어긋남${refImagePath ? " / 레퍼런스 피사체와 외형 일치" : ""}` },
```

반환을 바꾼다:

```js
  const out = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  // 후보가 한 장이라 고를 것이 없다. selectedIndex 는 호출부 호환을 위해 0 으로 고정한다.
  // passed 는 fail-open 이다 — 명시적 false 만 불합격으로 본다.
  return { selectedIndex: 0, passed: out.passed !== false, note: typeof out.note === "string" ? out.note : "" };
```

- [ ] **Step 8: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 9: 커밋**

```bash
git add lib/pipeline.js lib/vlm.js tests/pipeline.test.js tests/vlm.test.js
git commit -m "feat: 컷당 그림을 한 장만 만든다 — 검수는 고르기를 잃고 판정만 남는다

모델을 한 세대 올리면서 장수를 줄여 컷당 값을 그대로 뒀다(\$0.04×2 → \$0.08×1).

후보가 하나가 되면 고를 것이 없다. 스키마에서 selectedIndex 를 빼고 항상 0 을 돌려준다 —
모델에게 없는 선택을 시키지 않는다. 함수 이름(selectCandidate)은 그대로 두었다. 이번 변경은
A/B 비교를 위해 작고 되돌리기 쉬워야 한다.

검수는 남긴다. 지금 통과율이 100% 라 아무것도 못 거르지만, 나쁜 그림을 걸러낼 유일한
장치이고 왜 다 통과시키는지는 별도 과제다."
```

---

## Task 3: 두 모델을 나란히 놓는 측정 스크립트

**Files:**
- Modify: `lib/cuts.js` · `lib/script.js` · `lib/cast.js` (import 에 `.js` 확장자)
- Create: `scripts/measure/compare-image-models.mjs`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: `buildImagePrompt(cut, project, refs)` · `resolveCutRefs(cut, project)` · `avatarFile(id)`
- Produces: 실행하면 컷마다 두 URL 을 출력한다. **이 태스크에서는 실행하지 않는다**

- [ ] **Step 1: 순수 node 가 `lib/` 를 읽을 수 있게 한다**

지금은 못 읽는다. 확인:

```bash
node -e "import('./lib/cuts.js').then(()=>console.log('OK')).catch(e=>console.log('FAIL:',e.code))"
```
Expected: `FAIL: ERR_MODULE_NOT_FOUND` (`./script` 를 못 찾는다)

Next 와 vitest 는 확장자 없는 import 를 풀어 주지만 **순수 node 는 못 푼다.** 그래서 지금까지
측정 스크립트가 `lib/` 를 못 쓰고 HTTP 를 직접 불렀다(`scripts/measure/shows-motion-leak.mjs`
머리말에 그렇게 적혀 있다). 이번 스크립트는 `buildImagePrompt` 를 그대로 써야 한다 —
프롬프트를 베껴 쓰면 원본이 바뀔 때 조용히 어긋나 **엉뚱한 것을 비교하게 된다.**

아래 네 곳에 확장자를 붙인다. **다른 변경은 하지 않는다.**

- `lib/cuts.js` — `from "./script"` → `from "./script.js"`, `from "./clip-limits"` → `from "./clip-limits.js"`
- `lib/script.js` — `from "./synopsis"` → `from "./synopsis.js"`
- `lib/cast.js` — `from "./refs"` → `from "./refs.js"`

확인:

```bash
node -e "import('./lib/cuts.js').then(m=>console.log('OK', typeof m.buildImagePrompt)).catch(e=>console.log('FAIL:',e.code))"
node -e "import('./lib/cast.js').then(m=>console.log('OK', typeof m.resolveCutRefs)).catch(e=>console.log('FAIL:',e.code))"
```
Expected: 둘 다 `OK function`

- [ ] **Step 2: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS (확장자를 붙여도 vitest 는 그대로 푼다)

- [ ] **Step 3: 스크립트를 만든다**

`scripts/measure/compare-image-models.mjs`:

```js
// 같은 컷을 두 이미지 모델로 만들어 나란히 놓는다.
//
//   node scripts/measure/compare-image-models.mjs <projectId> [모델A] [모델B]
//   기본값: A=fal-ai/nano-banana (지금), B=fal-ai/nano-banana-2 (후보)
//
// ⚠️ 유료다. 컷당 A 한 장 + B 한 장이다(4컷이면 약 $0.48).
//    사장님 승인 없이 돌리지 않는다.
//
// 왜 저장된 프로젝트를 안 고치는가: 컷별 재생성을 쓰면 이미지가 덮여 비교 대상이 사라진다.
// 여기서는 URL 만 출력하고 프로젝트 파일은 읽기만 한다.
//
// 왜 프롬프트를 베끼지 않는가: buildImagePrompt 가 바뀌면 비교가 조용히 어긋난다.
// 그래서 lib 을 그대로 import 한다(그러려고 lib 의 import 에 확장자를 붙였다).
//
// 비용 기록(costs.json)에는 남기지 않는다 — lib/costs.js 를 끌어오면 의존이 커진다.
// 대시보드와 대조할 때 이 몫을 빼고 본다.
import { readFileSync } from "fs";
import path from "path";
import { buildImagePrompt } from "../../lib/cuts.js";
import { resolveCutRefs, avatarFile } from "../../lib/cast.js";

const [projectId, modelA = "fal-ai/nano-banana", modelB = "fal-ai/nano-banana-2"] = process.argv.slice(2);
if (!projectId) {
  console.error("사용법: node scripts/measure/compare-image-models.mjs <projectId> [모델A] [모델B]");
  process.exit(1);
}
if (!process.env.FAL_KEY) {
  console.error("FAL_KEY 가 없다. .env.local 의 값을 환경변수로 넣고 돌린다.");
  process.exit(1);
}

const DATA = process.env.SHOTFORM_DATA_DIR || "data";
const project = JSON.parse(readFileSync(path.join(DATA, "projects", `${projectId}.json`), "utf8"));

// lib/pipeline.js 의 uploadsPath 와 같은 규칙. 그 함수는 export 되지 않아 여기 세 줄을 둔다.
const uploadsPath = (url) => {
  const name = url?.split("/").pop();
  return name ? path.join(DATA, "uploads", name) : null;
};

async function generate(endpointBase, prompt, refs, aspect_ratio) {
  const endpoint = refs.length ? `${endpointBase}/edit` : endpointBase;
  const input = { prompt, aspect_ratio, num_images: 1 };
  if (refs.length) {
    input.image_urls = refs.map((r) => {
      const buf = readFileSync(r.path);
      const ext = r.path.split(".").pop();
      return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}`;
    });
  }
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { error: `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}` };
  const data = await res.json();
  return { url: data?.images?.[0]?.url || null, raw: Object.keys(data || {}) };
}

const aspect = project.settings?.aspect_ratio || "9:16";
console.log(`프로젝트 ${projectId} · 컷 ${(project.cuts || []).length}개 · ${aspect}`);
console.log(`A = ${modelA}\nB = ${modelB}\n`);

for (const cut of project.cuts || []) {
  if (cut.source === "photo") { console.log(`컷${cut.idx + 1} — 올린 사진 컷이라 건너뜀`); continue; }
  const refs = resolveCutRefs(cut, project)
    .map((r) => ({
      path: r.from === "photo"
        ? uploadsPath((project.material?.photos || []).find((p) => p.id === r.id)?.url)
        : avatarFile(r.id),
      kind: r.kind,
      who: r.who,
    }))
    .filter((r) => r.path);
  const prompt = buildImagePrompt(cut, project, refs);

  console.log(`\n━━ 컷${cut.idx + 1} · 레퍼런스 ${refs.length}장`);
  console.log(`   shows: ${cut.shows || "(없음)"}`);
  const a = await generate(modelA, prompt, refs, aspect);
  const b = await generate(modelB, prompt, refs, aspect);
  console.log(`   A: ${a.url || "실패 " + a.error}`);
  console.log(`   B: ${b.url || "실패 " + b.error}`);
}

console.log(`\n두 URL 을 나란히 열어 넷을 본다:`);
console.log(`  1. 제품이 레퍼런스와 같은 물건인가 (청록 띠·검정 캡·라벨 배치)`);
console.log(`  2. 인물 얼굴이 아바타와 같은 사람인가`);
console.log(`  3. 손·신체 오류가 있는가`);
console.log(`  4. shows 에 없는 사람이 덤으로 그려졌는가`);
console.log(`넷 중 셋 이상에서 B 가 낫거나 같으면 채택한다.`);
```

- [ ] **Step 4: 돌리지 않고 문법만 확인한다**

Run: `node --check scripts/measure/compare-image-models.mjs`
Expected: 출력 없음(문법 정상)

**절대 실행하지 마라.** 유료이고 승인 게이트는 Task 4 다.

- [ ] **Step 5: `.env.local.example` 에 안내를 더한다**

`FAL_IMAGE_ENDPOINT` 줄 근처에 주석을 더한다(값은 바꾸지 않는다):

```
# 이미지 모델. 비우면 fal-ai/nano-banana.
# 후보: fal-ai/nano-banana-2 (한 세대 위, 장당 $0.08 — 컷당 한 장이라 값은 같다)
# 비교: node scripts/measure/compare-image-models.mjs <projectId>
FAL_IMAGE_ENDPOINT=fal-ai/nano-banana
```

- [ ] **Step 6: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/cuts.js lib/script.js lib/cast.js scripts/measure/compare-image-models.mjs .env.local.example
git commit -m "feat: 두 이미지 모델을 나란히 놓는 측정 스크립트

같은 컷을 두 모델로 만들어 URL 을 나란히 출력한다. 저장된 프로젝트는 읽기만 한다 —
컷별 재생성을 쓰면 이미지가 덮여 비교 대상이 사라진다.

프롬프트를 베끼지 않고 buildImagePrompt 를 그대로 쓴다. 베끼면 원본이 바뀔 때 조용히
어긋나 엉뚱한 것을 비교하게 된다. 그러려고 lib 의 확장자 없는 import 에 .js 를 붙였다 —
Next 와 vitest 는 풀어 주지만 순수 node 는 못 푼다. 지금까지 측정 스크립트가 lib 을 못 쓰고
HTTP 를 직접 부르던 이유다.

아직 돌리지 않는다. 유료라 사장님 승인 게이트다."
```

---

## Task 4: 실제로 비교한다 — **사장님 검토 게이트**

> ⚠️ **사장님 승인 없이 시작하지 않는다.**

**예상 비용:** 컷 4개 기준 약 **$0.48** (A 4장 × $0.04 + B 4장 × $0.08)

**Files:** 없음 (검증). 발견한 것만 고친다.

- [ ] **Step 1: 승인을 받는다** — 무엇을 확인하려는지, 예상 비용, 대상 프로젝트를 알리고 답을 받는다

- [ ] **Step 2: 돌린다**

```bash
cd /c/Users/fixup/shotform-video
node scripts/measure/compare-image-models.mjs f31c1c7f-b905-4819-bf62-e423e821b71b
```

`f31c1c7f-b905-4819-bf62-e423e821b71b` 는 오늘 만든 화장품 편이다. 컷 4개이고 **컷2가
사람+제품이 함께 있는** 자리다 — 예전 편에서 제품이 딴 물건으로 나왔던 그 모양이다.

`FAL_KEY` 가 환경변수에 없으면 스크립트가 먼저 알려 준다. `.env.local` 의 값을 넣고 돌린다.

- [ ] **Step 3: 사장님이 판정한다**

두 URL 을 나란히 놓고 넷을 본다. **판정은 사장님이 한다** — VLM 에게 묻지 않는다(오늘까지
여섯 번 통과시켰다).

- [ ] 제품이 레퍼런스와 같은 물건인가 — 청록 띠·검정 캡·라벨 배치
- [ ] 인물 얼굴이 아바타와 같은 사람인가
- [ ] 손·신체 오류가 있는가
- [ ] `shows` 에 없는 사람이 덤으로 그려졌는가

**채택 규칙: 넷 중 셋 이상에서 B 가 낫거나 같으면 채택.**

- [ ] **Step 4: 결과를 적는다**

`docs/models-and-costs.md` 에 결과를 남긴다 — 어느 쪽을 채택했는지, 넷 각각이 어땠는지.
`§5 남은 대조` 에 **base 가격 확인**(스크립트가 부른 실제 금액 ↔ 단가표 $0.08)을 더한다.

- [ ] **Step 5: 채택했으면 `.env.local` 을 바꾼다**

```
FAL_IMAGE_ENDPOINT=fal-ai/nano-banana-2
```

**여기서 처음 바꾼다.** 미리 바꾸면 비교 대상이던 옛 모델이 파이프라인에서 사라진다.
`.env.local` 은 저장소에 없으므로 커밋 대상이 아니다.

- [ ] **Step 6: 커밋**

```bash
git add docs/models-and-costs.md
git commit -m "docs: 이미지 모델 비교 결과

[어느 쪽을 채택했는지, 넷 각각이 어땠는지]"
```

---

## 다음 — 이 계획이 하지 않는 것

- **VLM 검수를 제대로 손보기** — 통과율 100% 의 원인을 캐는 것은 별건이다. 섞으면 모델 교체
  효과와 구분이 안 된다
- **Seedream·FLUX 비교** — `nano-banana 2` 가 기준을 못 넘으면 그때 본다
- **함수 이름 정리**(`selectCandidate` → 검수) — 검수를 손볼 때 함께
- **컷 분할 개선** — 별도 스펙(`2026-07-29-cut-granularity-design.md`)의 후속이다
